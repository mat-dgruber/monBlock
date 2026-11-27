import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { runPowerShellJson, type SpawnFn } from '../../src/daemon/powershell-json.js';

/** Processo falso: emite stdout e sai com o código dado (ou nunca sai, para o timeout). */
function fakeSpawn(stdout: string, code: number | null, calls: Array<{ file: string; args: string[]; env?: NodeJS.ProcessEnv }> = []) {
  const kill = vi.fn();
  const spawnFn: SpawnFn = (file, args, opts) => {
    calls.push({ file, args, env: opts.env });
    const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; kill: () => void };
    child.stdout = new EventEmitter();
    child.kill = kill;
    setTimeout(() => {
      if (stdout) child.stdout.emit('data', Buffer.from(stdout));
      if (code !== null) child.emit('close', code);
    }, 1);
    return child;
  };
  return { spawnFn, kill, calls };
}

describe('runPowerShellJson', () => {
  it('devolve o JSON da última linha com código 0', async () => {
    // Arrange
    const { spawnFn } = fakeSpawn('aviso qualquer\r\n{"ok":true}\r\n', 0);

    // Act
    const res = await runPowerShellJson('C:\\x\\pipe-acl.ps1', ['-PipeName', 'monblockd'], { spawnFn });

    // Assert
    expect(res).toEqual({ ok: true });
  });

  it('código 0 sem saída (CLM, S0-E2/P8) é falha, não sucesso', async () => {
    // Arrange
    const { spawnFn } = fakeSpawn('', 0);

    // Act
    const res = await runPowerShellJson('C:\\x\\a.ps1', [], { spawnFn });

    // Assert
    expect(res).toBeNull();
  });

  it('código diferente de 0 devolve o JSON de erro mesmo assim', async () => {
    // Arrange
    const { spawnFn } = fakeSpawn('{"ok":false,"error":"CreateFile: 5"}\n', 1);

    // Act
    const res = await runPowerShellJson('C:\\x\\a.ps1', [], { spawnFn });

    // Assert
    expect(res).toEqual({ ok: false, error: 'CreateFile: 5' });
  });

  it('timeout mata o processo e devolve null', async () => {
    // Arrange
    const { spawnFn, kill } = fakeSpawn('', null);

    // Act
    const res = await runPowerShellJson('C:\\x\\a.ps1', [], { spawnFn, timeoutMs: 20 });

    // Assert
    expect(res).toBeNull();
    expect(kill).toHaveBeenCalled();
  });

  it('chama o powershell.exe sem perfil, não interativo, com -File e sem PSModulePath herdado', async () => {
    // Arrange
    const calls: Array<{ file: string; args: string[]; env?: NodeJS.ProcessEnv }> = [];
    const { spawnFn } = fakeSpawn('{"ok":true}', 0, calls);

    // Act
    await runPowerShellJson('C:\\p\\a.ps1', ['-PipeName', 'x'], {
      spawnFn,
      env: { PSModulePath: 'C:\\pwsh7\\Modules', SystemRoot: 'C:\\Windows' },
    });

    // Assert
    expect(calls[0].file).toBe('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
    expect(calls[0].args).toEqual(['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', 'C:\\p\\a.ps1', '-PipeName', 'x']);
    expect(calls[0].env?.PSModulePath).toBeUndefined();
    expect(calls[0].env?.SystemRoot).toBe('C:\\Windows');
  });

  it('falha ao iniciar o processo devolve null', async () => {
    // Arrange
    const spawnFn: SpawnFn = () => {
      const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; kill: () => void };
      child.stdout = new EventEmitter();
      child.kill = () => {};
      setTimeout(() => child.emit('error', new Error('ENOENT')), 1);
      return child;
    };

    // Act / Assert
    expect(await runPowerShellJson('C:\\x\\a.ps1', [], { spawnFn })).toBeNull();
  });
});
