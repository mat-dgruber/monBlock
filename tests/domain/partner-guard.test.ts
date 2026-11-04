/**
 * @file partner-guard.test.ts
 * @description Suíte de testes unitários para o Guardião Criptográfico do Ajudante (PartnerGuard),
 * cobrindo derivação lenta scrypt, desafio-resposta HMAC-SHA256 anti-replay (RN-LIM-02),
 * kit de emergência de 5 códigos, cooldown de 72h e Catraca Unidirecional Append-Only (ADR-0003).
 */

import { describe, it, expect } from 'vitest';
import {
  hashPartnerPassword,
  verifyPartnerPassword,
  generateChallengeToken,
  verifyChallengeToken,
  generateRecoveryKit,
  evaluateEmergencyCooldown,
  canMutateProtectionRule,
} from '../../src/domain/partner-guard.js';
import type { RuleEngineState } from '../../src/domain/rule-engine.js';

// MARK: - Testes de Hash de Senha, Tokens HMAC Anti-Replay e Cooldown de 72h

describe('PartnerGuard Crypto, Replay Protection & 72h Cooldown', () => {
  it('valida senha do Ajudante com derivação lenta e timingSafeEqual', () => {
    const hash = hashPartnerPassword('SenhaForteDoAjudante#2026');
    expect(verifyPartnerPassword('SenhaForteDoAjudante#2026', hash)).toBe(true);
    expect(verifyPartnerPassword('SenhaErrada', hash)).toBe(false);
    expect(verifyPartnerPassword('SenhaForteDoAjudante#2026', 'formato-invalido')).toBe(false);
    expect(verifyPartnerPassword('SenhaForteDoAjudante#2026', 'scrypt$aa$bb')).toBe(false);
  });

  it('gera e valida token HMAC de desafio-resposta e bloqueia replay (RN-LIM-02)', () => {
    const secret = 'super-secret-256-bit-key';
    const challenge = 'MB-8492-X7';
    const used = new Set<string>();

    const token = generateChallengeToken(secret, challenge, '15m');
    const firstTry = verifyChallengeToken({
      secret,
      challengeCode: challenge,
      token,
      usedTokens: used,
    });
    expect(firstTry).toEqual({ valid: true, duration: '15m' });

    // Segunda tentativa com o mesmo token deve ser rejeitada (anti-replay)
    const replayTry = verifyChallengeToken({
      secret,
      challengeCode: challenge,
      token,
      usedTokens: used,
    });
    expect(replayTry.valid).toBe(false);

    // Token adulterado deve ser rejeitado
    const forgedTry = verifyChallengeToken({
      secret,
      challengeCode: challenge,
      token: 'UNLOCK-15M-0000000000',
      usedTokens: used,
    });
    expect(forgedTry.valid).toBe(false);
  });

  it('gera kit de emergência com 5 códigos únicos e mantém bloqueio ativo nas 72h de cooldown', () => {
    const kit = generateRecoveryKit();
    expect(kit.plainCodes).toHaveLength(5);
    expect(kit.hashedCodes).toHaveLength(5);
    expect(new Set(kit.plainCodes).size).toBe(5);
    expect(verifyPartnerPassword(kit.plainCodes[0]!, kit.hashedCodes[0]!)).toBe(true);

    const start = '2026-11-04T00:00:00.000Z';
    const after12h = Date.parse(start) + 12 * 3600 * 1000;
    const exact72h = Date.parse(start) + 72 * 3600 * 1000;
    const after73h = Date.parse(start) + 73 * 3600 * 1000;

    expect(evaluateEmergencyCooldown(start, after12h)).toEqual({
      unlocked: false,
      remainingHours: 60,
    });
    expect(evaluateEmergencyCooldown(start, exact72h)).toEqual({
      unlocked: true,
      remainingHours: 0,
    });
    expect(evaluateEmergencyCooldown(start, after73h)).toEqual({
      unlocked: true,
      remainingHours: 0,
    });
  });

  // MARK: - Testes da Catraca Unidirecional Append-Only (ADR-0003)

  it('permite endurecimento livre (Append-Only) e exige autorização do Ajudante para afrouxar regras', () => {
    const baseState: RuleEngineState = {
      enabledCategories: ['adult'],
      blockedDomains: ['bet365.com'],
      allowlistDomains: [],
      keywords: ['cassino'],
      lockIncognito: false,
    };

    // 1. Endurecimento: adicionar domínio, ativar categoria e travar modo anônimo sem token do Ajudante
    const hardenedState: RuleEngineState = {
      enabledCategories: ['adult', 'gambling'],
      blockedDomains: ['bet365.com', 'blaze.com'],
      allowlistDomains: [],
      keywords: ['cassino', 'roleta'],
      lockIncognito: true,
    };

    expect(
      canMutateProtectionRule({
        current: baseState,
        next: hardenedState,
        partnerAuthorized: false,
      })
    ).toEqual({ allowed: true });

    // 2. Afrouxamento: remover domínio bloqueado sem autorização -> negado
    const removedDomainState: RuleEngineState = {
      ...hardenedState,
      blockedDomains: ['bet365.com'],
    };
    expect(
      canMutateProtectionRule({
        current: hardenedState,
        next: removedDomainState,
        partnerAuthorized: false,
      }).allowed
    ).toBe(false);

    // 3. Afrouxamento: desativar categoria sem autorização -> negado
    const disabledCategoryState: RuleEngineState = {
      ...hardenedState,
      enabledCategories: ['adult'],
    };
    expect(
      canMutateProtectionRule({
        current: hardenedState,
        next: disabledCategoryState,
        partnerAuthorized: false,
      }).allowed
    ).toBe(false);

    // 4. Afrouxamento: destravar lockIncognito (true -> false) sem autorização -> negado
    const unlockedIncognitoState: RuleEngineState = {
      ...hardenedState,
      lockIncognito: false,
    };
    expect(
      canMutateProtectionRule({
        current: hardenedState,
        next: unlockedIncognitoState,
        partnerAuthorized: false,
      }).allowed
    ).toBe(false);

    // 5. Afrouxamento: remover keyword ou adicionar allowlist sem autorização -> negado
    expect(
      canMutateProtectionRule({
        current: hardenedState,
        next: { ...hardenedState, keywords: ['cassino'] },
        partnerAuthorized: false,
      }).allowed
    ).toBe(false);

    expect(
      canMutateProtectionRule({
        current: hardenedState,
        next: { ...hardenedState, allowlistDomains: ['safe.bet365.com'] },
        partnerAuthorized: false,
      }).allowed
    ).toBe(false);

    // 6. Com autorização do Ajudante (partnerAuthorized: true) -> todas as reduções são permitidas
    expect(
      canMutateProtectionRule({
        current: hardenedState,
        next: unlockedIncognitoState,
        partnerAuthorized: true,
      })
    ).toEqual({ allowed: true });
  });
});
