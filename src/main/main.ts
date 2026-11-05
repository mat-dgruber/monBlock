/**
 * Processo Principal Electron & Menu da Tray macOS do monBlock (MOD-04).
 *
 * Implementa:
 * - Configuração Zero-Trust da BrowserWindow (`nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`)
 * - Validação estrita de navegação (`validateNavigationUrl`) bloqueando origens externas
 * - Modelo da Barra de Menu / System Tray macOS (`buildTrayMenuTemplate`) sem opção de sair/desativar (`INV-UI-TRAY-03`)
 * - Independência da janela em relação ao bloqueio (`handleWindowCloseEvent` — `RN-LIFE-01`)
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MonBlockDaemon } from '../daemon/monblockd.js';
import { MacOSBrowserWatcher } from '../enforcers/macos-watcher.js';
import { MacOSPlatformEnforcer } from '../enforcers/platform-enforcer.js';
import { TripleStateStore, createDefaultPersistentState } from '../storage/state-store.js';
import { createMonBlockHttpServer } from '../server/block-server.js';

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
  icon?: Electron.NativeImage;
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
  handlers: TrayActionHandlers,
  icons?: Partial<Record<'quick-add' | 'block-active-tab' | 'request-unblock' | 'enter-token' | 'open-dashboard', Electron.NativeImage>>
): TrayMenuItem[] {
  let headerLabel = 'monBlock — Estado não verificado';
  if (state.active) headerLabel = 'monBlock — Estado da proteção carregado';
  if (state.temporaryUnlockRemainingFormatted) {
    headerLabel = `monBlock — Pausa temporária (${state.temporaryUnlockRemainingFormatted})`;
  } else if (state.cooldownRemainingFormatted) {
    headerLabel = `monBlock — Espera de 72h (${state.cooldownRemainingFormatted})`;
  } else if (state.partnerName) {
    headerLabel = `monBlock — Estado carregado • Ajudante: ${state.partnerName}`;
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
      label: 'Bloquear site ou palavra-chave...',
      icon: icons?.['quick-add'],
      click: () => handlers.onQuickAdd(),
    },
    {
      id: 'block-active-tab',
      label: 'Adicionar site manualmente...',
      icon: icons?.['block-active-tab'],
      click: () => handlers.onBlockActiveTab(),
    },
    { type: 'separator' },
    {
      id: 'request-unblock',
      label: 'Solicitar desbloqueio ao Ajudante...',
      icon: icons?.['request-unblock'],
      click: () => handlers.onRequestUnblock(),
    },
    {
      id: 'enter-token',
      label: 'Inserir código de liberação...',
      icon: icons?.['enter-token'],
      click: () => handlers.onEnterToken(),
    },
    { type: 'separator' },
    {
      id: 'open-dashboard',
      label: 'Abrir painel principal',
      icon: icons?.['open-dashboard'],
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

/**
 * Carrega (ou cria na primeira execução) a chave aleatória de 256 bits dos cofres,
 * persistida cifrada pelo `safeStorage` (chave mestra no Keychain do macOS).
 * Se a decifragem falhar, gera chave nova: os cofres antigos ficam inválidos e o
 * `TripleStateStore` entra em Fail-Closed.
 * ponytail: userland eleva a barreira mas não isola do próprio usuário; isolamento real exige o daemon root do ADR-0001.
 */
export function loadOrCreateVaultKey(
  keyPath: string,
  safeStorage: { isEncryptionAvailable(): boolean; encryptString(s: string): Buffer; decryptString(b: Buffer): string }
): string {
  if (process.env.MONBLOCK_INTEGRITY_KEY) return process.env.MONBLOCK_INTEGRITY_KEY;
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('safeStorage indisponível: não é possível proteger a chave dos cofres.');
  }
  if (fs.existsSync(keyPath)) {
    try {
      return safeStorage.decryptString(fs.readFileSync(keyPath));
    } catch {
      // Chave ilegível: regenera e deixa o Fail-Closed agir sobre os cofres antigos.
    }
  }
  const key = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(keyPath, safeStorage.encryptString(key), { mode: 0o600 });
  return key;
}

// MARK: - Bootstrap Real do Runtime Electron (Processo Principal, Tray macOS & IPC)

export async function bootstrapElectronRuntime(): Promise<void> {
  if (typeof process === 'undefined' || !process.versions?.electron) {
    return;
  }

  const electron = await import('electron');
  const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, powerMonitor, safeStorage } = electron;

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
    integrityKey: loadOrCreateVaultKey(path.join(vaultsDir, 'vault.key'), safeStorage),
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

  // Inicializa o servidor HTTP local na porta 49152 para tela de bloqueio e Problem Details
  const blockServer = createMonBlockHttpServer();
  // Erros de listen (ex.: EADDRINUSE) chegam como evento assíncrono; sem listener derrubariam o processo main.
  blockServer.on('error', (err) => {
    console.error('[monBlock] Servidor local 127.0.0.1:49152 indisponível:', (err as NodeJS.ErrnoException).code ?? err);
  });
  blockServer.listen(49152, '127.0.0.1');

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
    const hasMenuSymbol = typeof (nativeImage as any).createMenuSymbol === 'function';
    const menuItems = buildTrayMenuTemplate(
      {
        active: Boolean(pubState),
        partnerName: pubState?.paired ? 'Pareado' : null,
      },
      {
        onQuickAdd: () => navigateMainWindow('rules'),
        onBlockActiveTab: () => navigateMainWindow('rules'),
        onRequestUnblock: () => navigateMainWindow('partner'),
        onEnterToken: () => navigateMainWindow('partner'),
        onOpenDashboard: () => navigateMainWindow('categories'),
      },
      process.platform === 'darwin' && hasMenuSymbol ? {
        'quick-add': (nativeImage as any).createMenuSymbol('plus.circle'),
        'block-active-tab': (nativeImage as any).createMenuSymbol('globe'),
        'request-unblock': (nativeImage as any).createMenuSymbol('person.crop.circle.badge.questionmark'),
        'enter-token': (nativeImage as any).createMenuSymbol('key'),
        'open-dashboard': (nativeImage as any).createMenuSymbol('square.grid.2x2'),
      } : undefined
    );
    tray.setContextMenu(Menu.buildFromTemplate(menuItems));
  };

  // Registro dos canais IPC conectados ao MonBlockDaemon
  ipcMain.handle('monblock:get-state', () => daemon.handleCommand({ type: 'GET_STATE' }));

  ipcMain.handle('monblock:initiate-pairing', async (_event, payload: {
    partnerName?: string;
    telegramChatId?: string;
    currentPartnerPassword?: string;
  }) => {
    return daemon.handleCommand({
      type: 'INITIATE_PAIRING',
      partnerName: payload?.partnerName ?? '',
      telegramChatId: payload?.telegramChatId ?? '',
      currentPartnerPassword: payload?.currentPartnerPassword,
    });
  });

  ipcMain.handle('monblock:check-pairing-status', async () => {
    const res = await daemon.handleCommand({ type: 'CHECK_PAIRING_STATUS' });
    if (res.status === 200 && 'paired' in res && res.paired) {
      await refreshTrayMenu();
    }
    return res;
  });

  ipcMain.handle('monblock:cancel-pairing', async () => {
    return daemon.handleCommand({ type: 'CANCEL_PAIRING' });
  });

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

  ipcMain.handle('monblock:request-unblock', () => ({
    status: 503,
    requested: false,
    detail: 'O envio de pedidos ao Ajudante ainda não está disponível nesta versão.',
  }));

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
    target: string;
  }) => {
    if (!payload || typeof payload.recoveryCode !== 'string' || typeof payload.target !== 'string' || !/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(payload.target.trim())) {
      return { status: 400, detail: 'Informe um código e um domínio específico para a recuperação.' };
    }
    const res = await daemon.handleCommand({
      type: 'VERIFY_RECOVERY_CODE',
      code: payload.recoveryCode,
      target: payload.target.trim(),
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
  // Ícone Retina @2x (36x36px -> 18x18pt) com anti-aliasing nativo Apple SF Symbol checkmark.shield
  const trayShieldPngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAACQAAAAkCAYAAADhAJiYAAAAAXNSR0IArs4c6QAAAGxlWElmTU0AKgAAAAgABAEaAAUAAAABAAAAPgEbAAUAAAABAAAARgEoAAMAAAABAAIAAIdpAAQAAAABAAAATgAAAAAAAACQAAAAAQAAAJAAAAABAAKgAgAEAAAAAQAAACSgAwAEAAAAAQAAACQAAAAAQCQK+gAAAAlwSFlzAAAWJQAAFiUBSVIk8AAAAw5JREFUWAntlluITVEYx4fcJ5GiKZdQM3IZU1MuJbxMFIUHjFLygocZanhAQ4rUCE2exIMnSmlKKIrSeHAp436JxDSYZCZGkfvl96uza3ecc/bZ58yZp/OvX/uy1vftb63vW2vtkpKiijOQ3wz0y8+8pAL7KqiGP3AL7sJr6BM5gFnQCHfgG/xN4jPPV6EepkBB5Azsg2fwC8JBdPNsAK3wIantB89tsB2mQl4aj/VOeAy/IRxEB8/HoAbKINA4bpbBSeiCsI0DcVa3QdiGx2htoMtPCDt8ynMTmLJSiNJIOiwCA++EsC9TXQtZ6z09dfAW9sJ0GAi5agiG8+AwBL6fx3EWjKYBo0FxDCP6GpgD1H9Pqr4DUr0MvbMoc9VQDK1Dg3iQcGIglkJa9U/bkl+DNbYK3JMuQtbLvxABuVfNgF1gutuhA7JSIQKayJfroBws4K3wFbJSVA1l5STUaSz3i2EteHwcBY+TrNWbAbktrAZXpjNyBQ5BLMVJ2Sg874f1MAaSVcOLNeAs3QePmowrivb/FCcgd91NcCJxHR3yNon7WpgNr+BI4solnuIEdAHX98AzqRGWw3AYDAazAtrhPJyBnJSuhvy3MVg3NZex8rdiHZyDSmiCLvDMMlX2PQ3N4AaYSvqyn/IbWcsP6dSiDBwExv5GtIIz5bL+BPZtgZmQScNoNOX2f5GpY3LbzYRRG1fTkqxqXtwGR6nzR7ASojSCDi9Bm0tRncPt1ohGYjpSnfQLeW/gjnQzeHZlkru2G2bgtz5T5+Q268J0OAM9MB/yOfVN+xJwf/JnrwNMXyy5434ER/QFtkApxJUp3w3fQV/W5wLISUux6oagVi5zXwUu9SiZwrlwHQxEH+/ADTQvuapuQDBCZ+s4VECqfcytpBJOgf9TBqPtNSiHXpFFbUF2QjBb1tgecMbcXwxuDhyAINX29ZDdCOn2PJpyVxmmzWBgjlxMQwucBdPrOwN5AwchfMTwWBhNxq3nVRBAEJxXZ85AJkCfaxpf3AFP4CE0QK/VCb6KKs5A7Bn4BzLTxEQuanheAAAAAElFTkSuQmCC';

  let trayIcon: Electron.NativeImage;
  if (process.platform === 'darwin') {
    const rawImage = nativeImage.createFromBuffer(Buffer.from(trayShieldPngBase64, 'base64'), {
      scaleFactor: 2.0,
    });
    trayIcon = rawImage.resize({ width: 18, height: 18, quality: 'best' });
    trayIcon.setTemplateImage(true);
  } else {
    trayIcon = nativeImage.createEmpty();
  }
  tray = new Tray(trayIcon);
  tray.setToolTip('monBlock — Painel de proteção');
  await refreshTrayMenu();

  // Camada 3 (ADR-0002): Watcher de abas. O tick consulta o daemon (que também expira concessões vencidas)
  // e avalia a aba em foco; se o estado falhar, mantém as últimas regras conhecidas (Fail-Closed).
  if (process.platform === 'darwin') {
    let watcherRules = createDefaultPersistentState().rules;
    const watcher = new MacOSBrowserWatcher({ getRules: () => watcherRules });
    const watchTick = async (): Promise<void> => {
      try {
        const now = Date.now();
        let wildcardGrant = false;
        const res = await daemon.handleCommand({ type: 'GET_STATE' });
        if ('state' in res) {
          const grants = res.state.temporaryGrants.filter((g) => g.expiresAtMs > now);
          wildcardGrant = grants.some((g) => g.target === '*');
          watcherRules = {
            ...res.state.rules,
            allowlistDomains: [...res.state.rules.allowlistDomains, ...grants.map((g) => g.target)],
          };
        }
        if (!wildcardGrant) await watcher.inspectOnce(now);
      } catch (err) {
        console.error('[monBlock] Falha no ciclo do watcher:', err);
      } finally {
        setTimeout(() => void watchTick(), 1500);
      }
    };
    void watchTick();
  }

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

  app.on('will-quit', () => {
    try {
      blockServer.close();
    } catch {
      // Ignora erro de encerramento do servidor HTTP
    }
  });
}

if (typeof process !== 'undefined' && Boolean(process.versions?.electron)) {
  void bootstrapElectronRuntime();
}
