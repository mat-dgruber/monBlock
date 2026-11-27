import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startBrowserWatcherLoop, type WatcherLoopState } from '../../src/main/watcher-loop.js';

const rules = { enabledCategories: ['adult'], blockedDomains: [], allowlistDomains: ['ok.org'], keywords: [], lockIncognito: false };
const stateWith = (grants: Array<{ target: string; expiresAtMs: number }>): WatcherLoopState => ({ rules, temporaryGrants: grants });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('startBrowserWatcherLoop (W5)', () => {
  it('inspeciona periodicamente e passa os grants como allowlist', async () => {
    // Arrange
    const inspectOnce = vi.fn(async () => ({ blocked: false }));
    const seen: string[][] = [];
    const stop = startBrowserWatcherLoop({
      watcher: { inspectOnce },
      fetchState: async () => stateWith([{ target: 'liberado.com', expiresAtMs: Date.now() + 60_000 }]),
      onRules: (r) => seen.push(r.allowlistDomains),
    });

    // Act
    await vi.advanceTimersByTimeAsync(1500 * 3 + 10);
    stop();

    // Assert
    expect(inspectOnce.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(seen[0]).toEqual(['ok.org', 'liberado.com']);
  });

  it('se a consulta ao daemon falhar, segue com as últimas regras mas sem nenhum grant', async () => {
    // Arrange
    let fail = false;
    const seen: string[][] = [];
    const stop = startBrowserWatcherLoop({
      watcher: { inspectOnce: async () => ({ blocked: false }) },
      fetchState: async () => (fail ? null : stateWith([{ target: 'liberado.com', expiresAtMs: Date.now() + 60_000 }])),
      onRules: (r) => seen.push(r.allowlistDomains),
    });
    await vi.advanceTimersByTimeAsync(10);

    // Act
    fail = true;
    await vi.advanceTimersByTimeAsync(1600);
    stop();

    // Assert
    expect(seen[0]).toEqual(['ok.org', 'liberado.com']);
    expect(seen.at(-1)).toEqual(['ok.org']);
  });

  it('grant que vence enquanto a consulta roda já não vale', async () => {
    // Arrange
    const inspectOnce = vi.fn(async () => ({ blocked: false }));
    const stop = startBrowserWatcherLoop({
      watcher: { inspectOnce },
      fetchState: async () => {
        const expiresAtMs = Date.now() + 50;
        vi.advanceTimersByTime(100); // a consulta demora mais que o grant
        return stateWith([{ target: '*', expiresAtMs }]);
      },
      onRules: () => {},
    });

    // Act
    await vi.advanceTimersByTimeAsync(10);
    stop();

    // Assert
    expect(inspectOnce).toHaveBeenCalled();
  });

  it('o bloqueio vira um evento de auditoria em JSON com horário UTC, sem título', async () => {
    // Arrange
    const logs: string[] = [];
    const stop = startBrowserWatcherLoop({
      watcher: { inspectOnce: async () => ({ blocked: true, browser: 'chrome', ruleLabel: 'Categoria: Adulto' }) },
      fetchState: async () => stateWith([]),
      onRules: () => {},
      log: (m) => logs.push(m),
    });

    // Act
    await vi.advanceTimersByTimeAsync(10);
    stop();

    // Assert
    const event = JSON.parse(logs[0]);
    expect(event).toMatchObject({ event: 'layer3.block', browser: 'chrome', rule: 'Categoria: Adulto' });
    expect(new Date(event.at).toISOString()).toBe(event.at);
  });

  it('com grant * ativo não inspeciona', async () => {
    // Arrange
    const inspectOnce = vi.fn(async () => ({ blocked: false }));
    const stop = startBrowserWatcherLoop({
      watcher: { inspectOnce },
      fetchState: async () => stateWith([{ target: '*', expiresAtMs: Date.now() + 60_000 }]),
      onRules: () => {},
    });

    // Act
    await vi.advanceTimersByTimeAsync(5000);
    stop();

    // Assert
    expect(inspectOnce).not.toHaveBeenCalled();
  });

  it('para de vez quando a fonte fica indisponível (helper em CLM), sem loop', async () => {
    // Arrange
    const inspectOnce = vi.fn(async () => ({ blocked: false }));
    let available = true;
    startBrowserWatcherLoop({
      watcher: { inspectOnce },
      fetchState: async () => stateWith([]),
      onRules: () => {},
      isAvailable: () => available,
    });
    await vi.advanceTimersByTimeAsync(10);
    const before = inspectOnce.mock.calls.length;

    // Act
    available = false;
    await vi.advanceTimersByTimeAsync(60_000);

    // Assert
    expect(inspectOnce.mock.calls.length).toBeLessThanOrEqual(before + 1);
  });

  it('inspeção lenta aplica backoff até 5 s e volta a 1,5 s', async () => {
    // Arrange
    const delays: number[] = [];
    let slow = true;
    const stop = startBrowserWatcherLoop({
      watcher: {
        inspectOnce: async () => {
          if (slow) vi.advanceTimersByTime(900);
          return { blocked: false };
        },
      },
      fetchState: async () => stateWith([]),
      onRules: () => {},
      onScheduled: (ms) => delays.push(ms),
    });

    // Act
    await vi.advanceTimersByTimeAsync(20_000);
    slow = false;
    await vi.advanceTimersByTimeAsync(10_000);
    stop();

    // Assert
    expect(Math.max(...delays)).toBe(5000);
    expect(delays.at(-1)).toBe(1500);
  });

  it('erro no ciclo espera 5 s e continua', async () => {
    // Arrange
    const delays: number[] = [];
    const stop = startBrowserWatcherLoop({
      watcher: { inspectOnce: async () => { throw new Error('falhou'); } },
      fetchState: async () => stateWith([]),
      onRules: () => {},
      onScheduled: (ms) => delays.push(ms),
      log: () => {},
    });

    // Act
    await vi.advanceTimersByTimeAsync(11_000);
    stop();

    // Assert
    expect(delays.slice(0, 2)).toEqual([5000, 5000]);
  });

  it('stop impede novos ciclos', async () => {
    // Arrange
    const inspectOnce = vi.fn(async () => ({ blocked: false }));
    const stop = startBrowserWatcherLoop({ watcher: { inspectOnce }, fetchState: async () => stateWith([]), onRules: () => {} });
    await vi.advanceTimersByTimeAsync(10);

    // Act
    stop();
    const n = inspectOnce.mock.calls.length;
    await vi.advanceTimersByTimeAsync(30_000);

    // Assert
    expect(inspectOnce.mock.calls.length).toBe(n);
  });
});
