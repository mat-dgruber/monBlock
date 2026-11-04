/**
 * @file platform-enforcer.ts
 * @description Contrato `PlatformEnforcer` e implementação `MacOSPlatformEnforcer` (MOD-03).
 *
 * Integra o bloqueio atômico em `/etc/hosts` (`hosts-enforcer.ts`), as políticas
 * corporativas multi-browser (`browser-policy-enforcer.ts`) e a blindagem de
 * arquivos críticos (`chmod 0600` / `chflags uchg`) via executor injetável.
 */

import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { PREDEFINED_CATEGORIES } from '../domain/categories.js';
import { sanitizeAndNormalizeUrl } from '../domain/rule-engine.js';
import type { ProtectionRuleset } from '../storage/state-store.js';
import {
  buildBrowserPolicies,
  type BrowserPolicyParams,
} from './browser-policy-enforcer.js';
import {
  CRITICAL_INFRA_ALLOWLIST,
  applyAtomicHostsBlock,
  rollbackHostsFromBackup,
} from './hosts-enforcer.js';

const execFileAsync = promisify(execFile);

// MARK: - Funções Utilitárias de Serialização de Políticas e Restauração

/**
 * Escapa caracteres especiais XML para prevenir injeção de tags em manifestos `.plist`.
 */
export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function writeFileAtomically(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(tmpPath, content, 'utf8');
    fs.renameSync(tmpPath, filePath);
  } finally {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      // Ignora erro residual de limpeza
    }
  }
}

/**
 * Restaura o arquivo `/etc/hosts` a partir do backup `.monblock.bak`.
 */
export function restoreHostsFromBackup(hostsFilePath: string): boolean {
  return rollbackHostsFromBackup(hostsFilePath);
}

/**
 * Gera o manifesto XML `.plist` de políticas gerenciadas para Chromium (Chrome, Brave, Edge, Arc) e Safari.
 */
export function generateChromiumAndSafariPlist(params: BrowserPolicyParams): string {
  const { chromiumPolicy } = buildBrowserPolicies(params);
  const blockItems = (chromiumPolicy.URLBlocklist as string[])
    .map((d) => `      <string>${escapeXml(d)}</string>`)
    .join('\n');
  const allowItems = (chromiumPolicy.URLAllowlist as string[])
    .map((d) => `      <string>${escapeXml(d)}</string>`)
    .join('\n');
  const incognitoVal = chromiumPolicy.IncognitoModeAvailability as number;

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '  <dict>',
    '    <key>URLBlocklist</key>',
    '    <array>',
    blockItems,
    '    </array>',
    '    <key>URLAllowlist</key>',
    '    <array>',
    allowItems,
    '    </array>',
    '    <key>DnsOverHttpsMode</key>',
    '    <string>off</string>',
    '    <key>IncognitoModeAvailability</key>',
    `    <integer>${incognitoVal}</integer>`,
    '  </dict>',
    '</plist>',
  ].join('\n');
}

/**
 * Gera o JSON `policies.json` para o Mozilla Firefox.
 */
export function generateFirefoxPoliciesJson(params: BrowserPolicyParams): string {
  const { firefoxPolicy } = buildBrowserPolicies(params);
  return JSON.stringify(firefoxPolicy, null, 2);
}

// MARK: - Contrato PlatformEnforcer

export interface PlatformEnforcer {
  applyWebRules(
    rules: ProtectionRuleset,
    activeGrants?: Array<{ target: string; expiresAtMs: number }>
  ): Promise<{
    hostsPath: string;
    chromiumPlist: string;
    firefoxJson: string;
  }>;
  protectCriticalPaths(paths: string[]): Promise<string[]>;
  restoreSystemCleanState(): Promise<void>;
}

/** Opções de inicialização do `MacOSPlatformEnforcer`. */
export interface MacOSPlatformEnforcerOptions {
  hostsPath?: string;
  chromiumPlistPath?: string;
  firefoxPoliciesPath?: string;
  commandExecutor?: (cmd: string, args: string[]) => Promise<void> | void;
}

// MARK: - Implementação MacOSPlatformEnforcer

export class MacOSPlatformEnforcer implements PlatformEnforcer {
  private readonly hostsPath: string;
  private readonly chromiumPlistPath?: string;
  private readonly firefoxPoliciesPath?: string;
  private readonly commandExecutor: (cmd: string, args: string[]) => Promise<void> | void;

  constructor(options: MacOSPlatformEnforcerOptions = {}) {
    this.hostsPath = options.hostsPath ?? '/etc/hosts';
    this.chromiumPlistPath = options.chromiumPlistPath;
    this.firefoxPoliciesPath = options.firefoxPoliciesPath;
    this.commandExecutor =
      options.commandExecutor ??
      (async (cmd: string, args: string[]) => {
        const targetPath = args[args.length - 1] ?? '';
        const isSystemPath =
          targetPath.startsWith('/etc/') || targetPath.startsWith('/Library/');
        if (!isSystemPath && cmd === 'chflags') {
          return;
        }
        try {
          await execFileAsync(cmd, args);
        } catch {
          // Degrada graciosamente quando executado em userland sem privilégio root
        }
      });
  }

  private normalizeDomainList(entries: string[]): string[] {
    const result: string[] = [];
    for (const raw of entries) {
      if (typeof raw !== 'string' || /[\r\n]/.test(raw)) continue;
      const parsed = sanitizeAndNormalizeUrl(raw);
      if (parsed?.domain) {
        result.push(parsed.domain.toLowerCase().replace(/^www\./, ''));
      }
    }
    return Array.from(new Set(result));
  }

  /**
   * Consolida todos os domínios bloqueados (categorias ativas + customizados),
   * respeitando a precedência da `allowlistDomains`, `activeGrants` e `CRITICAL_INFRA_ALLOWLIST`.
   */
  private resolveEffectiveBlockedDomains(
    rules: ProtectionRuleset,
    activeGrants: Array<{ target: string; expiresAtMs: number }> = []
  ): { effectiveBlockedDomains: string[]; effectiveAllowlistDomains: string[] } {
    const normalizedAllowlist = this.normalizeDomainList(rules.allowlistDomains);
    const hasWildcardGrant = activeGrants.some(
      (g) => g.target.trim() === '*' && g.expiresAtMs > 0
    );
    if (hasWildcardGrant) {
      return {
        effectiveBlockedDomains: [],
        effectiveAllowlistDomains: normalizedAllowlist,
      };
    }

    const grantDomains = this.normalizeDomainList(
      activeGrants
        .filter((g) => g.target.trim() !== '*' && g.expiresAtMs > 0)
        .map((g) => g.target)
    );
    const allAllowed = Array.from(new Set([...normalizedAllowlist, ...grantDomains]));

    const categoryDomains = rules.enabledCategories.flatMap(
      (catId) => PREDEFINED_CATEGORIES.find((c) => c.id === catId)?.domains ?? []
    );
    const normalizedBlocked = this.normalizeDomainList([
      ...categoryDomains,
      ...rules.blockedDomains,
    ]);

    const effectiveBlockedDomains = normalizedBlocked.filter(
      (d) =>
        Boolean(d) &&
        !CRITICAL_INFRA_ALLOWLIST.has(d) &&
        !allAllowed.some((allowed) => d === allowed || d.endsWith(`.${allowed}`))
    );

    return {
      effectiveBlockedDomains,
      effectiveAllowlistDomains: allAllowed,
    };
  }

  /**
   * Aplica as regras de bloqueio web em `/etc/hosts` e gera/persiste as Browser Policies.
   */
  public async applyWebRules(
    rules: ProtectionRuleset,
    activeGrants: Array<{ target: string; expiresAtMs: number }> = []
  ): Promise<{
    hostsPath: string;
    chromiumPlist: string;
    firefoxJson: string;
  }> {
    const { effectiveBlockedDomains, effectiveAllowlistDomains } =
      this.resolveEffectiveBlockedDomains(rules, activeGrants);
    applyAtomicHostsBlock(this.hostsPath, effectiveBlockedDomains);

    const policyParams: BrowserPolicyParams = {
      blockedDomains: effectiveBlockedDomains,
      allowlistDomains: effectiveAllowlistDomains,
      lockIncognito: rules.lockIncognito,
    };

    const chromiumPlist = generateChromiumAndSafariPlist(policyParams);
    const firefoxJson = generateFirefoxPoliciesJson(policyParams);

    if (this.chromiumPlistPath) {
      writeFileAtomically(this.chromiumPlistPath, chromiumPlist);
    }

    if (this.firefoxPoliciesPath) {
      writeFileAtomically(this.firefoxPoliciesPath, firefoxJson);
    }

    return {
      hostsPath: this.hostsPath,
      chromiumPlist,
      firefoxJson,
    };
  }

  /**
   * Aplica permissões restritas (`chmod 0600`) e flag imutável (`chflags uchg`) nos caminhos críticos.
   */
  public async protectCriticalPaths(paths: string[]): Promise<string[]> {
    const protectedPaths: string[] = [];
    for (const target of paths) {
      await this.commandExecutor('chmod', ['0600', target]);
      await this.commandExecutor('chflags', ['uchg', target]);
      protectedPaths.push(target);
    }
    return protectedPaths;
  }

  /**
   * Restaura o sistema ao estado limpo original (usado exclusivamente em `UNINSTALL_AUTHORIZED`).
   */
  public async restoreSystemCleanState(): Promise<void> {
    await this.commandExecutor('chflags', ['nouchg', this.hostsPath]);
    const restored = restoreHostsFromBackup(this.hostsPath);
    if (!restored && fs.existsSync(this.hostsPath)) {
      const current = fs.readFileSync(this.hostsPath, 'utf8');
      const cleaned = current
        .replace(/# >>> MONBLOCK START >>>[\s\S]*?# <<< MONBLOCK END <<<\n?/g, '')
        .trimEnd();
      writeFileAtomically(this.hostsPath, cleaned ? `${cleaned}\n` : '');
    }

    if (this.chromiumPlistPath && fs.existsSync(this.chromiumPlistPath)) {
      fs.unlinkSync(this.chromiumPlistPath);
    }
    if (this.firefoxPoliciesPath && fs.existsSync(this.firefoxPoliciesPath)) {
      fs.unlinkSync(this.firefoxPoliciesPath);
    }
  }
}
