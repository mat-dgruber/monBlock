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
  has_spoiler?: boolean;
  parse_mode?: 'HTML' | 'MarkdownV2';
  reply_markup?: {
    inline_keyboard: InlineKeyboardButton[][];
  };
  [key: string]: unknown;
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number | string };
    from?: { id: number | string; username?: string; first_name?: string };
    text?: string;
  };
  callback_query?: {
    id: string;
    from: { id: number | string };
    data?: string;
    message?: { message_id: number; chat: { id: number | string } };
  };
  [key: string]: unknown;
}

export interface TelegramTransportRequest {
  endpointUrl: string;
  timeoutMs: number;
  payload: TelegramMessagePayload | Record<string, unknown>;
}

export interface TelegramTransportResponse {
  ok: boolean;
  status: number;
  body?: unknown;
  /** Cabeçalho `Date` da resposta TLS (âncora do `TrustedClock`). */
  serverDate?: string;
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
      serverDate: response.headers.get('date') ?? undefined,
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
  onServerDate?: (date: string) => void;
}

/**
 * Gera um código de desafio curto no formato `MB-XXXXXX` (6 caracteres hexadecimais maiúsculos)
 * para uso no fluxo de Desafio-Resposta Offline (`HMAC-SHA256`), compatível com `MB-[0-9A-F]{4,8}`.
 */
export function generateShortChallengeCode(): string {
  const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `MB-${randomHex}`;
}

function escapeTelegramHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
    this.pairedChatId = (options.pairedChatId ?? '').trim();
    const transport = options.transport ?? new NativeFetchTelegramTransport();
    const onServerDate = options.onServerDate;
    this.transport = onServerDate
      ? {
          send: async (request) => {
            const res = await transport.send(request);
            if (res.serverDate) onServerDate(res.serverDate);
            return res;
          },
        }
      : transport;
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
    const sanitizedTitle =
      input.title
        .trim()
        .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_REDACTED]')
        .slice(0, 120) || '(sem título)';
    const xraySummary = [
      '🛡️ [monBlock — Pedido de Desbloqueio Raio-X]',
      `• Domínio: ${normalized.domain}`,
      `• URL Limpa: ${normalized.cleanUrl}`,
      `• Título da Aba: ${sanitizedTitle}`,
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
    const effectiveMaxAttempts = currentState === 'HALF_OPEN' ? 1 : this.maxAttempts;

    for (let attempt = 1; attempt <= effectiveMaxAttempts; attempt++) {
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
        if (isRetryableHttp) {
          this.recordFailure(this.nowFn());
        }
        if (
          !isRetryableHttp ||
          attempt === effectiveMaxAttempts ||
          this.getCircuitState() === 'OPEN'
        ) {
          break;
        }
      } catch {
        this.recordFailure(this.nowFn());
        if (attempt === effectiveMaxAttempts || this.getCircuitState() === 'OPEN') {
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
    const candidateChatId = params.chatId?.trim() ?? '';
    const candidateBuf = Buffer.from(candidateChatId, 'utf8');
    const expectedBuf = Buffer.from(this.pairedChatId, 'utf8');
    if (
      !candidateChatId ||
      !this.pairedChatId ||
      candidateBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(candidateBuf, expectedBuf)
    ) {
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

  /**
   * Envia o convite de pareamento ao Ajudante solicitando a definição da Senha Mestra via `/senha <senha>`.
   */
  async sendPairingInvitation(params: {
    partnerName: string;
    userMachineName?: string;
    chatId?: string;
  }): Promise<{ ok: boolean; status: number; error?: string }> {
    const targetChatId = (params.chatId ?? this.pairedChatId).trim();
    if (!targetChatId || !this.botToken) {
      return { ok: false, status: 400, error: 'Chat ID do Telegram ou Bot Token não configurados.' };
    }

    const invitationText = [
      '🛡️ <b>monBlock — Convite de Ajudante de Foco (CCAT)</b>',
      '',
      `Olá, <b>${escapeTelegramHtml(params.partnerName)}</b>!`,
      `Você foi convidado(a) para ser o(a) <b>Ajudante de Foco</b> no computador ${params.userMachineName ? `("${escapeTelegramHtml(params.userMachineName)}")` : ''} de quem confia em você.`,
      '',
      'Para concluir o pareamento e ativar a proteção contra distrações, defina a <b>Senha Mestra</b> respondendo a esta mensagem com:',
      '👉 <code>/senha &lt;sua_senha&gt;</code>',
      '<i>(Exemplo: <code>/senha FocoProtegido2026</code> — mínimo 6 caracteres)</i>',
      '',
      '⚠️ <b>Guarde esta senha com você.</b> O usuário no computador NÃO terá acesso a ela. Ela será solicitada caso você precise autorizar alterações extremas ou desinstalar o guardião.',
    ].join('\n');

    const endpointUrl = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    try {
      const res = await this.transport.send({
        endpointUrl,
        timeoutMs: this.timeoutMs,
        payload: {
          chat_id: targetChatId,
          text: invitationText,
          parse_mode: 'HTML',
        },
      });
      return { ok: res.ok, status: res.status };
    } catch (err: unknown) {
      return { ok: false, status: 500, error: (err as Error)?.message ?? 'Falha de rede.' };
    }
  }

  /**
   * Envia os 5 Códigos de Emergência exclusivamente ao Telegram do Ajudante.
   */
  async sendEmergencyKit(params: {
    codes: string[];
    partnerName?: string;
    chatId?: string;
  }): Promise<{ ok: boolean; status: number; error?: string }> {
    const targetChatId = (params.chatId ?? this.pairedChatId).trim();
    if (!targetChatId || !this.botToken) {
      return { ok: false, status: 400, error: 'Chat ID do Telegram ou Bot Token não configurados.' };
    }

    const codesList = params.codes
      .map((code, idx) => `🔑 Chave ${idx + 1}: <code>${escapeTelegramHtml(code)}</code>`)
      .join('\n');

    const emergencyKitText = [
      '🚨 <b>monBlock — Kit Exclusivo de Códigos de Emergência (Offline)</b>',
      '',
      '✅ <b>Senha Mestra configurada e Proteção Ativa!</b>',
      '',
      'Abaixo estão os seus <b>5 Códigos de Recuperação de Emergência</b> de uso único. Guarde-os em local seguro:',
      '',
      codesList,
      '',
      '📌 <b>Como funciona:</b> Se a internet cair e o usuário precisar urgentemente de acesso a um site bloqueado de trabalho/estudo, você pode ditar uma destas chaves. Cada chave libera 1 site por 1 hora.',
      '⚠️ <b>Importante:</b> O usuário NÃO tem acesso a essas chaves no computador dele para evitar autossabotagem.',
    ].join('\n');

    const endpointUrl = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    try {
      const res = await this.transport.send({
        endpointUrl,
        timeoutMs: this.timeoutMs,
        payload: {
          chat_id: targetChatId,
          text: emergencyKitText,
          parse_mode: 'HTML',
        },
      });
      return { ok: res.ok, status: res.status };
    } catch (err: unknown) {
      return { ok: false, status: 500, error: (err as Error)?.message ?? 'Falha de rede.' };
    }
  }

  /** Aviso em texto puro ao Ajudante (inatividade do daemon, adulteração detectada). */
  async sendAlert(text: string, chatId?: string): Promise<{ ok: boolean }> {
    const targetChatId = (chatId ?? this.pairedChatId).trim();
    if (!targetChatId || !this.botToken) return { ok: false };
    try {
      const res = await this.transport.send({
        endpointUrl: `https://api.telegram.org/bot${this.botToken}/sendMessage`,
        timeoutMs: this.timeoutMs,
        payload: { chat_id: targetChatId, text },
      });
      return { ok: res.ok };
    } catch {
      return { ok: false };
    }
  }

  /** `getMe` barato: serve para ancorar o `TrustedClock` no cabeçalho `Date`. */
  async ping(): Promise<{ ok: boolean }> {
    if (!this.botToken) return { ok: false };
    try {
      const res = await this.transport.send({
        endpointUrl: `https://api.telegram.org/bot${this.botToken}/getMe`,
        timeoutMs: this.timeoutMs,
        payload: {},
      });
      return { ok: res.ok };
    } catch {
      return { ok: false };
    }
  }

  /**
   * Consulta novas atualizações do Telegram via long-polling (`getUpdates`).
   */
  async pollUpdates(params?: {
    offset?: number;
    timeoutSec?: number;
  }): Promise<{ ok: boolean; updates: TelegramUpdate[]; error?: string }> {
    if (!this.botToken) return { ok: false, updates: [], error: 'Bot token não configurado.' };

    const endpointUrl = `https://api.telegram.org/bot${this.botToken}/getUpdates`;
    try {
      const res = await this.transport.send({
        endpointUrl,
        timeoutMs: ((params?.timeoutSec ?? 0) + 5) * 1000,
        payload: {
          offset: params?.offset,
          timeout: params?.timeoutSec ?? 0,
        },
      });
      if (res.ok && res.body && typeof res.body === 'object' && 'result' in res.body) {
        const updates = Array.isArray((res.body as { result: unknown }).result)
          ? ((res.body as { result: unknown[] }).result as TelegramUpdate[])
          : [];
        return { ok: true, updates };
      }
      return { ok: false, updates: [], error: `Resposta inválida da API (${res.status})` };
    } catch (err: unknown) {
      return { ok: false, updates: [], error: (err as Error)?.message ?? 'Falha de rede na consulta de atualizações.' };
    }
  }

  /**
   * Apaga a mensagem contendo a senha do chat no Telegram para redução de rastros.
   */
  async deleteMessage(chatId: string, messageId: number): Promise<{ ok: boolean }> {
    if (!this.botToken) return { ok: false };
    const endpointUrl = `https://api.telegram.org/bot${this.botToken}/deleteMessage`;
    try {
      const res = await this.transport.send({
        endpointUrl,
        timeoutMs: this.timeoutMs,
        payload: {
          chat_id: chatId,
          message_id: messageId,
        },
      });
      return { ok: res.ok };
    } catch {
      return { ok: false };
    }
  }

  /**
   * Valida com timingSafeEqual e extrai senha de um update se originado do Ajudante.
   */
  extractPasswordFromUpdate(
    update: TelegramUpdate,
    expectedChatId?: string
  ): { valid: boolean; password?: string; messageId?: number; error?: string } {
    const message = update.message;
    if (!message || !message.text) {
      return { valid: false, error: 'Atualização não contém texto de mensagem.' };
    }

    const candidateChatId = String(message.chat.id).trim();
    const targetChatId = (expectedChatId ?? this.pairedChatId).trim();
    const candidateBuf = Buffer.from(candidateChatId, 'utf8');
    const targetBuf = Buffer.from(targetChatId, 'utf8');

    if (
      !candidateChatId ||
      !targetChatId ||
      candidateBuf.length !== targetBuf.length ||
      !crypto.timingSafeEqual(candidateBuf, targetBuf)
    ) {
      return { valid: false, error: 'Remetente não autorizado: Chat ID diverge do esperado.' };
    }

    const match = message.text.trim().match(/^\/(?:senha|password)(?:\s+(.+))?$/i);
    if (!match) {
      return { valid: false, error: 'Mensagem não é um comando /senha válido.' };
    }

    const rawPassword = match[1]?.trim();
    if (!rawPassword || rawPassword.length < 6) {
      return { valid: false, error: 'A senha precisa ter no mínimo 6 caracteres.' };
    }

    return {
      valid: true,
      password: rawPassword,
      messageId: message.message_id,
    };
  }

  private recordFailure(now = this.nowFn()): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.failureThreshold) {
      this.circuitOpenedAtMs = now;
    }
  }
}
