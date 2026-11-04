# Unit: `self-defense-and-lifecycle` — Requisitos Operacionais

## Visão Geral
Subsistema responsável pela autodefesa contra desinstalação não autorizada (`ACMonitorAppSelf`, `ACFileSystemEventMonitor`), persistência de inicialização no login do macOS (`ACLaunchAgent`, `~/Library/LaunchAgents/com.cisdem.appencrypt.plist`), atalhos globais de teclado (`MASShortcutMonitor`, `ACShortcutBinder`), gerenciamento do ícone da barra de menus (`ACStatusItemManager`, `LSUIElement = true`) e ativação/atualização do produto (`Paddle.framework`, `PaddleWrapper`, `Sparkle.framework`).

## Responsabilidades
- Criar automaticamente uma cópia compactada (`.tgz.gz`) do próprio bundle `/Applications/Cisdem AppCrypt.app` via `/usr/bin/tar -czf` na inicialização (`-[ACMonitorAppSelf backupApp]`).
- Monitorar eventos de sistema de arquivos sobre o diretório do aplicativo via `FSEventStreamCreate` (`ACFileSystemEventMonitor`) e restaurar o bundle imediatamente via `/usr/bin/tar -xvf` caso seja movido para o Lixo ou apagado (`-[ACMonitorAppSelf restoreApp]`).
- Gerenciar o plist do LaunchAgent (`~/Library/LaunchAgents/com.cisdem.appencrypt.plist`) para garantir início automático na sessão gráfica (`RunAtLoad = true`).
- Operar como agente de barra de menus sem ícone no Dock (`LSUIElement = true`) e exigir a senha mestra antes de permitir `Quit`, `Disable` ou ocultação do ícone.

## Regras de Negócio
- **Auto-Restauração do Bundle (`ACMonitorAppSelf`, `0x10002d068`–`0x10002d5c4`):** Enquanto o processo `Cisdem AppCrypt` estiver vivo em memória, se o usuário arrastar `/Applications/Cisdem AppCrypt.app` para o Lixo no Finder, o callback de `FSEventStream` detecta a remoção e extrai o backup `.tgz.gz` de volta para `/Applications/Cisdem AppCrypt.app`. 🟢 CONFIRMADO
- **Proteção de Saída (`AppDelegate applicationShouldTerminate:`, `0x1000037b0`):** O aplicativo intercepta pedidos de encerramento (`Cmd+Q` ou menu Quit) e exibe `ACPasswordPanel` exigindo a senha mestra antes de encerrar. 🟢 CONFIRMADO
- **Modo Stealth (`LSUIElement = true` + `ACStatusItemManager`):** Não aparece no Dock nem no `Cmd+Tab`; o ícone da barra de menus pode ser ocultado pelo usuário e reaberto via atalho global (`MASShortcut`). 🟢 CONFIRMADO

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|---|---|---|---|
| RF-DEF-01 | Compactar o bundle `.app` em `.tgz.gz` via `/usr/bin/tar -czf` ao iniciar o monitoramento (`-[ACMonitorAppSelf startMonitor]`). | Must | Gerar arquivo `.tgz.gz` íntegro contendo `Cisdem AppCrypt.app`. |
| RF-DEF-02 | Monitorar o caminho do `.app` via `FSEventStreamCreate` (`ACFileSystemEventMonitor`) e executar `/usr/bin/tar -xvf` se o bundle desaparecer. | Must | Recriar `/Applications/Cisdem AppCrypt.app` automaticamente quando deletado com o app em execução. |
| RF-DEF-03 | Criar/remover `~/Library/LaunchAgents/com.cisdem.appencrypt.plist` conforme a preferência `autoLaunch`. | Must | Iniciar o aplicativo automaticamente no login do usuário com argumento `-autoLaunch`. |
| RF-DEF-04 | Registrar e disparar atalhos globais Carbon (`RegisterEventHotKey` via `MASShortcut`) para abrir a janela principal ou ocultar/exibir o menu bar icon. | Should | Responder ao atalho global mesmo quando outro aplicativo está em foco. |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|---|---|---|---|
| Baixo Overhead de Monitoramento | Uso de `FSEventStream` nativo do kernel Darwin (`CoreServices`) em vez de polling de disco para vigiar o próprio `.app`. | `ACFileSystemEventMonitor:0x10001e994` | 🟢 |

## Critérios de Aceitação

```gherkin
Dado que o Cisdem AppCrypt está em execução e monitorando a si mesmo (ACMonitorAppSelf)
Quando o usuário move "/Applications/Cisdem AppCrypt.app" para a Lixeira sem encerrar o processo
Então o ACFileSystemEventMonitor dispara o callback e ACMonitorAppSelf executa "/usr/bin/tar -xvf" restaurando o .app em "/Applications"
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|---|---|---|
| `ACLaunchAgent` + Senha no `Quit` + `LSUIElement` | Must | Persistência básica de execução entre sessões |
| `ACMonitorAppSelf` (`FSEvents` + `tar`) | Should | Impede bypass simples por exclusão do `.app` no Finder |
| `MASShortcut` + `Paddle` / `Sparkle` | Could | Usabilidade de atalho global e ciclo comercial |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---|---|---|
| `Contents/MacOS/Cisdem AppCrypt` | `ACMonitorAppSelf` (`0x10002d068`–`0x10002d600`) | 🟢 |
| `Contents/MacOS/Cisdem AppCrypt` | `ACFileSystemEventMonitor` (`0x10001e994`–`0x10001f050`) | 🟢 |
| `Contents/MacOS/Cisdem AppCrypt` | `ACLaunchAgent` (`0x10002247c`–`0x100022a00`) | 🟢 |
| `Contents/MacOS/Cisdem AppCrypt` | `ACStatusItemManager` (`0x10001d194`–`0x10001d650`) & `AppDelegate` (`0x1000026b0`–`0x100004500`) | 🟢 |
