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
  validateMasterPassword,
  formatPasswordChecklistMessage,
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

  it('rejeita senhas vazias ou maiores que 128 bytes em hashPartnerPassword e verifyPartnerPassword (anti-DoS scrypt)', () => {
    const validHash = hashPartnerPassword('SenhaValida123!');
    const overlongPassword = 'a'.repeat(129);

    expect(() => hashPartnerPassword('')).toThrow();
    expect(() => hashPartnerPassword(overlongPassword)).toThrow();
    expect(verifyPartnerPassword('', validHash)).toBe(false);
    expect(verifyPartnerPassword(overlongPassword, validHash)).toBe(false);
  });

  it('normaliza prefixo www. e URLs em canMutateProtectionRule para evitar falso erro 403', () => {
    const current: RuleEngineState = {
      enabledCategories: ['adult'],
      blockedDomains: ['www.site.com'],
      allowlistDomains: ['https://www.permitido.com.br/'],
      keywords: ['cassino'],
      lockIncognito: false,
    };

    const next: RuleEngineState = {
      enabledCategories: ['adult'],
      blockedDomains: ['site.com', 'novo-bloqueio.org'],
      allowlistDomains: ['permitido.com.br'],
      keywords: ['cassino'],
      lockIncognito: false,
    };

    expect(
      canMutateProtectionRule({
        current,
        next,
        partnerAuthorized: false,
      })
    ).toEqual({ allowed: true });
  });

  describe('validateMasterPassword & Checklist Formatting', () => {
    it('aprova senha forte completa com mais de 8 caracteres, maiúscula, minúscula, número e símbolo', () => {
      const res = validateMasterPassword('Foco#Protegido2026!', { partnerName: 'Beatriz' });
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
      expect(res.criteria.every((c) => c.passed)).toBe(true);
    });

    it('rejeita senha com menos de 8 caracteres', () => {
      const res = validateMasterPassword('Ab1!xyz');
      expect(res.valid).toBe(false);
      expect(res.errors).toContain('A senha deve ter no mínimo 8 caracteres.');
      const lengthCrit = res.criteria.find((c) => c.id === 'length');
      expect(lengthCrit?.passed).toBe(false);
    });

    it('rejeita senha sem maiúscula', () => {
      const res = validateMasterPassword('foco#protegido2026!');
      expect(res.valid).toBe(false);
      expect(res.errors).toContain('A senha deve conter ao menos 1 letra maiúscula.');
      expect(res.criteria.find((c) => c.id === 'uppercase')?.passed).toBe(false);
    });

    it('rejeita senha sem minúscula', () => {
      const res = validateMasterPassword('FOCO#PROTEGIDO2026!');
      expect(res.valid).toBe(false);
      expect(res.errors).toContain('A senha deve conter ao menos 1 letra minúscula.');
      expect(res.criteria.find((c) => c.id === 'lowercase')?.passed).toBe(false);
    });

    it('rejeita senha sem número', () => {
      const res = validateMasterPassword('Foco#Protegido!');
      expect(res.valid).toBe(false);
      expect(res.errors).toContain('A senha deve conter ao menos 1 número.');
      expect(res.criteria.find((c) => c.id === 'digit')?.passed).toBe(false);
    });

    it('rejeita senha sem caractere especial', () => {
      const res = validateMasterPassword('FocoProtegido2026');
      expect(res.valid).toBe(false);
      expect(res.errors).toContain('A senha deve conter ao menos 1 caractere especial (!@#$%&*).');
      expect(res.criteria.find((c) => c.id === 'special')?.passed).toBe(false);
    });

    it('rejeita senha comum proibida ou contendo o nome do ajudante', () => {
      const resNome = validateMasterPassword('Beatriz#2026!', { partnerName: 'Beatriz' });
      expect(resNome.valid).toBe(false);
      expect(resNome.errors).toContain('A senha não pode conter sequências óbvias ou o nome do ajudante.');

      const resComum = validateMasterPassword('Password123!');
      expect(resComum.valid).toBe(false);
      expect(resComum.criteria.find((c) => c.id === 'nonTrivial')?.passed).toBe(false);
    });

    it('formata mensagem HTML com checklist indicando acertos e falhas', () => {
      const res = validateMasterPassword('fraca123');
      const formatted = formatPasswordChecklistMessage(res);
      expect(formatted).toContain('⚠️ <b>A senha não atende aos critérios de segurança forte:</b>');
      expect(formatted).toContain('❌ Ao menos 1 letra maiúscula (A-Z)');
      expect(formatted).toContain('❌ Ao menos 1 caractere especial (!@#$%&*)');
      expect(formatted).toContain('/senha &lt;sua_senha&gt;');
    });
  });
});
