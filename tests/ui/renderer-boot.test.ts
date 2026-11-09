/** O script do renderer precisa iniciar sem lançar: um ReferenceError aqui deixa a tela presa em "Conferindo proteção...". */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const src = fs.readFileSync(path.resolve(import.meta.dirname, '../../src/renderer/renderer-init.js'), 'utf8');

// Stub universal: qualquer propriedade/chamada devolve outro stub (só interessa que o init síncrono não lance).
const stub = (): unknown =>
  new Proxy(function () {}, {
    get: (_t, p) => (p === Symbol.toPrimitive ? () => '' : p === 'length' ? 0 : p === Symbol.iterator ? undefined : stub()),
    apply: () => stub(),
    construct: () => stub() as object,
  });

describe('renderer-init.js', () => {
  it('inicia sem lançar erro (sem variável fora de escopo)', () => {
    const ctx: Record<string, unknown> = {
      document: new Proxy({ querySelectorAll: () => [], documentElement: stub() }, { get: (t, p) => (p in t ? (t as Record<string | symbol, unknown>)[p] : stub()) }),
      window: { monblock: stub(), matchMedia: () => stub(), addEventListener() {} },
      localStorage: { getItem: () => null, setItem() {} },
      setTimeout, clearTimeout, setInterval, clearInterval, console,
    };
    ctx.globalThis = ctx;
    expect(() => vm.runInNewContext(src, ctx)).not.toThrow();
  });
});
