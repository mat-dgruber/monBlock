import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createIpcServer, type IpcServer } from '../../src/daemon/ipc-server.js';
import { DaemonClient } from '../../src/main/daemon-client.js';
import type { DaemonCommand, DaemonResponse } from '../../src/daemon/monblockd.js';

// sun_path tem ~104 bytes no macOS (spike S4): diretório curto.
const base = os.tmpdir().length > 60 ? '/tmp' : os.tmpdir();

let dir: string;
let socketPath: string;
const servers: IpcServer[] = [];
const clients: DaemonClient[] = [];

const echo = async (cmd: DaemonCommand): Promise<DaemonResponse> =>
  ({ status: 200, echoed: cmd.type }) as unknown as DaemonResponse;

async function start(handle = echo, opts: Partial<Parameters<typeof createIpcServer>[0]> = {}) {
  const server = await createIpcServer({ socketPath, handle, ...opts });
  servers.push(server);
  return server;
}

/** Abre uma conexão crua, envia `payload` e coleta linhas até o servidor fechar ou chegar `wantLines`. */
function raw(payload: string, wantLines = 1): Promise<{ lines: any[]; closed: boolean }> {
  return new Promise((resolve) => {
    const sock = net.connect(socketPath);
    let buf = '';
    const lines: any[] = [];
    sock.on('data', (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        lines.push(JSON.parse(buf.slice(0, i)));
        buf = buf.slice(i + 1);
      }
      if (lines.length >= wantLines) {
        sock.destroy();
        resolve({ lines, closed: false });
      }
    });
    sock.on('close', () => resolve({ lines, closed: true }));
    sock.on('error', () => resolve({ lines, closed: true }));
    sock.write(payload);
  });
}

function newClient(): DaemonClient {
  const c = new DaemonClient({ socketPath, timeoutMs: 300, minBackoffMs: 20, maxBackoffMs: 100 });
  clients.push(c);
  return c;
}

const waitFor = async (cond: () => boolean, ms = 2000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('timeout esperando condição');
    await new Promise((r) => setTimeout(r, 10));
  }
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(base, 'mb-ipc-'));
  socketPath = path.join(dir, 'd.sock');
});

afterEach(async () => {
  for (const c of clients.splice(0)) c.close();
  await Promise.all(servers.splice(0).map((s) => s.close()));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('ipc-server (RN-DAEMON-04)', () => {
  it('responde uma linha NDJSON com o mesmo id', async () => {
    await start();

    const { lines } = await raw(JSON.stringify({ id: 7, cmd: { type: 'GET_STATE' } }) + '\n');

    expect(lines[0]).toEqual({ id: 7, response: { status: 200, echoed: 'GET_STATE' } });
  });

  it('JSON inválido e tipo desconhecido recebem 400 sem chegar ao handler', async () => {
    let calls = 0;
    await start(async (c) => {
      calls++;
      return echo(c);
    });

    const bad = await raw('{nao-e-json\n');
    const unknown = await raw(JSON.stringify({ id: 1, cmd: { type: 'DROP_ALL' } }) + '\n');

    expect(bad.lines[0].response.status).toBe(400);
    expect(unknown.lines[0]).toMatchObject({ id: 1, response: { status: 400 } });
    expect(calls).toBe(0);
  });

  it('fecha a conexão quando a linha passa de 64 KiB', async () => {
    await start(echo, { idleMs: 60_000 }); // ociosidade não pode mascarar o limite

    const res = await raw('x'.repeat(70 * 1024));

    expect(res).toEqual({ lines: [], closed: true });
  });

  it('encerra conexão ociosa', async () => {
    await start(echo, { idleMs: 50 });

    const res = await raw('', 1);

    expect(res.closed).toBe(true);
  });

  it('erro do handler vira 500 sem derrubar o servidor', async () => {
    await start(async () => {
      throw new Error('boom');
    });

    const res = await raw(JSON.stringify({ id: 2, cmd: { type: 'GET_STATE' } }) + '\n');

    expect(res.lines[0]).toMatchObject({ id: 2, response: { status: 500 } });
  });

  it('recusa conexões acima do limite', async () => {
    const server = await start(echo, { maxConnections: 1 });
    const first = net.connect(socketPath);
    await new Promise((r) => first.on('connect', r));
    await waitFor(() => server.connections() === 1);

    const second = await raw(JSON.stringify({ id: 3, cmd: { type: 'GET_STATE' } }) + '\n');

    expect(second).toEqual({ lines: [], closed: true });
    first.destroy();
  });

  it('remove socket velho antes de escutar e aplica modo 0660', async () => {
    fs.writeFileSync(socketPath, '');

    await start();

    expect(fs.statSync(socketPath).mode & 0o777).toBe(0o660);
  });
});

describe('DaemonClient', () => {
  it('chama o daemon e recebe a resposta', async () => {
    await start();
    const client = newClient();
    await waitFor(() => client.status === 'online');

    const res = await client.call({ type: 'GET_STATE' });

    expect(res).toEqual({ status: 200, echoed: 'GET_STATE' });
  });

  it('fica offline quando o daemon cai, recusa chamadas e reconecta quando volta', async () => {
    const server = await start();
    const client = newClient();
    await waitFor(() => client.status === 'online');

    await server.close();
    servers.splice(servers.indexOf(server), 1);
    await waitFor(() => client.status === 'offline');
    await expect(client.call({ type: 'GET_STATE' })).rejects.toThrow(/offline/i);

    await start();
    await waitFor(() => client.status === 'online');
    expect(await client.call({ type: 'GET_STATE' })).toEqual({ status: 200, echoed: 'GET_STATE' });
  });

  it('rejeita por timeout quando o daemon não responde', async () => {
    await start(() => new Promise(() => undefined));
    const client = newClient();
    await waitFor(() => client.status === 'online');

    await expect(client.call({ type: 'GET_STATE' })).rejects.toThrow(/timeout/i);
  });
});
