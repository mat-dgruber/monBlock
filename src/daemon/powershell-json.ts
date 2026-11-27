/**
 * @file powershell-json.ts
 * @description Executa um helper `.ps1` do monBlock (pipe-acl, pipe-server-check) e lê uma linha JSON.
 *
 * Regras vindas do spike S0:
 * - sucesso só com uma linha JSON explícita: em Constrained Language Mode o PowerShell sai com código 0
 *   sem imprimir nada (S0-E2, P8), então o código de saída sozinho não prova nada;
 * - `powershell.exe` por caminho absoluto e sem o `PSModulePath` herdado: vindo do PowerShell 7, o
 *   Windows PowerShell 5.1 não carrega os próprios módulos (visto na F2).
 */

import { spawn } from 'node:child_process';
import type { EventEmitter } from 'node:events';
import path from 'node:path';

export type SpawnFn = (
  file: string,
  args: string[],
  options: { env: NodeJS.ProcessEnv; windowsHide: boolean; stdio: ['ignore', 'pipe', 'ignore'] }
) => EventEmitter & { stdout: EventEmitter | null; kill: () => void };

export interface RunPowerShellOptions {
  timeoutMs?: number;
  spawnFn?: SpawnFn;
  env?: NodeJS.ProcessEnv;
}

export function runPowerShellJson(
  scriptPath: string,
  args: string[],
  options: RunPowerShellOptions = {}
): Promise<Record<string, unknown> | null> {
  const env = { ...(options.env ?? process.env) };
  delete env.PSModulePath;
  const exe = path.win32.join(env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const spawnFn = options.spawnFn ?? (spawn as unknown as SpawnFn);

  return new Promise((resolve) => {
    let settled = false;
    let out = '';
    const done = (value: Record<string, unknown> | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const child = spawnFn(exe, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...args], {
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const timer = setTimeout(() => {
      child.kill();
      done(null);
    }, options.timeoutMs ?? 20_000);
    child.stdout?.on('data', (chunk: Buffer) => {
      out += chunk.toString('utf8');
    });
    child.on('error', () => done(null));
    child.on('close', () => {
      const last = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).pop();
      if (!last) return done(null);
      try {
        const parsed = JSON.parse(last) as unknown;
        done(parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null);
      } catch {
        done(null);
      }
    });
  });
}
