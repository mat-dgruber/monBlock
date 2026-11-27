/**
 * @file windows-watcher.ts
 * @description Camada 3 de Bloqueio Web (MOD-01) — Watcher de Navegadores Windows (ADR-0015).
 * Monitora janelas/abas ativas nos navegadores suportados no Windows (Chrome, Edge, Brave,
 * Firefox, Opera, Vivaldi), aplicando debounce de 150ms, higienização Zero-PII,
 * verificação de TemporaryGrants e redirecionamento seguro para `127.0.0.1:49152/blocked`.
 */

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
  // Também no Windows (vistos no teste real: o Dia era o navegador padrão e o título não traz sufixo).
  'dia.exe',
  'arc.exe',
  'chromium.exe',
  'dia',
  'arc',
  'chromium',
] as const;

export type SupportedWindowsBrowser = (typeof SUPPORTED_WINDOWS_BROWSERS)[number];

/** Fonte do processo e do título em primeiro plano (o `ForegroundHelper` do W8). */
export interface ForegroundSource {
  probe(): Promise<{ proc: string; title: string } | null>;
}

export interface WindowsTabAdapterOptions {
  helper: ForegroundSource;
  /** `shell.openExternal` do Electron (W11a). Sem ele não há redirecionamento. */
  openExternal?: (url: string) => Promise<void>;
}

const BLOCKED_PAGE_PREFIX = 'http://127.0.0.1:49152/blocked?';

/**
 * Sufixo do navegador no título da janela. O Edge acrescenta o perfil quando há mais de um
 * ("… - Perfil 1 — Microsoft​ Edge", com espaço de largura zero); só os nomes padrão são removidos,
 * para não cortar parte legítima do título.
 */
const BROWSER_TITLE_SUFFIX =
  /(?:\s+-\s+(?:Perfil \d+|Pessoal|Trabalho|Profile \d+|Personal|Work))?\s+[-—–]\s+(?:Google Chrome|Mozilla Firefox|Microsoft​?\s?Edge|Brave|Vivaldi|Opera)\s*$/i;
/** "e mais N páginas" do Chromium quando há abas agrupadas/selecionadas. */
const MORE_PAGES = /\s+e mais \d+ p[áa]ginas?(?=\s+[-—–]|$)/i;

/** Tira do título o sufixo do navegador (W7). */
export function cleanBrowserTitle(title: string): string {
  return title.replace(BROWSER_TITLE_SUFFIX, '').replace(MORE_PAGES, '').trim();
}

/** Títulos de páginas internas, que não dizem nada sobre o conteúdo. */
const NEUTRAL_TITLES = new Set(['nova guia', 'nova aba', 'new tab', 'início', 'new private tab', 'nova janela anônima']);

/**
 * Adaptador Windows da Camada 3: lê a janela em primeiro plano pelo helper persistente (W8, sem o bug do
 * `$pid` e com o título da própria janela via `GetWindowText`, W6) e redireciona pelo `shell.openExternal`
 * (W11a; o `cmd /c start` quebrava a URL em `&`).
 */
export class WindowsBrowserTabAdapter implements BrowserTabAdapter {
  private readonly helper: ForegroundSource;
  private readonly openExternal?: (url: string) => Promise<void>;

  constructor(options: WindowsTabAdapterOptions) {
    this.helper = options.helper;
    this.openExternal = options.openExternal;
  }

  async getActiveTab(): Promise<ActiveTabSnapshot | null> {
    const probe = await this.helper.probe();
    if (!probe) return null;
    const proc = probe.proc.toLowerCase().replace(/.exe$/, '');
    if (!SUPPORTED_WINDOWS_BROWSERS.includes(proc as SupportedWindowsBrowser)) return null;
    // Sem UI Automation (W11b) não há URL: a avaliação é pelo título.
    return { browser: proc, url: '', title: probe.title };
  }

  async redirectActiveTab(browser: string, targetUrl: string): Promise<boolean> {
    if (!SUPPORTED_WINDOWS_BROWSERS.includes(browser as SupportedWindowsBrowser)) return false;
    if (!targetUrl.startsWith(BLOCKED_PAGE_PREFIX)) {
      throw new Error('URL de redirecionamento inválida: permitido apenas 127.0.0.1:49152/blocked.');
    }
    if (!this.openExternal) return false;
    try {
      await this.openExternal(targetUrl);
      return true;
    } catch (err) {
      console.error(`[monBlock] Falha ao abrir a página de bloqueio (${browser}):`, (err as Error)?.message ?? String(err));
      return false;
    }
  }
}

export interface WindowsBrowserWatcherOptions {
  adapter: BrowserTabAdapter;
  getRules: () => RuleEngineState;
  debounceMs?: number;
  /** Mesma aba/título não redireciona de novo antes disso (anti-loop). Padrão 10 s. */
  redirectCooldownMs?: number;
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
  private readonly redirectCooldownMs: number;
  private readonly lastRedirectAt = new Map<string, number>();

  constructor(options: WindowsBrowserWatcherOptions) {
    this.adapter = options.adapter;
    this.redirectCooldownMs = options.redirectCooldownMs ?? 10_000;
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

    // W7: sem URL (o helper só dá o título), avalia pelo título limpo. Um título que começa por um domínio
    // ("bet365.com - Apostas") é avaliado como domínio.
    const cleanTitle = cleanBrowserTitle(tab.title);
    const leadingDomain = /^([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})(?:\s|$)/i.exec(cleanTitle)?.[1];
    const normalized = sanitizeAndNormalizeUrl(tab.url) ?? (leadingDomain ? sanitizeAndNormalizeUrl(leadingDomain) : null);
    if (!normalized) {
      return this.inspectByTitle(tab, cleanTitle, nowMs);
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
      url: tab.url || normalized.cleanUrl,
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

    await this.redirectOnce(`${tab.browser}|${normalized.domain}`, tab.browser, redirectUrl, nowMs);

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

  private async inspectByTitle(tab: ActiveTabSnapshot, cleanTitle: string, nowMs: number): Promise<WatcherInterceptionResult> {
    if (!cleanTitle || NEUTRAL_TITLES.has(cleanTitle.toLowerCase())) return { blocked: false, browser: tab.browser };
    const cacheKey = `${tab.browser}|title|${cleanTitle}`;
    if (cacheKey === this.lastCheckedKey && nowMs - this.lastCheckedAtMs < this.debounceMs) {
      return { blocked: false, debounced: true, browser: tab.browser };
    }
    this.lastCheckedKey = cacheKey;
    this.lastCheckedAtMs = nowMs;
    // Sem domínio, só o grant `*` se aplica.
    if (this.hasActiveGrant('', nowMs)) return { blocked: false, grantedTemporary: true, browser: tab.browser };

    const decision = evaluateUrlAndTitle({ url: cleanTitle, title: cleanTitle, state: this.getRules() });
    if (!decision.blocked) return { blocked: false, browser: tab.browser };

    const reason = decision.reason ?? 'KEYWORD';
    const ruleLabel = decision.ruleLabel ?? 'Regra do monBlock';
    const redirectUrl =
      `http://127.0.0.1:49152/blocked` +
      `?domain=${encodeURIComponent(ruleLabel)}` +
      `&reason=${encodeURIComponent(reason)}` +
      `&rule=${encodeURIComponent(ruleLabel)}`;
    // Por navegador, não por título: depois do redirecionamento o título muda ("e mais 1 página")
    // e uma chave por título abriria uma aba nova a cada ciclo (visto no teste real com o Edge).
    await this.redirectOnce(`${tab.browser}|title`, tab.browser, redirectUrl, nowMs);
    return { blocked: true, browser: tab.browser, redirectUrl, reason, ruleLabel };
  }

  /** Anti-loop: o navegador pode manter o título por um tempo depois do redirecionamento. */
  private async redirectOnce(key: string, browser: string, url: string, nowMs: number): Promise<void> {
    const last = this.lastRedirectAt.get(key);
    if (last !== undefined && nowMs - last < this.redirectCooldownMs) return;
    this.lastRedirectAt.set(key, nowMs);
    if (this.lastRedirectAt.size > 200) this.lastRedirectAt.clear();
    await this.adapter.redirectActiveTab(browser, url);
  }
}
