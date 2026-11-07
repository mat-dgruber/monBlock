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

## Objetivo e restrições
- **Objetivo:** manter palavras-chave e redirecionamento para a página de bloqueio ativos mesmo com o app fechado, sem dar ao daemon root acesso ao navegador do usuário.
- **Restrições:** sem dependência nova de runtime; consulta ao daemon pelo socket existente (ADR-0007); latência do ciclo ≤ 1,5 s como hoje; Apple Events só na sessão gráfica; permissão de Automação (TCC) é por identidade do processo responsável.

## Casos de borda
- Sessão sem interface (login remoto, tela bloqueada): o agente não deve acumular tentativas de osascript; pausa o ciclo.
- Vários usuários no Mac: um agente por usuário, cada um com a permissão própria.
- Daemon fora do ar: manter as últimas regras conhecidas (fail-closed); nunca "liberar" por falha de consulta.
- Permissão de Automação negada ou revogada: registrar uma vez em log de arquivo e expor o estado ao app (aviso "Permita o controle do navegador").
- App e agente rodando juntos: só o agente age (evita redirecionar duas vezes); o app passa a apenas exibir o estado.
- Navegador sem AppleScript (Firefox): continua só pelo título da janela, sem redirecionamento.

## Resiliência
- Timeout explícito por chamada de `osascript` (1,5 s como hoje) e fila única (sem sobreposição de ciclos).
- Backoff com jitter quando o socket do daemon não responde; sem spinner/loop apertado.
- Idempotência: redirecionar a mesma aba para a mesma URL de bloqueio é inofensivo; o cache `lastCheckedKey` do watcher já evita repetição.
- Limites: log em arquivo com rotação e URL mascarada (Zero-PII).

## Rollback
O agente é instalado/removido por plist em `~/Library/LaunchAgents`; reverter = `launchctl bootout gui/<uid> com.ccat.monblock.watcher` e apagar o plist; o watcher dentro do app permanece até o agente ser comprovado em campo (feature flag no app: `watcherMode: embedded | agent`).

## Testes
Unit do `MacOSBrowserWatcher` com adaptador injetado (já existe); teste de instalação/remoção do plist; teste de que o app não age quando o agente está ativo; verificação manual em Chrome e Dia com o app fechado.
