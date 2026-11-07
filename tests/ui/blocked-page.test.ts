/** Página de bloqueio (spec 2026-11-06-refino-pagina-de-bloqueio-design.md): honestidade, dados reais e motion calmo. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const html = fs.readFileSync(path.resolve(__dirname, '../../docs/design/blocked-page.html'), 'utf8');

describe('blocked-page.html', () => {
  it('não afirma envio, verificação nem liberação que o sistema não faz (catraca unidirecional)', () => {
    for (const lie of ['Acesso liberado', 'Pedido enviado', 'Código verificado', 'Comprovante', 'Validar e Liberar', 'Permanente']) {
      expect(html).not.toContain(lie);
    }
    expect(html).not.toMatch(/<form|<input|<textarea|<select/);
    expect(html).toContain('Esta página não libera acessos');
  });

  it('usa os parâmetros reais do watcher (domain, reason, rule) e não mostra exemplos fixos', () => {
    expect(html).toContain("params.get('domain')");
    expect(html).toContain("params.get('rule')");
    expect(html).not.toContain('bet-exemplo.com');
    expect(html).not.toContain('MB-8492');
    expect(html).toMatch(/id="factDomain"[^>]*hidden/);
  });

  it('renderiza a query só com textContent (nunca innerHTML)', () => {
    expect(html).not.toContain('innerHTML');
    expect(html).toContain('textContent');
  });

  it('saída segura em destaque, sem estilos inline e sem tema fixo (segue o sistema)', () => {
    expect(html).toContain('id="closeBtn"');
    expect(html).not.toMatch(/\sstyle="/);
    expect(html).not.toMatch(/<html[^>]*data-theme/);
  });

  it('motion: só transform/opacity, respiração por tempo decorrido e reduced-motion', () => {
    expect(html).toContain('@media (prefers-reduced-motion: reduce)');
    expect(html).toContain('performance.now()');
    expect(html).toContain('(now - startedAt)');
    expect(html).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
    // o botão de saída nunca recebe a animação de entrada
    expect(html).not.toMatch(/<button[^>]*closeBtn[^>]*class="[^"]*rise/);
    expect(html).not.toMatch(/class="actions[^"]*rise/);
  });
});

// Executa o script da página num contexto simulado (sem DOM real) para pegar regressões de comportamento.
function runPage(search: string, opts: { dark?: boolean; contrast?: boolean } = {}) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
  const els = new Map<string, { textContent: string; hidden: boolean; listeners: Record<string, Array<(e?: unknown) => void>>; style: Record<string, string>; addEventListener: (t: string, f: (e?: unknown) => void) => void }>();
  const el = (id: string) => {
    if (!els.has(id)) {
      const listeners: Record<string, Array<(e?: unknown) => void>> = {};
      els.set(id, { textContent: '', hidden: id.startsWith('fact'), listeners, style: {}, addEventListener: (t, f) => ((listeners[t] ??= []).push(f), undefined) });
    }
    return els.get(id)!;
  };
  const docListeners: Record<string, Array<(e: unknown) => void>> = {};
  const winListeners: Record<string, Array<(e: unknown) => void>> = {};
  const attrs: Record<string, string> = {};
  let closed = 0;
  const mq = (q: string) => ({
    matches: q.includes('contrast') ? !!opts.contrast : q.includes('dark') ? !!opts.dark : false,
    addEventListener: () => undefined,
  });
  const win = {
    location: { search },
    close: () => { closed += 1; },
    addEventListener: (t: string, f: (e: unknown) => void) => ((winListeners[t] ??= []).push(f), undefined),
  };
  const ctx = {
    window: win,
    document: {
      documentElement: { setAttribute: (k: string, v: string) => { attrs[k] = v; } },
      getElementById: el,
      hidden: false,
      addEventListener: (t: string, f: (e: unknown) => void) => ((docListeners[t] ??= []).push(f), undefined),
    },
    matchMedia: mq,
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => undefined,
    performance: { now: () => 0 },
    URL, URLSearchParams,
  };
  Object.assign(win, { matchMedia: mq });
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  for (const code of scripts) new Function(...Object.keys(ctx), code)(...Object.values(ctx));
  return { el, attrs, winListeners, closedCount: () => closed };
}

describe('blocked-page.html: comportamento (script executado)', () => {
  it('mostra domínio em punycode e o motivo reais; esconde o que não veio; ignora o marcador do Firefox', () => {
    const r = runPage('?domain=%D0%B0pple.com&rule=Palavra-chave%3A%20porn');
    expect(r.el('domain').textContent).toBe('xn--pple-43d.com');
    expect(r.el('factDomain').hidden).toBe(false);
    expect(r.el('rule').textContent).toBe('Palavra-chave: porn');
    expect(runPage('?domain=firefox.active.tab').el('factDomain').hidden).toBe(true);
    expect(runPage('').el('factDomain').hidden).toBe(true);
    expect(runPage('').el('factRule').hidden).toBe(true);
  });

  it('o botão e a tecla Esc tentam fechar a aba e orientam o fechamento manual', () => {
    const r = runPage('?domain=x.com');
    r.el('closeBtn').listeners.click![0]!();
    expect(r.closedCount()).toBe(1);
    expect(r.el('status').textContent).toContain('Cmd+W');
    r.winListeners.keydown![0]!({ key: 'Escape' });
    expect(r.closedCount()).toBe(2);
    r.winListeners.keydown![0]!({ key: 'a' });
    expect(r.closedCount()).toBe(2);
  });

  it('tema pelo sistema: alto contraste > Capycro escuro > Capycro', () => {
    expect(runPage('', { contrast: true, dark: true }).attrs['data-theme']).toBe('high-contrast');
    expect(runPage('', { dark: true }).attrs['data-theme']).toBe('capycro-dark');
    expect(runPage('').attrs['data-theme']).toBe('capycro');
  });

  it('a respiração não começa sozinha (só por escolha)', () => {
    const r = runPage('');
    expect(r.el('breathToggle').textContent).toBe('');
    expect(html).toContain('running = false');
    expect(html).toContain('Respirar comigo');
  });
});

describe('tema Capycro escuro (tokens.css)', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../../docs/design/tokens.css'), 'utf8');
  const block = css.match(/\[data-theme="capycro-dark"\],\s*\.theme-capycro-dark\s*\{([^}]*)\}/)![1]!;
  const v = (name: string) => block.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))![1]!;
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const ratio = (a: string, b: string) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi! + 0.05) / (lo! + 0.05); };

  it('texto, primário e acento passam AA sobre fundo e cartão; zero roxo', () => {
    for (const [fg, bg] of [['text-color', 'surface-ground'], ['text-color', 'surface-card'], ['text-color-secondary', 'surface-card'], ['primary-color', 'surface-card'], ['accent-color', 'surface-ground']] as const) {
      expect(ratio(v(fg), v(bg))).toBeGreaterThanOrEqual(4.5);
    }
    expect(ratio(v('primary-foreground'), v('primary-color'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(v('accent-foreground'), v('accent-color'))).toBeGreaterThanOrEqual(4.5);
    expect(block.toLowerCase()).not.toMatch(/#8b5cf6|#7c3aed|#a855f7|#6366f1/);
  });

  it('detalhes marrons (variante B): borda e rótulo em marrom legível sobre o cartão', () => {
    expect(v('surface-border')).toBe('#5a4636');
    expect(ratio(v('detail-color'), v('surface-card'))).toBeGreaterThanOrEqual(4.5);
  });

  it('o seletor automático de escuro não sobrescreve o tema explícito', () => {
    expect(css).toContain(':not([data-theme="capycro-dark"])');
  });
});
