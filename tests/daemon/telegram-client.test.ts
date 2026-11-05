/**
 * @file telegram-client.test.ts
 * @description Suíte TDD (AAA) para o Cliente Resiliente do Bot do Telegram (MOD-02).
 * Valida envio de Raio-X com `has_spoiler: true` e URL sanitizada,
 * retry com backoff exponencial + jitter em falha transitória,
 * abertura do Circuit Breaker após 3 falhas consecutivas com retorno de `fallbackChallengeCode` offline,
 * e validação estrita de `pairedChatId` nos callbacks de aprovação/negação.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  TelegramPartnerClient,
  type TelegramTransportAdapter,
  type TelegramTransportRequest,
  type TelegramTransportResponse,
} from '../../src/daemon/telegram-client.js';

describe('MOD-02: TelegramPartnerClient (Bot API, Resiliência, Raio-X e Callbacks)', () => {
  it('deve enviar pacote Raio-X com has_spoiler: true, URL limpa sem query string e inline_keyboard assinado', async () => {
    // Arrange
    const capturedRequests: TelegramTransportRequest[] = [];
    const transport: TelegramTransportAdapter = {
      send: vi.fn(async (req: TelegramTransportRequest): Promise<TelegramTransportResponse> => {
        capturedRequests.push(req);
        return { ok: true, status: 200, body: { ok: true, result: { message_id: 42 } } };
      }),
    };

    const client = new TelegramPartnerClient({
      botToken: 'test-ephemeral-token-in-ram',
      pairedChatId: '99887766',
      transport,
      sleepFn: async () => {},
    });

    // Act
    const result = await client.sendUnblockRequest({
      requestId: 'req-001',
      url: 'https://www.reddit.com/r/dev?session_token=secret999&cpf=11122233344#comments',
      title: 'Discussão Técnica de Arquitetura',
      ruleLabel: 'Categoria: Redes Sociais & Fóruns',
      userReason: 'Preciso consultar uma thread sobre bug do Electron.',
      challengeCode: 'MB-4821',
    });

    // Assert
    expect(result.delivered).toBe(true);
    expect(result.circuitState).toBe('CLOSED');
    expect(capturedRequests).toHaveLength(1);

    const sent = capturedRequests[0]!;
    expect(sent.timeoutMs).toBe(3000);
    expect(sent.payload.chat_id).toBe('99887766');
    expect(sent.payload.has_spoiler).toBe(true);

    const textContent = String(sent.payload.caption ?? sent.payload.text ?? '');
    expect(textContent).toContain('reddit.com');
    expect(textContent).toContain('https://reddit.com/r/dev');
    expect(textContent).not.toContain('secret999');
    expect(textContent).not.toContain('11122233344');
    expect(textContent).toContain('MB-4821');
    expect(textContent).toContain('Preciso consultar uma thread sobre bug do Electron.');

    const keyboard = (sent.payload.reply_markup as any)?.inline_keyboard?.flat() ?? [];
    const callbackDataList = keyboard.map((btn: any) => btn.callback_data);
    expect(callbackDataList).toEqual([
      'approve_15m:req-001',
      'approve_60m:req-001',
      'approve_permanent:req-001',
      'deny:req-001',
    ]);
  });

  it('deve executar retry com backoff exponencial + jitter em falha transitória (HTTP 503/429) e ter sucesso na tentativa seguinte', async () => {
    // Arrange
    let attempts = 0;
    const delays: number[] = [];
    const transport: TelegramTransportAdapter = {
      send: vi.fn(async (): Promise<TelegramTransportResponse> => {
        attempts += 1;
        if (attempts < 3) {
          return { ok: false, status: 503, body: { ok: false, description: 'Service Unavailable' } };
        }
        return { ok: true, status: 200, body: { ok: true, result: { message_id: 77 } } };
      }),
    };

    const client = new TelegramPartnerClient({
      botToken: 'test-ephemeral-token-in-ram',
      pairedChatId: '99887766',
      transport,
      baseDelayMs: 250,
      sleepFn: async (ms: number) => {
        delays.push(ms);
      },
    });

    // Act
    const result = await client.sendUnblockRequest({
      requestId: 'req-retry-02',
      url: 'https://youtube.com/watch?v=abc',
      title: 'Aula de Algoritmos',
      ruleLabel: 'Categoria: Streaming',
      userReason: 'Aula da pós-graduação.',
      challengeCode: 'MB-7712',
    });

    // Assert
    expect(result.delivered).toBe(true);
    expect(result.circuitState).toBe('CLOSED');
    expect(attempts).toBe(3);
    expect(delays).toHaveLength(2);
    expect(delays[0]).toBeGreaterThanOrEqual(250);
    expect(delays[1]).toBeGreaterThanOrEqual(500);
  });

  it('deve abrir o Circuit Breaker após 3 falhas consecutivas (por 30s) e retornar fallbackChallengeCode offline imediatamente', async () => {
    // Arrange
    let transportCalls = 0;
    let currentTimeMs = 1_000_000;
    const transport: TelegramTransportAdapter = {
      send: vi.fn(async (): Promise<TelegramTransportResponse> => {
        transportCalls += 1;
        throw new Error('ECONNRESET: Telegram unreachable');
      }),
    };

    const client = new TelegramPartnerClient({
      botToken: 'test-ephemeral-token-in-ram',
      pairedChatId: '99887766',
      transport,
      sleepFn: async () => {},
      nowFn: () => currentTimeMs,
    });

    // Act 1: 3 tentativas falham consecutivamente e abrem o circuito
    const firstResult = await client.sendUnblockRequest({
      requestId: 'req-offline-01',
      url: 'https://github.com/org/repo',
      title: 'Repositório Privado',
      ruleLabel: 'Domínio bloqueado',
      userReason: 'Deploy de produção urgente.',
    });

    // Assert 1
    expect(firstResult.delivered).toBe(false);
    expect(firstResult.circuitState).toBe('OPEN');
    expect(firstResult.fallbackChallengeCode).toMatch(/^MB-[A-Z0-9]{4}/);
    expect(transportCalls).toBe(3);

    // Act 2: Chamada subsequente dentro da janela de 30_000ms não deve tocar na rede (short-circuit)
    currentTimeMs += 10_000;
    const shortCircuitedResult = await client.sendUnblockRequest({
      requestId: 'req-offline-02',
      url: 'https://github.com/org/repo',
      title: 'Repositório Privado',
      ruleLabel: 'Domínio bloqueado',
      userReason: 'Segunda tentativa offline.',
      challengeCode: 'MB-9090',
    });

    // Assert 2
    expect(shortCircuitedResult.delivered).toBe(false);
    expect(shortCircuitedResult.circuitState).toBe('OPEN');
    expect(shortCircuitedResult.fallbackChallengeCode).toBe('MB-9090');
    expect(transportCalls).toBe(3); // Nenhuma nova chamada de rede enquanto OPEN

    // Act 3: Após 30_000ms o circuito entra em HALF_OPEN e fecha ao obter sucesso
    currentTimeMs += 25_000;
    expect(client.getCircuitState()).toBe('HALF_OPEN');
  });

  it('deve validar estritamente o pairedChatId no parseAndVerifyCallback e rejeitar callbacks de terceiros não autorizados', () => {
    // Arrange
    const client = new TelegramPartnerClient({
      botToken: 'test-ephemeral-token-in-ram',
      pairedChatId: '99887766',
    });

    // Act
    const unauthorized = client.parseAndVerifyCallback({
      chatId: '11111111',
      callbackData: 'approve_15m:req-001',
    });

    const authorized15m = client.parseAndVerifyCallback({
      chatId: '99887766',
      callbackData: 'approve_15m:req-001',
    });

    const authorized60m = client.parseAndVerifyCallback({
      chatId: '99887766',
      callbackData: 'approve_60m:req-002',
    });

    const authorizedPermanent = client.parseAndVerifyCallback({
      chatId: '99887766',
      callbackData: 'approve_permanent:req-003',
    });

    const authorizedDeny = client.parseAndVerifyCallback({
      chatId: '99887766',
      callbackData: 'deny:req-004',
    });

    // Assert
    expect(unauthorized).toEqual({
      authorized: false,
      error: 'Remetente não autorizado: chatId diverge do Ajudante pareado.',
    });
    expect(authorized15m).toEqual({
      authorized: true,
      decision: '15M',
      requestId: 'req-001',
    });
    expect(authorized60m).toEqual({
      authorized: true,
      decision: '60M',
      requestId: 'req-002',
    });
    expect(authorizedPermanent).toEqual({
      authorized: true,
      decision: 'PERMANENT',
      requestId: 'req-003',
    });
    expect(authorizedDeny).toEqual({
      authorized: true,
      decision: 'DENY',
      requestId: 'req-004',
    });
  });

  it('gera challengeCode de 6 hex, mascara e-mail e trunca título em 120 chars, faz apenas 1 tentativa em HALF_OPEN e não abre circuito por HTTP 400/401/403', async () => {
    const capturedRequests: TelegramTransportRequest[] = [];
    let currentTimeMs = 2_000_000;
    let nextStatus = 400;

    const transport: TelegramTransportAdapter = {
      send: vi.fn(async (req: TelegramTransportRequest): Promise<TelegramTransportResponse> => {
        capturedRequests.push(req);
        return { ok: nextStatus === 200, status: nextStatus };
      }),
    };

    const client = new TelegramPartnerClient({
      botToken: 'test-token',
      pairedChatId: '99887766',
      transport,
      sleepFn: async () => {},
      nowFn: () => currentTimeMs,
    });

    // 1. Erro 400 (cliente) não faz retry nem abre o Circuit Breaker mesmo após 3 chamadas
    for (let i = 0; i < 3; i++) {
      const res400 = await client.sendUnblockRequest({
        requestId: `req-400-${i}`,
        url: 'https://reddit.com/r/typescript',
        title: `Contato confidencial joao.silva@empresa.com.br - ${'X'.repeat(150)}`,
        ruleLabel: 'Categoria: Redes Sociais',
        userReason: 'Pesquisa.',
      });
      expect(res400.delivered).toBe(false);
      expect(res400.circuitState).toBe('CLOSED');
      expect(res400.challengeCode).toMatch(/^MB-[0-9A-F]{6}$/);
    }
    expect(capturedRequests).toHaveLength(3);
    const firstText = String(capturedRequests[0]!.payload.text ?? '');
    expect(firstText).toContain('[EMAIL_REDACTED]');
    expect(firstText).not.toContain('joao.silva@empresa.com.br');

    const titleLine = firstText.split('\n').find((line) => line.startsWith('• Título da Aba: '))!;
    const extractedTitle = titleLine.replace('• Título da Aba: ', '');
    expect(extractedTitle.length).toBeLessThanOrEqual(120);

    // 2. Agora força abertura do circuito com HTTP 503 (3 tentativas em 1 chamada)
    nextStatus = 503;
    const res503 = await client.sendUnblockRequest({
      requestId: 'req-503',
      url: 'https://reddit.com/r/typescript',
      title: 'Teste 503',
      ruleLabel: 'Categoria',
      userReason: 'Teste',
    });
    expect(res503.circuitState).toBe('OPEN');
    expect(capturedRequests).toHaveLength(6); // 3 anteriores + 3 tentativas do 503

    // 3. Avança 30s para entrar em HALF_OPEN: falha deve executar APENAS 1 tentativa de sondagem
    currentTimeMs += 30_000;
    expect(client.getCircuitState()).toBe('HALF_OPEN');
    const probeFail = await client.sendUnblockRequest({
      requestId: 'req-half-open-probe',
      url: 'https://reddit.com/r/typescript',
      title: 'Sondagem HALF_OPEN',
      ruleLabel: 'Categoria',
      userReason: 'Teste probe',
    });
    expect(probeFail.delivered).toBe(false);
    expect(probeFail.circuitState).toBe('OPEN');
    expect(capturedRequests).toHaveLength(7); // Apenas +1 tentativa em HALF_OPEN!
  });

  it('deve enviar convite de pareamento e kit de emergência com formatação adequada', async () => {
    const captured: TelegramTransportRequest[] = [];
    const transport: TelegramTransportAdapter = {
      send: vi.fn(async (req: TelegramTransportRequest): Promise<TelegramTransportResponse> => {
        captured.push(req);
        return { ok: true, status: 200, body: { ok: true } };
      }),
    };

    const client = new TelegramPartnerClient({
      botToken: 'token-123',
      pairedChatId: '12345678',
      transport,
    });

    // 1. Convite de pareamento
    const inviteRes = await client.sendPairingInvitation({
      partnerName: 'Alice',
      userMachineName: 'MacBook do Bob',
    });
    expect(inviteRes.ok).toBe(true);
    expect(captured).toHaveLength(1);
    expect(captured[0]?.endpointUrl).toContain('/sendMessage');
    expect(captured[0]?.payload.chat_id).toBe('12345678');
    expect(captured[0]?.payload.text).toContain('/senha');
    expect(captured[0]?.payload.text).toContain('Alice');
    expect(captured[0]?.payload.parse_mode).toBe('HTML');

    // 2. Kit de emergência
    const kitRes = await client.sendEmergencyKit({
      codes: ['REC-1-AAAAAA', 'REC-2-BBBBBB', 'REC-3-CCCCCC', 'REC-4-DDDDDD', 'REC-5-EEEEEE'],
      partnerName: 'Alice',
    });
    expect(kitRes.ok).toBe(true);
    expect(captured).toHaveLength(2);
    expect(captured[1]?.payload.text).toContain('REC-1-AAAAAA');
    expect(captured[1]?.payload.text).toContain('REC-5-EEEEEE');
    expect(captured[1]?.payload.text).toContain('autossabotagem');
    expect(captured[1]?.payload.parse_mode).toBe('HTML');
  });

  it('deve consultar updates via pollUpdates e extrair senha com timingSafeEqual', async () => {
    const mockUpdates = [
      {
        update_id: 101,
        message: {
          message_id: 55,
          chat: { id: 999999 }, // Chat não autorizado
          text: '/senha SenhaHacker123',
        },
      },
      {
        update_id: 102,
        message: {
          message_id: 56,
          chat: { id: 12345678 }, // Chat correto do Ajudante
          text: '/senha SegredoForte2026',
        },
      },
    ];

    const transport: TelegramTransportAdapter = {
      send: vi.fn(async (req: TelegramTransportRequest): Promise<TelegramTransportResponse> => {
        if (req.endpointUrl.includes('/getUpdates')) {
          return { ok: true, status: 200, body: { ok: true, result: mockUpdates } };
        }
        if (req.endpointUrl.includes('/deleteMessage')) {
          return { ok: true, status: 200, body: { ok: true } };
        }
        return { ok: true, status: 200 };
      }),
    };

    const client = new TelegramPartnerClient({
      botToken: 'token-123',
      pairedChatId: '12345678',
      transport,
    });

    const pollRes = await client.pollUpdates({ offset: 100, timeoutSec: 5 });
    expect(pollRes.ok).toBe(true);
    expect(pollRes.updates).toHaveLength(2);

    // Validação 1: Remetente não autorizado deve ser rejeitado
    const rejectCheck = client.extractPasswordFromUpdate(pollRes.updates[0]!);
    expect(rejectCheck.valid).toBe(false);
    expect(rejectCheck.error).toContain('Remetente não autorizado');

    // Validação 2: Remetente legítimo deve ter a senha extraída
    const validCheck = client.extractPasswordFromUpdate(pollRes.updates[1]!);
    expect(validCheck.valid).toBe(true);
    expect(validCheck.password).toBe('SegredoForte2026');
    expect(validCheck.messageId).toBe(56);

    // Validação 3: deleteMessage
    const delRes = await client.deleteMessage('12345678', 56);
    expect(delRes.ok).toBe(true);

    // Validação 4: pollUpdates com falha de transporte propaga erro
    const failingTransport: TelegramTransportAdapter = {
      send: vi.fn(async () => {
        throw new Error('ETIMEDOUT');
      }),
    };
    const failingClient = new TelegramPartnerClient({
      botToken: 'token-123',
      pairedChatId: '12345678',
      transport: failingTransport,
    });
    const failRes = await failingClient.pollUpdates();
    expect(failRes.ok).toBe(false);
    expect(failRes.updates).toHaveLength(0);
    expect(failRes.error).toBe('ETIMEDOUT');
  });
});
