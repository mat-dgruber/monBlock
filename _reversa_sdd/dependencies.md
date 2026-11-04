# Dependências, Frameworks e APIs do Sistema — Cisdem AppCrypt v7.11.0

> Extraído da tabela de importação Mach-O (`LC_LOAD_DYLIB` e `nm -u`) pelo agente **Scout** (🟢 CONFIRMADO).

---

## 1. Frameworks Internos Embutidos (`Contents/Frameworks/`)

| Framework / Binário | Bundle ID | Versão | Papel Técnico | Confiança |
|---|---|---|---|---|
| `ASFoundation2.framework` | `com.aneesoft.ASFoundation` | `1.0.0` | Biblioteca base C++/Objective-C++ compartilhada pelos produtos Aneesoft/Cisdem; inclui parser JSON (`jsoncpp` — `json_valueiterator.inl`), utilitários de arquivo, rede e criptografia leve. | 🟢 CONFIRMADO |
| `ASBaseService.framework` | `com.cisdem.ASBaseService` | `1.0.0` | Gerencia ciclo de atualização (`ASUpdatesService`), verificação de licença (`ASRegisterService`), janelas de compra/ativação e inicialização do Sentry (`IASSentryService`). | 🟢 CONFIRMADO |
| `ASBaseServiceHelper` | *(Executável auxiliar)* | `1.0.0` | Binário Mach-O enxuto invocado na atualização: aguarda via `sleepForTimeInterval:`, substitui o bundle antigo (`moveItemAtPath:toPath:error:` / `removeItemAtPath:error:`) e relança o app via `NSWorkspace`. | 🟢 CONFIRMADO |
| `MASShortcut.framework` | `com.shpakovski.MASShortcut` | `2.4.0` | Biblioteca open-source para gravação (`MASShortcutView`) e registro de hotkeys globais no Carbon Event Manager (`MASShortcutBinder`). | 🟢 CONFIRMADO |
| `ASIAPHelper.framework` | `com.cisdem.ASIAPHelper` | `1.0.0` | Wrapper de StoreKit para compras internas e assinaturas (`com.cisdem.appencrypt.monthly`, `com.cisdem.appencrypt.yearly`). | 🟢 CONFIRMADO |
| `Sentry.framework` | `io.sentry.Sentry` | `8.x` | SDK de telemetria de erros, captura de sinais Mach/POSIX (`EXC_BAD_ACCESS`, `SEGV_ACCERR`), ANR tracker e métricas de sessão. | 🟢 CONFIRMADO |

---

## 2. Frameworks Nativos do macOS Vinculados (`LC_LOAD_DYLIB`)

| Framework do Sistema | Símbolos / Classes Críticas Importadas | Finalidade no Cisdem AppCrypt | Confiança |
|---|---|---|---|
| `AppKit.framework` | `NSWorkspace`, `NSRunningApplication`, `NSWindow`, `NSStatusBar`, `NSEvent` | Monitorar processos ativos, ocultar/fechar apps bloqueados, exibir janelas de máscara e senha, capturar eventos de mouse/teclado locais e globais. | 🟢 CONFIRMADO |
| `Foundation.framework` | `NSAppleScript`, `NSAppleEventDescriptor`, `NSKeyedArchiver`, `NSTask`, `NSTimer`, `NSUserDefaults` | Executar scripts AppleScript contra navegadores, serializar configurações em plists binárias, invocar `/usr/bin/tar` e `/usr/bin/open`. | 🟢 CONFIRMADO |
| `CoreGraphics.framework` | `CGWindowListCopyWindowInfo`, `CGWindowListCreateImage`, `CGDisplayBounds`, `CGMainDisplayID`, `CGDisplayStreamCreate` | Inspecionar janelas visíveis no WindowServer por PID (`kCGWindowOwnerPID`) e capturar imagem da janela/tela para gerar o efeito de borramento (blur). | 🟢 CONFIRMADO |
| `CoreImage.framework` | `CIContext`, `CIFilter` (`CIGaussianBlur`), `CIImage` | Aplicar filtro Gaussian Blur sobre a captura das janelas do aplicativo bloqueado (`ACMaskWndControl`). | 🟢 CONFIRMADO |
| `CoreServices.framework` | `AEDeterminePermissionToAutomateTarget`, `AESendMessage`, `FSEventStreamCreate`, `LSSharedFileListCreate`, `LSCopyDefaultApplicationURLForURL` | Consultar permissão TCC Automation para cada navegador, monitorar alterações no próprio bundle `.app` em `/Applications` via FSEvents e gerenciar Login Items. | 🟢 CONFIRMADO |
| `IOKit.framework` | `IOServiceMatching("IOHIDSystem")`, `IOServiceGetMatchingServices`, `IORegistryEntryCreateCFProperties` (`HIDIdleTime`) | Medir o tempo exato de ociosidade física do Mac (sem teclado/mouse) para o recurso "Auto-lock after leaving your Mac". | 🟢 CONFIRMADO |
| `AVFoundation.framework` | `AVCaptureSession`, `AVCaptureDevice`, `AVCaptureDeviceInput`, `AVCaptureStillImageOutput` | Fotografar silenciosamente o usuário pela webcam frontal (`AVMediaTypeVideo`) quando erra a senha de desbloqueio. | 🟢 CONFIRMADO |
| `Security.framework` | `SecItemAdd`, `SecItemCopyMatching`, `SecItemDelete` (`kSecClassGenericPassword`) | Persistir e consultar o hash MD5 da senha mestra no Keychain do macOS sob o serviço `com.cisdem.keychain`. | 🟢 CONFIRMADO |
| `WebKit.framework` | `WebView` delegates | Renderização de conteúdos HTML internos/promocionais (`ACAdsWndCtrl`). | 🟢 CONFIRMADO |
| `MetricKit.framework` *(weak)* | `MXMetricManager`, `MXCrashDiagnostic`, `MXHangDiagnostic` | Coleta diagnóstica integrada ao Sentry. | 🟢 CONFIRMADO |

---

## 3. Utilitários CLI Externos Invocados via `NSTask` / `system()`

| Binário do Sistema | Argumentos Observados | Onde é Usado | Confiança |
|---|---|---|---|
| `/usr/bin/osascript` | `osascript -e "tell application \"%@\"\n quit\n end tell"` | Fallback em `ACRunningApp` (`-terminateWithoutNotification` / `-terminateApp:`) para encerrar aplicativos que ignoram `NSRunningApplication.terminate`. | 🟢 CONFIRMADO |
| `/usr/bin/open` | `/usr/bin/open ... --args --no-startup-window` | Usado por `ACBrowserAuthManager` para despertar um navegador instalado em background ao solicitar permissão TCC Automation sem abrir janela visível. | 🟢 CONFIRMADO |
| `/usr/bin/tar` | `-czf` (criação) e `-xvf` (extração) de arquivo `.tgz.gz` | Usado por `ACMonitorAppSelf` para criar backup completo do próprio `Cisdem AppCrypt.app` e restaurá-lo se for deletado. | 🟢 CONFIRMADO |
