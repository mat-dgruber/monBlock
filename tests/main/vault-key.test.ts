import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadOrCreateVaultKey } from '../../src/main/main.js';

// Fake reversível do safeStorage: "cifra" invertendo bytes, falha se o conteúdo não tiver o marcador.
const fakeSafeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (s: string) => Buffer.from(`ENC:${s}`, 'utf8').reverse(),
  decryptString: (b: Buffer) => {
    const plain = Buffer.from(b).reverse().toString('utf8');
    if (!plain.startsWith('ENC:')) throw new Error('decrypt failed');
    return plain.slice(4);
  },
};

describe('loadOrCreateVaultKey (chave aleatória por instalação)', () => {
  let tmpDir: string;
  let keyPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'monblock-vault-key-'));
    keyPath = path.join(tmpDir, 'vault.key');
    delete process.env.MONBLOCK_INTEGRITY_KEY;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('deve gerar chave de 256 bits, gravá-la cifrada e reutilizá-la nas execuções seguintes', () => {
    // Act
    const first = loadOrCreateVaultKey(keyPath, fakeSafeStorage);
    const second = loadOrCreateVaultKey(keyPath, fakeSafeStorage);

    // Assert
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toBe(first);
    expect(fs.readFileSync(keyPath, 'utf8')).not.toContain(first);
  });

  it('deve regenerar a chave quando o arquivo não puder ser decifrado (cofres antigos caem em Fail-Closed)', () => {
    // Arrange
    fs.writeFileSync(keyPath, 'lixo-ilegivel');

    // Act
    const key = loadOrCreateVaultKey(keyPath, fakeSafeStorage);

    // Assert
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(loadOrCreateVaultKey(keyPath, fakeSafeStorage)).toBe(key);
  });

  it('deve recusar operar sem safeStorage disponível em vez de cair numa chave previsível', () => {
    expect(() =>
      loadOrCreateVaultKey(keyPath, { ...fakeSafeStorage, isEncryptionAvailable: () => false })
    ).toThrow(/safeStorage/);
  });
});
