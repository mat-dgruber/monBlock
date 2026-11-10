'use strict';

/**
 * Script Preload CJS compatível com o Sandbox nativo do Electron (`sandbox: true`, `contextIsolation: true`).
 * Expõe exclusivamente `window.monblock` congelado com `Object.freeze`, sem vazar `ipcRenderer`.
 */
const { contextBridge, ipcRenderer } = require('electron');

const api = Object.freeze({
  getState() {
    return ipcRenderer.invoke('monblock:get-state');
  },
  setBotToken(payload) {
    return ipcRenderer.invoke('monblock:set-bot-token', payload);
  },
  initiatePairingLink(payload) {
    return ipcRenderer.invoke('monblock:initiate-pairing-link', payload);
  },
  initiatePairing(payload) {
    return ipcRenderer.invoke('monblock:initiate-pairing', payload);
  },
  checkPairingStatus() {
    return ipcRenderer.invoke('monblock:check-pairing-status');
  },
  cancelPairing() {
    return ipcRenderer.invoke('monblock:cancel-pairing');
  },
  pairPartner(payload) {
    return ipcRenderer.invoke('monblock:pair-partner', payload);
  },
  getCategories() {
    return ipcRenderer.invoke('monblock:get-categories');
  },
  checkUrl(input, rules) {
    return ipcRenderer.invoke('monblock:check-url', { input, rules });
  },
  removeAllowlistDomain(domain) {
    return ipcRenderer.invoke('monblock:remove-allowlist-domain', { domain });
  },
  enableCategory(categoryId) {
    return ipcRenderer.invoke('monblock:enable-category', { categoryId });
  },
  addBatchDomains(domains) {
    return ipcRenderer.invoke('monblock:add-batch-domains', { domains });
  },
  addKeywords(keywords) {
    return ipcRenderer.invoke('monblock:add-keywords', { keywords });
  },
  requestUnblock(payload) {
    return ipcRenderer.invoke('monblock:request-unblock', payload);
  },
  verifyOfflineToken(payload) {
    return ipcRenderer.invoke('monblock:verify-offline-token', payload);
  },
  verifyRecoveryCode(payload) {
    return ipcRenderer.invoke('monblock:verify-recovery-code', payload);
  },
  triggerEmergencyCooldown(payload) {
    return ipcRenderer.invoke('monblock:trigger-emergency-cooldown', payload ?? {});
  },
  requestAuthorizedUninstall(payload) {
    return ipcRenderer.invoke('monblock:request-authorized-uninstall', payload);
  },
  checkUpdates() {
    return ipcRenderer.invoke('monblock:check-updates');
  },
  downloadUpdate(payload) {
    return ipcRenderer.invoke('monblock:download-update', payload);
  },
  daemonStatus() {
    return ipcRenderer.invoke('monblock:daemon-status');
  },
  reinstallService() {
    return ipcRenderer.invoke('monblock:reinstall-service');
  },
  openProfileSettings() {
    return ipcRenderer.invoke('monblock:open-profile-settings');
  },
  onDaemonStatus(callback) {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('monblock:daemon-status', (_event, status) => callback(status));
  },
  onTrayNavigate(callback) {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('monblock:tray-navigate', (_event, viewId) => callback(viewId));
  },
});

contextBridge.exposeInMainWorld('monblock', api);
