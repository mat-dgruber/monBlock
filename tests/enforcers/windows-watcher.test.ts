import { describe, it, expect } from 'vitest';
import {
  WindowsBrowserWatcher,
  WindowsBrowserTabAdapter,
  SUPPORTED_WINDOWS_BROWSERS,
} from '../../src/enforcers/windows-watcher.js';
import type { BrowserTabAdapter, ActiveTabSnapshot } from '../../src/enforcers/windows-watcher.js';
import type { RuleEngineState } from '../../src/domain/rule-engine.js';

describe('WindowsBrowserWatcher: Watcher de Navegadores Windows (ADR-0015)', () => {
  const sampleRules: RuleEngineState = {
    enabledCategories: [],
    blockedDomains: ['bet365.com', 'distraction.com'],
    allowlistDomains: ['work-allowed.com'],
    keywords: ['aposta', 'cassino'],
    lockIncognito: true,
  };

  class MockWindowsTabAdapter implements BrowserTabAdapter {
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

  it('bloqueia domínio proibido em navegador Windows e redireciona', async () => {
    const adapter = new MockWindowsTabAdapter();
    adapter.currentTab = {
      browser: 'chrome.exe',
      url: 'https://bet365.com/live',
      title: 'Bet365 Apostas',
    };

    const watcher = new WindowsBrowserWatcher({
      adapter,
      getRules: () => sampleRules,
    });

    const res = await watcher.inspectOnce();
    expect(res.blocked).toBe(true);
    expect(res.domain).toBe('bet365.com');
    expect(res.redirectUrl).toContain('http://127.0.0.1:49152/blocked');
    expect(res.redirectUrl).toContain('domain=bet365.com');
    expect(adapter.redirectedUrls.length).toBe(1);
    expect(adapter.redirectedUrls[0]?.browser).toBe('chrome.exe');
  });

  it('ignora executáveis que não são navegadores monitorados', async () => {
    const adapter = new MockWindowsTabAdapter();
    adapter.currentTab = {
      browser: 'notepad.exe',
      url: 'https://bet365.com',
      title: 'Bloco de Notas',
    };

    const watcher = new WindowsBrowserWatcher({
      adapter,
      getRules: () => sampleRules,
    });

    const res = await watcher.inspectOnce();
    expect(res.blocked).toBe(false);
    expect(adapter.redirectedUrls.length).toBe(0);
  });

  it('aplica debounce de 150ms na mesma janela', async () => {
    const adapter = new MockWindowsTabAdapter();
    adapter.currentTab = {
      browser: 'msedge.exe',
      url: 'https://distraction.com/video',
      title: 'Distração - Microsoft Edge',
    };

    const watcher = new WindowsBrowserWatcher({
      adapter,
      getRules: () => sampleRules,
      debounceMs: 150,
    });

    const t0 = 2000;
    const res1 = await watcher.inspectOnce(t0);
    expect(res1.blocked).toBe(true);

    const res2 = await watcher.inspectOnce(t0 + 40);
    expect(res2.debounced).toBe(true);
    expect(res2.blocked).toBe(false);

    const res3 = await watcher.inspectOnce(t0 + 200);
    expect(res3.blocked).toBe(true);
  });

  it('respeita concessões temporárias (TemporaryGrants)', async () => {
    const adapter = new MockWindowsTabAdapter();
    adapter.currentTab = {
      browser: 'firefox.exe',
      url: 'https://distraction.com',
      title: 'Distração',
    };

    const watcher = new WindowsBrowserWatcher({
      adapter,
      getRules: () => sampleRules,
    });

    const now = Date.now();
    watcher.grantTemporaryAccess('distraction.com', now + 600_000);

    const res = await watcher.inspectOnce(now);
    expect(res.blocked).toBe(false);
    expect(res.grantedTemporary).toBe(true);

    watcher.revokeTemporaryAccess('distraction.com');
    const resAfterRevoke = await watcher.inspectOnce(now + 200);
    expect(resAfterRevoke.blocked).toBe(true);
  });

  it('remove query strings sensíveis (Zero-PII) antes de avaliar e redirecionar', async () => {
    const adapter = new MockWindowsTabAdapter();
    adapter.currentTab = {
      browser: 'chrome.exe',
      url: 'https://distraction.com/profile?session=SECRET_KEY_999',
      title: 'Perfil',
    };

    const watcher = new WindowsBrowserWatcher({
      adapter,
      getRules: () => sampleRules,
    });

    const res = await watcher.inspectOnce();
    expect(res.blocked).toBe(true);
    expect(res.cleanUrl).toBe('https://distraction.com/profile');
    expect(res.cleanUrl).not.toContain('SECRET_KEY_999');
  });
});

describe('WindowsBrowserTabAdapter: Inspeção Win32/PowerShell', () => {
  it('identifica navegador e título via PowerShell Get-Process', async () => {
    const execFn = async (cmd: string, args: string[]) => {
      if (cmd === 'powershell') {
        return { stdout: 'msedge\nGoogle - Microsoft Edge\n', stderr: '' };
      }
      throw new Error(`Comando inesperado: ${cmd} ${args.join(' ')}`);
    };

    const adapter = new WindowsBrowserTabAdapter({ execFn });
    const tab = await adapter.getActiveTab();

    expect(tab).not.toBeNull();
    expect(tab?.browser).toBe('msedge.exe');
    expect(tab?.title).toBe('Google - Microsoft Edge');
  });

  it('retorna null quando o processo ativo não é navegador suportado', async () => {
    const execFn = async (cmd: string) => {
      return { stdout: 'cmd\nPrompt de Comando\n', stderr: '' };
    };

    const adapter = new WindowsBrowserTabAdapter({ execFn });
    const tab = await adapter.getActiveTab();
    expect(tab).toBeNull();
  });

  it('redireciona executando cmd.exe start com a URL de bloqueio', async () => {
    const executed: string[] = [];
    const execFn = async (cmd: string, args: string[]) => {
      executed.push(`${cmd} ${args.join(' ')}`);
      return { stdout: '', stderr: '' };
    };

    const adapter = new WindowsBrowserTabAdapter({ execFn });
    const success = await adapter.redirectActiveTab('chrome.exe', 'http://127.0.0.1:49152/blocked?domain=test.com');

    expect(success).toBe(true);
    expect(executed).toContain('cmd.exe /c start "" http://127.0.0.1:49152/blocked?domain=test.com');
  });

  it('rejeita redirecionamento para URLs que não sejam 127.0.0.1:49152/blocked', async () => {
    const adapter = new WindowsBrowserTabAdapter({ execFn: async () => ({ stdout: '', stderr: '' }) });
    await expect(
      adapter.redirectActiveTab('chrome.exe', 'https://malicious-site.com')
    ).rejects.toThrow(/URL de redirecionamento inválida/);
  });
});
