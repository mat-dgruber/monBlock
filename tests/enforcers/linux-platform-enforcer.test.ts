import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  LinuxPlatformEnforcer,
  DEFAULT_LINUX_CHROMIUM_POLICY_PATHS,
  DEFAULT_LINUX_FIREFOX_POLICY_PATH,
} from '../../src/enforcers/linux-platform-enforcer.js';
import { createPlatformEnforcer } from '../../src/enforcers/platform-enforcer.js';
import type { ProtectionRuleset } from '../../src/storage/state-store.js';

describe('LinuxPlatformEnforcer: Imposição de Sistema e Políticas no Linux (ADR-0014)', () => {
  const dummyRules: ProtectionRuleset = {
    enabledCategories: ['adult'],
    blockedDomains: ['custom-distraction.com'],
    allowlistDomains: ['work-safe.org'],
    keywords: ['gambling'],
    lockIncognito: true,
  };

  it('createPlatformEnforcer("linux") instancia LinuxPlatformEnforcer', () => {
    const enforcer = createPlatformEnforcer('linux');
    expect(enforcer).toBeInstanceOf(LinuxPlatformEnforcer);
  });

  it('gera manifestos de políticas corporativas JSON válidos para Chromium e Firefox', () => {
    const enforcer = new LinuxPlatformEnforcer();
    const artifacts = enforcer.expectedArtifacts(dummyRules);

    expect(artifacts.blockedDomains).toContain('custom-distraction.com');
    expect(artifacts.blockedDomains).toContain('pornhub.com'); // categoria adult

    const chromiumPolicy = JSON.parse(artifacts.chromiumPolicyJson);
    expect(chromiumPolicy.URLBlocklist).toBeInstanceOf(Array);
    expect(chromiumPolicy.URLBlocklist).toContain('custom-distraction.com');
    expect(chromiumPolicy.URLAllowlist).toContain('work-safe.org');
    expect(chromiumPolicy.DnsOverHttpsMode).toBe('off');
    expect(chromiumPolicy.IncognitoModeAvailability).toBe(1);

    const firefoxPolicy = JSON.parse(artifacts.firefoxPolicyJson);
    expect(firefoxPolicy.policies.WebsiteFilter.Block).toBeInstanceOf(Array);
    expect(firefoxPolicy.policies.WebsiteFilter.Block).toContain('*://*.custom-distraction.com/*');
    expect(firefoxPolicy.policies.WebsiteFilter.Exceptions).toContain('*://*.work-safe.org/*');
    expect(firefoxPolicy.policies.DNSOverHTTPS.Enabled).toBe(false);
    expect(firefoxPolicy.policies.DNSOverHTTPS.Locked).toBe(true);
    expect(firefoxPolicy.policies.DisablePrivateBrowsing).toBe(true);
  });

  it('aplica regras em /etc/hosts, grava JSONs nos diretórios gerenciados e aciona chattr e flush DNS', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linux-enforcer-'));
    const hostsPath = path.join(tmpDir, 'hosts');
    fs.writeFileSync(hostsPath, '127.0.0.1 localhost\n', 'utf8');

    const chromePolicyPath = path.join(tmpDir, 'etc/opt/chrome/policies/managed/monblock.json');
    const firefoxPolicyPath = path.join(tmpDir, 'etc/firefox/policies/policies.json');

    const executedCommands: Array<{ cmd: string; args: string[] }> = [];
    const commandExecutor = async (cmd: string, args: string[]) => {
      executedCommands.push({ cmd, args });
    };

    const enforcer = new LinuxPlatformEnforcer({
      hostsPath,
      chromiumPolicyPaths: [chromePolicyPath],
      firefoxPolicyPath,
      flushDns: true,
      commandExecutor,
    });

    const res = await enforcer.applyWebRules(dummyRules);

    // Hosts atualizado
    const updatedHosts = fs.readFileSync(hostsPath, 'utf8');
    expect(updatedHosts).toContain('0.0.0.0 custom-distraction.com');
    expect(updatedHosts).toContain('# >>> MONBLOCK START >>>');

    // Políticas JSON gravadas no disco
    expect(fs.existsSync(chromePolicyPath)).toBe(true);
    expect(fs.existsSync(firefoxPolicyPath)).toBe(true);
    const parsedChrome = JSON.parse(fs.readFileSync(chromePolicyPath, 'utf8'));
    expect(parsedChrome.URLBlocklist).toContain('custom-distraction.com');

    // Comandos de integridade e flush executados
    const chattrCalls = executedCommands.filter((c) => c.cmd === 'chattr');
    expect(chattrCalls.some((c) => c.args[0] === '-i' && c.args[1] === hostsPath)).toBe(true);
    expect(chattrCalls.some((c) => c.args[0] === '+i' && c.args[1] === hostsPath)).toBe(true);
    expect(executedCommands.some((c) => c.cmd === 'resolvectl' && c.args[0] === 'flush-caches')).toBe(true);
  });

  it('detecta desvios (drift) quando hosts ou arquivos JSON são adulterados', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linux-drift-'));
    const hostsPath = path.join(tmpDir, 'hosts');
    fs.writeFileSync(hostsPath, '127.0.0.1 localhost\n', 'utf8');
    const chromePolicyPath = path.join(tmpDir, 'chrome.json');
    const firefoxPolicyPath = path.join(tmpDir, 'firefox.json');

    const enforcer = new LinuxPlatformEnforcer({
      hostsPath,
      chromiumPolicyPaths: [chromePolicyPath],
      firefoxPolicyPath,
      commandExecutor: () => {},
    });

    await enforcer.applyWebRules(dummyRules);
    expect(enforcer.verifyApplied(dummyRules)).toEqual([]);

    // Adulterando hosts
    fs.writeFileSync(hostsPath, '127.0.0.1 localhost\n', 'utf8');
    expect(enforcer.verifyApplied(dummyRules)).toContain(hostsPath);

    // Reaplicando e adulterando política JSON
    await enforcer.applyWebRules(dummyRules);
    fs.writeFileSync(chromePolicyPath, '{}', 'utf8');
    expect(enforcer.verifyApplied(dummyRules)).toContain(chromePolicyPath);
  });

  it('protege caminhos críticos com chmod 0600 e chattr +i', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linux-crit-'));
    const secretPath = path.join(tmpDir, 'vault.key');
    fs.writeFileSync(secretPath, 'secret-data');

    const cmds: string[] = [];
    const enforcer = new LinuxPlatformEnforcer({
      commandExecutor: (cmd, args) => {
        cmds.push(`${cmd} ${args.join(' ')}`);
      },
    });

    const protectedPaths = await enforcer.protectCriticalPaths([secretPath]);
    expect(protectedPaths).toEqual([secretPath]);
    expect(cmds).toContain(`chmod 0600 ${secretPath}`);
    expect(cmds).toContain(`chattr +i ${secretPath}`);
  });

  it('restoreSystemCleanState reverte hosts e limpa arquivos JSON', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linux-clean-'));
    const hostsPath = path.join(tmpDir, 'hosts');
    fs.writeFileSync(hostsPath, '127.0.0.1 localhost\n', 'utf8');
    const chromePolicyPath = path.join(tmpDir, 'chrome.json');

    const cmds: string[] = [];
    const enforcer = new LinuxPlatformEnforcer({
      hostsPath,
      chromiumPolicyPaths: [chromePolicyPath],
      commandExecutor: (cmd, args) => {
        cmds.push(`${cmd} ${args.join(' ')}`);
      },
    });

    await enforcer.applyWebRules(dummyRules);
    expect(fs.existsSync(chromePolicyPath)).toBe(true);

    await enforcer.restoreSystemCleanState();
    expect(cmds).toContain(`chattr -i ${hostsPath}`);
    expect(fs.existsSync(chromePolicyPath)).toBe(false);
    expect(fs.readFileSync(hostsPath, 'utf8')).not.toContain('0.0.0.0 custom-distraction.com');
  });
});
