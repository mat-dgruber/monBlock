# 🤖 Guias de Engenharia de IA, Harness & Sandboxing

<div align="center">

[![Category](https://img.shields.io/badge/Category-AI%20Engineering%20%26%20Harness-7C3AED?style=for-the-badge)](../../README.md)
[![Harness Level](https://img.shields.io/badge/Harness%20Maturity-Level%203%20(Robusto)-10B981?style=for-the-badge)](guia-construcao-harness.md)

<p align="center">
  <b>Padrões de engenharia para infraestrutura de agentes inteligentes, isolamento em sandbox, notificações visuais/sonoras e navegação relacional por Knowledge Graphs.</b>
</p>

</div>

---

## 📂 Guias Disponíveis no Diretório

```text
guides/ai-engineering/
├── guia-orquestracao-ciclo-de-vida-agentes.md       ──> Orquestração do ciclo de vida e despacho dos 39 subagentes (Do Zero ao Release)
├── guia-orquestracao-ciclo-de-vida-skills.md        ──> Orquestração do ciclo de vida das 65 skills (Do Zero ao Release)
├── guia-construcao-harness.md                     ──> Arquitetura e os 7 Pilares de Harness Nível 3
├── guia-ai-jail-sandbox.md                        ──> Isolamento e contenção segura em sandbox (ai-jail)
├── guia-configuracao-notificacoes-openclaude.md   ──> Notificações desktop diretas via terminal-notifier
└── 1password-credentials-guide.md                 ──> Injeção segura de credenciais via 1Password CLI (op)
```

> 💡 **Nota sobre Graph Engineering**: O guia canônico de Knowledge Graphs e Graphify foi promovido para os guias essenciais do repositório: veja [`guides/essentials/guia-graph-engineering.md`](../essentials/guia-graph-engineering.md).

---

## 📋 Detalhamento dos Guias

> ⚙️ Os 6 guias deste diretório têm **Heurísticas Executáveis** aplicadas pelo `/setup`: `construcao-harness` (HN3-01..12, requer `harness-commit-memoria`, `graph-engineering` e `semver-versioning` — abre com a tabela do que já é coberto por eles), `ai-jail-sandbox` (JAIL-01..05), `notificacoes-openclaude` (NOTIF-01..02, só macOS), `1password-credentials` (OP-01..05), `orquestracao-ciclo-de-vida-skills` (LIFE-01..02) e `orquestracao-ciclo-de-vida-agentes` (AGNT-01..02).


| Guia Técnico | Descrição & Propósito |
| :--- | :--- |
| [`guia-orquestracao-ciclo-de-vida-agentes.md`](guia-orquestracao-ciclo-de-vida-agentes.md) ⚙️ `orquestracao-ciclo-de-vida-agentes` | **Guia Mestre de Orquestração de Agentes**: Ciclo de vida, padrões topológicos de despacho, isolamento em Git Worktrees, Fresh Context e matriz canônica dos 39 subagentes do zero ao release. |
| [`guia-orquestracao-ciclo-de-vida-skills.md`](guia-orquestracao-ciclo-de-vida-skills.md) ⚙️ `orquestracao-ciclo-de-vida-skills` | **Guia Mestre de Orquestração**: Ordem canônica de execução das 65 skills do zero absoluto ao release, dividida em 6 fases cronológicas, gates de transição, cenários de adoção e camada contínua de economia de tokens. |
| [`guia-construcao-harness.md`](guia-construcao-harness.md) ⚙️ `construcao-harness` | Guia mestre sobre a arquitetura de **Harness de Nível 3** (Maduro/Robusto): Filosofia Dual-Harness (Claude Code ↔ Antigravity), os 7 Pilares de sustentação, hooks de ciclo de vida zero-turn, taxonomia de skills e ciclo em 5 fases. |
| [`guia-ai-jail-sandbox.md`](guia-ai-jail-sandbox.md) ⚙️ `ai-jail-sandbox` | Especificação técnica de contenção em sandbox (`ai-jail`) para agentes de IA autônomos, isolando chamadas de sistema, comandos de rede e acessos a arquivos fora do repositório. |
| [`guia-configuracao-notificacoes-openclaude.md`](guia-configuracao-notificacoes-openclaude.md) ⚙️ `notificacoes-openclaude` | Configuração de alertas visuais no desktop macOS via `terminal-notifier` inline no `settings.json`, com ativação no clique e sem necessidade de scripts externos. |
| [`1password-credentials-guide.md`](1password-credentials-guide.md) ⚙️ `1password-credentials` | Guia de injeção segura de credenciais em memória RAM via 1Password CLI (`op run`, `op read`), prevenindo armazenamento físico de segredos em arquivos de configuração locais. |
| [`../essentials/guia-graph-engineering.md`](../essentials/guia-graph-engineering.md) | **Guia Essencial Canônico**: Fundamentos teóricos e operacionais de Graph Engineering via Graphify, exclusão obrigatória de `docs/`, recálculo forçado do zero em mudanças estruturais e hooks de interceptação. |
