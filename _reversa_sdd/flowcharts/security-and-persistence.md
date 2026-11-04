# Fluxogramas — Módulo `security-and-persistence`

> Gerado pelo agente **Archaeologist** (`doc_level = detalhado`, 🟢 CONFIRMADO).

---

## 1. Ciclo de Leitura, Escrita e Auto-Recuperação de Preferências (`ACPreferences`)

```mermaid
flowchart TD
    subgraph Leitura["Boot: +[ACPreferences loadPreferences] (0x10000f574)"]
        L1[Tenta ler ~/Library/Application Support/com.apple.sdev/csdv.dsc] --> L2{Arquivo existe e NSKeyedUnarchiver decodificou?}
        L2 -- Sim --> L3[Retorna instância ACPreferences carregada]
        L2 -- Não (Corrompido ou Deletado) --> L4[+[ACPreferences restoreBackup] (0x10000f500)]
        L4 --> L5[Lê ~/Library/Application Support/com.app.cadlvq/dgh.xvc]
        L5 --> L6{Backup válido?}
        L6 -- Sim --> L7[Restaura csdv.dsc a partir de dgh.xvc e carrega]
        L6 -- Não --> L8[Verifica migração +GetOldData ou cria ACPreferences padrão (-setDefault)]
    end

    subgraph Escrita["Mutação: -[ACPreferences savePreferences] (0x1000100bc)"]
        S1[Observa mudança KVO ou ACPreferencesConfigureDidChanged] --> S2[NSKeyedArchiver arquiva grafo ACPreferences + ACMonitorItemsMgr + ACScheduleGroup]
        S2 --> S3[Grava arquivo primário: com.apple.sdev/csdv.dsc]
        S3 --> S4[+[ACPreferences backUpSave] -> Espelha em com.app.cadlvq/dgh.xvc]
    end
```

---

## 2. Validação de Senha e Captura de Intruso (`ACPasswordMgr` + `ACCapturePhoto`)

```mermaid
flowchart TD
    A[Usuário submete senha em ACPWDInputWndCtrl] --> B[-[ACPasswordMgr passwordValidate:input]]
    B --> C[Calcula hash MD5 da entrada e compara com -passwordMD5Value]
    C --> D{Onde buscar passwordMD5Value?}
    D -->|Primário| E[ACKeychain passwordForService:'com.cisdem.keychain']
    D -->|Fallback| F[NSUserDefaults key: 'ACSavePInKeychain']
    E & F --> G{Hashes coincidem?}
    G -- Sim --> H[Log: 'Lock screen: password accepted' -> Desbloqueia recurso]
    G -- Não --> I[Log: 'Lock screen: password rejected']
    I --> J{preferences.capturePhotoWhenFailedAttempt == YES?}
    J -- Não --> K[Exibe erro de senha incorreta na UI]
    J -- Sim --> L[ACCapturePhoto captureImageWithCompleteHandler:]
    L --> M[AVCaptureSession captura JPEG da câmera FaceTime]
    M --> N[Cria ACLogRecord com nome do app, timestamp e foto]
    N --> O[ACLogRecordMgr salva em ~/Library/Application Support/Cisdem AppCrypt/appcrypt.aclog]
```
