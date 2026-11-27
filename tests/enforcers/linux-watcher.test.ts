import { describe, it, expect, vi } from 'vitest';
import {
  LinuxBrowserWatcher,
  X11BrowserTabAdapter,
  SUPPORTED_LINUX_BROWSERS,
} from '../../src/enforcers/linux-watcher.js';
import type { BrowserTabAdapter, ActiveTabSnapshot } from '../../src/enforcers/linux-watcher.js';
import type { RuleEngineState } from '../../src/domain/rule-engine.js';

describe('LinuxBrowserWatcher: Watcher de Navegadores Linux (ADR-0014, ADR-0015)', () => {
  const sampleRules: RuleEngineState = {
    enabledCategories: [],
    blockedDomains: ['casino-online.com', 'distraction.com'],
    allowlistDomains: ['work-allowed.com'],
    keywords: ['aposta', 'bet'],
    lockIncognito: true,
  };

  class MockLinuxTabAdapter implements BrowserTabAdapter {
    public currentTab: ActiveTabSnapshot | null = null;
    public redirectedUrls: Array<{ browser: string; targetUrl: string }> = [];

    async getActiveTab(): Promise<ActiveTabSnapshot | null> {
      return this.currentTab;
    }

    async redirectActiveTab(browser: string, targetUrl: string): Promise<boolean> {
      this.redirectedUrls.push({ browser, targetUrl });
      return true;
    }
  }

  it('bloqueia domínio proibido e redireciona para a porta local do monblockd', async () => {
    const adapter = new MockLinuxTabAdapter();
    adapter.currentTab = {
      browser: 'google-chrome',
      url: 'https://casino-online.com/play',
      title: 'Casino Online - Jogos',
    };

    const watcher = new LinuxBrowserWatcher({
      adapter,
      getRules: () => sampleRules,
    });

    const res = await watcher.inspectOnce();
    expect(res.blocked).toBe(true);
    expect(res.domain).toBe('casino-online.com');
    expect(res.redirectUrl).toContain('http://127.0.0.1:49152/blocked');
    expect(res.redirectUrl).toContain('domain=casino-online.com');
    expect(adapter.redirectedUrls.length).toBe(1);
    expect(adapter.redirectedUrls[0]?.browser).toBe('google-chrome');
  });

  it('ignora navegadores que não estão na lista de navegadores suportados', async () => {
    const adapter = new MockLinuxTabAdapter();
    adapter.currentTab = {
      browser: 'alacritty',
      url: 'https://casino-online.com',
      title: 'Terminal',
    };

    const watcher = new LinuxBrowserWatcher({
      adapter,
      getRules: () => sampleRules,
    });

    const res = await watcher.inspectOnce();
    expect(res.blocked).toBe(false);
    expect(adapter.redirectedUrls.length).toBe(0);
  });

  it('aplica debounce de 150ms na mesma aba', async () => {
    const adapter = new MockLinuxTabAdapter();
    adapter.currentTab = {
      browser: 'firefox',
      url: 'https://distraction.com/feed',
      title: 'Feed Distração',
    };

    const watcher = new LinuxBrowserWatcher({
      adapter,
      getRules: () => sampleRules,
      debounceMs: 150,
    });

    const t0 = 1000;
    const res1 = await watcher.inspectOnce(t0);
    expect(res1.blocked).toBe(true);

    // Segunda chamada 50ms depois → debounced
    const res2 = await watcher.inspectOnce(t0 + 50);
    expect(res2.debounced).toBe(true);
    expect(res2.blocked).toBe(false);

    // Terceira chamada após expirar o debounce (200ms depois) → inspeciona novamente
    const res3 = await watcher.inspectOnce(t0 + 200);
    expect(res3.blocked).toBe(true);
  });

  it('respeita concessões temporárias (TemporaryGrants)', async () => {
    const adapter = new MockLinuxTabAdapter();
    adapter.currentTab = {
      browser: 'brave-browser',
      url: 'https://distraction.com',
      title: 'Distração',
    };

    const watcher = new LinuxBrowserWatcher({
      adapter,
      getRules: () => sampleRules,
    });

    // Concede 10 minutos
    const now = Date.now();
    watcher.grantTemporaryAccess('distraction.com', now + 600_000);

    const res = await watcher.inspectOnce(now);
    expect(res.blocked).toBe(false);
    expect(res.grantedTemporary).toBe(true);

    // Revoga a concessão
    watcher.revokeTemporaryAccess('distraction.com');
    const resAfterRevoke = await watcher.inspectOnce(now + 200);
    expect(resAfterRevoke.blocked).toBe(true);
  });

  it('higieniza URLs removendo query strings sensíveis (Zero-PII) antes de redirecionar', async () => {
    const adapter = new MockLinuxTabAdapter();
    adapter.currentTab = {
      browser: 'google-chrome',
      url: 'https://distraction.com/account?token=SUPER_SECRET_123&user=john',
      title: 'Minha Conta',
    };

    const watcher = new LinuxBrowserWatcher({
      adapter,
      getRules: () => sampleRules,
    });

    const res = await watcher.inspectOnce();
    expect(res.blocked).toBe(true);
    expect(res.cleanUrl).toBe('https://distraction.com/account');
    expect(res.cleanUrl).not.toContain('SUPER_SECRET_123');
  });
});

describe('X11BrowserTabAdapter: Inspeção de Janelas X11', () => {
  it('identifica navegador e título via xdotool e xprop', async () => {
    const execFn = async (cmd: string, args: string[]) => {
      if (cmd === 'xdotool' && args[0] === 'getactivewindow') {
        return { stdout: '12345678\n', stderr: '' };
      }
      if (cmd === 'xprop') {
        return { stdout: 'WM_CLASS(STRING) = "google-chrome", "Google-chrome"\n', stderr: '' };
      }
      if (cmd === 'xdotool' && args[0] === 'getwindowname') {
        return { stdout: 'ChatGPT - Google Chrome\n', stderr: '' };
      }
      throw new Error(`Comando inesperado: ${cmd} ${args.join(' ')}`);
    };

    const adapter = new X11BrowserTabAdapter({ execFn });
    const tab = await adapter.getActiveTab();

    expect(tab).not.toBeNull();
    expect(tab?.browser).toBe('google-chrome');
    expect(tab?.title).toBe('ChatGPT - Google Chrome');
  });

  it('retorna null quando nenhuma janela está ativa ou navegador não é suportado', async () => {
    const execFn = async (cmd: string) => {
      if (cmd === 'xdotool') return { stdout: '9999\n', stderr: '' };
      return { stdout: 'WM_CLASS(STRING) = "gedit", "Gedit"\n', stderr: '' };
    };

    const adapter = new X11BrowserTabAdapter({ execFn });
    const tab = await adapter.getActiveTab();
    expect(tab).toBeNull();
  });

  it('redireciona chamando xdg-open com a URL de bloqueio', async () => {
    const executed: string[] = [];
    const execFn = async (cmd: string, args: string[]) => {
      executed.push(`${cmd} ${args.join(' ')}`);
      return { stdout: '', stderr: '' };
    };

    const adapter = new X11BrowserTabAdapter({ execFn });
    const success = await adapter.redirectActiveTab('firefox', 'http://127.0.0.1:49152/blocked?domain=test.com');

    expect(success).toBe(true);
    expect(executed).toContain('xdg-open http://127.0.0.1:49152/blocked?domain=test.com');
  });

  it('rejeita redirecionamento para URLs arbitrárias fora de 127.0.0.1:49152/blocked', async () => {
    const adapter = new X11BrowserTabAdapter({ execFn: async () => ({ stdout: '', stderr: '' }) });
    await expect(
      adapter.redirectActiveTab('firefox', 'https://malicious-site.com')
    ).rejects.toThrow(/URL de redirecionamento inválida/);
  });
});
