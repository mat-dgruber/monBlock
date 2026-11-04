/**
 * @file state-store.ts
 * @description Persistência Tripla Self-Healing (`TripleStateStore` — MOD-03 / ADR-0004).
 *
 * Mantém o estado crítico do monBlock replicado e assinado via HMAC-SHA256
 * (verificado com `crypto.timingSafeEqual`) em 3 cofres independentes:
 * - Cofre A (`primary`): banco/estado primário
 * - Cofre B (`keychain`): espelho do System Keychain
 * - Cofre C (`seal`): selo imutável (`partner.seal`)
 *
 * Implementa reconciliação por quórum / maior `updatedAtMs` válido e modo
 * `Fail-Closed` (`adult` + `lockIncognito: true` travados) em caso de sabotagem total.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { RuleEngineState } from '../domain/rule-engine.js';

// MARK: - Tipos e Contratos de Estado Persistido

/** Conjunto de regras de proteção ativa (alias compatível com `RuleEngineState`). */
export type ProtectionRuleset = RuleEngineState;

/** Credenciais criptográficas do Ajudante armazenadas nos cofres protegidos. */
export interface PartnerCredentials {
  passwordHash: string;
  salt: string;
  hmacSecret: string;
  recoveryCodeHashes: string[];
  usedTokens: string[];
  telegramChatId?: string;
}

/** Estado do cronômetro de Cooldown de Emergência de 72 horas. */
export interface CooldownState {
  startedAtMs: number | null;
}

/** Concessão temporária de desbloqueio concedida pelo Ajudante. */
export interface TemporaryGrant {
  target: string;
  expiresAtMs: number;
}

/** Estado persistido completo nos 3 cofres do `TripleStateStore`. */
export interface MonBlockPersistentState {
  version: number;
  paired: boolean;
  rules: ProtectionRuleset;
  partnerCredentials?: PartnerCredentials;
  cooldown: CooldownState;
  temporaryGrants: TemporaryGrant[];
  updatedAtMs: number;
  tamperLockdown?: boolean;
}

/** Identificadores canônicos dos 3 cofres de persistência. */
export type VaultId = 'primary' | 'keychain' | 'seal';

/** Opções de configuração do `TripleStateStore`. */
export interface TripleStateStoreOptions {
  primaryPath: string;
  keychainPath: string;
  sealPath: string;
  integrityKey?: string;
}

/** Envelope serializado em disco contendo o estado e sua assinatura HMAC-SHA256. */
interface SignedVaultEnvelope {
  state: MonBlockPersistentState;
  hmac: string;
}

/** Resultado da operação `loadAndReconcile()`. */
export interface ReconcileResult {
  state: MonBlockPersistentState;
  healedVaults: VaultId[];
  tamperDetected: boolean;
  alert?: string;
}

// MARK: - Fábrica de Estado Padrão (Fail-Closed Default)

/**
 * Cria o estado inicial padrão do monBlock com a categoria `adult` e `lockIncognito`
 * habilitados por padrão (Catraca Unidirecional Append-Only — ADR-0003).
 */
export function createDefaultPersistentState(
  nowMs: number = Date.now()
): MonBlockPersistentState {
  return {
    version: 1,
    paired: false,
    rules: {
      enabledCategories: ['adult'],
      blockedDomains: [],
      allowlistDomains: [],
      keywords: [],
      lockIncognito: true,
    },
    cooldown: {
      startedAtMs: null,
    },
    temporaryGrants: [],
    updatedAtMs: nowMs,
  };
}

// MARK: - Implementação TripleStateStore

export class TripleStateStore {
  private readonly vaults: ReadonlyArray<{ id: VaultId; filePath: string }>;
  private readonly integrityKey: string;

  constructor(options: TripleStateStoreOptions) {
    this.vaults = [
      { id: 'primary', filePath: options.primaryPath },
      { id: 'keychain', filePath: options.keychainPath },
      { id: 'seal', filePath: options.sealPath },
    ];
    this.integrityKey = options.integrityKey ?? 'monblock-system-vault-key-v1';
  }

  /**
   * Calcula o HMAC-SHA256 determinístico sobre o estado serializado.
   */
  private computeHmac(state: MonBlockPersistentState): string {
    const partnerSecret = state.partnerCredentials?.hmacSecret ?? '';
    const payload = JSON.stringify(state);
    return crypto
      .createHmac('sha256', `${this.integrityKey}:${partnerSecret}`)
      .update(payload)
      .digest('hex');
  }

  /**
   * Verifica a assinatura HMAC-SHA256 em tempo constante (`crypto.timingSafeEqual`).
   */
  private verifyEnvelope(envelope: SignedVaultEnvelope): boolean {
    if (!envelope || typeof envelope !== 'object' || !envelope.state || typeof envelope.hmac !== 'string') {
      return false;
    }
    const expectedHex = this.computeHmac(envelope.state);
    if (envelope.hmac.length !== expectedHex.length || envelope.hmac.length % 2 !== 0) {
      return false;
    }
    const a = Buffer.from(envelope.hmac, 'hex');
    const b = Buffer.from(expectedHex, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  /**
   * Escreve atomicamente um envelope assinado em um único cofre via `.tmp` + `renameSync`.
   */
  private writeVaultAtomically(filePath: string, envelope: SignedVaultEnvelope): void {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmpPath = `${filePath}.tmp`;
    const serialized = JSON.stringify(envelope, null, 2);
    fs.writeFileSync(tmpPath, serialized, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmpPath, filePath);
  }

  /**
   * Grava atomicamente o estado assinado nos 3 cofres (`primary`, `keychain`, `seal`).
   */
  public save(state: MonBlockPersistentState): void {
    const hmac = this.computeHmac(state);
    const envelope: SignedVaultEnvelope = { state, hmac };
    for (const vault of this.vaults) {
      this.writeVaultAtomically(vault.filePath, envelope);
    }
  }

  /**
   * Lê e valida o estado de um cofre individual.
   */
  private readVault(filePath: string): {
    exists: boolean;
    valid: boolean;
    state?: MonBlockPersistentState;
    hmac?: string;
  } {
    if (!fs.existsSync(filePath)) {
      return { exists: false, valid: false };
    }
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw) as SignedVaultEnvelope;
      if (!this.verifyEnvelope(parsed)) {
        return { exists: true, valid: false };
      }
      return {
        exists: true,
        valid: true,
        state: parsed.state,
        hmac: parsed.hmac,
      };
    } catch {
      return { exists: true, valid: false };
    }
  }

  /**
   * Carrega os 3 cofres, valida a assinatura HMAC-SHA256 e executa reconciliação
   * Self-Healing (Quórum 2 de 3 / maior `updatedAtMs` íntegro).
   */
  public loadAndReconcile(options?: { expectPaired?: boolean }): ReconcileResult {
    const readings = this.vaults.map((v) => ({
      ...v,
      ...this.readVault(v.filePath),
    }));

    const anyExists = readings.some((r) => r.exists);
    const validReadings = readings.filter(
      (r): r is typeof r & { state: MonBlockPersistentState; hmac: string } =>
        r.valid && Boolean(r.state)
    );

    // Inicialização limpa (nenhum cofre existe ainda e não era esperado pareamento prévio)
    if (!anyExists && !options?.expectPaired) {
      const initial = createDefaultPersistentState();
      this.save(initial);
      return {
        state: initial,
        healedVaults: [],
        tamperDetected: false,
      };
    }

    // Sabotagem total (0 cofres íntegros após pareamento ou arquivos corrompidos) -> Fail-Closed
    if (validReadings.length === 0) {
      const failClosedState: MonBlockPersistentState = {
        ...createDefaultPersistentState(),
        paired: Boolean(options?.expectPaired),
        tamperLockdown: true,
        rules: {
          enabledCategories: ['adult'],
          blockedDomains: [],
          allowlistDomains: [],
          keywords: [],
          lockIncognito: true,
        },
      };
      this.save(failClosedState);
      return {
        state: failClosedState,
        healedVaults: ['primary', 'keychain', 'seal'],
        tamperDetected: true,
        alert:
          'ALERTA CRÍTICO: Adulteração detectada nos 3 cofres de persistência. Modo Fail-Closed ativado (adult + lockIncognito mantidos).',
      };
    }

    // Eleição do estado vencedor: maior updatedAtMs (e maior version como desempate)
    const winner = validReadings.reduce((best, current) => {
      if (current.state.updatedAtMs > best.state.updatedAtMs) return current;
      if (
        current.state.updatedAtMs === best.state.updatedAtMs &&
        current.state.version > best.state.version
      ) {
        return current;
      }
      return best;
    });

    const healedVaults: VaultId[] = [];
    const tamperDetected = validReadings.length < this.vaults.length;

    const winnerEnvelope: SignedVaultEnvelope = {
      state: winner.state,
      hmac: winner.hmac,
    };

    for (const r of readings) {
      if (!r.valid || r.hmac !== winner.hmac) {
        this.writeVaultAtomically(r.filePath, winnerEnvelope);
        healedVaults.push(r.id);
      }
    }

    return {
      state: winner.state,
      healedVaults,
      tamperDetected,
    };
  }
}
