/**
 * @file windows-uninstall.ts
 * @description W12 (ADR-0016 D4): depois do `UNINSTALL_AUTHORIZED`, o daemon agenda uma tarefa SYSTEM que
 * roda o `uninstall.ps1`. Uma tarefa sobrevive à parada do serviço; um spawn `detached` é morto pelo WinSW
 * junto com a árvore (S0, P6). A mesma tarefa é `onstart`: se a desinstalação cair no meio (queda de
 * energia), roda de novo no próximo boot; o script apaga a tarefa só quando termina.
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';

export const UNINSTALL_TASK_NAME = 'monBlock\\Uninstall';

type ExecFn = (file: string, args: string[], options: { encoding: 'utf8'; timeout: number; windowsHide: boolean }) => string;

export function scheduleWindowsUninstall(
  installDir: string,
  execFn: ExecFn = execFileSync as unknown as ExecFn,
  env: NodeJS.ProcessEnv = process.env,
  log: (msg: string) => void = (m) => console.error(m)
): boolean {
  const systemRoot = env.SystemRoot ?? 'C:\\Windows';
  const schtasks = path.win32.join(systemRoot, 'System32', 'schtasks.exe');
  const powershell = path.win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const script = path.win32.join(installDir, 'uninstall.ps1');
  const tr = `"${powershell}" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${script}"`;
  const opts = { encoding: 'utf8' as const, timeout: 15_000, windowsHide: true };
  try {
    execFn(schtasks, ['/create', '/tn', UNINSTALL_TASK_NAME, '/tr', tr, '/ru', 'SYSTEM', '/sc', 'onstart', '/rl', 'HIGHEST', '/f'], opts);
    execFn(schtasks, ['/run', '/tn', UNINSTALL_TASK_NAME], opts);
    return true;
  } catch (err) {
    log(`[monblockd] falha ao agendar a desinstalação: ${(err as Error).message}`);
    return false;
  }
}
