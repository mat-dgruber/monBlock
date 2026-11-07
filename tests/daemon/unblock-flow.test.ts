/** T1: pedido → Telegram → botão do Ajudante → liberação (spec 2026-11-06-telegram-gestao-envio-respostas-design.md). */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MonBlockDaemon } from '../../src/daemon/monblockd.js';
import type { TelegramTransportAdapter, TelegramTransportRequest, TelegramUpdate } from '../../src/daemon/telegram-client.js';
import { TrustedClock } from '../../src/daemon/trusted-clock.js';
import { MacOSPlatformEnforcer } from '../../src/enforcers/platform-enforcer.js';
import { TripleStateStore } from '../../src/storage/state-store.js';

const TOKEN = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw';
const CHAT = '42';
const PASSWORD = crypto.randomBytes(9).toString('base64url');
const MIN = 60_000;

describe('fluxo do pedido de liberação', () => {
  let tmpDir: string;
  let hostsPath: string;
  let store: TripleStateStore;
  const t = { wall: 1_700_000_000_000, mono: 0 };
  const calls: TelegramTransportRequest[] = [];
  let updates: TelegramUpdate[] = [];
  let sendOk = true;

  const transport: TelegramTransportAdapter = {
    send: async (req) => {
      calls.push(req);
      if (req.endpointUrl.endsWith('/getMe')) return { ok: true, status: 200, body: { ok: true, result: { username: 'foco_bot' } } };
      if (req.endpointUrl.endsWith('/getUpdates')) {
        const batch = updates;
        updates = [];
        return { ok: true, status: 200, body: { ok: true, result: batch } };
      }
      if (req.endpointUrl.endsWith('/sendMessage') && !sendOk) return { ok: false, status: 400, body: { ok: false } };
      return { ok: true, status: 200, body: { ok: true } };
    },
  };
  const method = (name: string) => calls.filter((c) => c.endpointUrl.endsWith(`/${name}`));
  const advance = (ms: number) => { t.wall += ms; t.mono += ms; };

  function cb(updateId: number, data: string, opts: { chat?: string; from?: string } = {}): TelegramUpdate {
    return {
      update_id: updateId,
      callback_query: {
        id: `cbq-${updateId}`,
        from: { id: opts.from ?? CHAT },
        data,
        message: { message_id: 900 + updateId, chat: { id: opts.chat ?? CHAT } },
      },
    };
  }

  async function setup(): Promise<{ d: MonBlockDaemon; requestId: string }> {
    const d = new MonBlockDaemon({
      store,
      enforcer: new MacOSPlatformEnforcer({ hostsPath, commandExecutor: async () => undefined }),
      clock: new TrustedClock({ wallNow: () => t.wall, monoNowMs: () => t.mono }),
      telegramTransport: transport,
    });
    await d.handleCommand({ type: 'SET_BOT_TOKEN', token: TOKEN });
    await d.handleCommand({ type: 'PAIR_PARTNER', password: PASSWORD, telegramChatId: CHAT });
    await d.handleCommand({ type: 'MUTATE_RULES', password: PASSWORD, rules: { enabledCategories: ['adult'], blockedDomains: ['exemplo-bloqueado.com'], allowlistDomains: [], keywords: [], lockIncognito: true } } as never);
    const res = await d.handleCommand({ type: 'CREATE_UNBLOCK_REQUEST', domain: 'exemplo-bloqueado.com', reason: 'pesquisa do trabalho', durationMinutes: 15, ruleLabel: 'Lista própria' });
    if (res.status !== 200 || !('request' in res)) throw new Error(`pedido não criado: ${JSON.stringify(res)}`);
    return { d, requestId: res.request.id };
  }

  const status = async (d: MonBlockDaemon, id: string) => {
    const res = await d.handleCommand({ type: 'GET_UNBLOCK_REQUEST', requestId: id });
    return 'request' in res ? res.request.status : `HTTP ${res.status}`;
  };
  const hostsBlocks = (domain: string) => fs.readFileSync(hostsPath, 'utf8').includes(domain);

  beforeEach(() => {
    t.wall = 1_700_000_000_000;
    t.mono = 0;
    calls.length = 0;
    updates = [];
    sendOk = true;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'monblock-unblock-'));
    hostsPath = path.join(tmpDir, 'hosts');
    fs.writeFileSync(hostsPath, '127.0.0.1 localhost\n', 'utf8');
    store = new TripleStateStore({
      primaryPath: path.join(tmpDir, 'a.json'),
      keychainPath: path.join(tmpDir, 'b.json'),
      sealPath: path.join(tmpDir, 'c.seal'),
      integrityKey: 'unblock-test-key',
    });
  });
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  it('sem Ajudante pareado, nada é enviado e o pedido é recusado', async () => {
    const d = new MonBlockDaemon({
      store,
      enforcer: new MacOSPlatformEnforcer({ hostsPath, commandExecutor: async () => undefined }),
      clock: new TrustedClock({ wallNow: () => t.wall, monoNowMs: () => t.mono }),
      telegramTransport: transport,
    });
    const res = await d.handleCommand({ type: 'CREATE_UNBLOCK_REQUEST', domain: 'x.com', reason: 'estudo' });
    expect(res.status).toBe(503);
    expect(method('sendMessage')).toHaveLength(0);
  });

  it('envia o pedido ao chat do Ajudante, com os botões de tempo e Permanente', async () => {
    await setup();
    const sent = method('sendMessage')[0]!;
    expect(sent.payload).toMatchObject({ chat_id: CHAT });
    const buttons = JSON.stringify((sent.payload as { reply_markup: unknown }).reply_markup);
    expect(buttons).toContain('approve_15m:');
    expect(buttons).toContain('approve_60m:');
    expect(buttons).toContain('deny:');
    expect(buttons).toContain('approve_permanent:');
  });

  it('o botão do Ajudante libera o endereço por 15 min, edita a mensagem e responde o clique', async () => {
    const { d, requestId } = await setup();
    expect(hostsBlocks('exemplo-bloqueado.com')).toBe(true);
    await d.handleTelegramUpdate(cb(10, `approve_15m:${requestId}`));
    expect(await status(d, requestId)).toBe('APPROVED');
    expect(hostsBlocks('exemplo-bloqueado.com')).toBe(false);
    expect(method('answerCallbackQuery')).toHaveLength(1);
    expect(method('editMessageText')[0]!.payload).toMatchObject({ chat_id: CHAT, reply_markup: { inline_keyboard: [] } });
    // a liberação acaba no prazo e o bloqueio volta
    advance(16 * MIN);
    await d.tick();
    expect(hostsBlocks('exemplo-bloqueado.com')).toBe(true);
  });

  it('quem não é o Ajudante (outro chat, grupo ou outro usuário) não libera nada', async () => {
    const { d, requestId } = await setup();
    await d.handleTelegramUpdate(cb(11, `approve_15m:${requestId}`, { chat: '999', from: '999' }));
    await d.handleTelegramUpdate(cb(12, `approve_15m:${requestId}`, { chat: CHAT, from: '777' })); // alguém no mesmo chat/grupo
    expect(await status(d, requestId)).toBe('PENDING');
    expect(hostsBlocks('exemplo-bloqueado.com')).toBe(true);
  });

  it('botão antigo não aprova pedido vencido, e tocar duas vezes não duplica a liberação', async () => {
    const { d, requestId } = await setup();
    advance(16 * MIN);
    await d.handleTelegramUpdate(cb(13, `approve_60m:${requestId}`));
    expect(await status(d, requestId)).toBe('EXPIRED');
    expect(hostsBlocks('exemplo-bloqueado.com')).toBe(true);

    t.wall = 1_700_000_000_000 + 40 * MIN;
    t.mono = 40 * MIN;
    const second = await d.handleCommand({ type: 'CREATE_UNBLOCK_REQUEST', domain: 'exemplo-bloqueado.com', reason: 'de novo', durationMinutes: 60 });
    if (!('request' in second)) throw new Error('segundo pedido não criado');
    await d.handleTelegramUpdate(cb(14, `approve_60m:${second.request.id}`));
    await d.handleTelegramUpdate(cb(15, `approve_60m:${second.request.id}`));
    const state = await d.handleCommand({ type: 'GET_STATE' });
    const grants = state.status === 200 && 'state' in state ? state.state.temporaryGrants : [];
    expect(grants.filter((g) => g.target === 'exemplo-bloqueado.com')).toHaveLength(1);
    expect(method('answerCallbackQuery').some((c) => JSON.stringify(c.payload).includes('já foi respondido'))).toBe(true);
  });

  it('"Negar" fecha o pedido sem liberar', async () => {
    const { d, requestId } = await setup();
    await d.handleTelegramUpdate(cb(17, `deny:${requestId}`));
    expect(await status(d, requestId)).toBe('DENIED');
    expect(hostsBlocks('exemplo-bloqueado.com')).toBe(true);
  });

  const allowlist = () => (store.loadAndReconcile().state.rules.allowlistDomains);

  it('Permanente: o 1º toque só pergunta; o 2º libera para sempre e reaplica as regras', async () => {
    const { d, requestId } = await setup();
    await d.handleTelegramUpdate(cb(16, `approve_permanent:${requestId}`));
    expect(await status(d, requestId)).toBe('PENDING');
    expect(allowlist()).toEqual([]);
    expect(hostsBlocks('exemplo-bloqueado.com')).toBe(true);
    expect(JSON.stringify(method('editMessageText')[0]!.payload)).toContain(`confirm_permanent:${requestId}`);
    await d.handleTelegramUpdate(cb(17, `confirm_permanent:${requestId}`));
    expect(await status(d, requestId)).toBe('APPROVED');
    expect(allowlist()).toEqual(['exemplo-bloqueado.com']);
    expect(hostsBlocks('exemplo-bloqueado.com')).toBe(false);
    // continua liberado depois de muito tempo (não é concessão temporária)
    advance(48 * 60 * MIN);
    await d.tick();
    expect(hostsBlocks('exemplo-bloqueado.com')).toBe(false);
  });

  it('Permanente: confirmar sem o 1º toque, ou cancelar, não libera nada', async () => {
    const { d, requestId } = await setup();
    await d.handleTelegramUpdate(cb(16, `confirm_permanent:${requestId}`));
    expect(await status(d, requestId)).toBe('PENDING');
    expect(allowlist()).toEqual([]);
    await d.handleTelegramUpdate(cb(17, `approve_permanent:${requestId}`));
    await d.handleTelegramUpdate(cb(18, `cancel:${requestId}`));
    expect(await status(d, requestId)).toBe('DENIED');
    expect(allowlist()).toEqual([]);
    expect(hostsBlocks('exemplo-bloqueado.com')).toBe(true);
  });

  it('Permanente: outro chat não confirma e o 2º toque repetido não duplica a entrada', async () => {
    const { d, requestId } = await setup();
    await d.handleTelegramUpdate(cb(16, `approve_permanent:${requestId}`));
    await d.handleTelegramUpdate(cb(17, `confirm_permanent:${requestId}`, { chat: '999', from: '999' }));
    expect(allowlist()).toEqual([]);
    await d.handleTelegramUpdate(cb(18, `confirm_permanent:${requestId}`));
    await d.handleTelegramUpdate(cb(19, `confirm_permanent:${requestId}`));
    expect(allowlist()).toEqual(['exemplo-bloqueado.com']);
  });

  it('Permanente: recusa endereço IP e respeita o limite de 3 por dia', async () => {
    const { d, requestId } = await setup();
    // limite: já há 3 liberações nas últimas 24 h
    const st = store.loadAndReconcile().state;
    store.save({ ...st, permanentReleases: [1, 2, 3].map((n) => ({ domain: `x${n}.com`, requestId: `r${n}`, atMs: t.wall - n * MIN })) });
    await d.handleTelegramUpdate(cb(16, `approve_permanent:${requestId}`));
    await d.handleTelegramUpdate(cb(17, `confirm_permanent:${requestId}`));
    expect(await status(d, requestId)).toBe('DENIED');
    expect(allowlist()).toEqual([]);
    expect(hostsBlocks('exemplo-bloqueado.com')).toBe(true);
  });

  it('pedir Permanente exige motivo de verdade e já nasce como pedido permanente', async () => {
    const { d } = await setup();
    advance(3 * MIN);
    const curto = await d.handleCommand({ type: 'CREATE_UNBLOCK_REQUEST', domain: 'outro-site.com', reason: 'curto', durationMinutes: 0, ruleLabel: 'x' });
    expect(curto.status).toBe(400);
    const ok = await d.handleCommand({ type: 'CREATE_UNBLOCK_REQUEST', domain: 'outro-site.com', reason: 'é o site da minha faculdade', durationMinutes: 0, ruleLabel: 'x' });
    expect(ok.status).toBe(200);
  });

  it('limites: um pedido pendente por endereço e intervalo mínimo entre pedidos', async () => {
    const { d } = await setup();
    const same = await d.handleCommand({ type: 'CREATE_UNBLOCK_REQUEST', domain: 'exemplo-bloqueado.com', reason: 'outra vez' });
    expect(same.status).toBe(429);
    const other = await d.handleCommand({ type: 'CREATE_UNBLOCK_REQUEST', domain: 'outro-site.com', reason: 'outro' });
    expect(other.status).toBe(429); // menos de 2 min desde o anterior
    advance(3 * MIN);
    const later = await d.handleCommand({ type: 'CREATE_UNBLOCK_REQUEST', domain: 'outro-site.com', reason: 'outro' });
    expect(later.status).toBe(200);
  });

  it('falha de entrega devolve o código offline à página e nunca finge que enviou', async () => {
    sendOk = false;
    const { d, requestId } = await setup();
    const res = await d.handleCommand({ type: 'GET_UNBLOCK_REQUEST', requestId });
    expect(res).toMatchObject({ status: 200, request: { delivery: 'failed', status: 'PENDING' } });
    if (!('request' in res)) throw new Error('sem pedido');
    expect(res.request.fallbackChallengeCode).toMatch(/^MB-[0-9A-F]{6}$/);
  });

  it('o broker lê os botões, persiste o offset e o reutiliza no ciclo seguinte', async () => {
    const { d, requestId } = await setup();
    updates = [cb(20, `deny:${requestId}`)];
    expect(await d.pollTelegramOnce(0)).toBe('ok');
    expect(await status(d, requestId)).toBe('DENIED');
    calls.length = 0;
    await d.pollTelegramOnce(0);
    expect(method('getUpdates')[0]!.payload).toMatchObject({ offset: 21 });
  });

  it('reinício do daemon no meio do pedido: o pedido sobrevive, libera uma vez e o offset não volta', async () => {
    const { d, requestId } = await setup();
    // novo processo sobre o mesmo cofre
    const d2 = new MonBlockDaemon({
      store,
      enforcer: new MacOSPlatformEnforcer({ hostsPath, commandExecutor: async () => undefined }),
      clock: new TrustedClock({ wallNow: () => t.wall, monoNowMs: () => t.mono }),
      telegramTransport: transport,
    });
    expect(await status(d2, requestId)).toBe('PENDING');
    updates = [cb(30, `approve_15m:${requestId}`)];
    expect(await d2.pollTelegramOnce(0)).toBe('ok');
    expect(await status(d2, requestId)).toBe('APPROVED');
    // o mesmo botão reentregue após outro reinício não duplica nada
    const grantsBefore = JSON.stringify((store.loadAndReconcile().state as { temporaryGrants?: unknown }).temporaryGrants);
    updates = [cb(30, `approve_15m:${requestId}`)];
    await d.pollTelegramOnce(0);
    expect(JSON.stringify((store.loadAndReconcile().state as { temporaryGrants?: unknown }).temporaryGrants)).toBe(grantsBefore);
  });
});
