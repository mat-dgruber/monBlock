/**
 * @file macos-watcher.ts
 * @description Camada 3 de Bloqueio Web (MOD-01) — Watcher Universal de Navegadores macOS.
 * Monitora abas ativas nos navegadores suportados (Safari, Google Chrome, Brave Browser,
 * Arc, Microsoft Edge e Firefox), aplicando debounce de 150ms, higienização Zero-PII,
 * verificação de TemporaryGrants e redirecionamento seguro para `127.0.0.1:49152/blocked`.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  evaluateUrlAndTitle,
  sanitizeAndNormalizeUrl,
  type BlockDecision,
  type RuleEngineState,
  type TemporaryGrant,
} from '../domain/rule-engine.js';

export type { TemporaryGrant };

const execFileAsync = promisify(execFile);

/** Lista imutável de navegadores macOS monitorados pelo Watcher Universal. */
export const SUPPORTED_MACOS_BROWSERS = [
  'Safari',
  'Google Chrome',
  'Brave Browser',
  'Arc',
  'Microsoft Edge',
  'Firefox',
] as const;

export type SupportedMacOSBrowser = (typeof SUPPORTED_MACOS_BROWSERS)[number];

/** Snapshot da aba em foco retornado pelo adaptador de SO. */
export interface ActiveTabSnapshot {
  browser: string;
  url: string;
  title: string;
}

/** Contrato injetável de inspeção e redirecionamento de abas para desacoplamento e testes. */
export interface BrowserTabAdapter {
  getActiveTab(): Promise<ActiveTabSnapshot | null>;
  redirectActiveTab(browser: string, targetUrl: string): Promise<boolean | void>;
}

/** Compatibilidade para concessão temporária com `target` (canônico) ou `domain` (legado). */
export type CompatibleTemporaryGrant =
  | TemporaryGrant
  | { domain: string; target?: string; expiresAtMs: number };

/** Resultado estruturado de um ciclo de inspeção do Watcher. */
export interface WatcherInterceptionResult {
  blocked: boolean;
  debounced?: boolean;
  grantedTemporary?: boolean;
  browser?: string;
  domain?: string;
  cleanUrl?: string;
  redirectUrl?: string;
  reason?: BlockDecision['reason'];
  ruleLabel?: string;
}

// AppleScripts parametrizados via `on run argv` (Zero interpolação de string para prevenir Command Injection)
const INSPECT_FRONT_BROWSER_SCRIPT = `
on run argv
  tell application "System Events"
    set frontApp to name of first application process whose frontmost is true
  end tell
  if frontApp is "Safari" then
    tell application "Safari"
      if (count of windows) is 0 then return ""
      set tabUrl to URL of current tab of front window
      set tabTitle to name of current tab of front window
      return frontApp & "\\n" & tabUrl & "\\n" & tabTitle
    end tell
  else if frontApp is in {"Google Chrome", "Brave Browser", "Arc", "Microsoft Edge"} then
    using terms from application "Google Chrome"
      tell application frontApp
        if (count of windows) is 0 then return ""
        set tabUrl to URL of active tab of front window
        set tabTitle to title of active tab of front window
        return frontApp & "\\n" & tabUrl & "\\n" & tabTitle
      end tell
    end using terms from
  else if frontApp is "Firefox" then
    tell application "System Events"
      tell process "Firefox"
        set winTitle to name of front window
        return "Firefox\\nhttps://firefox.active.tab\\n" & winTitle
      end tell
    end tell
  end if
  return ""
end run
`;

const REDIRECT_TAB_SCRIPT = `
on run argv
  set browserName to item 1 of argv
  set safeRedirectUrl to item 2 of argv
  if browserName is "Safari" then
    tell application "Safari"
      if (count of windows) > 0 then
        set URL of current tab of front window to safeRedirectUrl
      end if
    end tell
  else if browserName is in {"Google Chrome", "Brave Browser", "Arc", "Microsoft Edge"} then
    using terms from application "Google Chrome"
      tell application browserName
        if (count of windows) > 0 then
          set URL of active tab of front window to safeRedirectUrl
        end if
      end tell
    end using terms from
  else if browserName is "Firefox" then
    open location safeRedirectUrl
  end if
end run
`;

export type ExecFileExecutor = (
  file: string,
  args: readonly string[],
  options: { timeout: number }
) => Promise<{ stdout: string; stderr?: string }>;

/**
 * Implementação real de `BrowserTabAdapter` baseada em `execFile('osascript')` com
 * argumentos isolados em array e timeout estrito de 1500ms.
 */
export class OsascriptBrowserTabAdapter implements BrowserTabAdapter {
  private readonly timeoutMs: number;
  private readonly execFn: ExecFileExecutor;

  constructor(
    timeoutOrExecFn: number | ExecFileExecutor = execFileAsync,
    execFn: ExecFileExecutor = execFileAsync
  ) {
    if (typeof timeoutOrExecFn === 'function') {
      this.timeoutMs = 1500;
      this.execFn = timeoutOrExecFn;
    } else {
      this.timeoutMs = timeoutOrExecFn;
      this.execFn = execFn;
    }
  }

  async getActiveTab(): Promise<ActiveTabSnapshot | null> {
    try {
      const { stdout } = await this.execFn('osascript', ['-e', INSPECT_FRONT_BROWSER_SCRIPT], {
        timeout: this.timeoutMs,
      });
      const lines = stdout.replace(/\r?\n$/, '').split('\n');
      if (lines.length < 2) return null;
      const browser = (lines[0] ?? '').trim();
      const url = (lines[1] ?? '').trim();
      const title = lines.slice(2).join(' ').trim();
      if (!browser || !url) return null;
      return {
        browser,
        url,
        title,
      };
    } catch {
      return null;
    }
  }

  async redirectActiveTab(browser: string, targetUrl: string): Promise<boolean> {
    if (!SUPPORTED_MACOS_BROWSERS.includes(browser as SupportedMacOSBrowser)) {
      return false;
    }
    if (!targetUrl.startsWith('http://127.0.0.1:49152/blocked')) {
      throw new Error('URL de redirecionamento inválida: permitido apenas 127.0.0.1:49152/blocked.');
    }
    try {
      await this.execFn('osascript', ['-e', REDIRECT_TAB_SCRIPT, browser, targetUrl], {
        timeout: this.timeoutMs,
      });
      return true;
    } catch {
      return false;
    }
  }
}

export interface MacOSBrowserWatcherOptions {
  adapter?: BrowserTabAdapter;
  getRules: () => RuleEngineState;
  debounceMs?: number;
  initialGrants?: CompatibleTemporaryGrant[];
}

/**
 * Watcher Universal macOS com cache de última aba (`lastCheckedKey`), debounce configurável (`150ms`),
 * suporte a `TemporaryGrant` e higienização Zero-PII antes do redirecionamento.
 */
export class MacOSBrowserWatcher {
  private readonly adapter: BrowserTabAdapter;
  private readonly getRules: () => RuleEngineState;
  private readonly debounceMs: number;
  private readonly activeGrants = new Map<string, number>();
  private lastCheckedKey = '';
  private lastCheckedAtMs = -Infinity;

  constructor(options: MacOSBrowserWatcherOptions) {
    this.adapter = options.adapter ?? new OsascriptBrowserTabAdapter();
    this.getRules = options.getRules;
    this.debounceMs = options.debounceMs ?? 150;

    for (const grant of options.initialGrants ?? []) {
      const rawTarget =
        'target' in grant && grant.target
          ? grant.target
          : 'domain' in grant
            ? grant.domain
            : '';
      if (rawTarget) {
        this.grantTemporaryAccess(rawTarget, grant.expiresAtMs);
      }
    }
  }

  /**
   * Registra uma concessão temporária para um domínio ou curinga ('*') até `expiresAtMs`.
   */
  grantTemporaryAccess(domain: string, expiresAtMs: number): void {
    const trimmed = domain.trim();
    if (trimmed === '*') {
      this.activeGrants.set('*', expiresAtMs);
      this.lastCheckedKey = '';
      return;
    }
    const normalized = sanitizeAndNormalizeUrl(trimmed);
    const cleanDomain = normalized ? normalized.domain : trimmed.toLowerCase().replace(/^www\./, '');
    if (cleanDomain) {
      this.activeGrants.set(cleanDomain, expiresAtMs);
      this.lastCheckedKey = '';
    }
  }

  /**
   * Revoga imediatamente uma concessão temporária (ex.: suspensão do SO ou revogação pelo Ajudante).
   */
  revokeTemporaryAccess(domain: string): void {
    const trimmed = domain.trim();
    if (trimmed === '*') {
      this.activeGrants.delete('*');
      this.lastCheckedKey = '';
      return;
    }
    const normalized = sanitizeAndNormalizeUrl(trimmed);
    const cleanDomain = normalized ? normalized.domain : trimmed.toLowerCase().replace(/^www\./, '');
    this.activeGrants.delete(cleanDomain);
    this.lastCheckedKey = '';
  }

  /**
   * Verifica se o domínio (ou superdomínio, ou curinga '*') possui concessão temporária ativa no instante `nowMs`.
   */
  hasActiveGrant(domain: string, nowMs: number): boolean {
    for (const [grantedDomain, expiresAtMs] of this.activeGrants.entries()) {
      if (expiresAtMs <= nowMs) {
        this.activeGrants.delete(grantedDomain);
        continue;
      }
      if (
        grantedDomain === '*' ||
        domain === grantedDomain ||
        domain.endsWith(`.${grantedDomain}`)
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Executa um ciclo único de inspeção da aba em foco.
   */
  async inspectOnce(nowMs: number = Date.now()): Promise<WatcherInterceptionResult> {
    const tab = await this.adapter.getActiveTab();
    if (!tab || !SUPPORTED_MACOS_BROWSERS.includes(tab.browser as SupportedMacOSBrowser)) {
      return { blocked: false };
    }

    const normalized = sanitizeAndNormalizeUrl(tab.url);
    if (!normalized) {
      return { blocked: false, browser: tab.browser };
    }

    const cacheKey = `${tab.browser}|${normalized.cleanUrl}|${tab.title}`;
    if (cacheKey === this.lastCheckedKey && nowMs - this.lastCheckedAtMs < this.debounceMs) {
      return { blocked: false, debounced: true, browser: tab.browser };
    }

    this.lastCheckedKey = cacheKey;
    this.lastCheckedAtMs = nowMs;

    if (this.hasActiveGrant(normalized.domain, nowMs)) {
      return {
        blocked: false,
        grantedTemporary: true,
        browser: tab.browser,
        domain: normalized.domain,
        cleanUrl: normalized.cleanUrl,
      };
    }

    const decision = evaluateUrlAndTitle({
      url: tab.url,
      title: tab.title,
      state: this.getRules(),
    });

    if (!decision.blocked) {
      return {
        blocked: false,
        browser: tab.browser,
        domain: normalized.domain,
        cleanUrl: normalized.cleanUrl,
      };
    }

    const reason = decision.reason ?? 'CUSTOM_DOMAIN';
    const ruleLabel = decision.ruleLabel ?? normalized.domain;
    const redirectUrl =
      `http://127.0.0.1:49152/blocked` +
      `?domain=${encodeURIComponent(normalized.domain)}` +
      `&reason=${encodeURIComponent(reason)}` +
      `&rule=${encodeURIComponent(ruleLabel)}`;

    await this.adapter.redirectActiveTab(tab.browser, redirectUrl);

    return {
      blocked: true,
      browser: tab.browser,
      domain: normalized.domain,
      cleanUrl: normalized.cleanUrl,
      redirectUrl,
      reason,
      ruleLabel,
    };
  }
}
