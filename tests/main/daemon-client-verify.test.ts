import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DaemonClient, carriesSecret } from '../../src/main/daemon-client.js';
import { pipeServerVerifier } from '../../src/main/pipe-server-check.js';

const socketPath = () =>
  process.platform === 'win32'
    ? `\\\\.\\pipe\\mb-verify-${crypto.randomBytes(4).toString('hex')}`
    : path.join(fs.mkdtempSync(path.join(os.tmpdir().length > 40 ? '/tmp' : os.tmpdir(), 'mbv-')), 'd.sock');

/** Servidor de linhas JSON que responde 200 e conta o que recebeu. */
async function echoServer(p: string) {
  const received: string[] = [];
  const server = net.createServer((s) => {
    let buf = '';
    s.on('data', (c) => {
      buf += c.toString();
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        const { id, cmd } = JSON.parse(line);
        received.push(cmd.type);
        s.write(`${JSON.stringify({ id, response: { status: 200 } })}\n`);
      }
    });
  });
  await new Promise<void>((r) => server.listen(p, r));
  return { server, received };
}

const online = async (c: DaemonClient) => {
  const end = Date.now() + 2000;
  while (c.status !== 'online') {
    if (Date.now() > end) throw new Error('offline');
    await new Promise((r) => setTimeout(r, 10));
  }
};

let cleanup: Array<() => void> = [];
afterEach(() => {
  for (const f of cleanup) f();
  cleanup = [];
});

describe('carriesSecret', () => {
  it('marca os comandos com senha, código, token ou estado legado', () => {
    expect(carriesSecret({ type: 'PAIR_PARTNER', password: 'x', telegramChatId: '1' } as never)).toBe(true);
    expect(carriesSecret({ type: 'SET_BOT_TOKEN', token: 't' } as never)).toBe(true);
    expect(carriesSecret({ type: 'VERIFY_OFFLINE_TOKEN', token: 'UNLOCK-15M-x' } as never)).toBe(true);
    expect(carriesSecret({ type: 'VERIFY_RECOVERY_CODE', code: 'REC-1' } as never)).toBe(true);
    expect(carriesSecret({ type: 'UNINSTALL_AUTHORIZED', token: 'x' } as never)).toBe(true);
    expect(carriesSecret({ type: 'MIGRATE_LEGACY_STATE' } as never)).toBe(true);
    expect(carriesSecret({ type: 'MUTATE_RULES', rules: {}, currentPartnerPassword: 'p' } as never)).toBe(true);
  });

  it('não marca leitura de estado nem pedidos sem credencial', () => {
    expect(carriesSecret({ type: 'GET_STATE' })).toBe(false);
    expect(carriesSecret({ type: 'CHECK_PAIRING_STATUS' } as never)).toBe(false);
  });
});

describe('DaemonClient: anti-impostura do servidor (W21)', () => {
  it('servidor não verificado: comando com segredo não sai e volta 503; GET_STATE segue', async () => {
    // Arrange
    const p = socketPath();
    const { server, received } = await echoServer(p);
    const client = new DaemonClient({ socketPath: p, verifyServer: async () => false });
    cleanup.push(() => client.close(), () => server.close());
    await online(client);

    // Act
    const secret = await client.call({ type: 'PAIR_PARTNER', password: 'segredo', telegramChatId: '1' } as never);
    const plain = await client.call({ type: 'GET_STATE' });

    // Assert
    expect(secret.status).toBe(503);
    expect('title' in secret && secret.title).toBe('Serviço do monBlock não verificado');
    expect(plain.status).toBe(200);
    expect(received).toEqual(['GET_STATE']);
  });

  it('servidor verificado: o segredo é enviado e a verificação roda uma vez por conexão', async () => {
    // Arrange
    const p = socketPath();
    const { server, received } = await echoServer(p);
    const verifyServer = vi.fn(async () => true);
    const client = new DaemonClient({ socketPath: p, verifyServer });
    cleanup.push(() => client.close(), () => server.close());
    await online(client);

    // Act
    await client.call({ type: 'VERIFY_RECOVERY_CODE', code: 'REC-1' } as never);
    await client.call({ type: 'VERIFY_RECOVERY_CODE', code: 'REC-2' } as never);

    // Assert
    expect(received).toEqual(['VERIFY_RECOVERY_CODE', 'VERIFY_RECOVERY_CODE']);
    expect(verifyServer).toHaveBeenCalledTimes(1);
  });

  it('erro na verificação conta como não verificado', async () => {
    // Arrange
    const p = socketPath();
    const { server, received } = await echoServer(p);
    const client = new DaemonClient({
      socketPath: p,
      verifyServer: async () => {
        throw new Error('powershell');
      },
    });
    cleanup.push(() => client.close(), () => server.close());
    await online(client);

    // Act
    const res = await client.call({ type: 'SET_BOT_TOKEN', token: 't' } as never);

    // Assert
    expect(res.status).toBe(503);
    expect(received).toEqual([]);
  });

  it('sem verifyServer (macOS/Linux) nada muda', async () => {
    // Arrange
    const p = socketPath();
    const { server, received } = await echoServer(p);
    const client = new DaemonClient({ socketPath: p });
    cleanup.push(() => client.close(), () => server.close());
    await online(client);

    // Act
    await client.call({ type: 'SET_BOT_TOKEN', token: 't' } as never);

    // Assert
    expect(received).toEqual(['SET_BOT_TOKEN']);
  });
});

describe('pipeServerVerifier', () => {
  it('exige verified:true do helper e passa pipe e serviço', async () => {
    // Arrange
    const run = vi.fn(async () => ({ verified: true }));

    // Act
    const ok = await pipeServerVerifier('C:\\Program Files\\monBlock\\pipe-server-check.ps1', '\\\\.\\pipe\\monblockd', run)();

    // Assert
    expect(ok).toBe(true);
    expect(run).toHaveBeenCalledWith('C:\\Program Files\\monBlock\\pipe-server-check.ps1', ['-PipeName', 'monblockd', '-ServiceName', 'monblockd']);
  });

  it('qualquer outra resposta é não verificado', async () => {
    for (const out of [null, { verified: false }, { verified: 'true' }]) {
      expect(await pipeServerVerifier('x.ps1', '\\\\.\\pipe\\monblockd', async () => out)()).toBe(false);
    }
  });
});
