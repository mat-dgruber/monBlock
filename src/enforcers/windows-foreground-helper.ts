/**
 * @file windows-foreground-helper.ts
 * @description Helper persistente da Camada 3 no Windows (W8, ADR-0016 D4).
 *
 * Um único `powershell.exe` compila o P/Invoke uma vez e responde `probe` com o processo e o título da
 * janela em primeiro plano (S0-E2/P8: p95 9,9 ms, ~0,4% de um núcleo). Regras:
 * - só conta como pronto depois do handshake `{"ready":true}`: em CLM/AppLocker o PowerShell sai com 0
 *   sem imprimir nada (P8), então código de saída não prova nada;
 * - probe sem resposta em 2 s mata o processo; o próximo probe recria (sem backoff);
 * - 3 falhas seguidas de subida → `unavailable` até o app reiniciar (nada de loop martelando o sistema);
 * - aceita só o comando fixo `probe`; o script vem de constante, sem entrada externa.
 */

import { spawn } from 'node:child_process';
import type { EventEmitter } from 'node:events';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';

export interface ForegroundProbe {
  proc: string;
  title: string;
}

export interface HelperChild extends EventEmitter {
  stdout: EventEmitter | null;
  stdin: { write(data: string): boolean; end(): void } | null;
  kill(): boolean;
}

export type HelperSpawnFn = () => HelperChild;
export type HelperStatus = 'idle' | 'ready' | 'unavailable';

const LOOP_SCRIPT = String.raw`
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$src = @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class MonBlockForeground {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
}
'@
try { Add-Type -TypeDefinition $src -ErrorAction Stop } catch { exit 3 }
[Console]::Out.WriteLine('{"ready":true}'); [Console]::Out.Flush()
while ($null -ne ($line = [Console]::In.ReadLine())) {
  if ($line -ne 'probe') { [Console]::Out.WriteLine('{}'); [Console]::Out.Flush(); continue }
  $h = [MonBlockForeground]::GetForegroundWindow()
  [uint32]$procId = 0
  [void][MonBlockForeground]::GetWindowThreadProcessId($h, [ref]$procId)
  $sb = [Text.StringBuilder]::new(1024)
  [void][MonBlockForeground]::GetWindowText($h, $sb, 1024)
  $name = ''
  try { $name = [Diagnostics.Process]::GetProcessById([int]$procId).ProcessName } catch { }
  [Console]::Out.WriteLine((@{ proc = $name; title = $sb.ToString() } | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}
`;

/** Processo real: powershell.exe por caminho absoluto, sem o PSModulePath herdado (lição da F2/F3). */
export function defaultHelperSpawn(env: NodeJS.ProcessEnv = process.env): HelperChild {
  const childEnv = { ...env };
  delete childEnv.PSModulePath;
  const exe = path.win32.join(env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const encoded = Buffer.from(LOOP_SCRIPT, 'utf16le').toString('base64');
  return spawn(exe, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
    env: childEnv,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'ignore'],
  }) as unknown as HelperChild;
}

export interface ForegroundHelperOptions {
  spawnFn?: HelperSpawnFn;
  readyTimeoutMs?: number;
  probeTimeoutMs?: number;
  maxStartFailures?: number;
  /** Chamado uma vez quando a Camada 3 fica desligada (o app avisa a pessoa). */
  onUnavailable?: () => void;
}

export class ForegroundHelper {
  private readonly spawnFn: HelperSpawnFn;
  private readonly readyTimeoutMs: number;
  private readonly probeTimeoutMs: number;
  private readonly maxStartFailures: number;
  private readonly onUnavailable?: () => void;
  private child: HelperChild | null = null;
  private ready: Promise<boolean> | null = null;
  private lineWaiter: ((line: string | null) => void) | null = null;
  private startFailures = 0;
  private state: HelperStatus = 'idle';
  private disposed = false;

  constructor(options: ForegroundHelperOptions = {}) {
    this.spawnFn = options.spawnFn ?? (() => defaultHelperSpawn());
    this.readyTimeoutMs = options.readyTimeoutMs ?? 10_000;
    this.probeTimeoutMs = options.probeTimeoutMs ?? 2_000;
    this.maxStartFailures = options.maxStartFailures ?? 3;
    this.onUnavailable = options.onUnavailable;
  }

  status(): HelperStatus {
    return this.state;
  }

  /** Processo e título da janela em primeiro plano; `null` se indisponível, travado ou resposta inválida. */
  async probe(): Promise<ForegroundProbe | null> {
    if (this.disposed || this.state === 'unavailable') return null;
    if (!(await this.ensureStarted())) return null;
    const line = await this.request('probe');
    if (line === null) {
      this.stop(); // travado: o próximo probe recria
      return null;
    }
    try {
      const parsed = JSON.parse(line) as Partial<ForegroundProbe>;
      return typeof parsed.proc === 'string' && typeof parsed.title === 'string'
        ? { proc: parsed.proc, title: parsed.title }
        : null;
    } catch {
      return null;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
  }

  private ensureStarted(): Promise<boolean> {
    if (this.ready) return this.ready;
    const child = this.spawnFn();
    this.child = child;
    // Decodificador em fluxo: um caractere multibyte do título pode vir partido entre dois chunks.
    const decoder = new StringDecoder('utf8');
    let buf = '';
    // Saída e saída do processo de um helper antigo (já substituído) são ignoradas: senão a morte
    // atrasada dele resolveria o handshake do novo como falha e o mataria.
    const isCurrent = () => this.child === child;
    child.stdout?.on('data', (chunk: Buffer) => {
      if (!isCurrent()) return;
      buf += decoder.write(chunk);
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) this.deliver(line);
      }
    });
    child.on('exit', () => {
      if (!isCurrent()) return;
      this.child = null;
      this.ready = null;
      this.deliver(null);
    });
    child.on('error', () => {
      if (isCurrent()) this.deliver(null);
    });

    this.ready = this.nextLine(this.readyTimeoutMs).then((line) => {
      if (line && line.includes('"ready":true')) {
        this.startFailures = 0;
        this.state = 'ready';
        return true;
      }
      this.stop();
      this.startFailures += 1;
      if (this.startFailures >= this.maxStartFailures) {
        this.state = 'unavailable';
        console.error('[monBlock] Camada 3 desligada: o helper do Windows não iniciou (PowerShell restrito/AppLocker?).');
        this.onUnavailable?.();
      }
      return false;
    });
    return this.ready;
  }

  private request(cmd: string): Promise<string | null> {
    const pending = this.nextLine(this.probeTimeoutMs);
    this.child?.stdin?.write(`${cmd}\n`);
    return pending;
  }

  private nextLine(timeoutMs: number): Promise<string | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.lineWaiter = null;
        resolve(null);
      }, timeoutMs);
      this.lineWaiter = (line) => {
        clearTimeout(timer);
        this.lineWaiter = null;
        resolve(line);
      };
    });
  }

  private deliver(line: string | null): void {
    this.lineWaiter?.(line);
  }

  private stop(): void {
    const child = this.child;
    this.child = null;
    this.ready = null;
    if (child) {
      try {
        child.stdin?.end();
      } catch {
        // stdin já fechado
      }
      child.kill();
    }
  }
}
