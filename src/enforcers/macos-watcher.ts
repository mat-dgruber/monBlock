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
} from '../domain/rule-engine.js';

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
  redirectActiveTab(browser: string, targetUrl: string): Promise<void>;
}

/** Concessão temporária autorizada pelo Ajudante para um domínio específico. */
export interface TemporaryGrant {
  domain: string;
  expiresAtMs: number;
}

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
  set targetBrowser to item 1 of argv
  set safeRedirectUrl to item 2 of argv
  if targetBrowser is "Safari" then
    tell application "Safari"
      if (count of windows) > 0 then
        set URL of current tab of front window to safeRedirectUrl
      end if
    end tell
  else if targetBrowser is in {"Google Chrome", "Brave Browser", "Arc", "Microsoft Edge"} then
    using terms from application "Google Chrome"
      tell application targetBrowser
        if (count of windows) > 0 then
          set URL of active tab of front window to safeRedirectUrl
        end if
      end tell
    end using terms from
  end if
end run
`;

/**
 * Implementação real de `BrowserTabAdapter` baseada em `execFile('osascript')` com
 * argumentos isolados em array e timeout estrito de 1500ms.
 */
export class OsascriptBrowserTabAdapter implements BrowserTabAdapter {
  private readonly timeoutMs: number;

  constructor(timeoutMs = 1500) {
    this.timeoutMs = timeoutMs;
  }

  async getActiveTab(): Promise<ActiveTabSnapshot | null> {
    try {
      const { stdout } = await execFileAsync('osascript', ['-e', INSPECT_FRONT_BROWSER_SCRIPT], {
        timeout: this.timeoutMs,
      });
      const lines = stdout.trim().split('\n');
      if (lines.length < 3) return null;
      const [browser, url, ...titleParts] = lines;
      if (!browser || !url) return null;
      return {
        browser: browser.trim(),
        url: url.trim(),
        title: titleParts.join(' ').trim(),
      };
    } catch {
      return null;
    }
  }

  async redirectActiveTab(browser: string, targetUrl: string): Promise<void> {
    if (!SUPPORTED_MACOS_BROWSERS.includes(browser as SupportedMacOSBrowser)) {
      return;
    }
    if (!targetUrl.startsWith('http://127.0.0.1:49152/blocked')) {
      throw new Error('URL de redirecionamento inválida: permitido apenas 127.0.0.1:49152/blocked.');
    }
    try {
      await execFileAsync('osascript', ['-e', REDIRECT_TAB_SCRIPT, browser, targetUrl], {
        timeout: this.timeoutMs,
      });
    } catch {
      // Degradação graciosa: camadas /etc/hosts e BrowserPolicies permanecem ativas
    }
  }
}

export interface MacOSBrowserWatcherOptions {
  adapter?: BrowserTabAdapter;
  getRules: () => RuleEngineState;
  debounceMs?: number;
  initialGrants?: TemporaryGrant[];
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
      this.grantTemporaryAccess(grant.domain, grant.expiresAtMs);
    }
  }

  /**
   * Registra uma concessão temporária para um domínio até `expiresAtMs`.
   */
  grantTemporaryAccess(domain: string, expiresAtMs: number): void {
    const normalized = sanitizeAndNormalizeUrl(domain);
    const cleanDomain = normalized ? normalized.domain : domain.trim().toLowerCase().replace(/^www\./, '');
    if (cleanDomain) {
      this.activeGrants.set(cleanDomain, expiresAtMs);
      this.lastCheckedKey = '';
    }
  }

  /**
   * Revoga imediatamente uma concessão temporária (ex.: suspensão do SO ou revogação pelo Ajudante).
   */
  revokeTemporaryAccess(domain: string): void {
    const normalized = sanitizeAndNormalizeUrl(domain);
    const cleanDomain = normalized ? normalized.domain : domain.trim().toLowerCase().replace(/^www\./, '');
    this.activeGrants.delete(cleanDomain);
    this.lastCheckedKey = '';
  }

  /**
   * Verifica se o domínio (ou superdomínio) possui concessão temporária ativa no instante `nowMs`.
   */
  hasActiveGrant(domain: string, nowMs: number): boolean {
    for (const [grantedDomain, expiresAtMs] of this.activeGrants.entries()) {
      if (expiresAtMs <= nowMs) {
        this.activeGrants.delete(grantedDomain);
        continue;
      }
      if (domain === grantedDomain || domain.endsWith(`.${grantedDomain}`)) {
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

    const cacheKey = `${tab.browser}|${tab.url}|${tab.title}`;
    if (cacheKey === this.lastCheckedKey && nowMs - this.lastCheckedAtMs < this.debounceMs) {
      return { blocked: false, debounced: true, browser: tab.browser };
    }

    this.lastCheckedKey = cacheKey;
    this.lastCheckedAtMs = nowMs;

    const normalized = sanitizeAndNormalizeUrl(tab.url);
    if (!normalized) {
      return { blocked: false, browser: tab.browser };
    }

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
