/**
 * Ponte Segura Preload (`contextBridge`) do monBlock (MOD-04).
 *
 * Expõe exclusivamente métodos de alto nível estritamente tipados em `window.monblock`,
 * proibindo o vazamento do objeto `ipcRenderer` bruto ou APIs Node para o Renderer (`RN-UI-03`).
 */

// MARK: - Contratos Tipados da Ponte Preload

export type IpcInvokeFn = (channel: string, payload?: unknown) => Promise<unknown>;

export interface MonBlockPreloadApi {
  getState: () => Promise<unknown>;
  setBotToken: (payload: { token: string; currentPartnerPassword?: string }) => Promise<unknown>;
  initiatePairingLink: (payload: { partnerName: string; currentPartnerPassword?: string }) => Promise<unknown>;
  getCategories: () => Promise<unknown>;
  checkUrl: (input: string, rules: unknown) => Promise<unknown>;
  initiatePairing: (payload: { partnerName: string; telegramChatId: string }) => Promise<unknown>;
  checkPairingStatus: () => Promise<unknown>;
  cancelPairing: () => Promise<unknown>;
  pairPartner: (payload: {
    partnerName: string;
    telegramChatId: string;
    password: string;
    confirmedRecoveryCodes: boolean;
  }) => Promise<unknown>;
  enableCategory: (categoryId: string) => Promise<unknown>;
  addBatchDomains: (domains: string[]) => Promise<unknown>;
  addKeywords: (keywords: string[]) => Promise<unknown>;
  removeAllowlistDomain: (domain: string) => Promise<unknown>;
  requestUnblock: (payload: {
    target: string;
    duration: '15m' | '60m' | 'permanent';
    reason: string;
    idempotencyKey: string;
  }) => Promise<unknown>;
  verifyOfflineToken: (payload: {
    challengeCode: string;
    token: string;
  }) => Promise<unknown>;
  triggerEmergencyCooldown: (payload?: { recoveryCode?: string }) => Promise<unknown>;
  requestAuthorizedUninstall: (payload: {
    authMethod: 'PASSWORD' | 'PERMANENT_TOKEN' | 'COOLDOWN_72H' | 'HMAC_TOKEN' | 'RECOVERY_CODE';
    credential: string;
    challengeCode?: string;
  }) => Promise<unknown>;
  checkUpdates: () => Promise<unknown>;
  downloadUpdate: (payload: { pkgUrl: string; expectedSha256?: string }) => Promise<unknown>;
}

export interface ContextBridgeLike {
  exposeInMainWorld: (apiKey: string, api: MonBlockPreloadApi) => void;
}

export interface IpcRendererLike {
  invoke: IpcInvokeFn;
}

/**
 * Cria a superfície congelada e segura da API Preload injetada via `contextBridge`.
 */
export function createMonBlockPreloadApi(ipcInvoker: IpcInvokeFn): MonBlockPreloadApi {
  const api: MonBlockPreloadApi = {
    getState() {
      return ipcInvoker('monblock:get-state');
    },
    setBotToken(payload) {
      if (!payload || !payload.token) return Promise.reject(new Error('Cole o token do bot.'));
      return ipcInvoker('monblock:set-bot-token', payload);
    },
    initiatePairingLink(payload) {
      if (!payload || !payload.partnerName) return Promise.reject(new Error('Informe o nome do Ajudante.'));
      return ipcInvoker('monblock:initiate-pairing-link', payload);
    },
    getCategories() {
      return ipcInvoker('monblock:get-categories');
    },
    checkUrl(input: string, rules: unknown) {
      if (typeof input !== 'string') return Promise.reject(new Error('input inválido.'));
      return ipcInvoker('monblock:check-url', { input, rules });
    },
    initiatePairing(payload) {
      if (!payload || !payload.partnerName || !payload.telegramChatId) {
        return Promise.reject(new Error('Nome do Ajudante e Chat ID do Telegram são obrigatórios.'));
      }
      return ipcInvoker('monblock:initiate-pairing', payload);
    },
    checkPairingStatus() {
      return ipcInvoker('monblock:check-pairing-status');
    },
    cancelPairing() {
      return ipcInvoker('monblock:cancel-pairing');
    },
    pairPartner(payload) {
      if (!payload || typeof payload.partnerName !== 'string' || !payload.confirmedRecoveryCodes) {
        return Promise.reject(new Error('Confirmação do Kit de Emergência e dados do Ajudante são obrigatórios.'));
      }
      return ipcInvoker('monblock:pair-partner', payload);
    },
    enableCategory(categoryId: string) {
      if (typeof categoryId !== 'string' || !categoryId.trim()) {
        return Promise.reject(new Error('categoryId inválido.'));
      }
      return ipcInvoker('monblock:enable-category', { categoryId: categoryId.trim() });
    },
    addBatchDomains(domains: string[]) {
      if (!Array.isArray(domains)) {
        return Promise.reject(new Error('domains deve ser uma lista.'));
      }
      return ipcInvoker('monblock:add-batch-domains', { domains });
    },
    addKeywords(keywords: string[]) {
      if (!Array.isArray(keywords)) {
        return Promise.reject(new Error('keywords deve ser uma lista.'));
      }
      return ipcInvoker('monblock:add-keywords', { keywords });
    },
    removeAllowlistDomain(domain: string) {
      if (typeof domain !== 'string' || !domain.trim()) return Promise.reject(new Error('domain inválido.'));
      return ipcInvoker('monblock:remove-allowlist-domain', { domain: domain.trim() });
    },
    requestUnblock(payload) {
      return ipcInvoker('monblock:request-unblock', payload);
    },
    verifyOfflineToken(payload) {
      return ipcInvoker('monblock:verify-offline-token', {
        challengeCode: payload.challengeCode.trim().toUpperCase(),
        token: payload.token.trim().toUpperCase(),
      });
    },
    triggerEmergencyCooldown(payload) {
      return ipcInvoker('monblock:trigger-emergency-cooldown', payload ?? {});
    },
    requestAuthorizedUninstall(payload) {
      return ipcInvoker('monblock:request-authorized-uninstall', payload);
    },
    checkUpdates() {
      return ipcInvoker('monblock:check-updates');
    },
    downloadUpdate(payload) {
      return ipcInvoker('monblock:download-update', payload);
    },
  };

  return Object.freeze(api);
}

/**
 * Expõe a API congelada do monBlock em `window.monblock` via `contextBridge.exposeInMainWorld`.
 */
export function exposeMonBlockPreload(
  contextBridgeObj: ContextBridgeLike,
  ipcRendererObj: IpcRendererLike
): MonBlockPreloadApi {
  const api = createMonBlockPreloadApi((channel, payload) =>
    ipcRendererObj.invoke(channel, payload)
  );
  contextBridgeObj.exposeInMainWorld('monblock', api);
  return api;
}
