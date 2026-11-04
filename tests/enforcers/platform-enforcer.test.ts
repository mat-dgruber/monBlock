import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  applyAtomicHostsBlock,
  rollbackHostsFromBackup,
} from '../../src/enforcers/hosts-enforcer.js';
import { buildBrowserPolicies } from '../../src/enforcers/browser-policy-enforcer.js';
import {
  MacOSPlatformEnforcer,
  generateChromiumAndSafariPlist,
} from '../../src/enforcers/platform-enforcer.js';

describe('PlatformEnforcer: Atomic /etc/hosts & Multi-Browser Policies', () => {
  it('preserva entradas originais do /etc/hosts, cria .bak, filtra allowlist crítica e faz rollback limpo', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'monblock-hosts-'));
    const hostsPath = path.join(tmpDir, 'hosts');
    const originalContent = '127.0.0.1 localhost\n::1 localhost\n';
    fs.writeFileSync(hostsPath, originalContent, 'utf8');

    const res = applyAtomicHostsBlock(hostsPath, [
      'bet365.com',
      'www.BET365.com',
      '  ',
      'localhost',
      '127.0.0.1',
      'api.telegram.org',
      'accounts.google.com',
      'appleid.apple.com',
      'login.microsoftonline.com',
    ]);
    expect(res.writtenCount).toBe(1);
    expect(fs.existsSync(res.backupPath)).toBe(true);

    const updated = fs.readFileSync(hostsPath, 'utf8');
    expect(updated).toContain('127.0.0.1 localhost');
    expect(updated).toContain('0.0.0.0 bet365.com');
    expect(updated).toContain('0.0.0.0 www.bet365.com');
    expect(updated).not.toContain('0.0.0.0 api.telegram.org');

    // Segunda aplicação idempotente substitui bloco sem corromper o .monblock.bak original
    const res2 = applyAtomicHostsBlock(hostsPath, ['pornhub.com']);
    expect(res2.writtenCount).toBe(1);
    const updated2 = fs.readFileSync(hostsPath, 'utf8');
    expect(updated2).not.toContain('0.0.0.0 bet365.com');
    expect(updated2).toContain('0.0.0.0 pornhub.com');

    expect(rollbackHostsFromBackup(hostsPath)).toBe(true);
    expect(fs.readFileSync(hostsPath, 'utf8')).toBe(originalContent);
  });

  it('retorna false no rollback quando arquivo de backup não existe', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'monblock-nobak-'));
    const hostsPath = path.join(tmpDir, 'hosts');
    expect(rollbackHostsFromBackup(hostsPath)).toBe(false);
  });

  it('gera políticas para Chromium/Brave/Edge/Arc e Firefox respeitando a flag de Modo Anônimo', () => {
    const unlocked = buildBrowserPolicies({
      blockedDomains: ['bet365.com'],
      allowlistDomains: ['docs.bet365.com'],
      lockIncognito: false,
    });
    expect(unlocked.chromiumPolicy.URLBlocklist).toEqual(['bet365.com']);
    expect(unlocked.chromiumPolicy.URLAllowlist).toEqual(['docs.bet365.com']);
    expect(unlocked.chromiumPolicy.DnsOverHttpsMode).toBe('off');
    expect(unlocked.chromiumPolicy.IncognitoModeAvailability).toBe(0);
    expect((unlocked.firefoxPolicy as any).policies.DisablePrivateBrowsing).toBe(false);
    expect((unlocked.firefoxPolicy as any).policies.DNSOverHTTPS).toEqual({
      Enabled: false,
      Locked: true,
    });
    expect((unlocked.firefoxPolicy as any).policies.WebsiteFilter).toEqual({
      Block: ['*://*.bet365.com/*'],
      Exceptions: ['*://*.docs.bet365.com/*'],
    });

    const locked = buildBrowserPolicies({
      blockedDomains: ['bet365.com'],
      allowlistDomains: [],
      lockIncognito: true,
    });
    expect(locked.chromiumPolicy.IncognitoModeAvailability).toBe(1);
    expect((locked.firefoxPolicy as any).policies.DisablePrivateBrowsing).toBe(true);
  });

  it('rejeita domínios com quebras de linha (\\n, \\r), espaços ou sintaxe inválida em applyAtomicHostsBlock e não cria .bak se hosts não existir', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'monblock-hosts-sec-'));
    const hostsPath = path.join(tmpDir, 'hosts-missing');

    const res = applyAtomicHostsBlock(hostsPath, [
      'valid-domain.com',
      'evil.com\n127.0.0.1 bank.com',
      'trailing-newline.com\n',
      'carriage.com\r0.0.0.0 internal.local',
      'bad space.com',
      '-invalid-start.com',
    ]);

    expect(res.writtenCount).toBe(1);
    expect(fs.existsSync(res.backupPath)).toBe(false);

    const content = fs.readFileSync(hostsPath, 'utf8');
    expect(content).toContain('0.0.0.0 valid-domain.com');
    expect(content).not.toContain('evil.com');
    expect(content).not.toContain('bank.com');
    expect(content).not.toContain('trailing-newline.com');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('escapa caracteres especiais XML (&, <, >, ", \') em generateChromiumAndSafariPlist', () => {
    const plist = generateChromiumAndSafariPlist({
      blockedDomains: ['evil.com</string><key>Injected</key><string>x&y"z\'w'],
      allowlistDomains: ['allow<tag>&"test\'.com'],
      lockIncognito: true,
    });

    expect(plist).not.toContain('<key>Injected</key>');
    expect(plist).toContain(
      '&lt;/string&gt;&lt;key&gt;Injected&lt;/key&gt;&lt;string&gt;x&amp;y&quot;z&apos;w'
    );
    expect(plist).toContain('allow&lt;tag&gt;&amp;&quot;test&apos;.com');
  });

  it('MacOSPlatformEnforcer suporta activeGrants (* e domínio específico com subdomínios) e limpa /etc/hosts sem .bak', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'monblock-enforcer-grants-'));
    const hostsPath = path.join(tmpDir, 'hosts');
    fs.writeFileSync(hostsPath, '127.0.0.1 localhost\n', 'utf8');

    const enforcer = new MacOSPlatformEnforcer({ hostsPath });
    const rules = {
      enabledCategories: [],
      blockedDomains: ['https://www.instagram.com/reels', 'sub.instagram.com', 'tiktok.com'],
      allowlistDomains: ['https://allowed.org/path'],
      keywords: [],
      lockIncognito: true,
    };

    // 1. Grant específico para instagram.com deve liberar instagram.com e sub.instagram.com, mantendo tiktok.com
    await enforcer.applyWebRules(rules, [
      { target: 'instagram.com', expiresAtMs: Date.now() + 60_000 },
    ]);
    const hostsWithDomainGrant = fs.readFileSync(hostsPath, 'utf8');
    expect(hostsWithDomainGrant).not.toContain('instagram.com');
    expect(hostsWithDomainGrant).toContain('0.0.0.0 tiktok.com');

    // 2. Grant global '*' deve esvaziar todos os domínios bloqueados durante a concessão
    await enforcer.applyWebRules(rules, [{ target: '*', expiresAtMs: Date.now() + 60_000 }]);
    const hostsWithWildcardGrant = fs.readFileSync(hostsPath, 'utf8');
    expect(hostsWithWildcardGrant).not.toContain('tiktok.com');

    // 3. Se .monblock.bak for removido, restoreSystemCleanState ainda deve limpar o bloco MONBLOCK
    await enforcer.applyWebRules(rules, []);
    expect(fs.readFileSync(hostsPath, 'utf8')).toContain('0.0.0.0 tiktok.com');
    fs.unlinkSync(`${hostsPath}.monblock.bak`);

    await enforcer.restoreSystemCleanState();
    const cleanedHosts = fs.readFileSync(hostsPath, 'utf8');
    expect(cleanedHosts).not.toContain('MONBLOCK');
    expect(cleanedHosts).toContain('127.0.0.1 localhost');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
