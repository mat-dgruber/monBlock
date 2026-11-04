# Unit: `app-lock-engine`, Design Técnico

## Interface

| Símbolo Objective-C | Assinatura | Retorno | Observação |
|---|---|---|---|
| `+[ACMonitorTask sharedMonitorTask]` | `()` | `ACMonitorTask *` | Singleton global (`0x100009084`) |
| `-[ACMonitorTask appIsBlock:]` | `(ACRunningApp *app)` | `BOOL` | Avalia se `app` deve ser bloqueado (`0x100009b04`) |
| `-[ACMonitorTask appItemBlock:isBlackMode:app:]` | `(ACMonitorItem *item, BOOL isBlack, ACRunningApp *app)` | `BOOL` | Avalia regra Blacklist/Allowlist + Schedule (`0x1000097d4`) |
| `-[ACMonitorTask requireActiveApp:withTimeInterval:launched:]` | `(ACRunningApp *app, double interval, BOOL launched)` | `void` | Aplica máscara, oculta app e abre `ACPWDInputWndCtrl` (`0x10000a900`) |
| `-[ACRunningApp maskAllWindows:]` | `(NSArray<ACWindowInfo *> *wndList)` | `void` | Cria `ACMaskWndControl` sobre cada janela (`0x100002bd0`) |
| `-[ACRunningApp hideWithoutNotification]` | `()` | `void` | Seta `_notRespondActiveNotification = YES` e oculta app (`0x100003524`) |
| `-[ACRunningApp terminateWithoutNotification]` | `()` | `void` | Encerra processo via `NSRunningApplication` ou `osascript` (`0x100003a68`) |
| `-[ACWindowServer windowOnScreenForProccessorWithID:]` | `(pid_t pid)` | `NSArray<ACWindowInfo *> *` | Filtra `CGWindowListCopyWindowInfo` por `kCGWindowOwnerPID` (`0x100019e34`) |

## Fluxo Principal
1. `ACRunningAppsMgr` observa `[NSWorkspace sharedWorkspace].runningApplications` e cria um `ACRunningApp` para cada processo.
2. `ACRunningApp` registra KVO nas chaves `"active"` e `"hidden"` do `NSRunningApplication`.
3. Quando o app ganha foco ou é lançado, `ACMonitorTask` executa `-appIsBlock:`.
4. Se bloqueado e `app.granted == NO`, `-requireActiveApp:withTimeInterval:launched:` obtém as janelas visíveis via `ACWindowServer`, aplica máscara `ACMaskWndControl` (`CIGaussianBlur`), oculta o app e exibe `ACPWDInputWndCtrl`.
5. Se a senha mestra for validada por `ACPasswordMgr`, `app.granted` passa a `YES`, as máscaras são removidas (`-removeAllMaskWindows`) e o app é reativado (`-activateWithoutNotification`).

## Fluxos Alternativos
- **Utilitário sem ícone no Dock:** `-hasWindowsButNotInDock:` (`0x100004828`) verifica se um processo com `activationPolicy != Regular` possui janelas em `ACWindowServer`.
- **Recusa ou Cancelamento de Senha:** Registra `"Auth denied for: %@, action: %@"` e executa `hide` ou `terminate` (com fallback `osascript -e 'tell application "..." quit'`).

## Dependências
- `schedule-engine`: chamado via `-[ACMonitorTask monitorItemScheduleAvailable:]` (`0x100009730`; endereço e modelo de agenda em conflito com `0x100009b70` descrito em `schedule-engine/`, não reconciliados, ver `../gaps.md` e TT-SCH-03).
- `security-and-persistence`: lê listas de `ACMonitorItemsMgr`, valida senha em `ACPasswordMgr` e dispara `ACCapturePhoto`.

## Decisões de Design Identificadas

| Decisão | Evidência no código | Confiança |
|---|---|---|
| Guard flag `_notRespondActiveNotification` para evitar loop infinito de KVO ao ocultar/ativar o app. | `ACRunningApp` ivar offset `+16` (`0x100003524`) | 🟢 |
| Medição de ociosidade do sistema no nível de driver HID via IOKit (`IOHIDSystem` → `HIDIdleTime`). | `ACPreferences:0x100010dd0` + string `HIDIdleTime` | 🟢 |

## Estado Interno
- `ACRunningApp.granted` (`BOOL`, offset `+56`): controla se o app já foi autenticado na sessão atual.
- Timers por processo em `ACRunningApp`: `_resignTimer` (`+40`), `_mskWndTimer` (`+48`), `_hiddenTimer` (`+64`) e `_terminateTimer` (`+72`).

## Observabilidade
- Logs emitidos em `~/Library/Application Support/Cisdem AppCrypt/log/*.log`:
  - `"Auth required for app: %@ (launched: %@)"`
  - `"Lock screen triggered by: %@"`
  - `"Auth granted for: %@"`
  - `"Auth denied for: %@, action: %@"`
  - `"System going to sleep, refreshing blocked apps"`

## Riscos e Lacunas
- 🟡 Sem permissão de Screen Recording no macOS 15+, `CGWindowListCreateImage` captura apenas o papel de parede sob a máscara borrada (embora as dimensões `CGRect` da janela continuem exatas).
