# Fluxogramas — Módulo `self-defense-and-lifecycle`

> Gerado pelo agente **Archaeologist** (`doc_level = detalhado`, 🟢 CONFIRMADO).

---

## 1. Sequência de Inicialização e Autodefesa (`ACAPPObject` + `ACMonitorAppSelf`)

```mermaid
flowchart TD
    A[Início do Processo Mach-O] --> B[-[ACAPPObject initLog] -> Cria MM_dd_yyyy HH-mm-ss.log]
    B --> C[+[ACLoginItemSharedFileList installedApplicationsPath]]
    C --> D{App está em /Applications/?}
    D -- Não --> E[Exibe AC_O_InstallError e encerra o app]
    D -- Sim --> F[-[ACAPPObject InitRegAndUpdate] + -[ACAPPObject InitSentryService]]
    F --> G[ACBrowserAuthManager startGlobalHeartbeat]
    G --> H[-[ACMonitorAppSelf backupAppSelf]]
    H -->|NSTask: /usr/bin/tar -czf| I[Gera arquivo tgz.gz do próprio Cisdem AppCrypt.app]
    I --> J[ACFileSystemEventMonitor inicia FSEventStream sobre /Applications/Cisdem AppCrypt.app]
    J --> K[ACPreferences loadPreferences -> Imprime Configuration Summary no log]
    K --> L[ACMonitorTask setActive:YES -> 'Monitor activated']
```

---

## 2. Watchdog Anti-Exclusão via FSEvents (`ACMonitorAppSelf` em `0x10002e1a8`)

```mermaid
flowchart TD
    A[Usuário tenta mover ou deletar /Applications/Cisdem AppCrypt.app] --> B[Kernel macOS emite evento FSEvents]
    B --> C[-[ACFileSystemEventMonitor eventSystemCallback:eventPaths:eventFlags:eventId:]]
    C --> D[-[ACMonitorAppSelf fileSystemMonitorURLs:didChanged:]]
    D --> E{Bundle principal foi removido ou corrompido?}
    E -- Não --> F[Continua monitoramento]
    E -- Sim --> G[-[ACMonitorAppSelf restoreAppSelf] (0x10002e028)]
    G -->|NSTask: /usr/bin/tar -xvf tgz.gz| H[Reconstrói Cisdem AppCrypt.app em /Applications]
    H --> I[-[ACMonitorAppSelf launchRestoreApp] (0x10002da20)]
```
