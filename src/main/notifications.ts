/**
 * Gerenciador de Notificações Nativas do monBlock no macOS (`src/main/notifications.ts`).
 *
 * Utiliza a API `Notification` do Electron com conformidade aos requisitos de acessibilidade,
 * throttle temporal anti-spam e integração à Central de Notificações nativa (`UNUserNotificationCenter`).
 */

export type NotificationEventId =
  | 'update-available'
  | 'update-downloaded'
  | 'unblock-approved'
  | 'unblock-rejected'
  | 'cooldown-started'
  | 'cooldown-finished'
  | 'profile-alert';

export interface AppNotificationPayload {
  id: NotificationEventId;
  title: string;
  body: string;
  silent?: boolean;
  force?: boolean;
}

export interface ElectronNotificationInstance {
  show: () => void;
}

export interface ElectronNotificationConstructor {
  new (options: { title: string; body: string; silent?: boolean }): ElectronNotificationInstance;
  isSupported: () => boolean;
}

export interface AppNotificationManagerOptions {
  notificationClass?: ElectronNotificationConstructor;
  now?: () => number;
  throttleMs?: number;
}

export class AppNotificationManager {
  private notificationClass?: ElectronNotificationConstructor;
  private readonly now: () => number;
  private readonly throttleMs: number;
  private readonly lastFiredTimes = new Map<NotificationEventId, number>();

  constructor(options: AppNotificationManagerOptions = {}) {
    this.notificationClass = options.notificationClass;
    this.now = options.now ?? (() => Date.now());
    this.throttleMs = options.throttleMs ?? 60_000;
  }

  setNotificationClass(cls: ElectronNotificationConstructor): void {
    this.notificationClass = cls;
  }

  notify(payload: AppNotificationPayload): boolean {
    const cls = this.notificationClass;
    if (!cls) return false;

    try {
      if (typeof cls.isSupported === 'function' && !cls.isSupported()) {
        return false;
      }
    } catch {
      return false;
    }

    const currentTime = this.now();
    const lastFired = this.lastFiredTimes.get(payload.id) ?? 0;

    if (!payload.force && currentTime - lastFired < this.throttleMs) {
      return false;
    }

    try {
      const notif = new cls({
        title: payload.title,
        body: payload.body,
        silent: payload.silent ?? false,
      });
      notif.show();
      this.lastFiredTimes.set(payload.id, currentTime);
      return true;
    } catch {
      return false;
    }
  }
}

