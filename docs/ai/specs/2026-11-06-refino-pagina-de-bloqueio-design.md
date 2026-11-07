# Refino da página de bloqueio — spec de design

- Data: 2026-11-06 · Base: `main` @ `4beff65`
- Status: **aprovada pelo usuário em 2026-11-06 (D1–D5 como recomendadas) e implementada** (formulário removido, sem campo de código/"Permanente", tom sóbrio, respiração guiada incluída). Pendente: pedido ao Ajudante com `POST /api/unblock-requests` quando houver Ajudante pareado.
- Escopo: `docs/design/blocked-page.html` (711 linhas, servida em `http://127.0.0.1:49152/blocked` por `src/server/block-server.ts`), `docs/design/tokens.css`, `src/enforcers/macos-watcher.ts` (parâmetros do redirecionamento).
- Revisões completas e separadas (fan-out, sem síntese opaca): pasta de notas da sessão, `pb-1-design.md` (8 perspectivas) e `pb-2-animacao.md` (4 vertentes); evidências em `evidencias-pagina-bloqueio.md`.
- Contexto confirmado pelo usuário: no Chrome e no Dia o watcher já leva a aba até esta página.

## 1. Problema

É a tela de maior peso emocional do produto: aparece no momento do impulso. Hoje ela **afirma coisas que o sistema não faz** e mostra dados inventados, e o formulário de pedido ao Ajudante não funciona (o Ajudante ainda não está pareado, `paired:false`).

## 2. Achados priorizados

### P0 — honestidade (corrigir antes de qualquer refino visual)
| # | Achado | Onde |
| :-- | :-- | :-- |
| H1 | `verifyUnlockCode`: qualquer texto vira "Código verificado… Acesso liberado conforme autorização do Ajudante". Nada é verificado nem liberado; sugere que a catraca cedeu (pior achado) | HTML:702-708 |
| H2 | `sendPartnerRequest`: toast "Pedido enviado ao Ajudante… Aguardando aprovação no Telegram" sem nenhum `fetch` | HTML:685-695 |
| H3 | `downloadOfflineRequest`: "Comprovante gerado" sem gerar nada | HTML:697-700 |
| H4 | O watcher envia `domain`, `reason`, `rule`; a página lê `url`, `rule`, `code` → "Endereço interceptado" mostra sempre o exemplo `bet-exemplo.com/promocoes/bonus` | HTML:449,609; `macos-watcher.ts` ~350 |
| H5 | "Protocolo MB-8492-X7", categoria "Apostas & Cassinos", camada "/etc/hosts + Watcher Universal" e "Proteção Ativa" são fixos: num bloqueio por palavra-chave a tela mente sobre causa e camada | HTML:402,438,457,464 |

### P1
- Contraste do badge de regra ~3,3:1 em 12 px (`#c27803` sobre `#fef7e6`, reprova AA).
- "Validar e Liberar" é o botão mais saturado da tela; "Permanente" está a um clique no pior momento (contradiz a catraca).
- `history.back()` pode voltar à URL bloqueada e gerar loop (o watcher redireciona de novo): falta uma saída determinística.
- `data-theme="capycro"` fixo anula o auto-dark (impulso é comum de madrugada) e `prefers-contrast` sobrescreve a escolha do usuário.
- Toast alterna `display:none` (leitores de tela podem não anunciar) e nasce abaixo do hero (pode ficar fora da viewport).
- ~12 controles acima da dobra para quem só quer sair; duas formas de escolher duração; jargão "HMAC"/"Catraca Unidirecional"; `<button>` dentro de `<label>`.
- Os 4 pills de tema no topo disputam atenção com a mensagem.

### P2
Sombras com o primário antigo; estilos inline (CSP do servidor ainda aceita `unsafe-inline`); faixa lateral decorativa; "(CCAT)" no título da aba; tom ora tutelar, ora policial ("vitória real"); `min-width` aperta em janela estreita; `design.md` cita primário `#5d8a8c` e um "Raio-X" que a página não tem; fontes Playfair/Plus Jakarta não carregam (caem em Georgia).

### Motion (`/animacao`)
- Recomendado: entrada escalonada (`opacity` 0→1 + `translateY(8px)→0`, 420 ms, delays 0/120/200 ms, `both`) no hero e nos cards, **nunca** em "Voltar com Segurança" (pinta e responde em t=0; Esc intacto); toast com 180 ms + `scrollIntoView({block:'nearest'})`; estado "enviando" só com `fetch` real (`aria-busy`, timeout 8 s, sem spinner infinito).
- Opcional (vertente creative coding, 1 item): respiração guiada 4 s inspira / 6 s solta (~6 resp/min), `scale(.8→1.2)` senoidal **derivada de `now - t0`** (60/120 Hz e aba oculta ok), rótulo `aria-hidden` + texto estático para leitor de tela, botão "Pausar" de 44 px; em `prefers-reduced-motion` só o texto "Inspire 4s • Solte 6s", sem rAF.
- Rejeitado (YAGNI/calma): GSAP (25–60 KB sem scroll story), Three.js/shaders (estímulo no pior momento, GPU), canvas/partículas/parallax/glow pulsante, check animado, confete, shake, spinner infinito, contagem regressiva falsa, som, vibração. Nenhum motion de "sucesso/liberado" enquanto houver mensagens falsas.
- `prefers-reduced-motion` de `tokens.css:468-473` só encurta para 0,01 ms: em animação `infinite` vira flicker. Regra explícita `animation: none` + `matchMedia` para loops.

## 3. Direções de `/design` (divergentes, para decidir)
| Perspectiva | Hierarquia | Formulário sem Ajudante | Copy | Risco |
| :-- | :-- | :-- | :-- | :-- |
| ui-ux-pro-max | coluna única; faixa de estado real; CTA "Fechar esta aba"; disclosure "Preciso acessar isso" | empty state: "Você ainda não tem um Ajudante… sem ele não há como pedir liberação" + passo de pareamento | "Esta página está pausada." | mais texto |
| impeccable | acima da dobra só h1 + 1 frase + 1 botão; resto em `<details>`; temas no rodapé | não renderiza; linha de rodapé | seco: "Pausado." | frio para público vulnerável |
| huashu | frase serifada grande + círculo de respiração + "Fechar aba" | some; nota de *urge surfing* | "Você parou aqui. Isso já conta." | poético demais; contador pode virar pressão |
| frontend-design | bento de 3 tiles (Sair / Por que / Pedir ao Ajudante) | tile com estados `indisponível │ pronto │ enviando │ enviado │ erro`; inerte sem Ajudante | "Nada foi enviado" / "O Ajudante ainda precisa aprovar" | complexidade; checar `connect-src` |
| mobile-design | "Fechar aba" largo e fixo na base < 820 px | recolhido (bottom sheet só com Ajudante); chips viram radio group | frases ≤ 60 caracteres | ganho só em janela estreita |
| design-review | 2 colunas só com Ajudante; sem ele, 1 coluna | estado desabilitado visível com cadeado e texto | — | — |
| ux-reviewer | caminho seguro = menor esforço; risco = fricção proposital | texto honesto; remover campo de código e "Permanente" | sem culpa, sem "vitória real" | — |
| grill-me-design-system | tokens `--state-unavailable`/`--state-pending`; sair de literais/inline | variante "notice" tokenizada; verde só após 2xx do daemon | — | overhead |

**Convergência de todas:** (1) remover as afirmações falsas vem antes de qualquer refino; (2) a saída segura é a ação primária e a única "quente"; (3) nada com aparência de "liberar" sem Ajudante pareado; (4) mostrar só dados reais da query, e omitir a linha quando não houver.

## 4. Proposta (a aprovar)

Fase 1 — **honestidade e dados reais** (P0, sem decisão estética): 
- A página lê `domain`, `reason`, `rule` (e aceita `url`); linhas sem dado são omitidas; protocolo, categoria e camada saem do hard-code (a página só é alcançada pelo redirecionamento do vigia de abas, então a camada exibida é sempre "Vigia de abas do monBlock"; `reason` descreve a regra, não a camada).
- Sem Ajudante pareado: o bloco de pedido vira aviso honesto ("Sem um Ajudante pareado não há como pedir liberação. Isso é a proteção funcionando.") e o campo de código, "Salvar pedido offline" e "Permanente" **não são renderizados**. Quando houver Ajudante, o pedido usa `POST /api/unblock-requests` com `Idempotency-Key`, timeout e erro RFC 9457, e o status vai numa região `aria-live` permanente.
- "Voltar" determinístico: tenta fechar a aba (`window.close()`) e **mantém sempre visível** a instrução de fechamento manual (Cmd+W), pois `window.close()` não informa se funcionou; sem `history.back()` em loop.
- Criação de teste que falha se algum toast afirmar envio/liberação sem resposta do servidor.

Fase 2 — **design** (depende de D1–D4): hierarquia, tema do SO, contraste do badge, remoção de inline/faixa lateral, copy sem culpa.

Fase 3 — **motion** (depende de D3): entrada escalonada, toast e, opcionalmente, a respiração.

Cada fase = PR atômico, TDD onde há lógica; CHANGELOG; docs de domínio só se o contrato do redirecionamento mudar.

## 5. Decisões abertas para o usuário
- **D1** Sem Ajudante: ocultar o formulário (aviso honesto, recomendado) ou mostrá-lo desabilitado?
- **D2** Remover o campo de código e "Permanente" desta tela (recomendado) ou manter?
- **D3** Tom e direção: sóbrio (impeccable/ux-reviewer, recomendado) ou editorial (huashu)? Inclui a respiração guiada e o contador?
- **D4** Layout: coluna única com disclosure ou bento de 3 tiles?
- **D5** Confirmar o endpoint de status de pareamento e o `connect-src` da CSP antes da Fase 1 com Ajudante.

## 6. Restrições, rollback e testes
- Página estática do disco, sem build e sem dependência nova; `block-server.ts` já injeta `designDir`.
- Rollback: cada fase só toca `blocked-page.html`/`tokens.css`/o parâmetro do redirecionamento; reverter o commit restaura o comportamento atual.
- Testes: unit da hidratação dos parâmetros (`domain`/`reason`/`rule`), teste que garante ausência de "Acesso liberado"/"Pedido enviado" sem resposta do servidor, teste de `prefers-reduced-motion`, e verificação visual no Chrome e no Dia.
- Ainda **não** verificado: comportamento real no Safari/Firefox; cobertura por captura de tela.

## 7. Matriz de 3 alternativas e blindagem (`/plan-criticize`, `plan_critic.py`: risco 20/100, baixo)
Artefatos em `docs/ai/` (spec) e ADR só se o contrato do redirecionamento (`domain`/`reason`/`rule`) virar API estável.

| | A (proposta) | B (Lean) | C (Enterprise) |
| :-- | :-- | :-- | :-- |
| Escopo | Fase 1 honestidade + dados reais; depois design e motion | só corrigir os 3 toasts falsos e o `url`→`domain` | página reescrita como app com estado servido pelo daemon (`/api/state`), com pedido, status e histórico |
| Custo | 3 PRs pequenos | 1 PR de ~30 linhas | alto; depende do pareamento e de endpoints novos |
| Risco | baixo | a tela continua com layout pesado | acopla a página ao daemon e à CSP |
Escolha: **A**; B é o piso se D1–D4 demorarem (a Fase 1 inteira já é quase B); C é YAGNI até o Ajudante existir.

**Pre-mortem / bordas:** parâmetro ausente ou com caracteres especiais (renderizar com `textContent`, nunca `innerHTML`; limitar tamanho); `domain` com Unicode/IDN; página aberta sem redirecionamento (query vazia → omitir linhas); `window.close()` bloqueado pelo navegador (cair no texto "Pode fechar esta aba"); `prefers-reduced-motion`; contraste nos 4 temas; resposta do daemon fora do ar (erro estático, sem spinner infinito).

## 8. Pré-requisitos do pedido ao Ajudante (fase futura, não faz parte desta entrega)
O endpoint `POST /api/unblock-requests` existe, mas hoje devolve `202 accepted` sem entregar nada. Antes de a página voltar a oferecer um pedido:
- ligar um `onUnblockRequest` real no daemon e só reportar sucesso depois da confirmação de entrega ao Ajudante;
- idempotência persistente e atômica (a atual é um cache em memória de 1.000 chaves, perdido ao reiniciar);
- tratar `409` de chave em andamento como "pendente" (repetir/consultar com a mesma chave), não como erro;
- exigir Ajudante pareado antes de exibir o formulário.

## 9. Limitações conhecidas do watcher (fora do escopo desta spec)
- Corrida de abas: se a pessoa trocar de aba entre a leitura (`getActiveTab`) e o redirecionamento, a aba ativa no momento é redirecionada, não a lida. Mitigação futura: reler e comparar o snapshot antes de redirecionar, ou redirecionar por identificador de aba (o Dia e o Chromium expõem `id`).
- Firefox não expõe a URL: a página omite o endereço nesse caso.

## 10. Revisão do usuário (2026-11-06, noite)
- Logo da CCAT (Capycro Avectech, de `CCAT/public/Images/logo-ccat.png`, reduzido a 128 px e embutido em base64) no cabeçalho e no centro da respiração.
- Respiração **automática e etérea** (halo suave atrás do logo, 4 s/6 s, `opacity`/`transform`), com "Pausar animação" (WCAG 2.2.2) e parada sob `prefers-reduced-motion`. Substitui a respiração por opt-in da seção 4.
- **Pedido ao Ajudante restaurado** (15 min / 1 hora + motivo; sem "Permanente" nem campo de código): `POST /api/unblock-requests` com `Idempotency-Key` e timeout de 8 s. A página só diz "enviado" com `202`; qualquer outra resposta diz "Nada foi enviado". O servidor sem Ajudante ligado responde `503` (antes devolvia `202` sem entregar nada).
- Pendente (spec do Ajudante/Telegram): ligar um `onUnblockRequest` real, idempotência persistente e entrega ao Ajudante (seção 8).
