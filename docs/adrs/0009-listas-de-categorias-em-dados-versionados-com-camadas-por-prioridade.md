# ADR 0009: Listas de categorias em dados versionados, com camadas por prioridade

| Metadado | Detalhe |
| :--- | :--- |
| **Status** | **Aprovada** (2026-11-06) |
| **Decisores** | Mantenedor (mat-dgruber) |
| **Tags** | `[web_blocking]`, `[dados]`, `[performance]` |
| **ADRs Relacionadas** | Evolui ADR-0002 (3 camadas) |

## Contexto
As categorias tinham 2 a 5 domínios em arrays no TypeScript, duplicados na UI. Listas públicas passam de 900 mil domínios no adult (56 MB de hosts), mas o `URLBlocklist` do Chromium/Edge documenta 1000 entradas e o perfil exige reaprovação do usuário a cada mudança.

## Decisão
1. Uma lista por categoria em `src/domain/lists/<id>.{domains,keywords}.txt`; a **ordem é a prioridade**.
2. `scripts/gen-lists.mjs` valida (falha o build) e gera `lists.generated.ts` (funciona em tsc, esbuild SEA e Vitest).
3. Camadas: perfil = 900 primeiros do adult (`POLICY_DOMAIN_LIMIT`); hosts = até 25 000 domínios, usuário primeiro (`HOSTS_MAX_DOMAINS`); vigia = lista completa por índice de sufixo.
4. A UI lê o catálogo por IPC (`monblock:get-categories`), sem cópia própria.
5. Só se copia dado com licença compatível; o resto é sinal de ranking (`NOTICE`).

## Consequências
Revisão de lista vira diff de texto; o estado do usuário não cresce (guarda só ids). O perfil dos navegadores muda, então quem já o instalou precisa reaprová-lo. A latência do mDNSResponder com 25 mil linhas não foi medida (exige root).

## Alternativas rejeitadas
Arrays maiores no TypeScript (sem validação, diff ilegível); lista baixada em runtime pelo daemon root (rede e superfície de ataque).
