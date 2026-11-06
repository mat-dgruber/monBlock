/**
 * @file ipc-server.ts
 * @description Servidor IPC do `monblockd` (RN-DAEMON-04 / ADR-0007).
 *
 * Socket Unix, uma requisição por linha (`{ id, cmd }`) e uma resposta por linha
 * (`{ id, response }`). O controle de acesso é a permissão do diretório/socket
 * (`root:monblock 0750` / `0660`, spike S4); a autorização real é a credencial do
 * Ajudante verificada pelo daemon. A UI não é confiável.
 */

import fs from 'node:fs';
import net from 'node:net';
import {
  DAEMON_COMMAND_TYPES,
  buildProblem,
  type DaemonCommand,
  type DaemonResponse,
} from './monblockd.js';

export interface IpcServerOptions {
  socketPath: string;
  handle: (cmd: DaemonCommand) => Promise<DaemonResponse>;
  maxLineBytes?: number;
  idleMs?: number;
  maxConnections?: number;
  socketMode?: number;
}

export interface IpcServer {
  close(): Promise<void>;
  connections(): number;
}

const KNOWN_TYPES: ReadonlySet<string> = new Set(DAEMON_COMMAND_TYPES);
const INSTANCE = '/ipc/monblockd';

// ponytail: valida só envelope e `type`; os campos de cada comando já são validados no daemon.
function parseRequest(line: string): { id: unknown; cmd?: DaemonCommand; problem?: DaemonResponse } {
  let msg: unknown;
  try {
    msg = JSON.parse(line);
  } catch {
    return { id: null, problem: buildProblem(400, 'Payload JSON inválido', 'A linha não é JSON válido.', INSTANCE) };
  }
  const obj = (msg && typeof msg === 'object' ? msg : {}) as { id?: unknown; cmd?: unknown };
  const id = typeof obj.id === 'number' || typeof obj.id === 'string' ? obj.id : null;
  const cmd = obj.cmd as { type?: unknown } | undefined;
  if (!cmd || typeof cmd !== 'object' || Array.isArray(cmd) || typeof cmd.type !== 'string' || !KNOWN_TYPES.has(cmd.type)) {
    return { id, problem: buildProblem(400, 'Comando inválido', 'Campo `cmd.type` ausente ou desconhecido.', INSTANCE) };
  }
  return { id, cmd: cmd as DaemonCommand };
}

/** Remove um socket velho (de um daemon que morreu) sem apagar outro tipo de arquivo por engano. */
function removeStaleSocket(socketPath: string): void {
  try {
    const st = fs.lstatSync(socketPath);
    if (st.isSocket() || (st.isFile() && st.size === 0)) fs.unlinkSync(socketPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

export async function createIpcServer(options: IpcServerOptions): Promise<IpcServer> {
  const maxLineBytes = options.maxLineBytes ?? 64 * 1024;
  const idleMs = options.idleMs ?? 5_000;
  const sockets = new Set<net.Socket>();

  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => socket.destroy());
    socket.setTimeout(idleMs, () => socket.destroy());

    let buf = '';
    const reply = (id: unknown, response: DaemonResponse) => {
      if (!socket.destroyed) socket.write(`${JSON.stringify({ id, response })}\n`);
    };

    socket.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (Buffer.byteLength(line) > maxLineBytes) return socket.destroy();
        if (!line.trim()) continue;
        const { id, cmd, problem } = parseRequest(line);
        if (problem || !cmd) {
          reply(id, problem!);
          continue;
        }
        options
          .handle(cmd)
          .then((res) => reply(id, res))
          .catch(() => reply(id, buildProblem(500, 'Erro interno do daemon', 'Falha ao processar o comando.', INSTANCE)));
      }
      if (Buffer.byteLength(buf) > maxLineBytes) socket.destroy();
    });
  });
  server.maxConnections = options.maxConnections ?? 8;

  removeStaleSocket(options.socketPath);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.socketPath, () => {
      server.off('error', reject);
      resolve();
    });
  });
  fs.chmodSync(options.socketPath, options.socketMode ?? 0o660);

  return {
    connections: () => sockets.size,
    close: () =>
      new Promise<void>((resolve) => {
        for (const s of sockets) s.destroy();
        server.close(() => resolve());
      }),
  };
}
