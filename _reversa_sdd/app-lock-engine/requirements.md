# Unit: `app-lock-engine` — Requisitos Operacionais

## Visão Geral
Subsistema responsável por monitorar em tempo real os aplicativos em execução no macOS, interceptar a abertura ou ativação de aplicativos bloqueados (em modo Blocklist ou Allowlist), sobrepor máscaras de desfoque (`CIGaussianBlur`) sobre suas janelas, ocultar/encerrar processos não autorizados e gerenciar a expiração automática da sessão desbloqueada (`granted`).

## Responsabilidades
- Monitorar continuamente processos ativos e recém-lançados via `NSWorkspace` e KVO (`ACRunningAppsMgr`, `ACRunningApp`).
- Localizar janelas em tela no WindowServer por PID (`ACWindowServer`) e aplicar máscara borrada (`ACMaskWndControl`).
- Ocultar (`hide`) ou encerrar (`terminate` / `osascript`) aplicativos bloqueados quando a senha mestra não for fornecida.
- Revogar automaticamente sessões desbloqueadas após perda de foco (`_resignTimer`), ociosidade do Mac (`IOHIDSystem` `HIDIdleTime`) ou entrada em repouso (`NSWorkspaceWillSleepNotification`).

## Regras de Negócio
- `com.apple.finder` e `loginwindow` jamais podem ser bloqueados (`-[ACRunningApp canManagerApp]`). 🟢
- Um aplicativo monitorado é identificado por `bundleIdentifier`, `bundleURL` ou `executableURL`. 🟢
- Em modo Blocklist (`appBlackRule == YES`), apenas aplicativos em `_blackMonitorApps` são bloqueados; em modo Allowlist (`appBlackRule == NO`), todos os aplicativos exceto `_whiteMonitorApps` são bloqueados. 🟢
- Ao entrar em sleep (`NSWorkspaceWillSleepNotification`), todos os aplicativos com `granted == YES` voltam para `granted == NO`. 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|---|---|---|---|
| RF-APP-01 | Detectar lançamento e ativação de aplicativos via `NSWorkspace` e KVO em `active`/`hidden`. | Must | Alvo: interceptar ativações de apps na Blocklist antes da interação do usuário (cobertura real não medida; sujeita a janela de corrida de KVO/polling). |
| RF-APP-02 | Mascarar todas as janelas visíveis do PID bloqueado com `CIGaussianBlur` ou imagem customizada. | Must | `CGWindowListCopyWindowInfo` localiza `CGRect` da janela e posiciona `ACMaskWindow` sobre ela. |
| RF-APP-03 | Exibir `ACPWDInputWndCtrl` e liberar o app (`granted = YES`) somente mediante senha mestra válida. | Must | Senha correta remove máscaras e foca o app; falha mantém bloqueio e aciona ocultação/término. |
| RF-APP-04 | Relockar automaticamente após `authorityRetainInterval` minutos sem foco (`enableAutoLockDeactivated`). | Should | `_resignTimer` reverte `granted` para `NO` após o intervalo configurado. |
| RF-APP-05 | Relockar todos os apps após `computerNoActivityInterval` minutos de ociosidade (`HIDIdleTime`). | Should | Consulta `IOHIDSystem` e chama `-[ACMonitorTask refreshAllBlockApp]`. |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|---|---|---|---|
| Performance | Detecção orientada a eventos (KVO + `NSWorkspace` notifications) sem polling de processos. | `ACRunningAppsMgr:0x10004ea44` | 🟢 |
| Resiliência | Fallback via `osascript -e 'tell application "..." quit'` caso `[NSRunningApplication terminate]` falhe. | `ACRunningApp:0x100003a68` | 🟢 |
| Segurança | Revogação imediata de sessões autorizadas ao suspender o Mac (`NSWorkspaceWillSleepNotification`). | `ACMonitorTask:0x100009250` | 🟢 |

## Critérios de Aceitação

```gherkin
Dado que o aplicativo "System Settings" está na Blocklist e possui granted = NO
Quando o usuário tenta abrir ou focar "System Settings"
Então o AppCrypt sobrepõe ACMaskWindow borrada, oculta o app e exibe ACPWDInputWndCtrl

Dado que um aplicativo bloqueado foi desbloqueado com a senha correta (granted = YES)
Quando o usuário desativa a janela do app por mais de authorityRetainInterval minutos (ou o Mac entra em sleep)
Então o estado granted retorna para NO e o próximo acesso exige senha novamente
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|---|---|---|
| Interceptação KVO + Ocultação + Prompt de Senha | Must | Fluxo central do produto App Lock |
| Máscara visual `CIGaussianBlur` por janela (`ACWindowServer`) | Must | Impede leitura visual do conteúdo do app antes do `hide` completar |
| Auto-lock por inatividade (`HIDIdleTime`), perda de foco e sleep | Should | Fecha brecha de segurança de sessões esquecidas abertas |
| Fallback de encerramento via `osascript` | Could | Acionado apenas quando `NSRunningApplication.terminate` é ignorado |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---|---|---|
| `Contents/MacOS/Cisdem AppCrypt` | `ACMonitorTask` (`0x100009084`–`0x10000ac18`) | 🟢 |
| `Contents/MacOS/Cisdem AppCrypt` | `ACRunningAppsMgr` (`0x10004e9c0`–`0x10004f614`) | 🟢 |
| `Contents/MacOS/Cisdem AppCrypt` | `ACRunningApp` (`0x100001dd0`–`0x100004c74`) | 🟢 |
| `Contents/MacOS/Cisdem AppCrypt` | `ACWindowServer` (`0x100019d5c`–`0x100019e34`) | 🟢 |
| `Contents/MacOS/Cisdem AppCrypt` | `ACMaskWndControl` (`0x1000492f0`–`0x100049688`) | 🟢 |
