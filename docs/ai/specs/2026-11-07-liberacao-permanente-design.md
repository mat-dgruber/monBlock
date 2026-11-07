# Liberação permanente (falso positivo) — spec de design

- Data: 2026-11-07 · Base: `main` @ 0.7.0
- Status: **rascunho — aguardando `/plan-criticize` e aprovação do usuário. Nada implementado.**
- Relacionadas: `2026-11-06-telegram-gestao-envio-respostas-design.md` (D3, "Permanente" desligado na T1), ADR-0009.

## 1. Problema
Mesmo com listas bem curadas há falsos positivos (site legítimo bloqueado por categoria ou palavra-chave). Hoje a única saída é liberar por 15 min / 1 h, a cada vez. É preciso uma saída **permanente, mas só com o Ajudante**, sem virar brecha para o próprio usuário.

## 2. Proposta (menor mudança correta)
Reutilizar a **allowlist do usuário** (`rules.allowlistDomains`, precedência 2 no `rule-engine`, já protegida: adicionar exige o Ajudante, `partner-guard.ts`). "Permanente" = o Ajudante aprova, o daemon acrescenta o **domínio pedido** à allowlist e reaplica as regras (`applyWebRules`). Sem novo conceito de estado.

Fluxo:
1. Página de bloqueio: opção "Permanente" volta a ser aceita (`requestedMinutes: 0` hoje recusado em `createRequest`). O motivo vira obrigatório (mín. 10 caracteres) e fica na mensagem.
2. Telegram: o teclado volta a ter **Liberar permanente**. Ao tocar, **não aprova**: edita a mensagem para "Tem certeza? Isto libera `dominio` para sempre" com **Sim, liberar para sempre** / **Cancelar** (callback `confirm_permanent:<id>`, `cancel:<id>`). Só a segunda toque aprova.
3. Daemon: `decideRequest` ganha `APPROVE_PERMANENT`. Num único `save` (como hoje): decisão + domínio na allowlist + offset. Escopo **só o domínio pedido** (D6), nunca categoria nem curinga; domínio normalizado (punycode), rejeita IP, TLD puro (`com`) e domínios da CRITICAL_INFRA.
4. Reversão: comando `REVOKE_ALLOWLIST_DOMAIN` (exige senha do Ajudante, já é o caminho de `MUTATE_RULES`); a lista mostra o que foi liberado, quando e por pedido de quem. O Ajudante também pode revogar pelo Telegram (`/liberados`, `/revogar <dominio>`) — **T-extra, opcional**.
5. Auditoria: cada liberação permanente registra `{domain, requestId, atMs}` em `permanentReleases` no cofre (aparece no app).

## 3. Decisões abertas
- **P1** Confirmação extra no Telegram (recomendado: sim, como acima).
- **P2** Anti-abuso: no máximo 3 liberações permanentes por 24 h (recomendado) e aviso ao Ajudante quando passar de 10 no total.
- **P3** Liberar `dominio` inclui subdomínios (`matchesDomain` faz sufixo)? Recomendado: sim, é o comportamento da allowlist; a mensagem do Ajudante diz "inclui subdomínios".

## 4. Bordas, segurança e rollback
- Duplo toque / botão antigo: mesma transição única e TTL de 15 min de hoje; `confirm_permanent` também expira com o pedido.
- Usuário forjando callback: valida chat e `from.id` do Ajudante pareado (já existe).
- Domínio com homógrafo: a mensagem mostra punycode e o texto Unicode juntos.
- Reinício no meio: pedido, allowlist e offset no mesmo `save` (testado na T3).
- Rollback: desligar com flag `allowPermanent:false` (já existe no cliente); revogar entradas via `REVOKE_ALLOWLIST_DOMAIN`.
- Não toca a política dos navegadores além do que `applyWebRules` já faz com a allowlist (`URLAllowlist`).

## 5. Testes (AAA, transporte falso)
Permanente exige dois toques; um toque só não libera; cancelar fecha sem liberar; outro chat não confirma; domínio inválido/IP/TLD recusado; allowlist reaplicada nos 3 enforcers; reinício entre os dois toques; revogação volta a bloquear; limite de 3/24 h.

## 6. Alternativas
| | A (proposta) | B (Lean) | C (Enterprise) |
| :-- | :-- | :-- | :-- |
| Como | allowlist + confirmação no Telegram | só o Ajudante edita a allowlist no app | fluxo de revisão com trilha e expiração (ex. 90 dias) |
| Custo | médio | baixo, mas atrito alto | alto |
Escolha: **A**; C como evolução (expiração) se virar necessidade.

## 7. Fases
- **P-1** `APPROVE_PERMANENT` + confirmação no Telegram + allowlist + testes.
- **P-2** Página (opção Permanente, motivo obrigatório) + lista/revogação no app.
- **P-3** Limites anti-abuso e documentação (CHANGELOG, domínio `web_blocking`, ADR-0010 se o modelo de allowlist mudar).

## 8. Restrições
Sem dependência nova; só o daemon grava a allowlist (o app nunca); timeout de 3 s e circuit breaker do Telegram como hoje; a confirmação vale 15 min (TTL do pedido); no máximo 200 entradas na allowlist; lista de domínios em pt-BR sem jargão nas mensagens. Sem animação nova (a página só troca texto de estado).

## 9. Pre-mortem (assuma que quebrou às 3h)
- **Allowlist enche e vira buraco:** limites 3/24 h e 200 entradas; aviso ao Ajudante; a lista e a revogação ficam visíveis no app.
- **Libera domínio errado (homógrafo, subdomínio):** mensagem mostra punycode + Unicode e diz "inclui subdomínios"; recusa IP, TLD puro e CRITICAL_INFRA.
- **Pessoa pede "Permanente" para tudo:** motivo obrigatório + limite diário; o Ajudante vê os pedidos anteriores do mesmo domínio.
- **Falha no meio (daemon reinicia entre os dois toques):** o pedido segue `PENDING`; decisão, allowlist e offset gravados juntos, então nunca fica liberado sem registro.
- **Telegram fora do ar:** nada é liberado (igual hoje); o código offline continua valendo só para a liberação temporária, nunca para "Permanente".
- **Blast radius:** um domínio por pedido; revogar é um comando.
