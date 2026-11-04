/**
 * @file partner-guard.ts
 * @description Guardião criptográfico do Ajudante (PartnerGuard), implementando:
 * 1. Derivação lenta de senha (`crypto.scryptSync`) e comparação em tempo constante (`crypto.timingSafeEqual`).
 * 2. Tokens de desafio-resposta offline (`HMAC-SHA256`) com proteção anti-replay (`RN-LIM-02`).
 * 3. Kit de Emergência de 5 códigos de uso único e Cooldown Time-Lock de 72 horas.
 * 4. Catraca Unidirecional (`Append-Only` — `ADR-0003`) para validação de mutações de regras.
 */

import crypto from 'node:crypto';
import type { RuleEngineState } from './rule-engine.js';

// MARK: - Tipos e Constantes de Domínio

const DURATIONS = ['15m', '60m', 'permanent'] as const;

/** Durações suportadas para concessão de desbloqueio pelo Ajudante. */
export type UnlockDuration = (typeof DURATIONS)[number];

/** Parâmetros para verificação da Catraca Unidirecional Append-Only. */
export interface ProtectionMutationParams {
  current: RuleEngineState;
  next: RuleEngineState;
  partnerAuthorized: boolean;
}

/** Resultado da validação de mutação de regras da Catraca Unidirecional. */
export interface ProtectionMutationResult {
  allowed: boolean;
  reason?: string;
}

// MARK: - Hash e Verificação de Senha Mestra do Ajudante (scrypt + timingSafeEqual)

/**
 * Gera o hash lento da senha do Ajudante com salt criptográfico aleatório de 16 bytes.
 *
 * @param password - Senha em texto plano informada pelo Ajudante.
 * @returns String formatada `scrypt$<salt_hex>$<derived_hex>`.
 */
export function hashPartnerPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto
    .scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 })
    .toString('hex');
  return `scrypt$${salt}$${derived}`;
}

/**
 * Verifica a senha do Ajudante contra o hash armazenado usando comparação em tempo constante.
 *
 * @param password - Senha candidata em texto plano.
 * @param storedHash - Hash persistido no formato `scrypt$<salt>$<derived>`.
 * @returns `true` se a senha corresponder exatamente ao hash armazenado.
 */
export function verifyPartnerPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, expectedHex] = parts;
  if (!salt || !expectedHex || expectedHex.length % 2 !== 0) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  if (expected.length !== 64) return false;
  const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

// MARK: - Tokens HMAC-SHA256 de Desafio-Resposta e Anti-Replay (RN-LIM-02)

/**
 * Gera um token assinado via HMAC-SHA256 vinculado ao código de desafio e à duração de desbloqueio.
 *
 * @param secret - Segredo compartilhado da instalação / Ajudante.
 * @param challengeCode - Código único de desafio da solicitação (ex.: `MB-8492-X7`).
 * @param duration - Duração autorizada (`15m`, `60m` ou `permanent`).
 * @returns Token assinado no formato `UNLOCK-<DURATION>-<MAC10>`.
 */
export function generateChallengeToken(
  secret: string,
  challengeCode: string,
  duration: UnlockDuration
): string {
  const mac = crypto
    .createHmac('sha256', secret)
    .update(`${challengeCode}:${duration}`)
    .digest('hex')
    .slice(0, 10)
    .toUpperCase();
  return `UNLOCK-${duration.toUpperCase()}-${mac}`;
}

/**
 * Valida um token HMAC-SHA256 em tempo constante e registra seu consumo para impedir replay (`RN-LIM-02`).
 *
 * @param params - Objeto contendo `secret`, `challengeCode`, `token` e conjunto `usedTokens`.
 * @returns Objeto indicando se o token é válido e qual a duração autorizada.
 */
export function verifyChallengeToken(params: {
  secret: string;
  challengeCode: string;
  token: string;
  usedTokens: Set<string>;
}): { valid: boolean; duration?: UnlockDuration } {
  const cleanToken = params.token.trim().toUpperCase();
  if (params.usedTokens.has(cleanToken)) {
    return { valid: false };
  }

  for (const duration of DURATIONS) {
    const expected = generateChallengeToken(params.secret, params.challengeCode, duration);
    const a = Buffer.from(cleanToken);
    const b = Buffer.from(expected);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      params.usedTokens.add(cleanToken);
      return { valid: true, duration };
    }
  }
  return { valid: false };
}

// MARK: - Kit de Emergência (5 Códigos de Uso Único) e Cooldown de 72 Horas

/**
 * Gera um kit de recuperação de emergência contendo 5 códigos de uso único e seus respectivos hashes.
 *
 * @returns Par contendo `plainCodes` (exibidos uma única vez) e `hashedCodes` (para persistência).
 */
export function generateRecoveryKit(): { plainCodes: string[]; hashedCodes: string[] } {
  const plainCodes: string[] = [];
  const hashedCodes: string[] = [];
  for (let i = 0; i < 5; i++) {
    const partA = crypto.randomBytes(3).toString('hex').toUpperCase();
    const partB = crypto.randomBytes(3).toString('hex').toUpperCase();
    const raw = `REC-${partA}-${partB}`;
    plainCodes.push(raw);
    hashedCodes.push(hashPartnerPassword(raw));
  }
  return { plainCodes, hashedCodes };
}

/**
 * Avalia o estado do Cooldown de Emergência de 72 horas, mantendo o bloqueio 100% ativo durante a espera.
 *
 * @param startedAtIso - Data/hora ISO-8601 de início do pedido de emergência.
 * @param nowMs - Timestamp atual em milissegundos.
 * @returns Estado de desbloqueio (`unlocked`) e horas restantes arredondadas para cima (`remainingHours`).
 */
export function evaluateEmergencyCooldown(
  startedAtIso: string,
  nowMs: number
): { unlocked: boolean; remainingHours: number } {
  const startMs = Date.parse(startedAtIso);
  if (Number.isNaN(startMs) || Number.isNaN(nowMs)) {
    return { unlocked: false, remainingHours: 72 };
  }
  const cooldownMs = 72 * 3600 * 1000;
  const elapsed = Math.max(0, nowMs - startMs);
  if (elapsed >= cooldownMs) {
    return { unlocked: true, remainingHours: 0 };
  }
  const remainingHours = Math.ceil((cooldownMs - elapsed) / (3600 * 1000));
  return { unlocked: false, remainingHours };
}

// MARK: - Invariante da Catraca Unidirecional Append-Only (ADR-0003)

/**
 * Verifica se uma transição de estado de proteção respeita a Catraca Unidirecional (`Append-Only`).
 * Adicionar domínios, ativar categorias, adicionar keywords ou ativar `lockIncognito: true` é livre;
 * qualquer remoção de proteção, adição à allowlist ou desativação de `lockIncognito` exige `partnerAuthorized: true`.
 *
 * @param params - Estado atual, próximo estado proposto e flag de autorização do Ajudante.
 * @returns Resultado indicando se a mutação é permitida (`allowed`) e o motivo em caso de bloqueio.
 */
export function canMutateProtectionRule(
  params: ProtectionMutationParams
): ProtectionMutationResult {
  if (params.partnerAuthorized) {
    return { allowed: true };
  }

  const normalizeList = (items: string[]): Set<string> =>
    new Set(items.map((item) => item.trim().toLowerCase()).filter(Boolean));

  const currentCategories = normalizeList(params.current.enabledCategories);
  const nextCategories = normalizeList(params.next.enabledCategories);
  for (const cat of currentCategories) {
    if (!nextCategories.has(cat)) {
      return {
        allowed: false,
        reason: `Desativar a categoria '${cat}' exige autorização do Ajudante.`,
      };
    }
  }

  const currentDomains = normalizeList(params.current.blockedDomains);
  const nextDomains = normalizeList(params.next.blockedDomains);
  for (const domain of currentDomains) {
    if (!nextDomains.has(domain)) {
      return {
        allowed: false,
        reason: `Remover o domínio bloqueado '${domain}' exige autorização do Ajudante.`,
      };
    }
  }

  const currentKeywords = normalizeList(params.current.keywords);
  const nextKeywords = normalizeList(params.next.keywords);
  for (const kw of currentKeywords) {
    if (!nextKeywords.has(kw)) {
      return {
        allowed: false,
        reason: `Remover a palavra-chave '${kw}' exige autorização do Ajudante.`,
      };
    }
  }

  const currentAllowlist = normalizeList(params.current.allowlistDomains);
  const nextAllowlist = normalizeList(params.next.allowlistDomains);
  for (const allowedDomain of nextAllowlist) {
    if (!currentAllowlist.has(allowedDomain)) {
      return {
        allowed: false,
        reason: `Adicionar exceção na allowlist ('${allowedDomain}') exige autorização do Ajudante.`,
      };
    }
  }

  if (params.current.lockIncognito && !params.next.lockIncognito) {
    return {
      allowed: false,
      reason: 'Desativar o bloqueio de Modo Anônimo exige autorização do Ajudante.',
    };
  }

  return { allowed: true };
}
