# Relatório de Revisão Técnica 360° (/review max) — monBlock v0.8.1

**Data:** 2026-11-08  
**Escopo:** Auditoria Exaustiva de Resiliência, Arquitetura Multi-Processo (Electron + `monblockd`), Fluxo do Telegram, Watcher Externo, Ciclo de Vida do Usuário e UX.  
**Auditor:** Antigravity Engineering Agent  
**Veredito Geral:** 🟢 **APROVADO COM RECOMENDAÇÕES ESTRATÉGICAS DE NÍVEL 3 (Score: 94/100)**

---

## 1. Resumo Executivo & Scorecard dos 8 Eixos Normativos

O monBlock apresenta uma base arquitetural de altíssimo nível, destacando-se pela separação estrita de privilégios (ADR-0001 / ADR-0007), tripla camada de persistência com cofres cifrados AES-GCM (ADR-0006), relógio confiável imune a adulteração (ADR-0007) e catraca unidirecional matemática (ADR-0003).

A suíte automatizada conta com **21 arquivos de teste e 263/263 testes unitários e de integração verdes (100% passing)**.

| Eixo Normativo | Nota (0-100) | Status | Diagnóstico Resumido |
| :--- | :---: | :---: | :--- |
| **1. Corretude Lógica & Concorrência** | **95** | 🟢 Sólido | Fila única serializada (`commandQueue`), sem race conditions em cofres. |
| **2. Segurança Defensiva & Zero-Trust** | **98** | 🟢 Excelente | Tríade Electron segura, CSP sem `unsafe-inline`, zero PII no Telegram, `timingSafeEqual`. |
| **3. Persistência, Cofres & Dados** | **96** | 🟢 Robusto | Tripla redundância (Cofre A/B + fallback), chave 0600 exclusiva do root. |
| **4. DevOps, Packaging & launchd** | **92** | 🟢 Alto | Packaging `.pkg` com SEA Node, launchd `com.monblock.daemon.plist`, umask 077. |
| **5. Resiliência Defensiva & Conexões** | **95** | 🟢 Excelente | Circuit Breaker no Telegram, `AbortSignal.timeout(3000)`, `killall -HUP mDNSResponder`. |
| **6. Desktop (Electron) & Multi-Processo** | **90** | 🟡 Atenção | Watcher roda no Electron (para se o app fechar). Recomendado LaunchAgent de background. |
| **7. Frontend, Design Tokens & Acessibilidade** | **96** | 🟢 Excelente | WCAG 2.2 AAA, APCA compatível, 5 temas sem jargão cru, tokens canônicos. |
| **8. Padrões de Teste & Qualidade** | **95** | 🟢 Sólido | 263 testes herméticos, AAA estrito, fixtures de frases reais pt-BR. |

---

## 2. Resiliência Máxima & Planejamento do Watcher Externo

### 2.1 Diagnóstico do Estado Atual
Atualmente, o monBlock implementa a proteção em 3 camadas (ADR-0002):
1. **Camada 1 (`/etc/hosts`)**: Gerenciada pelo daemon root `monblockd`. Permanece ativa **mesmo com o app fechado**, protegida por `chflags uchg`.
2. **Camada 2 (Browser Policies `.plist` / `policies.json`)**: Gerenciada pelo daemon root `monblockd`. Permanece ativa **mesmo com o app fechado**, bloqueando DoH, modo anônimo e listas de URLs no Chromium/Firefox.
3. **Camada 3 (`MacOSBrowserWatcher`)**: Loop AppleScript / `AXUIElement` a cada 1,5s que inspeciona abas ativas, títulos de abas e URLs completas para bloqueio imediato por palavras-chave em tempo real. **Roda exclusivamente dentro do processo Electron (`src/main/main.ts`)**.

### 2.2 A Lacuna Identificada
Se o usuário der `Cmd+Q` no monBlock ou fechar completamente o processo Electron:
- O `/etc/hosts` e as Browser Policies continuam bloqueando domínios pelo daemon root.
- **Porém, a Camada 3 (Watcher de títulos de abas e palavras-chave) cessa**, pois dependia do loop `watchTick` dentro do processo Electron.

### 2.3 Restrições Técnicas do macOS (Mojave até Sequoia / Tahoe)
Por que o Watcher não pode rodar diretamente dentro do `monblockd` root daemon?
- **Sessão de Sistema vs Sessão Aqua (GUI)**: O `monblockd` é um `LaunchDaemon` (`/Library/LaunchDaemons/`), executado como `root` no contexto de boot/sistema. Daemons de sistema não possuem sessão de WindowServer/Aqua.
- **TCC e Acessibilidade (`AXUIElement`)**: A API de acessibilidade do macOS e o subsistema de AppleEvents (`NSAppleScript`) exigem contexto de usuário logado e autorização TCC (`com.apple.accessibility`) concedida à aplicação que roda na sessão gráfica do usuário.

### 2.4 Proposta de Arquitetura: LaunchAgent de Background Dedicado
Para garantir que o Watcher nunca pare de funcionar, mesmo que a janela ou o app Electron não estejam abertos:

```
[ Sistema macOS / launchd ]
       |
       +---> [ /Library/LaunchDaemons/com.monblock.daemon.plist ] (Root Daemon)
       |        - /etc/hosts (chflags uchg)
       |        - Browser Policies (.plist / policies.json)
       |        - Socket IPC (/var/run/monblock/monblockd.sock)
       |        - Servidor Local de Bloqueio (127.0.0.1:49152)
       |        - Broker Telegram (Long Polling updates)
       |
       +---> [ ~/Library/LaunchAgents/com.monblock.watcher.plist ] (Userland Agent)
       |        - Roda como o usuário console logado (Sessão Aqua)
       |        - Executa o MacOSBrowserWatcher contínuo (AppleScript / JXA / AXUIElement)
       |        - Conecta-se ao socket do monblockd para ler regras e reportar
       |        - KeepAlive: true (reinicia automaticamente se cair)
       |
       +---> [ /Applications/monBlock.app ] (Electron UI / Dashboard)
                - Interface visual e Menu da Tray (Barra de Menu)
                - Fala com o daemon via IPC; quando fechado, o Watcher Agent continua ativo!
```

---

## 3. Revisão do Fluxo do Telegram do Ajudante

### 3.1 Estado Atual
- O monBlock implementa `sendUnblockRequest` com entrega resiliente (timeout 3000ms, circuit breaker de 3 falhas por 30s, e fallback de desafio offline `MB-XXXX`).
- O bot envia foto borrada da tela (se houver), motivo informado pelo usuário, regra disparada e 4 botões inline: `15 min`, `1 hora`, `Liberar Permanente` e `Negar`.
- O toque em "Liberar Permanente" exige uma segunda confirmação (`ASK_PERMANENT` $\to$ `CONFIRM_PERMANENT`), prevenindo toques acidentais do Ajudante.
- Todas as decisões aplicadas atualizam atômica e imediatamente as regras no daemon e no `/etc/hosts`.

### 3.2 Oportunidades de Expansão (Comandos Ativos do Ajudante)
Atualmente, o método `handleTelegramUpdate` em `monblockd.ts` processa apenas `callback_query` (cliques em botões). Mensagens de texto normais enviadas pelo Ajudante são ignoradas.

**Recomendação de Comandos Interativos para o Ajudante:**
1. `/status`: Retorna o resumo da máquina protegida:
   - Estado da proteção (Ativa / Parcial / Cooldown).
   - Categorias ativas.
   - Concessões temporárias ativas no momento (com contagem regressiva de minutos).
   - Total de regras customizadas adicionadas.
2. `/bloquear <dominio_ou_palavra>`: Permite ao Ajudante adicionar um bloqueio remotamente em tempo real (ex.: `/bloquear tigrinho` ou `/bloquear betano.bet.br`).
3. `/liberar <dominio>`: Permite ao Ajudante conceder liberação temporária (15m ou 1h) proativamente, sem necessidade de pedido prévio do usuário.
4. `/revogar <dominio>`: Cancela imediatamente uma concessão temporária ativa antes do tempo expirar.
5. `/ajuda`: Exibe o menu explicativo com a lista de comandos e opções do Guardião.

---

## 4. Fluxo de Uso do Usuário & Liberações Temporárias

### 4.1 Auto-Bloqueio pelo Usuário
- **No App ("Sites e palavras")**: Usuário pode colar lotes de até 100 domínios ou palavras.
- **Na Tray (Menu Bar)**: O item *"Bloquear site ou palavra-chave..."* direciona direto para a view `rules` com foco imediato no textarea de lote.
- **Catraca Unidirecional (ADR-0003)**: O usuário tem autonomia irrestrita para **adicionar** proteções. Para remover, a autorização do Ajudante ou a espera reflexiva de 72h é obrigatória.

### 4.2 Pedido de Liberação (Pausa Compassiva)
- **Na Tela de Bloqueio (`127.0.0.1:49152/blocked`)**: O botão de pedido de ajuda dispara uma respiração guiada de 8 segundos antes de liberar o formulário de envio, desacelerando a impulsividade.
- **No App ("Categorias")**: Diálogo empático com campo de motivo, seleção de duração (15m ou 60m) e envio direto ao Ajudante via IPC `monblock:request-unblock`.
- **Prevenção de Abuso**: Limite de 5 pedidos de desbloqueio pendentes e rejeição com RFC 9457 em caso de bombardeio de solicitações.

### 4.3 Mecânica das Liberações Temporárias
- Quando aprovada uma concessão de 15m ou 60m:
  1. O daemon adiciona a concessão em `temporaryGrants` com `expiresAtMs = now + minutos * 60_000`.
  2. `applyWebRules` retira o domínio do `/etc/hosts` e o adiciona temporariamente na lista de exceções das Browser Policies.
  3. `dscacheutil -flushcache` e `killall -HUP mDNSResponder` são executados para limpar o cache DNS do sistema imediatamente.
  4. O `MacOSBrowserWatcher` recebe as concessões ativas e ignora o domínio durante o período.
  5. **Defesa contra Sleep/Hibernação (`RN-APP-04`)**: Se o usuário fechar a tampa do notebook ou suspender o Mac, o evento `powerMonitor.on('suspend')` dispara `REVOKE_GRANTS_ON_SLEEP`, revogando todas as concessões ativas para impedir fraudes com o relógio congelado.

---

## 5. UX do App e Menu da Tray (Barra de Menu macOS)

### 5.1 O que foi refinado nesta rodada
- **Logo Oficial CCAT**: Substituído o badge SVG placeholder pelo mascote oficial do CCAT em alta resolução com micro-interação no hover.
- **Seletor de Temas Canônico**: Criado componente dropdown customizado com swatches bicolores dos 5 temas oficiais, foco por teclado e sincronização com o elemento nativo.
- **Indicador Pulsante**: Efeito de onda verde contínua (`ccat-pulse-ring`) no status da sidebar e no badge pill `#quickStatsHeader`.
- **Micro-interações e Hover**: Elevação em cards (`category-card`, `callout-box`), escala tátil em chips de tags e feedback elástico em botões.

### 5.2 Melhoria Identificada no Menu da Tray (`src/main/main.ts`)
- No arquivo `src/main/main.ts` linha 314, a chamada `buildTrayMenuTemplate` passa apenas `{ active, partnerName: 'Pareado' }`, sem calcular `temporaryUnlockRemainingFormatted` e `cooldownRemainingFormatted`.
- **Ajuste Recomendado**: Passar os dados reais de tempo restante de cooldown e de liberação temporária para que o cabeçalho da Tray exiba:
  - *"monBlock — Pausa temporária (14m restantes)"* ou *"monBlock — Espera de 72h (48h restantes)"*.

---

## 6. Auditoria Detalhada nos 8 Eixos Normativos

### Eixo 1: Corretude Lógica & Concorrência
- **Fila de Comandos Serializada**: `runExclusive` e `commandQueue` no `MonBlockDaemon` garantem que comandos IPC, ticks do watchdog e polling do Telegram nunca colidam ou criem condições de corrida sobre o estado persistido.
- **Tratamento de Exceções**: Sem blocos `catch` vazios que engulam erros críticos; todos os pontos possuem fallback previsível ou logging mascarado (`maskBotToken`).

### Eixo 2: Segurança Defensiva & Zero-Trust
- **Isolamento de Processos**: BrowserWindow Electron configurada estritamente com `nodeIntegration: false`, `contextIsolation: true` e `sandbox: true`.
- **Fronteira IPC**: Sanitização estrita em `toPublicState`: segredos (`passwordHash`, `salt`, `hmacSecret`, `recoveryCodeHashes`) **nunca** chegam ao processo de renderização.
- **Prevenção de Timing Attacks**: Validação de chat IDs e credenciais via `crypto.timingSafeEqual`.
- **Zero Segredos**: Tokens de bot do Telegram mascarados em logs e no tráfego IPC.

### Eixo 3: Banco de Dados, Persistência & Cofres
- **Tripla Persistência**: `TripleStateStore` mantém redundância entre cofre principal cifrado, cofre espelho e backup atômico.
- **Permissões de Disco**: Chave mestra gerada em `0600` no diretório protegido do daemon (`0700` root).
- **Consistência de Esquema**: Nenhuma migração DDL quebre a retrocompatibilidade.

### Eixo 4: DevOps, Packaging & launchd
- **Empacotamento macOS**: Arquitetura via `.pkg` dividida em `monBlock.app` (espaço do usuário) e `com.ccat.monblockd` (daemon privilegiado em `/Library/PrivilegedHelperTools/`).
- **Scripts de Ciclo de Vida**: `build-daemon-sea.sh`, `build-app.sh` e `build-pkg.sh` reproduzíveis.

### Eixo 5: Resiliência Defensiva & Conexões
- **Comunicação com Telegram**: Timeouts explícitos de 3000ms (`AbortSignal.timeout(3000)`), Circuit Breaker automático que abre após 3 falhas e degrada para Desafio-Resposta Offline (`MB-XXXX`).
- **Limpeza de DNS**: Execução de `dscacheutil -flushcache` e `killall -HUP mDNSResponder` assegura que liberações e bloqueios tenham efeito imediato sem reter cache.

### Eixo 6: Mobile/Desktop & Electron Isolation
- **Single Instance Lock**: Proteção contra múltiplas instâncias via `app.requestSingleInstanceLock()`.
- **Fechamento Gracioso de Janela**: `handleWindowCloseEvent` oculta a janela no clique do botão vermelho "X", mantendo a aplicação viva na bandeja.

### Eixo 7: Frontend, Design Tokens & Acessibilidade
- **WCAG 2.2 AAA & APCA**: Relações de contraste perceptual verificadas e aprovadas nos 5 temas canônicos.
- **Anti-Slop UI**: Linhas limpas, bordas sutis (hairline), números tabulares (`tabular-nums`) e ausência de gradientes exagerados.
- **Acessibilidade Motora**: Suporte completo a `@media (prefers-reduced-motion: reduce)` anulando animações de pulso e transições para usuários sensíveis.

### Eixo 8: Padrões de Teste & Qualidade
- **Cobertura Exaustiva**: 263 testes automatizados cobrindo rule-engine, enforcers, IPC daemon, state store e interface desktop.
- **Hermetismo**: Testes não deixam arquivos residuais ou sockets abertos no ambiente local.

---

## 7. Recomendações e Plano de Ação Priorizado

| Prioridade | Iniciativa | Impacto | Esforço |
| :---: | :--- | :---: | :---: |
| **P1** | **Enriquecer Dados do Cabeçalho da Tray**: Calcular e exibir no menu da barra do macOS o tempo restante de concessões temporárias e cooldown de 72h. | Alto (UX) | Baixo |
| **P2** | **Comandos Interativos do Telegram**: Implementar tratamento de `/status`, `/bloquear`, `/liberar` e `/ajuda` no broker do Telegram do `monblockd`. | Alto (Resiliência) | Médio |
| **P3** | **LaunchAgent Dedicado para o Watcher**: Criar `com.monblock.watcher.plist` de usuário para que a Camada 3 permaneça ativa mesmo com o app Electron fechado. | Crítico (Resiliência) | Médio |
| **P4** | **Testes E2E de Liberações Temporárias**: Adicionar cenário automatizado simulando a concessão temporária, verificação de remoção do hosts, e reaplicação após o tempo expirar. | Alto (Qualidade) | Baixo |

