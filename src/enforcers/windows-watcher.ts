/**
 * @file windows-watcher.ts
 * @description Camada 3 de Bloqueio Web (MOD-01) — Watcher de Navegadores Windows (ADR-0015).
 * Monitora janelas/abas ativas nos navegadores suportados no Windows (Chrome, Edge, Brave,
 * Firefox, Opera, Vivaldi), aplicando debounce de 150ms, higienização Zero-PII,
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

/** Lista imutável de executáveis de navegadores Windows monitorados. */
export const SUPPORTED_WINDOWS_BROWSERS = [
  'chrome.exe',
  'msedge.exe',
  'brave.exe',
  'firefox.exe',
  'opera.exe',
  'vivaldi.exe',
  'chrome',
  'msedge',
  'brave',
  'firefox',
  'opera',
  'vivaldi',
] as const;

export type SupportedWindowsBrowser = (typeof SUPPORTED_WINDOWS_BROWSERS)[number];

export interface WindowsTabAdapterOptions {
  execFn?: (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;
  timeoutMs?: number;
}

/**
 * Adaptador de inspeção e redirecionamento de janelas no Windows via PowerShell / Win32.
 */
export class WindowsBrowserTabAdapter implements BrowserTabAdapter {
  private readonly execFn: (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;
  private readonly timeoutMs: number;
  private lastWarningAtMs = 0;

  constructor(options: WindowsTabAdapterOptions = {}) {
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
      // Script PowerShell leve para consultar processo em primeiro plano e título da janela
      const script = `
        Add-Type @"
          using System;
          using System.Runtime.InteropServices;
          public class User32 {
            [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
            [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
          }
"@
        $hwnd = [User32]::GetForegroundWindow()
        if ($hwnd -ne [IntPtr]::Zero) {
          $pid = 0
          [User32]::GetWindowThreadProcessId($hwnd, [ref]$pid)
          $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
          if ($proc) {
            Write-Output $proc.ProcessName
            Write-Output $proc.MainWindowTitle
          }
        }
      `.trim();

      const { stdout } = await this.execFn('powershell', ['-NoProfile', '-NonInteractive', '-Command', script]);
      const lines = stdout.trim().split(/\r?\n/).map((l) => l.trim());
      if (lines.length < 2) return null;

      const processName = lines[0]?.toLowerCase() ?? '';
      const windowTitle = lines.slice(1).join(' ').trim();

      let matchedBrowser: string | null = null;
      for (const b of SUPPORTED_WINDOWS_BROWSERS) {
        const cleanName = b.replace(/\.exe$/, '');
        if (processName === cleanName || processName === b) {
          matchedBrowser = b;
          break;
        }
      }

      if (!matchedBrowser) return null;

      return {
        browser: matchedBrowser,
        url: windowTitle,
        title: windowTitle,
      };
    } catch (err) {
      const now = Date.now();
      if (now - this.lastWarningAtMs > 60_000) {
        this.lastWarningAtMs = now;
        console.error(
          '[monBlock] Watcher Windows não conseguiu ler a janela em primeiro plano:',
          (err as Error)?.message ?? String(err)
        );
      }
      return null;
    }
  }

  async redirectActiveTab(browser: string, targetUrl: string): Promise<boolean> {
    if (!SUPPORTED_WINDOWS_BROWSERS.includes(browser as SupportedWindowsBrowser)) {
      return false;
    }
    if (!targetUrl.startsWith('http://127.0.0.1:49152/blocked')) {
      throw new Error('URL de redirecionamento inválida: permitido apenas 127.0.0.1:49152/blocked.');
    }
    try {
      await this.execFn('cmd.exe', ['/c', 'start', '""', targetUrl]);
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

export interface WindowsBrowserWatcherOptions {
  adapter?: BrowserTabAdapter;
  getRules: () => RuleEngineState;
  debounceMs?: number;
  initialGrants?: CompatibleTemporaryGrant[];
}

/**
 * Watcher de Navegadores Windows com cache de última inspeção, debounce configurável,
 * suporte a TemporaryGrants e higienização Zero-PII.
 */
export class WindowsBrowserWatcher {
  private readonly adapter: BrowserTabAdapter;
  private readonly getRules: () => RuleEngineState;
  private readonly debounceMs: number;
  private readonly activeGrants = new Map<string, number>();
  private lastCheckedKey = '';
  private lastCheckedAtMs = -Infinity;

  constructor(options: WindowsBrowserWatcherOptions) {
    this.adapter = options.adapter ?? new WindowsBrowserTabAdapter();
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
    if (!tab || !SUPPORTED_WINDOWS_BROWSERS.includes(tab.browser as SupportedWindowsBrowser)) {
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
