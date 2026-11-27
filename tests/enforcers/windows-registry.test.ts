import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  WINDOWS_CHROMIUM_REGISTRY_KEYS,
  WINDOWS_FIREFOX_REGISTRY_KEY,
  WindowsPlatformEnforcer,
  buildManagedRegistry,
  generateWindowsRegistryManifest,
  parseRegQueryOutput,
} from '../../src/enforcers/windows-platform-enforcer.js';
import type { ProtectionRuleset } from '../../src/storage/state-store.js';

const rules: ProtectionRuleset = {
  enabledCategories: [],
  blockedDomains: ['a.com', 'b.com'],
  allowlistDomains: ['ok.org'],
  keywords: [],
  lockIncognito: true,
};

/** Simula `reg query <chave> /s` a partir do estado esperado (o que o Windows devolveria após o import). */
function fakeRegistryFrom(manifestRules: ProtectionRuleset, mutate?: (out: Map<string, string>) => void) {
  const managed = buildManagedRegistry({
    blockedDomains: manifestRules.blockedDomains,
    allowlistDomains: manifestRules.allowlistDomains,
    lockIncognito: manifestRules.lockIncognito,
  });
  const byRoot = new Map<string, string>();
  for (const root of [...WINDOWS_CHROMIUM_REGISTRY_KEYS, WINDOWS_FIREFOX_REGISTRY_KEY]) {
    const blocks: string[] = [];
    for (const k of managed) {
      if (k.key !== root && !k.key.startsWith(`${root}\\`)) continue;
      const lines = [k.key.replace(/^HKLM\\/, 'HKEY_LOCAL_MACHINE\\')];
      for (const [name, v] of k.values) {
        lines.push(`    ${name}    ${v.type}    ${v.type === 'REG_DWORD' ? `0x${v.data.toString(16)}` : v.data}`);
      }
      blocks.push(lines.join('\r\n'));
    }
    byRoot.set(root, `\r\n${blocks.join('\r\n\r\n')}\r\n`);
  }
  mutate?.(byRoot);
  return (key: string): string => {
    const out = byRoot.get(key);
    if (out === undefined) throw new Error('ERRO: O sistema não pôde localizar a chave do Registro ou valor especificado.');
    return out;
  };
}

describe('W9 — manifesto .reg com HKEY_LOCAL_MACHINE e limpeza de valores antigos', () => {
  it('nenhuma linha de chave usa a abreviação HKLM\\ (o reg import a ignora em silêncio, S0/P1)', () => {
    // Act
    const manifest = generateWindowsRegistryManifest({ blockedDomains: ['a.com'], allowlistDomains: [], lockIncognito: false });

    // Assert
    const keyLines = manifest.split('\r\n').filter((l) => l.startsWith('['));
    expect(keyLines.length).toBeGreaterThan(0);
    for (const l of keyLines) expect(l).toMatch(/^\[-?HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\/);
  });

  it('apaga cada lista ([-chave]) antes de recriá-la', () => {
    // Act
    const lines = generateWindowsRegistryManifest({ blockedDomains: ['a.com'], allowlistDomains: ['ok.org'], lockIncognito: true }).split('\r\n');

    // Assert
    for (const list of ['Google\\Chrome\\URLBlocklist', 'Microsoft\\Edge\\URLAllowlist', 'Mozilla\\Firefox\\WebsiteFilter']) {
      const del = lines.indexOf(`[-HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\${list}]`);
      expect(del).toBeGreaterThanOrEqual(0);
      const create = lines.findIndex((l) => l.startsWith(`[HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\${list}`));
      expect(create).toBeGreaterThan(del);
    }
  });

  it('lista vazia só apaga a chave, sem recriá-la vazia', () => {
    // Act
    const lines = generateWindowsRegistryManifest({ blockedDomains: ['a.com'], allowlistDomains: [], lockIncognito: false }).split('\r\n');

    // Assert
    expect(lines).toContain('[-HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Google\\Chrome\\URLAllowlist]');
    expect(lines).not.toContain('[HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Google\\Chrome\\URLAllowlist]');
    expect(lines).not.toContain('[HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Mozilla\\Firefox\\WebsiteFilter\\Exceptions]');
  });

  it('trava a navegação anônima com o nome de política de cada navegador (Edge usa InPrivateModeAvailability)', () => {
    // Act
    const manifest = generateWindowsRegistryManifest({ blockedDomains: [], allowlistDomains: [], lockIncognito: true });

    // Assert
    const edge = manifest.split('[HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Edge]')[1].split('\r\n\r\n')[0];
    expect(edge).toContain('"InPrivateModeAvailability"=dword:00000001');
    expect(edge).not.toContain('IncognitoModeAvailability');
    const chrome = manifest.split('[HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Google\\Chrome]')[1].split('\r\n\r\n')[0];
    expect(chrome).toContain('"IncognitoModeAvailability"=dword:00000001');
  });

  it('escapa aspas e barras invertidas nos valores', () => {
    // Act
    const manifest = generateWindowsRegistryManifest({ blockedDomains: ['a"b\\c'], allowlistDomains: [], lockIncognito: false });

    // Assert
    expect(manifest).toContain('"1"="a\\"b\\\\c"');
  });

  it('o arquivo .reg gravado não começa com BOM UTF-8 (UTF-8 com BOM falha no reg import, S0/P2)', async () => {
    // Arrange
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'win-bom-'));
    const regFilePath = path.join(dir, 'p.reg');
    const enforcer = new WindowsPlatformEnforcer({
      hostsPath: path.join(dir, 'hosts'),
      regFilePath,
      commandExecutor: () => {},
      registryReader: () => null,
    });

    // Act
    await enforcer.applyWebRules(rules);

    // Assert
    const head = fs.readFileSync(regFilePath).subarray(0, 3);
    expect([...head]).not.toEqual([0xef, 0xbb, 0xbf]);
    expect(head.toString('utf8')).toBe('Win');
  });
});

describe('W10 — falhas parciais e drift lido do Registro', () => {
  const setup = (opts: { failOn?: string; reader?: (key: string) => string | null } = {}) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'win-w10-'));
    const hostsPath = path.join(dir, 'hosts');
    fs.writeFileSync(hostsPath, '127.0.0.1 localhost\n');
    const enforcer = new WindowsPlatformEnforcer({
      hostsPath,
      regFilePath: path.join(dir, 'p.reg'),
      flushDns: true,
      commandExecutor: (cmd, args) => {
        if (opts.failOn && `${cmd} ${args[0]}` === opts.failOn) throw new Error(`${cmd} falhou`);
      },
      registryReader: opts.reader ?? fakeRegistryFrom(rules),
    });
    return { enforcer, hostsPath };
  };

  it('reg import com falha: o hosts ainda é aplicado e o drift traz registry:import', async () => {
    // Arrange
    const { enforcer, hostsPath } = setup({ failOn: 'reg import' });

    // Act
    await enforcer.applyWebRules(rules);

    // Assert
    expect(fs.readFileSync(hostsPath, 'utf8')).toContain('0.0.0.0 a.com');
    expect(enforcer.verifyApplied(rules)).toContain('registry:import');
  });

  it('icacls e flushdns com falha continuam até o import e viram drift', async () => {
    // Arrange
    const calls: string[] = [];
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'win-w10b-'));
    const e2 = new WindowsPlatformEnforcer({
      hostsPath: path.join(dir, 'hosts'),
      regFilePath: path.join(dir, 'p.reg'),
      flushDns: true,
      commandExecutor: (cmd, args) => {
        calls.push(cmd);
        if (cmd !== 'reg') throw new Error('falhou');
      },
      registryReader: fakeRegistryFrom(rules),
    });

    // Act
    await e2.applyWebRules(rules);

    // Assert: o flushdns roda em segundo plano e não entra no drift (o cache DNS expira sozinho).
    expect(calls).toEqual(expect.arrayContaining(['icacls', 'ipconfig', 'reg']));
    expect(e2.verifyApplied(rules)).toContain('hosts:acl');
    expect(e2.verifyApplied(rules)).not.toContain('dns:flush');
  });

  it('Registro igual ao esperado e hosts aplicado: sem drift', async () => {
    // Arrange
    const { enforcer } = setup();

    // Act
    await enforcer.applyWebRules(rules);

    // Assert
    expect(enforcer.verifyApplied(rules)).toEqual([]);
  });

  it('chave apagada por um admin vira drift registry:<chave>', async () => {
    // Arrange
    const reader = fakeRegistryFrom(rules, (m) => m.delete('HKLM\\SOFTWARE\\Policies\\Google\\Chrome'));
    const { enforcer } = setup({ reader });

    // Act
    await enforcer.applyWebRules(rules);

    // Assert
    expect(enforcer.verifyApplied(rules)).toContain('registry:HKLM\\SOFTWARE\\Policies\\Google\\Chrome');
  });

  it('valor extra numa lista (allowlist velha) vira drift', async () => {
    // Arrange
    const edge = 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Edge';
    const reader = fakeRegistryFrom(rules, (m) =>
      m.set(edge, `${m.get(edge)}\r\nHKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Edge\\URLAllowlist\r\n    2    REG_SZ    velho.com\r\n`)
    );
    const { enforcer } = setup({ reader });

    // Act
    await enforcer.applyWebRules(rules);

    // Assert
    expect(enforcer.verifyApplied(rules)).toContain(`registry:${edge}`);
  });

  it('valor divergente (incógnito liberado) vira drift', async () => {
    // Arrange
    const chrome = 'HKLM\\SOFTWARE\\Policies\\Google\\Chrome';
    const reader = fakeRegistryFrom(rules, (m) =>
      m.set(chrome, m.get(chrome)!.replace('IncognitoModeAvailability    REG_DWORD    0x1', 'IncognitoModeAvailability    REG_DWORD    0x0'))
    );
    const { enforcer } = setup({ reader });

    // Act
    await enforcer.applyWebRules(rules);

    // Assert
    expect(enforcer.verifyApplied(rules)).toContain(`registry:${chrome}`);
  });

  it('valores não gerenciados na chave raiz (política corporativa) não são drift', async () => {
    // Arrange
    const chrome = 'HKLM\\SOFTWARE\\Policies\\Google\\Chrome';
    const reader = fakeRegistryFrom(rules, (m) =>
      m.set(chrome, m.get(chrome)!.replace('DnsOverHttpsMode', 'HomepageLocation    REG_SZ    https://intra\r\n    DnsOverHttpsMode'))
    );
    const { enforcer } = setup({ reader });

    // Act
    await enforcer.applyWebRules(rules);

    // Assert
    expect(enforcer.verifyApplied(rules)).toEqual([]);
  });

  it('erro ou timeout ao ler o Registro é drift (fail-closed)', async () => {
    // Arrange
    const { enforcer } = setup({
      reader: () => {
        throw new Error('ETIMEDOUT');
      },
    });

    // Act
    await enforcer.applyWebRules(rules);

    // Assert
    expect(enforcer.verifyApplied(rules)).toHaveLength(WINDOWS_CHROMIUM_REGISTRY_KEYS.length + 1);
  });

  it('leitor indisponível (fora do Windows) pula a checagem do Registro', async () => {
    // Arrange
    const { enforcer } = setup({ reader: () => null });

    // Act
    await enforcer.applyWebRules(rules);

    // Assert
    expect(enforcer.verifyApplied(rules)).toEqual([]);
  });

  it('as falhas do apply anterior somem quando o próximo apply funciona', async () => {
    // Arrange
    let fail = true;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'win-w10c-'));
    const enforcer = new WindowsPlatformEnforcer({
      hostsPath: path.join(dir, 'hosts'),
      regFilePath: path.join(dir, 'p.reg'),
      commandExecutor: (cmd) => {
        if (fail && cmd === 'reg') throw new Error('x');
      },
      registryReader: fakeRegistryFrom(rules),
    });
    await enforcer.applyWebRules(rules);
    fail = false;

    // Act
    await enforcer.applyWebRules(rules);

    // Assert
    expect(enforcer.verifyApplied(rules)).toEqual([]);
  });
});

describe('flushdns: o cliente DNS do Windows demora com hosts grande (visto como SYSTEM: ~25 s)', () => {
  const build = (executor: (cmd: string) => Promise<void> | void) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'win-flush-'));
    const hostsPath = path.join(dir, 'hosts');
    fs.writeFileSync(hostsPath, '127.0.0.1 localhost\n');
    return new WindowsPlatformEnforcer({
      hostsPath,
      regFilePath: path.join(dir, 'p.reg'),
      flushDns: true,
      commandExecutor: (cmd) => executor(cmd),
      registryReader: () => null,
    });
  };

  it('não espera o flushdns terminar: o apply volta mesmo com o ipconfig travado', async () => {
    // Arrange
    const enforcer = build((cmd) => (cmd === 'ipconfig' ? new Promise<void>(() => {}) : undefined));

    // Act
    const result = await Promise.race([
      enforcer.applyWebRules(rules).then(() => 'voltou'),
      new Promise((r) => setTimeout(() => r('travou'), 300)),
    ]);

    // Assert
    expect(result).toBe('voltou');
  });

  it('só roda o flushdns quando o hosts mudou (não a cada tick)', async () => {
    // Arrange
    const calls: string[] = [];
    const enforcer = build((cmd) => {
      calls.push(cmd);
    });

    // Act
    await enforcer.applyWebRules(rules);
    await enforcer.applyWebRules(rules);

    // Assert
    expect(calls.filter((c) => c === 'ipconfig')).toHaveLength(1);
  });
});

describe('parseRegQueryOutput (saída real do reg.exe, pt-BR)', () => {
  it('lê chaves, REG_SZ e REG_DWORD, inclusive dado vazio', () => {
    // Arrange
    const out = [
      '',
      'HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Edge',
      '    DnsOverHttpsMode    REG_SZ    off',
      '    IncognitoModeAvailability    REG_DWORD    0x1',
      '    Vazio    REG_SZ    ',
      '',
      'HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Edge\\URLBlocklist',
      '    1    REG_SZ    example.com',
      '',
    ].join('\r\n');

    // Act
    const parsed = parseRegQueryOutput(out);

    // Assert
    expect(parsed.get('HKLM\\SOFTWARE\\Policies\\Microsoft\\Edge')).toEqual(
      new Map([
        ['DnsOverHttpsMode', { type: 'REG_SZ', data: 'off' }],
        ['IncognitoModeAvailability', { type: 'REG_DWORD', data: 1 }],
        ['Vazio', { type: 'REG_SZ', data: '' }],
      ])
    );
    expect(parsed.get('HKLM\\SOFTWARE\\Policies\\Microsoft\\Edge\\URLBlocklist')?.get('1')).toEqual({ type: 'REG_SZ', data: 'example.com' });
  });
});
