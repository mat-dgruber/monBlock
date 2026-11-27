import { describe, expect, it, vi } from 'vitest';
import { ensureDataDirAcl, isPrivileged, shouldCheckBrowserProfile } from '../../src/daemon/entry.js';

const whoamiOut = (integritySid: string) =>
  [
    'INFORMAÇÕES DE GRUPO',
    'Nome do Grupo                          Tipo           SID          Atributos',
    'Todos                                  Grupo conhecido S-1-1-0     Grupo obrigatório',
    `Rótulo Obrigatório\\Nível Obrigatório  Rótulo         ${integritySid}`,
  ].join('\r\n');

describe('isPrivileged (W1)', () => {
  it('Windows como SYSTEM (S-1-16-16384) é privilegiado, chamando o whoami por caminho absoluto', () => {
    // Arrange
    const execFn = vi.fn(() => whoamiOut('S-1-16-16384'));

    // Act
    const result = isPrivileged('win32', execFn, { SystemRoot: 'C:\\Windows' });

    // Assert
    expect(result).toBe(true);
    expect(execFn).toHaveBeenCalledWith('C:\\Windows\\System32\\whoami.exe', ['/groups'], expect.objectContaining({ timeout: 5000 }));
  });

  it('Windows elevado (High, S-1-16-12288) é privilegiado', () => {
    expect(isPrivileged('win32', () => whoamiOut('S-1-16-12288'), {})).toBe(true);
  });

  it('Windows sem elevação (Medium, S-1-16-8192) não é privilegiado', () => {
    expect(isPrivileged('win32', () => whoamiOut('S-1-16-8192'), {})).toBe(false);
  });

  it('erro do whoami (AppLocker, ausente) falha fechado', () => {
    expect(
      isPrivileged(
        'win32',
        () => {
          throw new Error('ENOENT');
        },
        {}
      )
    ).toBe(false);
  });

  it('POSIX usa o uid 0', () => {
    expect(isPrivileged('linux', undefined, {}, () => 0)).toBe(true);
    expect(isPrivileged('darwin', undefined, {}, () => 501)).toBe(false);
  });
});

describe('shouldCheckBrowserProfile', () => {
  it('só no macOS privilegiado (no Windows acusaria drift falso)', () => {
    expect(shouldCheckBrowserProfile('darwin', true)).toBe(true);
    expect(shouldCheckBrowserProfile('darwin', false)).toBe(false);
    expect(shouldCheckBrowserProfile('win32', true)).toBe(false);
    expect(shouldCheckBrowserProfile('linux', true)).toBe(false);
  });
});

describe('ensureDataDirAcl (W20)', () => {
  const dir = 'C:\\ProgramData\\monBlock';
  const aclOf = (...sids: string[]) => sids.join('\r\n');

  it('ACL só com SYSTEM e Administradores: ok, sem alterar nada', () => {
    // Arrange
    const execFn = vi.fn(() => aclOf('S-1-5-18', 'S-1-5-32-544'));

    // Act
    const result = ensureDataDirAcl(dir, execFn);

    // Assert
    expect(result).toBe('ok');
    expect(execFn).toHaveBeenCalledTimes(1);
  });

  it('ACE de Users é removida reaplicando a ACL restrita (fixed)', () => {
    // Arrange
    const calls: string[][] = [];
    let reads = 0;
    const execFn = vi.fn((file: string, args: string[]) => {
      calls.push([file, ...args]);
      if (file === 'icacls') return '';
      reads += 1;
      return reads === 1 ? aclOf('S-1-5-18', 'S-1-5-32-544', 'S-1-5-32-545') : aclOf('S-1-5-18', 'S-1-5-32-544');
    });

    // Act
    const result = ensureDataDirAcl(dir, execFn);

    // Assert
    expect(result).toBe('fixed');
    expect(calls.find((c) => c[0] === 'icacls')).toEqual([
      'icacls',
      dir,
      '/inheritance:r',
      '/grant:r',
      '*S-1-5-18:(OI)(CI)(F)',
      '*S-1-5-32-544:(OI)(CI)(F)',
      '/remove:g',
      '*S-1-5-32-545',
      '*S-1-1-0',
      '*S-1-5-11',
    ]);
  });

  it('Everyone ou Authenticated Users também são proibidos', () => {
    // Arrange
    const execFn = vi.fn(() => aclOf('S-1-5-18', 'S-1-1-0'));

    // Act
    const result = ensureDataDirAcl(dir, execFn);

    // Assert
    expect(result).toBe('failed');
  });

  it('erro ao ler a ACL falha fechado', () => {
    expect(
      ensureDataDirAcl(dir, () => {
        throw new Error('CLM');
      })
    ).toBe('failed');
  });

  it('lê a ACL por SID (a saída do icacls é localizada) e escapa aspas simples no caminho', () => {
    // Arrange
    const execFn = vi.fn(() => aclOf('S-1-5-18'));

    // Act
    ensureDataDirAcl("C:\\Pro'gram", execFn);

    // Assert
    const [file, args] = execFn.mock.calls[0] as unknown as [string, string[]];
    expect(file).toBe('powershell.exe');
    expect(args.join(' ')).toContain("[IO.DirectoryInfo]::new('C:\\Pro''gram')");
    expect(args.join(' ')).toContain('SecurityIdentifier');
    expect(args.join(' ')).not.toContain('Get-Acl');
  });
});
