import { describe, expect, it, vi } from 'vitest';
import { APP_USER_MODEL_ID, applyWindowsAppIdentity, trayIconSpec } from '../../src/main/platform-shell.js';

describe('trayIconSpec (W13)', () => {
  it('macOS usa template 18 pt (a barra de menu pinta o ícone)', () => {
    expect(trayIconSpec('darwin')).toEqual({ size: 18, template: true });
  });

  it('Windows usa o escudo colorido em 16 px, sem template (senão a bandeja fica vazia)', () => {
    expect(trayIconSpec('win32')).toEqual({ size: 16, template: false });
  });
});

describe('applyWindowsAppIdentity (W14)', () => {
  it('no Windows define o AppUserModelID usado pelo atalho do instalador', () => {
    // Arrange
    const app = { setAppUserModelId: vi.fn() };

    // Act
    applyWindowsAppIdentity(app, 'win32');

    // Assert
    expect(app.setAppUserModelId).toHaveBeenCalledWith(APP_USER_MODEL_ID);
    expect(APP_USER_MODEL_ID).toBe('com.ccat.monblock');
  });

  it('fora do Windows não faz nada', () => {
    // Arrange
    const app = { setAppUserModelId: vi.fn() };

    // Act
    applyWindowsAppIdentity(app, 'darwin');

    // Assert
    expect(app.setAppUserModelId).not.toHaveBeenCalled();
  });
});
