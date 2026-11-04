# ⭐ Guias Técnicos Essenciais

<div align="center">

[![Category](https://img.shields.io/badge/Category-Essentials-F59E0B?style=for-the-badge)](../../README.md)
[![Compliance](https://img.shields.io/badge/Compliance-Mandatory%20Standards-10B981?style=for-the-badge)](../../README.md)

<p align="center">
  <b>Diretrizes obrigatórias recomendadas para qualquer projeto de software assistido por IA: governança operacional, grafos de conhecimento, versionamento semântico, decisões arquiteturais (ADRs) e persistência de memória.</b>
</p>

</div>

---

## 📂 Guias Disponíveis no Diretório

```text
guides/essentials/
├── guia-completo-harness-commit-memoria.md──> Micro-commits em 6 fases, ADRs e memória persistente
├── guia-graph-engineering.md              ──> Navegação por Knowledge Graph via AST (-70% tokens)
├── guia-padrao-criacao-adrs.md            ──> Padrão canônico de ADRs com 6 gatilhos determinísticos
└── semver-versioning-guide.md             ──> Versionamento SemVer 2.0.0, tags e changelog
```

---

## 📋 Detalhamento dos Guias

> ⚙️ Os 4 guias deste diretório têm **Heurísticas Executáveis** (slug ao lado do nome) e são aplicados/provados pelo `/setup` na ordem `harness-commit-memoria` → `graph-engineering` · `padrao-criacao-adrs` → `semver-versioning`. Todos são **obrigatórios** na matriz do `/setup`. `harness-commit-memoria` instala as dependências do harness em qualquer SO (`uv`, `graphify`, `jq` via `templates/install_dep.sh`) e prova que **todos os hooks rodam** (HARNESS-16, `verify_hooks.py`); `graph-engineering` gera o grafo e prova que o **Graphify responde** a uma consulta (GRAPH-08/09).


| Guia Técnico | Descrição & Propósito |
| :--- | :--- |
| [`guia-completo-harness-commit-memoria.md`](guia-completo-harness-commit-memoria.md) ⚙️ `harness-commit-memoria` | Governança operacional de Harness, micro-commits determinísticos, persistência de memória em dois escopos (privado vs equipe), single source of truth para skills e orquestração do ciclo de desenvolvimento em 6 fases. **v1.5.2:** abre com a seção `## ⚙️ Heurísticas Executáveis` (16 heurísticas `HARNESS-01..16`, slug `harness-commit-memoria`), aplicada pelo `/setup` via `setup-harness-commit-memoria` e provada por `verify_setup.py`; é o guia piloto do formato. **v1.6.0:** HARNESS-05/06/08 tornam o `AGENTS.md` a instrução única (o `CLAUDE.md` vira o stub `@AGENTS.md` e o Gemini lê o `AGENTS.md` via `context.fileName`). HARNESS-05 exige o `AGENTS.md` no padrão completo do template, incluindo a convenção `docs/ai/{specs,plans,reports,sessions,chats}` para artefatos de IA, sempre mesclando via `templates/harness/merge_agent_md.py`: o conteúdo customizado do projeto é preservado e o `verify` falha se alguma linha versionada sumir. HARNESS-04 migra skills locais (arquivo plano ou pasta) para `.agents/skills/<nome>/SKILL.md` via `templates/harness/migrate_skills.sh`, sem apagar nada. |
| [`guia-graph-engineering.md`](guia-graph-engineering.md) ⚙️ `graph-engineering` | Manual canônico de Graph Engineering com Graphify: navegação relacional por AST, exclusão estrita de `docs/`, recálculo forçado do zero em mudanças estruturais e hook-guards determinísticos. |
| [`guia-padrao-criacao-adrs.md`](guia-padrao-criacao-adrs.md) ⚙️ `padrao-criacao-adrs` | Padrão canônico para criação de Architecture Decision Records (ADRs), definindo os 6 gatilhos objetivos de decisão arquitetural e o template formal em 8 seções em `docs/adrs/`. **v2.1.1:** templates legados (`template-adr.md`) nunca são reprovados, renomeados ou apagados pelo `/setup`. **v2.1.2:** o `/setup` só cria `docs/adrs/TEMPLATE.md` quando o projeto não tem template próprio. |
| [`semver-versioning-guide.md`](semver-versioning-guide.md) ⚙️ `semver-versioning` | Especificação técnica de versionamento semântico (SemVer 2.0.0), fluxo de tags Git, mapeamento com Conventional Commits e padronização do arquivo `CHANGELOG.md` (*Keep a Changelog*). |
