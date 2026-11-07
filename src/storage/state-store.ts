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

export type UnblockRequestRecord = import('../daemon/unblock-requests.js').UnblockRequest;

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
  /** Snapshot do `TrustedClock` (RN-DAEMON-08); ausente em cofres antigos. */
  clock?: { expiryMs: number; trustedMs: number };
  /** Falhas consecutivas de autenticação do Ajudante (RN-DAEMON-09). */
  authFailures?: number;
  /** Até quando (tempo confiável) novas tentativas recebem 429. */
  authLockedUntilMs?: number;
  /** Último heartbeat do daemon no tempo confiável (spec §3.3). */
  lastHeartbeatMs?: number;
  /** `true` só quando o daemon desligou por `SIGTERM`. */
  cleanShutdown?: boolean;
  /** Debounce do aviso de adulteração (1 por hora). */
  lastDriftAlertMs?: number;
  /** Bot do Telegram do usuário (T0): o token fica só no cofre do daemon e nunca sai por IPC. */
  telegramBot?: { token: string; username: string; setAtMs: number };
  /** Pedidos de liberação ao Ajudante (T1); transições gravadas junto do estado. */
  unblockRequests?: UnblockRequestRecord[];
  /** Offset do `getUpdates` por bot: trocar de bot zera (o id do bot é a parte numérica do token). */
  telegramOffset?: { botId: string; offset: number };
  /** Migração única de userland já aplicada (RN-DAEMON-10); `id` garante idempotência. */
  migration?: { id: string; format: 'MBV1' | 'LEGACY_JSON'; paired: boolean };
}

/** Marcador de "já houve Ajudante" que sobrevive à perda dos 3 cofres (RN-DAEMON-07). */
export interface PairingTombstone {
  pairedAtMs: number;
  telegramChatId?: string;
}

/** Identificadores canônicos dos 3 cofres de persistência. */
export type VaultId = 'primary' | 'keychain' | 'seal';

/** Opções de configuração do `TripleStateStore`. */
export interface TripleStateStoreOptions {
  primaryPath: string;
  keychainPath: string;
  sealPath: string;
  /** Padrão: `tombstone` ao lado do `sealPath`. */
  tombstonePath?: string;
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

// MARK: - Resolução Dinâmica de Integridade

/**
 * Resolve a chave de integridade dos cofres: chave explícita (runtime/testes) ou `MONBLOCK_VAULT_KEY`.
 * Não há derivação determinística: uma chave recomputável a partir de dados públicos
 * (plataforma, usuário) permitiria forjar cofres válidos.
 */
export function resolveVaultIntegrityKey(explicitKey?: string): string {
  const key = explicitKey || process.env.MONBLOCK_VAULT_KEY;
  if (!key) {
    throw new Error('Chave de integridade dos cofres ausente: injete uma chave aleatória por instalação.');
  }
  return key;
}

const VAULT_CIPHER_PREFIX = 'MBV1.';

/** Cifra o envelope com AES-256-GCM (iv | tag | ciphertext em base64) para que segredos não fiquem legíveis em disco. */
function sealVaultPayload(encKey: Buffer, plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return VAULT_CIPHER_PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
}

/** Decifra um cofre; lança erro se o formato for inválido ou a tag GCM não conferir (adulteração). */
function openVaultPayload(encKey: Buffer, raw: string): string {
  if (!raw.startsWith(VAULT_CIPHER_PREFIX)) throw new Error('Formato de cofre inválido.');
  const buf = Buffer.from(raw.slice(VAULT_CIPHER_PREFIX.length), 'base64');
  if (buf.length < 28) throw new Error('Cofre truncado.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encKey, buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
}

// MARK: - Implementação TripleStateStore

export class TripleStateStore {
  private readonly vaults: ReadonlyArray<{ id: VaultId; filePath: string }>;
  private readonly integrityKey: string;
  private readonly encryptionKey: Buffer;
  private readonly tombstonePath: string;

  constructor(options: TripleStateStoreOptions) {
    this.tombstonePath = options.tombstonePath ?? path.join(path.dirname(options.sealPath), 'tombstone');
    this.vaults = [
      { id: 'primary', filePath: options.primaryPath },
      { id: 'keychain', filePath: options.keychainPath },
      { id: 'seal', filePath: options.sealPath },
    ];
    this.integrityKey = resolveVaultIntegrityKey(options.integrityKey);
    this.encryptionKey = Buffer.from(
      crypto.hkdfSync('sha256', this.integrityKey, '', 'monblock-vault-enc-v1', 32)
    );
  }

  /**
   * Calcula o HMAC-SHA256 determinístico sobre o estado serializado usando exclusivamente `this.integrityKey`.
   */
  private computeHmac(state: MonBlockPersistentState): string {
    const payload = JSON.stringify(state);
    return crypto
      .createHmac('sha256', this.integrityKey)
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
   * Escreve atomicamente um envelope assinado em um único cofre via `.tmp` único + `renameSync`.
   */
  private writeVaultAtomically(filePath: string, envelope: SignedVaultEnvelope): void {
    this.writeSealedAtomically(filePath, JSON.stringify(envelope));
  }

  private writeSealedAtomically(filePath: string, plaintext: string): void {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    const serialized = sealVaultPayload(this.encryptionKey, plaintext);
    try {
      fs.writeFileSync(tmpPath, serialized, { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(tmpPath, filePath);
    } finally {
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      } catch {
        // Ignora erro de limpeza residual
      }
    }
  }

  /**
   * Grava atomicamente o estado assinado nos 3 cofres (`primary`, `keychain`, `seal`),
   * exigindo sucesso em pelo menos 2 de 3 cofres (quórum).
   */
  public save(state: MonBlockPersistentState): void {
    const hmac = this.computeHmac(state);
    const envelope: SignedVaultEnvelope = { state, hmac };
    const errors: unknown[] = [];
    let successCount = 0;
    for (const vault of this.vaults) {
      try {
        this.writeVaultAtomically(vault.filePath, envelope);
        successCount++;
      } catch (err) {
        errors.push(err);
      }
    }
    if (successCount < 2) {
      throw errors[0] ?? new Error('Falha ao persistir quórum mínimo nos cofres.');
    }
  }

  /** Decifra e valida um cofre serializado sem tocar no disco (migração de userland, RN-DAEMON-10). */
  public decodeVault(raw: string): MonBlockPersistentState | null {
    try {
      const parsed = JSON.parse(openVaultPayload(this.encryptionKey, raw)) as SignedVaultEnvelope;
      return this.verifyEnvelope(parsed) ? parsed.state : null;
    } catch {
      return null;
    }
  }

  /** Grava o tombstone cifrado (o chatId do Ajudante anterior não fica legível). */
  public writeTombstone(tombstone: PairingTombstone): void {
    this.writeSealedAtomically(this.tombstonePath, JSON.stringify(tombstone));
  }

  /**
   * `null` só quando o arquivo não existe. Ilegível/adulterado conta como pareamento
   * prévio sem chatId (Fail-Closed: só o cooldown de 72h libera novo pareamento).
   */
  public readTombstone(): PairingTombstone | null {
    let raw: string;
    try {
      raw = fs.readFileSync(this.tombstonePath, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      return { pairedAtMs: 0 };
    }
    try {
      const parsed = JSON.parse(openVaultPayload(this.encryptionKey, raw)) as PairingTombstone;
      if (typeof parsed?.pairedAtMs !== 'number') return { pairedAtMs: 0 };
      return typeof parsed.telegramChatId === 'string'
        ? { pairedAtMs: parsed.pairedAtMs, telegramChatId: parsed.telegramChatId }
        : { pairedAtMs: parsed.pairedAtMs };
    } catch {
      return { pairedAtMs: 0 };
    }
  }

  /** Só na desinstalação autorizada. */
  public clearTombstone(): void {
    fs.rmSync(this.tombstonePath, { force: true });
  }

  /**
   * Lê e valida o estado de um cofre individual, diferenciando inexistência (`ENOENT`),
   * erro de I/O do sistema operacional e adulteração/corrupção de conteúdo.
   */
  private readVault(filePath: string): {
    exists: boolean;
    valid: boolean;
    ioError?: boolean;
    state?: MonBlockPersistentState;
    hmac?: string;
  } {
    let raw: string;
    try {
      raw = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      const code = (err as NodeJS.ErrnoException | undefined)?.code;
      if (code === 'ENOENT' || !fs.existsSync(filePath)) {
        return { exists: false, valid: false, ioError: false };
      }
      return { exists: true, valid: false, ioError: true };
    }
    try {
      const parsed = JSON.parse(openVaultPayload(this.encryptionKey, raw)) as SignedVaultEnvelope;
      if (!this.verifyEnvelope(parsed)) {
        return { exists: true, valid: false, ioError: false };
      }
      return {
        exists: true,
        valid: true,
        ioError: false,
        state: parsed.state,
        hmac: parsed.hmac,
      };
    } catch {
      return { exists: true, valid: false, ioError: false };
    }
  }

  /**
   * Carrega os 3 cofres, valida a assinatura HMAC-SHA256 e executa reconciliação
   * Self-Healing (Quórum 2 de 3 / maior `updatedAtMs` íntegro).
   */
  public loadAndReconcile(options?: { expectPaired?: boolean }): ReconcileResult {
    const expectPaired = options?.expectPaired ?? this.readTombstone() !== null;
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
    if (!anyExists && !expectPaired) {
      const initial = createDefaultPersistentState();
      this.save(initial);
      return {
        state: initial,
        healedVaults: [],
        tamperDetected: false,
      };
    }

    // Sabotagem total ou falha de leitura (0 cofres íntegros lidos) -> Fail-Closed
    if (validReadings.length === 0) {
      const hasIoError = readings.some((r) => r.ioError);
      const failClosedState: MonBlockPersistentState = {
        ...createDefaultPersistentState(),
        paired: expectPaired,
        tamperLockdown: true,
        rules: {
          enabledCategories: ['adult'],
          blockedDomains: [],
          allowlistDomains: [],
          keywords: [],
          lockIncognito: true,
        },
      };
      if (!hasIoError) {
        this.save(failClosedState);
      }
      return {
        state: failClosedState,
        healedVaults: hasIoError ? [] : ['primary', 'keychain', 'seal'],
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
        try {
          this.writeVaultAtomically(r.filePath, winnerEnvelope);
          healedVaults.push(r.id);
        } catch {
          // Ignora falha transitória individual se quórum já está assegurado
        }
      }
    }

    return {
      state: winner.state,
      healedVaults,
      tamperDetected,
    };
  }
}
