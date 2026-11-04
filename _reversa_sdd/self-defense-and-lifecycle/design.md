# Unit: `self-defense-and-lifecycle`, Design Técnico

## Interface

| Símbolo Objective-C | Assinatura | Retorno | Observação |
|---|---|---|---|
| `-[ACMonitorAppSelf startMonitor]` / `-stopMonitor` | `()` | `void` | Faz backup `.tgz.gz` e inicia `ACFileSystemEventMonitor` (`0x10002d0d4`) |
| `-[ACMonitorAppSelf backupApp]` | `()` | `void` | Executa `/usr/bin/tar -czf <backup.tgz.gz> -C <parentDir> <appName>` (`0x10002d1d8`) |
| `-[ACMonitorAppSelf restoreApp]` | `()` | `void` | Executa `/usr/bin/tar -xvf <backup.tgz.gz> -C <parentDir>` (`0x10002d394`) |
| `-[ACFileSystemEventMonitor startMonitor]` | `()` | `void` | Cria `FSEventStreamCreate` + `FSEventStreamScheduleWithRunLoop` (`0x10001eb20`) |
| `+[ACLaunchAgent addLaunchAgent]` / `+removeLaunchAgent` | `()` | `BOOL` | Grava/remove `~/Library/LaunchAgents/com.cisdem.appencrypt.plist` (`0x100022550`) |
| `-[ACStatusItemManager showStatusItem]` / `-hideStatusItem` | `()` | `void` | Controla `NSStatusItem` na barra de menus (`0x10001d280`) |

## Fluxo Principal
1. **Inicialização (`-[AppDelegate applicationDidFinishLaunching:]`, `0x1000029d8`):**
   - Inicializa `ACLog`, carrega `ACPreferences`, configura `ACLaunchAgent` (se `autoLaunch == YES`), registra atalhos globais via `ACShortcutBinder` (`MASShortcutMonitor`) e inicia `ACMonitorTask`.
   - Cria e inicia `ACMonitorAppSelf`.
2. **Backup Preventivo (`-[ACMonitorAppSelf backupApp]`):**
   - Localiza `[[NSBundle mainBundle] bundlePath]` (ex.: `/Applications/Cisdem AppCrypt.app`).
   - Invoca `NSTask` com `/usr/bin/tar` e argumentos `["-czf", backupPath, "-C", parentDir, bundleName]` gerando o arquivo `.tgz.gz`.
3. **Vigilância e Auto-Cura (`ACFileSystemEventMonitor` → `ACMonitorAppSelf`):**
   - `ACFileSystemEventMonitor` registra um `FSEventStreamRef` observando o caminho do bundle.
   - A cada evento de modificação/remoção na árvore, verifica `[[NSFileManager defaultManager] fileExistsAtPath:bundlePath]`.
   - Se retornar `NO`, `-[ACMonitorAppSelf restoreApp]` invoca `NSTask` com `/usr/bin/tar` e argumentos `["-xvf", backupPath, "-C", parentDir]`, restaurando o `.app` em segundos.

## Fluxos Alternativos
- **Desinstalação Legítima pelo Menu (`AppDelegate uninstall:`, `0x100003d14`):** Quando o usuário autentica com a senha mestra e aciona a opção oficial de desinstalação/saída, `ACMonitorAppSelf` para o `FSEventStream` e remove o `.tgz.gz` temporário antes de encerrar.

## Dependências
- Frameworks embutidos (`@rpath`):
  - `MASShortcut.framework` (`RegisterEventHotKey` Carbon API)
  - `Paddle.framework` (v4.4.3, licenciamento/trial)
  - `Sparkle.framework` (`SUUpdater`, atualizações OTA)
- Binários externos do macOS: `/usr/bin/tar`.

## Decisões de Design Identificadas

| Decisão | Evidência no código | Confiança |
|---|---|---|
| Auto-cura em espaço de usuário (`FSEvents` + `/usr/bin/tar`) sem exigir Kernel Extension (Kext) ou System Extension (`EndpointSecurity`) nem privilégio `root`. | `ACMonitorAppSelf:0x10002d1d8`; fonte bruta não preservada, revalidar | 🟡 |
| Execução como agente (`LSUIElement = true`) para ocultar presença no Dock e dificultar Force Quit por usuários leigos. | `Contents/Info.plist:31-32` | 🟢 |

## Estado Interno
- `ACMonitorAppSelf._fsEventMonitor` (`ACFileSystemEventMonitor *`, offset `+8`)
- `ACMonitorAppSelf._backupPath` (`NSString *`, offset `+16`): caminho do arquivo `.tgz.gz`.

## Observabilidade
- Eventos de ciclo de vida e licenciamento registrados via `ACLog` em `~/Library/Application Support/Cisdem AppCrypt/log/`.

## Riscos e Lacunas
- 🟢 Confirmado: Como o AppCrypt roda como processo de usuário comum (sem daemon `root` nem `EndpointSecurity`), encerrar o processo via `kill -9 <PID>` (ou Monitor de Atividade, caso o Monitor de Atividade e o Terminal não estejam na lista de apps bloqueados) interrompe o `ACMonitorAppSelf` antes da remoção do `.app`.
