/**
 * Processo Principal Electron & Menu da Tray macOS do monBlock (MOD-04).
 *
 * Implementa:
 * - Configuração Zero-Trust da BrowserWindow (`nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`)
 * - Validação estrita de navegação (`validateNavigationUrl`) bloqueando origens externas
 * - Modelo da Barra de Menu / System Tray macOS (`buildTrayMenuTemplate`) sem opção de sair/desativar (`INV-UI-TRAY-03`)
 * - Independência da janela em relação ao bloqueio (`handleWindowCloseEvent` — `RN-LIFE-01`)
 */

import * as path from 'node:path';

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
  preloadPath: string = path.join(__dirname, '../preload/preload.js')
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
 * Permite apenas `file://` local ou o servidor loopback `http://127.0.0.1:49152`.
 */
export function validateNavigationUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === 'file:') {
      return true;
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
