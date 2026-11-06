<!--
================================================================================
LOG DE MANUTENÇÃO DE DOCUMENTAÇÃO
--------------------------------------------------------------------------------
Data       | Autor         | Descrição
--------------------------------------------------------------------------------
2026-11-05 | Matheus Diniz | Registro da adoção de DDD pragmático e escopo do Unit of Work.
================================================================================
-->

# ADR 0008: Adoção de DDD Pragmático com Use Cases e Unit of Work

| Metadado | Detalhe |
| :--- | :--- |
| **Status** | **Aprovada** (2026-11-05) |
| **Decisores** | Matheus Diniz |
| **Tags** | `architecture`, `ddd-pragmatico`, `storage` |
| **Impacto Sistêmico** | Médio (arquitetura da aplicação desktop e persistência local) |
| **ADRs Relacionadas** | Complementa ADR-0001 e ADR-0004 |

## Contexto

O monBlock possui domínio explícito e fluxos que coordenam UI Electron, daemon e persistência local. DDD enxuto com organização por vertical slice permite manter regras de domínio próximas aos casos de uso, sem impor a estrutura de camadas rígida e o custo de um modelo Clean/Hexagonal purista em todos os módulos.

## 2. Decisão de Arquitetura

Adotar `backend_style: enxuto`, com `Use Cases` em todos os módulos e `Unit of Work` nos stores transacionais, conforme declarado em `docs/ai/setup-manifest.yaml`. Use Cases dão nomes explícitos às operações e coordenam seus passos; Unit of Work delimita transações curtas de um único recurso relacional. O produto usa SQLite local offline como store relacional.

## Escopo do Unit of Work

| Store | UoW cobre? | Por quê | Consistência entre stores |
| :--- | :--- | :--- | :--- |
| Relacional OLTP (SQLite local offline) | Sim | Delimita a transação do recurso relacional; manter cada transação curta. | Para escrita que atravesse outro store, usar Outbox, evento, saga ou reconciliação idempotente; nunca ampliar o UoW entre stores. |

## Consequências

- A organização vertical slice mantém operações e regras coesas sem exigir abstrações puristas em todos os módulos.
- Use Cases em todos os módulos aumentam a explicitude e o número de pontos de entrada a manter.
- Unit of Work requer disciplina para não manter transações abertas durante I/O externo ou trabalho demorado.
- O checklist `ddd-pragmatico` fiscaliza a adoção. Reavaliar estilo purista se limites de domínio, complexidade de orquestração ou necessidades de teste justificarem o custo adicional.
