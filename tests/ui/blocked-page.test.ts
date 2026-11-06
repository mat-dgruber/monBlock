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
    expect(html).toContain("params.get('reason')");
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
