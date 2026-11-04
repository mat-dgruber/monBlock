# Fluxogramas — Módulo `web-block-engine`

> Gerado pelo agente **Archaeologist** (`doc_level = detalhado`, 🟢 CONFIRMADO).

---

## 1. Fluxo de Polling de Navegadores via AppleEvents (`ACMonitorBrowser` → `ACScriptHelper`)

```mermaid
flowchart TD
    A[ACRunningApp detectado com webBrowserApp == YES] --> B[+[ACMonitorBrowser monitorBrowserWithIdentifier:bundleID]]
    B --> C{Qual subclasse instanciar?}
    C -->|com.apple.Safari| D1[ACMonitorSafariBrowser]
    C -->|company.thebrowser.Browser / dia| D2[ACMonitorArcBrowser / ACMonitorDiaBrowser]
    C -->|Chrome / Edge / Brave / Opera / OperaGX / Ecosia| D3[Subclasses padrão Chromium]
    C -->|org.mozilla.firefox| D4[ACMonitorFirfoxBrowser]
    D1 & D2 & D3 & D4 --> E[-[ACMonitorBrowser startMonitor] -> Inicia _monitorTimer]
    E -->|Tick do NSTimer| F[-[ACMonitorBrowser getActiveURLsWithCompleteHandler:]]
    F --> G[Gera script via -appleScriptForGetActiveURLs]
    G --> H[ACScriptHelper excuteScript:withCompleteHandler: na fila serial queueForScriptExcute]
    H -->|NSAppleScript executeAndReturnError:| I{Retornou NSAppleEventDescriptor?}
    I -- Erro (-1743 TCC Negado) --> J[ACPermissionAlertHelper / ACBrowserAuthPanel]
    I -- Sucesso --> K[-[ACMonitorBrowser parseGetActiveURLsAppleEvent:withError:]]
    K --> L[Notifica delegate: -[ACRunningApp monitorBrowser:didOpenURLs:]]
    L --> M[-[ACMonitorTask runningAppsMgr:application:didOpenURLs:]]
```

---

## 2. Fluxo da Função `-[ACMonitorTask websiteIsBlock:]` (`0x1000098d0`) e Redirecionamento

```mermaid
flowchart TD
    A[Recebe NSURL da aba ativa] --> B{preferences.enableWebBlock == YES?}
    B -- Não --> Z[Permitir Navegação]
    B -- Sim --> C{URL == self.blockToURL?}
    C -- Sim --> Z
    C -- Não --> D{Está em whiteWebsites - Always Allow?}
    D -- Sim --> Z
    D -- Não --> E{Está em blackWebsites - Always Block?}
    E -- Sim --> R[BLOQUEAR ABA]
    E -- Não --> F{monitorItemsMgr.blockAll == YES?}
    F -- Sim (Block All Websites) --> R
    F -- Não --> G[Busca correspondência em monitorWebsites]
    G --> H{Tipo de ACMonitorItem?}
    H -- Domínio / URL --> I[-[ACMonitorItemsMgr URL:containURL:] sem http/https/www.]
    H -- Keyword(s) --> J[-[ACMonitorItemsMgr matchKeywordItem:withURL:] - AND para vírgulas]
    I & J --> K{Correspondeu na lista e Modo blackRule?}
    K -- Não bloqueado --> Z
    K -- Bloqueado --> L[-[ACMonitorTask monitorItemScheduleAvailable:item]]
    L --> M{Dentro da janela de bloqueio do Schedule?}
    M -- Não --> Z
    M -- Sim --> R
    R --> N[Obtém destino: -[ACMonitorTask blockToURL]]
    N --> O{customRedirection == YES?}
    O -- Sim --> P[Usa customRedirectionURLString]
    O -- Não --> Q[Usa https://www.cisdem.com/blocked-website.html]
    P & Q --> S[-[ACRunningApp redirectURL:url toURL:blockToURL]]
    S --> T{AppleScript set URL of tab funcionou?}
    T -- Sim --> U[Aba redirecionada para página de bloqueio]
    T -- Não --> V[Fallback: -closeURLTab: + -openURLTab:blockToURL]
```

---

## 3. Fluxo de Autorização TCC (`ACBrowserAuthManager` & `ACBrowserAuthPanel`)

```mermaid
flowchart TD
    A[Inicialização / Abertura do ACBrowserAuthPanel] --> B[-[ACBrowserAuthPanel detectInstalledBrowsers]]
    B --> C[-[ACBrowserAuthManager fetchAllBrowserAuthStates]]
    C -->|AEDeterminePermissionToAutomateTarget| D{Status da Permissão TCC?}
    D -- Permitido (0) --> E[Estado = Granted (Verde)]
    D -- Negado (-1743) --> F[Estado = Denied -> Botão 'Open System Settings']
    D -- Não Determinado --> G[Botão 'Authorize']
    G -->|Clique do Usuário| H[-[ACBrowserAuthManager requestAuthForBundleID:]]
    H --> I[Lança navegador via /usr/bin/open --args --no-startup-window]
    I --> J[Dispara AppleEvent para forçar prompt TCC do macOS]
    J --> K[-[ACBrowserAuthManager startHighFreqTimerForBundleID:]]
    K -->|Polling rápido (-highFreqTick)| L{AEDeterminePermission == Granted?}
    L -- Sim --> M[Para HighFreqTimer + Emite ACBrowserAuthStateDidChangeNotification]
```
