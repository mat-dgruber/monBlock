import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  WindowsPlatformEnforcer,
  generateWindowsRegistryManifest,
  WINDOWS_CHROMIUM_REGISTRY_KEYS,
} from '../../src/enforcers/windows-platform-enforcer.js';
import { createPlatformEnforcer } from '../../src/enforcers/platform-enforcer.js';
import type { ProtectionRuleset } from '../../src/storage/state-store.js';

describe('WindowsPlatformEnforcer: Imposição de Sistema e Políticas no Windows (ADR-0015)', () => {
  const dummyRules: ProtectionRuleset = {
    enabledCategories: ['adult'],
    blockedDomains: ['custom-distraction.com'],
    allowlistDomains: ['work-safe.org'],
    keywords: ['gambling'],
    lockIncognito: true,
  };

  it('createPlatformEnforcer("win32") instancia WindowsPlatformEnforcer', () => {
    const enforcer = createPlatformEnforcer('win32');
    expect(enforcer).toBeInstanceOf(WindowsPlatformEnforcer);
  });

  it('gera manifesto de registro (.reg) válido para Chromium e Firefox', () => {
    const manifest = generateWindowsRegistryManifest({
      blockedDomains: ['custom-distraction.com', 'pornhub.com'],
      allowlistDomains: ['work-safe.org'],
      lockIncognito: true,
    });

    expect(manifest).toContain('Windows Registry Editor Version 5.00');
    expect(manifest).toContain('[HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Google\\Chrome]');
    expect(manifest).toContain('"DnsOverHttpsMode"="off"');
    expect(manifest).toContain('"IncognitoModeAvailability"=dword:00000001');

    expect(manifest).toContain('[HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Google\\Chrome\\URLBlocklist]');
    expect(manifest).toContain('"1"="custom-distraction.com"');
    expect(manifest).toContain('"2"="pornhub.com"');

    expect(manifest).toContain('[HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Google\\Chrome\\URLAllowlist]');
    expect(manifest).toContain('"1"="work-safe.org"');

    // Firefox
    expect(manifest).toContain('[HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Mozilla\\Firefox]');
    expect(manifest).toContain('"DisablePrivateBrowsing"=dword:00000001');
    expect(manifest).toContain('[HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Mozilla\\Firefox\\DNSOverHTTPS]');
    expect(manifest).toContain('"Enabled"=dword:00000000');
    expect(manifest).toContain('"Locked"=dword:00000001');
    expect(manifest).toContain('[HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Mozilla\\Firefox\\WebsiteFilter\\Block]');
    expect(manifest).toContain('"1"="*://*.custom-distraction.com/*"');
    expect(manifest).toContain('"2"="*://*.pornhub.com/*"');
  });

  it('aplica regras em hosts, gera arquivo .reg, importa para o registro e roda icacls/ipconfig', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'win-enforcer-'));
    const hostsPath = path.join(tmpDir, 'hosts');
    const regFilePath = path.join(tmpDir, 'policies.reg');
    fs.writeFileSync(hostsPath, '127.0.0.1 localhost\n', 'utf8');

    const executedCommands: Array<{ cmd: string; args: string[] }> = [];
    const commandExecutor = async (cmd: string, args: string[]) => {
      executedCommands.push({ cmd, args });
    };

    const enforcer = new WindowsPlatformEnforcer({
      hostsPath,
      regFilePath,
      flushDns: true,
      commandExecutor,
    });

    const res = await enforcer.applyWebRules(dummyRules);

    // Hosts atualizado
    const updatedHosts = fs.readFileSync(hostsPath, 'utf8');
    expect(updatedHosts).toContain('0.0.0.0 custom-distraction.com');
    expect(updatedHosts).toContain('# >>> MONBLOCK START >>>');

    // Arquivo .reg gerado
    expect(fs.existsSync(regFilePath)).toBe(true);
    const regContent = fs.readFileSync(regFilePath, 'utf8');
    expect(regContent).toContain('custom-distraction.com');

    // Comandos de integridade e flush executados
    expect(executedCommands.some((c) => c.cmd === 'icacls' && c.args[0] === hostsPath)).toBe(true);
    expect(executedCommands.some((c) => c.cmd === 'ipconfig' && c.args[0] === '/flushdns')).toBe(true);
    expect(executedCommands.some((c) => c.cmd === 'reg' && c.args[0] === 'import' && c.args[1] === regFilePath)).toBe(true);
  });

  it('detecta desvio quando o hosts é alterado (o Registro é coberto em windows-registry.test.ts)', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'win-drift-'));
    const hostsPath = path.join(tmpDir, 'hosts');
    const regFilePath = path.join(tmpDir, 'policies.reg');
    fs.writeFileSync(hostsPath, '127.0.0.1 localhost\n', 'utf8');

    const enforcer = new WindowsPlatformEnforcer({
      hostsPath,
      regFilePath,
      commandExecutor: () => {},
      registryReader: () => null,
    });

    await enforcer.applyWebRules(dummyRules);
    expect(enforcer.verifyApplied(dummyRules)).toEqual([]);

    // Adulterando hosts
    fs.writeFileSync(hostsPath, '127.0.0.1 localhost\n', 'utf8');
    expect(enforcer.verifyApplied(dummyRules)).toContain(hostsPath);
  });

  it('protege caminhos críticos restringindo permissões via icacls', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'win-crit-'));
    const secretPath = path.join(tmpDir, 'vault.key');
    fs.writeFileSync(secretPath, 'secret-vault-data');

    const cmds: string[] = [];
    const enforcer = new WindowsPlatformEnforcer({
      commandExecutor: (cmd, args) => {
        cmds.push(`${cmd} ${args.join(' ')}`);
      },
    });

    const protectedPaths = await enforcer.protectCriticalPaths([secretPath]);
    expect(protectedPaths).toEqual([secretPath]);
    expect(cmds.some((c) => c.includes('icacls') && c.includes('/inheritance:r'))).toBe(true);
  });

  it('restoreSystemCleanState reverte hosts, limpa chaves de registro e remove arquivo .reg', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'win-clean-'));
    const hostsPath = path.join(tmpDir, 'hosts');
    const regFilePath = path.join(tmpDir, 'policies.reg');
    fs.writeFileSync(hostsPath, '127.0.0.1 localhost\n', 'utf8');

    const cmds: string[] = [];
    const enforcer = new WindowsPlatformEnforcer({
      hostsPath,
      regFilePath,
      commandExecutor: (cmd, args) => {
        cmds.push(`${cmd} ${args.join(' ')}`);
      },
    });

    await enforcer.applyWebRules(dummyRules);
    expect(fs.existsSync(regFilePath)).toBe(true);

    await enforcer.restoreSystemCleanState();
    expect(fs.existsSync(regFilePath)).toBe(false);
    expect(fs.readFileSync(hostsPath, 'utf8')).not.toContain('0.0.0.0 custom-distraction.com');
    expect(cmds.some((c) => c.startsWith('reg delete') && c.includes('URLBlocklist'))).toBe(true);
  });
});
