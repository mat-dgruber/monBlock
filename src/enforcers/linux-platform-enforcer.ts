/**
 * @file linux-platform-enforcer.ts
 * @description Implementação Linux do contrato PlatformEnforcer (ADR-0013, ADR-0014).
 *
 * Imposição de regras web via:
 * 1. Camada 1: /etc/hosts bloqueando domínios em 0.0.0.0, com trava imutável `chattr +i`
 *    e descarga de cache DNS via `resolvectl flush-caches` (ou `systemd-resolve`).
 * 2. Camada 2: Políticas corporativas multi-navegador em formato JSON gravadas em
 *    diretórios padrão de políticas gerenciadas (/etc/opt/chrome/policies/managed/,
 *    /etc/chromium/policies/managed/, /etc/brave/policies/managed/, /etc/firefox/policies/, etc.).
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { promisify } from 'node:util';
import { POLICY_DOMAIN_LIMIT } from '../domain/categories.js';
import type { ProtectionRuleset } from '../storage/state-store.js';
import {
  buildBrowserPolicies,
  type BrowserPolicyParams,
} from './browser-policy-enforcer.js';
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

/** Caminhos padrão Linux para políticas gerenciadas de navegadores Chromium. */
export const DEFAULT_LINUX_CHROMIUM_POLICY_PATHS = [
  '/etc/opt/chrome/policies/managed/monblock.json',
  '/etc/chromium/policies/managed/monblock.json',
  '/etc/brave/policies/managed/monblock.json',
  '/etc/opt/edge/policies/managed/monblock.json',
  '/etc/vivaldi/policies/managed/monblock.json',
] as const;

/** Caminho padrão Linux para políticas gerenciadas do Mozilla Firefox. */
export const DEFAULT_LINUX_FIREFOX_POLICY_PATH = '/etc/firefox/policies/policies.json';

export interface LinuxPlatformEnforcerOptions {
  hostsPath?: string;
  chromiumPolicyPaths?: string[];
  chromiumPlistPaths?: string[];
  firefoxPolicyPath?: string;
  firefoxPlistPath?: string;
  flushDns?: boolean;
  commandExecutor?: (cmd: string, args: string[]) => Promise<void> | void;
}

export function defaultLinuxCommandExecutor(isRoot = false): (cmd: string, args: string[]) => Promise<void> {
  return async (cmd: string, args: string[]): Promise<void> => {
    try {
      if (isRoot) {
        await execFileAsync(cmd, args);
      } else {
        await execFileAsync('sudo', ['-n', cmd, ...args]);
      }
    } catch {
      // Ignora falhas residuais em ambientes restritos/CI
    }
  };
}

export class LinuxPlatformEnforcer implements PlatformEnforcer {
  private readonly hostsPath: string;
  private readonly chromiumPolicyPaths: string[];
  private readonly firefoxPolicyPath?: string;
  private readonly flushDns: boolean;
  private readonly commandExecutor: (cmd: string, args: string[]) => Promise<void> | void;

  constructor(options: LinuxPlatformEnforcerOptions = {}) {
    this.hostsPath = options.hostsPath ?? '/etc/hosts';
    const isCustomHosts = Boolean(options.hostsPath && options.hostsPath !== '/etc/hosts');
    this.chromiumPolicyPaths =
      options.chromiumPolicyPaths ??
      options.chromiumPlistPaths ??
      (isCustomHosts ? [] : [...DEFAULT_LINUX_CHROMIUM_POLICY_PATHS]);
    this.firefoxPolicyPath =
      options.firefoxPolicyPath ??
      options.firefoxPlistPath ??
      (isCustomHosts ? undefined : DEFAULT_LINUX_FIREFOX_POLICY_PATH);
    this.flushDns = options.flushDns ?? this.hostsPath === '/etc/hosts';
    this.commandExecutor =
      options.commandExecutor ?? defaultLinuxCommandExecutor(process.getuid?.() === 0);
  }

  public expectedArtifacts(
    rules: ProtectionRuleset,
    activeGrants: Array<{ target: string; expiresAtMs: number }> = []
  ): {
    blockedDomains: string[];
    chromiumPolicyJson: string;
    firefoxPolicyJson: string;
  } {
    const { effectiveBlockedDomains, effectiveAllowlistDomains } =
      resolveEffectiveBlockedDomains(rules, activeGrants);

    const policyParams: BrowserPolicyParams = {
      blockedDomains: effectiveBlockedDomains.slice(0, POLICY_DOMAIN_LIMIT),
      allowlistDomains: effectiveAllowlistDomains,
      lockIncognito: rules.lockIncognito,
    };

    const { chromiumPolicy, firefoxPolicy } = buildBrowserPolicies(policyParams);

    return {
      blockedDomains: effectiveBlockedDomains,
      chromiumPolicyJson: JSON.stringify(chromiumPolicy, null, 2),
      firefoxPolicyJson: JSON.stringify(firefoxPolicy, null, 2),
    };
  }

  private hostsModeWrong(): boolean {
    return fs.existsSync(this.hostsPath) && (fs.statSync(this.hostsPath).mode & 0o777) !== HOSTS_FILE_MODE;
  }

  public async applyWebRules(
    rules: ProtectionRuleset,
    activeGrants: Array<{ target: string; expiresAtMs: number }> = []
  ): Promise<{
    hostsPath: string;
    chromiumPolicyJson: string;
    firefoxPolicyJson: string;
    chromiumPlist: string;
    firefoxPlist: string;
  }> {
    const expected = this.expectedArtifacts(rules, activeGrants);

    const current = fs.existsSync(this.hostsPath) ? fs.readFileSync(this.hostsPath, 'utf8') : '';
    const contentDiffers = buildManagedHostsContent(current, expected.blockedDomains).content !== current;

    if (contentDiffers || this.hostsModeWrong()) {
      // Trava chattr +i impede escrita/rename atômico: remove temporariamente se configurada
      await this.commandExecutor('chattr', ['-i', this.hostsPath]);
      try {
        applyAtomicHostsBlock(this.hostsPath, expected.blockedDomains);
        if (fs.existsSync(this.hostsPath)) fs.chmodSync(this.hostsPath, HOSTS_FILE_MODE);
      } finally {
        await this.commandExecutor('chattr', ['+i', this.hostsPath]);
      }
    }

    if (this.flushDns) {
      try {
        await this.commandExecutor('resolvectl', ['flush-caches']);
      } catch {
        try {
          await this.commandExecutor('systemd-resolve', ['--flush-caches']);
        } catch {
          // Ignora se systemd-resolved não estiver ativo
        }
      }
    }

    // Grava políticas JSON dos navegadores
    for (const p of this.chromiumPolicyPaths) {
      writeIfChanged(p, expected.chromiumPolicyJson);
    }
    if (this.firefoxPolicyPath) {
      writeIfChanged(this.firefoxPolicyPath, expected.firefoxPolicyJson);
    }

    return {
      hostsPath: this.hostsPath,
      chromiumPolicyJson: expected.chromiumPolicyJson,
      firefoxPolicyJson: expected.firefoxPolicyJson,
      chromiumPlist: expected.chromiumPolicyJson,
      firefoxPlist: expected.firefoxPolicyJson,
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
    if (buildManagedHostsContent(hosts, expected.blockedDomains).content !== hosts || this.hostsModeWrong()) {
      drift.push(this.hostsPath);
    }

    for (const p of this.chromiumPolicyPaths) {
      if (read(p) !== expected.chromiumPolicyJson) drift.push(p);
    }
    if (this.firefoxPolicyPath && read(this.firefoxPolicyPath) !== expected.firefoxPolicyJson) {
      drift.push(this.firefoxPolicyPath);
    }

    return drift;
  }

  public async protectCriticalPaths(paths: string[]): Promise<string[]> {
    const protectedPaths: string[] = [];
    for (const target of paths) {
      await this.commandExecutor('chmod', ['0600', target]);
      await this.commandExecutor('chattr', ['+i', target]);
      protectedPaths.push(target);
    }
    return protectedPaths;
  }

  public async restoreSystemCleanState(): Promise<void> {
    await this.commandExecutor('chattr', ['-i', this.hostsPath]);
    const restored = rollbackHostsFromBackup(this.hostsPath);
    if (!restored && fs.existsSync(this.hostsPath)) {
      const current = fs.readFileSync(this.hostsPath, 'utf8');
      const cleaned = current
        .replace(/# >>> MONBLOCK START >>>[\s\S]*?# <<< MONBLOCK END <<<\n?/g, '')
        .trimEnd();
      writeFileAtomically(this.hostsPath, cleaned ? `${cleaned}\n` : '');
    }

    for (const p of [...this.chromiumPolicyPaths, ...(this.firefoxPolicyPath ? [this.firefoxPolicyPath] : [])]) {
      fs.rmSync(p, { force: true });
    }
  }
}
