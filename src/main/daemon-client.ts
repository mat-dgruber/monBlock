/**
 * @file daemon-client.ts
 * @description Cliente do socket do `monblockd` usado pelo Electron (ADR-0007).
 *
 * Conexão persistente com reconexão em backoff exponencial + jitter. Sem fila offline:
 * com o daemon fora, `call` rejeita na hora e a UI mostra "Proteção não verificada".
 * Nunca há fallback para o daemon em processo (seria bypass: parar o daemon → userland).
 */

import { EventEmitter } from 'node:events';
import net from 'node:net';
import { buildProblem, type DaemonCommand, type DaemonResponse } from '../daemon/monblockd.js';

/** Comandos que carregam segredo do Ajudante ou o estado legado com credenciais (W21). */
const SECRET_COMMANDS: ReadonlySet<string> = new Set([
  'PAIR_PARTNER',
  'SET_BOT_TOKEN',
  'VERIFY_OFFLINE_TOKEN',
  'VERIFY_RECOVERY_CODE',
  'UNINSTALL_AUTHORIZED',
  'MIGRATE_LEGACY_STATE',
]);
const SECRET_FIELDS = ['password', 'currentPartnerPassword', 'token', 'code', 'botToken'];

export function carriesSecret(cmd: DaemonCommand): boolean {
  if (SECRET_COMMANDS.has(cmd.type)) return true;
  const c = cmd as unknown as Record<string, unknown>;
  return SECRET_FIELDS.some((k) => typeof c[k] === 'string' && (c[k] as string).length > 0);
}

export type DaemonClientStatus = 'online' | 'offline';

export interface DaemonClientOptions {
  socketPath: string;
  timeoutMs?: number;
  minBackoffMs?: number;
  maxBackoffMs?: number;
  /**
   * Windows (W21): prova que o servidor do pipe é o serviço. Roda uma vez por conexão, já conectado,
   * antes do primeiro comando com segredo. `false`/erro → o segredo não sai (503).
   */
  verifyServer?: () => Promise<boolean>;
}

interface Pending {
  resolve: (res: DaemonResponse) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

export class DaemonClient extends EventEmitter {
  private readonly socketPath: string;
  private readonly timeoutMs: number;
  private readonly minBackoffMs: number;
  private readonly maxBackoffMs: number;
  private socket: net.Socket | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private attempt = 0;
  private retryTimer: NodeJS.Timeout | null = null;
  private closed = false;
  public status: DaemonClientStatus = 'offline';
  private readonly verifyServer?: () => Promise<boolean>;
  /** Resultado da verificação para a conexão atual; zera a cada reconexão. */
  private serverVerified: Promise<boolean> | null = null;

  constructor(options: DaemonClientOptions) {
    super();
    this.socketPath = options.socketPath;
    this.timeoutMs = options.timeoutMs ?? 5_000;
    this.minBackoffMs = options.minBackoffMs ?? 250;
    this.maxBackoffMs = options.maxBackoffMs ?? 30_000;
    this.verifyServer = options.verifyServer;
    this.connect();
  }

  public async call(cmd: DaemonCommand): Promise<DaemonResponse> {
    if (this.verifyServer && carriesSecret(cmd) && !(await this.isServerVerified())) {
      return buildProblem(
        503,
        'Serviço do monBlock não verificado',
        'O processo que atende o app não é o serviço monblockd. Nada foi enviado.',
        '/ipc/monblockd'
      );
    }
    return this.send(cmd);
  }

  private isServerVerified(): Promise<boolean> {
    if (!this.serverVerified) {
      this.serverVerified = this.verifyServer!().catch(() => false);
    }
    return this.serverVerified;
  }

  private send(cmd: DaemonCommand): Promise<DaemonResponse> {
    const socket = this.socket;
    if (this.status !== 'online' || !socket) {
      return Promise.reject(new Error('monblockd offline'));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('monblockd timeout'));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      socket.write(`${JSON.stringify({ id, cmd })}\n`);
    });
  }

  public close(): void {
    this.closed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.socket?.destroy();
  }

  private connect(): void {
    if (this.closed) return;
    const socket = net.connect(this.socketPath);
    let buf = '';
    socket.on('connect', () => {
      this.socket = socket;
      this.serverVerified = null;
      this.attempt = 0;
      this.setStatus('online');
    });
    socket.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        try {
          const { id, response } = JSON.parse(line) as { id: number; response: DaemonResponse };
          const p = this.pending.get(id);
          if (!p) continue;
          clearTimeout(p.timer);
          this.pending.delete(id);
          p.resolve(response);
        } catch {
          // Linha malformada do daemon: a chamada correspondente cai no timeout.
        }
      }
    });
    socket.on('error', () => socket.destroy());
    socket.on('close', () => {
      if (this.socket === socket) this.socket = null;
      for (const [id, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(new Error('monblockd offline'));
        this.pending.delete(id);
      }
      this.setStatus('offline');
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (this.closed || this.retryTimer) return;
    const exp = Math.min(this.maxBackoffMs, this.minBackoffMs * 2 ** this.attempt++);
    const delay = exp / 2 + Math.random() * (exp / 2); // jitter: [exp/2, exp]
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, delay);
  }

  private setStatus(next: DaemonClientStatus): void {
    // Depois de close() (saída do app) os ouvintes já podem ter janela/tray destruídas.
    if (this.closed || this.status === next) return;
    this.status = next;
    this.emit('status', next);
  }
}
