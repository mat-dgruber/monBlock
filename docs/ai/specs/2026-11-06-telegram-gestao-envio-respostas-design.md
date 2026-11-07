# Telegram: gestão do bot, envio de pedidos e respostas do Ajudante — spec de design

- Data: 2026-11-06 · Base: `main` @ versão 0.5.0
- Status: **rascunho — aguardando `/plan-criticize` e aprovação do usuário. Nada implementado.**
- Escopo: `src/daemon/telegram-client.ts` (591 linhas), `src/daemon/monblockd.ts` (pareamento, comandos IPC), `src/daemon/entry.ts` (config), `src/server/block-server.ts`, `src/main/main.ts` e a UI de "Ajudante e recuperação".
- Relacionadas: `2026-11-04-mod02-partner-guard-telegram-design.md`, `2026-11-05-pareamento-telegram-senha-codigos-emergencia-design.md`, `2026-11-06-refino-pagina-de-bloqueio-design.md` (§8).

## 1. Revisão do que existe (achados priorizados)

### P0 — o fluxo central não está ligado
| # | Achado | Evidência |
| :-- | :-- | :-- |
| T1 | **Não há como configurar o bot.** O token só entra por `config.json` do daemon (`entry.ts:78-120`), arquivo de root em diretório `0700`. Ninguém consegue parear sem editar um arquivo de sistema à mão | `loadConfig` |
| T2 | **O pedido de liberação nunca chega ao Telegram.** `TelegramPartnerClient.sendUnblockRequest` e `parseAndVerifyCallback` não têm chamador; `block-server` roda sem `onUnblockRequest` (hoje devolve `503 Nada foi enviado`); não existe comando IPC de pedido (`DaemonCommand` só tem `GET_STATE`, `INITIATE_PAIRING`, `CHECK_PAIRING_STATUS`, `CANCEL_PAIRING`, `PAIR_PARTNER`, `MUTATE_RULES`, `VERIFY_*`, `TRIGGER_EMERGENCY_COOLDOWN`, `REVOKE_GRANTS_ON_SLEEP`, `UNINSTALL_AUTHORIZED`, `MIGRATE_LEGACY_STATE`) | grep em `monblockd.ts`, `main.ts`, `entry.ts` |
| T3 | **Nada lê as respostas.** `pollUpdates` só é usado no pareamento (`monblockd.ts:718`); não há laço para `callback_query` (botões "Liberar 15 min / 1 hora / Permanente / Negar"), nem `answerCallbackQuery`, nem edição da mensagem após a decisão, nem expiração ou uso único do `requestId`, nem criação de `temporaryGrants` a partir da aprovação | `telegram-client.ts` |

### P1 — robustez e experiência
- **Chat ID manual.** O usuário precisa descobrir o Chat ID do Ajudante (ex.: bot de terceiros). Melhor: *deep link* `t.me/<bot>?start=<código>`; o bot recebe o `/start` e aprende o Chat ID sozinho (valida o código de pareamento, uso único, com validade curta). O app mostra o link/QR para o Ajudante abrir.
- **Um só consumidor de `getUpdates`.** O Telegram devolve `409 Conflict` com dois leitores; hoje o pareamento lê por conta própria. É preciso um único laço (*broker*) que despacha pareamento, `/senha` e callbacks, com **`offset` persistido** (sem isso, depois de reiniciar o daemon, aprovações antigas são reprocessadas).
- **Pedido sem anti-spam.** Nada limita pedidos por domínio ou por tempo: a pessoa pode "cansar" o Ajudante (aprovar por insistência é *sludge*). Proposta: 1 pedido pendente por domínio, intervalo mínimo de 10 min entre pedidos do mesmo domínio.
- **Mensagem ao Ajudante.** Hoje manda `text` e `caption` iguais (`sendMessage` ignora `caption`); sem `parse_mode`, então o texto pode conter `<`/`&` sem problema, mas o rótulo "Código de Desafio Offline" é jargão. O Ajudante não recebe resposta para "pedido expirado" ou "já decidido".
- **"Permanente" a um toque.** Aprovação permanente sai no mesmo teclado de 15 min; exigir uma segunda confirmação ("Tem certeza?").
- **Token e logs.** O token aparece na URL (`api.telegram.org/bot<token>/...`) e vai em `process.env.MONBLOCK_TELEGRAM_BOT_TOKEN`: garantir que nenhum log, erro ou `GET_STATE` o inclua, e mascarar o que for exibido.

### P2
- `blurredSnapshotRef` (foto Raio-X com `has_spoiler`) nunca é gerado: ou implementar ou remover do contrato.
- A página de bloqueio não mostra o **código de desafio offline** quando a entrega falha (o `fallbackChallengeCode` existe, mas ninguém o repassa).
- Falta teste de ponta a ponta com transporte falso (pedido → botão → grant → hosts reaplicado → expiração).

## 2. Proposta

**Componentes (no daemon, mesmo processo do `block-server`):**
1. **`TelegramBroker`**: único laço de *long polling* (`getUpdates`, 25 s, `offset` persistido no cofre). Despacha: `/start <código>` (pareamento), `/senha` (já existe), `callback_query` (decisões), e ignora qualquer remetente que não seja o `pairedChatId` (comparação em tempo constante, já implementada).
2. **`UnblockRequestStore`**: pedidos `PENDING → APPROVED(15m|60m|PERMANENT) | DENIED | EXPIRED`, TTL de 15 min, `requestId` de uso único, persistido no cofre. Aprovação cria `temporaryGrants` (15/60 min) ou entrada permanente de allowlist e chama `applyWebRules`; expiração reaplica o bloqueio.
3. **Comandos IPC:** `SET_BOT_TOKEN` (só antes do pareamento ou com autorização do Ajudante; valida com `getMe`, guarda `botUsername`, **nunca devolve o token** — `GET_STATE` expõe só `botUsername` e `botConfigured`), `CREATE_UNBLOCK_REQUEST`, `GET_UNBLOCK_REQUEST`.
4. **Página de bloqueio:** `onUnblockRequest` do `block-server` chama o `UnblockRequestStore`; devolve `202 {requestId}`; a página consulta `GET /api/unblock-requests/:id` (a cada 3 s, com limite) e mostra "aguardando / aprovado por 15 min / negado / expirado / o Telegram não respondeu (código offline: MB-…)".
5. **App (Ajudante e recuperação):** passo "Criar o bot" (instrução do `@BotFather`, `/newbot`), campo do token (coberto por `SET_BOT_TOKEN`; o app nunca o guarda), link/QR de convite, estado do bot e do pareamento, botão "Testar mensagem".
6. **Mensagens ao Ajudante em pt-BR claro** (sem "HMAC"/"Raio-X"): quem pede, qual endereço (higienizado), por quê, por quanto tempo; depois da decisão a mensagem é editada ("Liberado por 15 min às 14:32 / Negado") e o `callback_query` é respondido para parar o carregamento do botão.

**Fases (cada uma = PR atômico, TDD com transporte falso):**
- **T0** Bot e pareamento: `SET_BOT_TOKEN`, deep link `/start`, estado no app, testes.
- **T1** Broker + store + pipeline pedido → botão → grant, página consulta o status.
- **T2** Mensagens, edição pós-decisão, confirmação de "Permanente", anti-spam, código offline na página.
- **T3** Endurecimento: offset persistido, token mascarado em logs/erros, testes de caos (429/5xx, duplicatas, reinício no meio do pedido).

## 3. Decisões abertas para o usuário
- **D1** Onde guardar o token: cofre do daemon (root, recomendado) × `config.json` à mão (hoje).
- **D2** Pareamento por *deep link* `/start` (recomendado) × manter Chat ID digitado.
- **D3** Exigir confirmação extra para "Permanente"? (recomendado: sim)
- **D4** Anti-spam: 1 pedido pendente por domínio e 10 min entre pedidos (recomendado) — outro valor?
- **D5** TTL do pedido: 15 min (recomendado).
- **D6** O Ajudante pode também aprovar o domínio inteiro ou só a URL/domínio pedido? (recomendado: só o domínio pedido)

## 4. Restrições, bordas e rollback
- **Restrições:** sem dependência nova; só HTTPS para `api.telegram.org`; daemon root sem acesso ao navegador; o app nunca vê o token; a porta local `49152` não pode liberar nada por HTTP sem uma aprovação real no store (nada de `unlock-code` por HTTP).
- **Bordas:** Telegram fora do ar (circuit breaker + código offline); `409 Conflict` de dois pollers; callback duplicado ou fora de ordem (o `requestId` é de uso único e a transição de estado é atômica); pedido que expira com a mensagem ainda aberta (botões viram "expirado"); reinício do daemon no meio do pedido (store e `offset` persistidos); relógio adulterado (`TrustedClock` já usado nos grants); Ajudante troca de chat (novo pareamento invalida pedidos pendentes).
- **Resiliência:** timeout 3 s por chamada, backoff exponencial com jitter, circuit breaker (já existem) e *long poll* com timeout; falha de entrega nunca vira "enviado".
- **Rollback:** cada fase só adiciona comandos/estado atrás de `botConfigured`; sem bot o comportamento atual (`503 Nada foi enviado`) permanece. Remover o bot = `SET_BOT_TOKEN` vazio com autorização.
- **Testes:** transporte falso determinístico; cenários de duplicidade, expiração, reinício e remetente não autorizado; contrato do `GET_STATE` (sem token).

## 5. Matriz de 3 alternativas — como o Ajudante responde
| | A (proposta) | B (Lean) | C (Enterprise) |
| :-- | :-- | :-- | :-- |
| Canal | *long polling* do daemon + botões inline | só mensagem com **código offline** (o Ajudante dita o código, sem botões) | *webhook* em servidor próprio |
| Custo | médio | baixo (já existe `VERIFY_OFFLINE_TOKEN`) | alto: servidor, TLS, disponibilidade |
| Risco | estado do broker | pior experiência, fricção alta | superfície nova e dependência externa |
Escolha: **A**; B continua como contingência (já é o fallback quando o Telegram falha); C é YAGNI para um app local.

## 6. Notas do `/plan-criticize` (risco 30/100, moderado)
- **Contrato de erros:** as rotas novas (`GET /api/unblock-requests/:id`, estados `EXPIRED`/`DENIED`) respondem em `application/problem+json` (RFC 9457), como as atuais.
- **Motion:** a página só atualiza texto de estado (sem animação nova); o halo de respiração já respeita `prefers-reduced-motion`.
- **Artefatos:** esta spec vive em `docs/ai/specs/`; a T1 (broker + store no daemon, token no cofre) pede um **ADR** em `docs/adrs/` ("Telegram broker único com long polling e cofre do token"), a escrever antes de implementar a T1.

## 8. Andamento
- **T0 (PR #14):** `SET_BOT_TOKEN` e interface do token. Feito.
- **T0b (PR #14):** pareamento por link. Feito, **com um desvio da seção 7**: o broker em segundo plano ficou para a T1; o `/start` é consumido pelo poller já existente do `CHECK_PAIRING_STATUS` (um único leitor, protegido por trava, chamado pelo app a cada 2 s enquanto o convite está pendente), então não há dois leitores de `getUpdates`. O laço do broker entra na T1, junto dos pedidos, e passa a ser o único consumidor.
- **T1–T3:** pendentes.
