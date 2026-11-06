# Watcher fora do app Electron — spec de design (futuro)

- Data: 2026-11-06 · Status: **rascunho para o futuro; sem implementação prevista agora.**
- Motivação: hoje o watcher (camada 3: palavras-chave e redirecionamento para a página de bloqueio) roda dentro do app Electron (`src/main/main.ts`). Com o app fechado, o DNS e a política dos navegadores continuam (vêm do daemon root), mas **palavras-chave e redirecionamento deixam de valer**. Confirmado em campo (2026-11-06): no Chrome e no Dia a aba é redirecionada com o app aberto.

## Por que não no daemon
O `monblockd` roda como root e não controla o navegador do usuário: Apple Events dependem da sessão gráfica e da permissão de Automação (TCC) do processo responsável. O daemon não consegue.

## Alternativas
| | A (LaunchAgent próprio) | B (manter no app, abrir no login) | C (extensão de navegador) |
| :-- | :-- | :-- | :-- |
| O quê | binário pequeno em `~/Library/LaunchAgents`, `gui/<uid>`, com o mesmo `MacOSBrowserWatcher` | app inicia no login e fica só na tray | extensão por navegador, lê a URL sem AppleScript |
| Custo | médio: novo executável, instalação, TCC para o agente | baixo: `app.setLoginItemSettings` | alto: uma por navegador, publicação/aprovação |
| Risco | permissão de Automação concedida ao agente (novo `com.ccat.monblock.watcher`); a assinatura ad-hoc invalida a permissão a cada build | quem sai do app perde a camada 3 | cobre Firefox e Safari melhor, mas fora do modelo atual |
| Recomendação | **A**, após B como passo intermediário | **B primeiro** (um dia de trabalho) | só se Firefox/Safari forem prioridade |

## Pontos a decidir antes de implementar
- Identidade e permissão: o agente precisa de bundle id próprio, `NSAppleEventsUsageDescription` e assinatura estável (Developer ID) para o macOS não pedir a permissão de novo a cada build.
- Regras: o agente consulta o daemon pelo socket (`/var/run/monblock/monblockd.sock`, grupo `monblock`) como o app faz hoje; fail-closed mantém as últimas regras conhecidas.
- Ciclo de vida: `KeepAlive`, desinstalação autorizada remove o agente, e o app "Sair" **não** deve parar o agente.
- Observabilidade: o log do watcher hoje só vai ao console; o agente precisa de log em arquivo do usuário (sem PII; mascarar URL).
- Testes: o `MacOSBrowserWatcher` já é testável com adaptador injetado; falta teste de instalação do agente e de reinício.

## Fora de escopo
Extensão de navegador; suporte a Linux/Windows.
