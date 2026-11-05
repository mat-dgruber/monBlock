/**
 * @file monblockd.ts
 * @description Orquestrador do Daemon Privilegiado (`MonBlockDaemon` — MOD-03 / ADR-0001).
 *
 * Coordena `TripleStateStore`, `PartnerGuard`, `RuleEngine` e `PlatformEnforcer`,
 * processando comandos IPC tipados e retornando respostas estruturadas ou erros
 * compatíveis com a RFC 9457 (`Problem Details for HTTP/IPC APIs`).
 */

import crypto from 'node:crypto';
import { TelegramPartnerClient } from './telegram-client.js';
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

function maskTelegramChatId(chatId?: string): string | undefined {
  if (!chatId) return undefined;
  const trimmed = chatId.trim();
  if (trimmed.length <= 4) return '****';
  return `${'*'.repeat(trimmed.length - 4)}${trimmed.slice(-4)}`;
}

// MARK: - Implementação MonBlockDaemon

export interface PendingPairingState {
  partnerName: string;
  telegramChatId: string;
  initiatedAtMs: number;
  expiresAtMs: number;
  lastUpdateOffset?: number;
}

export interface MonBlockDaemonOptions {
  store: TripleStateStore;
  enforcer: PlatformEnforcer;
  nowFn?: () => number;
  telegramClient?: TelegramPartnerClient;
}

export class MonBlockDaemon {
  private readonly store: TripleStateStore;
  private readonly enforcer: PlatformEnforcer;
  private readonly nowFn: () => number;
  private readonly telegramClient?: TelegramPartnerClient;
  private pendingPairing: PendingPairingState | null = null;
  private isCheckingPairing = false;
  private wasPaired = false;
  private commandQueue: Promise<unknown> = Promise.resolve();

  constructor(options: MonBlockDaemonOptions) {
    this.store = options.store;
    this.enforcer = options.enforcer;
    this.nowFn = options.nowFn ?? (() => Date.now());
    this.telegramClient = options.telegramClient;
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
    const now = this.nowFn();
    const reconciled = this.store.loadAndReconcile({ expectPaired: this.wasPaired });
    const { state } = reconciled;

    if (state.paired) {
      this.wasPaired = true;
    }

    const activeGrants = state.temporaryGrants.filter((g) => g.expiresAtMs > now);
    const grantsExpired = activeGrants.length !== state.temporaryGrants.length;
    if (grantsExpired) {
      state.temporaryGrants = activeGrants;
      state.updatedAtMs = now;
      this.store.save(state);
    }
    if (grantsExpired || reconciled.tamperDetected) {
      await this.enforcer.applyWebRules(state.rules, state.temporaryGrants);
    }

    switch (cmd.type) {
      case 'GET_STATE': {
        return {
          status: 200,
          state: this.toPublicState(state),
        };
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

        const expiresAtMs = now + 15 * 60 * 1000;
        this.pendingPairing = {
          partnerName,
          telegramChatId,
          initiatedAtMs: now,
          expiresAtMs,
        };

        const client =
          this.telegramClient ??
          new TelegramPartnerClient({ pairedChatId: telegramChatId });
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
          const client =
            this.telegramClient ??
            new TelegramPartnerClient({ pairedChatId: this.pendingPairing.telegramChatId });

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

                this.wasPaired = true;
                this.store.save(nextState);
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

        this.wasPaired = true;
        this.store.save(nextState);
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

        this.store.save(nextState);
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

        this.store.save(nextState);
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

        this.store.save(nextState);
        await this.enforcer.applyWebRules(nextState.rules, nextState.temporaryGrants);

        return {
          status: 200,
          valid: true,
          remainingCodes: remainingHashes.length,
          grant,
        };
      }

      case 'TRIGGER_EMERGENCY_COOLDOWN': {
        const startedAtMs = state.cooldown.startedAtMs ?? now;
        const cooldownEval = evaluateEmergencyCooldown(
          new Date(startedAtMs).toISOString(),
          now
        );

        const nextState: MonBlockPersistentState = {
          ...state,
          version: state.version + 1,
          cooldown: { startedAtMs },
          updatedAtMs: now,
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
          updatedAtMs: now,
        };

        this.store.save(nextState);
        await this.enforcer.applyWebRules(nextState.rules, nextState.temporaryGrants);

        return {
          status: 200,
          revokedCount,
          temporaryGrants: [],
        };
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
            now
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
        this.wasPaired = false;
        this.store.save({
          ...state,
          version: state.version + 1,
          temporaryGrants: [],
          updatedAtMs: now,
        });

        return {
          status: 200,
          uninstalled: true,
        };
      }
    }
  }
}
