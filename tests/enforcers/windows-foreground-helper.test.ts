import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { ForegroundHelper, type HelperChild } from '../../src/enforcers/windows-foreground-helper.js';

/** Processo falso do helper: responde `probe` conforme `onProbe` e emite `ready` se `ready` for true. */
class FakeChild extends EventEmitter implements HelperChild {
  stdout = new EventEmitter();
  killed = false;
  writes: string[] = [];
  stdin = {
    write: (s: string) => {
      this.writes.push(s);
      if (s === 'probe\n') {
        const out = this.onProbe();
        if (out !== undefined) setTimeout(() => this.stdout.emit('data', Buffer.from(`${out}\r\n`)), 1);
      }
      return true;
    },
    end: () => {},
  };
  constructor(private readonly onProbe: () => string | undefined, ready: boolean | 'exit') {
    super();
    setTimeout(() => {
      if (ready === true) this.stdout.emit('data', Buffer.from('{"ready":true}\r\n'));
      if (ready === 'exit') this.emit('exit', 0);
    }, 1);
  }
  kill() {
    this.killed = true;
    this.emit('exit', null);
    return true;
  }
}

const spawnCounter = (factory: () => FakeChild) => {
  const children: FakeChild[] = [];
  return {
    children,
    spawnFn: () => {
      const c = factory();
      children.push(c);
      return c;
    },
  };
};

describe('ForegroundHelper (W8)', () => {
  it('100 probes usam um único processo', async () => {
    // Arrange
    const { children, spawnFn } = spawnCounter(() => new FakeChild(() => '{"proc":"chrome","title":"Aba"}', true));
    const helper = new ForegroundHelper({ spawnFn });

    // Act
    let last = null;
    for (let i = 0; i < 100; i++) last = await helper.probe();

    // Assert
    expect(children).toHaveLength(1);
    expect(last).toEqual({ proc: 'chrome', title: 'Aba' });
    expect(helper.status()).toBe('ready');
    helper.dispose();
  });

  it('probe travado mata o processo e o próximo probe cria outro', async () => {
    // Arrange
    let hang = true;
    const { children, spawnFn } = spawnCounter(
      () => new FakeChild(() => (hang ? undefined : '{"proc":"msedge","title":"X"}'), true)
    );
    const helper = new ForegroundHelper({ spawnFn, probeTimeoutMs: 30 });

    // Act
    const first = await helper.probe();
    hang = false;
    const second = await helper.probe();

    // Assert
    expect(first).toBeNull();
    expect(children[0].killed).toBe(true);
    expect(children).toHaveLength(2);
    expect(second).toEqual({ proc: 'msedge', title: 'X' });
    helper.dispose();
  });

  it('sem handshake (CLM/AppLocker: sai com 0 sem imprimir) fica indisponível sem loop', async () => {
    // Arrange
    const { children, spawnFn } = spawnCounter(() => new FakeChild(() => undefined, 'exit'));
    const helper = new ForegroundHelper({ spawnFn, readyTimeoutMs: 50 });

    // Act
    for (let i = 0; i < 10; i++) await helper.probe();

    // Assert
    expect(helper.status()).toBe('unavailable');
    expect(children).toHaveLength(3);
  });

  it('handshake que não chega no prazo também conta como falha', async () => {
    // Arrange
    const { children, spawnFn } = spawnCounter(() => new FakeChild(() => undefined, false));
    const helper = new ForegroundHelper({ spawnFn, readyTimeoutMs: 20 });

    // Act
    for (let i = 0; i < 5; i++) await helper.probe();

    // Assert
    expect(helper.status()).toBe('unavailable');
    expect(children).toHaveLength(3);
    expect(children.every((c) => c.killed)).toBe(true);
  });

  it('linha que não é JSON válido vira probe nulo, sem derrubar o helper', async () => {
    // Arrange
    const { spawnFn } = spawnCounter(() => new FakeChild(() => 'lixo', true));
    const helper = new ForegroundHelper({ spawnFn });

    // Act
    const res = await helper.probe();

    // Assert
    expect(res).toBeNull();
    expect(helper.status()).toBe('ready');
    helper.dispose();
  });

  it('dispose encerra o processo e probes seguintes não recriam', async () => {
    // Arrange
    const { children, spawnFn } = spawnCounter(() => new FakeChild(() => '{"proc":"chrome","title":"A"}', true));
    const helper = new ForegroundHelper({ spawnFn });
    await helper.probe();

    // Act
    helper.dispose();
    const after = await helper.probe();

    // Assert
    expect(children[0].killed).toBe(true);
    expect(after).toBeNull();
    expect(children).toHaveLength(1);
  });
});
