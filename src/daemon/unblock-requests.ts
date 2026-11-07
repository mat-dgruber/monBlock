/**
 * Pedidos de liberação ao Ajudante (T1 da spec 2026-11-06-telegram-gestao-envio-respostas-design.md).
 * Funções puras sobre a lista persistida: nenhuma delas faz I/O, então cada transição pode ser gravada
 * junto com o resto do estado num único `save` atômico.
 */
import crypto from 'node:crypto';

export type UnblockRequestStatus = 'PENDING' | 'APPROVED' | 'DENIED' | 'EXPIRED';

export interface UnblockRequest {
  id: string;
  domain: string;
  reason: string;
  ruleLabel: string;
  /** 15 ou 60 (a aprovação "Permanente" só volta na T2, com segunda confirmação). */
  requestedMinutes: number;
  status: UnblockRequestStatus;
  createdAtMs: number;
  expiresAtMs: number;
  decidedAtMs?: number;
  /** Minutos efetivamente liberados quando `APPROVED`. */
  grantMinutes?: number;
  delivery: 'sent' | 'failed';
  /** Código de desafio offline mostrado à pessoa quando a entrega falha. */
  challengeCode?: string;
}

export const REQUEST_TTL_MS = 15 * 60_000;
export const MAX_PENDING_REQUESTS = 3;
export const MIN_INTERVAL_BETWEEN_REQUESTS_MS = 2 * 60_000;
const KEEP_FINISHED_MS = 24 * 3600_000;

export interface NewRequestInput {
  domain: string;
  reason: string;
  ruleLabel: string;
  requestedMinutes: number;
  challengeCode?: string;
}

export type CreateResult =
  | { ok: true; request: UnblockRequest; requests: UnblockRequest[] }
  | { ok: false; status: 400 | 429; detail: string };

/** Marca como `EXPIRED` o que passou do prazo e descarta o histórico antigo. */
export function expireStale(requests: UnblockRequest[], nowMs: number): UnblockRequest[] {
  return requests
    .map((r) => (r.status === 'PENDING' && nowMs >= r.expiresAtMs ? { ...r, status: 'EXPIRED' as const, decidedAtMs: nowMs } : r))
    .filter((r) => r.status === 'PENDING' || nowMs - (r.decidedAtMs ?? r.createdAtMs) < KEEP_FINISHED_MS);
}

export function createRequest(existing: UnblockRequest[], input: NewRequestInput, nowMs: number): CreateResult {
  const requests = expireStale(existing, nowMs);
  if (input.requestedMinutes === 0) {
    return { ok: false, status: 400, detail: 'A liberação permanente ainda não está disponível por aqui. Escolha 15 minutos ou 1 hora.' };
  }
  if (![15, 60].includes(input.requestedMinutes)) {
    return { ok: false, status: 400, detail: 'Escolha 15 minutos ou 1 hora.' };
  }
  if (!input.domain || !input.reason.trim()) {
    return { ok: false, status: 400, detail: 'Informe o endereço e o motivo do pedido.' };
  }
  const pending = requests.filter((r) => r.status === 'PENDING');
  if (pending.some((r) => r.domain === input.domain)) {
    return { ok: false, status: 429, detail: 'Já existe um pedido pendente para este endereço. Aguarde a resposta do Ajudante.' };
  }
  if (pending.length >= MAX_PENDING_REQUESTS) {
    return { ok: false, status: 429, detail: 'Há pedidos demais aguardando o Ajudante. Espere a resposta antes de pedir de novo.' };
  }
  const last = Math.max(0, ...requests.map((r) => r.createdAtMs));
  if (nowMs - last < MIN_INTERVAL_BETWEEN_REQUESTS_MS) {
    return { ok: false, status: 429, detail: 'Espere um pouco antes de fazer outro pedido (o Ajudante ainda está vendo o anterior).' };
  }
  const request: UnblockRequest = {
    id: `req_${crypto.randomBytes(6).toString('hex')}`,
    domain: input.domain,
    reason: input.reason.trim().slice(0, 300),
    ruleLabel: input.ruleLabel.slice(0, 120),
    requestedMinutes: input.requestedMinutes,
    status: 'PENDING',
    createdAtMs: nowMs,
    expiresAtMs: nowMs + REQUEST_TTL_MS,
    delivery: 'sent',
    ...(input.challengeCode ? { challengeCode: input.challengeCode } : {}),
  };
  return { ok: true, request, requests: [...requests, request] };
}

export type DecisionKind = 'APPROVE_15M' | 'APPROVE_60M' | 'DENY';

export type DecisionResult =
  | { kind: 'applied'; request: UnblockRequest; requests: UnblockRequest[] }
  | { kind: 'expired' | 'already-decided' | 'unknown' };

/**
 * Única transição de estado de um pedido. O prazo é conferido aqui dentro, com o relógio confiável de quem
 * chama: um botão antigo nunca aprova um pedido vencido, mesmo antes de qualquer rotina de expiração rodar.
 */
export function decideRequest(existing: UnblockRequest[], requestId: string, decision: DecisionKind, nowMs: number): DecisionResult {
  const found = existing.find((r) => r.id === requestId);
  if (!found) return { kind: 'unknown' };
  if (found.status === 'EXPIRED') return { kind: 'expired' };
  if (found.status !== 'PENDING') return { kind: 'already-decided' };
  if (nowMs >= found.expiresAtMs) return { kind: 'expired' };

  const next: UnblockRequest =
    decision === 'DENY'
      ? { ...found, status: 'DENIED', decidedAtMs: nowMs }
      : { ...found, status: 'APPROVED', decidedAtMs: nowMs, grantMinutes: decision === 'APPROVE_15M' ? 15 : 60 };
  return { kind: 'applied', request: next, requests: existing.map((r) => (r.id === requestId ? next : r)) };
}
