/** T0b: pareamento do Ajudante por link `t.me/<bot>?start=<código>` (sem digitar Chat ID). */
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

describe('INITIATE_PAIRING_LINK', () => {
  let tmpDir: string;
  let store: TripleStateStore;
  const sent: TelegramTransportRequest[] = [];
  let updates: TelegramUpdate[] = [];

  const transport: TelegramTransportAdapter = {
    send: async (req) => {
      sent.push(req);
      if (req.endpointUrl.endsWith('/getMe')) return { ok: true, status: 200, body: { ok: true, result: { username: 'foco_bot' } } };
      if (req.endpointUrl.endsWith('/getUpdates')) {
        const batch = updates;
        updates = [];
        return { ok: true, status: 200, body: { ok: true, result: batch } };
      }
      return { ok: true, status: 200, body: { ok: true } };
    },
  };

  function build(): MonBlockDaemon {
    const hostsPath = path.join(tmpDir, 'hosts');
    fs.writeFileSync(hostsPath, '127.0.0.1 localhost\n', 'utf8');
    return new MonBlockDaemon({
      store,
      enforcer: new MacOSPlatformEnforcer({ hostsPath, commandExecutor: async () => undefined }),
      clock: new TrustedClock({ wallNow: () => 1_700_000_000_000, monoNowMs: () => 0 }),
      telegramTransport: transport,
    });
  }

  const start = (id: number, chatId: number, text: string, type = 'private'): TelegramUpdate => ({
    update_id: id,
    message: { message_id: id, chat: { id: chatId, type }, from: { id: chatId }, text },
  });

  beforeEach(() => {
    sent.length = 0;
    updates = [];
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'monblock-link-'));
    store = new TripleStateStore({
      primaryPath: path.join(tmpDir, 'a.json'),
      keychainPath: path.join(tmpDir, 'b.json'),
      sealPath: path.join(tmpDir, 'c.seal'),
      integrityKey: 'link-test-key',
    });
  });
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  it('sem bot conectado orienta a conectar o bot primeiro', async () => {
    const res = await build().handleCommand({ type: 'INITIATE_PAIRING_LINK', partnerName: 'Ana' });
    expect(res.status).toBe(400);
  });

  it('gera o link com o @username do bot e um código de uso único', async () => {
    const d = build();
    await d.handleCommand({ type: 'SET_BOT_TOKEN', token: TOKEN });
    const res = await d.handleCommand({ type: 'INITIATE_PAIRING_LINK', partnerName: 'Ana' });
    expect(res.status).toBe(200);
    if (!('pairingLink' in res)) throw new Error('sem link');
    expect(res.pairingLink).toBe(`https://t.me/foco_bot?start=${res.pairingCode}`);
    expect(res.pairingCode.length).toBeGreaterThanOrEqual(10);
  });

  it('só o /start com o código certo, em chat privado, vira o Ajudante; depois a senha conclui', async () => {
    const d = build();
    await d.handleCommand({ type: 'SET_BOT_TOKEN', token: TOKEN });
    const link = await d.handleCommand({ type: 'INITIATE_PAIRING_LINK', partnerName: 'Ana' });
    if (!('pairingCode' in link)) throw new Error('sem código');

    // código errado, grupo e mensagem comum são ignorados
    updates = [start(1, 999, '/start codigo-errado'), start(2, -555, `/start ${link.pairingCode}`, 'group'), start(3, 999, 'oi')];
    const ignored = await d.handleCommand({ type: 'CHECK_PAIRING_STATUS' });
    expect(ignored).toMatchObject({ status: 200, pending: true, paired: false });
    expect(sent.some((r) => r.endpointUrl.endsWith('/sendMessage'))).toBe(false);

    // código certo em chat privado: o convite com a instrução /senha vai para esse chat
    updates = [start(4, 42, `/start ${link.pairingCode}`)];
    await d.handleCommand({ type: 'CHECK_PAIRING_STATUS' });
    const invitation = sent.find((r) => r.endpointUrl.endsWith('/sendMessage'));
    expect(invitation?.payload).toMatchObject({ chat_id: '42' });

    // o mesmo código não vale de novo (uso único) e outro chat não assume
    updates = [start(5, 77, `/start ${link.pairingCode}`)];
    await d.handleCommand({ type: 'CHECK_PAIRING_STATUS' });
    expect(sent.filter((r) => r.endpointUrl.endsWith('/sendMessage'))).toHaveLength(1);

    // a senha só vale vinda do chat vinculado; senha fraca recebe checklist de erro e não pareia
    updates = [start(6, 42, '/senha fraca')];
    const weakTry = await d.handleCommand({ type: 'CHECK_PAIRING_STATUS' });
    expect(weakTry).toMatchObject({ status: 200, paired: false, pending: true });
    const feedbackMsg = sent.find((r) =>
      typeof (r.payload as { text?: unknown })?.text === 'string' &&
      ((r.payload as { text: string }).text).includes('A senha não atende aos critérios')
    );
    expect((feedbackMsg?.payload as { chat_id?: unknown })?.chat_id).toBe('42');

    // senha de intruso é ignorada e senha forte válida conclui o pareamento
    updates = [start(7, 77, '/senha Intruso#2026!'), start(8, 42, '/senha SenhaDoAjudante#2026!')];
    const done = await d.handleCommand({ type: 'CHECK_PAIRING_STATUS' });
    expect(done).toMatchObject({ status: 200, paired: true, pending: false });
  });
});
