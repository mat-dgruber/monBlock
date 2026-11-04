# Domínio, Glossário e Regras de Negócio Implícitas — Cisdem AppCrypt v7.11.0

> Extraído e interpretado pelo agente **Detective** a partir do binário Mach-O, strings localizadas, arquivos de log e páginas oficiais (`https://www.cisdem.com/pt/appcrypt.html` e `https://www.cisdem.com/blocked-website.html`).

---

## 1. Glossário de Domínio

| Termo de Domínio | Classe / Símbolo no Binário | Definição Real na Implementação | Confiança |
|---|---|---|---|
| **App Lock (Bloqueio de Aplicativo)** | `ACMonitorTask` + `ACRunningApp` + `ACMaskWndControl` | Interceptação em userland de processos `NSRunningApplication`. Não altera o executável no disco; oculta janelas (`hide`), sobrepõe máscara com `CIGaussianBlur` e exige senha em `ACPWDInputWndCtrl`. | 🟢 CONFIRMADO |
| **Web Block (Bloqueio de Sites)** | `ACMonitorBrowser` + `ACScriptHelper` | Polling periódico via `NSAppleScript` que lê a URL das abas abertas nos navegadores suportados e redireciona abas proibidas para `https://www.cisdem.com/blocked-website.html`. | 🟢 CONFIRMADO |
| **Granted Session (Sessão Autorizada)** | `ACRunningApp.granted` (`BOOL`) | Permissão temporária em memória concedida a um aplicativo em execução após o usuário digitar a senha mestra correta. | 🟢 CONFIRMADO |
| **Authority Retain Interval** | `ACPreferences.authorityRetainInterval` | Tempo (em minutos) que um app desbloqueado permanece com `granted = YES` após perder o foco (`applicationDidDeactivate:`), controlado por `_resignTimer`. | 🟢 CONFIRMADO |
| **Computer No-Activity Interval** | `ACPreferences.computerNoActivityInterval` | Tempo (em minutos) de ociosidade física do Mac (medido via `IOHIDSystem` → `HIDIdleTime`) após o qual todos os apps voltam a `granted = NO`. | 🟢 CONFIRMADO |
| **Default Security Apps** | `+[ACPreferences defaultMonitorAppBundleID]` | Trio de aplicativos do sistema (`Activity Monitor`, `Terminal`, `System Settings`) bloqueados preventivamente para evitar que o usuário encerre o AppCrypt ou revogue permissões TCC. | 🟢 CONFIRMADO |
| **Exceptions (Always Block / Always Allow)** | `ACMonitorItemsMgr.blackWebsites` / `whiteWebsites` | Listas de prioridade máxima no bloqueio web que ignoram o modo geral e os agendamentos. | 🟢 CONFIRMADO |
| **Combined Keywords (Palavras-chave Combinadas)** | `ACCommaHintHelper` / `-matchKeywordItem:withURL:` | Regra de bloqueio web onde termos separados por vírgula exigem que a URL contenha **todos** os termos simultaneamente (operador lógico `AND`). | 🟢 CONFIRMADO |
| **Monitor Self (Autodefesa do Pacote)** | `ACMonitorAppSelf` + `ACFileSystemEventMonitor` | Mecanismo que cria um backup `.tgz.gz` do próprio `.app` e monitora `/Applications/Cisdem AppCrypt.app` via `FSEvents`, restaurando-o caso seja deletado. | 🟢 CONFIRMADO |

---

## 2. Confronto: Marketing (`cisdem.com/pt/appcrypt.html`) vs. Realidade Binária

| Afirmação Pública (`cisdem.com/pt/appcrypt.html`) | Como o Binário Realmente Implementa | Veredito |
|---|---|---|
| *"Funciona sem modificar nada nas configurações e aplicações de seu sistema"* | Confirmado: não injeta código (`DYLD_INSERT_LIBRARIES`), não altera binários de terceiros nem edita `/etc/hosts`. Usa KVO de `NSWorkspace`, `CGWindowListCopyWindowInfo` e AppleEvents. | 🟢 CONFIRMADO |
| *"Compatível com Safari, Chrome, Edge e Opera"* | A página em português está defasada em relação ao binário v7.11.0, que suporta **10 navegadores**: Chrome, Safari, Edge, Opera, Brave, Opera GX, Arc, Ecosia, Dia e Firefox (parcial). | 🟢 CONFIRMADO |
| *"Usa pouca ou nenhuma CPU"* | Para bloqueio de apps, o uso de CPU é mínimo (baseado em eventos KVO/notificações). Porém, para bloqueio web, o polling contínuo de `NSAppleScript` (`ACMonitorBrowser.monitorTimer`) e o `globalHeartbeatTimer` consomem ciclos de IPC com o `appleeventsd`. | 🟢 CONFIRMADO |
| *"Autoproteção para evitar fechamento não autorizado"* | Implementada por 3 camadas: (1) bloqueio default de `Activity Monitor`, `Terminal` e `System Settings`; (2) backup `.tgz.gz` + watchdog `FSEvents` (`ACMonitorAppSelf`); (3) configurações ocultas em pastas camufladas (`com.apple.sdev/csdv.dsc` e `com.app.cadlvq/dgh.xvc`). | 🟢 CONFIRMADO |

---

## 3. Catálogo de Regras de Negócio Implícitas Extraídas do Binário

### 3.1 Regras de Bloqueio de Aplicativos (`RN-APP-*`)
- **RN-APP-01 (Exclusão de Processos Críticos do macOS):** `-[ACRunningApp canManagerApp]` (`0x100004a58`) exclui explicitamente `com.apple.finder` e `loginwindow` de qualquer bloqueio para não travar a sessão gráfica do macOS. 🟢 CONFIRMADO
- **RN-APP-02 (Tripla Resolução de Identidade de App):** Um aplicativo é considerado monitorado se coincidir por `bundleIdentifier` (`-findMonitorItemByAppIdentifier:`), `bundleURL` (`-findMonitorItemByAppURL:`) ou `executableURL` (`-findMonitorItemByAppExecutableURL:`), impedindo bypass simples por renomeação do `.app`. 🟢 CONFIRMADO
- **RN-APP-03 (Detecção de Janelas Sem Ícone no Dock):** Aplicativos auxiliares com `activationPolicy != Regular` ainda são interceptados por `-hasWindowsButNotInDock:` (`0x100004828`) se possuírem janelas visíveis no `CGWindowListCopyWindowInfo`. 🟢 CONFIRMADO
- **RN-APP-04 (Revogação Imediata no Sleep):** Ao receber `NSWorkspaceWillSleepNotification`, `-[ACMonitorTask refreshAllBlockApp]` (`0x100009250`) revoga imediatamente `granted` de todos os aplicativos abertos (`"System going to sleep, refreshing blocked apps"`). 🟢 CONFIRMADO
- **RN-APP-05 (Fallback de Encerramento via `osascript`):** Se `[NSRunningApplication terminate]` falhar ao encerrar um app bloqueado cuja senha foi recusada, `-terminateWithoutNotification` (`0x100003a68`) invoca `osascript -e 'tell application "<Nome>" \n quit \n end tell'`. 🟢 CONFIRMADO

### 3.2 Regras de Bloqueio de Websites (`RN-WEB-*`)
- **RN-WEB-01 (Precedência de Exceções):** Em `-[ACMonitorTask websiteIsBlock:]` (`0x1000098d0`), a lista `whiteWebsites` (*Always Allow*) tem precedência máxima sobre `blackWebsites` (*Always Block*), `blockAll` (*Block All Websites*) e `monitorWebsites`. 🟢 CONFIRMADO
- **RN-WEB-02 (Prevenção de Loop de Redirecionamento):** Se a URL atual da aba já for igual a `blockToURL` (`https://www.cisdem.com/blocked-website.html` ou a URL customizada configurada), `-websiteIsBlock:` retorna `NO`. 🟢 CONFIRMADO
- **RN-WEB-03 (Validação de Formato de URL):** URLs adicionadas ou configuradas para redirecionamento customizado são validadas pela regex de domínio `^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9])$` ou exigem prefixo `http://` ou `https://` (`"The URL format is incorrect, it must start with https or http"`). 🟢 CONFIRMADO
- **RN-WEB-04 (Limite de Adição Rápida em Lote):** A janela `ACQuickAddWebCtr` impõe limite máximo de **100 websites por vez** (`AC_New_QuicklyAddLimit`: *"You can add up to 100 websites at a time"*). 🟢 CONFIRMADO
- **RN-WEB-05 (11 Categorias Predefinidas em `Assets.car`):** `ACPopularURLs` carrega o `NSDataAsset` `"popularURLs"` (`32.945 bytes`, XML plist dentro de `Assets.car`) contendo centenas de domínios divididos em 11 categorias: `Dating Sites`, `Email Sites`, `Gambling Sites`, `Games Sites`, `News Sites`, `Porn Sites`, `Proxy Sites`, `Search Engines`, `Shopping Sites`, `Social Sites` e `Video Sites`. 🟢 CONFIRMADO

### 3.3 Regras de Licenciamento / Limites da Versão Gratuita (`RN-LIM-*`)
- **RN-LIM-01 (Limites do Modo Free / Trial Expirado):** Conforme `AC_IAP_Info` e `AC_IAP_Limit*`, a versão gratuita restringe o usuário a **trancar apenas 1 aplicativo e bloquear apenas 1 website**, desabilitando Allowlist de apps (`AC_IAP_Limit2_5`), Block All Websites (`AC_IAP_Limit3`), Exceções Always Block/Allow (`AC_IAP_Limit4`) e Importação/Exportação de configuração (`AC_IAP_Limit5`). 🟢 CONFIRMADO
- **RN-LIM-02 (Códigos de Recuperação One-Time):** `ACResetPasswordMgr` valida códigos de suporte (`-validateSecretCode:`, `0x10002e4ec`) e os registra em `ACPreferences.usedSecretCodes` (`-addSecretCode:`, `0x10000fe4c`) para que cada código funcione apenas uma única vez. 🟢 CONFIRMADO
