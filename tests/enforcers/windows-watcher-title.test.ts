import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { PREDEFINED_CATEGORIES } from '../../src/domain/categories.js';
import type { RuleEngineState } from '../../src/domain/rule-engine.js';
import {
  WindowsBrowserTabAdapter,
  WindowsBrowserWatcher,
  cleanBrowserTitle,
  type ActiveTabSnapshot,
  type BrowserTabAdapter,
} from '../../src/enforcers/windows-watcher.js';

const adult: RuleEngineState = { enabledCategories: ['adult'], blockedDomains: [], allowlistDomains: [], keywords: [], lockIncognito: false };

class Fake implements BrowserTabAdapter {
  tab: ActiveTabSnapshot | null = null;
  redirects: string[] = [];
  async getActiveTab() {
    return this.tab;
  }
  async redirectActiveTab(_b: string, url: string) {
    this.redirects.push(url);
    return true;
  }
}

describe('cleanBrowserTitle (W7)', () => {
  it.each([
    ['Pornhub - Google Chrome', 'Pornhub'],
    ['Pornhub e mais 2 páginas - Microsoft​ Edge', 'Pornhub'],
    ['Vídeos — Mozilla Firefox', 'Vídeos'],
    ['Busca - Brave', 'Busca'],
    ['Notícias - Vivaldi', 'Notícias'],
    ['Página - Opera', 'Página'],
    ['Sem sufixo', 'Sem sufixo'],
    // Título real capturado no Edge desta máquina (perfil + abas + espaço de largura zero):
    ['Pornhub videos teste monBlock e mais 1 página - Perfil 1 — Microsoft​ Edge', 'Pornhub videos teste monBlock'],
    ['Vídeo - YouTube — Microsoft​ Edge', 'Vídeo - YouTube'],
    ['Notícias - Chromium', 'Notícias'],
    ['Notícias - Arc', 'Notícias'],
    ['Notícias - Dia', 'Notícias'],
  ])('%s → %s', (raw, clean) => {
    expect(cleanBrowserTitle(raw)).toBe(clean);
  });
});

describe('WindowsBrowserWatcher por título (W7)', () => {
  it('"Pornhub - Google Chrome" com a categoria adulto ativa bloqueia e redireciona com o rótulo da regra', async () => {
    // Arrange
    const adapter = new Fake();
    adapter.tab = { browser: 'chrome', url: '', title: 'Pornhub - Google Chrome' };
    const watcher = new WindowsBrowserWatcher({ adapter, getRules: () => adult });

    // Act
    const res = await watcher.inspectOnce(1000);

    // Assert
    expect(res.blocked).toBe(true);
    expect(adapter.redirects).toHaveLength(1);
    const url = new URL(adapter.redirects[0]);
    expect(url.origin + url.pathname).toBe('http://127.0.0.1:49152/blocked');
    // Sem domínio identificável não vai `domain` (o rótulo viraria o endereço do pedido de liberação).
    expect(url.searchParams.has('domain')).toBe(false);
    expect(url.searchParams.get('rule')).toBe(res.ruleLabel);
    expect(url.searchParams.get('reason')).toBe(res.reason);
  });

  it('a própria página de bloqueio nunca é avaliada, nem com a palavra-chave "monblock"', async () => {
    // Arrange
    const adapter = new Fake();
    adapter.tab = { browser: 'dia', url: '', title: 'Página pausada — monBlock' };
    const watcher = new WindowsBrowserWatcher({ adapter, getRules: () => ({ ...adult, keywords: ['monblock'] }) });

    // Act
    const res = await watcher.inspectOnce(1000);

    // Assert
    expect(res.blocked).toBe(false);
    expect(adapter.redirects).toEqual([]);
  });

  it('título que começa por domínio IDN bloqueado é avaliado como domínio', async () => {
    // Arrange
    const adapter = new Fake();
    adapter.tab = { browser: 'chrome', url: '', title: 'apostas-ação.com.br - Jogos - Google Chrome' };
    const watcher = new WindowsBrowserWatcher({ adapter, getRules: () => ({ ...adult, enabledCategories: [], blockedDomains: ['apostas-ação.com.br'] }) });

    // Act
    const res = await watcher.inspectOnce(1000);

    // Assert
    expect(res.blocked).toBe(true);
    expect(res.domain).toBe('apostas-ação.com.br');
    expect(adapter.redirects).toHaveLength(1);
  });

  it('outra regra no mesmo navegador, dentro dos 10 s, redireciona normalmente', async () => {
    // Arrange
    const adapter = new Fake();
    const rules = { ...adult, keywords: ['cassino'] };
    const watcher = new WindowsBrowserWatcher({ adapter, getRules: () => rules });

    // Act
    adapter.tab = { browser: 'chrome', url: '', title: 'Pornhub - Google Chrome' };
    await watcher.inspectOnce(1000);
    adapter.tab = { browser: 'chrome', url: '', title: 'Melhor cassino online - Google Chrome' };
    await watcher.inspectOnce(2000);

    // Assert
    expect(adapter.redirects).toHaveLength(2);
  });

  it('redirecionamento que falhou não conta o intervalo: o próximo ciclo tenta de novo', async () => {
    // Arrange
    let ok = false;
    const opened: string[] = [];
    const adapter: BrowserTabAdapter = {
      getActiveTab: async () => ({ browser: 'chrome', url: '', title: 'Pornhub - Google Chrome' }),
      redirectActiveTab: async (_b, url) => {
        opened.push(url);
        return ok;
      },
    };
    const watcher = new WindowsBrowserWatcher({ adapter, getRules: () => adult });

    // Act
    await watcher.inspectOnce(1000);
    ok = true;
    await watcher.inspectOnce(2500);
    await watcher.inspectOnce(4000);

    // Assert
    expect(opened).toHaveLength(2);
  });

  it('título que começa com um domínio é avaliado como domínio (bet365.com - Apostas)', async () => {
    // Arrange
    const adapter = new Fake();
    adapter.tab = { browser: 'msedge', url: '', title: 'bet365.com - Apostas - Microsoft Edge' };
    const rules = { ...adult, enabledCategories: [], blockedDomains: ['bet365.com'] };
    const watcher = new WindowsBrowserWatcher({ adapter, getRules: () => rules });

    // Act
    const res = await watcher.inspectOnce(1000);

    // Assert
    expect(res.blocked).toBe(true);
    expect(res.domain).toBe('bet365.com');
  });

  it('nenhuma frase legítima vira bloqueio por título', async () => {
    // Arrange
    const all = { ...adult, enabledCategories: PREDEFINED_CATEGORIES.map((c) => c.id) };
    const titles = fs
      .readFileSync('tests/domain/fixtures/frases-legitimas.tsv', 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => l.split('\t')[1]);
    const adapter = new Fake();
    const watcher = new WindowsBrowserWatcher({ adapter, getRules: () => all, redirectCooldownMs: 0 });

    // Act
    const blocked: string[] = [];
    let t = 0;
    for (const title of titles) {
      adapter.tab = { browser: 'chrome', url: '', title: `${title} - Google Chrome` };
      t += 1000;
      const r = await watcher.inspectOnce(t);
      if (r.blocked && r.reason === 'KEYWORD') blocked.push(`${title} -> ${r.ruleLabel}`);
    }

    // Assert
    expect(blocked).toEqual([]);
  });

  it('"Nova guia" e título vazio não fazem nada', async () => {
    // Arrange
    const adapter = new Fake();
    const watcher = new WindowsBrowserWatcher({ adapter, getRules: () => adult });

    // Act
    adapter.tab = { browser: 'chrome', url: '', title: 'Nova guia - Google Chrome' };
    const a = await watcher.inspectOnce(1000);
    adapter.tab = { browser: 'chrome', url: '', title: '' };
    const b = await watcher.inspectOnce(2000);

    // Assert
    expect(a.blocked).toBe(false);
    expect(b.blocked).toBe(false);
    expect(adapter.redirects).toEqual([]);
  });

  it('sem domínio, só o grant * libera', async () => {
    // Arrange
    const adapter = new Fake();
    adapter.tab = { browser: 'chrome', url: '', title: 'Pornhub - Google Chrome' };
    const withDomainGrant = new WindowsBrowserWatcher({ adapter, getRules: () => adult, initialGrants: [{ target: 'pornhub.com', expiresAtMs: 99_999 }] });
    const withWildcard = new WindowsBrowserWatcher({ adapter, getRules: () => adult, initialGrants: [{ target: '*', expiresAtMs: 99_999 }] });

    // Act
    const a = await withDomainGrant.inspectOnce(1000);
    const b = await withWildcard.inspectOnce(1000);

    // Assert
    expect(a.blocked).toBe(true);
    expect(b.blocked).toBe(false);
    expect(b.grantedTemporary).toBe(true);
  });

  it('o mesmo título não redireciona de novo antes de 10 s (anti-loop)', async () => {
    // Arrange
    const adapter = new Fake();
    adapter.tab = { browser: 'chrome', url: '', title: 'Pornhub - Google Chrome' };
    const watcher = new WindowsBrowserWatcher({ adapter, getRules: () => adult });

    // Act
    await watcher.inspectOnce(1000);
    await watcher.inspectOnce(3000);
    await watcher.inspectOnce(12_000);

    // Assert
    expect(adapter.redirects).toHaveLength(2);
  });

  it('o título que muda depois do redirecionamento ("e mais 1 página") não abre outra aba no mesmo intervalo', async () => {
    // Arrange
    const adapter = new Fake();
    const watcher = new WindowsBrowserWatcher({ adapter, getRules: () => adult });

    // Act
    adapter.tab = { browser: 'msedge', url: '', title: 'Pornhub videos — Microsoft​ Edge' };
    await watcher.inspectOnce(1000);
    adapter.tab = { browser: 'msedge', url: '', title: 'Pornhub videos e mais 1 página - Perfil 1 — Microsoft​ Edge' };
    await watcher.inspectOnce(2500);
    await watcher.inspectOnce(4000);

    // Assert
    expect(adapter.redirects).toHaveLength(1);
  });
});

describe('WindowsBrowserTabAdapter com helper persistente (W6, W11a)', () => {
  it('mapeia o processo do helper para o navegador e devolve o título da janela', async () => {
    // Arrange
    const adapter = new WindowsBrowserTabAdapter({ helper: { probe: async () => ({ proc: 'msedge', title: 'Google - Microsoft Edge' }) } });

    // Act
    const tab = await adapter.getActiveTab();

    // Assert
    expect(tab).toEqual({ browser: 'msedge', url: '', title: 'Google - Microsoft Edge' });
  });

  it('reconhece o Dia (processo "Dia", título sem sufixo), visto como navegador padrão no teste real', async () => {
    // Arrange
    const adapter = new WindowsBrowserTabAdapter({ helper: { probe: async () => ({ proc: 'Dia', title: 'Página pausada — monBlock' }) } });

    // Act
    const tab = await adapter.getActiveTab();

    // Assert
    expect(tab).toEqual({ browser: 'dia', url: '', title: 'Página pausada — monBlock' });
  });

  it('processo que não é navegador, ou helper sem resposta, devolve null', async () => {
    expect(await new WindowsBrowserTabAdapter({ helper: { probe: async () => ({ proc: 'cmd', title: 'Prompt' }) } }).getActiveTab()).toBeNull();
    expect(await new WindowsBrowserTabAdapter({ helper: { probe: async () => null } }).getActiveTab()).toBeNull();
  });

  it('redireciona por openExternal com a URL inteira (& e , preservados)', async () => {
    // Arrange
    const openExternal = vi.fn(async () => {});
    const adapter = new WindowsBrowserTabAdapter({ helper: { probe: async () => null }, openExternal });
    const url = 'http://127.0.0.1:49152/blocked?domain=a.com&reason=CATEGORY&rule=Categoria%3A%20Adulto,x';

    // Act
    const ok = await adapter.redirectActiveTab('chrome', url);

    // Assert
    expect(ok).toBe(true);
    expect(openExternal).toHaveBeenCalledWith(url);
  });

  it('recusa redirecionar para outra origem', async () => {
    // Arrange
    const openExternal = vi.fn(async () => {});
    const adapter = new WindowsBrowserTabAdapter({ helper: { probe: async () => null }, openExternal });

    // Act / Assert
    await expect(adapter.redirectActiveTab('chrome', 'https://malicioso.example/')).rejects.toThrow(/URL de redirecionamento inválida/);
    await expect(adapter.redirectActiveTab('chrome', 'http://127.0.0.1:49152.evil.example/blocked')).rejects.toThrow(/URL de redirecionamento inválida/);
    expect(openExternal).not.toHaveBeenCalled();
  });
});
