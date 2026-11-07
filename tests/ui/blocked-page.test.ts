/** Página de bloqueio (spec 2026-11-06-refino-pagina-de-bloqueio-design.md): honestidade, dados reais, pedido e motion calmo. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const html = fs.readFileSync(path.resolve(__dirname, '../../docs/design/blocked-page.html'), 'utf8');

type Listener = (e?: unknown) => unknown;
interface Stub {
  textContent: string; hidden: boolean; value: string; disabled: boolean; dataset: Record<string, string>;
  listeners: Record<string, Listener[]>; style: { setProperty: (k: string, v: string) => void; props: Record<string, string> };
  addEventListener: (t: string, f: Listener) => void; appendChild: (c: unknown) => void; cloneNode: () => Stub; removeAttribute: () => void;
  alt?: string; children: unknown[];
}
interface PageOpts { timers?: Array<{ fn: () => void; ms: number }>; duration?: string; dark?: boolean; contrast?: boolean; reduced?: boolean; fetch?: (url: string, init: { body: string; headers: Record<string, string> }) => Promise<{ status: number; json: () => Promise<unknown> }> }

// Executa o script da página num contexto simulado (sem DOM real) para pegar regressões de comportamento.
function runPage(search: string, opts: PageOpts = {}) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
  const els = new Map<string, Stub>();
  const make = (id: string): Stub => {
    const listeners: Record<string, Listener[]> = {};
    const props: Record<string, string> = {};
    const stub: Stub = {
      textContent: '', hidden: id.startsWith('fact'), value: '', disabled: false, dataset: {}, listeners, children: [],
      style: { props, setProperty: (k, v) => { props[k] = v; } },
      addEventListener: (t, f) => { (listeners[t] ??= []).push(f); },
      appendChild: (c) => { stub.children.push(c); },
      cloneNode: () => make(id + '-clone'),
      removeAttribute: () => undefined,
    };
    return stub;
  };
  const el = (id: string) => { if (!els.has(id)) els.set(id, make(id)); return els.get(id)!; };
  const docListeners: Record<string, Listener[]> = {};
  const winListeners: Record<string, Listener[]> = {};
  const attrs: Record<string, string> = {};
  let closed = 0, raf = 0;
  const mq = (q: string) => ({
    matches: q.includes('contrast') ? !!opts.contrast : q.includes('dark') ? !!opts.dark : q.includes('reduced-motion') ? !!opts.reduced : false,
    addEventListener: () => undefined,
  });
  const win = { location: { search }, close: () => { closed += 1; }, addEventListener: (t: string, f: Listener) => { (winListeners[t] ??= []).push(f); }, matchMedia: mq };
  const ctx = {
    window: win,
    document: {
      documentElement: { setAttribute: (k: string, v: string) => { attrs[k] = v; } },
      getElementById: el, hidden: false,
      querySelector: () => ({ content: 'tok-de-pagina' }),
      addEventListener: (t: string, f: Listener) => { (docListeners[t] ??= []).push(f); },
    },
    matchMedia: mq,
    requestAnimationFrame: () => { raf += 1; return raf; },
    cancelAnimationFrame: () => undefined,
    performance: { now: () => 0 },
    URL, URLSearchParams, AbortController,
    // timers capturados: os testes disparam o ciclo de consulta na mão
    setTimeout: (fn: () => void, ms: number) => { (opts.timers ??= []).push({ fn, ms }); return 1; },
    clearTimeout: () => undefined,
    FormData: class { get() { return opts.duration ?? '15'; } },
    crypto: { randomUUID: () => 'uuid-fixo' },
    fetch: opts.fetch ?? (async () => ({ status: 503, json: async () => ({}) })),
  };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  for (const code of scripts) new Function(...Object.keys(ctx), code)(...Object.values(ctx));
  return { el, attrs, winListeners, closedCount: () => closed, rafCount: () => raf };
}

async function submit(r: ReturnType<typeof runPage>, reason: string) {
  r.el('reason').value = reason;
  await r.el('requestForm').listeners.submit![0]!({ preventDefault: () => undefined });
  return r.el('sendStatus').textContent;
}

describe('blocked-page.html: conteúdo', () => {
  it('não afirma verificação nem liberação que o sistema não faz (catraca unidirecional)', () => {
    for (const lie of ['Acesso liberado', 'Código verificado', 'Comprovante', 'Validar e Liberar']) {
      expect(html).not.toContain(lie);
    }
    expect(html).toContain('Esta página não libera acessos');
  });

  it('usa os parâmetros reais do watcher (domain, rule) e não mostra exemplos fixos', () => {
    expect(html).toContain("params.get('domain')");
    expect(html).toContain("params.get('rule')");
    expect(html).not.toContain('bet-exemplo.com');
    expect(html).not.toContain('MB-8492');
    expect(html).toMatch(/id="factDomain"[^>]*hidden/);
  });

  it('tem o logo da CCAT, renderiza a query só com textContent e não usa estilos inline', () => {
    expect(html).toMatch(/<img id="logo" src="data:image\/png;base64,/);
    expect(html).not.toContain('innerHTML');
    expect(html).not.toMatch(/\sstyle="/);
    expect(html).not.toMatch(/<html[^>]*data-theme/);
  });

  it('saída segura em destaque e fora da animação de entrada', () => {
    expect(html).toContain('id="closeBtn"');
    expect(html).not.toMatch(/<button[^>]*closeBtn[^>]*class="[^"]*rise/);
    expect(html).not.toMatch(/class="actions[^"]*rise/);
  });
});

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

  it('a respiração começa sozinha, mas fica parada com prefers-reduced-motion', () => {
    expect(runPage('').rafCount()).toBeGreaterThan(0);
    const calm = runPage('', { reduced: true });
    expect(calm.rafCount()).toBe(0);
    expect(calm.el('breathToggle').hidden).toBe(true);
  });
});

describe('blocked-page.html: pedido ao Ajudante (só "enviado" com confirmação do servidor)', () => {
  it('sem motivo não chama o servidor e diz que nada foi enviado', async () => {
    let calls = 0;
    const r = runPage('?domain=x.com', { fetch: async () => { calls += 1; return { status: 202, json: async () => ({}) }; } });
    expect(await submit(r, '  ')).toContain('Nada foi enviado');
    expect(calls).toBe(0);
  });

  it('202 do servidor: confirma o envio, com Idempotency-Key, domínio e duração', async () => {
    let sent: { body: string; headers: Record<string, string> } | undefined;
    const r = runPage('?domain=x.com', { fetch: async (_u, init) => { sent = init; return { status: 202, json: async () => ({}) }; } });
    expect(await submit(r, 'estudo')).toContain('Pedido enviado');
    expect(sent!.headers['Idempotency-Key']).toBe('uuid-fixo');
    expect(JSON.parse(sent!.body)).toEqual({ domain: 'x.com', reason: 'estudo', durationMinutes: 15 });
  });

  it('503 (sem Ajudante) mostra o detalhe do servidor e nunca "enviado"', async () => {
    const r = runPage('?domain=x.com', { fetch: async () => ({ status: 503, json: async () => ({ detail: 'Ainda não há um Ajudante pareado para receber o pedido. Nada foi enviado.' }) }) });
    const text = await submit(r, 'estudo');
    expect(text).toContain('Ajudante pareado');
    expect(text).not.toContain('Pedido enviado');
    expect(r.el('sendStatus').dataset.kind).toBe('error');
  });

  it('oferece 15 min, 1 hora e Permanente; Permanente vai como permanent:true', async () => {
    expect(html).toMatch(/value="15"[\s\S]*value="60"[\s\S]*value="permanent"/);
    expect(html).toContain('Pedir aprovação no Telegram');
    let sent = '';
    const r = runPage('?domain=x.com', { duration: 'permanent', fetch: async (_u, init) => { sent = init.body; return { status: 202, json: async () => ({}) }; } });
    await submit(r, 'site da minha faculdade');
    expect(JSON.parse(sent)).toEqual({ domain: 'x.com', reason: 'site da minha faculdade', permanent: true });
  });

  it('Permanente com motivo curto não envia nada', async () => {
    let called = false;
    const r = runPage('?domain=x.com', { duration: 'permanent', fetch: async () => { called = true; return { status: 202, json: async () => ({}) }; } });
    await submit(r, 'estudo');
    expect(called).toBe(false);
  });

  it('manda o token de página em toda chamada à API', async () => {
    const seen: Array<Record<string, string>> = [];
    const r = runPage('?domain=x.com', { fetch: async (_u, init) => { seen.push(init.headers); return { status: 202, json: async () => ({}) }; } });
    await submit(r, 'estudo');
    expect(seen[0]!['X-MonBlock-Token']).toBe('tok-de-pagina');
  });

  it('depois de enviado, consulta o estado até o Ajudante decidir e só então diz liberado ou negado', async () => {
    const timers: Array<{ fn: () => void; ms: number }> = [];
    const answers: unknown[] = [{ status: 'PENDING' }, { status: 'APPROVED', grantMinutes: 15 }];
    const r = runPage('?domain=x.com', {
      timers,
      fetch: async (url) =>
        url.startsWith('/api/unblock-requests/')
          ? { status: 200, ok: true, json: async () => answers.shift() }
          : { status: 202, json: async () => ({ id: 'req_abc', status: 'PENDING', delivery: 'sent' }) },
    } as PageOpts);
    await submit(r, 'estudo');
    expect(r.el('sendStatus').textContent).toContain('Pedido enviado');
    await new Promise((resolve) => setTimeout(resolve, 0)); // 1ª consulta (PENDING): agenda a próxima
    expect(r.el('sendStatus').textContent).not.toContain('liberou');
    expect(timers.some((t) => t.ms === 3000)).toBe(true);
    timers.find((t) => t.ms === 3000)!.fn();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(r.el('sendStatus').textContent).toContain('liberou por 15 minutos');
  });

  it('entrega que falhou mostra o código offline e nunca "enviado"', async () => {
    const r = runPage('?domain=x.com', { fetch: async () => ({ status: 200, json: async () => ({ id: 'req_abc', delivery: 'failed', fallbackChallengeCode: 'MB-ABC123' }) }) });
    const text = await submit(r, 'estudo');
    expect(text).toContain('MB-ABC123');
    expect(text).not.toContain('Pedido enviado');
  });

  it('falha de rede diz que nada foi enviado e libera o botão', async () => {
    const r = runPage('?domain=x.com', { fetch: async () => { throw new Error('rede'); } });
    expect(await submit(r, 'estudo')).toContain('Nada foi enviado');
    expect(r.el('sendBtn').disabled).toBe(false);
  });
});

describe('blocked-page.html: código do Ajudante (a página nunca libera nada)', () => {
  const submitCode = async (r: ReturnType<typeof runPage>, code: string) => {
    r.el('unlockCode').value = code;
    await r.el('codeForm').listeners.submit![0]!({ preventDefault: () => undefined });
    return r.el('codeStatus').textContent;
  };

  it('sem código não chama o servidor', async () => {
    let calls = 0;
    const r = runPage('', { fetch: async () => { calls += 1; return { status: 501, json: async () => ({}) }; } });
    expect(await submitCode(r, ' ')).toContain('Nada foi liberado');
    expect(calls).toBe(0);
  });

  it('mostra a orientação do servidor (validar no app) e nunca diz que liberou', async () => {
    const r = runPage('', { fetch: async () => ({ status: 501, json: async () => ({ detail: 'Cole o código no app monBlock. Nada foi liberado por esta página.' }) }) });
    const text = await submitCode(r, 'UNLOCK-15M-ABC');
    expect(text).toContain('app monBlock');
    expect(text).not.toMatch(/liberado conforme|Acesso liberado|verificado/i);
    expect(r.el('codeStatus').dataset.kind).toBe('error');
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
