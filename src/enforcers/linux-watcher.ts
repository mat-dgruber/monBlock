/**
 * @file linux-watcher.ts
 * @description Camada 3 de Bloqueio Web (MOD-01) — Watcher de Navegadores Linux (ADR-0014, ADR-0015).
 * Monitora janelas/abas ativas nos navegadores suportados no Linux (Chrome, Chromium, Brave,
 * Edge, Firefox, Vivaldi e Opera), aplicando debounce de 150ms, higienização Zero-PII,
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
import type {
  ActiveTabSnapshot,
  BrowserTabAdapter,
  CompatibleTemporaryGrant,
  WatcherInterceptionResult,
} from './macos-watcher.js';

export type { ActiveTabSnapshot, BrowserTabAdapter, CompatibleTemporaryGrant, WatcherInterceptionResult };

const execFileAsync = promisify(execFile);

/** Lista imutável de identificadores/classes de navegadores Linux monitorados. */
export const SUPPORTED_LINUX_BROWSERS = [
  'google-chrome',
  'chromium',
  'chromium-browser',
  'brave-browser',
  'microsoft-edge',
  'firefox',
  'vivaldi',
  'opera',
] as const;

export type SupportedLinuxBrowser = (typeof SUPPORTED_LINUX_BROWSERS)[number];

export interface LinuxTabAdapterOptions {
  execFn?: (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;
  timeoutMs?: number;
}

/**
 * Adaptador de inspeção e redirecionamento de janelas no Linux via X11/xdg-open.
 */
export class X11BrowserTabAdapter implements BrowserTabAdapter {
  private readonly execFn: (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;
  private readonly timeoutMs: number;
  private lastWarningAtMs = 0;

  constructor(options: LinuxTabAdapterOptions = {}) {
    this.execFn =
      options.execFn ??
      ((cmd, args) =>
        execFileAsync(cmd, args, { timeout: options.timeoutMs ?? 2000, encoding: 'utf8' }) as Promise<{
          stdout: string;
          stderr: string;
        }>);
    this.timeoutMs = options.timeoutMs ?? 2000;
  }

  async getActiveTab(): Promise<ActiveTabSnapshot | null> {
    try {
      // 1. Obtém ID da janela ativa via xdotool
      const { stdout: winIdStr } = await this.execFn('xdotool', ['getactivewindow']);
      const winId = winIdStr.trim();
      if (!winId) return null;

      // 2. Obtém a classe da janela (ex.: "google-chrome", "firefox")
      const { stdout: wmClassOut } = await this.execFn('xprop', ['-id', winId, 'WM_CLASS']);
      let matchedBrowser: string | null = null;
      for (const b of SUPPORTED_LINUX_BROWSERS) {
        if (wmClassOut.toLowerCase().includes(b)) {
          matchedBrowser = b;
          break;
        }
      }
      if (!matchedBrowser) return null;

      // 3. Obtém o título da janela ativa
      const { stdout: titleOut } = await this.execFn('xdotool', ['getwindowname', winId]);
      const title = titleOut.trim();

      // Extrai URL ou gera snapshot para o avaliador
      return {
        browser: matchedBrowser,
        url: title, // Em navegadores Linux, o título frequentemente contém a URL ou o domínio
        title,
      };
    } catch (err) {
      const now = Date.now();
      if (now - this.lastWarningAtMs > 60_000) {
        this.lastWarningAtMs = now;
        console.error(
          '[monBlock] Watcher Linux não conseguiu inspecionar a janela (X11 indisponível ou utilitário ausente):',
          (err as Error)?.message ?? String(err)
        );
      }
      return null;
    }
  }

  async redirectActiveTab(browser: string, targetUrl: string): Promise<boolean> {
    if (!SUPPORTED_LINUX_BROWSERS.includes(browser as SupportedLinuxBrowser)) {
      return false;
    }
    if (!targetUrl.startsWith('http://127.0.0.1:49152/blocked')) {
      throw new Error('URL de redirecionamento inválida: permitido apenas 127.0.0.1:49152/blocked.');
    }
    try {
      await this.execFn('xdg-open', [targetUrl]);
      return true;
    } catch (err) {
      console.error(
        `[monBlock] Falha ao redirecionar aba em ${browser}:`,
        (err as Error)?.message ?? String(err)
      );
      return false;
    }
  }
}

export interface LinuxBrowserWatcherOptions {
  adapter?: BrowserTabAdapter;
  getRules: () => RuleEngineState;
  debounceMs?: number;
  initialGrants?: CompatibleTemporaryGrant[];
}

/**
 * Watcher de Navegadores Linux com cache de última inspeção, debounce configurável,
 * suporte a TemporaryGrants e higienização Zero-PII.
 */
export class LinuxBrowserWatcher {
  private readonly adapter: BrowserTabAdapter;
  private readonly getRules: () => RuleEngineState;
  private readonly debounceMs: number;
  private readonly activeGrants = new Map<string, number>();
  private lastCheckedKey = '';
  private lastCheckedAtMs = -Infinity;

  constructor(options: LinuxBrowserWatcherOptions) {
    this.adapter = options.adapter ?? new X11BrowserTabAdapter();
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

  async inspectOnce(nowMs: number = Date.now()): Promise<WatcherInterceptionResult> {
    const tab = await this.adapter.getActiveTab();
    if (!tab || !SUPPORTED_LINUX_BROWSERS.includes(tab.browser as SupportedLinuxBrowser)) {
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
