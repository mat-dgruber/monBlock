import { describe, expect, it } from 'vitest';
import { TrustedClock } from '../../src/daemon/trusted-clock.js';

const H = 3600_000;

function fakeClock(start = 1_000_000) {
  const t = { wall: start, mono: 0 };
  const clock = new TrustedClock({ wallNow: () => t.wall, monoNowMs: () => t.mono });
  return { t, clock, tick: (ms: number) => { t.wall += ms; t.mono += ms; } };
}

describe('TrustedClock (RN-DAEMON-08)', () => {
  it('nowForExpiry acompanha o relógio quando nada é adulterado', () => {
    const { clock, tick } = fakeClock();
    const a = clock.nowForExpiry();
    tick(5_000);
    expect(clock.nowForExpiry() - a).toBe(5_000);
  });

  it('atrasar o relógio de parede não prolonga concessões', () => {
    const { t, clock } = fakeClock();
    const grantExpiresAt = clock.nowForExpiry() + 15 * 60_000;
    t.wall -= H;
    t.mono += 15 * 60_000;
    expect(clock.nowForExpiry()).toBeGreaterThanOrEqual(grantExpiresAt);
  });

  it('adiantar o relógio de parede expira concessões antes (a favor da restrição)', () => {
    const { t, clock } = fakeClock();
    const grantExpiresAt = clock.nowForExpiry() + 15 * 60_000;
    t.wall += H;
    expect(clock.nowForExpiry()).toBeGreaterThan(grantExpiresAt);
  });

  it('adiantar o relógio de parede 72h não acelera o tempo confiável', () => {
    const { t, clock } = fakeClock();
    const start = clock.trustedNow();
    t.wall += 72 * H;
    t.mono += 1_000;
    expect(clock.trustedNow() - start).toBe(1_000);
  });

  it('âncora do servidor corrige o tempo confiável, inclusive para trás', () => {
    const { t, clock } = fakeClock();
    t.wall += 72 * H; // usuário adiantou antes da instalação
    const inflated = new TrustedClock({ wallNow: () => t.wall, monoNowMs: () => t.mono });
    inflated.ingestServerDate(new Date(1_000_000).toUTCString());
    expect(Math.abs(inflated.trustedNow() - 1_000_000)).toBeLessThan(1_000);
    t.mono += 2_000;
    expect(Math.abs(inflated.trustedNow() - 1_002_000)).toBeLessThan(1_000);
    void clock;
  });

  it('ignora cabeçalho Date inválido', () => {
    const { clock } = fakeClock();
    const before = clock.trustedNow();
    clock.ingestServerDate('lixo');
    expect(clock.trustedNow()).toBe(before);
  });

  it('restore após reboot retoma o tempo confiável persistido sem regredir', () => {
    const { t, clock, tick } = fakeClock();
    tick(10 * H);
    const snap = clock.snapshot();
    // reboot: monotônico zera, usuário adiantou a parede 72h
    t.mono = 0;
    t.wall += 72 * H;
    const rebooted = new TrustedClock({ wallNow: () => t.wall, monoNowMs: () => t.mono });
    rebooted.restore(snap);
    expect(rebooted.trustedNow()).toBe(snap.trustedMs);
    expect(rebooted.nowForExpiry()).toBeGreaterThanOrEqual(snap.expiryMs);
  });
});
