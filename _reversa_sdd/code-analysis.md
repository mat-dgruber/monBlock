# Análise Profunda de Código e Binário — Cisdem AppCrypt v7.11.0 (build 7110)

> Escavação técnica de nível binário (Mach-O `arm64` / `x86_64`, metadados Objective-C `__objc_classlist`, seletores, ivars, strings e logs de runtime) conduzida pelo agente **Archaeologist** (leitura estática, sem teste dinâmico).
>
> **Aviso de conflito (agenda):** as menções a `monitorItemScheduleAvailable:` em `0x100009730` (modelo `ACScheduleGroup`/`ACScheduleUnit`) não foram reconciliadas com `ACSchedule`/`ACScheduleHelper` em `0x100009b70` descritos em `schedule-engine/`. Ver `gaps.md`, `traceability/code-spec-matrix.md` e TT-SCH-03.

---

## Visão Geral do Motor de Execução

Ao contrário do que o nome comercial **"AppCrypt"** sugere, o aplicativo **não criptografa executáveis no disco** nem instala extensões de kernel/rede (`SystemExtension` / `NetworkExtension`). Toda a proteção opera em **espaço de usuário (userland)** por meio de um orquestrador central singleton (`+[ACMonitorTask sharedMonitorTask]` em `0x100009084`), combinando:

1. **Bloqueio de Aplicativos (`app-lock-engine`)**: Observação reativa via KVO sobre `NSWorkspace.sharedWorkspace.runningApplications` e cada `NSRunningApplication` (`active`, `hidden`), aliada à consulta de janelas abertas no WindowServer (`CGWindowListCopyWindowInfo`), mascaramento visual com `CIGaussianBlur`, ocultação (`hide`) e encerramento forçado (`terminate` / `osascript`).
2. **Bloqueio de Websites (`web-block-engine`)**: Polling periódico via `NSTimer` (`ACMonitorBrowser.monitorTimer`) disparando scripts AppleScript (`NSAppleScript`) em uma fila GCD serial (`ACScriptHelper.queueForScriptExcute`) contra 10 navegadores suportados, inspecionando as URLs das abas e redirecionando abas proibidas para `https://www.cisdem.com/blocked-website.html` (ou URL customizada).

---

## Módulo 1: `app-lock-engine` (Bloqueio de Aplicativos e Janelas)

### 1.1 Classes e Endereços Mach-O (`arm64`)

| Classe | Superclasse | Protocols | Tamanho Instância | Papel Principal | Confiança |
|---|---|---|---|---|---|
| `ACMonitorTask` | `NSObject` | `ACRunningAppsMgrDelegate` | `56 bytes` | Orquestrador singleton (`+sharedMonitorTask`, `0x100009084`) que decide se apps e URLs devem ser bloqueados e coordena timers de inatividade. | 🟢 CONFIRMADO |
| `ACRunningAppsMgr` | `NSObject` | — | `24 bytes` | Singleton (`+sharedRunningAppsMgr`, `0x10004e9c0`) que observa `NSWorkspace.runningApplications` e notifica `ACMonitorTask`. | 🟢 CONFIRMADO |
| `ACRunningApp` | `NSObject` | `ACMonitorBrowserDelegate` | `80 bytes` | Wrapper sobre `NSRunningApplication` com estado `granted`, timers de revogação (`_resignTimer`, `_mskWndTimer`, `_hiddenTimer`, `_terminateTimer`), controle de máscaras (`_mskWndCtrls`) e ponte para `ACMonitorBrowser`. | 🟢 CONFIRMADO |
| `ACWindowServer` | `NSObject` | — | `8 bytes` | Singleton (`+sharedWindowServer`, `0x100019d5c`) que consulta `CGWindowListCopyWindowInfo` via `-windowOnScreenForProccessorWithID:` (`0x100019e34`). | 🟢 CONFIRMADO |
| `ACWindowInfo` | `NSObject` | — | `64 bytes` | DTO que encapsula dicionário CoreGraphics (`__CFDictionary`) com `ownerProcessID`, `wndID`, `frameOnScreen` (`CGRect`) e `windowName`. | 🟢 CONFIRMADO |
| `ACMaskWndControl` | `NSWindowController` | — | `32 bytes` | Controlador da janela de máscara borrada (`CIGaussianBlur`) posicionada sobre as janelas do app bloqueado (`-makeDisplayMaskImage`, `0x100049390`). | 🟢 CONFIRMADO |
| `ACMaskWindow` | `NSWindow` | — | `8 bytes` | Subclasse de `NSWindow` que retorna `NO` ou controla `-canBecomeKeyWindow` (`0x10001ea34`) e `-canBecomeMainWindow` (`0x10001ea3c`). | 🟢 CONFIRMADO |
| `ACScreenMskWndCtrl` | `NSWindowController` | — | `8 bytes` | Máscara de tela cheia (`+makeScreenMskWndCtrl`, `0x10000afb0`). | 🟢 CONFIRMADO |
| `ACPWDInputWndCtrl` | `NSWindowController` | — | `96 bytes` | Janela modal de solicitação de senha mestra quando um app bloqueado ou o próprio AppCrypt é acessado (`0x1000125b4`). | 🟢 CONFIRMADO |

### 1.2 Fluxo de Controle e Algoritmos de Bloqueio de Apps

1. **Detecção de Processos (`ACRunningAppsMgr`)**:
   - No `-init` (`0x10004f434`) e `-setupRunningApps` (`0x10004effc`), `ACRunningAppsMgr` registra KVO na keyPath `"runningApplications"` de `[NSWorkspace sharedWorkspace]` e escuta notificações de lançamento/encerramento (`-postAppsDidLaunched:`, `-postAppsDidTerminate:`).
   - Cada processo ativo é encapsulado em `-[ACRunningApp initWithRunningApp:]` (`0x1000025e4`).
   - `ACRunningApp` filtra processos de sistema que não devem ser bloqueados em `-canManagerApp` (`0x100004a58`) e `-isCurrentUserRun` (`0x100004be8`): ignora `com.apple.finder` e `loginwindow`.
   - Para utilitários que possuem janela na tela mas não aparecem no Dock (`activationPolicy != NSApplicationActivationPolicyRegular`), `-hasWindowsButNotInDock:` (`0x100004828`) cruza `processIdentifier` com `[[ACWindowServer sharedWindowServer] windowOnScreenForProccessorWithID:pid]`.

2. **Observação de Foco e Visibilidade (`ACRunningApp`)**:
   - `ACRunningApp` adiciona KVO sobre `_runningApplication` para as propriedades `"active"` e `"hidden"` (`-observeValueForKeyPath:ofObject:change:context:`, `0x1000024bc`).
   - Sempre que o app ganha/perde foco (`-appActiveDidChanged`, `0x100002338`), notifica `ACRunningAppsMgr`, que invoca no delegate `ACMonitorTask`:
     - `-runningAppsMgr:applicationDidLaunched:` (`0x10000a730`)
     - `-runningAppsMgr:applicationDidActivate:` (`0x10000ab54`)
     - `-runningAppsMgr:applicationDidDeactivate:` (`0x10000a78c`)
     - `-runningAppsMgr:applicationDidTerminate:` (`0x10000a854`)

3. **Decisão de Bloqueio (`-[ACMonitorTask appIsBlock:]` em `0x100009b04` e `-appItemBlock:isBlackMode:app:` em `0x1000097d4`)**:
   - Verifica se `preferences.enableAppBlock == YES`.
   - Consulta `ACMonitorItemsMgr`:
     - Busca o `ACMonitorItem` correspondente ao app por 3 chaves em cascata:
       1. `-findMonitorItemByAppIdentifier:` (`0x10000c5b4` — `bundleIdentifier`)
       2. `-findMonitorItemByAppURL:` (`0x10000c764` — `bundleURL`)
       3. `-findMonitorItemByAppExecutableURL:` (`0x10000c8cc` — `executableURL`)
     - **Modo Blocklist (`appBlackRule == YES`)**: o app é bloqueado se estiver presente em `_blackMonitorApps` e dentro da janela de bloqueio do agendamento (`-monitorItemScheduleAvailable:`, `0x100009730`).
     - **Modo Allowlist (`appBlackRule == NO`)**: todos os apps gerenciáveis são bloqueados, **exceto** os listados em `_whiteMonitorApps` (e o próprio AppCrypt/Finder).

4. **Intervenção Visual e Ocultação (`-[ACMonitorTask requireActiveApp:withTimeInterval:launched:]` em `0x10000a900`)**:
   - Se `app.granted == NO`:
     - Emite log: `"Auth required for app: %@ (launched: %@)"` e `"Lock screen triggered by: %@"`.
     - **Mascaramento de Janelas (`-[ACRunningApp maskAllWindows:]` em `0x100002bd0`)**:
       - Consulta `ACWindowServer` (`CGWindowListCopyWindowInfo`) para obter os `CGRect` de todas as janelas visíveis do PID.
       - Captura o conteúdo gráfico via `CGWindowListCreateImage` e aplica o filtro CoreImage `CIGaussianBlur` (`-[ACMaskWndControl makeDisplayMaskImage]`, `0x100049390`) ou carrega a imagem customizada (`ACPreferences.imageForLockingScreenBg`).
       - Sobrepõe instâncias de `ACMaskWndControl` (`_mskWndCtrls`) sobre as coordenadas exatas das janelas do app.
     - **Ocultação do App Alvo**:
       - Dispara `-hideWithoutNotification` (`0x100003524`) e `-hideAppAllWindowsAfterTimeInterval:` (`0x100002ed0`) usando `_hiddenTimer`.
     - **Exibição do Prompt de Senha (`ACPWDInputWndCtrl`)**:
       - Exibe o diálogo de senha.
       - **Senha Correta**: define `app.granted = YES`, remove máscaras (`-removeAllMaskWindows`, `0x100002dd4`), reativa a janela do app (`-activateWithoutNotification`, `0x100003900`) e registra `"Auth granted for: %@"`.
       - **Senha Incorreta / Cancelamento**:
         - Registra `"Lock screen: password rejected"` e `"Auth denied for: %@, action: %@"` (`hide` ou `terminate`).
         - Se o app acabou de ser lançado (`launched == YES`) ou persiste ativo sem autorização, aciona `-terminateWithoutNotification` (`0x100003a68`) / `-terminateApp:` (`0x100003e04`), que tenta `[NSRunningApplication terminate]` e possui fallback via AppleScript:
           ```applescript
           tell application "%@"
            quit
            end tell
           ```
           executado via `osascript -e "%s"`.

5. **Revogação Automática da Autorização (`granted = YES` → `NO`)**:
   - **Ao Fechar Todas as Janelas (`-allWindowClosed`, `0x100002088`)** ou **Encerrar o Processo (`applicationDidTerminate:`)**: revoga `granted`.
   - **Auto-Lock por Desativação (`enableAutoLockDeactivated` + `authorityRetainInterval`)**:
     - Quando o app perde foco (`applicationDidDeactivate:`), `ACRunningApp` inicia `_resignTimer` via `-resignGrantedAfterTimeinterval:` (`0x100002118`). Ao expirar o tempo (`authorityRetainInterval`, convertido de minutos para segundos por `ACMinToSecValueTransformer`), chama `-becomeGrantedAgain` (`0x100002020`) revertendo o estado para bloqueado.
   - **Auto-Lock ao Deixar o Mac Ocioso (`enableAutoLockLeavingMac` + `computerNoActivityInterval`)**:
     - `ACMonitorTask` monitora eventos globais/locais (`-setupGlobalMonitor` em `0x10000a038`, `-setupLocalMonitor` em `0x100009f78`) e `ACPreferences` consulta o serviço IOKit `IOHIDSystem` → propriedade `HIDIdleTime` (`-checkNoActive` em `0x100010dd0` e `-checkNoActiveData` em `0x100010e38`).
   - **Ao Entrar em Repouso (`NSWorkspaceWillSleepNotification`)**:
     - Emite `"System going to sleep, refreshing blocked apps"` e chama `-[ACMonitorTask refreshAllBlockApp]` (`0x100009250`), revogando imediatamente todas as sessões desbloqueadas.

---

## Módulo 2: `web-block-engine` (Bloqueio de Websites e Automação de Navegadores)

### 2.1 Arquitetura sem Extensão de Rede: Polling AppleEvents / AppleScript

O Cisdem AppCrypt **não intercepta pacotes TCP/DNS** nem modifica `/etc/hosts`. Quando um navegador suportado está em execução (`-[ACRunningApp webBrowserApp]` retorna `YES` em `0x100001f8c`), o `ACRunningApp` instancia uma subclasse de `ACMonitorBrowser` via `+[ACMonitorBrowser monitorBrowserWithIdentifier:]` (`0x1000392d0`) e chama `-startMonitorWebBrowser` (`0x10000223c`).

### 2.2 Hierarquia de Classes dos 10 Navegadores Suportados

| Classe Objective-C | Superclasse | Bundle ID (`browserIdentifier`) | Nome (`browserName`) | Métodos Sobrescritos | Confiança |
|---|---|---|---|---|---|
| `ACMonitorBrowser` | `NSObject` | *(Base abstrata)* | *(Base)* | Implementa `monitorTimer`, geração padrão de AppleScripts (padrão Chromium) e parsing de `NSAppleEventDescriptor`. | 🟢 CONFIRMADO |
| `ACMonitorChromeBrowser` | `ACMonitorBrowser` | `com.google.Chrome` | `Google Chrome` | `-browserName` (`0x100025c80`), `-browserIdentifier` (`0x100025c8c`) | 🟢 CONFIRMADO |
| `ACMonitorEdgeBrowser` | `ACMonitorChromeBrowser` | `com.microsoft.edgemac` | `Microsoft Edge` | `-browserName` (`0x10002e5d0`), `-browserIdentifier` (`0x10002e5dc`) | 🟢 CONFIRMADO |
| `ACMonitorBraveBrowser` | `ACMonitorBrowser` | `com.brave.Browser` | `Brave Browser` | `-browserName` (`0x10001ea1c`), `-browserIdentifier` (`0x10001ea28`) | 🟢 CONFIRMADO |
| `ACMonitorOperaBrowser` | `ACMonitorBrowser` | `com.operasoftware.Opera` | `Opera` | `-browserName` (`0x100025c98`), `-browserIdentifier` (`0x100025ca4`) | 🟢 CONFIRMADO |
| `ACMonitorOperaGXBrowser` | `ACMonitorBraveBrowser` | `com.operasoftware.OperaGX` | `Opera GX` | `-browserName` (`0x10001e1ec`), `-browserIdentifier` (`0x10001e1f8`) | 🟢 CONFIRMADO |
| `ACMonitorEcosiaBrowser` | `ACMonitorBrowser` | `org.ecosia.browser` | `Ecosia` | `-browserName` (`0x10004a488`), `-browserIdentifier` (`0x10004a494`) | 🟢 CONFIRMADO |
| `ACMonitorSafariBrowser` | `ACMonitorBrowser` | `com.apple.Safari` | `Safari` | `-browserName`, `-browserIdentifier`, `-appleScriptForGetActiveURLs` (`0x100041250`), `-appleScriptForCloseURL:` (`0x1000412fc`) | 🟢 CONFIRMADO |
| `ACMonitorArcBrowser` | `ACMonitorBrowser` | `company.thebrowser.Browser` | `Arc` | `-browserName`, `-browserIdentifier`, `-appleScriptForRedirectURL:toURL:` (`0x10004a27c`) | 🟢 CONFIRMADO |
| `ACMonitorDiaBrowser` | `ACMonitorBrowser` | `company.thebrowser.dia` | `Dia` | `-browserName`, `-browserIdentifier`, `-appleScriptForRedirectURL:toURL:` (`0x10004a4b8`) | 🟢 CONFIRMADO |
| `ACMonitorFirfoxBrowser` | `ACMonitorBrowser` | `org.mozilla.firefox` | `Firefox` | Apenas `-browserName` (`0x10004a258`) — herda scripts da base (que falham no Firefox por ausência de dicionário AppleScript de abas; ver Seção 2.6). | 🟢 CONFIRMADO |

### 2.3 Execução Assíncrona de AppleScript (`ACScriptHelper`)

- Singleton `+[ACScriptHelper shareScriptHelper]` (`0x10004157c`).
- Mantém uma fila serial do Grand Central Dispatch: `_queueForScriptExcute` (`OS_dispatch_queue`, `-queueForScriptExcute` em `0x100041688`) e registra `_lastScriptExcuteDate` (`NSDate`).
- Métodos de execução:
  - `-excuteScript:withCompleteHandler:` (`0x100041ab4`): enfileira a execução com controle de frequência (throttling baseado em `lastScriptExcuteDate`).
  - `-excuteScriptNow:withCompleteHandler:` (`0x100041890`): executa imediatamente na fila para ações urgentes (como redirecionar/fechar uma aba bloqueada recém-detectada).
  - `-makeErrorFromAppleScriptError:` (`0x1000416d8`): converte dicionários de erro do `NSAppleScript` (`NSAppleScriptErrorNumber`, `NSAppleScriptErrorMessage`, `NSAppleScriptErrorBriefMessage`, `NSAppleScriptErrorAppName`) em `NSError`.

### 2.4 Templates Exatos de AppleScript Extraídos do Binário

1. **Coleta de URLs da Aba Ativa (`-appleScriptForGetActiveURLs`)**:
   - **Padrão Chromium (`ACMonitorBrowser` em `0x100039d18`)**:
     ```applescript
     tell application "%@"
       get URL of active tab of every window
     end tell
     ```
   - **Override Safari (`ACMonitorSafariBrowser` em `0x100041250`)**:
     ```applescript
     tell application "%@"
       get URL of current tab of every window
     end tell
     ```

2. **Coleta de Todas as Abas Abertas (`-appleScriptForGetAllOpenedURLs` em `0x100039dc4`)**:
   ```applescript
   tell application "%@"
     get URL of every tab of every window
   end tell
   ```

3. **Redirecionamento da Aba Bloqueada para `https://www.cisdem.com/blocked-website.html` (`-appleScriptForRedirectURL:toURL:`)**:
   - **Padrão Chromium / Safari (`ACMonitorBrowser` em `0x100039b0c`)**:
     ```applescript
     tell application "%@"
       set window_list to every window
       repeat with the_wnd in window_list
         set tab_list to every tab in the_wnd
         repeat with the_tab in tab_list
           if URL of the_tab is equal to "%@" then
             set URL of the_tab to "%@"
           end if
         end repeat
       end tell
     end tell
     ```
   - **Override Arc & Dia (`ACMonitorArcBrowser` em `0x10004a27c` e `ACMonitorDiaBrowser` em `0x10004a4b8`)**:
     *(Arc e Dia requerem iteração indexada `1 to count` sobre janelas e abas para alterar a propriedade `URL` sem erro de referência de objeto AppleEvent)*:
     ```applescript
     tell application "%@"
       set wndCount to count of every window
       repeat with w from 1 to wndCount
         set tabCount to count of tabs of window w
         repeat with t from 1 to tabCount
           if URL of tab t of window w is equal to "%@" then
             set URL of tab t of window w to "%@"
           end if
         end repeat
       end repeat
     end tell
     ```

4. **Fechamento de Aba Bloqueada (Fallback `-appleScriptForCloseURL:`)**:
   - **Padrão Chromium (`ACMonitorBrowser` em `0x100039918`)**:
     ```applescript
     tell application "%@"
       set window_list to every window
       repeat with the_wnd in window_list
         set tab_list to every tab in the_wnd
         repeat with the_tab in tab_list
           if URL of the_tab is equal to "%@" then
             close the_tab
           end if
         end repeat
       end tell
     end tell
     ```
   - **Override Safari (`ACMonitorSafariBrowser` em `0x1000412fc`)**:
     *(Safari invalida a coleção `every tab` se uma aba for fechada durante a iteração; por isso o método acumula primeiro em `close_list`)*:
     ```applescript
     tell application "%@"
       set window_list to every window
       repeat with the_wnd in window_list
         set close_list to {}
         set tab_list to every tab in the_wnd
         repeat with the_tab in tab_list
           if URL of the_tab is equal to "%@" then
             set close_list to {the_tab} & close_list
           end if
         end repeat
         repeat with the_tab in close_list
           close the_tab
         end repeat
       end repeat
     end tell
     ```

5. **Abertura de Nova Aba com URL de Bloqueio (`-appleScriptForOpenURL:` em `0x100039820`)**:
   ```applescript
   tell application "%@"
     set curTab to make new tab in first window
     set URL of curTab to "%@"
   end tell
   ```

### 2.5 Lógica de Avaliação de URL e Redirecionamento (`ACMonitorTask` + `ACMonitorItemsMgr`)

Quando `ACMonitorBrowser` obtém a lista de URLs abertas via `-getActiveURLsWithCompleteHandler:` (`0x10003a224`), ele notifica `-[ACRunningApp monitorBrowser:didOpenURLs:]` (`0x100003ee8`), que repassa para `-[ACMonitorTask runningAppsMgr:application:didOpenURLs:]` (`0x10000a324`):

1. Para cada URL retornada pelo navegador, `ACMonitorTask` invoca `-[ACMonitorTask websiteIsBlock:]` (`0x1000098d0`).
2. **Regras de Decisão em `-websiteIsBlock:`**:
   - Se `preferences.enableWebBlock == NO`, retorna `NO`.
   - Se a URL já é igual a `self.blockToURL` (`https://www.cisdem.com/blocked-website.html` ou `preferences.redirectionURL`), retorna `NO` (evita loop infinito de redirecionamento).
   - **Exceções Globais ("Exceptions" — `ACTiltlebarExceptionsViewCtrl` / `ACExceptionWndCtr`)**:
     - **Always Allow (`whiteWebsites`)**: se `-hasWhiteItemByURL:` (`0x10000e05c`) encontrar correspondência, retorna `NO` imediatamente (mesmo se "Block all websites" estiver ativo).
     - **Always Block (`blackWebsites`)**: se `-hasBlackItemByURL:` (`0x10000e2a8`) encontrar correspondência, retorna `YES` imediatamente (independentemente de agendamento).
   - **Modo "Block All Websites" (`monitorItemsMgr.blockAll == YES`)**:
     - Bloqueia qualquer URL HTTP/HTTPS que não tenha sido liberada pela lista `whiteWebsites`.
   - **Modo Lista de Sites (`monitorItemsMgr.blockAll == NO`)**:
     - Procura um `ACMonitorItem` correspondente em `monitorWebsites` via `-findMonitorItemByWebsiteURL:` (`0x10000d564`).
     - A correspondência (`-URL:containURL:` em `0x10000cf7c` e `-matchKeywordItem:withURL:` em `0x10000d868`) verifica:
       - **Domínio / Subdomínio / Caminho**: normaliza removendo esquemas `http://`, `https://` e prefixo `www.`.
       - **Keywords Simples ou Combinadas (`item.blockWithKeyword == YES`)**:
         - Se `item.keyWord` contiver vírgulas (ex.: `"work, meeting"`), divide pelas vírgulas e exige que **todas** as palavras-chave ocorram na URL (**lógica E / AND**, documentada em `ACCommaHintHelper`: *"Separate keywords with commas. Pages must contain ALL keywords to be blocked"*).
     - Se encontrar item correspondente, verifica `-monitorItemScheduleAvailable:item` (`0x100009730`) para saber se o bloqueio está ativo no horário atual.
3. **Ação de Redirecionamento**:
   - Quando `-websiteIsBlock:` retorna `YES`, `ACMonitorTask` obtém `NSURL *target = [self blockToURL]` (`0x10000a2e0`), que delega para `-[ACPreferences redirectionURL]` (`0x100011ed0`):
     - Se `customRedirection == YES` e `customRedirectionURLString` for válida, usa a URL customizada;
     - Caso contrário, usa a constante padrão **`https://www.cisdem.com/blocked-website.html`**.
   - Chama `-[ACRunningApp redirectURL:url toURL:target withCompleteHandler:]` (`0x100003fd4`).
   - Se o callback indicar falha no redirecionamento (`"Failed to redirect URL %@"`), executa o fallback: fecha a aba (`-closeURLTab:withCompleteHandler:`, `0x1000044ac`) e abre `blockToURL` (`-openURLTab:withCompleteHandler:`, `0x10000462c`).

### 2.6 Gerenciador de Autorização TCC dos Navegadores (`ACBrowserAuthManager` & `ACBrowserAuthPanel`)

Introduzido/expandido na versão `7.11.0` para gerenciar permissões `Privacy_Automation`:
- `+[ACBrowserAuthManager sharedManager]` (`0x10003b97c`) mantém a lista dos 10 navegadores suportados (`-allSupportedBrowserBundleIDs`, `0x10003bd10`) com cores e ícones (`-colorHexForBundleID:`, `0x10003ceb0`).
- `-queryAuthStatusForBundleID:` (`0x10003bfbc`) chama a API C `AEDeterminePermissionToAutomateTarget` do `CoreServices.framework`.
- Quando o usuário clica em "Authorize" no `ACBrowserAuthPanel` (`-onAuthorizeBrowser:`, `0x10004039c`):
  - Chama `-[ACBrowserAuthManager requestAuthForBundleID:]` (`0x10003c5fc`).
  - Se o navegador não estiver aberto, lança-o silenciosamente via `/usr/bin/open -a <bundle> --args --no-startup-window` para que o daemon `appleeventsd` / `tccd` possa exibir o diálogo de permissão do macOS.
  - Inicia um timer de alta frequência (`-startHighFreqTimerForBundleID:`, `0x10003c7e0` → `-highFreqTick`, `0x10003c8a8`) que consulta o status TCC até detectar concessão (`"BrowserAuth: high-freq poll — %@ granted, stopping timer"`).
- Também mantém um `-startGlobalHeartbeat` (`0x10003cc74`) em background durante toda a vida útil do app.

---

## Módulo 3: `schedule-engine` (Motor de Agendamento Temporal)

### 3.1 Classes e Modelo de Dados

| Classe | Superclasse | Tamanho | Responsabilidade | Confiança |
|---|---|---|---|---|
| `ACScheduleGroup` | `NSObject <NSSecureCoding>` | `16 bytes` | Coleção de `ACScheduleUnit` (`_scheduleUnits`). Método crítico: `-nowInSchedule` (`0x10001241c`). | 🟢 CONFIRMADO |
| `ACScheduleUnit` | `NSObject <NSSecureCoding>` | `37 bytes` | Regra de horário individual com `_startTimer` (`NSDate`), `_endTimer` (`NSDate`), `_repeatMask` (`uint64_t`) e `_profile` (`int`). Método crítico: `-nowInSchedule` (`0x10001bf10`). | 🟢 CONFIRMADO |
| `ACScheduleMgrWndControl` | `NSWindowController` | `40 bytes` | Janela de configuração de agendamento para um `ACMonitorItem` específico (`monitorItem.useSelfSchedule`) ou global. | 🟢 CONFIRMADO |
| `ACScheduleViewCtrl` | `NSViewController` | `56 bytes` | View controller com `NSCollectionView` (`_schedulCollectionView`) exibindo os cards de `ACScheduleUnit`. | 🟢 CONFIRMADO |

### 3.2 Algoritmo de Avaliação de Horário (`-nowInSchedule` e `-monitorItemScheduleAvailable:`)

1. **Hierarquia de Agendamento (`-[ACMonitorTask monitorItemScheduleAvailable:]` em `0x100009730`)**:
   - Se o `ACMonitorItem` possui `useSelfSchedule == YES`: avalia `item.scheduleGroup.nowInSchedule`.
   - Caso contrário, se `preferences.enableSchedule == YES`: avalia o agendamento global `preferences.scheduleGroupToAll.nowInSchedule`.
   - **Semântica de Restrição**: conforme `Localizable.strings` (`AC_TS_MiniNote`: *"The schedule is used to set the time when the restriction will be lifted"* / ou aplicado conforme o estado do item), `-[ACScheduleGroup nowInSchedule]` (`0x10001241c`) itera sobre `_scheduleUnits` e retorna `YES` se qualquer `ACScheduleUnit` retornar `YES` em `-[ACScheduleUnit nowInSchedule]` (`0x10001bf10`).
2. **Máscara de Bits de Dias da Semana (`_repeatMask` em `ACScheduleUnit`)**:
   - Propriedades booleanas computadas por bitmask (`repeatMonday` a `repeatSunday`, `repeatWorkingday`, `repeatWeekend`, `repeatEveryDay`) nos endereços `0x10001c0dc`–`0x10001c3e4`.
   - `-ignoreDateComponents:` (`0x10001bbf0`) e `-setupDateWithHour:minute:` (`0x10001bc94`) normalizam `startTimer` e `endTimer` para comparar apenas `hour` e `minute` do `NSCalendar` atual contra o horário do sistema, validando se `startTimer < endTimer` em `-validSchedule` (`0x10001c918`).

---

## Módulo 4: `security-and-persistence` (Segurança, Senha, Persistência Camuflada e Webcam)

### 4.1 Gerenciamento de Senha (`ACPasswordMgr` & `ACKeychain`)

- Singleton `+[ACPasswordMgr sharedPasswordMgr]` (`0x100036f08`).
- Armazena o hash MD5 da senha mestra (`-passwordMD5Value` em `0x10003700c`, `-setPasswordMD5Value:` em `0x1000371f8`) em cache em memória (`_passwordMemoryStore`) e persiste no Keychain do macOS via `ACKeychain` (`+[ACKeychain setPassword:forService:account:error:]` em `0x100006334`) usando o serviço `com.cisdem.keychain` (`+[ACPasswordMgr serviceName]` em `0x100036efc`).
- **Fallback Resiliente**: se a escrita no Keychain falhar (`"Password MD5: keychain write failed, fallback to UserDefaults"`), grava em `NSUserDefaults` (`ACSavePInKeychain`).

### 4.2 Persistência Camuflada em Dois Locais (`ACPreferences`)

Para evitar que usuários comuns encontrem e apaguem a lista de bloqueios em `~/Library/Application Support/Cisdem AppCrypt/`, `ACPreferences` usa caminhos disfarçados como componentes da Apple:
- **Arquivo Primário (`+preferencesPathFileURL` em `0x10000f11c`)**:
  `~/Library/Application Support/com.apple.sdev/csdv.dsc`
- **Arquivo de Backup (`+backupFilePreferencesURL` em `0x10000f3a4`)**:
  `~/Library/Application Support/com.app.cadlvq/dgh.xvc`
- Ambos são arquivos **Apple Binary Property List** gerados por `NSKeyedArchiver` (`NSSecureCoding`) serializando o grafo completo:
  - `ACPreferences` → `ACMonitorItemsMgr` (`_blackMonitorApps`, `_whiteMonitorApps`, `_monitorWebsites`, `_blackWebsites`, `_whiteWebsites`, `_blackWebsiteLists`, `_writeWebsiteLists`) → `ACMonitorItem` → `ACScheduleGroup` → `ACScheduleUnit`.
- Sempre que `-savePreferences` (`0x1000100bc`) roda, `-backUpSave` (`0x10000f418`) sincroniza a cópia em `com.app.cadlvq/dgh.xvc`. Se o carregamento primário (`+loadPreferences` em `0x10000f574`) falhar, `+restoreBackup` (`0x10000f500`) restaura automaticamente o arquivo de `dgh.xvc`.

### 4.3 Captura de Foto de Intrusos (`ACCapturePhoto` & `ACLogRecordMgr`)

- Quando o usuário erra a senha em `ACPWDInputWndCtrl` e `preferences.capturePhotoWhenFailedAttempt == YES`:
  - `+[ACCapturePhoto sharedCapturePhoto]` (`0x1000457bc`) verifica `-canAccessCamera` (`0x10004598c`), configura `AVCaptureSession` (`AVCaptureSessionPresetPhoto`) com `AVCaptureDeviceInput` (`AVMediaTypeVideo`) e `AVCaptureStillImageOutput` (`-configureCaptureSession`, `0x100045994`).
  - Captura o frame em `-captureImageWithCompleteHandler:` (`0x100045b94`).
  - Instancia `-[ACLogRecord initWithTitle:message:imageData:]` (`0x1000435ac`) e adiciona ao `+[ACLogRecordMgr sharedLogRecordMgr]` (`0x100006c00`), que salva via `NSKeyedArchiver` em `~/Library/Application Support/Cisdem AppCrypt/appcrypt.aclog` (`+defaultLogPathFile`, `0x100006c70`).

---

## Módulo 5: `self-defense-and-lifecycle` (Autodefesa, FSEvents e Ciclo de Vida)

### 5.1 Autodefesa contra Exclusão do `.app` (`ACMonitorAppSelf` & `ACFileSystemEventMonitor`)

- Singleton `+[ACMonitorAppSelf sharedMonitorSelf]` (`0x10002d224`).
- No boot do app (`Creating app backup`), `-backupAppSelf` (`0x10002d6b4`) executa `/usr/bin/tar -czf <backupPath>/tgz.gz` do próprio pacote `/Applications/Cisdem AppCrypt.app` via `NSTask`.
- Inicia `ACFileSystemEventMonitor` (`-initWithMonitorURL:` em `0x1000454b0`), que registra um stream `FSEventStreamCreate` do macOS observando `/Applications/Cisdem AppCrypt.app`.
- Se o usuário mover ou apagar o `.app` do Finder, o callback `-eventSystemCallback:eventPaths:eventFlags:eventId:` (`0x10004563c`) aciona `-[ACMonitorAppSelf fileSystemMonitorURLs:didChanged:]` (`0x10002e1a8`), que extrai o backup via `/usr/bin/tar -xvf` e relança o app restaurado (`-restoreAppSelf` em `0x10002e028` / `-launchRestoreApp` em `0x10002da20`)!

### 5.2 Proteção de Apps de Segurança do macOS (`ACPreferences` & `ACAlertRemoveDefAppWndCtrl`)

- Na primeira execução (`firstLaunch == YES`), `+defaultMonitorAppNames` (`0x10000fad8`) e `+defaultMonitorAppBundleID` (`0x10000fa94`) pré-adicionam à lista de bloqueio:
  - `com.apple.ActivityMonitor` (`Activity Monitor.app`)
  - `com.apple.Terminal` (`Terminal.app`)
  - `com.apple.systempreferences` (`System Preferences.app` / `System Settings.app`)
- Isso impede que um usuário sem a senha mestra mate o processo `Cisdem AppCrypt` pelo Monitor de Atividade ou Terminal, ou revogue permissões TCC nas Configurações do Sistema.

### 5.3 Persistência de Login (`ACLoginStart`)

- `+launchFilePath` (`0x10002fb0c`) gerencia `~/Library/LaunchAgents/com.cisdem.appencrypt.plist`.
- Quando `automaticallyStartWithSystem == YES`, grava o plist com `RunAtLoad = true` e `ProgramArguments = ["/Applications/Cisdem AppCrypt.app/Contents/MacOS/Cisdem AppCrypt", "-runMode", "autoLaunched"]`.
- Quando iniciado com `-runMode autoLaunched`, o app entra diretamente em background na barra de menus (`LSUIElement = true`) com o monitoramento ativo (`Monitor activated`), sem abrir a janela principal.
