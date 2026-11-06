/**
 * @file trusted-clock.ts
 * @description Relógio confiável assimétrico (RN-DAEMON-08 / ADR-0007).
 *
 * O relógio só trabalha a favor da restrição:
 * - `nowForExpiry()` avança por `max(Δmonotônico, Δparede)`: adiantar a parede só
 *   expira concessões antes; atrasar não prolonga nada.
 * - `trustedNow()` avança só pelo tempo monotônico e é corrigido pelo cabeçalho `Date`
 *   das respostas HTTPS do Telegram. Usado no cooldown de 72h, rate limit e heartbeat.
 *
 * `process.hrtime` no macOS para durante o sono e zera no reboot: offline, o tempo
 * confiável só avança com a máquina acordada (conservador, aceito na spec §6).
 */

export interface TrustedClockSnapshot {
  expiryMs: number;
  trustedMs: number;
}

export interface TrustedClockOptions {
  wallNow?: () => number;
  monoNowMs?: () => number;
}

const defaultMonoNowMs = (): number => Number(process.hrtime.bigint() / 1_000_000n);

export class TrustedClock {
  private readonly wallNow: () => number;
  private readonly monoNowMs: () => number;
  private expiry: { value: number; wall: number; mono: number };
  private trusted: { value: number; mono: number };

  constructor(options: TrustedClockOptions = {}) {
    this.wallNow = options.wallNow ?? (() => Date.now());
    this.monoNowMs = options.monoNowMs ?? defaultMonoNowMs;
    const wall = this.wallNow();
    const mono = this.monoNowMs();
    this.expiry = { value: wall, wall, mono };
    // ponytail: sem snapshot nem âncora, a parede é a melhor estimativa inicial; a primeira âncora corrige.
    this.trusted = { value: wall, mono };
  }

  public nowForExpiry(): number {
    const wall = this.wallNow();
    const mono = this.monoNowMs();
    this.expiry.value += Math.max(mono - this.expiry.mono, wall - this.expiry.wall, 0);
    this.expiry.wall = wall;
    this.expiry.mono = mono;
    return this.expiry.value;
  }

  public trustedNow(): number {
    const mono = this.monoNowMs();
    this.trusted.value += Math.max(mono - this.trusted.mono, 0);
    this.trusted.mono = mono;
    return this.trusted.value;
  }

  /**
   * Ancora o tempo confiável no `Date` de uma resposta TLS do servidor. Pode recuar:
   * recuar só atrasa o cooldown, o que favorece a restrição.
   */
  public ingestServerDate(header: string | null | undefined): void {
    const serverMs = header ? Date.parse(header) : NaN;
    if (Number.isNaN(serverMs)) return;
    this.trusted = { value: serverMs, mono: this.monoNowMs() };
  }

  public snapshot(): TrustedClockSnapshot {
    return { expiryMs: this.nowForExpiry(), trustedMs: this.trustedNow() };
  }

  /** Retoma após reboot. Na expiração, parede adiantada só antecipa expirações (seguro). */
  public restore(snapshot: Partial<TrustedClockSnapshot>): void {
    const wall = this.wallNow();
    const mono = this.monoNowMs();
    if (Number.isFinite(snapshot.expiryMs)) {
      this.expiry = { value: Math.max(snapshot.expiryMs as number, wall), wall, mono };
    }
    if (Number.isFinite(snapshot.trustedMs)) {
      this.trusted = { value: snapshot.trustedMs as number, mono };
    }
  }
}
