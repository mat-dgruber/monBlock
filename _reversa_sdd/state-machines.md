# Máquinas de Estado — Cisdem AppCrypt v7.11.0

> Extraídas pelo agente **Detective** (`doc_level = detalhado`, 🟢 CONFIRMADO).

---

## 1. Máquina de Estados de um Aplicativo Monitorado (`ACRunningApp`)

Controlada pelas propriedades `granted`, `_notRespondActiveNotification`, `_resignTimer`, `_hiddenTimer` e `_terminateTimer`.

```mermaid
stateDiagram-v2
    [*] --> Unmanaged : Processo iniciado no macOS
    Unmanaged -->Ignored : canManagerApp == NO (Finder / loginwindow)
    Unmanaged --> Locked : appIsBlock == YES & granted == NO
    Unmanaged --> Unrestricted : appIsBlock == NO

    Locked --> MaskedAndPrompting : applicationDidActivate / DidLaunched
    MaskedAndPrompting --> GrantedSession : Senha válida em ACPWDInputWndCtrl
    MaskedAndPrompting --> HiddenOrTerminated : Senha rejeitada (+ACCapturePhoto) ou Cancelar
    HiddenOrTerminated --> MaskedAndPrompting : Usuário tenta focar o app novamente

    GrantedSession --> ResignTimerActive : applicationDidDeactivate (enableAutoLockDeactivated == YES)
    ResignTimerActive --> GrantedSession : App reativado antes de authorityRetainInterval
    ResignTimerActive --> Locked : _resignTimer expira (-becomeGrantedAgain)

    GrantedSession --> Locked : HIDIdleTime >= computerNoActivityInterval
    GrantedSession --> Locked : NSWorkspaceWillSleepNotification (-refreshAllBlockApp)
    GrantedSession --> Locked : allWindowClosed == YES
    GrantedSession --> [*] : applicationDidTerminate
```

---

## 2. Máquina de Estados de Permissão TCC Automation por Navegador (`ACBrowserAuthInfo.state`)

Gerenciada por `ACBrowserAuthManager` (`-queryAuthStatusForBundleID:`, `-requestAuthForBundleID:`, `-highFreqTick`) e refletida visualmente em `ACBrowserAuthPanel`.

```mermaid
stateDiagram-v2
    [*] --> NotInstalled : Bundle ID ausente no LaunchServices
    [*] --> NotDetermined : Navegador instalado (AEDeterminePermission = errAEEventWouldRequireUserConsent)

    NotDetermined --> HighFreqPolling : Usuário clica 'Authorize' (-onAuthorizeBrowser:)
    HighFreqPolling --> Granted : Usuário clica 'OK' no prompt do macOS (AEDeterminePermission = noErr)
    HighFreqPolling --> Denied : Usuário clica 'Não Permitir' (AEDeterminePermission = errAEEventNotPermitted -1743)
    HighFreqPolling --> NotDetermined : Timeout de highFreqTickCount atingido

    Denied --> SettingsPolling : Usuário clica 'Open System Settings' (-startSettingsPollTimer)
    SettingsPolling --> Granted : Usuário ativa chave em Privacidade e Segurança > Automação
    Granted --> Denied : Usuário desativa chave nas Configurações (detectado pelo globalHeartbeatTimer)
```

---

## 3. Máquina de Estados de Uma Aba de Navegador Sob Web Block (`ACMonitorBrowser`)

```mermaid
stateDiagram-v2
    [*] --> TabOpen : Aba aberta ou navegada no Browser
    TabOpen --> PolledByAppleScript : Tick de _monitorTimer (getActiveURLs / getOpenedURLs)
    PolledByAppleScript --> Allowed : websiteIsBlock == NO (ou URL em whiteWebsites)
    PolledByAppleScript --> BlockedDetected : websiteIsBlock == YES

    BlockedDetected --> RedirectingViaAppleScript : set URL of tab to blockToURL
    RedirectingViaAppleScript --> RedirectedPage : AppleEvent concluído com sucesso (blocked-website.html)
    RedirectingViaAppleScript --> ClosingAndReopening : Falha no AppleEvent de set URL
    ClosingAndReopening --> RedirectedPage : closeURLTab + openURLTab(blockToURL)
    RedirectedPage --> Allowed : Próximo tick vê URL == blockToURL (ignorado para evitar loop)
```
