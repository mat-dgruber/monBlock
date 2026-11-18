/**
 * @file windows-platform-enforcer.ts
 * @description Implementação Windows do contrato PlatformEnforcer (ADR-0013, ADR-0015).
 *
 * Imposição de regras web via:
 * 1. Camada 1: %SystemRoot%\System32\drivers\etc\hosts com DACLs NTFS restritas (icacls)
 *    e descarga de cache DNS via `ipconfig /flushdns`.
 * 2. Camada 2: Políticas corporativas multi-navegador no Windows Registry sob
 *    `HKLM\SOFTWARE\Policies` (Google Chrome, Microsoft Edge, Brave, Mozilla Firefox, Vivaldi),
 *    geradas como manifesto de registro e aplicadas via `reg.exe`.
 */

import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { POLICY_DOMAIN_LIMIT } from '../domain/categories.js';
import type { ProtectionRuleset } from '../storage/state-store.js';
import {
  HOSTS_FILE_MODE,
  applyAtomicHostsBlock,
  buildManagedHostsContent,
  rollbackHostsFromBackup,
} from './hosts-enforcer.js';
import {
  resolveEffectiveBlockedDomains,
  writeFileAtomically,
  writeIfChanged,
  type PlatformEnforcer,
} from './platform-enforcer.js';

const execFileAsync = promisify(execFile);

/** Chaves canônicas de políticas de navegadores Chromium no Registro do Windows (HKLM). */
export const WINDOWS_CHROMIUM_REGISTRY_KEYS = [
  'HKLM\\SOFTWARE\\Policies\\Google\\Chrome',
  'HKLM\\SOFTWARE\\Policies\\Microsoft\\Edge',
  'HKLM\\SOFTWARE\\Policies\\BraveSoftware\\Brave',
  'HKLM\\SOFTWARE\\Policies\\Chromium',
  'HKLM\\SOFTWARE\\Policies\\Vivaldi',
] as const;

/** Chave canônica de políticas do Mozilla Firefox no Registro do Windows (HKLM). */
export const WINDOWS_FIREFOX_REGISTRY_KEY = 'HKLM\\SOFTWARE\\Policies\\Mozilla\\Firefox';

export interface WindowsPlatformEnforcerOptions {
  hostsPath?: string;
  regFilePath?: string;
  flushDns?: boolean;
  commandExecutor?: (cmd: string, args: string[]) => Promise<void> | void;
}

export function defaultWindowsCommandExecutor(): (cmd: string, args: string[]) => Promise<void> {
  return async (cmd: string, args: string[]): Promise<void> => {
    try {
      await execFileAsync(cmd, args);
    } catch {
      // Ignora falhas residuais em ambientes de desenvolvimento/CI não-Windows
    }
  };
}

/**
 * Converte pares de chaves e listas em sintaxe oficial de arquivo .reg (Windows Registry Editor Version 5.00).
 */
export function generateWindowsRegistryManifest(params: {
  blockedDomains: string[];
  allowlistDomains: string[];
  lockIncognito: boolean;
  chromiumKeys?: readonly string[];
  firefoxKey?: string;
}): string {
  const lines: string[] = ['Windows Registry Editor Version 5.00', ''];
  const chromiumKeys = params.chromiumKeys ?? WINDOWS_CHROMIUM_REGISTRY_KEYS;
  const firefoxKey = params.firefoxKey ?? WINDOWS_FIREFOX_REGISTRY_KEY;

  for (const rootKey of chromiumKeys) {
    lines.push(`[${rootKey}]`);
    lines.push('"DnsOverHttpsMode"="off"');
    lines.push(`"IncognitoModeAvailability"=dword:${params.lockIncognito ? '00000001' : '00000000'}`);
    lines.push('');

    lines.push(`[${rootKey}\\URLBlocklist]`);
    params.blockedDomains.forEach((domain, idx) => {
      lines.push(`"${idx + 1}"="${domain}"`);
    });
    lines.push('');

    lines.push(`[${rootKey}\\URLAllowlist]`);
    params.allowlistDomains.forEach((domain, idx) => {
      lines.push(`"${idx + 1}"="${domain}"`);
    });
    lines.push('');
  }

  // Firefox Policies
  lines.push(`[${firefoxKey}]`);
  lines.push(`"DisablePrivateBrowsing"=dword:${params.lockIncognito ? '00000001' : '00000000'}`);
  lines.push('');

  lines.push(`[${firefoxKey}\\DNSOverHTTPS]`);
  lines.push('"Enabled"=dword:00000000');
  lines.push('"Locked"=dword:00000001');
  lines.push('');

  lines.push(`[${firefoxKey}\\WebsiteFilter\\Block]`);
  params.blockedDomains.forEach((domain, idx) => {
    lines.push(`"${idx + 1}"="*://*.${domain}/*"`);
  });
  lines.push('');

  lines.push(`[${firefoxKey}\\WebsiteFilter\\Exceptions]`);
  params.allowlistDomains.forEach((domain, idx) => {
    lines.push(`"${idx + 1}"="*://*.${domain}/*"`);
  });
  lines.push('');

  return lines.join('\r\n');
}

export class WindowsPlatformEnforcer implements PlatformEnforcer {
  private readonly hostsPath: string;
  private readonly regFilePath?: string;
  private readonly flushDns: boolean;
  private readonly commandExecutor: (cmd: string, args: string[]) => Promise<void> | void;

  constructor(options: WindowsPlatformEnforcerOptions = {}) {
    const isWindows = process.platform === 'win32';
    const defaultHosts =
      isWindows && process.env.SystemRoot
        ? path.join(process.env.SystemRoot, 'System32\\drivers\\etc\\hosts')
        : 'C:\\Windows\\System32\\drivers\\etc\\hosts';

    this.hostsPath = options.hostsPath ?? defaultHosts;
    this.regFilePath = options.regFilePath;
    this.flushDns = options.flushDns ?? (this.hostsPath.toLowerCase().includes('drivers\\etc\\hosts'));
    this.commandExecutor = options.commandExecutor ?? defaultWindowsCommandExecutor();
  }

  public expectedArtifacts(
    rules: ProtectionRuleset,
    activeGrants: Array<{ target: string; expiresAtMs: number }> = []
  ): {
    blockedDomains: string[];
    registryExport: string;
  } {
    const { effectiveBlockedDomains, effectiveAllowlistDomains } =
      resolveEffectiveBlockedDomains(rules, activeGrants);

    const registryExport = generateWindowsRegistryManifest({
      blockedDomains: effectiveBlockedDomains.slice(0, POLICY_DOMAIN_LIMIT),
      allowlistDomains: effectiveAllowlistDomains,
      lockIncognito: rules.lockIncognito,
    });

    return {
      blockedDomains: effectiveBlockedDomains,
      registryExport,
    };
  }

  public async applyWebRules(
    rules: ProtectionRuleset,
    activeGrants: Array<{ target: string; expiresAtMs: number }> = []
  ): Promise<{
    hostsPath: string;
    registryExport: string;
    chromiumPlist: string;
    firefoxPlist: string;
  }> {
    const expected = this.expectedArtifacts(rules, activeGrants);

    const current = fs.existsSync(this.hostsPath) ? fs.readFileSync(this.hostsPath, 'utf8') : '';
    const contentDiffers = buildManagedHostsContent(current, expected.blockedDomains).content !== current;

    if (contentDiffers) {
      applyAtomicHostsBlock(this.hostsPath, expected.blockedDomains);
      // Aplica ACL restrita: Administradores e SYSTEM com controle total, Usuários apenas leitura
      await this.commandExecutor('icacls', [
        this.hostsPath,
        '/grant:r',
        '*S-1-5-18:(F)',
        '*S-1-5-32-544:(F)',
        '*S-1-5-32-545:(R)',
      ]);
    }

    if (this.flushDns) {
      try {
        await this.commandExecutor('ipconfig', ['/flushdns']);
      } catch {
        // Ignora erro se executado fora do Windows nativo
      }
    }

    // Persiste arquivo .reg se caminho configurado ou grava em arquivo temporário para importação
    const regTarget = this.regFilePath ?? `${this.hostsPath}.monblock.reg`;
    writeIfChanged(regTarget, expected.registryExport);

    // Importa as chaves geradas para o Registro do Windows
    await this.commandExecutor('reg', ['import', regTarget]);

    return {
      hostsPath: this.hostsPath,
      registryExport: expected.registryExport,
      chromiumPlist: expected.registryExport,
      firefoxPlist: expected.registryExport,
    };
  }

  public verifyApplied(
    rules: ProtectionRuleset,
    activeGrants: Array<{ target: string; expiresAtMs: number }> = []
  ): string[] {
    const expected = this.expectedArtifacts(rules, activeGrants);
    const read = (p: string): string | null => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null);
    const drift: string[] = [];

    const hosts = read(this.hostsPath) ?? '';
    if (buildManagedHostsContent(hosts, expected.blockedDomains).content !== hosts) {
      drift.push(this.hostsPath);
    }

    const regTarget = this.regFilePath ?? `${this.hostsPath}.monblock.reg`;
    if (read(regTarget) !== expected.registryExport) {
      drift.push(regTarget);
    }

    return drift;
  }

  public async protectCriticalPaths(paths: string[]): Promise<string[]> {
    const protectedPaths: string[] = [];
    for (const target of paths) {
      // Remove herança e restringe permissões a SYSTEM e Administradores
      await this.commandExecutor('icacls', [
        target,
        '/inheritance:r',
        '/grant:r',
        '*S-1-5-18:(F)',
        '*S-1-5-32-544:(F)',
      ]);
      protectedPaths.push(target);
    }
    return protectedPaths;
  }

  public async restoreSystemCleanState(): Promise<void> {
    const restored = rollbackHostsFromBackup(this.hostsPath);
    if (!restored && fs.existsSync(this.hostsPath)) {
      const current = fs.readFileSync(this.hostsPath, 'utf8');
      const cleaned = current
        .replace(/# >>> MONBLOCK START >>>[\s\S]*?# <<< MONBLOCK END <<<\n?/g, '')
        .trimEnd();
      writeFileAtomically(this.hostsPath, cleaned ? `${cleaned}\n` : '');
    }

    // Limpa chaves do registro criadas pelo monBlock
    for (const rootKey of WINDOWS_CHROMIUM_REGISTRY_KEYS) {
      await this.commandExecutor('reg', ['delete', `${rootKey}\\URLBlocklist`, '/f']);
      await this.commandExecutor('reg', ['delete', `${rootKey}\\URLAllowlist`, '/f']);
    }
    await this.commandExecutor('reg', ['delete', `${WINDOWS_FIREFOX_REGISTRY_KEY}\\WebsiteFilter`, '/f']);

    const regTarget = this.regFilePath ?? `${this.hostsPath}.monblock.reg`;
    if (fs.existsSync(regTarget)) {
      fs.rmSync(regTarget, { force: true });
    }
  }
}
