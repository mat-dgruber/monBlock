/**
 * @file platform-enforcer.ts
 * @description Contrato `PlatformEnforcer` e implementação `MacOSPlatformEnforcer` (MOD-03).
 *
 * Integra o bloqueio atômico em `/etc/hosts` (`hosts-enforcer.ts`), as políticas
 * corporativas multi-browser (`browser-policy-enforcer.ts`) e a blindagem de
 * arquivos críticos (`chmod 0600` / `chflags uchg`) via executor injetável.
 */

import fs from 'node:fs';
import path from 'node:path';
import { PREDEFINED_CATEGORIES } from '../domain/categories.js';
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

// MARK: - Funções Utilitárias de Serialização de Políticas e Restauração

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
    .map((d) => `      <string>${d}</string>`)
    .join('\n');
  const allowItems = (chromiumPolicy.URLAllowlist as string[])
    .map((d) => `      <string>${d}</string>`)
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
  applyWebRules(rules: ProtectionRuleset): Promise<{
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
      (async () => {
        // Executor no-op padrão para ambientes sem privilégio root
      });
  }

  /**
   * Consolida todos os domínios bloqueados (categorias ativas + customizados),
   * respeitando a precedência da `allowlistDomains` e `CRITICAL_INFRA_ALLOWLIST`.
   */
  private resolveEffectiveBlockedDomains(rules: ProtectionRuleset): string[] {
    const allowSet = new Set(
      rules.allowlistDomains.map((d) => d.trim().toLowerCase().replace(/^www\./, ''))
    );
    const categoryDomains = rules.enabledCategories.flatMap(
      (catId) => PREDEFINED_CATEGORIES.find((c) => c.id === catId)?.domains ?? []
    );
    const combined = [...categoryDomains, ...rules.blockedDomains];
    return Array.from(
      new Set(
        combined
          .map((d) => d.trim().toLowerCase().replace(/^www\./, ''))
          .filter((d) => d && !allowSet.has(d) && !CRITICAL_INFRA_ALLOWLIST.has(d))
      )
    );
  }

  /**
   * Aplica as regras de bloqueio web em `/etc/hosts` e gera/persiste as Browser Policies.
   */
  public async applyWebRules(rules: ProtectionRuleset): Promise<{
    hostsPath: string;
    chromiumPlist: string;
    firefoxJson: string;
  }> {
    const effectiveBlockedDomains = this.resolveEffectiveBlockedDomains(rules);
    applyAtomicHostsBlock(this.hostsPath, effectiveBlockedDomains);

    const policyParams: BrowserPolicyParams = {
      blockedDomains: effectiveBlockedDomains,
      allowlistDomains: rules.allowlistDomains,
      lockIncognito: rules.lockIncognito,
    };

    const chromiumPlist = generateChromiumAndSafariPlist(policyParams);
    const firefoxJson = generateFirefoxPoliciesJson(policyParams);

    if (this.chromiumPlistPath) {
      fs.mkdirSync(path.dirname(this.chromiumPlistPath), { recursive: true });
      fs.writeFileSync(this.chromiumPlistPath, chromiumPlist, 'utf8');
    }

    if (this.firefoxPoliciesPath) {
      fs.mkdirSync(path.dirname(this.firefoxPoliciesPath), { recursive: true });
      fs.writeFileSync(this.firefoxPoliciesPath, firefoxJson, 'utf8');
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
    restoreHostsFromBackup(this.hostsPath);

    if (this.chromiumPlistPath && fs.existsSync(this.chromiumPlistPath)) {
      fs.unlinkSync(this.chromiumPlistPath);
    }
    if (this.firefoxPoliciesPath && fs.existsSync(this.firefoxPoliciesPath)) {
      fs.unlinkSync(this.firefoxPoliciesPath);
    }
  }
}
