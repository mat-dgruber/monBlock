# 📚 Acervo de Guias Técnicos & Padrões Arquiteturais

<div align="center">

[![Guides Count](https://img.shields.io/badge/Guides-45%20Normativos-0284C7?style=for-the-badge)](../README.md#acervo-de-guias-técnicos)
[![Standards](https://img.shields.io/badge/Standards-OWASP%20MASVS%20%7C%20WCAG%20%7C%20SemVer%20%7C%20ADR-10B981?style=for-the-badge)](../README.md)
[![Ecosystem](https://img.shields.io/badge/Architecture-Dual--Harness%20%7C%20Polyglot%20%7C%20Mobile-7C3AED?style=for-the-badge)](../README.md)

<p align="center">
  <b>Biblioteca canônica de padrões técnicos, arquitetura de sistemas, engenharia mobile, gestão de produtos, design e infraestrutura de testes.</b>
</p>

</div>

---

## 📂 Organização das Categorias de Guias

```text
guides/
├── essentials/         ──> ⭐ 4 Pilares mandatórios: Harness/Memória, Graphify, ADRs e SemVer
├── architecture/       ──> 🏛️ Clean Architecture, System Design, Resiliência Defensiva, Segurança Zero-Trust, DDD e DDD Pragmático (Front & Back)
├── database/           ──> 🗄️ Engenharia de Banco de Dados, Schemas Resilientes, RCSI, Temporal Tables e Caching In-Memory (Redis/Garnet)
├── game-development/   ──> 🎮 Desenvolvimento de Jogos: Game Loop, Física/Colisão, Shaders/PBR, Multiplayer UDP & Godot 4
├── mobile/             ──> 📱 Engenharia Mobile: SwiftUI, Compose, Flutter, Expo, UDF, Offline-First & MASVS
├── desktop/            ──> 🖥️ Desenvolvimento Desktop: Electron, Tauri 2, IPC Seguro, V8 Snapshots & Integração Multi-OS
├── design-ui-ux/       ──> 🎨 Design System, Acessibilidade WCAG 2.2 AAA, Regras de UX & Product Design
├── product-management/ ──> 🚀 Gestão de Produto: Descoberta, Estratégia, Dual-Track, Métricas AARRR & Risco
├── ai-engineering/     ──> 🤖 Orquestração de Skills (Zero ao Release), Harness N3, Sandbox e Knowledge Graphs
├── integrations/       ──> 🔌 Integrações de Terceiros, SDKs e Developer Experience (OpenAPI 3.1 & Scalar DX)
└── testing/            ──> 🧪 Suítes de testes para Backend, Frontend, Mobile, Games e Desktop (Playwright Electron)
```

---

## 🗺️ Matriz de Adoção Rápida

```mermaid
graph TD
    Start([🚀 Novo Projeto / Manutenção]) --> Stack{Qual a stack e escopo do projeto?}

    Stack -->|Orquestração End-to-End com IA| AIOrch[0. /setup — harness e guias verificados<br/>1. guides/ai-engineering/guia-orquestracao-ciclo-de-vida-skills.md<br/>2. guides/ai-engineering/guia-orquestracao-ciclo-de-vida-agentes.md<br/>3. Execução das 74 Skills & 39 Subagentes<br/>4. Gestão contínua de Token Economy]
    Stack -->|Banco de Dados & Caching| DBData[1. guides/database/<br/>2. guia-engenharia-banco-dados-schemas-resilientes.md<br/>3. SQL Server RCSI, Temporal Tables & Redis/Garnet]
    Stack -->|Backend / APIs| Back[1. guides/essentials/<br/>2. guides/architecture/<br/>3. guides/testing/backend/<br/>4. templates/Makefile.api.template]
    Stack -->|Frontend / Web| Front[1. guides/essentials/<br/>2. guides/design-ui-ux/<br/>3. guides/testing/frontend/<br/>4. templates/Makefile.frontend.template]
    Stack -->|Mobile / Multiplataforma & Nativo| Mobile[1. guides/essentials/<br/>2. guides/mobile/<br/>3. guides/testing/mobile/<br/>4. OWASP MASVS & Offline-First]
    Stack -->|Desktop Multiplataforma (Electron/Tauri)| Desktop[1. guides/essentials/<br/>2. guides/desktop/<br/>3. guides/testing/desktop/<br/>4. Tríade Zero-Trust & UtilityProcess]
    Stack -->|Desenvolvimento de Jogos (Godot/Unity/Unreal)| Game[1. guides/essentials/<br/>2. guides/game-development/<br/>3. templates/rules/desenvolvimento-jogos.md<br/>4. Desacoplamento Estado vs Nós]
    Stack -->|Product / Design & Discovery| Prod[1. guides/product-management/<br/>2. guides/design-ui-ux/<br/>3. guides/essentials/ (ADRs & SemVer)]
    Stack -->|Full-Stack / Polyglot| Full[1. guides/essentials/<br/>2. guides/architecture/, mobile/ & design-ui-ux/<br/>3. guides/product-management/<br/>4. guides/testing/<br/>5. templates/AGENTS.md e CLAUDE.md]
    Stack -->|Integrações & DX de APIs| Integ[1. guides/integrations/guia-scalar-openapi-dx.md<br/>2. OpenAPI 3.1 & Suíte Oficial Scalar DX]
    Stack -->|Setup de Harness / Sandbox| Harness[1. guides/ai-engineering/<br/>2. ai-jail & notificações<br/>3. Graphify Knowledge Graph]

    AIOrch --> Done([✅ Repositório Governado e Padronizado])
    DBData --> Done
    Back --> Done
    Front --> Done
    Mobile --> Done
    Desktop --> Done
    Game --> Done
    Prod --> Done
    Full --> Done
    Integ --> Done
    Harness --> Done
```

---

## ⚙️ Heurísticas Executáveis

Guias convertidos ao formato determinístico embutem, logo após o título, uma seção `## ⚙️ Heurísticas Executáveis` com um único bloco ```` ```yaml heuristics ````:

```yaml
guide: <slug>            # = nome da sub-skill setup-<slug>
version: 1               # incrementa quando as heurísticas mudam
requires: []             # slugs de guias que devem ser aplicados antes
heuristics:
  - id: PREFIXO-01       # prefixo único por guia
    title: O que garante
    when: "<shell: exit 0 = aplicar>"
    do: "<shell> | agent: <instrução para o agente>"
    verify: "<shell: exit 0 = provado>"
    depends_on: []       # ids do mesmo guia
    optional: false      # true = falha vira ⚠️, não ❌
```

Regras: `when`/`verify` sempre shell (cwd = raiz do projeto, `AI_GUIDES_RUNTIME` no ambiente); `do` nunca mistura shell com `agent:`; `do` shell é executado pelo `verify_setup.py apply` (`sh -c`, stdin fechado, sem TTY, teto de 900 s, status dado pelo `verify`), então tem de ser não interativo e idempotente, e cada `do` novo precisa de teste when → do → verify em fixture (ADR 0003); a prosa original desce para `## 📚 Fundamentos`. Valide com `uv run skills/setup/scripts/verify_setup.py --lint <guia>`; os guias do acervo estão convertidos e aparecem em `verify_setup.py list`, aplicados pelo `/setup`. Piloto: [`essentials/guia-completo-harness-commit-memoria.md`](essentials/guia-completo-harness-commit-memoria.md).

---

## 📋 Resumo das Seções

| Subdiretório | Foco Temático | Guias Chave |
| :--- | :--- | :--- |
| [`essentials/`](essentials/README.md) | Fundamentos & Governança Mandatória | 4 Pilares: Harness & Micro-commits, Graphify (AST), ADRs Canônicos, SemVer 2.0.0. |
| [`architecture/`](architecture/README.md) | Engenharia de Software & Arquitetura | 4 Pilares agnósticos corporativos (Clean Architecture & SOLID, System Design Distribuído, Resiliência Defensiva, DDD, DDD Pragmático com Use Cases e UoW opcionais) e Segurança Zero-Trust com cobertura total de Frontend e Backend. |
| [`game-development/`](game-development/README.md) | Desenvolvimento de Jogos & Tempo Real | Guia Mestre (Conceito à Produção), Arquitetura Desacoplada (`Resource` vs `Node`) & Save Atômico, Segurança Anti-Cheat & Autoridade de Servidor, Game Design/HUD/Acessibilidade e Godot 4. |
| [`desktop/`](desktop/README.md) | Desenvolvimento de Aplicações Desktop | Guia Mestre (Conceito à Produção), IPC Seguro, V8 Snapshots, Resiliência de Processos (utilityProcess) e Integração com Sistemas Operacionais (macOS, Windows, Linux). |
| [`mobile/`](mobile/README.md) | Engenharia & Arquitetura Mobile | Guia Mestre (Conceito à Produção), Clean Architecture Mobile, Resiliência Offline-First (Outbox), Segurança OWASP MASVS e Ergonomia. |
| [`design-ui-ux/`](design-ui-ux/README.md) | Design System, UX & Product Design | Framework das 5 Lentes, Psicologia Cognitiva/Comportamental, WCAG 2.2 AAA e Ciclo Completo de Product Design. |
| [`product-management/`](product-management/README.md) | Gestão & Estratégia de Produtos | Descoberta Contínua, Roadmaps Now/Next/Later, Métricas AARRR & North Star, Matriz de Mendelow e 4 Riscos de Cagan. |
| [`ai-engineering/`](ai-engineering/README.md) | Engenharia de Agentes & Harness | Orquestração do Ciclo de Vida das Skills (Zero ao Release), Construção de Harness Nível 3, Sandbox ai-jail, Knowledge Graphs, Notificações. |
| [`integrations/`](integrations/README.md) | Integrações, Ferramentas & DX | Padrões canônicos institucionais de ferramentas externas, OpenAPI 3.1 com suíte oficial `@scalar` (FastAPI, Express, Hono, SPAs e CDN). |
| [`testing/`](testing/README.md) | Infraestrutura & Padrões de Testes | Padrão AAA Backend (Pytest/Pest), Frontend (Karma/Signals/Playwright), Mobile (Compose/SwiftUI/Flutter/Maestro), Games (GUT/gdUnit4/Unity Headless), Desktop (Playwright Electron) e Troubleshooting. |
