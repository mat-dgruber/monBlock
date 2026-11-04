/**
 * Processo Principal Electron & Menu da Tray macOS do monBlock (MOD-04).
 *
 * Implementa:
 * - Configuração Zero-Trust da BrowserWindow (`nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`)
 * - Validação estrita de navegação (`validateNavigationUrl`) bloqueando origens externas
 * - Modelo da Barra de Menu / System Tray macOS (`buildTrayMenuTemplate`) sem opção de sair/desativar (`INV-UI-TRAY-03`)
 * - Independência da janela em relação ao bloqueio (`handleWindowCloseEvent` — `RN-LIFE-01`)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MonBlockDaemon } from '../daemon/monblockd.js';
import { MacOSPlatformEnforcer } from '../enforcers/platform-enforcer.js';
import { TripleStateStore } from '../storage/state-store.js';

const CURRENT_DIR =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// MARK: - Tipos e Contratos do Processo Main

export interface SecureWindowOptions {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  show: boolean;
  backgroundColor: string;
  title: string;
  webPreferences: {
    nodeIntegration: boolean;
    contextIsolation: boolean;
    sandbox: boolean;
    webSecurity: boolean;
    allowRunningInsecureContent: boolean;
    preload: string;
  };
}

export interface TrayStatusSnapshot {
  active: boolean;
  partnerName?: string | null;
  temporaryUnlockRemainingFormatted?: string | null;
  cooldownRemainingFormatted?: string | null;
}

export interface TrayActionHandlers {
  onQuickAdd: () => void;
  onBlockActiveTab: () => void;
  onRequestUnblock: () => void;
  onEnterToken: () => void;
  onOpenDashboard: () => void;
}

export interface TrayMenuItem {
  id?: string;
  label?: string;
  type?: 'normal' | 'separator';
  enabled?: boolean;
  click?: () => void;
}

// MARK: - Funções Puras de Segurança e Ciclo de Vida

/**
 * Cria as opções seguras de `BrowserWindow` respeitando a Tríade Zero-Trust (`ADR-0001`, `RN-UI-03`)
 * e eliminando o white flash no boot (`show: false`, `backgroundColor: '#F6F4EE'`).
 */
export function createSecureWindowOptions(
  preloadPath: string = path.join(CURRENT_DIR, '../preload/preload-bridge.cjs')
): SecureWindowOptions {
  return {
    width: 1120,
    height: 760,
    minWidth: 880,
    minHeight: 620,
    show: false,
    backgroundColor: '#F6F4EE',
    title: 'monBlock — Guardião de Foco & Compromisso (CCAT)',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: preloadPath,
    },
  };
}

/**
 * Valida se uma URL de navegação é permitida dentro da `BrowserWindow`.
 * Permite apenas `file://` da aplicação (`/renderer/index.html`, `/docs/design/blocked-page.html`
 * ou dentro de `allowedFileRoot`) ou o servidor loopback `http://127.0.0.1:49152`.
 */
export function validateNavigationUrl(rawUrl: string, allowedFileRoot?: string): boolean {
  try {
    if (rawUrl.includes('..') || decodeURIComponent(rawUrl).includes('..')) {
      return false;
    }
    const parsed = new URL(rawUrl);
    if (parsed.protocol === 'file:') {
      const decodedPath = decodeURIComponent(parsed.pathname);
      if (decodedPath.includes('..')) {
        return false;
      }
      const normalizedPath = path.posix.normalize(decodedPath);
      if (
        normalizedPath.endsWith('/renderer/index.html') ||
        normalizedPath.endsWith('/docs/design/blocked-page.html')
      ) {
        return true;
      }
      if (allowedFileRoot) {
        const normalizedRoot = path.posix.normalize(allowedFileRoot).replace(/\/+$/, '');
        if (
          normalizedPath === normalizedRoot ||
          normalizedPath.startsWith(`${normalizedRoot}/`)
        ) {
          return true;
        }
      }
      return false;
    }
    if (
      parsed.protocol === 'http:' &&
      parsed.hostname === '127.0.0.1' &&
      parsed.port === '49152'
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Constrói o template do menu da Tray (Menu Bar do macOS).
 *
 * Invariante Crítica (`INV-UI-TRAY-03`):
 * O menu da Tray JAMAIS inclui opção de encerrar, sair ou desativar o bloqueio.
 */
export function buildTrayMenuTemplate(
  state: TrayStatusSnapshot,
  handlers: TrayActionHandlers
): TrayMenuItem[] {
  let headerLabel = 'monBlock Ativo — Proteção 3 Camadas';
  if (state.temporaryUnlockRemainingFormatted) {
    headerLabel = `monBlock Ativo — Pausa Temporária (${state.temporaryUnlockRemainingFormatted})`;
  } else if (state.cooldownRemainingFormatted) {
    headerLabel = `monBlock Ativo — Cooldown 72h (${state.cooldownRemainingFormatted})`;
  } else if (state.partnerName) {
    headerLabel = `monBlock Ativo — Proteção 3 Camadas • Ajudante: ${state.partnerName}`;
  }

  return [
    {
      id: 'status-header',
      label: headerLabel,
      enabled: false,
    },
    { type: 'separator' },
    {
      id: 'quick-add',
      label: '➕ Bloquear Site ou Palavra-Chave Rápida...',
      click: () => handlers.onQuickAdd(),
    },
    {
      id: 'block-active-tab',
      label: '🌐 Bloquear Site da Aba Atual do Navegador',
      click: () => handlers.onBlockActiveTab(),
    },
    { type: 'separator' },
    {
      id: 'request-unblock',
      label: '🤝 Solicitar Desbloqueio Temporário ao Ajudante...',
      click: () => handlers.onRequestUnblock(),
    },
    {
      id: 'enter-token',
      label: '🔑 Inserir Código de Liberação (UNLOCK-*)...',
      click: () => handlers.onEnterToken(),
    },
    { type: 'separator' },
    {
      id: 'open-dashboard',
      label: '🛡️ Abrir Painel Principal do monBlock',
      click: () => handlers.onOpenDashboard(),
    },
  ];
}

/**
 * Trata o evento de fechamento da janela principal (`RN-LIFE-01`):
 * Oculta a janela mantendo a Tray e o daemon `monblockd` vivos, exceto quando
 * houver desinstalação autorizada pelo Ajudante.
 */
export function handleWindowCloseEvent(
  event: { preventDefault: () => void },
  win: { hide: () => void },
  isAuthorizedQuit = false
): void {
  if (!isAuthorizedQuit) {
    event.preventDefault();
    win.hide();
  }
}

// MARK: - Bootstrap Real do Runtime Electron (Processo Principal, Tray macOS & IPC)

export async function bootstrapElectronRuntime(): Promise<void> {
  if (typeof process === 'undefined' || !process.versions?.electron) {
    return;
  }

  const electron = await import('electron');
  const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, powerMonitor } = electron;

  const gotSingleLock = app.requestSingleInstanceLock();
  if (!gotSingleLock) {
    app.quit();
    return;
  }

  await app.whenReady();

  const userDataDir = app.getPath('userData');
  const vaultsDir = path.join(userDataDir, 'vaults');
  const enforcerDir = path.join(userDataDir, 'enforcer');
  fs.mkdirSync(vaultsDir, { recursive: true });
  fs.mkdirSync(enforcerDir, { recursive: true });

  const store = new TripleStateStore({
    primaryPath: path.join(vaultsDir, 'state.primary.json'),
    keychainPath: path.join(vaultsDir, 'state.keychain.json'),
    sealPath: path.join(vaultsDir, 'partner.seal'),
    integrityKey: process.env.MONBLOCK_INTEGRITY_KEY ?? 'monblock-local-runtime-integrity-key-v1',
  });

  const enforcer = new MacOSPlatformEnforcer({
    hostsPath: path.join(enforcerDir, 'hosts.monblock'),
    chromiumPlistPath: path.join(enforcerDir, 'com.google.Chrome.plist'),
    firefoxPoliciesPath: path.join(enforcerDir, 'policies.json'),
  });

  const daemon = new MonBlockDaemon({ store, enforcer });

  let mainWindow: InstanceType<typeof BrowserWindow> | null = null;
  let tray: InstanceType<typeof Tray> | null = null;
  let isAuthorizedQuit = false;

  const navigateMainWindow = (viewId: string): void => {
    if (!mainWindow) return;
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
    mainWindow.focus();
    mainWindow.webContents.send('monblock:tray-navigate', viewId);
  };

  const refreshTrayMenu = async (): Promise<void> => {
    if (!tray) return;
    const stateRes = await daemon.handleCommand({ type: 'GET_STATE' });
    const pubState = 'state' in stateRes ? stateRes.state : null;
    const menuItems = buildTrayMenuTemplate(
      {
        active: true,
        partnerName: pubState?.paired ? 'Pareado' : null,
      },
      {
        onQuickAdd: () => navigateMainWindow('rules'),
        onBlockActiveTab: () => navigateMainWindow('rules'),
        onRequestUnblock: () => navigateMainWindow('partner'),
        onEnterToken: () => navigateMainWindow('partner'),
        onOpenDashboard: () => navigateMainWindow('categories'),
      }
    );
    tray.setContextMenu(Menu.buildFromTemplate(menuItems));
  };

  // Registro dos canais IPC conectados ao MonBlockDaemon
  ipcMain.handle('monblock:get-state', () => daemon.handleCommand({ type: 'GET_STATE' }));

  ipcMain.handle('monblock:pair-partner', async (_event, payload: {
    partnerName?: string;
    telegramChatId?: string;
    password?: string;
  }) => {
    const res = await daemon.handleCommand({
      type: 'PAIR_PARTNER',
      password: payload?.password ?? '',
      telegramChatId: payload?.telegramChatId,
    });
    await refreshTrayMenu();
    return res;
  });

  ipcMain.handle('monblock:enable-category', async (_event, payload: { categoryId: string }) => {
    const current = await daemon.handleCommand({ type: 'GET_STATE' });
    if (!('state' in current)) return current;
    const prevRules = current.state.rules;
    const nextCategories = Array.from(new Set([...prevRules.enabledCategories, payload.categoryId]));
    return daemon.handleCommand({
      type: 'MUTATE_RULES',
      rules: { ...prevRules, enabledCategories: nextCategories },
    });
  });

  ipcMain.handle('monblock:add-batch-domains', async (_event, payload: { domains: string[] }) => {
    const current = await daemon.handleCommand({ type: 'GET_STATE' });
    if (!('state' in current)) return current;
    const prevRules = current.state.rules;
    const nextDomains = Array.from(new Set([...prevRules.blockedDomains, ...(payload.domains ?? [])]));
    return daemon.handleCommand({
      type: 'MUTATE_RULES',
      rules: { ...prevRules, blockedDomains: nextDomains },
    });
  });

  ipcMain.handle('monblock:add-keywords', async (_event, payload: { keywords: string[] }) => {
    const current = await daemon.handleCommand({ type: 'GET_STATE' });
    if (!('state' in current)) return current;
    const prevRules = current.state.rules;
    const nextKeywords = Array.from(new Set([...prevRules.keywords, ...(payload.keywords ?? [])]));
    return daemon.handleCommand({
      type: 'MUTATE_RULES',
      rules: { ...prevRules, keywords: nextKeywords },
    });
  });

  ipcMain.handle('monblock:request-unblock', async (_event, payload: {
    targetUrlOrApp?: string;
    requestedDurationMinutes?: 15 | 60;
    reason?: string;
  }) => {
    const stateRes = await daemon.handleCommand({ type: 'GET_STATE' });
    return {
      status: 200,
      requested: true,
      targetUrlOrApp: payload?.targetUrlOrApp ?? '',
      requestedDurationMinutes: payload?.requestedDurationMinutes ?? 15,
      paired: 'state' in stateRes ? stateRes.state.paired : false,
    };
  });

  ipcMain.handle('monblock:verify-offline-token', async (_event, payload: {
    challengeCode: string;
    token: string;
    target?: string;
  }) => {
    const res = await daemon.handleCommand({
      type: 'VERIFY_OFFLINE_TOKEN',
      challengeCode: payload.challengeCode,
      token: payload.token,
      target: payload.target,
    });
    await refreshTrayMenu();
    return res;
  });

  ipcMain.handle('monblock:verify-recovery-code', async (_event, payload: {
    recoveryCode: string;
    target?: string;
  }) => {
    const res = await daemon.handleCommand({
      type: 'VERIFY_RECOVERY_CODE',
      code: payload.recoveryCode,
      target: payload.target,
    });
    await refreshTrayMenu();
    return res;
  });

  ipcMain.handle('monblock:trigger-emergency-cooldown', async () => {
    const res = await daemon.handleCommand({ type: 'TRIGGER_EMERGENCY_COOLDOWN' });
    await refreshTrayMenu();
    return res;
  });

  ipcMain.handle('monblock:request-authorized-uninstall', async (_event, payload: {
    authMethod: 'PASSWORD' | 'PERMANENT_TOKEN' | 'COOLDOWN_72H';
    credential: string;
    challengeCode?: string;
  }) => {
    const res = await daemon.handleCommand({
      type: 'UNINSTALL_AUTHORIZED',
      password: payload.authMethod === 'PASSWORD' ? payload.credential : undefined,
      token: payload.authMethod === 'PERMANENT_TOKEN' ? payload.credential : undefined,
      challengeCode: payload.challengeCode,
    });
    if ('uninstalled' in res && res.uninstalled) {
      isAuthorizedQuit = true;
      app.quit();
    }
    return res;
  });

  // Criação da BrowserWindow Zero-Trust
  const winOpts = createSecureWindowOptions(path.join(CURRENT_DIR, '../preload/preload-bridge.cjs'));
  mainWindow = new BrowserWindow(winOpts);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (!validateNavigationUrl(targetUrl, path.resolve(CURRENT_DIR, '..'))) {
      event.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  mainWindow.on('close', (event) => {
    if (mainWindow) {
      handleWindowCloseEvent(event, mainWindow, isAuthorizedQuit);
    }
  });

  const rendererHtmlPath = path.join(CURRENT_DIR, '../renderer/index.html');
  await mainWindow.loadFile(rendererHtmlPath);

  // Criação do Ícone e Menu da Tray (Barra de Menu do macOS)
  const emptyTrayImg = nativeImage.createEmpty();
  tray = new Tray(emptyTrayImg);
  tray.setTitle('🛡️ monBlock');
  tray.setToolTip('monBlock — Proteção 3 Camadas Ativa (CCAT)');
  await refreshTrayMenu();

  // Revogação automática de concessões temporárias quando o Mac entra em sleep (RN-APP-04)
  powerMonitor.on('suspend', () => {
    void daemon.handleCommand({ type: 'REVOKE_GRANTS_ON_SLEEP' }).then(() => refreshTrayMenu());
  });

  app.on('second-instance', () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });

  app.on('activate', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

if (typeof process !== 'undefined' && Boolean(process.versions?.electron)) {
  void bootstrapElectronRuntime();
}
