/**
 * @file telegram-client.ts
 * @description Cliente Resiliente da Bot API do Telegram (MOD-02) para o Ajudante.
 * Implementa envio do pacote Raio-X com `has_spoiler: true` e higienização Zero-PII,
 * timeout explícito de 3000ms (`AbortSignal.timeout(3000)`), retry com backoff exponencial + jitter,
 * Circuit Breaker (abre após 3 falhas consecutivas por 30s) com fallback automático para
 * Desafio-Resposta Offline (`MB-XXXX`) e validação estrita de `pairedChatId` em callbacks.
 */

import crypto from 'node:crypto';
import { sanitizeAndNormalizeUrl } from '../domain/rule-engine.js';

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export type PartnerCallbackDecision = '15M' | '60M' | 'PERMANENT' | 'DENY';

export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

export interface TelegramMessagePayload {
  chat_id: string;
  text?: string;
  caption?: string;
  photo?: string;
  has_spoiler: boolean;
  parse_mode?: 'HTML' | 'MarkdownV2';
  reply_markup: {
    inline_keyboard: InlineKeyboardButton[][];
  };
}

export interface TelegramTransportRequest {
  endpointUrl: string;
  timeoutMs: number;
  payload: TelegramMessagePayload;
}

export interface TelegramTransportResponse {
  ok: boolean;
  status: number;
  body?: unknown;
}

export interface TelegramTransportAdapter {
  send(request: TelegramTransportRequest): Promise<TelegramTransportResponse>;
}

/**
 * Implementação padrão de transporte usando `fetch` nativo do Node 22+
 * e `AbortSignal.timeout(3000)` sem dependências externas.
 */
export class NativeFetchTelegramTransport implements TelegramTransportAdapter {
  async send(request: TelegramTransportRequest): Promise<TelegramTransportResponse> {
    const response = await fetch(request.endpointUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(request.payload),
      signal: AbortSignal.timeout(request.timeoutMs),
    });
    const body = await response.json().catch(() => null);
    return {
      ok: response.ok,
      status: response.status,
      body,
    };
  }
}

export interface UnblockRequestInput {
  requestId: string;
  url: string;
  title: string;
  ruleLabel: string;
  userReason: string;
  challengeCode?: string;
  blurredSnapshotRef?: string;
}

export interface UnblockRequestDeliveryResult {
  delivered: boolean;
  circuitState: CircuitBreakerState;
  challengeCode: string;
  fallbackChallengeCode?: string;
  sanitizedDomain: string;
  sanitizedUrl: string;
}

export interface CallbackVerificationResult {
  authorized: boolean;
  decision?: PartnerCallbackDecision;
  requestId?: string;
  error?: string;
}

export interface TelegramPartnerClientOptions {
  botToken?: string;
  pairedChatId: string;
  transport?: TelegramTransportAdapter;
  timeoutMs?: number;
  baseDelayMs?: number;
  maxAttempts?: number;
  failureThreshold?: number;
  cooldownMs?: number;
  sleepFn?: (ms: number) => Promise<void>;
  nowFn?: () => number;
}

/**
 * Gera um código de desafio curto no formato `MB-XXXX` (4 caracteres alfanuméricos maiúsculos)
 * para uso no fluxo de Desafio-Resposta Offline (`HMAC-SHA256`).
 */
export function generateShortChallengeCode(): string {
  const randomHex = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `MB-${randomHex}`;
}

export class TelegramPartnerClient {
  private readonly botToken: string;
  private readonly pairedChatId: string;
  private readonly transport: TelegramTransportAdapter;
  private readonly timeoutMs: number;
  private readonly baseDelayMs: number;
  private readonly maxAttempts: number;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly sleepFn: (ms: number) => Promise<void>;
  private readonly nowFn: () => number;

  private consecutiveFailures = 0;
  private circuitOpenedAtMs: number | null = null;

  constructor(options: TelegramPartnerClientOptions) {
    this.botToken = options.botToken ?? process.env.MONBLOCK_TELEGRAM_BOT_TOKEN ?? '';
    this.pairedChatId = options.pairedChatId.trim();
    this.transport = options.transport ?? new NativeFetchTelegramTransport();
    this.timeoutMs = options.timeoutMs ?? 3000;
    this.baseDelayMs = options.baseDelayMs ?? 250;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.failureThreshold = options.failureThreshold ?? 3;
    this.cooldownMs = options.cooldownMs ?? 30_000;
    this.sleepFn =
      options.sleepFn ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.nowFn = options.nowFn ?? (() => Date.now());
  }

  /**
   * Retorna o estado atual do Circuit Breaker avaliando a janela de 30_000ms.
   */
  getCircuitState(): CircuitBreakerState {
    if (this.circuitOpenedAtMs === null) {
      return 'CLOSED';
    }
    const elapsed = this.nowFn() - this.circuitOpenedAtMs;
    if (elapsed >= this.cooldownMs) {
      return 'HALF_OPEN';
    }
    return 'OPEN';
  }

  /**
   * Envia o pacote Raio-X higienizado ao Ajudante com `has_spoiler: true` e teclado inline.
   * Em caso de falha persistente ou circuito aberto, retorna imediatamente `fallbackChallengeCode`.
   */
  async sendUnblockRequest(input: UnblockRequestInput): Promise<UnblockRequestDeliveryResult> {
    const challengeCode = input.challengeCode?.trim() || generateShortChallengeCode();
    const normalized = sanitizeAndNormalizeUrl(input.url) ?? {
      domain: 'dominio-desconhecido.local',
      cleanUrl: 'https://dominio-desconhecido.local',
    };

    const currentState = this.getCircuitState();
    if (currentState === 'OPEN' || !this.botToken) {
      return {
        delivered: false,
        circuitState: 'OPEN',
        challengeCode,
        fallbackChallengeCode: challengeCode,
        sanitizedDomain: normalized.domain,
        sanitizedUrl: normalized.cleanUrl,
      };
    }

    const sanitizedReason = input.userReason.trim().slice(0, 500);
    const xraySummary = [
      '🛡️ [monBlock — Pedido de Desbloqueio Raio-X]',
      `• Domínio: ${normalized.domain}`,
      `• URL Limpa: ${normalized.cleanUrl}`,
      `• Título da Aba: ${input.title.trim() || '(sem título)'}`,
      `• Regra Acionada: ${input.ruleLabel}`,
      `• Justificativa: ${sanitizedReason}`,
      `• Código de Desafio Offline: ${challengeCode}`,
    ].join('\n');

    const payload: TelegramMessagePayload = {
      chat_id: this.pairedChatId,
      text: xraySummary,
      caption: xraySummary,
      ...(input.blurredSnapshotRef ? { photo: input.blurredSnapshotRef } : {}),
      has_spoiler: true,
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Liberar 15 min', callback_data: `approve_15m:${input.requestId}` },
            { text: 'Liberar 1 hora', callback_data: `approve_60m:${input.requestId}` },
          ],
          [
            { text: 'Liberar Permanente', callback_data: `approve_permanent:${input.requestId}` },
            { text: 'Negar Pedido', callback_data: `deny:${input.requestId}` },
          ],
        ],
      },
    };

    const method = input.blurredSnapshotRef ? 'sendPhoto' : 'sendMessage';
    const endpointUrl = `https://api.telegram.org/bot${this.botToken}/${method}`;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const response = await this.transport.send({
          endpointUrl,
          timeoutMs: this.timeoutMs,
          payload,
        });

        if (response.ok) {
          this.consecutiveFailures = 0;
          this.circuitOpenedAtMs = null;
          return {
            delivered: true,
            circuitState: 'CLOSED',
            challengeCode,
            sanitizedDomain: normalized.domain,
            sanitizedUrl: normalized.cleanUrl,
          };
        }

        const isRetryableHttp = response.status === 429 || response.status >= 500;
        this.recordFailure();
        if (!isRetryableHttp || attempt === this.maxAttempts || this.getCircuitState() === 'OPEN') {
          break;
        }
      } catch {
        this.recordFailure();
        if (attempt === this.maxAttempts || this.getCircuitState() === 'OPEN') {
          break;
        }
      }

      // Backoff exponencial (base 250ms * 2^(attempt-1)) + Jitter (0..50ms)
      const jitterMs = Math.floor(Math.random() * 50);
      const backoffMs = this.baseDelayMs * Math.pow(2, attempt - 1) + jitterMs;
      await this.sleepFn(backoffMs);
    }

    return {
      delivered: false,
      circuitState: this.getCircuitState(),
      challengeCode,
      fallbackChallengeCode: challengeCode,
      sanitizedDomain: normalized.domain,
      sanitizedUrl: normalized.cleanUrl,
    };
  }

  /**
   * Valida que o callback veio estritamente do `pairedChatId` do Ajudante
   * e extrai a decisão (`15M`, `60M`, `PERMANENT` ou `DENY`).
   */
  parseAndVerifyCallback(params: {
    chatId: string;
    callbackData: string;
  }): CallbackVerificationResult {
    if (!params.chatId || params.chatId.trim() !== this.pairedChatId) {
      return {
        authorized: false,
        error: 'Remetente não autorizado: chatId diverge do Ajudante pareado.',
      };
    }

    const [rawAction, ...rest] = params.callbackData.trim().split(':');
    const requestId = rest.join(':').trim();
    if (!rawAction || !requestId) {
      return {
        authorized: false,
        error: 'Formato de callback_data inválido.',
      };
    }

    const actionMap: Record<string, PartnerCallbackDecision> = {
      approve_15m: '15M',
      approve_60m: '60M',
      approve_permanent: 'PERMANENT',
      deny: 'DENY',
    };

    const decision = actionMap[rawAction];
    if (!decision) {
      return {
        authorized: false,
        error: `Ação de callback desconhecida: ${rawAction}`,
      };
    }

    return {
      authorized: true,
      decision,
      requestId,
    };
  }

  private recordFailure(): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.failureThreshold) {
      this.circuitOpenedAtMs = this.nowFn();
    }
  }
}
