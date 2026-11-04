# Arquitetura Completa do Sistema — Cisdem AppCrypt v7.11.0 (build 7110)

> Síntese arquitetural produzida pelo agente **Architect** (`doc_level = detalhado`, 🟢 CONFIRMADO).

---

## 1. Visão Arquitetural Executiva

O **Cisdem AppCrypt para macOS** é um aplicativo monolítico de espaço de usuário (userland) escrito em **Objective-C / Objective-C++** sobre **AppKit/Foundation**, empacotado como um **Universal Mach-O Binary (`x86_64` + `arm64`)** que opera como um agente residente na barra de menus (`LSUIElement = true`).

Sua arquitetura evita intencionalmente extensões de kernel (`kext`), `SystemExtensions` (`EndpointSecurity` / `NetworkExtension`) e daemons privilegiados (`root`), apoiando-se exclusivamente em **quatro pilares nativos do espaço de usuário do macOS**:

1. **Observação de Processos e Janelas (`NSWorkspace` KVO + CoreGraphics `CGWindowListCopyWindowInfo`)** para interceptar aplicativos bloqueados, cobri-los com janelas de máscara borradas (`CoreImage` `CIGaussianBlur`) e ocultá-los/encerrá-los.
2. **Automação Inter-Processos via AppleEvents (`NSAppleScript` + `AEDeterminePermissionToAutomateTarget`)** para inspecionar periodicamente as abas de 10 navegadores web suportados e redirecionar URLs proibidas para `https://www.cisdem.com/blocked-website.html` (ou URL customizada).
3. **Monitoramento de Hardware e Sensores (`IOKit` `IOHIDSystem` + `AVFoundation`)** para medir o tempo de ociosidade física do Mac (`HIDIdleTime`) e fotografar intrusos pela webcam (`AVCaptureStillImageOutput`).
4. **Persistência Camuflada e Autodefesa (`NSKeyedArchiver` em `com.apple.sdev/csdv.dsc` + `com.app.cadlvq/dgh.xvc` + `FSEvents` + `tar`)** para resistir a tentativas casuais de exclusão de configurações ou remoção do pacote `.app`.

---

## 2. Integrações Externas e de Sistema

| Sistema / Serviço Externo | Protocolo / Formato | Direção | Finalidade | Confiança |
|---|---|---|---|---|
| **Navegadores Web (10 suportados)** | AppleEvents (`aevt` / `core` / `suite Chromium & Safari`) via `NSAppleScript` | Bidirecional (IPC local) | Ler `URL of active/current tab of every window` e executar `set URL of tab to ...` ou `close tab`. | 🟢 CONFIRMADO |
| **Página de Bloqueio Cisdem** (`https://www.cisdem.com/blocked-website.html`) | HTTPS GET (navegador redirecionado) | Saída (via Browser) | Destino padrão para onde a aba bloqueada do navegador é redirecionada. | 🟢 CONFIRMADO |
| **Sentry Cloud Ingest** (`o4509432298405888.ingest.de.sentry.io`) | HTTPS POST (Sentry Envelope JSON) | Saída | Envio de relatórios de crash, ANR e telemetria diagnóstica (`Sentry.framework`). | 🟢 CONFIRMADO |
| **Servidor de Registro / Updates Cisdem** (`ASBaseService.framework`) | HTTPS REST / JSON | Bidirecional | Verificação de atualizações (`ASUpdatesService`) e ativação de licença (`ASRegisterService`). | 🟢 CONFIRMADO |
| **Apple StoreKit (MAS / IAP)** (`ASIAPHelper.framework`) | StoreKit API | Bidirecional | Assinaturas mensais (`com.cisdem.appencrypt.monthly`) e anuais (`com.cisdem.appencrypt.yearly`). | 🟢 CONFIRMADO |
| **macOS WindowServer / Quartz Compositor** | `CGWindowListCopyWindowInfo` / `CGWindowListCreateImage` | Leitura | Enumerar janelas em tela por PID e capturar pixels para filtro `CIGaussianBlur`. | 🟢 CONFIRMADO |
| **macOS TCC Daemon (`tccd` / `appleeventsd`)** | `AEDeterminePermissionToAutomateTarget` | Consulta / Prompt | Verificar e solicitar permissão de Automação para controlar cada navegador. | 🟢 CONFIRMADO |
| **macOS Keychain (`securityd`)** | `SecItemAdd` / `SecItemCopyMatching` (`com.cisdem.keychain`) | Leitura / Escrita | Persistência do hash MD5 da senha mestra. | 🟢 CONFIRMADO |

---

## 3. Limitações Estruturais e Dívidas Técnicas Identificadas (Insights para o `monBlock`)

1. **Fragilidade do Bloqueio no Firefox (`ACMonitorFirfoxBrowser`):**
   - O Firefox no macOS não expõe a coleção `every tab of every window` nem a propriedade `URL` via AppleScript padrão. A classe `ACMonitorFirfoxBrowser` (`0x10004a258`) sobrescreve apenas `-browserName` (`"Firefox"`), herdando os scripts AppleScript do Chromium na classe base `ACMonitorBrowser`, o que resulta em falha silenciosa de leitura de abas no Firefox.
2. **Qualquer Navegador Fora da Lista de 10 Bundle IDs Passa Livremente:**
   - Como o bloqueio depende da lista estática em `+supportBrowsersIdentifier` e no entitlement `com.apple.security.temporary-exception.apple-events` (Chrome, Firefox, Safari, Edge, Opera, Brave, Opera GX, Arc, Ecosia, Dia), navegadores alternativos (Vivaldi, Zen Browser, Orion, Tor Browser, DuckDuckGo, Waterfox, Chromium puro) **não sofrem bloqueio web** a menos que sejam bloqueados inteiramente como aplicativos no App Lock.
3. **Overhead de Polling AppleScript (`monitorTimer` + `NSAppleScript`):**
   - Compilar e executar scripts AppleScript repetidamente em timer gera tráfego constante no `appleeventsd` e pequeno atraso perceptível (a página proibida começa a carregar antes de a aba ser redirecionada para `blocked-website.html`).
4. **Hash de Senha em MD5 (`ACPasswordMgr.passwordMD5Value`):**
   - O uso de MD5 sem salt moderno (com fallback em `NSUserDefaults` se o Keychain falhar) é criptograficamente obsoleto; uma implementação moderna (como o `monBlock`) deve usar `Argon2id` ou `PBKDF2-HMAC-SHA256` armazenado exclusivamente no Keychain / Secure Enclave.
5. **Segurança por Obscuridade nos Caminhos de Persistência (`com.apple.sdev/csdv.dsc` e `com.app.cadlvq/dgh.xvc`):**
   - Embora eficaz contra usuários leigos, qualquer inspeção de strings ou `fs_usage` revela os dois caminhos estáticos em `~/Library/Application Support/`.
