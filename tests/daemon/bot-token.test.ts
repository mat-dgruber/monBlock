/** T0 (spec 2026-11-06-telegram-gestao-envio-respostas-design.md): configurar o bot sem vazar o token. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MonBlockDaemon } from '../../src/daemon/monblockd.js';
import type { TelegramTransportAdapter, TelegramTransportRequest } from '../../src/daemon/telegram-client.js';
import { TrustedClock } from '../../src/daemon/trusted-clock.js';
import { MacOSPlatformEnforcer } from '../../src/enforcers/platform-enforcer.js';
import { TripleStateStore } from '../../src/storage/state-store.js';

const TOKEN = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw';
const PASSWORD = crypto.randomBytes(9).toString('base64url');

function fakeTransport(username: string | null, calls: TelegramTransportRequest[] = []): TelegramTransportAdapter {
  return {
    send: async (req) => {
      calls.push(req);
      return username
        ? { ok: true, status: 200, body: { ok: true, result: { username } } }
        : { ok: false, status: 401, body: { ok: false } };
    },
  };
}

describe('SET_BOT_TOKEN', () => {
  let tmpDir: string;
  let store: TripleStateStore;

  function build(transport: TelegramTransportAdapter): MonBlockDaemon {
    const hostsPath = path.join(tmpDir, 'hosts');
    fs.writeFileSync(hostsPath, '127.0.0.1 localhost\n', 'utf8');
    return new MonBlockDaemon({
      store,
      enforcer: new MacOSPlatformEnforcer({ hostsPath, commandExecutor: async () => undefined }),
      clock: new TrustedClock({ wallNow: () => 1_700_000_000_000, monoNowMs: () => 0 }),
      telegramTransport: transport,
    });
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'monblock-bot-'));
    store = new TripleStateStore({
      primaryPath: path.join(tmpDir, 'a.json'),
      keychainPath: path.join(tmpDir, 'b.json'),
      sealPath: path.join(tmpDir, 'c.seal'),
      integrityKey: 'bot-test-key',
    });
  });
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  it('valida o formato antes de qualquer chamada de rede', async () => {
    const calls: TelegramTransportRequest[] = [];
    const d = build(fakeTransport('meu_bot', calls));
    const res = await d.handleCommand({ type: 'SET_BOT_TOKEN', token: 'não é um token' });
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('confere o token no getMe, guarda o @username e nunca devolve o token no estado público', async () => {
    const d = build(fakeTransport('meu_bot'));
    const res = await d.handleCommand({ type: 'SET_BOT_TOKEN', token: TOKEN });
    expect(res).toMatchObject({ status: 200, botConfigured: true, botUsername: 'meu_bot' });

    const state = await d.handleCommand({ type: 'GET_STATE' });
    expect(state.status).toBe(200);
    const serialized = JSON.stringify(state);
    expect(serialized).toContain('"configured":true');
    expect(serialized).toContain('meu_bot');
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain('AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw');
  });

  it('token que o Telegram não reconhece é recusado e nada é gravado', async () => {
    const d = build(fakeTransport(null));
    const res = await d.handleCommand({ type: 'SET_BOT_TOKEN', token: TOKEN });
    expect(res.status).toBe(400);
    const state = await d.handleCommand({ type: 'GET_STATE' });
    expect(JSON.stringify(state)).toContain('"configured":false');
  });

  it('com Ajudante pareado, trocar o bot exige a senha dele', async () => {
    const d = build(fakeTransport('meu_bot'));
    await d.handleCommand({ type: 'PAIR_PARTNER', password: PASSWORD, telegramChatId: '111' });
    const denied = await d.handleCommand({ type: 'SET_BOT_TOKEN', token: TOKEN });
    expect(denied.status).toBe(403);
    const wrong = await d.handleCommand({ type: 'SET_BOT_TOKEN', token: TOKEN, currentPartnerPassword: 'errada-demais' });
    expect(wrong.status).toBe(403);
    const ok = await d.handleCommand({ type: 'SET_BOT_TOKEN', token: TOKEN, currentPartnerPassword: PASSWORD });
    expect(ok.status).toBe(200);
  });
});
