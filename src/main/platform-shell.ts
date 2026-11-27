/**
 * @file platform-shell.ts
 * @description Detalhes do shell do SO para o app Electron (bandeja e identidade), sem importar o Electron,
 * para serem testáveis (W13, W14 da spec de correção do Windows).
 */

/** Igual ao AppUserModelID do atalho criado pelo instalador (ADR-0016, D3). Sem ele o toast sai como "electron.app". */
export const APP_USER_MODEL_ID = 'com.ccat.monblock';

/** Ícone da bandeja: template só no macOS; no Windows um template vira ícone vazio. */
export function trayIconSpec(platform: NodeJS.Platform): { size: number; template: boolean } {
  return platform === 'darwin' ? { size: 18, template: true } : { size: 16, template: false };
}

/** Chamar antes do `ready` para as notificações saírem com o nome do app (W14). */
export function applyWindowsAppIdentity(
  app: { setAppUserModelId(id: string): void },
  platform: NodeJS.Platform = process.platform
): void {
  if (platform === 'win32') app.setAppUserModelId(APP_USER_MODEL_ID);
}
