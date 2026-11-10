import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppNotificationManager, type ElectronNotificationConstructor } from '../../src/main/notifications.js';

describe('AppNotificationManager (src/main/notifications.ts)', () => {
  let showMock: ReturnType<typeof vi.fn>;
  let mockNotificationClass: ElectronNotificationConstructor;
  let isSupportedMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    showMock = vi.fn();
    isSupportedMock = vi.fn().mockReturnValue(true);

    mockNotificationClass = class {
      static isSupported = isSupportedMock;
      title: string;
      body: string;
      silent?: boolean;
      constructor(options: { title: string; body: string; silent?: boolean }) {
        this.title = options.title;
        this.body = options.body;
        this.silent = options.silent;
      }
      show() {
        showMock(this.title, this.body, this.silent);
      }
    } as unknown as ElectronNotificationConstructor;
  });

  it('deve emitir notificação nativa quando suportado pelo sistema', () => {
    // Arrange
    const manager = new AppNotificationManager({ notificationClass: mockNotificationClass });

    // Act
    const sent = manager.notify({
      id: 'update-available',
      title: 'monBlock — Nova versão',
      body: 'Versão v0.8.2 disponível para download.',
    });

    // Assert
    expect(sent).toBe(true);
    expect(showMock).toHaveBeenCalledWith('monBlock — Nova versão', 'Versão v0.8.2 disponível para download.', false);
  });

  it('não deve emitir notificação se o sistema operacional não suportar', () => {
    // Arrange
    isSupportedMock.mockReturnValue(false);
    const manager = new AppNotificationManager({ notificationClass: mockNotificationClass });

    // Act
    const sent = manager.notify({
      id: 'update-available',
      title: 'monBlock',
      body: 'Atualização',
    });

    // Assert
    expect(sent).toBe(false);
    expect(showMock).not.toHaveBeenCalled();
  });

  it('deve aplicar throttle e suprimir notificações idênticas disparadas dentro do intervalo de 60s', () => {
    // Arrange
    let fakeNow = 100_000;
    const nowFn = () => fakeNow;
    const manager = new AppNotificationManager({
      notificationClass: mockNotificationClass,
      now: nowFn,
      throttleMs: 60_000,
    });

    // Act & Assert — Primeira emissão: OK
    expect(manager.notify({ id: 'cooldown-started', title: 'Aviso', body: 'Cooldown iniciado' })).toBe(true);
    expect(showMock).toHaveBeenCalledTimes(1);

    // Act & Assert — Segunda emissão aos 30s: Suprimida por throttle
    fakeNow += 30_000;
    expect(manager.notify({ id: 'cooldown-started', title: 'Aviso', body: 'Cooldown iniciado' })).toBe(false);
    expect(showMock).toHaveBeenCalledTimes(1);

    // Act & Assert — Emissão com ID diferente: OK (throttle independente)
    expect(manager.notify({ id: 'unblock-approved', title: 'Ajudante', body: 'Liberado' })).toBe(true);
    expect(showMock).toHaveBeenCalledTimes(2);

    // Act & Assert — Terceira emissão após 61s: OK
    fakeNow += 31_000; // total 61s desde a primeira
    expect(manager.notify({ id: 'cooldown-started', title: 'Aviso', body: 'Cooldown iniciado' })).toBe(true);
    expect(showMock).toHaveBeenCalledTimes(3);
  });

  it('deve permitir envio forçado quando force = true ignorando throttle', () => {
    // Arrange
    let fakeNow = 100_000;
    const manager = new AppNotificationManager({
      notificationClass: mockNotificationClass,
      now: () => fakeNow,
      throttleMs: 60_000,
    });

    expect(manager.notify({ id: 'update-available', title: 'V1', body: 'B1' })).toBe(true);
    fakeNow += 5_000;
    expect(manager.notify({ id: 'update-available', title: 'V1', body: 'B1', force: true })).toBe(true);
    expect(showMock).toHaveBeenCalledTimes(2);
  });
});

