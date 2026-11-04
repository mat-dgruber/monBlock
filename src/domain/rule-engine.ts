/**
 * Motor de Regras de Bloqueio Web (RuleEngine) do monBlock.
 *
 * Responsável por higienizar URLs sem vazar query strings sensíveis,
 * proteger a allowlist crítica anti-lockout, aplicar precedência estrita
 * (Allowlist > Categorias/Blocklist > Palavras-chave simples e AND)
 * e validar limites operacionais de lote (RN-WEB-01..06).
 */

import { domainToUnicode } from 'node:url';
import { PREDEFINED_CATEGORIES, type CategoryDefinition } from './categories.js';

export { PREDEFINED_CATEGORIES, type CategoryDefinition };

// MARK: - Constantes e Contratos de Domínio

/**
 * Concessão temporária autorizada pelo Ajudante para um domínio específico ou curinga ('*').
 */
export interface TemporaryGrant {
  target: string;
  expiresAtMs: number;
}

/**
 * Limite máximo de domínios permitidos em uma única operação em lote (RN-WEB-04).
 */
export const MAX_BATCH_DOMAINS = 100;

/**
 * Allowlist crítica de infraestrutura que jamais pode ser bloqueada (anti-lockout).
 */
export const CRITICAL_INFRA_ALLOWLIST: ReadonlySet<string> = new Set([
  'localhost',
  '127.0.0.1',
  'api.telegram.org',
  'accounts.google.com',
  'appleid.apple.com',
  'login.microsoftonline.com',
]);

/**
 * Estado consolidado de regras de bloqueio avaliado pelo motor.
 */
export interface RuleEngineState {
  enabledCategories: string[];
  blockedDomains: string[];
  allowlistDomains: string[];
  keywords: string[];
  lockIncognito: boolean;
}

/**
 * Resultado da decisão de bloqueio para uma URL e título de página.
 */
export interface BlockDecision {
  blocked: boolean;
  reason?: 'CATEGORY' | 'CUSTOM_DOMAIN' | 'KEYWORD';
  ruleLabel?: string;
}

// MARK: - Higienização e Validação de Lote

/**
 * Higieniza e normaliza uma URL bruta, removendo credenciais, fragmentos e query strings
 * potencialmente sensíveis (tokens, sessões, PII) e normalizando o prefixo `www.`.
 *
 * @param rawInput URL ou domínio informado.
 * @returns Objeto com `domain` e `cleanUrl` ou `null` se inválido.
 */
export function sanitizeAndNormalizeUrl(
  rawInput: string
): { domain: string; cleanUrl: string } | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProto);
    const rawHost = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const isIpv6 = rawHost.startsWith('[') && rawHost.endsWith(']');
    const domain = isIpv6 ? rawHost : domainToUnicode(rawHost) || rawHost;
    if (
      !domain ||
      (!domain.includes('.') && domain !== 'localhost' && domain !== '127.0.0.1' && !isIpv6)
    ) {
      return null;
    }
    const portSuffix = parsed.port ? `:${parsed.port}` : '';
    const pathname = parsed.pathname === '/' ? '' : parsed.pathname;
    const cleanUrl = `${parsed.protocol}//${domain}${portSuffix}${pathname}`;
    return { domain, cleanUrl };
  } catch {
    return null;
  }
}

/**
 * Valida e normaliza um lote de domínios respeitando o teto `MAX_BATCH_DOMAINS` (RN-WEB-04).
 *
 * @param rawDomains Lista de domínios ou URLs enviada em lote.
 * @returns Resultado da validação com os domínios higienizados ou erro descritivo.
 */
export function validateBatchDomains(rawDomains: string[]): {
  valid: boolean;
  domains: string[];
  error?: string;
} {
  if (rawDomains.length > MAX_BATCH_DOMAINS) {
    return {
      valid: false,
      domains: [],
      error: `Limite máximo de ${MAX_BATCH_DOMAINS} domínios por lote excedido (RN-WEB-04).`,
    };
  }
  const domains: string[] = [];
  for (const item of rawDomains) {
    const normalized = sanitizeAndNormalizeUrl(item);
    if (normalized && !CRITICAL_INFRA_ALLOWLIST.has(normalized.domain)) {
      domains.push(normalized.domain);
    }
  }
  return { valid: true, domains: Array.from(new Set(domains)) };
}

// MARK: - Avaliação de Bloqueio e Precedência

/**
 * Verifica se o host inspecionado corresponde exatamente ao domínio da regra ou a um subdomínio.
 */
function matchesDomain(host: string, ruleDomain: string): boolean {
  const cleanRule = ruleDomain.trim().toLowerCase().replace(/^www\./, '');
  return Boolean(cleanRule) && (host === cleanRule || host.endsWith(`.${cleanRule}`));
}

/**
 * Decodifica percent-encoding de URLs de forma segura (ex.: `institui%C3%A7%C3%A3o` -> `instituição`),
 * evitando que sequências `%XX` quebrem palavras acentuadas no meio durante a análise de fronteira.
 */
function safeDecodeUri(text: string): string {
  return text.replace(/(?:%[0-9A-Fa-f]{2})+/g, (m) => {
    try {
      return decodeURIComponent(m);
    } catch {
      return m;
    }
  });
}

/**
 * Neutraliza contextos cotidianos benignos no título da página (ex.: abreviações de
 * sexta-feira como "sex.", "seg a sex", abreviações de "tit." para título/titular
 * ou campos de formulário "sexo: masculino/feminino") antes de avaliar palavras-chave,
 * prevenindo falsos positivos (RN-WEB-07).
 */
function sanitizeBenignTitleContexts(rawTitle: string): string {
  return rawTitle
    .toLowerCase()
    // Abreviações de calendário em pt-BR ("sex.", "seg a sex", "seg à sex", "seg. a sex.", "sex a dom", "sex, sáb")
    .replace(/\b(?:seg\.?|ter\.?|qua\.?|qui\.?)\s*(?:[aà]|até|-|–)\s*sex\.?(?![\p{L}\p{N}])/gu, ' ')
    .replace(/\bsex\.?\s*(?:[aà]|até|-|–)\s*(?:s[aá]b\.?|dom\.?)(?![\p{L}\p{N}])/gu, ' ')
    .replace(/\b(?:sex|tit|art|cap|inc|prof|dr)\.(?=\s|,|;|:|\/|-|\)|\]|$|\d)/gu, ' ')
    .replace(/\bsex\s*,\s*(?:s[aá]b|dom)\b/gu, ' ')
    // Campos demográficos/cadastrais legítimos
    .replace(
      /\bsexo\s*:?\s*(?:masculino|feminino|biol[oó]gico|m\/f|outro|n[aã]o\s+informado)\b/gu,
      ' '
    );
}

const KEYWORD_REGEX_CACHE = new Map<string, RegExp>();

/**
 * Verifica se um termo de palavra-chave casa por fronteira de palavra inteira Unicode (\p{L}\p{N}),
 * impedindo o "Scunthorpe Problem" em que termos curtos (ex.: "tit", "sex", "anal", "ass", "cum")
 * casam com substrings de palavras legítimas como "instituição", "título", "constituição",
 * "sexta-feira", "unissex", "análise", "canal", "assunto" ou "documento" (RN-WEB-07).
 */
function matchesKeywordWholeWord(haystack: string, term: string): boolean {
  let pattern = KEYWORD_REGEX_CACHE.get(term);
  if (!pattern) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu');
    KEYWORD_REGEX_CACHE.set(term, pattern);
  }
  return pattern.test(haystack);
}

/**
 * Avalia se uma URL e título de aba devem ser bloqueados segundo o estado atual de regras.
 *
 * Ordem de precedência:
 * 1. Allowlist Crítica Anti-Lockout e página local de bloqueio (`127.0.0.1:49152/blocked`).
 * 2. Allowlist do Usuário (`allowlistDomains` — RN-WEB-01).
 * 3. Domínios de Categorias Ativas (`enabledCategories`).
 * 4. Domínios Customizados Bloqueados (`blockedDomains`).
 * 5. Palavras-chave simples e combinadas por vírgula (`AND` — RN-WEB-06).
 *
 * @param input Parâmetros contendo `url`, `title` e `state`.
 * @returns Decisão determinística de bloqueio (`BlockDecision`).
 */
export function evaluateUrlAndTitle(input: {
  url: string;
  title: string;
  state: RuleEngineState;
}): BlockDecision {
  const normalized = sanitizeAndNormalizeUrl(input.url);
  if (!normalized) return { blocked: false };

  const { domain, cleanUrl } = normalized;
  if (
    cleanUrl.startsWith('http://127.0.0.1:49152/blocked') ||
    cleanUrl.startsWith('http://localhost:49152/blocked') ||
    cleanUrl.startsWith('http://127.0.0.1:49152/showcase') ||
    cleanUrl.startsWith('http://localhost:49152/showcase') ||
    cleanUrl.startsWith('http://127.0.0.1:49152/tokens.css') ||
    cleanUrl.startsWith('http://localhost:49152/tokens.css') ||
    cleanUrl.startsWith('http://127.0.0.1:49152/api/') ||
    cleanUrl.startsWith('http://localhost:49152/api/')
  ) {
    return { blocked: false };
  }

  const isLocalLoopback = domain === 'localhost' || domain === '127.0.0.1';
  if (CRITICAL_INFRA_ALLOWLIST.has(domain) && !isLocalLoopback) {
    return { blocked: false };
  }

  // RN-WEB-01: Precedência máxima da Allowlist (whiteWebsites)
  for (const allowed of input.state.allowlistDomains) {
    if (matchesDomain(domain, allowed)) {
      return { blocked: false };
    }
  }

  if (!isLocalLoopback) {
    // Categorias ativas
    for (const catId of input.state.enabledCategories) {
      const cat = PREDEFINED_CATEGORIES.find((c) => c.id === catId);
      if (!cat) continue;
      if (cat.domains.some((d) => matchesDomain(domain, d))) {
        return {
          blocked: true,
          reason: 'CATEGORY',
          ruleLabel: `Categoria: ${cat.namePt}`,
        };
      }
    }

    // Domínios customizados (blackWebsites)
    for (const blocked of input.state.blockedDomains) {
      if (matchesDomain(domain, blocked)) {
        return {
          blocked: true,
          reason: 'CUSTOM_DOMAIN',
          ruleLabel: `Domínio bloqueado: ${blocked.trim().toLowerCase()}`,
        };
      }
    }
  }

  // Palavras-chave simples e combinadas por vírgula (AND — RN-WEB-06) com fronteira de palavra (RN-WEB-07)
  const decodedUrl = safeDecodeUri(cleanUrl).toLowerCase();
  const sanitizedTitle = sanitizeBenignTitleContexts(safeDecodeUri(input.title));
  const haystack = `${decodedUrl} ${sanitizedTitle}`;
  const activeCategoryKeywords = input.state.enabledCategories.flatMap(
    (id) => PREDEFINED_CATEGORIES.find((c) => c.id === id)?.keywords ?? []
  );
  const allKeywords = [...activeCategoryKeywords, ...input.state.keywords];

  for (const rawKw of allKeywords) {
    const terms = rawKw
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    if (terms.length > 0 && terms.every((term) => matchesKeywordWholeWord(haystack, term))) {
      return {
        blocked: true,
        reason: 'KEYWORD',
        ruleLabel:
          terms.length > 1
            ? `Palavra-chave combinada: ${terms.join(',')}`
            : `Palavra-chave: ${terms[0]}`,
      };
    }
  }

  return { blocked: false };
}
