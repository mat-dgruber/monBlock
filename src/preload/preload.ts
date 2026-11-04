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
  pairPartner: (payload: {
    partnerName: string;
    telegramChatId: string;
    password: string;
    confirmedRecoveryCodes: boolean;
  }) => Promise<unknown>;
  enableCategory: (categoryId: string) => Promise<unknown>;
  addBatchDomains: (domains: string[]) => Promise<unknown>;
  addKeywords: (keywords: string[]) => Promise<unknown>;
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
    authMethod: 'PASSWORD' | 'HMAC_TOKEN' | 'RECOVERY_CODE';
    credential: string;
    challengeCode?: string;
  }) => Promise<unknown>;
}

/**
 * Cria a superfície congelada e segura da API Preload injetada via `contextBridge`.
 */
export function createMonBlockPreloadApi(ipcInvoker: IpcInvokeFn): MonBlockPreloadApi {
  const api: MonBlockPreloadApi = {
    getState() {
      return ipcInvoker('monblock:get-state');
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
  };

  return Object.freeze(api);
}
