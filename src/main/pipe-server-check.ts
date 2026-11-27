/**
 * @file pipe-server-check.ts
 * @description W21 (ADR-0016, D2.1): antes de mandar um segredo pelo pipe, o app confere que quem
 * serve `\\.\pipe\monblockd` é filho do serviço `monblockd` (o WinSW). Um usuário comum pode criar o
 * pipe enquanto o daemon está parado; sem esta checagem a UI entregaria a senha do Ajudante a ele.
 */

import { runPowerShellJson } from '../daemon/powershell-json.js';

const PIPE_PREFIX = '\\\\.\\pipe\\';

export function pipeServerVerifier(
  scriptPath: string,
  socketPath: string,
  run: (script: string, args: string[]) => Promise<Record<string, unknown> | null> = (s, a) =>
    runPowerShellJson(s, a, { timeoutMs: 10_000 })
): () => Promise<boolean> {
  return async () => {
    if (!socketPath.startsWith(PIPE_PREFIX)) return false;
    const res = await run(scriptPath, ['-PipeName', socketPath.slice(PIPE_PREFIX.length), '-ServiceName', 'monblockd']);
    return res?.verified === true;
  };
}
