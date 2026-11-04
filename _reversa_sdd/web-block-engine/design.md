# Unit: `web-block-engine`, Design Técnico

## Interface

| Símbolo Objective-C | Assinatura | Retorno | Observação |
|---|---|---|---|
| `+[ACMonitorBrowser monitorBrowserWithIdentifier:]` | `(NSString *bundleID)` | `ACMonitorBrowser *` | Factory polimórfica para os 10 navegadores (`0x1000392d0`) |
| `-[ACMonitorBrowser startMonitor]` / `-stopMonitor` | `()` | `void` | Inicia/para `_monitorTimer` (`0x1000395b8` / `0x1000397ac`) |
| `-[ACMonitorBrowser getActiveURLsWithCompleteHandler:]` | `(void(^)(NSArray<NSURL *> *))` | `void` | Lê URL da aba ativa de cada janela (`0x10003a224`) |
| `-[ACMonitorBrowser redirectURL:toURL:withCompleteHandler:]` | `(NSURL *src, NSURL *dst, void(^)(BOOL))` | `void` | Redireciona aba correspondente para `dst` (`0x10003a564`) |
| `-[ACScriptHelper excuteScript:withCompleteHandler:]` | `(NSString *src, void(^)(NSAppleEventDescriptor *, NSError *))` | `void` | Executa `NSAppleScript` na fila `queueForScriptExcute` (`0x100041ab4`) |
| `-[ACMonitorTask websiteIsBlock:]` | `(NSURL *url)` | `BOOL` | Avalia se a URL deve ser bloqueada (`0x1000098d0`) |
| `-[ACMonitorItemsMgr matchKeywordItem:withURL:]` | `(ACMonitorItem *item, NSURL *url)` | `BOOL` | Avalia keyword simples ou combinada por vírgula (`0x10000d868`) |
| `-[ACBrowserAuthManager queryAuthStatusForBundleID:]` | `(NSString *bundleID)` | `int` | Chama `AEDeterminePermissionToAutomateTarget` (`0x10003bfbc`) |

## Fluxo Principal
1. Quando um navegador suportado é iniciado (`ACRunningApp.webBrowserApp == YES`), `ACRunningApp` cria o `ACMonitorBrowser` específico via `+monitorBrowserWithIdentifier:` e chama `-startMonitor`.
2. A cada disparo de `_monitorTimer`, `-getActiveURLsWithCompleteHandler:` monta o script AppleScript (`-appleScriptForGetActiveURLs`) e o submete ao `ACScriptHelper`.
3. `ACScriptHelper` executa o script na fila serial `queueForScriptExcute` e devolve o `NSAppleEventDescriptor`, que é convertido em `NSArray<NSURL *> *` por `-parseGetActiveURLsAppleEvent:withError:`.
4. `ACMonitorTask` recebe as URLs em `-runningAppsMgr:application:didOpenURLs:` e avalia `-websiteIsBlock:` para cada uma.
5. Se bloqueada, chama `-[ACRunningApp redirectURL:toURL:withCompleteHandler:]` apontando para `-[ACMonitorTask blockToURL]` (`https://www.cisdem.com/blocked-website.html` ou URL customizada).

## Fluxos Alternativos
- **Falha no Redirecionamento In-Place:** Se `redirectURL:toURL:` falhar (`"Failed to redirect URL %@"`), executa `-closeURLTab:withCompleteHandler:` seguido de `-openURLTab:withCompleteHandler:` abrindo `blockToURL`.
- **Permissão TCC Negada (`errAEEventNotPermitted` `-1743`):** `ACPermissionAlertHelper` (`-handlePermissionDeniedForName:bundleID:` em `0x10003aa2c`) ou `ACBrowserAuthPanel` orienta o usuário a habilitar a permissão em `x-apple.systempreferences:com.apple.preference.security?Privacy_Automation`.

## Dependências
- `schedule-engine`: verifica janela de horário via `-[ACMonitorTask monitorItemScheduleAvailable:]`.
- `security-and-persistence`: lê listas `_monitorWebsites`, `_blackWebsites`, `_whiteWebsites`, `blockAll` e `redirectionURL`.

## Decisões de Design Identificadas

| Decisão | Evidência no código | Confiança |
|---|---|---|
| Dialetos AppleScript especializados por família de navegador (Chromium `active tab`, Safari `current tab` + `close_list`, Arc/Dia `count of tabs of window w`). | `ACMonitorSafariBrowser:0x100041250`, `ACMonitorArcBrowser:0x10004a27c` | 🟢 |
| Lançamento silencioso do navegador com `/usr/bin/open --args --no-startup-window` ao solicitar permissão TCC no `ACBrowserAuthManager`. | `ACBrowserAuthManager:0x10003c5fc`; descrição também em [`../code-analysis.md`](../code-analysis.md). Fonte bruta anterior não preservada; argumentos exatos pendentes de revalidação. | 🟡 |

## Estado Interno
- `ACScriptHelper._lastScriptExcuteDate` (`NSDate *`, offset `+8`): timestamp da última execução AppleScript.
- `ACBrowserAuthManager._authCache` (`NSMutableDictionary *`, offset `+8`): estado TCC por Bundle ID persistido em `NSUserDefaults` (`AC_BrowserAuthCache`).

## Observabilidade
- Logs operacionais:
  - `"Failed to redirect URL %@"` / `"Failed to close URL %@"` / `"Failed to open block URL %@"`
  - `"BrowserAuth: requesting authorization for %@"`
  - `"BrowserAuth: high-freq poll — %@ granted, stopping timer"`

## Riscos e Lacunas
- 🟢 Confirmado no binário: `ACMonitorFirfoxBrowser` (`org.mozilla.firefox`) não implementa método próprio de leitura de URL e herda o script AppleScript do Chromium, que não é suportado pelo Firefox no macOS.
