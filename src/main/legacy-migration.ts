/**
 * @file legacy-migration.ts
 * @description Migração única dos cofres de userland para o `monblockd` root (RN-DAEMON-10, spec §10).
 *
 * Só o Electron tem a chave antiga (`safeStorage`, Keychain de login), então ele lê os cofres
 * e envia o estado ao daemon, que decide o que aceitar. Nada em userland muda antes de o daemon
 * responder 200 (migrado) ou 409 (já configurado: os cofres antigos ficam obsoletos).
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DaemonCommand, DaemonResponse } from '../daemon/monblockd.js';
import { TripleStateStore, type MonBlockPersistentState } from '../storage/state-store.js';

const VAULT_FILES = ['state.primary.json', 'state.keychain.json', 'partner.seal'];

export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  decryptString(b: Buffer): string;
}

/** Lê a chave antiga sem nunca criar uma nova; `null` se ausente ou ilegível. */
export function readUserVaultKey(keyPath: string, safeStorage: SafeStorageLike): string | null {
  if (process.env.MONBLOCK_INTEGRITY_KEY) return process.env.MONBLOCK_INTEGRITY_KEY;
  if (!safeStorage.isEncryptionAvailable() || !fs.existsSync(keyPath)) return null;
  try {
    return safeStorage.decryptString(fs.readFileSync(keyPath));
  } catch {
    return null;
  }
}

export interface LegacyMigrationDeps {
  vaultsDir: string;
  key: string | null;
  call: (cmd: DaemonCommand) => Promise<DaemonResponse>;
  now?: () => Date;
}

export type LegacyMigrationResult = 'none' | 'migrated' | 'already-configured' | 'failed';

export async function migrateLegacyVaults(deps: LegacyMigrationDeps): Promise<LegacyMigrationResult> {
  if (!fs.existsSync(deps.vaultsDir)) return 'none';
  const decoder = deps.key
    ? new TripleStateStore({ primaryPath: '-', keychainPath: '-', sealPath: '-', integrityKey: deps.key })
    : null;

  const candidates: Array<{ format: 'MBV1' | 'LEGACY_JSON'; state: MonBlockPersistentState; raw: string }> = [];
  for (const name of VAULT_FILES) {
    let raw: string;
    try {
      raw = fs.readFileSync(path.join(deps.vaultsDir, name), 'utf8');
    } catch {
      continue;
    }
    if (raw.startsWith('MBV1.')) {
      const state = decoder?.decodeVault(raw);
      if (state) candidates.push({ format: 'MBV1', state, raw });
      continue;
    }
    try {
      // ponytail: HMAC do JSON legado não é verificado — a chave era pública e o daemon só aproveita regras.
      const parsed = JSON.parse(raw) as { state?: MonBlockPersistentState };
      if (parsed?.state && typeof parsed.state === 'object') candidates.push({ format: 'LEGACY_JSON', state: parsed.state, raw });
    } catch {
      // cofre ilegível: ignorado
    }
  }
  if (candidates.length === 0) return 'none';

  // MBV1 vence o legado; entre iguais, o mais recente.
  const best = candidates.reduce((a, b) => {
    if (a.format !== b.format) return a.format === 'MBV1' ? a : b;
    return (b.state.updatedAtMs ?? 0) > (a.state.updatedAtMs ?? 0) ? b : a;
  });
  const migrationId = crypto.createHash('sha256').update(best.raw).digest('hex').slice(0, 32);

  let res: DaemonResponse;
  try {
    res = await deps.call({ type: 'MIGRATE_LEGACY_STATE', format: best.format, migrationId, state: best.state });
  } catch {
    return 'failed';
  }
  if (res.status !== 200 && res.status !== 409) return 'failed';

  // Renomeia (não apaga) e remove a chave antiga: os cofres que restam ficam ilegíveis para o usuário.
  const stamp = (deps.now?.() ?? new Date()).toISOString().replace(/[:.]/g, '-');
  const retired = `${deps.vaultsDir}.migrated-${stamp}`;
  fs.renameSync(deps.vaultsDir, retired);
  fs.rmSync(path.join(retired, 'vault.key'), { force: true });
  return res.status === 200 ? 'migrated' : 'already-configured';
}
