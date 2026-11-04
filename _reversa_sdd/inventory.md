# Inventário de Superfície — Cisdem AppCrypt v7.11.0 (build 7110)

> Extraído diretamente do pacote `/Applications/Cisdem AppCrypt.app` e dos artefatos de runtime em `~/Library/` pelo agente **Scout** (🟢 CONFIRMADO).

---

## 1. Identidade do Bundle Principal

| Propriedade | Valor | Evidência | Confiança |
|---|---|---|---|
| **Nome do App** | `Cisdem AppCrypt` | `Contents/Info.plist:24` | 🟢 CONFIRMADO |
| **Bundle Identifier** | `com.cisdem.appencrypt` | `Contents/Info.plist:20` | 🟢 CONFIRMADO |
| **Versão Comercial** | `7.11.0` (`CFBundleVersion = 7110`) | `Contents/Info.plist:28,34` | 🟢 CONFIRMADO |
| **Application Identifier Interno** | `14` | `Contents/Info.plist:6` | 🟢 CONFIRMADO |
| **Application UUID** | `{12E82FC5-447D-4A70-8859-40AF218FDE84}` | `Contents/Info.plist:8` | 🟢 CONFIRMADO |
| **Arquitetura do Executável** | Universal Binary (`x86_64` + `arm64`) | `Contents/MacOS/Cisdem AppCrypt` | 🟢 CONFIRMADO |
| **Versão Mínima do macOS** | `10.15` (Catalina), compilado com SDK `macosx26.4` (`DTXcode 2641`) | `Contents/Info.plist:42-54` | 🟢 CONFIRMADO |
| **Modo de Execução UI** | `LSUIElement = true` (Agente de Menu Bar, sem ícone fixo obrigatório no Dock) | `Contents/Info.plist:55-56` | 🟢 CONFIRMADO |
| **Prevenção de Término Automático** | `NSSupportsAutomaticTermination = false`, `NSSupportsSuddenTermination = false` | `Contents/Info.plist:72-75` | 🟢 CONFIRMADO |
| **Assinatura Digital** | `Developer ID Application: ENOL INTERNATIONAL CO., LIMITED (5HGV8EX6BQ)` + Hardened Runtime (`0x10000`) | `codesign -dvv` | 🟢 CONFIRMADO |

---

## 2. Entitlements Embutidos no Binário

Extraídos da assinatura criptográfica Mach-O (`codesign -d --entitlements :-`):

```xml
<dict>
  <key>com.apple.security.automation.apple-events</key>
  <true/>
  <key>com.apple.security.device.camera</key>
  <true/>
  <key>com.apple.security.temporary-exception.apple-events</key>
  <array>
    <string>com.google.Chrome</string>
    <string>org.mozilla.firefox</string>
    <string>com.apple.Safari</string>
    <string>com.microsoft.edgemac</string>
    <string>com.operasoftware.Opera</string>
    <string>com.brave.Browser</string>
    <string>com.operasoftware.OperaGX</string>
    <string>company.thebrowser.Browser</string>
    <string>org.ecosia.browser</string>
    <string>company.thebrowser.dia</string>
  </array>
</dict>
```

- **Significado arquitetural (🟢 CONFIRMADO):**
  - O app **não possui** entitlements de `com.apple.developer.networking.networkextension`, `system-extension`, nem `EndpointSecurity`.
  - Todo o bloqueio de sites depende exclusivamente de **AppleEvents (`com.apple.security.automation.apple-events`)** direcionados aos 10 navegadores listados em `temporary-exception.apple-events`.
  - A captura de intrusos em tentativas de senha malsucedidas utiliza `com.apple.security.device.camera`.

---

## 3. Árvore de Arquivos do Pacote (`/Applications/Cisdem AppCrypt.app`)

```text
/Applications/Cisdem AppCrypt.app/Contents/
├── Info.plist
├── PkgInfo
├── CodeResources
├── _CodeSignature/CodeResources
├── MacOS/
│   └── Cisdem AppCrypt                          # Binário principal Universal (x86_64 + arm64)
├── Frameworks/
│   ├── ASBaseService.framework/                 # Serviço de atualização, ativação e telemetria base
│   │   └── Versions/A/
│   │       ├── ASBaseService                    # Dylib universal
│   │       ├── ASBaseServiceHelper              # Executável auxiliar para substituição de .app em updates
│   │       └── Resources/ (ASRegstierWndCtrMac.nib, ASUpdateWindowControl.nib, Localizable.strings)
│   ├── ASFoundation2.framework/                 # Fundação C++/ObjC (jsoncpp: json_valueiterator.inl)
│   ├── ASIAPHelper.framework/                   # Helper StoreKit In-App Purchase
│   ├── MASShortcut.framework/                   # Atalhos globais de teclado (v2.4.0)
│   └── Sentry.framework/                        # Monitoramento de crashes, ANR e métricas HTTP
└── Resources/
    ├── AppIcon.icns
    ├── Assets.car                               # Contém ícones + NSDataAsset "popularURLs" (plist de 32.9 KB)
    ├── Base.lproj/
    │   ├── MainMenu.nib
    │   ├── ACAboutWndCtrl.nib
    │   └── ACErrorLogWindowCtr.nib
    ├── {de,en,es,fr,it,ja,pt-BR}.lproj/Localizable.strings (UTF-16LE)
    └── 28 arquivos .nib de janelas/views (ACMainWndCtrl.nib, ACPWDInputWndCtrl.nib, ACMaskWndControl.nib, etc.)
```

---

## 4. Artefatos de Persistência e Estado no Sistema (`~/Library/`)

| Caminho no Sistema | Formato | Papel Funcional | Classe Responsável | Confiança |
|---|---|---|---|---|
| `~/Library/LaunchAgents/com.cisdem.appencrypt.plist` | XML Property List | Inicia o app no login com argumentos `-runMode autoLaunched` (`RunAtLoad = true`) | `ACLoginStart` | 🟢 CONFIRMADO |
| `~/Library/Preferences/com.cisdem.appencrypt.plist` | Binary Property List (`NSUserDefaults`) | Cache de autorização de browsers (`AC_BrowserAuthCache`), flags de primeiro uso (`ACFirstLaunchKey`), idioma (`ACUserLanguageKey`) e fallback de hash de senha | `ACPreferences`, `ACBrowserAuthManager` | 🟢 CONFIRMADO |
| `~/Library/Application Support/com.apple.sdev/csdv.dsc` | Binary Property List (`NSKeyedArchiver` / `NSSecureCoding`) | **Banco de dados principal camuflado** contendo `ACPreferences`, `ACMonitorItemsMgr` (listas de apps e sites bloqueados/permitidos) e `ACScheduleGroup` | `ACPreferences` (`+preferencesPathFileURL`) | 🟢 CONFIRMADO |
| `~/Library/Application Support/com.app.cadlvq/dgh.xvc` | Binary Property List (`NSKeyedArchiver` / `NSSecureCoding`) | **Espelho/backup camuflado** da configuração principal para recuperação caso o arquivo primário seja corrompido ou removido | `ACPreferences` (`+backupFilePreferencesURL`) | 🟢 CONFIRMADO |
| `~/Library/Application Support/Cisdem AppCrypt/configure.ascfg` | JSON | Metadados de instalação, `Device ID` (`ASRegisterUniqueIDKey`), timestamps de update/registro e payload base64 `ASDt` | `ASBaseService.framework` | 🟢 CONFIRMADO |
| `~/Library/Application Support/Cisdem AppCrypt/appcrypt.aclog` | Binary Property List (`NSKeyedArchiver`) | Histórico de tentativas falhas de desbloqueio (`ACLogRecord`) com fotos JPEG/PNG embutidas (`_imageData`) | `ACLogRecordMgr` | 🟢 CONFIRMADO |
| `~/Library/Application Support/Cisdem AppCrypt/log/*.log` | Texto plano (`MM_dd_yyyy HH-mm-ss.log`) | Logs operacionais de sessão, resumo da configuração ativa e eventos de bloqueio/sono | `ACAPPObject` (`-initLog`) | 🟢 CONFIRMADO |
| Keychain (`svce = "com.cisdem.keychain"`) | macOS Keychain (`kSecClassGenericPassword`) | Armazenamento primário do hash MD5 da senha mestra do usuário | `ACKeychain`, `ACPasswordMgr` | 🟢 CONFIRMADO |

---

## 5. Módulos Identificados para Escavação

1. **`app-lock-engine`**: Monitoramento de processos em execução (`NSWorkspace` + KVO), inspeção de janelas no WindowServer (`CGWindowListCopyWindowInfo`), aplicação de máscara com blur Gaussiano (`CIGaussianBlur`), ocultamento/encerramento de apps bloqueados e timers de auto-lock por inatividade (`IOHIDSystem` `HIDIdleTime`) ou perda de foco.
2. **`web-block-engine`**: Motor de bloqueio de websites por polling de AppleScript (`NSAppleScript` em fila GCD serial), verificação de permissões TCC Automation (`AEDeterminePermissionToAutomateTarget`), avaliação de regras (Block All, Blocklist, Allowlist, Keywords combinadas por vírgula e 11 categorias de `popularURLs`) e redirecionamento de abas para `https://www.cisdem.com/blocked-website.html` (ou URL customizada).
3. **`schedule-engine`**: Sistema de agendamento temporal global (`scheduleGroupToAll`) e individual por app/site (`useSelfSchedule`), máscaras de bits por dia da semana (`repeatMask`) e perfis predefinidos.
4. **`security-and-persistence`**: Gerenciamento de senha mestra (Keychain + fallback `NSUserDefaults`), serialização segura camuflada (`com.apple.sdev/csdv.dsc` e `com.app.cadlvq/dgh.xvc`), importação/exportação `.acconf` e `.txt`, e captura fotográfica de intrusos via webcam (`AVCaptureSession`).
5. **`self-defense-and-lifecycle`**: Autoproteção contra exclusão do `.app` (`FSEvents` + backup `.tgz.gz` com restauração automática via `/usr/bin/tar`), proteção de apps críticos do sistema (`Activity Monitor`, `Terminal`, `System Settings`), persistência de inicialização (`LaunchAgents`) e helper de atualização (`ASBaseServiceHelper`).
