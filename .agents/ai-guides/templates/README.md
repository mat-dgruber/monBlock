# 📦 Templates de Inicialização de Projetos

<div align="center">

[![Category](https://img.shields.io/badge/Category-Templates%20%26%20Boilerplates-0284C7?style=for-the-badge)](../README.md)
[![Compatibility](https://img.shields.io/badge/Compatibility-Claude%20Code%20%7C%20Antigravity%20%7C%20Make-7C3AED?style=for-the-badge)](../README.md)

<p align="center">
  <b>Modelos canônicos de configuração para inicialização rápida de repositórios governados por IA (Dual-Harness e Makefiles padronizados).</b>
</p>

</div>

---

## 📂 Arquivos de Template Disponíveis

```text
templates/
├── AGENTS.md.template          ──> Instruções canônicas para todos os agentes (Claude Code, Gemini CLI, Codex, Cursor…)
├── CLAUDE.md.template          ──> Stub com `@AGENTS.md` (import para o Claude Code)
├── Makefile.api.template       ──> Makefile completo para projetos de Backend (Docker, Ruff, Pytest, Hooks)
├── Makefile.frontend.template  ──> Makefile completo para projetos de Frontend (Lint, Testes, E2E, Builds)
├── settings.claude.json        ──> Hooks mínimos do Claude Code (guardrail Graphify) — instalado pelo /setup
├── settings.gemini.json        ──> Hooks mínimos do Gemini CLI (BeforeTool/AfterTool) — instalado pelo /setup
├── sync-claude-memory.sh       ──> Sincronização de memória local <-> global (Claude/OpenClaude), sem rsync — instalado pelo /setup
├── sync-memory.sh              ──> Sincronização de memória local <-> global (Gemini), sem rsync — instalado pelo /setup
├── pre-commit-memory.sh        ──> Bloco de pre-commit para auto-staging de memórias — instalado pelo /setup
├── setup-subskill.SKILL.md.template ──> Gera skills/setup/setup-<slug>/SKILL.md (sub-skills finas do /setup)
├── graphifyignore              ──> .graphifyignore canônico (Regra de Ouro 1) — instalado por GRAPH-01
├── knowledge-graph-curator.md  ──> Subagente de curadoria do grafo (.claude/agents e .gemini/agents) — GRAPH-06
├── adr/TEMPLATE.md             ──> Template canônico de ADR em 8 seções — instalado em docs/adrs/ por ADR-02 se o projeto está sem template próprio
├── adr/generate_adr_index.py   ──> Gera docs/adrs/README.md — instalado em .agents/scripts/adr/ por ADR-03
├── adr/validate_adrs.py        ──> Linter de ADRs (CI e verify) — instalado em .agents/scripts/adr/ por ADR-03
├── adr/adr-lint.yml            ──> Workflow GitHub Actions de validação de ADRs — ADR-06 (opcional)
├── CHANGELOG.md.template       ──> Keep a Changelog + SemVer 2.0.0 — instalado por SEMVER-01
├── commit-msg-conventional.sh  ──> Hook commit-msg validando Conventional Commits — SEMVER-03 (opcional)
├── semver_check.py             ──> Verifica versão SemVer no manifesto do projeto — SEMVER-02
├── testing/pytest-ci.yml       ──> Workflow GitHub Actions de pytest com cobertura — TESTB-07 (opcional)
├── testing/frontend-ci.yml     ──> Workflow GitHub Actions typecheck + test:ci + Playwright — TESTF-07 (opcional)
├── testing/playwright.config.ts──> Config mínima do Playwright E2E — TESTF-05 (opcional)
├── testing/{npm_script,check_toml}.py ──> Helpers de verificação (scripts npm e TOML válido)
├── harness/{protect-secrets,verify-semver,verify-docs}.sh ──> Scripts de governança do harness N3 — HN3-03
├── harness/governance-hooks.json ──> Hooks de bloqueio e lint zero-turn para merge no settings.json — HN3-04/05/06
├── harness/notification-hook.json ──> Hook Notification (terminal-notifier) — NOTIF-02
├── harness/gemini-mcp.json      ──> MCPs e flags experimentais do Gemini CLI — HN3-08 (opcional)
├── harness/core-skills.md       ──> Regras always-on de .agents/rules — HN3-07
├── harness/env.example          ──> Base de .env.example com referências op:// — HN3-11 / OP-04
├── harness/PULL_REQUEST_TEMPLATE.md ──> Checklist canônico do ciclo de vida — LIFE-01
├── ai-jail.toml                 ──> Configuração .ai-jail do sandbox — JAIL-02
├── install_dep.sh               ──> Instala um comando com o gerenciador do SO (brew/winget/scoop/choco/apt/dnf/yum/pacman/zypper/apk)
├── detect_stack.sh              ──> Detecta backend/frontend/api/java/mobile/… até 4 níveis (monorepos); legacy = Java até o 8, PHP até o 7 ou sem Composer, Delphi, e sai dos outros alvos; --list imprime os diretórios
├── in_each.sh                   ──> Roda um `when`/`verify` em cada subprojeto detectado (--any para gatilho, --all para prova)
├── detect_test_cmd.sh           ──> Descobre a suíte de testes já existente (make test, pytest via poetry/uv/pip, pest, go, cargo, npm run test:ci/test)
├── test_baseline.sh             ──> save (Fase 4) / check (G6): só falha nova (por id de teste) bloqueia; pytest segue depois de erro de coleta; acusa baseline cego; lint do projeto verde antes e vermelho depois bloqueia
├── graph_smoke.sh               ──> Smoke do Graphify: consulta o primeiro nó do grafo e exige linhas NODE — GRAPH-09 e G6
├── harness/merge_agent_md.py    ──> Cria/completa AGENTS.md (semeia de CLAUDE.md/GEMINI.md) sem perder conteúdo do projeto e `--migrate` enxuga o CLAUDE.md para o stub e absorve o GEMINI.md; tira os make X sem alvo no Makefile (os de memória do HN3-09 ficam) — HARNESS-05/06
├── harness/gemini_context.py    ──> Aponta o Gemini para o AGENTS.md: context.fileName em .gemini/settings.json — HARNESS-08
├── harness/merge_hooks.py       ──> Mescla hooks de um template no settings.json sem perder nem duplicar (--event/--matcher/--replace; --check só confere) — GRAPH-04/05, HN3-04/05/06, NOTIF-02
├── harness/migrate_skills.sh    ──> Migra skills locais para .agents/skills/<nome>/SKILL.md sem perder nada (--check para o verify) — HARNESS-04
├── harness/verify_hooks.py      ──> Smoke test dos hooks: schema {evento: [{matcher, hooks}]}, binários no PATH ou por caminho, scripts sem erro — HARNESS-16
├── rules/<slug>.md              ──> 15 checklists always-on instalados em .agents/rules/ (ARCH/SYSD/RESIL/ZT/DOM/UI/UX/PD/TABLE/DASH/GLASS/PM/SCALAR/MOB/DDDP-01); `ddd-pragmatico.md` declara precedência sobre A.1/A.3 do clean-code
├── architecture/check_ruff_rules.py ──> Verifica códigos em [tool.ruff.lint] select/extend-select (--declared: ruff nas deps) — ARCH-02, RESIL-02, ZT-06
├── architecture/system-design.md ──> Esqueleto do 4-Step Blueprint em docs/architecture/ — SYSD-02
├── architecture/gitleaks.yml    ──> Workflow GitHub Actions de scanner de segredos — ZT-03 (opcional)
├── architecture/domains/{overview,business-rules,tech-design}.md ──> Esqueletos DDD para docs/domains/_template/ — DOM-01
├── architecture/validate_domains.py ──> Linter de docs/domains/ em .agents/scripts/domains/ — DOM-02
├── architecture/ddd_detect.sh   ──> Declaração/detecção do estilo DDD enxuto (modos adotado, declarado, uow, use_cases, adr-estilo; manifesto vence ADR) — `when` das DDDP, ARCH-03 e Fase 0 do /setup
├── architecture/check_ddd_pragmatico.py ──> Fiscaliza commit/transação curta/stores/HTTP em Use Cases e UoW (DDDP-R1..R4, W1; --self-test) em .agents/scripts/architecture/ — DDDP-03
├── design/tokens.css            ──> Escala --z-*, tokens dos 3 temas, forced-colors e safety checks sensoriais — UI-02
├── design/stylelintrc.json      ──> Stylelint anti-hex/px/z-index literal — UI-06 (opcional)
├── design/a11y.spec.ts          ──> Auditoria axe-core WCAG 2.2 AA no Playwright — UI-05 (opcional)
├── testing/npm_dep.py           ──> Helper: pacote presente em dependencies/devDependencies — UI-04/05/06
├── product/PRD-TEMPLATE.md      ──> PRD com critérios BDD em docs/product/ — PM-02
├── integrations/openapi_diff.mjs ──> Script @scalar/openapi-diff para o CI — SCALAR-04 (opcional)
└── integrations/openapi-diff.yml ──> Workflow que bloqueia breaking changes no contrato — SCALAR-04 (opcional)
```

---

## 📋 Detalhamento dos Templates

| Template | Propósito & Escopo | Como Utilizar |
| :--- | :--- | :--- |
| [`AGENTS.md.template`](AGENTS.md.template) | Fonte única das instruções do projeto para todos os agentes: diretrizes canônicas de engenharia, regras de preservação de código, padrões de commit, mapa de comandos rápidos e convenção de artefatos de IA em `docs/ai/`. O `/setup` (HARNESS-05) exige todas as suas seções `##` no `AGENTS.md`, acrescentando só as que faltam e preservando o conteúdo do projeto (semeia de `CLAUDE.md`/`GEMINI.md` existentes). | Copie para a raiz do seu projeto como `AGENTS.md`. |
| [`CLAUDE.md.template`](CLAUDE.md.template) | Stub que só importa `@AGENTS.md`, para o Claude Code carregar o `AGENTS.md` (ele ignora o `AGENTS.md` quando existe `CLAUDE.md` sem o import). O `/setup` (HARNESS-06, `--migrate`) enxuga um `CLAUDE.md` existente para esse stub depois de provar que nada se perde. | Copie para a raiz do seu projeto como `CLAUDE.md`. |
| [`Makefile.api.template`](Makefile.api.template) | Makefile profissional para backend cobrindo: ciclo de desenvolvimento Docker, checagem estática com Ruff/Mypy, suíte de testes assíncronos, migrations defensivas Alembic, automação de hooks de memória e sandbox `ai-jail`. | Copie para a raiz do seu projeto backend como `Makefile`. |
| [`Makefile.frontend.template`](Makefile.frontend.template) | Makefile profissional para frontend cobrindo: scripts de build, linter/format, testes unitários, suíte E2E com Playwright, auditoria de acessibilidade e setup de ambiente. | Copie para a raiz do seu projeto frontend como `Makefile`. |
| [`settings.claude.json`](settings.claude.json) / [`settings.gemini.json`](settings.gemini.json) | Hooks mínimos de ciclo de vida (guardrail "Graphify antes de Grep" e atualização incremental do grafo) para cada harness; o do Gemini também traz `context.fileName` (`AGENTS.md`, `GEMINI.md`), que o `harness/gemini_context.py` mescla em settings existentes. | Instalados automaticamente pelas heurísticas `HARNESS-07`/`HARNESS-08` do `/setup`; ou copie para `.claude/settings.json` e `.gemini/settings.json`. |
| [`sync-claude-memory.sh`](sync-claude-memory.sh) / [`sync-memory.sh`](sync-memory.sh) / [`pre-commit-memory.sh`](pre-commit-memory.sh) | Fonte canônica dos scripts de sincronização de memória e do bloco de pre-commit descritos em `guides/essentials/guia-completo-harness-commit-memoria.md` (sem rsync: roda no Git Bash do Windows). | Instalados pelas heurísticas `HARNESS-09`/`HARNESS-10` do `/setup`. |
| [`setup-subskill.SKILL.md.template`](setup-subskill.SKILL.md.template) | Template das sub-skills finas do `/setup` (placeholders `{{slug}}`, `{{descricao}}`, `{{guia}}`). | `sed` dos placeholders → `skills/setup/setup-<slug>/SKILL.md`. Toda a lógica fica no bloco de heurísticas do guia. |
| [`graphifyignore`](graphifyignore) / [`knowledge-graph-curator.md`](knowledge-graph-curator.md) | Exclusões canônicas do grafo (`docs/`, `.agents/`, `*.md`, caches) e subagente de curadoria descritos em `guides/essentials/guia-graph-engineering.md`. | Instalados pelas heurísticas `GRAPH-*` do `/setup`. |
| [`adr/`](adr/) | Template canônico de ADR, gerador de índice, linter e workflow de CI descritos em `guides/essentials/guia-padrao-criacao-adrs.md`. | Instalados pelas heurísticas `ADR-*` do `/setup`; `python3 .agents/scripts/adr/validate_adrs.py` no CI. |
| [`harness/`](harness/) / [`ai-jail.toml`](ai-jail.toml) | Scripts de governança, hooks de bloqueio/notificação, MCPs do Gemini, regras always-on, `.env.example`, template de PR e `.ai-jail` descritos em `guides/ai-engineering/`. | Instalados pelas heurísticas `HN3-*`, `JAIL-*`, `NOTIF-*`, `OP-*` e `LIFE-*` do `/setup`. |
| [`testing/`](testing/) | Workflows de CI (pytest / frontend), config mínima do Playwright e helpers de verificação descritos em `guides/testing/`. | Instalados pelas heurísticas `TESTB-*`/`TESTF-*` do `/setup`. |
| [`install_dep.sh`](install_dep.sh) / [`detect_stack.sh`](detect_stack.sh) / [`in_each.sh`](in_each.sh) / [`detect_test_cmd.sh`](detect_test_cmd.sh) / [`test_baseline.sh`](test_baseline.sh) | Helpers usados pelas heurísticas e pelo `/setup`: instalação de dependências multiplataforma, detecção de stack em monorepos, execução por subprojeto, descoberta da suíte de testes existente e comparação baseline × G6. | Chamados nos `do`/`when`/`verify` dos guias; use `sh templates/detect_stack.sh frontend --list` para inspecionar. |
| [`rules/`](rules/) | Checklists literais dos guias de `architecture/`, `design-ui-ux/`, `product-management/` e `integrations/`, instalados como regras always-on em `.agents/rules/<slug>.md`. | Instalados pela heurística `-01` (ou `-03`/`-05`) de cada guia via `/setup`. |
| [`architecture/`](architecture/) | Helper de regras do Ruff, esqueleto de System Design, workflow gitleaks, esqueletos DDD, validador de domínios, `ddd_detect.sh` e `check_ddd_pragmatico.py` descritos em `guides/architecture/`. | Instalados pelas heurísticas `ARCH-*`, `SYSD-*`, `ZT-*`, `DOM-*` e `DDDP-*` do `/setup`. |
| [`design/`](design/) | `tokens.css` (3 temas, `--z-*`, safety checks), Stylelint anti-hardcode e spec axe-core descritos em `guides/design-ui-ux/`. | Instalados pelas heurísticas `UI-*` do `/setup`. |
| [`product/`](product/) / [`integrations/`](integrations/) | Template de PRD com BDD e CI `openapi-diff` descritos em `guides/product-management/` e `guides/integrations/`. | Instalados pelas heurísticas `PM-*` e `SCALAR-*` do `/setup`. |
| [`CHANGELOG.md.template`](CHANGELOG.md.template) / [`commit-msg-conventional.sh`](commit-msg-conventional.sh) | Changelog Keep a Changelog e hook `commit-msg` de Conventional Commits descritos em `guides/essentials/semver-versioning-guide.md`. | Instalados pelas heurísticas `SEMVER-*` do `/setup`. |

---

## 🚀 Como Configurar em Qualquer Projeto (Qualquer Stack)

> ⚡ **Caminho recomendado:** instale o plugin (passo 1) e rode `/setup` dentro do projeto. Ele cria o `AGENTS.md` do template (ou, se já existir, só acrescenta as seções que faltam, sem tocar no conteúdo do projeto; semeia de `CLAUDE.md`/`GEMINI.md` existentes), reduz o `CLAUDE.md` a `@AGENTS.md` e aponta o Gemini via `context.fileName`, instala hooks, scripts de memória, pre-commit e a estrutura `.agents/` (heurísticas `HARNESS-01..16`), e prova tudo com `verify_setup.py verify --all`. Os passos 2 e 3 abaixo são o equivalente manual.

### 1. Instalar o Plugin de Skills no Projeto

> 🔐 **Repositório Privado & Autenticação Git:**
> O comando `marketplace add` executa um `git clone` HTTPS não-interativo. Ter o `~/.npmrc` configurado autentica apenas pacotes npm, não operações Git. Caso a máquina não possua credenciais salvas no Git, cadastre o token do seu `~/.npmrc` com `git config --global credential.helper store && echo "https://SEU_USUARIO:TOKEN@github.com" >> ~/.git-credentials && chmod 600 ~/.git-credentials` (ou use a URL SSH).

No terminal do seu projeto, execute os comandos nativos do OpenClaude ou Claude Code:

```bash
# 1. Registrar o catálogo institucional da Casa Publicadora Brasileira (HTTPS ou SSH)
openclaude plugin marketplace add Casa-Publicadora-Brasileira/ai-guides
# Alternativa via SSH:
# openclaude plugin marketplace add git@github.com:Casa-Publicadora-Brasileira/ai-guides.git

# 2. Instalar a biblioteca de skills no escopo do projeto (salvo em .claude/settings.json)
openclaude plugin install ai-guides-suite@ai-engineering-skills-library --scope project
```

> 💡 **Instalação Global (Opcional):** Se preferir que as skills estejam disponíveis em qualquer pasta sem configurar por projeto, utilize `--scope user`.

---

### 2. Copiar as Diretrizes Canônicas de Agentes (Dual-Harness)

A partir da raiz deste repositório de guias:

```bash
# Copiar instruções unificadas de governança para a raiz do seu projeto
cp templates/AGENTS.md.template /caminho/para/seu-projeto/AGENTS.md
cp templates/CLAUDE.md.template /caminho/para/seu-projeto/CLAUDE.md
```

---

### 3. Copiar o Makefile Padronizado (Opcional por Stack)

```bash
# Para microsserviços / APIs Backend:
cp templates/Makefile.api.template /caminho/para/seu-projeto/Makefile

# Para aplicações Frontend:
cp templates/Makefile.frontend.template /caminho/para/seu-projeto/Makefile
```
