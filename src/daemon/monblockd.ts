/**
 * @file monblockd.ts
 * @description Orquestrador do Daemon Privilegiado (`MonBlockDaemon` — MOD-03 / ADR-0001).
 *
 * Coordena `TripleStateStore`, `PartnerGuard`, `RuleEngine` e `PlatformEnforcer`,
 * processando comandos IPC tipados e retornando respostas estruturadas ou erros
 * compatíveis com a RFC 9457 (`Problem Details for HTTP/IPC APIs`).
 */

import {
  canMutateProtectionRule,
  evaluateEmergencyCooldown,
  generateRecoveryKit,
  hashPartnerPassword,
  verifyChallengeToken,
  verifyPartnerPassword,
  type UnlockDuration,
} from '../domain/partner-guard.js';
import { validateBatchDomains } from '../domain/rule-engine.js';
import type { PlatformEnforcer } from '../enforcers/platform-enforcer.js';
import type {
  CooldownState,
  MonBlockPersistentState,
  ProtectionRuleset,
  TemporaryGrant,
  TripleStateStore,
} from '../storage/state-store.js';

// MARK: - Contratos de Erro RFC 9457 (Problem Details) e Comandos IPC

/** Erro padronizado segundo a RFC 9457 (Problem Details). */
export interface ProblemDetailsResponse {
  type: string;
  title: string;
  status: 400 | 403 | 409 | 423 | 500;
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
  partner: {
    paired: boolean;
    telegramChatId?: string;
    remainingRecoveryCodes: number;
  };
}

/** Comandos IPC suportados pelo `MonBlockDaemon`. */
export type DaemonCommand =
  | { type: 'GET_STATE' }
  | {
      type: 'PAIR_PARTNER';
      password: string;
      hmacSecret: string;
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
      nowMs?: number;
    }
  | {
      type: 'VERIFY_RECOVERY_CODE';
      code: string;
      target?: string;
      nowMs?: number;
    }
  | {
      type: 'TRIGGER_EMERGENCY_COOLDOWN';
      nowMs?: number;
    }
  | {
      type: 'REVOKE_GRANTS_ON_SLEEP';
    }
  | {
      type: 'UNINSTALL_AUTHORIZED';
      password?: string;
      challengeCode?: string;
      token?: string;
      nowMs?: number;
    };

/** Respostas tipadas de sucesso dos comandos IPC. */
export type DaemonSuccessResponse =
  | { status: 200; state: PublicSanitizedState }
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
    };

export type DaemonResponse = DaemonSuccessResponse | ProblemDetailsResponse;

// MARK: - Utilitário RFC 9457

function buildProblem(
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

// MARK: - Implementação MonBlockDaemon

export interface MonBlockDaemonOptions {
  store: TripleStateStore;
  enforcer: PlatformEnforcer;
}

export class MonBlockDaemon {
  private readonly store: TripleStateStore;
  private readonly enforcer: PlatformEnforcer;

  constructor(options: MonBlockDaemonOptions) {
    this.store = options.store;
    this.enforcer = options.enforcer;
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
      partner: {
        paired: state.paired,
        telegramChatId: state.partnerCredentials?.telegramChatId,
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

  /**
   * Processa de forma determinística um comando IPC recebido pelo daemon.
   */
  public async handleCommand(cmd: DaemonCommand): Promise<DaemonResponse> {
    const { state } = this.store.loadAndReconcile();

    switch (cmd.type) {
      case 'GET_STATE': {
        return {
          status: 200,
          state: this.toPublicState(state),
        };
      }

      case 'PAIR_PARTNER': {
        if (!cmd.password || cmd.password.trim().length < 6 || !cmd.hmacSecret) {
          return buildProblem(
            400,
            'Credenciais de Pareamento Inválidas',
            'A senha do Ajudante (mínimo 6 caracteres) e o segredo HMAC são obrigatórios.',
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

        const passwordHash = hashPartnerPassword(cmd.password);
        const salt = passwordHash.split('$')[1] ?? '';
        const kit = generateRecoveryKit();

        const nextState: MonBlockPersistentState = {
          ...state,
          version: state.version + 1,
          paired: true,
          partnerCredentials: {
            passwordHash,
            salt,
            hmacSecret: cmd.hmacSecret,
            recoveryCodeHashes: kit.hashedCodes,
            usedTokens: state.partnerCredentials?.usedTokens ?? [],
            telegramChatId: cmd.telegramChatId,
          },
          updatedAtMs: Date.now(),
        };

        this.store.save(nextState);
        await this.enforcer.applyWebRules(nextState.rules);

        return {
          status: 200,
          paired: true,
          recoveryCodes: kit.plainCodes,
        };
      }

      case 'MUTATE_RULES': {
        const batchValidation = validateBatchDomains(cmd.rules.blockedDomains);
        if (!batchValidation.valid) {
          return buildProblem(
            400,
            'Limite de Lote de Domínios Excedido (RN-WEB-04)',
            batchValidation.error ?? 'Lote de domínios inválido.',
            '/ipc/monblockd/mutate-rules'
          );
        }

        const partnerAuthorized = this.checkPartnerAuth(state, {
          password: cmd.partnerPassword,
          challengeCode: cmd.challengeCode,
          token: cmd.token,
        });

        const normalizedNextRules: ProtectionRuleset = {
          enabledCategories: Array.from(new Set(cmd.rules.enabledCategories)),
          blockedDomains: batchValidation.domains,
          allowlistDomains: Array.from(new Set(cmd.rules.allowlistDomains)),
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
          updatedAtMs: Date.now(),
        };

        this.store.save(nextState);
        await this.enforcer.applyWebRules(nextState.rules);

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

        const nowMs = cmd.nowMs ?? Date.now();
        const durationMs =
          verification.duration === '15m'
            ? 15 * 60_000
            : verification.duration === '60m'
              ? 60 * 60_000
              : 365 * 24 * 3600 * 1000;

        const grant: TemporaryGrant = {
          target: cmd.target ?? '*',
          expiresAtMs: nowMs + durationMs,
        };

        const nextState: MonBlockPersistentState = {
          ...state,
          version: state.version + 1,
          partnerCredentials: {
            ...state.partnerCredentials,
            usedTokens: Array.from(usedSet),
          },
          temporaryGrants: [...state.temporaryGrants, grant],
          updatedAtMs: nowMs,
        };

        this.store.save(nextState);

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
        const matchIndex = hashes.findIndex((h) => verifyPartnerPassword(candidate, h));

        if (matchIndex === -1) {
          return buildProblem(
            403,
            'Código de Emergência Inválido ou Já Consumido',
            'O código informado não corresponde a nenhum código de emergência disponível.',
            '/ipc/monblockd/verify-recovery-code'
          );
        }

        const remainingHashes = hashes.filter((_, idx) => idx !== matchIndex);
        const nowMs = cmd.nowMs ?? Date.now();
        const grant: TemporaryGrant = {
          target: cmd.target ?? '*',
          expiresAtMs: nowMs + 60 * 60_000,
        };

        const nextState: MonBlockPersistentState = {
          ...state,
          version: state.version + 1,
          partnerCredentials: {
            ...state.partnerCredentials,
            recoveryCodeHashes: remainingHashes,
          },
          temporaryGrants: [...state.temporaryGrants, grant],
          updatedAtMs: nowMs,
        };

        this.store.save(nextState);

        return {
          status: 200,
          valid: true,
          remainingCodes: remainingHashes.length,
          grant,
        };
      }

      case 'TRIGGER_EMERGENCY_COOLDOWN': {
        const nowMs = cmd.nowMs ?? Date.now();
        const startedAtMs = state.cooldown.startedAtMs ?? nowMs;
        const cooldownEval = evaluateEmergencyCooldown(
          new Date(startedAtMs).toISOString(),
          nowMs
        );

        const nextState: MonBlockPersistentState = {
          ...state,
          version: state.version + 1,
          cooldown: { startedAtMs },
          updatedAtMs: nowMs,
        };

        this.store.save(nextState);

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
          updatedAtMs: Date.now(),
        };

        this.store.save(nextState);
        await this.enforcer.applyWebRules(nextState.rules);

        return {
          status: 200,
          revokedCount,
          temporaryGrants: [],
        };
      }

      case 'UNINSTALL_AUTHORIZED': {
        const nowMs = cmd.nowMs ?? Date.now();
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
            nowMs
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
        this.store.save({
          ...state,
          version: state.version + 1,
          temporaryGrants: [],
          updatedAtMs: nowMs,
        });

        return {
          status: 200,
          uninstalled: true,
        };
      }
    }
  }
}
