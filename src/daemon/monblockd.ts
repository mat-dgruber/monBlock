/**
 * @file monblockd.ts
 * @description Orquestrador do Daemon Privilegiado (`MonBlockDaemon` — MOD-03 / ADR-0001).
 *
 * Coordena `TripleStateStore`, `PartnerGuard`, `RuleEngine` e `PlatformEnforcer`,
 * processando comandos IPC tipados e retornando respostas estruturadas ou erros
 * compatíveis com a RFC 9457 (`Problem Details for HTTP/IPC APIs`).
 */

import crypto from 'node:crypto';
import { TelegramPartnerClient, type TelegramTransportAdapter } from './telegram-client.js';
import { TrustedClock } from './trusted-clock.js';
import {
  canMutateProtectionRule,
  evaluateEmergencyCooldown,
  generateRecoveryKit,
  hashPartnerPassword,
  verifyChallengeToken,
  verifyPartnerPassword,
  type UnlockDuration,
} from '../domain/partner-guard.js';
import {
  sanitizeAndNormalizeUrl,
  validateBatchDomains,
} from '../domain/rule-engine.js';
import { PREDEFINED_CATEGORIES } from '../domain/categories.js';
import type { PlatformEnforcer } from '../enforcers/platform-enforcer.js';
import type {
  CooldownState,
  MonBlockPersistentState,
  PartnerCredentials,
  ProtectionRuleset,
  TemporaryGrant,
  TripleStateStore,
} from '../storage/state-store.js';

// MARK: - Contratos de Erro RFC 9457 (Problem Details) e Comandos IPC

/** Erro padronizado segundo a RFC 9457 (Problem Details). */
export interface ProblemDetailsResponse {
  type: string;
  title: string;
  status: 400 | 403 | 409 | 423 | 429 | 500 | 503;
  detail: string;
  instance: string;
}

/** Estado público sanitizado retornado para a UI Electron (Zero vazamento de segredos). */
export interface PublicSanitizedState {
  version: number;
  paired: boolean;
  rules: ProtectionRuleset;
  cooldown: CooldownState;
  temporaryGrants: TemporaryGrant[];
  updatedAtMs: number;
  tamperLockdown: boolean;
  /** Perfil dos navegadores aprovado? `null` = ainda não verificado ou falha na verificação. */
  browserProfileInstalled: boolean | null;
  /** Bot do Telegram: só se está configurado e o @username (o token nunca atravessa o IPC). */
  bot: { configured: boolean; username?: string };
  partner: {
    paired: boolean;
    telegramChatId?: string;
    remainingRecoveryCodes: number;
  };
}

/** Comandos IPC suportados pelo `MonBlockDaemon`. */
export type DaemonCommand =
  | { type: 'GET_STATE' }
  | { type: 'SET_BOT_TOKEN'; token: string; currentPartnerPassword?: string }
  | { type: 'INITIATE_PAIRING_LINK'; partnerName: string; currentPartnerPassword?: string }
  | {
      type: 'INITIATE_PAIRING';
      partnerName: string;
      telegramChatId: string;
      currentPartnerPassword?: string;
    }
  | {
      type: 'CHECK_PAIRING_STATUS';
    }
  | {
      type: 'CANCEL_PAIRING';
    }
  | {
      type: 'PAIR_PARTNER';
      password: string;
      hmacSecret?: string;
      telegramChatId?: string;
      currentPartnerPassword?: string;
    }
  | {
      type: 'MUTATE_RULES';
      rules: ProtectionRuleset;
      partnerPassword?: string;
      challengeCode?: string;
      token?: string;
    }
  | {
      type: 'VERIFY_OFFLINE_TOKEN';
      challengeCode: string;
      token: string;
      target?: string;
    }
  | {
      type: 'VERIFY_RECOVERY_CODE';
      code: string;
      target?: string;
    }
  | {
      type: 'TRIGGER_EMERGENCY_COOLDOWN';
    }
  | {
      type: 'REVOKE_GRANTS_ON_SLEEP';
    }
  | {
      type: 'UNINSTALL_AUTHORIZED';
      password?: string;
      challengeCode?: string;
      token?: string;
    }
  | {
      /** RN-DAEMON-10: estado lido pelo Electron dos cofres de userland. Não confiável. */
      type: 'MIGRATE_LEGACY_STATE';
      format: 'MBV1' | 'LEGACY_JSON';
      migrationId: string;
      state: unknown;
    };

/** Respostas tipadas de sucesso dos comandos IPC. */
export type DaemonSuccessResponse =
  | { status: 200; state: PublicSanitizedState }
  | {
      status: 200;
      pairingInitiated: true;
      partnerName: string;
      telegramChatId: string;
      expiresAtMs: number;
    }
  | {
      status: 200;
      paired: boolean;
      pending: boolean;
      partnerName?: string;
      telegramChatId?: string;
      error?: string;
    }
  | { status: 200; cancelled: true }
  | { status: 200; paired: true; recoveryCodes: string[] }
  | { status: 200; rules: ProtectionRuleset }
  | {
      status: 200;
      valid: true;
      duration: UnlockDuration;
      grant: TemporaryGrant;
    }
  | {
      status: 200;
      valid: true;
      remainingCodes: number;
      grant: TemporaryGrant;
    }
  | {
      status: 200;
      unlocked: boolean;
      remainingHours: number;
      startedAtMs: number;
    }
  | {
      status: 200;
      revokedCount: number;
      temporaryGrants: TemporaryGrant[];
    }
  | {
      status: 200;
      uninstalled: true;
    }
  | { status: 200; botConfigured: true; botUsername: string }
  | { status: 200; pairingLink: string; pairingCode: string; partnerName: string; expiresAtMs: number }
  | { status: 200; migrated: true; format: 'MBV1' | 'LEGACY_JSON'; paired: boolean };

export type DaemonResponse = DaemonSuccessResponse | ProblemDetailsResponse;

/** Tipos aceitos na fronteira IPC (RN-DAEMON-04). O `satisfies` + checagem abaixo quebram o build se faltar um. */
export const DAEMON_COMMAND_TYPES = [
  'GET_STATE',
  'SET_BOT_TOKEN',
  'INITIATE_PAIRING_LINK',
  'INITIATE_PAIRING',
  'CHECK_PAIRING_STATUS',
  'CANCEL_PAIRING',
  'PAIR_PARTNER',
  'MUTATE_RULES',
  'VERIFY_OFFLINE_TOKEN',
  'VERIFY_RECOVERY_CODE',
  'TRIGGER_EMERGENCY_COOLDOWN',
  'REVOKE_GRANTS_ON_SLEEP',
  'UNINSTALL_AUTHORIZED',
  'MIGRATE_LEGACY_STATE',
] as const satisfies ReadonlyArray<DaemonCommand['type']>;
const _allCommandTypesListed: Exclude<DaemonCommand['type'], (typeof DAEMON_COMMAND_TYPES)[number]> extends never
  ? true
  : never = true;
void _allCommandTypesListed;

// MARK: - Utilitário RFC 9457

export function buildProblem(
  status: ProblemDetailsResponse['status'],
  title: string,
  detail: string,
  instance: string
): ProblemDetailsResponse {
  return {
    type: `https://monblock.ccat.local/problems/${status}`,
    title,
    status,
    detail,
    instance,
  };
}

/** Comandos que trazem credencial do Ajudante (contam para o rate limit). `PAIR_PARTNER.password` é a senha nova. */
function carriesPartnerCredential(cmd: DaemonCommand): boolean {
  const c = cmd as unknown as Record<string, unknown>;
  const keys = ['token', 'code', 'currentPartnerPassword'];
  if (cmd.type !== 'PAIR_PARTNER') keys.push('password');
  return keys.some((k) => typeof c[k] === 'string' && (c[k] as string).length > 0);
}

const KNOWN_CATEGORY_IDS: ReadonlySet<string> = new Set(PREDEFINED_CATEGORIES.map((c) => c.id));

function isStringArray(v: unknown, maxItems: number, maxLen: number): v is string[] {
  return Array.isArray(v) && v.length <= maxItems && v.every((s) => typeof s === 'string' && s.length <= maxLen);
}

/**
 * Valida o estado vindo de userland (RN-DAEMON-10). Só extrai o que pode **endurecer** a proteção
 * (categorias, domínios, palavras) e, se pedido, as credenciais do Ajudante. Allowlist, concessões
 * e cooldown são descartados: afrouxariam ou permitiriam forjar uma espera já cumprida.
 */
function parseLegacyState(
  raw: unknown,
  withCredentials: boolean
): { categories: string[]; domains: string[]; keywords: string[]; credentials?: PartnerCredentials } | null {
  if (!raw || typeof raw !== 'object') return null;
  const { rules, partnerCredentials: c } = raw as { rules?: unknown; partnerCredentials?: unknown };
  if (!rules || typeof rules !== 'object') return null;
  const r = rules as Record<string, unknown>;
  if (
    !isStringArray(r.enabledCategories, 100, 64) ||
    !isStringArray(r.blockedDomains, 10_000, 2048) ||
    !isStringArray(r.keywords, 1_000, 200)
  ) {
    return null;
  }
  // Mesma regra do `normalizeDomainList` do enforcer: quebra de linha descarta a entrada (não é "limpa").
  const domains = r.blockedDomains
    .filter((d) => !/[\r\n]/.test(d))
    .map((d) => sanitizeAndNormalizeUrl(d)?.domain)
    .filter((d): d is string => Boolean(d));
  const parsed = {
    categories: r.enabledCategories.filter((id) => KNOWN_CATEGORY_IDS.has(id)),
    domains,
    keywords: r.keywords.map((k) => k.trim()).filter(Boolean),
  };
  if (!withCredentials || c === undefined || c === null) return parsed;
  const cr = c as Record<string, unknown>;
  const valid =
    typeof cr.passwordHash === 'string' && cr.passwordHash.startsWith('scrypt$') && cr.passwordHash.length <= 512 &&
    typeof cr.salt === 'string' && cr.salt.length <= 256 &&
    typeof cr.hmacSecret === 'string' && cr.hmacSecret.length > 0 && cr.hmacSecret.length <= 512 &&
    isStringArray(cr.recoveryCodeHashes, 10, 512) &&
    isStringArray(cr.usedTokens, 10_000, 512) &&
    (cr.telegramChatId === undefined || (typeof cr.telegramChatId === 'string' && /^-?\d{1,20}$/.test(cr.telegramChatId)));
  if (!valid) return null;
  return {
    ...parsed,
    credentials: {
      passwordHash: cr.passwordHash as string,
      salt: cr.salt as string,
      hmacSecret: cr.hmacSecret as string,
      recoveryCodeHashes: cr.recoveryCodeHashes as string[],
      usedTokens: cr.usedTokens as string[],
      ...(cr.telegramChatId ? { telegramChatId: cr.telegramChatId as string } : {}),
    },
  };
}

function maskTelegramChatId(chatId?: string): string | undefined {
  if (!chatId) return undefined;
  const trimmed = chatId.trim();
  if (trimmed.length <= 4) return '****';
  return `${'*'.repeat(trimmed.length - 4)}${trimmed.slice(-4)}`;
}

// MARK: - Implementação MonBlockDaemon

export interface PendingPairingState {
  partnerName: string;
  /** Vazio enquanto o Ajudante não abriu o link de convite (`/start <código>`). */
  telegramChatId: string;
  /** Código de uso único do convite por link; só existe no pareamento por link. */
  pairingCode?: string;
  initiatedAtMs: number;
  expiresAtMs: number;
  lastUpdateOffset?: number;
}

export interface MonBlockDaemonOptions {
  store: TripleStateStore;
  enforcer: PlatformEnforcer;
  /** Atalho de teste: relógio em que parede e monotônico coincidem. Produção usa `clock`. */
  nowFn?: () => number;
  clock?: TrustedClock;
  telegramClient?: TelegramPartnerClient;
  /** Transporte do Telegram (testes e `getMe` do token novo). */
  telegramTransport?: TelegramTransportAdapter;
  /** Chamado depois da limpeza autorizada: o entry root dispara o `uninstall.sh` desacoplado. */
  onUninstalled?: () => void;
  /** Checagem do perfil dos navegadores no watchdog (`checkBrowserProfileInstalled` no entry root). */
  checkBrowserProfile?: () => Promise<boolean | null>;
}

export class MonBlockDaemon {
  private readonly store: TripleStateStore;
  private readonly enforcer: PlatformEnforcer;
  private readonly clock: TrustedClock;
  private clockRestored = false;
  private readonly telegramClient?: TelegramPartnerClient;
  private readonly telegramTransport?: TelegramTransportAdapter;
  private readonly onUninstalled?: () => void;
  private readonly checkBrowserProfile?: () => Promise<boolean | null>;
  private browserProfileInstalled: boolean | null = null;
  private profileCheck: Promise<void> | null = null;
  private lastProfileCheckMs = 0;
  private pendingPairing: PendingPairingState | null = null;
  private isCheckingPairing = false;
  private commandQueue: Promise<unknown> = Promise.resolve();

  constructor(options: MonBlockDaemonOptions) {
    this.store = options.store;
    this.enforcer = options.enforcer;
    this.clock =
      options.clock ??
      new TrustedClock(options.nowFn ? { wallNow: options.nowFn, monoNowMs: options.nowFn } : {});
    this.telegramClient = options.telegramClient;
    this.telegramTransport = options.telegramTransport;
    this.onUninstalled = options.onUninstalled;
    this.checkBrowserProfile = options.checkBrowserProfile;
  }

  /**
   * Sanitiza o estado interno para que `passwordHash`, `salt`, `hmacSecret` e
   * `recoveryCodeHashes` nunca atravessem a fronteira IPC para a UI desprivilegiada.
   */
  private toPublicState(state: MonBlockPersistentState): PublicSanitizedState {
    return {
      version: state.version,
      paired: state.paired,
      rules: structuredClone(state.rules),
      cooldown: { ...state.cooldown },
      temporaryGrants: state.temporaryGrants.map((g) => ({ ...g })),
      updatedAtMs: state.updatedAtMs,
      tamperLockdown: Boolean(state.tamperLockdown),
      browserProfileInstalled: this.browserProfileInstalled,
      bot: { configured: Boolean(state.telegramBot), ...(state.telegramBot ? { username: state.telegramBot.username } : {}) },
      partner: {
        paired: state.paired,
        telegramChatId: maskTelegramChatId(state.partnerCredentials?.telegramChatId),
        remainingRecoveryCodes: state.partnerCredentials?.recoveryCodeHashes.length ?? 0,
      },
    };
  }

  /**
   * Verifica se uma solicitação de mutação ou desinstalação possui autorização
   * criptográfica válida do Ajudante (senha mestra ou token de desafio-resposta).
   */
  private checkPartnerAuth(
    state: MonBlockPersistentState,
    auth: { password?: string; challengeCode?: string; token?: string; requirePermanentToken?: boolean }
  ): boolean {
    const creds = state.partnerCredentials;
    if (!creds) return false;

    if (auth.password && verifyPartnerPassword(auth.password, creds.passwordHash)) {
      return true;
    }

    if (auth.token && auth.challengeCode) {
      const usedSet = new Set(creds.usedTokens);
      const tokenCheck = verifyChallengeToken({
        secret: creds.hmacSecret,
        challengeCode: auth.challengeCode,
        token: auth.token,
        usedTokens: usedSet,
      });
      if (tokenCheck.valid) {
        if (auth.requirePermanentToken && tokenCheck.duration !== 'permanent') {
          return false;
        }
        creds.usedTokens = Array.from(usedSet);
        return true;
      }
    }

    return false;
  }

  private readonly onServerDate = (date: string): void => this.clock.ingestServerDate(date);
  private firstTick = true;
  private lastPingMs = -Infinity;

  private telegramFor(chatId: string, botToken?: string): TelegramPartnerClient {
    return (
      this.telegramClient ??
      new TelegramPartnerClient({
        pairedChatId: chatId,
        botToken,
        transport: this.telegramTransport,
        onServerDate: this.onServerDate,
      })
    );
  }

  /**
   * Watchdog (a cada 60 s no daemon root): ancora o relógio, reaplica as regras, detecta
   * adulteração e inatividade, grava heartbeat e o snapshot do relógio. Serializado com os comandos.
   */
  public async tick(): Promise<{ drift: string[] }> {
    const next = this.commandQueue.then(
      () => this.runTick(),
      () => this.runTick()
    );
    this.commandQueue = next.catch(() => undefined);
    // Sem await e fora da fila: o `profiles` (até 5 s) não segura comandos nem a subida do socket.
    void this.refreshBrowserProfile();
    return next;
  }

  /** Checa o perfil dos navegadores; chamadas simultâneas compartilham a mesma execução. */
  public refreshBrowserProfile(): Promise<void> {
    if (!this.checkBrowserProfile) return Promise.resolve();
    this.profileCheck ??= (async () => {
      try {
        this.browserProfileInstalled = await this.checkBrowserProfile!();
      } finally {
        this.lastProfileCheckMs = Date.now();
        this.profileCheck = null;
      }
    })();
    return this.profileCheck;
  }

  /** Marca desligamento limpo (`SIGTERM`), para não acusar inatividade no próximo boot. */
  public shutdown(): Promise<void> {
    const next = this.commandQueue.then(
      () => this.markCleanShutdown(),
      () => this.markCleanShutdown()
    );
    this.commandQueue = next.catch(() => undefined);
    return next;
  }

  private markCleanShutdown(): void {
    const { state } = this.loadState();
    this.save({ ...state, cleanShutdown: true });
  }

  private async runTick(): Promise<{ drift: string[] }> {
    const { state } = this.loadState();
    const chatId = state.partnerCredentials?.telegramChatId;
    const telegram = chatId ? this.telegramFor(chatId, state.telegramBot?.token) : undefined;
    if (telegram && this.clock.trustedNow() - this.lastPingMs >= 10 * 60_000) {
      await telegram.ping();
      this.lastPingMs = this.clock.trustedNow();
    }
    const trustedNow = this.clock.trustedNow();
    const now = this.clock.nowForExpiry();

    const grants = state.temporaryGrants.filter((g) => g.expiresAtMs > now);
    const drift = this.enforcer.verifyApplied?.(state.rules, grants) ?? [];
    await this.enforcer.applyWebRules(state.rules, grants);

    const alerts: string[] = [];
    const iso = (ms: number) => new Date(ms).toISOString();
    if (
      this.firstTick &&
      state.lastHeartbeatMs !== undefined &&
      !state.cleanShutdown &&
      trustedNow - state.lastHeartbeatMs > 15 * 60_000
    ) {
      alerts.push(`⚠️ monBlock ficou inativo de ${iso(state.lastHeartbeatMs)} até ${iso(trustedNow)} (UTC).`);
    }
    let lastDriftAlertMs = state.lastDriftAlertMs;
    if (drift.length > 0 && (lastDriftAlertMs === undefined || trustedNow - lastDriftAlertMs >= 3600_000)) {
      alerts.push(`⚠️ Arquivos de bloqueio foram alterados e restaurados pelo monBlock: ${drift.join(', ')}`);
      lastDriftAlertMs = trustedNow;
    }
    this.firstTick = false;

    this.save({
      ...state,
      temporaryGrants: grants,
      lastHeartbeatMs: trustedNow,
      cleanShutdown: false,
      lastDriftAlertMs,
    });
    if (telegram && chatId) {
      for (const text of alerts) await telegram.sendAlert(text, chatId);
    }
    return { drift };
  }

  /** Persiste o estado junto com o snapshot do relógio confiável. */
  private save(state: MonBlockPersistentState): void {
    this.store.save({ ...state, clock: this.clock.snapshot() });
  }

  /**
   * Enfileira e serializa a execução dos comandos IPC para evitar race conditions em disco.
   */
  public handleCommand(cmd: DaemonCommand): Promise<DaemonResponse> {
    const next = this.commandQueue.then(
      () => this.processCommand(cmd),
      () => this.processCommand(cmd)
    );
    this.commandQueue = next.catch(() => undefined);
    return next;
  }

  /**
   * Processa de forma determinística um comando IPC recebido pelo daemon.
   */
  private async processCommand(cmd: DaemonCommand): Promise<DaemonResponse> {
    const hasCredential = carriesPartnerCredential(cmd);
    if (hasCredential) {
      const { state } = this.loadState();
      if ((state.authLockedUntilMs ?? 0) > this.clock.trustedNow()) {
        return buildProblem(
          429,
          'Muitas Tentativas (RN-DAEMON-09)',
          'Credenciais do Ajudante erradas várias vezes seguidas. Aguarde antes de tentar de novo.',
          '/ipc/monblockd/auth'
        );
      }
    }
    const response = await this.runCommand(cmd);
    if (hasCredential) this.recordAuthAttempt(response.status === 403);
    return response;
  }

  /** Carrega e reconcilia os cofres; na primeira leitura, retoma o relógio persistido. */
  private loadState(): ReturnType<TripleStateStore['loadAndReconcile']> {
    const reconciled = this.store.loadAndReconcile();
    if (!this.clockRestored) {
      if (reconciled.state.clock) this.clock.restore(reconciled.state.clock);
      this.clockRestored = true;
    }
    return reconciled;
  }

  /** RN-DAEMON-09: após 5 falhas, espera `min(2^(n-5) min, 24 h)` no tempo confiável. */
  private recordAuthAttempt(failed: boolean): void {
    const { state } = this.store.loadAndReconcile();
    if (failed) {
      const failures = (state.authFailures ?? 0) + 1;
      const lockedUntil =
        failures >= 5
          ? this.clock.trustedNow() + Math.min(2 ** (failures - 5) * 60_000, 24 * 3600_000)
          : state.authLockedUntilMs;
      this.save({ ...state, authFailures: failures, authLockedUntilMs: lockedUntil });
    } else if (state.authFailures) {
      this.save({ ...state, authFailures: 0, authLockedUntilMs: undefined });
    }
  }

  /**
   * RN-DAEMON-07 (D1-B): com tombstone e sem credenciais (cofres perdidos), só o Ajudante
   * anterior (mesmo chatId, provado ao responder pelo Telegram) ou 72h de cooldown liberam.
   */
  private repairingGate(
    state: MonBlockPersistentState,
    trustedNow: number,
    telegramChatId: string | undefined,
    instance: string
  ): ProblemDetailsResponse | null {
    if (state.partnerCredentials) return null;
    const tombstone = this.store.readTombstone();
    if (!tombstone) return null;
    if (telegramChatId && tombstone.telegramChatId === telegramChatId) return null;
    const startedAtMs = state.cooldown.startedAtMs;
    if (
      startedAtMs !== null &&
      evaluateEmergencyCooldown(new Date(startedAtMs).toISOString(), trustedNow).unlocked
    ) {
      return null;
    }
    return buildProblem(
      423,
      'Re-pareamento Bloqueado (RN-DAEMON-07)',
      'Os dados do Ajudante anterior sumiram. Re-pareie com o mesmo Ajudante pelo Telegram ou conclua o cooldown de 72 horas.',
      instance
    );
  }

  private async runCommand(cmd: DaemonCommand): Promise<DaemonResponse> {
    const reconciled = this.loadState();
    const { state } = reconciled;
    // `now` (expiração, updatedAtMs) nunca recua; `trustedNow` (cooldown) ignora a parede.
    const now = this.clock.nowForExpiry();
    const trustedNow = this.clock.trustedNow();

    const activeGrants = state.temporaryGrants.filter((g) => g.expiresAtMs > now);
    const grantsExpired = activeGrants.length !== state.temporaryGrants.length;
    if (grantsExpired) {
      state.temporaryGrants = activeGrants;
      state.updatedAtMs = now;
      this.save(state);
    }
    if (grantsExpired || reconciled.tamperDetected) {
      await this.enforcer.applyWebRules(state.rules, state.temporaryGrants);
    }

    switch (cmd.type) {
      case 'GET_STATE': {
        // Enquanto o perfil não estiver confirmado, a UI (que consulta a cada 15 s) vê a aprovação sem
        // esperar o watchdog de 60 s. ponytail: throttle de 10 s para não rodar `profiles` a cada consulta.
        if (this.browserProfileInstalled !== true && Date.now() - this.lastProfileCheckMs > 10_000) {
          void this.refreshBrowserProfile();
        }
        return {
          status: 200,
          state: this.toPublicState(state),
        };
      }

      case 'SET_BOT_TOKEN': {
        const token = typeof cmd.token === 'string' ? cmd.token.trim() : '';
        // Formato do BotFather: <id numérico>:<35 caracteres>. Valida antes de qualquer chamada de rede.
        if (!/^\d{6,12}:[A-Za-z0-9_-]{30,50}$/.test(token)) {
          return buildProblem(
            400,
            'Token do bot inválido',
            'Cole o token completo que o @BotFather enviou (algo como 123456789:ABC…).',
            '/ipc/monblockd/set-bot-token'
          );
        }
        // Trocar o bot depois do pareamento é adulterável (desvia as mensagens): exige a senha do Ajudante.
        if (state.paired && state.partnerCredentials) {
          const authorized =
            Boolean(cmd.currentPartnerPassword) &&
            verifyPartnerPassword(cmd.currentPartnerPassword!, state.partnerCredentials.passwordHash);
          if (!authorized) {
            return buildProblem(
              403,
              'Troca de bot não autorizada',
              'Com um Ajudante pareado, trocar o bot exige a senha atual do Ajudante.',
              '/ipc/monblockd/set-bot-token'
            );
          }
        }
        const probe = new TelegramPartnerClient({
          botToken: token,
          pairedChatId: '',
          transport: this.telegramTransport,
          onServerDate: this.onServerDate,
        });
        const me = await probe.getMe();
        if (!me.ok || !me.username) {
          return buildProblem(
            400,
            'Não foi possível validar o bot',
            'O Telegram não reconheceu esse token (ou está inacessível). Confira o token e tente de novo.',
            '/ipc/monblockd/set-bot-token'
          );
        }
        this.save({ ...state, telegramBot: { token, username: me.username, setAtMs: now }, updatedAtMs: now });
        return { status: 200, botConfigured: true, botUsername: me.username };
      }

      case 'INITIATE_PAIRING': {
        const partnerName = cmd.partnerName?.trim();
        const telegramChatId = cmd.telegramChatId?.trim();
        if (!partnerName || !telegramChatId) {
          return buildProblem(
            400,
            'Dados de Pareamento Inválidos',
            'Informe o Nome do Ajudante e o Chat ID do Telegram.',
            '/ipc/monblockd/initiate-pairing'
          );
        }

        if (state.paired && state.partnerCredentials) {
          const authorized =
            Boolean(cmd.currentPartnerPassword) &&
            verifyPartnerPassword(
              cmd.currentPartnerPassword!,
              state.partnerCredentials.passwordHash
            );
          if (!authorized) {
            return buildProblem(
              403,
              'Pareamento Já Ativo (INV-RATCHET-01)',
              'O sistema já possui um Ajudante vinculado. Substituir o pareamento exige a senha atual do Ajudante.',
              '/ipc/monblockd/initiate-pairing'
            );
          }
        }

        const initiateGate = this.repairingGate(
          state,
          trustedNow,
          telegramChatId,
          '/ipc/monblockd/initiate-pairing'
        );
        if (initiateGate) return initiateGate;

        const expiresAtMs = now + 15 * 60 * 1000;
        this.pendingPairing = {
          partnerName,
          telegramChatId,
          initiatedAtMs: now,
          expiresAtMs,
        };

        const client = this.telegramFor(telegramChatId, state.telegramBot?.token);
        await client.sendPairingInvitation({
          partnerName,
          chatId: telegramChatId,
        });

        return {
          status: 200,
          pairingInitiated: true,
          partnerName,
          telegramChatId,
          expiresAtMs,
        };
      }

      case 'INITIATE_PAIRING_LINK': {
        const partnerName = cmd.partnerName?.trim();
        if (!partnerName) {
          return buildProblem(400, 'Nome do Ajudante ausente', 'Informe o nome do Ajudante.', '/ipc/monblockd/initiate-pairing-link');
        }
        if (!state.telegramBot) {
          return buildProblem(
            400,
            'Bot do Telegram não conectado',
            'Conecte o seu bot do Telegram antes de convidar o Ajudante.',
            '/ipc/monblockd/initiate-pairing-link'
          );
        }
        if (state.paired && state.partnerCredentials) {
          const authorized =
            Boolean(cmd.currentPartnerPassword) &&
            verifyPartnerPassword(cmd.currentPartnerPassword!, state.partnerCredentials.passwordHash);
          if (!authorized) {
            return buildProblem(
              403,
              'Pareamento Já Ativo (INV-RATCHET-01)',
              'O sistema já possui um Ajudante vinculado. Substituir o pareamento exige a senha atual do Ajudante.',
              '/ipc/monblockd/initiate-pairing-link'
            );
          }
        }
        const linkGate = this.repairingGate(state, trustedNow, undefined, '/ipc/monblockd/initiate-pairing-link');
        if (linkGate) return linkGate;

        // Código de uso único e vida curta: quem abrir o link primeiro e apresentar o código vira o Ajudante.
        const pairingCode = crypto.randomBytes(8).toString('base64url');
        const expiresAtMs = now + 15 * 60 * 1000;
        this.pendingPairing = { partnerName, telegramChatId: '', pairingCode, initiatedAtMs: now, expiresAtMs };
        return {
          status: 200,
          pairingLink: `https://t.me/${state.telegramBot.username}?start=${pairingCode}`,
          pairingCode,
          partnerName,
          expiresAtMs,
        };
      }

      case 'CHECK_PAIRING_STATUS': {
        if (!this.pendingPairing) {
          return {
            status: 200,
            paired: state.paired,
            pending: false,
            partnerName: state.paired ? 'Pareado' : undefined,
            telegramChatId: state.partnerCredentials?.telegramChatId,
          };
        }

        if (this.isCheckingPairing) {
          return {
            status: 200,
            paired: state.paired,
            pending: true,
            partnerName: this.pendingPairing.partnerName,
            telegramChatId: this.pendingPairing.telegramChatId,
          };
        }

        if (now > this.pendingPairing.expiresAtMs) {
          const expiredPartner = this.pendingPairing.partnerName;
          this.pendingPairing = null;
          return {
            status: 200,
            paired: state.paired,
            pending: false,
            error: `O convite para ${expiredPartner} expirou após 15 minutos sem resposta.`,
          };
        }

        this.isCheckingPairing = true;
        try {
          const client = this.telegramFor(this.pendingPairing.telegramChatId, state.telegramBot?.token);

          const pollRes = await client.pollUpdates({
            offset: this.pendingPairing.lastUpdateOffset,
            timeoutSec: 0,
          });

          if (pollRes.ok && pollRes.updates.length > 0) {
            for (const update of pollRes.updates) {
              this.pendingPairing.lastUpdateOffset = Math.max(
                this.pendingPairing.lastUpdateOffset ?? 0,
                update.update_id + 1
              );

              // Pareamento por link: o primeiro `/start <código>` válido, em chat privado, vira o Ajudante.
              if (this.pendingPairing.pairingCode && !this.pendingPairing.telegramChatId) {
                const start = /^\/start\s+(\S+)$/.exec(update.message?.text?.trim() ?? '');
                const msg = update.message;
                if (start && msg && msg.chat.type === 'private') {
                  const given = Buffer.from(start[1]!, 'utf8');
                  const wanted = Buffer.from(this.pendingPairing.pairingCode, 'utf8');
                  if (given.length === wanted.length && crypto.timingSafeEqual(given, wanted)) {
                    this.pendingPairing.telegramChatId = String(msg.chat.id);
                    this.pendingPairing.pairingCode = undefined; // uso único
                    await client.sendPairingInvitation({
                      partnerName: this.pendingPairing.partnerName,
                      chatId: this.pendingPairing.telegramChatId,
                    });
                  }
                }
                continue;
              }

              const pwdCheck = client.extractPasswordFromUpdate(
                update,
                this.pendingPairing.telegramChatId
              );
              if (pwdCheck.valid && pwdCheck.password) {
                const hmacSecret = crypto.randomBytes(32).toString('hex');
                const passwordHash = hashPartnerPassword(pwdCheck.password);
                const salt = passwordHash.split('$')[1] ?? '';
                const kit = generateRecoveryKit();

                const nextState: MonBlockPersistentState = {
                  ...state,
                  version: state.version + 1,
                  paired: true,
                  cooldown: { startedAtMs: null },
                  partnerCredentials: {
                    passwordHash,
                    salt,
                    hmacSecret,
                    recoveryCodeHashes: kit.hashedCodes,
                    usedTokens: state.partnerCredentials?.usedTokens ?? [],
                    telegramChatId: this.pendingPairing.telegramChatId,
                  },
                  updatedAtMs: now,
                };

                this.save(nextState);
                this.store.writeTombstone({
                  pairedAtMs: trustedNow,
                  telegramChatId: this.pendingPairing.telegramChatId,
                });
                await this.enforcer.applyWebRules(nextState.rules, nextState.temporaryGrants);

                // Envia os 5 códigos de emergência exclusivamente ao Telegram do Ajudante
                await client.sendEmergencyKit({
                  codes: kit.plainCodes,
                  partnerName: this.pendingPairing.partnerName,
                  chatId: this.pendingPairing.telegramChatId,
                });

                // Tenta remover a mensagem com a senha para higienização
                if (pwdCheck.messageId) {
                  await client.deleteMessage(this.pendingPairing.telegramChatId, pwdCheck.messageId);
                }

                const finalizedPartnerName = this.pendingPairing.partnerName;
                this.pendingPairing = null;

                return {
                  status: 200,
                  paired: true,
                  pending: false,
                  partnerName: finalizedPartnerName,
                };
              }
            }
          }

          return {
            status: 200,
            paired: state.paired,
            pending: true,
            partnerName: this.pendingPairing.partnerName,
            telegramChatId: this.pendingPairing.telegramChatId,
            ...(pollRes.error ? { error: pollRes.error } : {}),
          };
        } finally {
          this.isCheckingPairing = false;
        }
      }

      case 'CANCEL_PAIRING': {
        this.pendingPairing = null;
        return {
          status: 200,
          cancelled: true,
        };
      }

      case 'PAIR_PARTNER': {
        if (!cmd.password || cmd.password.trim().length < 6) {
          return buildProblem(
            400,
            'Credenciais de Pareamento Inválidas',
            'A senha do Ajudante deve possuir no mínimo 6 caracteres.',
            '/ipc/monblockd/pair-partner'
          );
        }

        if (state.paired && state.partnerCredentials) {
          const authorized =
            Boolean(cmd.currentPartnerPassword) &&
            verifyPartnerPassword(
              cmd.currentPartnerPassword!,
              state.partnerCredentials.passwordHash
            );
          if (!authorized) {
            return buildProblem(
              403,
              'Pareamento Já Ativo (INV-RATCHET-01)',
              'O sistema já possui um Ajudante vinculado. Substituir o pareamento exige a senha atual do Ajudante.',
              '/ipc/monblockd/pair-partner'
            );
          }
        }

        // PAIR_PARTNER não passa pelo Telegram: o chatId informado não prova nada, só o cooldown libera.
        const pairGate = this.repairingGate(state, trustedNow, undefined, '/ipc/monblockd/pair-partner');
        if (pairGate) return pairGate;

        const hmacSecret =
          cmd.hmacSecret && cmd.hmacSecret.trim().length > 0
            ? cmd.hmacSecret.trim()
            : crypto.randomBytes(32).toString('hex');
        const passwordHash = hashPartnerPassword(cmd.password);
        const salt = passwordHash.split('$')[1] ?? '';
        const kit = generateRecoveryKit();

        const nextState: MonBlockPersistentState = {
          ...state,
          version: state.version + 1,
          paired: true,
          cooldown: { startedAtMs: null },
          partnerCredentials: {
            passwordHash,
            salt,
            hmacSecret,
            recoveryCodeHashes: kit.hashedCodes,
            usedTokens: state.partnerCredentials?.usedTokens ?? [],
            telegramChatId: cmd.telegramChatId,
          },
          updatedAtMs: now,
        };

        this.save(nextState);
        this.store.writeTombstone({ pairedAtMs: trustedNow, telegramChatId: cmd.telegramChatId });
        await this.enforcer.applyWebRules(nextState.rules, nextState.temporaryGrants);

        return {
          status: 200,
          paired: true,
          recoveryCodes: kit.plainCodes,
        };
      }

      case 'MUTATE_RULES': {
        const existingBlockedSet = new Set(
          state.rules.blockedDomains.map(
            (d) => sanitizeAndNormalizeUrl(d)?.domain ?? d.trim().toLowerCase()
          )
        );
        const newBlockedCandidates = cmd.rules.blockedDomains.filter((raw) => {
          const norm = sanitizeAndNormalizeUrl(raw)?.domain;
          return !norm || !existingBlockedSet.has(norm);
        });
        const deltaValidation = validateBatchDomains(newBlockedCandidates);
        if (!deltaValidation.valid) {
          return buildProblem(
            400,
            'Limite de Lote de Domínios Excedido (RN-WEB-04)',
            deltaValidation.error ?? 'Lote de domínios inválido.',
            '/ipc/monblockd/mutate-rules'
          );
        }

        const normalizedBlockedDomains = Array.from(
          new Set(
            cmd.rules.blockedDomains
              .map((raw) => sanitizeAndNormalizeUrl(raw)?.domain)
              .filter((d): d is string => Boolean(d))
          )
        );

        const normalizedAllowlist: string[] = [];
        for (const rawAllow of cmd.rules.allowlistDomains) {
          const parsed = sanitizeAndNormalizeUrl(rawAllow);
          if (!parsed) {
            return buildProblem(
              400,
              'Domínio de Allowlist Inválido',
              `Domínio inválido na allowlist: "${rawAllow}".`,
              '/ipc/monblockd/mutate-rules'
            );
          }
          normalizedAllowlist.push(parsed.domain);
        }

        const partnerAuthorized = this.checkPartnerAuth(state, {
          password: cmd.partnerPassword,
          challengeCode: cmd.challengeCode,
          token: cmd.token,
          requirePermanentToken: true,
        });

        const normalizedNextRules: ProtectionRuleset = {
          enabledCategories: Array.from(new Set(cmd.rules.enabledCategories)),
          blockedDomains: normalizedBlockedDomains,
          allowlistDomains: Array.from(new Set(normalizedAllowlist)),
          keywords: Array.from(new Set(cmd.rules.keywords)),
          lockIncognito: cmd.rules.lockIncognito,
        };

        const ratchetDecision = canMutateProtectionRule({
          current: state.rules,
          next: normalizedNextRules,
          partnerAuthorized,
        });

        if (!ratchetDecision.allowed) {
          return buildProblem(
            403,
            'Mutação Rejeitada pela Catraca Unidirecional (INV-RATCHET-01)',
            ratchetDecision.reason ?? 'A remoção de proteção exige autorização do Ajudante.',
            '/ipc/monblockd/mutate-rules'
          );
        }

        const nextState: MonBlockPersistentState = {
          ...state,
          version: state.version + 1,
          rules: normalizedNextRules,
          updatedAtMs: now,
        };

        this.save(nextState);
        await this.enforcer.applyWebRules(nextState.rules, nextState.temporaryGrants);

        return {
          status: 200,
          rules: structuredClone(nextState.rules),
        };
      }

      case 'VERIFY_OFFLINE_TOKEN': {
        if (!state.paired || !state.partnerCredentials) {
          return buildProblem(
            400,
            'Ajudante Não Pareado',
            'Não é possível validar token offline antes do pareamento do Ajudante.',
            '/ipc/monblockd/verify-offline-token'
          );
        }

        const usedSet = new Set(state.partnerCredentials.usedTokens);
        const verification = verifyChallengeToken({
          secret: state.partnerCredentials.hmacSecret,
          challengeCode: cmd.challengeCode,
          token: cmd.token,
          usedTokens: usedSet,
        });

        if (!verification.valid || !verification.duration) {
          return buildProblem(
            403,
            'Token Offline Inválido ou Já Utilizado (RN-LIM-02)',
            'A assinatura HMAC não confere ou este token já foi consumido anteriormente.',
            '/ipc/monblockd/verify-offline-token'
          );
        }

        const durationMs =
          verification.duration === '15m'
            ? 15 * 60_000
            : verification.duration === '60m'
              ? 60 * 60_000
              : 365 * 24 * 3600 * 1000;

        const normalizedTarget =
          !cmd.target || cmd.target.trim() === '*'
            ? '*'
            : (sanitizeAndNormalizeUrl(cmd.target)?.domain ?? cmd.target.trim().toLowerCase());

        const grant: TemporaryGrant = {
          target: normalizedTarget,
          expiresAtMs: now + durationMs,
        };

        const nextState: MonBlockPersistentState = {
          ...state,
          version: state.version + 1,
          partnerCredentials: {
            ...state.partnerCredentials,
            usedTokens: Array.from(usedSet),
          },
          temporaryGrants: [...state.temporaryGrants, grant],
          updatedAtMs: now,
        };

        this.save(nextState);
        await this.enforcer.applyWebRules(nextState.rules, nextState.temporaryGrants);

        return {
          status: 200,
          valid: true,
          duration: verification.duration,
          grant,
        };
      }

      case 'VERIFY_RECOVERY_CODE': {
        if (!state.paired || !state.partnerCredentials) {
          return buildProblem(
            400,
            'Ajudante Não Pareado',
            'Nenhum kit de recuperação está registrado.',
            '/ipc/monblockd/verify-recovery-code'
          );
        }

        const candidate = cmd.code.trim().toUpperCase();
        const hashes = state.partnerCredentials.recoveryCodeHashes;
        let matchIndex = -1;
        for (let i = 0; i < hashes.length; i++) {
          const matched = verifyPartnerPassword(candidate, hashes[i]!);
          if (matched && matchIndex === -1) {
            matchIndex = i;
          }
        }

        if (matchIndex === -1) {
          return buildProblem(
            403,
            'Código de Emergência Inválido ou Já Consumido',
            'O código informado não corresponde a nenhum código de emergência disponível.',
            '/ipc/monblockd/verify-recovery-code'
          );
        }

        const remainingHashes = hashes.filter((_, idx) => idx !== matchIndex);
        const normalizedTarget =
          !cmd.target || cmd.target.trim() === '*'
            ? '*'
            : (sanitizeAndNormalizeUrl(cmd.target)?.domain ?? cmd.target.trim().toLowerCase());

        const grant: TemporaryGrant = {
          target: normalizedTarget,
          expiresAtMs: now + 60 * 60_000,
        };

        const nextState: MonBlockPersistentState = {
          ...state,
          version: state.version + 1,
          partnerCredentials: {
            ...state.partnerCredentials,
            recoveryCodeHashes: remainingHashes,
          },
          temporaryGrants: [...state.temporaryGrants, grant],
          updatedAtMs: now,
        };

        this.save(nextState);
        await this.enforcer.applyWebRules(nextState.rules, nextState.temporaryGrants);

        return {
          status: 200,
          valid: true,
          remainingCodes: remainingHashes.length,
          grant,
        };
      }

      case 'TRIGGER_EMERGENCY_COOLDOWN': {
        const startedAtMs = state.cooldown.startedAtMs ?? trustedNow;
        const cooldownEval = evaluateEmergencyCooldown(
          new Date(startedAtMs).toISOString(),
          trustedNow
        );

        const nextState: MonBlockPersistentState = {
          ...state,
          version: state.version + 1,
          cooldown: { startedAtMs },
          updatedAtMs: now,
        };

        this.save(nextState);

        return {
          status: 200,
          unlocked: cooldownEval.unlocked,
          remainingHours: cooldownEval.remainingHours,
          startedAtMs,
        };
      }

      case 'REVOKE_GRANTS_ON_SLEEP': {
        const revokedCount = state.temporaryGrants.length;
        const nextState: MonBlockPersistentState = {
          ...state,
          version: state.version + 1,
          temporaryGrants: [],
          updatedAtMs: now,
        };

        this.save(nextState);
        await this.enforcer.applyWebRules(nextState.rules, nextState.temporaryGrants);

        return {
          status: 200,
          revokedCount,
          temporaryGrants: [],
        };
      }

      case 'MIGRATE_LEGACY_STATE': {
        const instance = '/ipc/monblockd/migrate-legacy-state';
        if (state.migration && state.migration.id === cmd.migrationId) {
          return { status: 200, migrated: true, format: state.migration.format, paired: state.migration.paired };
        }
        if (
          typeof cmd.migrationId !== 'string' ||
          cmd.migrationId.length === 0 ||
          cmd.migrationId.length > 128 ||
          (cmd.format !== 'MBV1' && cmd.format !== 'LEGACY_JSON')
        ) {
          return buildProblem(400, 'Migração Inválida', 'Informe `format` e `migrationId` válidos.', instance);
        }
        if (state.migration || state.partnerCredentials || this.store.readTombstone()) {
          return buildProblem(
            409,
            'Migração Recusada (RN-DAEMON-10)',
            'O serviço protegido já tem um Ajudante ou já recebeu uma migração.',
            instance
          );
        }
        // JSON legado: chave de integridade pública, então as credenciais não provam nada.
        const legacy = parseLegacyState(cmd.state, cmd.format === 'MBV1');
        if (!legacy) {
          return buildProblem(400, 'Estado Legado Malformado', 'Os cofres antigos não têm o formato esperado.', instance);
        }

        const union = (a: string[], b: string[]) => Array.from(new Set([...a, ...b]));
        const credentials = legacy.credentials;
        const paired = Boolean(credentials);
        const nextState: MonBlockPersistentState = {
          ...state,
          version: state.version + 1,
          paired: paired || state.paired,
          rules: {
            enabledCategories: union(state.rules.enabledCategories, legacy.categories),
            blockedDomains: union(state.rules.blockedDomains, legacy.domains),
            allowlistDomains: state.rules.allowlistDomains,
            keywords: union(state.rules.keywords, legacy.keywords),
            lockIncognito: true,
          },
          ...(credentials ? { partnerCredentials: credentials } : {}),
          migration: { id: cmd.migrationId, format: cmd.format, paired },
          updatedAtMs: now,
        };

        this.save(nextState);
        if (credentials) {
          this.store.writeTombstone({ pairedAtMs: trustedNow, telegramChatId: credentials.telegramChatId });
        }
        await this.enforcer.applyWebRules(nextState.rules, nextState.temporaryGrants);

        // ponytail: aviso só informativo. Ele vai ao chatId do próprio payload migrado, então um
        // "não reconheço" não protegeria contra um payload forjado (risco aceito na ADR-0007).
        if (credentials?.telegramChatId) {
          await this.telegramFor(credentials.telegramChatId, state.telegramBot?.token).sendAlert(
            '🛡️ O monBlock passou para o modo protegido (serviço do sistema) e o seu vínculo como Ajudante foi mantido.',
            credentials.telegramChatId
          );
        }
        return { status: 200, migrated: true, format: cmd.format, paired };
      }

      case 'UNINSTALL_AUTHORIZED': {
        const authorizedByPartner = this.checkPartnerAuth(state, {
          password: cmd.password,
          challengeCode: cmd.challengeCode,
          token: cmd.token,
          requirePermanentToken: true,
        });

        const authorizedByCooldown =
          state.cooldown.startedAtMs !== null &&
          evaluateEmergencyCooldown(
            new Date(state.cooldown.startedAtMs).toISOString(),
            trustedNow
          ).unlocked;

        if (!authorizedByPartner && !authorizedByCooldown) {
          return buildProblem(
            403,
            'Desinstalação Não Autorizada (RN-DAEMON-06)',
            'A desinstalação exige senha mestra do Ajudante, token UNLOCK-PERMANENT válido ou conclusão do Cooldown de 72 horas.',
            '/ipc/monblockd/uninstall-authorized'
          );
        }

        await this.enforcer.restoreSystemCleanState();
        this.store.clearTombstone();
        this.save({
          ...state,
          version: state.version + 1,
          temporaryGrants: [],
          updatedAtMs: now,
        });
        const uninstallChatId = state.partnerCredentials?.telegramChatId;
        if (uninstallChatId) {
          await this.telegramFor(uninstallChatId, state.telegramBot?.token).sendAlert(
            'ℹ️ O monBlock foi desinstalado com autorização (credencial do Ajudante ou cooldown de 72h concluído).',
            uninstallChatId
          );
        }
        this.onUninstalled?.();

        return {
          status: 200,
          uninstalled: true,
        };
      }
    }
  }
}
