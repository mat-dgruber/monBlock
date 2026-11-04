# Fluxogramas — Módulo `app-lock-engine`

> Gerado pelo agente **Archaeologist** (`doc_level = detalhado`, 🟢 CONFIRMADO).

---

## 1. Fluxo Geral de Monitoramento e Interceptação de Aplicativos (`ACRunningAppsMgr` → `ACMonitorTask`)

```mermaid
flowchart TD
    A[NSWorkspace.sharedWorkspace] -->|KVO: runningApplications / DidLaunchNotification| B[ACRunningAppsMgr]
    B -->|Cria wrapper| C[ACRunningApp initWithRunningApp:]
    C -->|Verifica canManagerApp| D{É Finder ou loginwindow?}
    D -- Sim --> E[Ignorar Processo]
    D -- Não --> F[Registra KVO nas keys 'active' e 'hidden']
    F -->|Mudança de estado ou Lançamento| G[ACMonitorTask runningAppsMgr:applicationDidActivate:/DidLaunched:]
    G --> H[-[ACMonitorTask appIsBlock:app]]
    H --> I{preferences.enableAppBlock == YES?}
    I -- Não --> J[Permitir Execução Normal]
    I -- Sim --> K[Busca ACMonitorItem por BundleID / BundleURL / ExecutableURL]
    K --> L{Modo: appBlackRule?}
    L -- Blacklist (YES) --> M{App está em _blackMonitorApps?}
    L -- Allowlist (NO) --> N{App NÃO está em _whiteMonitorApps?}
    M -- Não --> J
    N -- Não --> J
    M -- Sim --> O[-[ACMonitorTask monitorItemScheduleAvailable:item]]
    N -- Sim --> O
    O --> P{Restrição ativa no horário atual?}
    P -- Não (Fora do bloqueio) --> J
    P -- Sim --> Q{app.granted == YES?}
    Q -- Sim --> J
    Q -- Não --> R[-[ACMonitorTask requireActiveApp:withTimeInterval:launched:]]
```

---

## 2. Fluxo da Função `-[ACMonitorTask requireActiveApp:withTimeInterval:launched:]` (`0x10000a900`)

```mermaid
flowchart TD
    A[Início: requireActiveApp:app] --> B[ACWindowServer windowOnScreenForProccessorWithID:pid]
    B -->|CGWindowListCopyWindowInfo| C[Obtém lista de ACWindowInfo com CGRect na tela]
    C --> D[-[ACRunningApp maskAllWindows:]]
    D --> E{customLockingScreenBg == YES?}
    E -- Sim --> F[Carrega customLockingScreenBgURL]
    E -- Não --> G[CGWindowListCreateImage + CIFilter CIGaussianBlur]
    F --> H[Exibe ACMaskWndControl sobre cada janela do app]
    G --> H
    H --> I[-[ACRunningApp hideWithoutNotification] / _hiddenTimer]
    I --> J[Exibe ACPWDInputWndCtrl: '%@ is locked']
    J --> K{Usuário insere senha?}
    K -- Senha Válida (ACPasswordMgr) --> L[Define app.granted = YES]
    L --> M[-[ACRunningApp removeAllMaskWindows]]
    M --> N[-[ACRunningApp activateWithoutNotification]]
    K -- Senha Inválida --> O[Log: 'Lock screen: password rejected']
    O --> P{capturePhotoWhenFailedAttempt == YES?}
    P -- Sim --> Q[ACCapturePhoto -> AVCaptureSession -> Grava ACLogRecord em appcrypt.aclog]
    P -- Não --> R[Mantém bloqueio]
    Q --> R
    K -- Cancelou / Fechou Prompt --> S{launched == YES ou política terminate?}
    S -- terminate --> T[-[ACRunningApp terminateWithoutNotification] / osascript quit]
    S -- hide --> U[Mantém app oculto via hideWithoutNotification]
```

---

## 3. Fluxo de Revogação Automática (`Auto-Lock` por Desativação, Ociosidade e Sleep)

```mermaid
flowchart TD
    subgraph Desativacao["Auto-Lock ao Desativar App"]
        A1[runningAppsMgr:applicationDidDeactivate:] --> A2{enableAutoLockDeactivated == YES e app.granted == YES?}
        A2 -- Sim --> A3[Inicia _resignTimer com authorityRetainInterval min]
        A3 -->|Timer dispara| A4[-[ACRunningApp becomeGrantedAgain] -> granted = NO]
    end

    subgraph Ociosidade["Auto-Lock ao Deixar o Mac (IOKit HIDIdleTime)"]
        B1[Timer periódico: -checkNoActive / -checkNoActiveData] --> B2[Consulta IOHIDSystem -> HIDIdleTime]
        B2 --> B3{Tempo ocioso >= computerNoActivityInterval min?}
        B3 -- Sim --> B4[-[ACMonitorTask refreshAllBlockApp] -> Todos granted = NO]
    end

    subgraph Repouso["Auto-Lock no Sleep do Sistema"]
        C1[NSWorkspaceWillSleepNotification] --> C2[Log: 'System going to sleep, refreshing blocked apps']
        C2 --> C3[-[ACMonitorTask refreshAllBlockApp] -> Todos granted = NO]
    end
```
