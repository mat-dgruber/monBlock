/**
 * @file pipe-acl.ts
 * @description Gancho do W4 (ADR-0016, D2-A): depois do `listen`, o daemon (SYSTEM, dono do pipe)
 * roda o `pipe-acl.ps1`, que troca a DACL do named pipe por SDDL explícita. Falhou → o pipe fica no
 * DACL padrão (usuário comum só lê: fail-closed) e o watchdog acusa `ipc:dacl`.
 */

import { runPowerShellJson } from './powershell-json.js';

const PIPE_PREFIX = '\\\\.\\pipe\\';

export function pipeAclHook(
  scriptPath: string,
  run: (script: string, args: string[]) => Promise<Record<string, unknown> | null> = (s, a) => runPowerShellJson(s, a)
): (socketPath: string) => Promise<boolean> {
  return async (socketPath) => {
    if (!socketPath.startsWith(PIPE_PREFIX)) return false;
    const res = await run(scriptPath, ['-PipeName', socketPath.slice(PIPE_PREFIX.length)]);
    return res?.ok === true;
  };
}
