import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { ForegroundHelper, type HelperChild } from '../../src/enforcers/windows-foreground-helper.js';

class Child extends EventEmitter implements HelperChild {
  stdout = new EventEmitter();
  stdin = { write: (s: string) => (this.onWrite(s), true), end: () => {} };
  killed = false;
  onWrite: (s: string) => void = () => {};
  kill() {
    this.killed = true;
    return true;
  }
}

describe('ForegroundHelper — revisão do PR #23', () => {
  it('caractere multibyte partido entre dois chunks não corrompe o título', async () => {
    // Arrange
    const child = new Child();
    child.onWrite = (s) => {
      if (s !== 'probe\n') return;
      const bytes = Buffer.from('{"proc":"chrome","title":"Ação"}\n', 'utf8');
      const cut = bytes.indexOf(0xa7); // segundo byte do "ç"
      setTimeout(() => {
        child.stdout.emit('data', bytes.subarray(0, cut));
        child.stdout.emit('data', bytes.subarray(cut));
      }, 1);
    };
    setTimeout(() => child.stdout.emit('data', Buffer.from('{"ready":true}\n')), 1);
    const helper = new ForegroundHelper({ spawnFn: () => child });

    // Act
    const res = await helper.probe();

    // Assert
    expect(res).toEqual({ proc: 'chrome', title: 'Ação' });
    helper.dispose();
  });

  it('a saída atrasada de um helper antigo não derruba o novo', async () => {
    // Arrange
    const children: Child[] = [];
    const helper = new ForegroundHelper({
      probeTimeoutMs: 20,
      readyTimeoutMs: 200,
      spawnFn: () => {
        const c = new Child();
        const isFirst = children.length === 0;
        children.push(c);
        setTimeout(() => c.stdout.emit('data', Buffer.from('{"ready":true}\n')), 1);
        c.onWrite = (s) => {
          if (s === 'probe\n' && !isFirst) setTimeout(() => c.stdout.emit('data', Buffer.from('{"proc":"msedge","title":"X"}\n')), 1);
        };
        return c;
      },
    });
    await helper.probe(); // o primeiro trava e é morto

    // Act: o primeiro só "sai" agora, enquanto o segundo está subindo
    const second = helper.probe();
    children[0].emit('exit', 0);
    const res = await second;

    // Assert
    expect(res).toEqual({ proc: 'msedge', title: 'X' });
    expect(children[1].killed).toBe(false);
    expect(helper.status()).toBe('ready');
    helper.dispose();
  });

  it('avisa uma vez quando a Camada 3 fica indisponível', async () => {
    // Arrange
    const onUnavailable = vi.fn();
    const helper = new ForegroundHelper({
      readyTimeoutMs: 10,
      onUnavailable,
      spawnFn: () => {
        const c = new Child();
        setTimeout(() => c.emit('exit', 0), 1);
        return c;
      },
    });

    // Act
    for (let i = 0; i < 6; i++) await helper.probe();

    // Assert
    expect(helper.status()).toBe('unavailable');
    expect(onUnavailable).toHaveBeenCalledTimes(1);
  });
});
