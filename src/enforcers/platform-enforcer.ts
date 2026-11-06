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
  buildManagedHostsContent,
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

function writeIfChanged(filePath: string, content: string): void {
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === content) return;
  writeFileAtomically(filePath, content);
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

/** Serializa JSON simples (dict/array/string/bool/inteiro) em XML plist, com escape de XML. */
export function toPlistXml(value: unknown): string {
  const node = (v: unknown, pad: string): string => {
    if (typeof v === 'boolean') return `${pad}<${v}/>`;
    if (typeof v === 'number') return `${pad}<integer>${Math.trunc(v)}</integer>`;
    if (typeof v === 'string') return `${pad}<string>${escapeXml(v)}</string>`;
    if (Array.isArray(v)) {
      return [`${pad}<array>`, ...v.map((x) => node(x, `${pad}  `)), `${pad}</array>`].join('\n');
    }
    const entries = Object.entries((v ?? {}) as Record<string, unknown>).filter(([, x]) => x !== undefined);
    return [
      `${pad}<dict>`,
      ...entries.flatMap(([k, x]) => [`${pad}  <key>${escapeXml(k)}</key>`, node(x, `${pad}  `)]),
      `${pad}</dict>`,
    ].join('\n');
  };
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    node(value, ''),
    '</plist>',
    '',
  ].join('\n');
}

/**
 * Plist do Firefox em `/Library/Preferences/org.mozilla.firefox.plist` (spike S2):
 * `EnterprisePoliciesEnabled` + as mesmas políticas do `policies.json`, sem tocar no bundle.
 */
export function generateFirefoxPlist(params: BrowserPolicyParams): string {
  const { firefoxPolicy } = buildBrowserPolicies(params);
  return toPlistXml({
    EnterprisePoliciesEnabled: true,
    ...(firefoxPolicy.policies as Record<string, unknown>),
  });
}

/** Bundle IDs Chromium cobertos pelo perfil e pela escrita direta. */
export const CHROMIUM_BUNDLE_IDS = ['com.google.Chrome', 'com.brave.Browser', 'com.microsoft.Edge'] as const;

/** UUID estável derivado de um nome, para que o perfil regenerado substitua o anterior. */
function stableUuid(name: string): string {
  const h = crypto.createHash('sha256').update(name).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`.toUpperCase();
}

/**
 * Perfil `.mobileconfig` (escopo System) com as políticas Chromium (spike S1: plists escritos
 * à mão em `/Library/Managed Preferences` sem MDM são removidos pelo macOS). Instalado no
 * onboarding com aprovação do usuário; remover exige Admin.
 */
export function generateBrowserMobileconfig(params: BrowserPolicyParams): string {
  const { chromiumPolicy } = buildBrowserPolicies(params);
  const root = 'com.ccat.monblock.browsers';
  return toPlistXml({
    PayloadType: 'Configuration',
    PayloadVersion: 1,
    PayloadIdentifier: root,
    PayloadUUID: stableUuid(root),
    PayloadDisplayName: 'monBlock — Proteção dos navegadores',
    PayloadDescription: 'Bloqueia sites das categorias ativas no monBlock e desativa o DNS seguro do navegador.',
    PayloadOrganization: 'monBlock',
    PayloadScope: 'System',
    PayloadRemovalDisallowed: true,
    PayloadContent: CHROMIUM_BUNDLE_IDS.map((bundleId) => ({
      PayloadType: bundleId,
      PayloadVersion: 1,
      PayloadIdentifier: `${root}.${bundleId}`,
      PayloadUUID: stableUuid(`${root}.${bundleId}`),
      PayloadDisplayName: bundleId,
      ...chromiumPolicy,
    })),
  });
}

/**
 * Executor padrão (`execFile`, sem shell). Como root a falha propaga: o daemon precisa saber
 * que a imposição não aconteceu. Em userland não há privilégio, então a falha é esperada.
 */
export function defaultCommandExecutor(isRoot: boolean): (cmd: string, args: string[]) => Promise<void> {
  return async (cmd, args) => {
    const targetPath = args[args.length - 1] ?? '';
    const isSystemPath = targetPath.startsWith('/etc/') || targetPath.startsWith('/Library/');
    if (!isSystemPath && cmd === 'chflags') return;
    try {
      await execFileAsync(cmd, args);
    } catch (err) {
      if (isRoot) throw err;
    }
  };
}

// MARK: - Contrato PlatformEnforcer

export interface PlatformEnforcer {
  applyWebRules(
    rules: ProtectionRuleset,
    activeGrants?: Array<{ target: string; expiresAtMs: number }>
  ): Promise<{
    hostsPath: string;
    chromiumPlist: string;
    firefoxPlist: string;
  }>;
  protectCriticalPaths(paths: string[]): Promise<string[]>;
  restoreSystemCleanState(): Promise<void>;
}

/** Opções de inicialização do `MacOSPlatformEnforcer`. */
export interface MacOSPlatformEnforcerOptions {
  hostsPath?: string;
  /** Ex.: `/Library/Managed Preferences/<bundleId>.plist` (reforço do perfil `.mobileconfig`). */
  chromiumPlistPaths?: string[];
  /** Ex.: `/Library/Preferences/org.mozilla.firefox.plist`. */
  firefoxPlistPath?: string;
  /** Padrão: só quando o alvo é o `/etc/hosts` real. */
  flushDns?: boolean;
  commandExecutor?: (cmd: string, args: string[]) => Promise<void> | void;
}

// MARK: - Implementação MacOSPlatformEnforcer

export class MacOSPlatformEnforcer implements PlatformEnforcer {
  private readonly hostsPath: string;
  private readonly chromiumPlistPaths: string[];
  private readonly firefoxPlistPath?: string;
  private readonly flushDns: boolean;
  private readonly commandExecutor: (cmd: string, args: string[]) => Promise<void> | void;

  constructor(options: MacOSPlatformEnforcerOptions = {}) {
    this.hostsPath = options.hostsPath ?? '/etc/hosts';
    this.chromiumPlistPaths = options.chromiumPlistPaths ?? [];
    this.firefoxPlistPath = options.firefoxPlistPath;
    this.flushDns = options.flushDns ?? this.hostsPath === '/etc/hosts';
    this.commandExecutor =
      options.commandExecutor ?? defaultCommandExecutor(process.getuid?.() === 0);
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
    firefoxPlist: string;
  }> {
    const expected = this.expectedArtifacts(rules, activeGrants);

    const current = fs.existsSync(this.hostsPath) ? fs.readFileSync(this.hostsPath, 'utf8') : '';
    if (buildManagedHostsContent(current, expected.blockedDomains).content !== current) {
      // `uchg` impede o rename atômico: tira, grava, recoloca.
      await this.commandExecutor('chflags', ['nouchg', this.hostsPath]);
      applyAtomicHostsBlock(this.hostsPath, expected.blockedDomains);
      await this.commandExecutor('chflags', ['uchg', this.hostsPath]);
      if (this.flushDns) {
        await this.commandExecutor('dscacheutil', ['-flushcache']);
        await this.commandExecutor('killall', ['-HUP', 'mDNSResponder']);
      }
    }

    for (const p of this.chromiumPlistPaths) writeIfChanged(p, expected.chromiumPlist);
    if (this.firefoxPlistPath) writeIfChanged(this.firefoxPlistPath, expected.firefoxPlist);

    return {
      hostsPath: this.hostsPath,
      chromiumPlist: expected.chromiumPlist,
      firefoxPlist: expected.firefoxPlist,
    };
  }

  private expectedArtifacts(
    rules: ProtectionRuleset,
    activeGrants: Array<{ target: string; expiresAtMs: number }>
  ): { blockedDomains: string[]; chromiumPlist: string; firefoxPlist: string } {
    const { effectiveBlockedDomains, effectiveAllowlistDomains } =
      this.resolveEffectiveBlockedDomains(rules, activeGrants);
    const policyParams: BrowserPolicyParams = {
      blockedDomains: effectiveBlockedDomains,
      allowlistDomains: effectiveAllowlistDomains,
      lockIncognito: rules.lockIncognito,
    };
    return {
      blockedDomains: effectiveBlockedDomains,
      chromiumPlist: generateChromiumAndSafariPlist(policyParams),
      firefoxPlist: generateFirefoxPlist(policyParams),
    };
  }

  /** Caminhos cujo conteúdo diverge do esperado para estas regras (adulteração ou remoção). */
  public verifyApplied(
    rules: ProtectionRuleset,
    activeGrants: Array<{ target: string; expiresAtMs: number }> = []
  ): string[] {
    const expected = this.expectedArtifacts(rules, activeGrants);
    const read = (p: string): string | null => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null);
    const drift: string[] = [];
    const hosts = read(this.hostsPath) ?? '';
    if (buildManagedHostsContent(hosts, expected.blockedDomains).content !== hosts) drift.push(this.hostsPath);
    for (const p of this.chromiumPlistPaths) if (read(p) !== expected.chromiumPlist) drift.push(p);
    if (this.firefoxPlistPath && read(this.firefoxPlistPath) !== expected.firefoxPlist) {
      drift.push(this.firefoxPlistPath);
    }
    return drift;
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

    for (const p of [...this.chromiumPlistPaths, ...(this.firefoxPlistPath ? [this.firefoxPlistPath] : [])]) {
      fs.rmSync(p, { force: true });
    }
  }
}
