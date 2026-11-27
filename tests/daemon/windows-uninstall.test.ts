import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { UNINSTALL_TASK_NAME, scheduleWindowsUninstall } from '../../src/daemon/windows-uninstall.js';
import { WindowsPlatformEnforcer } from '../../src/enforcers/windows-platform-enforcer.js';

describe('scheduleWindowsUninstall (W12)', () => {
  it('cria uma tarefa SYSTEM (que também roda no boot) e a dispara, com caminhos absolutos', () => {
    // Arrange
    const calls: Array<{ file: string; args: string[] }> = [];
    const execFn = vi.fn((file: string, args: string[]) => {
      calls.push({ file, args });
      return '';
    });

    // Act
    const ok = scheduleWindowsUninstall('C:\\Program Files\\monBlock', execFn, { SystemRoot: 'C:\\Windows' });

    // Assert
    expect(ok).toBe(true);
    expect(calls).toHaveLength(2);
    const [create, run] = calls;
    expect(create.file).toBe('C:\\Windows\\System32\\schtasks.exe');
    expect(create.args).toEqual(
      expect.arrayContaining(['/create', '/tn', UNINSTALL_TASK_NAME, '/ru', 'SYSTEM', '/sc', 'onstart', '/rl', 'HIGHEST', '/f'])
    );
    const tr = create.args[create.args.indexOf('/tr') + 1];
    expect(tr).toBe(
      '"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "C:\\Program Files\\monBlock\\uninstall.ps1"'
    );
    expect(run.args).toEqual(['/run', '/tn', UNINSTALL_TASK_NAME]);
  });

  it('falha ao criar a tarefa: registra e devolve false sem lançar (o daemon não pode cair)', () => {
    // Arrange
    const execFn = vi.fn(() => {
      throw new Error('Acesso negado');
    });
    const log = vi.fn();

    // Act
    const ok = scheduleWindowsUninstall('C:\\Program Files\\monBlock', execFn, {}, log);

    // Assert
    expect(ok).toBe(false);
    expect(log).toHaveBeenCalled();
  });
});

describe('restoreSystemCleanState remove todos os valores gerenciados (W12)', () => {
  it('apaga listas, valores das raízes dos navegadores e as chaves do Firefox', async () => {
    // Arrange
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'win-clean-all-'));
    const cmds: string[] = [];
    const enforcer = new WindowsPlatformEnforcer({
      hostsPath: path.join(dir, 'hosts'),
      regFilePath: path.join(dir, 'p.reg'),
      commandExecutor: (cmd, args) => {
        cmds.push(`${cmd} ${args.join(' ')}`);
      },
      registryReader: () => null,
    });
    fs.writeFileSync(path.join(dir, 'hosts'), '127.0.0.1 localhost\n');

    // Act
    await enforcer.restoreSystemCleanState();

    // Assert
    for (const expected of [
      'reg delete HKLM\\SOFTWARE\\Policies\\Google\\Chrome\\URLBlocklist /f',
      'reg delete HKLM\\SOFTWARE\\Policies\\Microsoft\\Edge\\URLAllowlist /f',
      'reg delete HKLM\\SOFTWARE\\Policies\\Google\\Chrome /v DnsOverHttpsMode /f',
      'reg delete HKLM\\SOFTWARE\\Policies\\Google\\Chrome /v IncognitoModeAvailability /f',
      'reg delete HKLM\\SOFTWARE\\Policies\\Microsoft\\Edge /v InPrivateModeAvailability /f',
      'reg delete HKLM\\SOFTWARE\\Policies\\Mozilla\\Firefox\\WebsiteFilter /f',
      'reg delete HKLM\\SOFTWARE\\Policies\\Mozilla\\Firefox\\DNSOverHTTPS /f',
      'reg delete HKLM\\SOFTWARE\\Policies\\Mozilla\\Firefox /v DisablePrivateBrowsing /f',
    ]) {
      expect(cmds).toContain(expected);
    }
  });
});
