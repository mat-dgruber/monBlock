import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrateLegacyVaults, readUserVaultKey } from '../../src/main/legacy-migration.js';
import { TripleStateStore, createDefaultPersistentState } from '../../src/storage/state-store.js';
import type { DaemonCommand, DaemonResponse } from '../../src/daemon/monblockd.js';

// Fake reversível do safeStorage: "cifra" invertendo bytes, falha se faltar o marcador.
const fakeSafeStorage = {
  isEncryptionAvailable: () => true,
  decryptString: (b: Buffer) => {
    const plain = Buffer.from(b).reverse().toString('utf8');
    if (!plain.startsWith('ENC:')) throw new Error('decrypt failed');
    return plain.slice(4);
  },
};
const encrypt = (s: string) => Buffer.from(`ENC:${s}`, 'utf8').reverse();

let root: string;
let vaultsDir: string;
let sent: DaemonCommand[];
const KEY = 'a'.repeat(64);

function callReturning(status: number) {
  return async (cmd: DaemonCommand): Promise<DaemonResponse> => {
    sent.push(cmd);
    return { status } as DaemonResponse;
  };
}

function writeMbv1Vaults(updatedAtMs: number): void {
  const store = new TripleStateStore({
    primaryPath: path.join(vaultsDir, 'state.primary.json'),
    keychainPath: path.join(vaultsDir, 'state.keychain.json'),
    sealPath: path.join(vaultsDir, 'partner.seal'),
    tombstonePath: path.join(root, 'ignored-tombstone'),
    integrityKey: KEY,
  });
  const base = createDefaultPersistentState();
  store.save({ ...base, updatedAtMs, rules: { ...base.rules, blockedDomains: ['tiktok.com'] } });
  fs.writeFileSync(path.join(vaultsDir, 'vault.key'), encrypt(KEY));
}

beforeEach(() => {
  delete process.env.MONBLOCK_INTEGRITY_KEY;
  sent = [];
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'monblock-legacy-'));
  vaultsDir = path.join(root, 'vaults');
  fs.mkdirSync(vaultsDir);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('readUserVaultKey', () => {
  it('lê a chave antiga e nunca cria uma nova', () => {
    const keyPath = path.join(vaultsDir, 'vault.key');

    expect(readUserVaultKey(keyPath, fakeSafeStorage)).toBeNull();
    expect(fs.existsSync(keyPath)).toBe(false);
    fs.writeFileSync(keyPath, 'lixo');
    expect(readUserVaultKey(keyPath, fakeSafeStorage)).toBeNull();
    fs.writeFileSync(keyPath, encrypt(KEY));
    expect(readUserVaultKey(keyPath, fakeSafeStorage)).toBe(KEY);
  });
});

describe('migrateLegacyVaults', () => {
  it('envia o estado MBV1 decifrado, renomeia a pasta e apaga a chave antiga', async () => {
    // Arrange
    writeMbv1Vaults(123);

    // Act
    const result = await migrateLegacyVaults({ vaultsDir, key: KEY, call: callReturning(200), now: () => new Date(0) });

    // Assert
    expect(result).toBe('migrated');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: 'MIGRATE_LEGACY_STATE', format: 'MBV1' });
    expect((sent[0] as any).state.rules.blockedDomains).toEqual(['tiktok.com']);
    expect((sent[0] as any).migrationId).toMatch(/^[a-f0-9]{32}$/);
    expect(fs.existsSync(vaultsDir)).toBe(false);
    const retired = path.join(root, 'vaults.migrated-1970-01-01T00-00-00-000Z');
    expect(fs.existsSync(path.join(retired, 'state.primary.json'))).toBe(true);
    expect(fs.existsSync(path.join(retired, 'vault.key'))).toBe(false);
  });

  it('cai para o JSON legado quando não há chave', async () => {
    // Arrange
    fs.writeFileSync(
      path.join(vaultsDir, 'state.primary.json'),
      JSON.stringify({ state: { rules: { blockedDomains: ['x.com'] } }, hmac: 'ff' })
    );

    // Act
    const result = await migrateLegacyVaults({ vaultsDir, key: null, call: callReturning(200) });

    // Assert
    expect(result).toBe('migrated');
    expect(sent[0]).toMatchObject({ format: 'LEGACY_JSON' });
  });

  it('409 aposenta os cofres antigos; outra falha não mexe em nada', async () => {
    // Arrange
    writeMbv1Vaults(1);

    // Act
    const failed = await migrateLegacyVaults({ vaultsDir, key: KEY, call: callReturning(503) });
    const offline = await migrateLegacyVaults({
      vaultsDir,
      key: KEY,
      call: async () => {
        throw new Error('offline');
      },
    });
    const keyKeptAfterFailures = fs.existsSync(path.join(vaultsDir, 'vault.key'));
    const done = await migrateLegacyVaults({ vaultsDir, key: KEY, call: callReturning(409) });

    // Assert
    expect([failed, offline]).toEqual(['failed', 'failed']);
    expect(keyKeptAfterFailures).toBe(true);
    expect(done).toBe('already-configured');
    expect(fs.existsSync(vaultsDir)).toBe(false);
  });

  it('sem cofres legíveis não chama o daemon nem mexe na pasta', async () => {
    fs.writeFileSync(path.join(vaultsDir, 'state.primary.json'), 'MBV1.lixo');

    const result = await migrateLegacyVaults({ vaultsDir, key: KEY, call: callReturning(200) });

    expect(result).toBe('none');
    expect(sent).toEqual([]);
    expect(fs.existsSync(vaultsDir)).toBe(true);
  });

  it('o mesmo conteúdo gera o mesmo migrationId (retentativa idempotente)', async () => {
    writeMbv1Vaults(7);
    const copy = path.join(root, 'copy');
    fs.cpSync(vaultsDir, copy, { recursive: true });

    await migrateLegacyVaults({ vaultsDir, key: KEY, call: callReturning(503) });
    await migrateLegacyVaults({ vaultsDir: copy, key: KEY, call: callReturning(503) });

    expect((sent[0] as any).migrationId).toBe((sent[1] as any).migrationId);
  });
});
