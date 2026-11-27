import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { replaceFileFromTemp } from '../../src/enforcers/hosts-enforcer.js';

let dir = '';
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const setup = () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-replace-'));
  const target = path.join(dir, 'hosts');
  const tmp = path.join(dir, 'hosts.tmp');
  fs.writeFileSync(target, 'antigo');
  fs.writeFileSync(tmp, 'novo');
  return { target, tmp };
};

const err = (code: string) => Object.assign(new Error(code), { code });

describe('replaceFileFromTemp', () => {
  it('troca por rename quando dá (caminho atômico)', () => {
    // Arrange
    const { target, tmp } = setup();

    // Act
    replaceFileFromTemp(tmp, target, 'win32');

    // Assert
    expect(fs.readFileSync(target, 'utf8')).toBe('novo');
    expect(fs.existsSync(tmp)).toBe(false);
  });

  it.each(['EPERM', 'EBUSY', 'EACCES'])(
    'no Windows, rename com %s (hosts aberto pelo cliente DNS/antivírus) cai para cópia por cima',
    (code) => {
      // Arrange
      const { target, tmp } = setup();
      const rename = vi.fn(() => {
        throw err(code);
      });

      // Act
      replaceFileFromTemp(tmp, target, 'win32', rename);

      // Assert
      expect(rename).toHaveBeenCalledOnce();
      expect(fs.readFileSync(target, 'utf8')).toBe('novo');
    }
  );

  it('cópia travada (EBUSY intermitente do antivírus) é repetida com espera até passar', () => {
    // Arrange
    const { target, tmp } = setup();
    let calls = 0;
    const sleeps: number[] = [];
    const copy = (from: string, to: string) => {
      calls += 1;
      if (calls < 3) throw err('EBUSY');
      fs.copyFileSync(from, to);
    };

    // Act
    replaceFileFromTemp(tmp, target, 'win32', () => { throw err('EPERM'); }, copy, (ms) => sleeps.push(ms));

    // Assert
    expect(calls).toBe(3);
    expect(sleeps).toEqual([0, 100, 200]);
    expect(fs.readFileSync(target, 'utf8')).toBe('novo');
  });

  it('desiste depois de ~3 s de travas e propaga o erro', () => {
    // Arrange
    const { target, tmp } = setup();
    const copy = vi.fn(() => { throw err('EBUSY'); });

    // Act / Assert
    expect(() => replaceFileFromTemp(tmp, target, 'win32', () => { throw err('EPERM'); }, copy, () => {})).toThrow('EBUSY');
    expect(copy).toHaveBeenCalledTimes(6);
  });

  it('fora do Windows o erro do rename sobe (sem fallback não atômico)', () => {
    // Arrange
    const { target, tmp } = setup();

    // Act / Assert
    expect(() =>
      replaceFileFromTemp(tmp, target, 'linux', () => {
        throw err('EPERM');
      })
    ).toThrow('EPERM');
    expect(fs.readFileSync(target, 'utf8')).toBe('antigo');
  });

  it('outros erros do rename sobem também no Windows', () => {
    // Arrange
    const { target, tmp } = setup();

    // Act / Assert
    expect(() =>
      replaceFileFromTemp(tmp, target, 'win32', () => {
        throw err('ENOSPC');
      })
    ).toThrow('ENOSPC');
  });
});
