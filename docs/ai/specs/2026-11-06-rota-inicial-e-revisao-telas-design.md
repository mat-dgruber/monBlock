# Rota inicial e revisão das telas do app — spec de design

- Data: 2026-11-06 · Base: `main` @ `0caf20c` (v0.3.0, PR #4 incluído)
- Status: **aprovada pelo usuário em 2026-11-06 (D1–D6 como propostas).** F0, F1, F2 e parte da F3 implementadas (PR #5); pendentes: P0-4 (`empty`/`partial`), da F3 a unificação de tokens e a remoção dos `style=""` inline/`unsafe-inline`, e F4. F2: D3 resolvido removendo o campo "Por que..." do dialog de pausa; tela final dispensada (o passo 4 com confirmação manual é o fechamento).
- Escopo: `src/renderer/index.html`, `src/renderer/renderer-init.js`, `src/main/main.ts`, `docs/design/tokens.css`.
- Relatórios completos das 5 revisões (separados, sem síntese opaca): pasta de notas da sessão, `revisao-1-ux-reviewer.md`, `revisao-2-design.md`, `revisao-3-design-review.md`, `revisao-4-design-critique.md`, `revisao-5-animacao.md`; evidências em `evidencias.md`.

## 1. Rota inicial

### Situação
`renderer-init.js:621` chama `switchView('categories')` sempre. Quem nunca configurou cai em Categorias; o botão "Categorias" já nasce marcado no HTML.

### O que conta como "configurado"
| Sinal | Persistente? | Veredito |
| :-- | :-- | :-- |
| `state.paired` (Ajudante pareado, vem do daemon) | sim, cofre do daemon | **critério único** |
| `rules.enabledCategories` além de `['adult']` / domínios / palavras | sim | descartado: dá para ter regras sem Ajudante, e aí falta justamente a catraca |
| flag "onboarding concluído" | não existe | não criar (YAGNI): `paired` já é a conclusão real do passo 3 |
| `browserProfileInstalled` | sim | **não** entra: já tem faixa própria; misturar prenderia o usuário pareado no onboarding |

### Regra proposta
1. Daemon responde `paired === false` → abre **Primeiros passos, passo 1**.
2. `paired === true` → abre **Categorias**.
3. Daemon indisponível/erro (`uiState=error`) → não decide nada: sem view ativa, mostra o erro com "Tentar novamente" (ver P0-5). Nunca manda quem já configurou de volta ao onboarding.
4. A regra vale **só no primeiro `loadState` da execução**. Clique na nav antes da resposta do daemon, ou `monblock:tray-navigate`, prevalece e não é sobrescrito.
5. "Agora não" no onboarding (usuário quer só bloquear sites sem Ajudante): grava `monblock.onboardingDismissed=1` em `localStorage` (try/catch; UI-only, nada sensível) e passa a abrir em Categorias com um aviso discreto "Escolher um Ajudante". Sem o flag, volta a abrir no onboarding.
6. A decisão é tomada **antes** de `uiState='active'` (o painel de loading já cobre o conteúdo, então não há flash da view errada).
7. Pareamento em andamento não é persistido (`checkPairingStatus` é em memória): reabrir o app no meio recomeça no passo 1. Aceito; registrado como limite.

Critérios de aceite (BDD):
- Dado `paired:false` e sem flag, quando o app abre, então "Primeiros passos" passo 1 está visível e focável, nav com `aria-current` nele.
- Dado `paired:true`, quando abre, então "Categorias".
- Dado erro 503, então nenhuma view é escolhida e o botão "Tentar novamente" existe.
- Dado clique em "Sites e palavras" durante o loading, quando o estado chega, então continua em "Sites e palavras".
- Teste vitest para a função pura `pickInitialView(state, {dismissed, userNavigated})`.

## 2. Achados priorizados (consolidados das 5 revisões)

Concordância: tudo em P0 foi apontado por ≥3 revisões. Itens marcados *(não confirmado)* vieram de uma só revisão sem medição.

### P0 — corrigir primeiro (baratos, alto impacto, honestidade/acessibilidade)
| # | Achado | Onde | Correção |
| :-- | :-- | :-- | :-- |
| P0-1 | "Proteção Contínua Ativa" fixo, visível em erro/offline/lockdown: afirmação falsa | `index.html:790` | ligar a `#protectionStatus` ou remover |
| P0-2 | Faixas: `--warning-color` como cor de texto, 3,29:1 no capycro-ivory (reprova AA; os outros 3 temas passam: 4,84 / 9,27 / 19,56) | `index.html:687-693` | texto em `--text-color`, âmbar só em borda/ícone (ou `--warning-text` #8a5200 ≈ 5,98) |
| P0-3 | Texto `#FFF` sobre `--ccat-brand-primary`: dark-tech 1,81:1, alto contraste 1,41:1 (nav ativa, skip-link, breathing-circle, avatar) | `index.html:221-226,612,673` | token `--ccat-on-brand` por tema (usar o `--nav-active-text` que já existe e não é usado) |
| P0-4 | Estados `empty`/`partial` nunca atribuídos; "Adicionar site" inalcançável | `renderer-init.js:315,318`; `index.html:831` | definir regra de `empty` (sem `blockedDomains`/`keywords`, só padrão) e `partial` (`tamperLockdown` ou `browserProfileInstalled===false`) **ou** apagar os dois do HTML — decisão D2 |
| P0-5 | Em `error` a nav some (views dentro do painel `active`) ou fica clicável sem conteúdo; só 503 tem ação; sem "Tentar novamente" | `index.html:625-628,860`; `renderer-init.js:318-327` | nav fora do painel; `Tentar novamente` chama `loadState`; "Ajudante e recuperação" continua acessível |
| P0-6 | Dialog "Pedir ajuda para alterar": campo "Por que..." não envia nada, timer de 10 s decorativo | `index.html:1460-1478`; `renderer-init.js:391` | decisão D3: remover o campo e o título prometedor, ou implementar o pedido |

### P1
- Stepper: pula-se do passo 1 ao 4 sem parear; passo 4 diz que códigos foram enviados sem pareamento (`index.html:1037`); `aria-controls`/`tabpanel`/setas ausentes; checkbox de códigos marcado sozinho ao parear (`renderer-init.js:515`, confirmação sem ato consciente — exigir clique). Preferir `<ol>` com `aria-current="step"`, "Passo X de 4", bloquear 3→4 até `paired`.
- Passo 3: polling sem prazo visível; conclusão é só um toast → tela final com resumo e "Ir às categorias".
- Duas paletas de tokens divergentes (`--ccat-*` no HTML × `--primary-color`/`--surface-*` em `tokens.css`; light-fintech botões azul #2563eb × nav teal; dark #60a5fa × #22D3EE). Unificar em `tokens.css`.
- `--ccat-text-muted` reprova (ivory 3,28–3,52; dark 3,61); chips 12 px (ivory 4,20; fintech 3,70); avatar dark 2,80; borda de input 1,28–1,66:1 (< 3:1, WCAG 1.4.11).
- 70 `style=""` inline (+ `style.display` no JS, ✕ do `notify`) e `'unsafe-inline'` na CSP: proibido pelo CLAUDE.md do usuário → classes + `hidden`.
- ≥4 live regions `polite` concorrentes; `notify` troca `role` dinamicamente; `#urlCheckerResult` sem `role=status`. Uma região por vez; faixas viram 1 linha compacta (≤ ~64 px) — hoje ocupam ~½ de 760 px e empurram as views.
- `profileStepsDialog`: sem estilo próprio (só `#partnerAuthDialog` tem CSS), sem foco inicial, falta o "porquê" (Chrome/Brave/Edge ignoram o bloqueio) no próprio dialog.
- Tray: "Bloquear site ou palavra-chave…" e "Adicionar site manualmente…" levam à mesma view → fundir e **focar o campo** (`#batchDomainsTextarea`), hoje só foca o h2; cabeçalho "Estado da proteção carregado" é jargão → "Proteção ativa" / "Não verificada".
- Jargão na tela: "Escudo Base", "One-Way Ratchet" com asteriscos literais (`index.html:900`), "HMAC-SHA256", "REC-*", chip "cassino,online" com vírgula crua.
- Categorias: 11 cartões (Hick) → 3–4 mais comuns + "Outras" recolhidas; `CATEGORIES_DATA` duplicado no JS (fonte de verdade divergente do daemon).
- Ajudante e recuperação: começa por controles desativados, esconde o que funciona em `<details>`; tabela de regras com coluna "Ação" que mostra status, linha de exemplo fixa (`index.html:1396`), filtro/botão de 36 px (< 44).
- Tema inicial fixo `capycro-ivory` anula `prefers-color-scheme`/`prefers-contrast`; `aria-pressed` em `<option>` é inválido; tema não persiste.
- 13 `h2` sem hierarquia (banners/estados usam `h2`; `h3` nas faixas).

### P2
Emojis como ícone (+20 pontos) → SVG; `prefers-reduced-transparency`; texto 12 px; "Desfazer" ao remover site/palavra; validação inline do Chat ID; `<caption>`/`scope` na tabela; código morto em `tokens.css` (`.glass-panel`, `.ccat-seg-btn`); sombras/z-index literais; validar layout em 880 px (largura mínima).
*(não confirmado)* Reset `*{padding:0}` fora de `@layer` vencendo `.ccat-btn`/`.ccat-input` (design-critique P0.4): na inspeção do navegador os botões tinham ≥ 3 rem de altura e padding visível → provavelmente falso; validar por captura antes de agir.

### Motion (`/animacao`)
- Recomendado (CSS/WAAPI, 0 KB, só `transform`/`opacity`, classes, sem `style=""` novo, sempre com `prefers-reduced-motion`): guarda de reduced-motion também para JS; respiração real no dialog (hoje `transition: transform 4s` sem nada que altere `transform`); fade+6 px de 220 ms só na **entrada** de views/painéis (sem animar saída, para não atrasar o foco no h2); toast com entrada 180 ms/saída 120 ms, sticky, auto-dispensa 5 s só em sucesso (erro nunca some sozinho), pausa em hover/foco; faixas com `grid-template-rows 0fr→1fr` 260 ms; sublinhado deslizante no stepper. Tokens `--dur-fast:140ms`, `--dur-base:220ms`, `--dur-calm:360ms`.
- Rejeitado (YAGNI/calma): canvas criativo (`cast`/`paint`), GSAP (25–60 KB sem scroll/pinning), Three.js (150–500 KB; janela só esconde, loop WebGL rodaria em background), bounce/spring/shake/confete.
- Tray não anima; P2 opcional: variantes estáticas do ícone por estado.
- `@starting-style`/`allow-discrete` exigem Chromium ≥ 117: **verificar a versão do Electron** antes de usar.

### Perspectivas divergentes de `/design` (para decidir, não sintetizadas)
| Perspectiva | Tela inicial / onboarding | Faixas | Risco |
| :-- | :-- | :-- | :-- |
| ui-ux-pro-max (corporativa) | resumo + checklist "n de 4 etapas" (`paired`, perfil, categorias) | lista única "Ações necessárias (n)" | denso |
| impeccable (minimalista) | coluna única, "Passo 2 de 4" + barra fina, sem abas | linha de 1 px, ghost + primário | austero |
| huashu (autoral) | manchete com nome do Ajudante, catraca em SVG girando por passo | "carta" com selo | caro; tom poético pode atrapalhar urgência |
| frontend-design (Bento) | Bento 2×3 (status, Ajudante, Raio-X, Adicionar site, perfil) | célula de alerta | complexo |
| mobile-design | sidebar vira trilho de ícones < 1000 px | 1 linha, dispensável 24 h só a de atualização | ganho só em janela pequena |
| grill-me-design-system | sem mudança visual: tokens em 3 níveis, contraste validado em CI | `--banner-*` | overhead |

## 3. Plano em fases (cada fase = PR atômico, TDD onde há lógica)
- **F0 — honestidade e contraste:** P0-1, P0-2, P0-3 (só tokens/CSS/HTML), teste automatizado de contraste dos 4 temas.
- **F1 — rota inicial + estados:** `pickInitialView` (puro, testado), P0-4, P0-5; "Tentar novamente"; nav fora do painel.
- **F2 — onboarding e dialogs:** P0-6, stepper acessível, bloqueio 3→4, tela final, `profileStepsDialog` (estilo/foco/porquê).
- **F3 — higiene:** tokens unificados, remover inline/`unsafe-inline`, live regions, tray (fusão + foco no campo + textos), jargão.
- **F4 — motion** (opcional, após F0–F3).
Docs: ADR só se a unificação de tokens (F3) ou a CSP mudarem a arquitetura; atualizar `docs/domains` se existir para a UI.

## 4. Decisões abertas para o usuário
- **D1** Rota inicial: confirmar `paired` como critério único + "Agora não" com `localStorage` (regra acima) — ou sempre Categorias com aviso.
- **D2** `empty`/`partial`: ligar (com as regras propostas) ou apagar do HTML?
- **D3** Dialog de pausa: remover (honesto hoje) ou implementar pedido ao Ajudante (escopo de daemon/Telegram, spec própria)?
- **D4** Faixas: manter as duas, fundir em "Ações necessárias" ou compactar em 1 linha?
- **D5** Estética: contida (impeccable) ou autoral (huashu), considerando público vulnerável?
- **D6** Motion (F4) entra agora ou fica para depois?

## 5. Limites desta revisão
Inspeção do HTML estático no navegador (sem bridge, estados forçados por JS); `.app` empacotado, tray e dialogs reais **não** foram abertos; contrastes calculados por hex (não por captura); três revisores leram `index.html` só até ~1141/1500 linhas (categorias, Sites e palavras e dialogs vieram de grep/evidências). Não cobertos: IPC `monblock:open-profile-settings` e `conclusion.html` do instalador (PR #4).

## 6. Restrições, alternativas e blindagem (`/plan-criticize`, `plan_critic.py`: risco 40/100, moderado)

**Restrições:** app Electron sem dependência de runtime nova (spec de empacotamento 2026-11-06); renderer sem bundler (`renderer-init.js` + `index.html`); CSP hoje com `'unsafe-inline'`; janela mín. 880 px; daemon root é a única fonte de verdade (ADR-0007); `localStorage` só para conveniência de UI, nunca segredo; artefatos em `docs/ai/` (este arquivo) e ADR em `docs/adrs/`.

**Matriz de 3 alternativas — rota inicial**
| | A (proposta) | B (Lean) | C (Enterprise) |
| :-- | :-- | :-- | :-- |
| Critério | `paired` + "Agora não" em `localStorage` | `paired` apenas; sem dismiss | flag `onboardingCompleted` persistida no daemon (novo campo + migração do cofre) |
| Custo | 1 função pura + 1 chave | 1 função pura | mudança de contrato IPC, cofre e daemon |
| Risco | dismiss some ao limpar dados (volta ao onboarding: inofensivo) | quem não quer Ajudante é reconduzido ao onboarding a cada abertura | maior blast radius (ADR + migração) |
Escolha: **A**; B é o fallback se D1 recusar o dismiss; C rejeitado por YAGNI.

**Pre-mortem / bordas:** (1) daemon lento: loading cobre o conteúdo e nenhuma view é escolhida até a resposta; timeout de UI com "Tentar novamente" (sem spinner infinito). (2) `paired` oscila entre polls de 15 s: a regra só roda no 1º `loadState`, nunca reposiciona o usuário depois. (3) Tray durante o loading: `onTrayNavigate` marca `userNavigated`. (4) `localStorage` indisponível: try/catch, assume "não dispensou". (5) Atualização do app com daemon <0.3.0 (campo `browserProfileInstalled` ausente): `paired` ainda existe, rota inalterada. (6) Contraste: teste automatizado nos 4 temas impede regressão.

**Rollback:** cada fase é um PR atômico só de renderer/CSS/main (sem migração de dados); reverter o commit restaura o comportamento atual. A chave `localStorage` é ignorada por versões antigas.

**Testes (pirâmide):** unit `pickInitialView`, unit de cálculo de contraste dos tokens (4 temas, AA 4,5:1 / 3:1 componentes), teste de DOM (jsdom, padrão do repo) para `renderProfileBanner`/estados `empty`/`partial`/`error`, E2E manual no `.app` (`--remote-debugging-port=9333`, ver DOM via CDP) para tray e dialogs; sem `.app` aberto nesta revisão.

**Fora de escopo / n/a:** RFC 9457 não se aplica (IPC/Unix socket, sem API HTTP nova; erros seguem `ProblemDetails` já existentes). Motion: `deltaTime`/rAF só se F4 criar loop imperativo (a proposta é CSS puro).
