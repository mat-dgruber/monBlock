/**
 * Suíte de testes unitários para o catálogo de categorias e motor de regras (RuleEngine).
 *
 * Cobre RN-WEB-01..06: 11 categorias com Conteúdo Adulto ativo por padrão,
 * higienização de URLs sem query strings sensíveis, proteção da CRITICAL_INFRA_ALLOWLIST,
 * precedência Allowlist > Blocklist, limite de lote MAX_BATCH_DOMAINS = 100 (RN-WEB-04)
 * e palavras-chave simples e combinadas por vírgula AND (RN-WEB-06).
 */

import { describe, it, expect } from 'vitest';
import {
  PREDEFINED_CATEGORIES,
  CRITICAL_INFRA_ALLOWLIST,
  MAX_BATCH_DOMAINS,
  validateBatchDomains,
  sanitizeAndNormalizeUrl,
  evaluateUrlAndTitle,
  type RuleEngineState,
} from '../../src/domain/rule-engine.js';

// MARK: - Testes do Catálogo e Motor de Regras

describe('RuleEngine & Categories (RN-WEB-01..06)', () => {
  it('inclui 11 categorias pré-cadastradas com Conteúdo Adulto ativo por padrão', () => {
    expect(PREDEFINED_CATEGORIES).toHaveLength(11);
    const adult = PREDEFINED_CATEGORIES.find((c) => c.id === 'adult');
    expect(adult?.enabledByDefault).toBe(true);
    const nonAdult = PREDEFINED_CATEGORIES.filter((c) => c.id !== 'adult');
    expect(nonAdult.every((c) => c.enabledByDefault === false)).toBe(true);
  });

  it('higieniza URLs removendo query strings sensíveis e normalizando www.', () => {
    const res = sanitizeAndNormalizeUrl('HTTPS://www.Bet365.com/home?token=secret123#top');
    expect(res).toEqual({
      domain: 'bet365.com',
      cleanUrl: 'https://bet365.com/home',
    });
    expect(sanitizeAndNormalizeUrl('   ')).toBeNull();
    expect(sanitizeAndNormalizeUrl('invalid-host-no-dot')).toBeNull();
  });

  it('nunca bloqueia domínios da allowlist crítica (anti-lockout) nem a página local de bloqueio', () => {
    expect(CRITICAL_INFRA_ALLOWLIST.has('api.telegram.org')).toBe(true);
    expect(CRITICAL_INFRA_ALLOWLIST.has('localhost')).toBe(true);

    const state: RuleEngineState = {
      enabledCategories: ['adult', 'gambling'],
      blockedDomains: ['api.telegram.org', 'localhost'],
      allowlistDomains: [],
      keywords: ['telegram', 'login'],
      lockIncognito: false,
    };
    const decision = evaluateUrlAndTitle({
      url: 'https://api.telegram.org/bot123/sendMessage',
      title: 'Telegram Login',
      state,
    });
    expect(decision.blocked).toBe(false);

    const localBlockedPage = evaluateUrlAndTitle({
      url: 'http://127.0.0.1:49152/blocked?url=https://pornhub.com',
      title: 'Página Pausada',
      state,
    });
    expect(localBlockedPage.blocked).toBe(false);
  });

  it('respeita precedência Allowlist > Blocklist e palavras-chave simples e combinadas por vírgula (AND)', () => {
    const state: RuleEngineState = {
      enabledCategories: ['adult'],
      blockedDomains: ['example-casino.com'],
      allowlistDomains: [' safe.example-casino.com '],
      keywords: ['apostas,bonus', 'roleta-vip'],
      lockIncognito: false,
    };

    expect(
      evaluateUrlAndTitle({
        url: 'https://safe.example-casino.com/docs',
        title: 'Documentação',
        state,
      }).blocked
    ).toBe(false);

    const domainBlock = evaluateUrlAndTitle({
      url: 'https://play.example-casino.com/slots',
      title: 'Jogos',
      state,
    });
    expect(domainBlock).toEqual({
      blocked: true,
      reason: 'CUSTOM_DOMAIN',
      ruleLabel: 'Domínio bloqueado: example-casino.com',
    });

    const catBlock = evaluateUrlAndTitle({
      url: 'https://www.pornhub.com/view',
      title: 'Video',
      state,
    });
    expect(catBlock).toEqual({
      blocked: true,
      reason: 'CATEGORY',
      ruleLabel: 'Categoria: Conteúdo Adulto & Pornografia',
    });

    const kwCombinedMatch = evaluateUrlAndTitle({
      url: 'https://portal-esporte.com/artigo',
      title: 'Melhores apostas com bonus hoje',
      state,
    });
    expect(kwCombinedMatch).toEqual({
      blocked: true,
      reason: 'KEYWORD',
      ruleLabel: 'Palavra-chave combinada: apostas,bonus',
    });

    const kwSimpleMatch = evaluateUrlAndTitle({
      url: 'https://portal-esporte.com/roleta-vip',
      title: 'Artigo de jogos',
      state,
    });
    expect(kwSimpleMatch).toEqual({
      blocked: true,
      reason: 'KEYWORD',
      ruleLabel: 'Palavra-chave: roleta-vip',
    });
  });

  it('valida limite de adição em lote de até MAX_BATCH_DOMAINS = 100 domínios (RN-WEB-04)', () => {
    expect(MAX_BATCH_DOMAINS).toBe(100);
    const validBatch = Array.from({ length: 100 }, (_, i) => `site-${i}.com`);
    const validRes = validateBatchDomains(validBatch);
    expect(validRes.valid).toBe(true);
    expect(validRes.domains).toHaveLength(100);

    const oversizedBatch = Array.from({ length: 101 }, (_, i) => `site-${i}.com`);
    const invalidRes = validateBatchDomains(oversizedBatch);
    expect(invalidRes.valid).toBe(false);
    expect(invalidRes.error).toContain('100');
  });

  it('previne falsos positivos de palavras-chave curtas ("tit", "sex", "anal", "ass", "cum") em substrings de URLs/títulos ("instituição", "sexta", "análise") e abreviações ("sex.", "tit.") (RN-WEB-07)', () => {
    const state: RuleEngineState = {
      enabledCategories: ['adult'],
      blockedDomains: [],
      allowlistDomains: [],
      keywords: ['sex', 'anal', 'tit', 'ass', 'cum'],
      lockIncognito: false,
    };

    // Caso 1: "instituição" (com ou sem acento / URL-encoded), "título", "constituição", "atitude", "assunto", "documento" NÃO devem bloquear
    expect(
      evaluateUrlAndTitle({
        url: 'https://portal.mec.gov.br/instituicao/constituicao/institui%C3%A7%C3%A3o-de-ensino/documento-oficial',
        title: 'Instituição de Ensino — Título de Eleitor, Assunto Acadêmico e Atitude Cidadã (Prof. Tit. Silva)',
        state,
      }).blocked
    ).toBe(false);

    // Caso 2: "sexta-feira", "unissex", "análise" e "canal" NÃO devem ser bloqueados
    expect(
      evaluateUrlAndTitle({
        url: 'https://g1.globo.com/economia/noticia/mercado-fecha-em-alta-nesta-sexta-feira.ghtml',
        title: 'Análise do canal econômico nesta sexta-feira e camiseta unissex',
        state,
      }).blocked
    ).toBe(false);

    // Caso 3: Abreviações de calendário ("sex.", "seg a sex", "sex, sáb e dom") NÃO devem ser bloqueadas
    expect(
      evaluateUrlAndTitle({
        url: 'https://climatempo.com.br/previsao',
        title: 'Previsão para sex. 14/11 | Atendimento de seg a sex das 8h às 18h (sex, sáb e dom)',
        state,
      }).blocked
    ).toBe(false);

    // Caso 4: Formulário cadastral/médico ("Sexo: Masculino") NÃO deve ser bloqueado
    expect(
      evaluateUrlAndTitle({
        url: 'https://gov.br/cadastro',
        title: 'Ficha Cadastral - Sexo: Masculino / Sexo Feminino',
        state,
      }).blocked
    ).toBe(false);

    // Caso 5: Uso explícito real de "sex" ou "tit" como palavra inteira isolada na URL ou título DEVE bloquear
    expect(
      evaluateUrlAndTitle({
        url: 'https://unknown-tube.org/free-sex-videos',
        title: 'Watch Live Sex Cams',
        state,
      })
    ).toEqual({
      blocked: true,
      reason: 'KEYWORD',
      ruleLabel: 'Palavra-chave: sex',
    });

    expect(
      evaluateUrlAndTitle({
        url: 'https://some-image-board.org/gallery/tit-pics',
        title: 'Gallery',
        state,
      })
    ).toEqual({
      blocked: true,
      reason: 'KEYWORD',
      ruleLabel: 'Palavra-chave: tit',
    });
  });
});
