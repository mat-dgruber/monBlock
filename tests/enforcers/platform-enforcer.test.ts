import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  applyAtomicHostsBlock,
  rollbackHostsFromBackup,
} from '../../src/enforcers/hosts-enforcer.js';
import { buildBrowserPolicies } from '../../src/enforcers/browser-policy-enforcer.js';

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
});
