import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TripleStateStore,
  createDefaultPersistentState,
  resolveVaultIntegrityKey,
  type MonBlockPersistentState,
} from '../../src/storage/state-store.js';

describe('TripleStateStore (MOD-03 — Persistência Tripla Self-Healing)', () => {
  let tmpDir: string;
  let primaryPath: string;
  let keychainPath: string;
  let sealPath: string;
  let store: TripleStateStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'monblock-state-store-'));
    primaryPath = path.join(tmpDir, 'primary', 'state.json');
    keychainPath = path.join(tmpDir, 'keychain', 'keychain.vault');
    sealPath = path.join(tmpDir, 'seal', 'partner.seal');
    store = new TripleStateStore({
      primaryPath,
      keychainPath,
      sealPath,
      integrityKey: 'test-system-integrity-key-01',
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('deve inicializar o estado padrão com categoria adult e lockIncognito ativos e gravar nos 3 cofres', () => {
    // Arrange & Act
    const result = store.loadAndReconcile();

    // Assert
    expect(result.healedVaults).toEqual([]);
    expect(result.tamperDetected).toBe(false);
    expect(result.state.paired).toBe(false);
    expect(result.state.rules.enabledCategories).toContain('adult');
    expect(result.state.rules.lockIncognito).toBe(true);
    expect(fs.existsSync(primaryPath)).toBe(true);
    expect(fs.existsSync(keychainPath)).toBe(true);
    expect(fs.existsSync(sealPath)).toBe(true);
  });

  it('deve reconstruir automaticamente 1 cofre deletado a partir do quórum dos outros 2 cofres íntegros (Self-Healing)', () => {
    // Arrange
    const pairedState: MonBlockPersistentState = {
      ...createDefaultPersistentState(1_700_000_000_000),
      version: 2,
      paired: true,
      rules: {
        enabledCategories: ['adult', 'gambling'],
        blockedDomains: ['custom-bet.com'],
        allowlistDomains: [],
        keywords: ['cassino'],
        lockIncognito: true,
      },
      partnerCredentials: {
        passwordHash: 'scrypt$00112233445566778899aabbccddeeff$' + 'a'.repeat(128),
        salt: '00112233445566778899aabbccddeeff',
        hmacSecret: 'partner-hmac-secret',
        recoveryCodeHashes: ['hash1', 'hash2'],
        usedTokens: ['UNLOCK-15M-ABCDEF1234'],
      },
      updatedAtMs: 1_700_000_005_000,
    };
    store.save(pairedState);

    // Act — Usuário deleta manualmente o cofre primário
    fs.unlinkSync(primaryPath);
    expect(fs.existsSync(primaryPath)).toBe(false);

    const reconciled = store.loadAndReconcile({ expectPaired: true });

    // Assert
    expect(reconciled.healedVaults).toEqual(['primary']);
    expect(reconciled.tamperDetected).toBe(true);
    expect(reconciled.state.paired).toBe(true);
    expect(reconciled.state.rules.enabledCategories).toEqual(['adult', 'gambling']);
    expect(reconciled.state.partnerCredentials?.hmacSecret).toBe('partner-hmac-secret');
    expect(fs.existsSync(primaryPath)).toBe(true);
  });

  it('deve detectar adulteração de assinatura HMAC em 1 cofre e restaurá-lo a partir dos cofres válidos', () => {
    // Arrange
    const state = {
      ...createDefaultPersistentState(1_700_000_000_000),
      version: 3,
      paired: true,
      updatedAtMs: 1_700_000_010_000,
    };
    store.save(state);

    // Act — Adultera bytes cifrados do cofre seal (a tag GCM deve rejeitar)
    const rawSeal = fs.readFileSync(sealPath, 'utf8');
    const bytes = Buffer.from(rawSeal.slice('MBV1.'.length), 'base64');
    bytes[bytes.length - 1] ^= 0xff;
    fs.writeFileSync(sealPath, `MBV1.${bytes.toString('base64')}`, 'utf8');

    const reconciled = store.loadAndReconcile({ expectPaired: true });

    // Assert
    expect(reconciled.healedVaults).toEqual(['seal']);
    expect(reconciled.tamperDetected).toBe(true);
    expect(reconciled.state.rules.lockIncognito).toBe(true);
    expect(reconciled.state.rules.enabledCategories).toContain('adult');
  });

  it('deve eleger o cofre íntegro de maior updatedAtMs quando houver divergência de versão entre cofres', () => {
    // Arrange
    const olderState = {
      ...createDefaultPersistentState(1_700_000_000_000),
      version: 1,
      paired: true,
      updatedAtMs: 1_700_000_001_000,
    };
    store.save(olderState);
    const olderKeychainSnapshot = fs.readFileSync(keychainPath, 'utf8');

    const newerState: MonBlockPersistentState = {
      ...olderState,
      version: 2,
      rules: {
        ...olderState.rules,
        enabledCategories: ['adult', 'social'],
      },
      updatedAtMs: 1_700_000_099_000,
    };
    store.save(newerState);

    // Simula queda de energia em que o cofre keychain ficou na versão antiga
    fs.writeFileSync(keychainPath, olderKeychainSnapshot, 'utf8');

    // Act
    const reconciled = store.loadAndReconcile({ expectPaired: true });

    // Assert
    expect(reconciled.state.version).toBe(2);
    expect(reconciled.state.rules.enabledCategories).toEqual(['adult', 'social']);
    expect(reconciled.healedVaults).toEqual(['keychain']);
  });

  it('deve entrar em modo Fail-Closed (adult + lockIncognito ativos + alerta de adulteração) se todos os 3 cofres forem corrompidos após pareamento', () => {
    // Arrange
    const pairedState = {
      ...createDefaultPersistentState(1_700_000_000_000),
      version: 4,
      paired: true,
      updatedAtMs: 1_700_000_020_000,
    };
    store.save(pairedState);

    // Act — Corrompe todos os 3 cofres simultaneamente
    fs.writeFileSync(primaryPath, '{"corrupted": true}', 'utf8');
    fs.writeFileSync(keychainPath, 'invalid-json-payload', 'utf8');
    fs.unlinkSync(sealPath);

    const reconciled = store.loadAndReconcile({ expectPaired: true });

    // Assert
    expect(reconciled.tamperDetected).toBe(true);
    expect(reconciled.state.tamperLockdown).toBe(true);
    expect(reconciled.state.paired).toBe(true);
    expect(reconciled.state.rules.enabledCategories).toContain('adult');
    expect(reconciled.state.rules.lockIncognito).toBe(true);
    expect(reconciled.alert).toMatch(/Fail-Closed|adulteração/i);
    expect(reconciled.healedVaults).toEqual(['primary', 'keychain', 'seal']);
  });

  it('deve cifrar os cofres em disco sem expor hmacSecret em texto puro e rejeitar envelope JSON forjado', () => {
    const pairedState: MonBlockPersistentState = {
      ...createDefaultPersistentState(1_700_000_000_000),
      version: 2,
      paired: true,
      partnerCredentials: {
        passwordHash: 'scrypt$00112233445566778899aabbccddeeff$' + 'a'.repeat(128),
        salt: '00112233445566778899aabbccddeeff',
        hmacSecret: 'secret-inside-json',
        recoveryCodeHashes: [],
        usedTokens: [],
      },
      updatedAtMs: 1_700_000_030_000,
    };

    // Act
    store.save(pairedState);

    // Assert — nenhum cofre contém o segredo legível
    for (const p of [primaryPath, keychainPath, sealPath]) {
      const raw = fs.readFileSync(p, 'utf8');
      expect(raw.startsWith('MBV1.')).toBe(true);
      expect(raw).not.toContain('secret-inside-json');
    }

    // Assert — um envelope JSON em texto puro (mesmo com HMAC correto) é rejeitado
    const forgedHmac = crypto
      .createHmac('sha256', 'test-system-integrity-key-01')
      .update(JSON.stringify(pairedState))
      .digest('hex');
    const forged = JSON.stringify({ state: pairedState, hmac: forgedHmac });
    fs.writeFileSync(primaryPath, forged, 'utf8');
    fs.writeFileSync(keychainPath, forged, 'utf8');
    fs.writeFileSync(sealPath, forged, 'utf8');
    expect(store.loadAndReconcile({ expectPaired: true }).tamperDetected).toBe(true);
  });

  it('não deve sobrescrever cofres legítimos em disco quando ocorrer erro transitório de I/O (ex: EACCES/EMFILE)', () => {
    const pairedState: MonBlockPersistentState = {
      ...createDefaultPersistentState(1_700_000_000_000),
      version: 5,
      paired: true,
      rules: {
        enabledCategories: ['adult', 'gambling'],
        blockedDomains: ['preserve-me.com'],
        allowlistDomains: [],
        keywords: [],
        lockIncognito: true,
      },
      updatedAtMs: 1_700_000_050_000,
    };
    store.save(pairedState);
    const originalPrimaryContent = fs.readFileSync(primaryPath, 'utf8');

    const readSpy = vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
      const err = new Error('Permission denied') as NodeJS.ErrnoException;
      err.code = 'EACCES';
      throw err;
    });

    try {
      const reconciled = store.loadAndReconcile({ expectPaired: true });
      expect(reconciled.state.tamperLockdown).toBe(true);
      expect(reconciled.healedVaults).toEqual([]);
    } finally {
      readSpy.mockRestore();
    }

    // Os cofres em disco não podem ter sido destruídos pelo estado Fail-Closed
    expect(fs.readFileSync(primaryPath, 'utf8')).toBe(originalPrimaryContent);
    const afterRecovery = store.loadAndReconcile({ expectPaired: true });
    expect(afterRecovery.state.version).toBe(5);
    expect(afterRecovery.state.rules.blockedDomains).toEqual(['preserve-me.com']);
  });

  it('save() deve tolerar falha de escrita em 1 cofre (quórum 2 de 3) e lançar erro se menos de 2 cofres tiverem sucesso', () => {
    const state = createDefaultPersistentState(1_700_000_000_000);
    let callCount = 0;
    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation((oldPath, newPath) => {
      callCount++;
      if (callCount === 1) {
        throw new Error('Falha simulada em 1 cofre');
      }
      return fs.copyFileSync(oldPath, newPath);
    });

    try {
      expect(() => store.save(state)).not.toThrow();
    } finally {
      renameSpy.mockRestore();
    }

    const failTwoSpy = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('Falha simultânea nos cofres');
    });

    try {
      expect(() => store.save(state)).toThrow(/Falha simultânea/);
    } finally {
      failTwoSpy.mockRestore();
    }
  });

  it('resolveVaultIntegrityKey() deve priorizar chave explicita, variavel de ambiente e falhar sem chave (sem derivacao previsivel)', () => {
    // 1. Chave explícita
    expect(resolveVaultIntegrityKey('chave-customizada')).toBe('chave-customizada');

    // 2. Variável de ambiente
    process.env.MONBLOCK_VAULT_KEY = 'env-vault-key-xyz';
    try {
      expect(resolveVaultIntegrityKey()).toBe('env-vault-key-xyz');
    } finally {
      delete process.env.MONBLOCK_VAULT_KEY;
    }

    // 3. Sem chave: falha explícita em vez de derivar algo recomputável
    expect(() => resolveVaultIntegrityKey()).toThrow(/Chave de integridade/);
  });
});
