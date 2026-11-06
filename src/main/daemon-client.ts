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
import type { DaemonCommand, DaemonResponse } from '../daemon/monblockd.js';

export type DaemonClientStatus = 'online' | 'offline';

export interface DaemonClientOptions {
  socketPath: string;
  timeoutMs?: number;
  minBackoffMs?: number;
  maxBackoffMs?: number;
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

  constructor(options: DaemonClientOptions) {
    super();
    this.socketPath = options.socketPath;
    this.timeoutMs = options.timeoutMs ?? 5_000;
    this.minBackoffMs = options.minBackoffMs ?? 250;
    this.maxBackoffMs = options.maxBackoffMs ?? 30_000;
    this.connect();
  }

  public call(cmd: DaemonCommand): Promise<DaemonResponse> {
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
    if (this.status === next) return;
    this.status = next;
    this.emit('status', next);
  }
}
