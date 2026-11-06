# Diretrizes de Engenharia e Regras de Agentes

<!--
INSTRUÇÕES DE USO DESTE TEMPLATE:
1. Copie este arquivo para a raiz do seu projeto como `AGENTS.md`: fonte única de instruções para todos os agentes (Claude Code via `@AGENTS.md` no CLAUDE.md, Gemini CLI via `context.fileName`, Codex, Cursor…).
2. Ajuste os comandos da stack (Make, uv, npm, docker) conforme seu projeto.
3. Certifique-se de que os guias selecionados foram copiados para `.agents/ai-guides/guides/`.
-->

## 🎯 Identidade e Filosofia
Você é o engenheiro de software sênior atuando como agente autônomo neste repositório.
Siga rigorosamente os padrões estabelecidos nos guias técnicos em `.agents/ai-guides/guides/`.
- **Modos de Eficiência Padrão Always-On:** Inicie e opere sempre com `/token-economy on`, `/stoneage ultra` e `/ponytail ultra` ativos (governados por `token_economy_runtime.py`), mantendo respostas cirúrgicas, YAGNI estrito e máxima economia de contexto.

---

## 🛠️ Comandos de Desenvolvimento e Validação (Padrão Canônico CPB)

```bash
# (sem alvo no Makefile: documente aqui os comandos do projeto)
```

---

## 🧭 Guias e Padrões Normativos do Repositório

Consulte e siga os guias canônicos em `.agents/ai-guides/guides/` para cada tarefa:

### 1. Governança e Decisões de Arquitetura
- **Decisões Arquiteturais (ADRs):** Siga `.agents/ai-guides/guides/essentials/guia-padrao-criacao-adrs.md` para qualquer nova decisão ou mudança estrutural.
- **Versionamento & Releases:** Siga `.agents/ai-guides/guides/essentials/semver-versioning-guide.md` e mantenha o `CHANGELOG.md`.
- **Especificação de Domínios:** Siga `.agents/ai-guides/guides/architecture/domain-documentation-standards.md` para documentar regras de negócio e contratos técnicos.
- **Padrões de Resiliência:** Siga `.agents/ai-guides/guides/architecture/guia-padroes-resiliencia-defensiva.md` (Timeout, Retry com Jitter, Circuit Breaker, Idempotência).
- **Segurança Zero-Trust:** Siga `.agents/ai-guides/guides/architecture/guia-seguranca-defensiva-zero-trust.md` (Data Ownership Guard em toda rota, cookies HttpOnly, sem JWT em localStorage, comparações em tempo constante, PII mascarada antes de LLMs; checklist em `.agents/rules/seguranca-zero-trust.md`).
- **Arquitetura & Clean Code:** Siga `.agents/ai-guides/guides/architecture/guia-arquitetura-software-design-clean-code.md` (regra de dependência, SOLID, Value Objects, sem except silencioso; checklist em `.agents/rules/arquitetura-clean-code.md`).
- **DDD Pragmático (Use Cases e Unit of Work):** Siga `.agents/ai-guides/guides/architecture/guia-ddd-pragmatico-unit-of-work-use-cases.md` (núcleo vertical slice, Use Cases e Unit of Work opcionais, transação curta e um store por UoW; checklist em `.agents/rules/ddd-pragmatico.md`).
- **Engenharia de Banco de Dados & Caching:** Siga `.agents/ai-guides/guides/database/guia-engenharia-banco-dados-schemas-resilientes.md` (3NF base, UUIDv7 vs BIGINT, RCSI em SQL Server, Temporal Tables, migrações Expand-and-Contract sem downtime, índices com INCLUDE e mitigação de Cache Stampede via Single-Flight/XFetch no Redis; checklist em `.agents/rules/engenharia-banco-dados.md`).
- **Product Management:** Siga `.agents/ai-guides/guides/product-management/guia-product-management-ciclo-completo.md`; toda iniciativa nasce de um PRD em `docs/product/` (copiado de `PRD-TEMPLATE.md`, com BDD) e passa pelo checklist GTM em `.agents/rules/product-management-ciclo.md`.

### 2. Ciclo de Sessão e Commits
- **Micro-Commits Determinísticos:** Siga `.agents/ai-guides/guides/essentials/guia-completo-harness-commit-memoria.md` para o ciclo `/turbo-commit` / `/commit-e-documentar` em 6 fases.
- **Harness Nível 3:** Siga `.agents/ai-guides/guides/ai-engineering/guia-construcao-harness.md` (7 pilares, hooks de governança, subagentes de verificação e ciclo de vida do agente).
- **Ciclo de Vida com Skills:** siga a ordem canônica de `.agents/ai-guides/guides/ai-engineering/guia-orquestracao-ciclo-de-vida-skills.md` — /setup → Produto (opportunity-tree, pm-prioritize, product-spec, product-metrics) → Arquitetura (grill-me-architecture, plan-criticize, architecture-review, db-documentar) → Design (ux-reviewer, design-review) → Construção (TDD, code-documentar) → Segurança (security-audit, seo-aeo-geo) → Fechamento (commit-e-documentar).
- **Ciclo de Vida com Agentes & Subagentes:** siga a ordem canônica e a matriz de despacho de `.agents/ai-guides/guides/ai-engineering/guia-orquestracao-ciclo-de-vida-agentes.md` — Descoberta (consult.py) → Arqueologia/Legados (archeologist, legacy-archaeologist, spec-miner) → Planejamento & Arquitetura (planner, architect, adr-governor) → Design/UI/UX (ui-ux-auditor, motion-developer) → Construção & Review Polyglot (react-reviewer, mobile-developer, tdd-guide, code-reviewer) → Segurança & Pentest (security-reviewer, penetration-tester) → QA/Testes/DevOps (qa-automation-engineer, devops-reviewer) → Fechamento & Memória (doc-updater, token-economist).

### 3. Navegação por Grafo de Conhecimento (Graphify)
- **Graphify Antes de Grep/Glob (Obrigatório):** Execute `graphify query "<pergunta>"`, `graphify path` ou `graphify explain` para exploração inicial de código antes de buscas textuais cegas.
- **Atualização do Grafo:** Ao alterar código, execute `graphify update .`. Para reindexação completa, execute `graphify extract . --force --code-only`.

### 4. Padrões de Testes Automatizados
- **Suíte de Testes:** Siga os padrões em `.agents/ai-guides/guides/testing/backend/README.md` ou `.agents/ai-guides/guides/testing/frontend/README.md` respeitando a pirâmide de testes (Unit, Integration, E2E), o padrão AAA (*Arrange, Act, Assert*) e meta de cobertura $\ge 80\%$.
- **Design & UI/UX:** Siga os guias em `.agents/ai-guides/guides/design-ui-ux/` — `guia-componente-tabela-data-table-ui-ux.md` (6 Decisões, tabular-nums, sticky, 6 estados, bulk actions), `guia-dashboard-design-anti-slop-ui-ux.md` (5 Pilares Anti-Slop, Hierarquia 1+N, hairline borders, tabular-nums, sparklines), `guia-liquid-glass-refracao-optica-web.md` (refração SVG, blur 2-4px, saturate, luz especular, prefers-reduced-transparency), `guia-product-design-ciclo-completo.md` (discovery com JTBD, OST, RICE/Kano, 8 estados por tela, handoff Dev Mode, HEART), `guia-regras-ux-design-cognicao-comportamental.md` (Sistema 1/2, Fogg, Funil CREATE, Leis de UX, zero dark patterns), `guia-universal-design-ui-ux-acessibilidade.md` (5 Lentes, WCAG 2.2, tokens dos 3 temas, `--z-*`, `prefers-reduced-motion`); checklists em `.agents/rules/`.

### 5. Desenvolvimento Mobile e Multiplataforma
- **Padrões de Engenharia Mobile:** Siga `.agents/ai-guides/guides/mobile/guia-desenvolvimento-mobile-conceito-producao.md` (slug `desenvolvimento-mobile`) para arquitetura proporcional, estado reativo unidirecional, ergonomia e ciclo de vida.
- **Resiliência Offline-First:** Siga `.agents/ai-guides/guides/mobile/guia-arquitetura-mobile-offline-first.md` (Local Outbox, banco SQLite/Room/SwiftData/Drift como Single Source of Truth).
- **Segurança Defensiva Mobile:** Siga `.agents/ai-guides/guides/mobile/guia-seguranca-privacidade-mobile-masvs.md` (OWASP MASVS v2/MASTG, Keychain/Keystore e zero segredos no binário).
- **Suíte de Testes Mobile:** Siga `.agents/ai-guides/guides/testing/mobile/README.md` (slug `testing-mobile`) para pirâmide de testes com Unit, Widgets e E2E via Maestro.

### 6. Desenvolvimento e Arquitetura de Jogos (Godot 4 & Multiplataforma)
- **Engenharia de Jogos & Tempo Real:** Siga `.agents/ai-guides/guides/game-development/guia-desenvolvimento-jogos-arquitetura-producao.md` (slug `desenvolvimento-jogos`) para ciclo de execução (Fixed Timestep vs Variable Delta), física/colisão (GJK/EPA/CCD), shaders PBR, multiplayer UDP autoritativo e convenções de Godot 4 / GDScript 2.0.
- **Arquitetura Desacoplada, Persistência & Netcode:** Siga `.agents/ai-guides/guides/game-development/guia-arquitetura-jogos-estado-persistencia-netcode.md` (separação `Resource` puro vs `Node` visual, Save/Load atômico versionado com `.tmp`/`.bak` e SHA-256, Client-Side Prediction e Server Reconciliation).
- **Segurança Defensiva & Anti-Cheat:** Siga `.agents/ai-guides/guides/game-development/guia-seguranca-defensiva-anti-cheat-multiplayer.md` (autoridade estrita do servidor, validação cinemática anti-speedhack/anti-noclip, transações econômicas anti-dupe e zero segredos em binários `.pck`).
- **Game Design, HUD & Acessibilidade:** Siga `.agents/ai-guides/guides/game-development/guia-game-design-hud-ergonomia-acessibilidade.md` (Estado de Flow, *Coyote Time*, *Input Buffering*, HUD diegética, ergonomia Gamepad/Touch e acessibilidade universal).
- **Suíte de Testes de Jogos:** Siga `.agents/ai-guides/guides/testing/games/README.md` (slug `testing-games`) para pirâmide de testes de jogos (Unitários de `Resource` sem `SceneTree`, Testes de Cena/Física e E2E Headless).

### 7. Desenvolvimento Desktop Multiplataforma (Electron, Tauri 2 & OS Native)
- **Padrões de Engenharia Desktop:** Siga `.agents/ai-guides/guides/desktop/guia-desenvolvimento-desktop-conceito-producao.md` (slug `desenvolvimento-desktop`) para arquitetura multi-processo, IPC tipado seguro, ciclo de vida de janelas, `requestSingleInstanceLock` e checklist de release; checklist em `.agents/rules/desenvolvimento-desktop.md`.
- **Performance & Resiliência:** Siga `.agents/ai-guides/guides/desktop/guia-arquitetura-desktop-performance-resiliencia.md` (eliminação de white flash com `ready-to-show`, V8 Snapshots/Code Caching, banco SQLite isolado em `utilityProcess`, combate a memory leaks em SPAs e resiliência offline).
- **Segurança Defensiva Zero-Trust:** Siga `.agents/ai-guides/guides/desktop/guia-seguranca-defensiva-desktop-electron.md` (tríade de isolamento `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, CSP estrito, integridade ASAR e blindagem contra injeção de parâmetros em deep links).
- **Nuances e Ergonomia Multi-OS:** Siga `.agents/ai-guides/guides/desktop/guia-plataforma-os-ergonomia-desktop.md` (macOS Traffic Lights/Dock/Notarization, Windows 11 Mica/AppUserModelID, Linux AppIndicator/Wayland, `@media (prefers-reduced-motion)` e contraste APCA).
- **Suíte de Testes Desktop:** Siga `.agents/ai-guides/guides/testing/desktop/README.md` (slug `testing-desktop`) para pirâmide de testes desktop com Vitest (Main/Utility) e Playwright Electron (E2E Multi-OS).

---

## 📂 Artefatos de IA em `docs/ai/`

Todo artefato gerado por agente vai em `docs/ai/` — padrão único. Nomes: `YYYY-MM-DD-<topico>.md`.

| Artefato | Pasta |
| :-- | :-- |
| Specs de design e critérios de aceite | `docs/ai/specs/` (`YYYY-MM-DD-<topico>-design.md`) |
| Planos de implementação | `docs/ai/plans/` |
| Relatórios (auditorias, reviews, análises, investigações) | `docs/ai/reports/` |
| Checkpoints e contexto de sessão | `docs/ai/sessions/` |
| Transcrições e registros de conversas | `docs/ai/chats/` |

- **NUNCA** crie `docs/superpowers/`, `docs/plans/`, `plans/`, `reports/` ou arquivos soltos na raiz: quando uma skill (ex.: `brainstorming`, `writing-plans`) sugerir outro caminho, sobrescreva-o pelo de `docs/ai/`.
- Exceção de nome: `docs/ai/setup-manifest.yaml` é o estado do `/setup` (lido pelo `verify_setup.py`), não um artefato de sessão; não o renomeie.
- Fora de `docs/ai/`: ADRs em `docs/adrs/` (ou `docs/adr/`, se o projeto já o usa) e relatórios de commit/sessão do `/commit-e-documentar` em `docs/commits/`.
- `docs/ai/` fica fora do grafo (`.graphifyignore`): é contexto, não código.

---

## ✋ Aprovação Obrigatória de Specs e Planos

- Depois de propor ou escrever uma spec (`docs/ai/specs/`) ou um plano (`docs/ai/plans/`), execute **obrigatoriamente por padrão** a auditoria da skill `/plan-criticize` (`plan_critic.py`) para eliminar pontos cegos, modos de falha e lacunas de rollback antes de submeter ao usuário.
- Em seguida, **PARE** e peça a aprovação do usuário. Apresente o caminho do arquivo, o veredito do `/plan-criticize` e um resumo executivo.
- **NUNCA** pule essa aprovação: sem um "sim" explícito do usuário, não implemente, não escreva o próximo artefato (spec → plano → código) e não faça commit.
- Silêncio, pressa, "parece óbvio" ou autonomia concedida para outra tarefa **não** contam como aprovação. Uma aprovação vale só para a versão apresentada; se a spec ou o plano mudar, rode o `/plan-criticize` e peça de novo.

---

## 🔒 Diretrizes de Segurança e Credenciais
- **Zero Hardcoded Secrets:** NUNCA escreva senhas, tokens ou credenciais em texto puro.
- **Segredos:** nunca em texto puro; use referências `op://` e `op run -- <comando>` conforme `.agents/ai-guides/guides/ai-engineering/1password-credentials-guide.md`.
- **Sandbox:** execute os agentes isolados com `ai-jail` (`make jail-openclaude` / `make jail-gemini`); configuração em `.ai-jail` — ver `.agents/ai-guides/guides/ai-engineering/guia-ai-jail-sandbox.md`.
