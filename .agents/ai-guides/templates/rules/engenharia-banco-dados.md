# Checklist de Engenharia de Banco de Dados e Caching (`.agents/rules/engenharia-banco-dados.md`)

<!-- Fonte canônica: templates/rules/engenharia-banco-dados.md (guides/database/guia-engenharia-banco-dados-schemas-resilientes.md) — instalado por DBENG-01 -->

Regra always-on: aplique este checklist em modelagem de dados, criação de DDL, migrações e rotas de cache in-memory. Itens abertos bloqueiam a aprovação de PRs e deploys. Guia completo em `.agents/ai-guides/guides/database/guia-engenharia-banco-dados-schemas-resilientes.md`.

## 🚫 Catálogo de Anti-Padrões Fatais (O que NUNCA fazer)

1. ❌ **`SELECT *` em Produção:** Destrói a performance ao forçar I/O de colunas desnecessárias e impedir o uso de Covering Indexes (`INCLUDE`).
2. ❌ **`WITH (NOLOCK)` como Solução de Contenção:** Gera leituras sujas, duplicação de linhas e leitura de transações abortadas. A solução canônica é ativar o **RCSI (`READ_COMMITTED_SNAPSHOT ON`)**.
3. ❌ **`UUIDv4` Randômico em Clustered Index:** Gera fragmentação destrutiva de árvores B-Tree e tempestades de page splits. Use estritamente `UUIDv7` (time-ordered) ou `BIGINT IDENTITY`.
4. ❌ **Migração Destrutiva Direta (`DROP COLUMN` ou `DROP TABLE` em etapa única):** Derruba instâncias ativas da aplicação que mantêm queries em voo. Exija sempre o padrão **Expand and Contract** em 3 fases.
5. ❌ **Criação Bloqueante de Índices:** Criar índices em tabelas de produção sem flags online trava escritas. Exija `WITH (ONLINE = ON)` no SQL Server e `CONCURRENTLY` no PostgreSQL.
6. ❌ **Cache Sem Defesa Contra Cache Stampede (Thundering Herd):** Quando uma chave quente expira, milhares de requisições simultâneas colapsam o banco relacional. Exija Single-Flight Distributed Mutex (`SETNX` com lease) ou algoritmo **XFetch**.
7. ❌ **`KEYS *` ou `DEL` Síncrono de Grandes Estruturas no Redis:** Trava o loop de eventos de thread única do Redis por centenas de milissegundos. Use estritamente `SCAN` iterativo e **`UNLINK`** assíncrono.
8. ❌ **Tipos Cegos e Ilimitados (`NVARCHAR(MAX)` ou `TEXT` para campos com tamanho semântico):** Destrói a estimativa de memória de execução do otimizador de queries. Defina limites precisos e constraints `CHECK`.
9. ❌ **Predicados Não SARGable:** Aplicar funções sobre colunas indexadas no `WHERE` (ex: `WHERE YEAR(Data) = 2026`) invalida o uso de índices (Index Scan em vez de Index Seek).
10. ❌ **Queries N+1 via ORM:** Disparar dezenas ou centenas de consultas SQL individuais dentro de loops em vez de utilizar `JOIN`, `Include` ou consultas em lote com projeção explícita.

---

## ✅ Checklist de Homologação e Code Review de Banco de Dados

Antes de aprovar Pull Requests ou subir novas migrações e rotas de cache para produção, verifique:

- [ ] **Chaves Primárias (PK):** Toda tabela possui PK explícita e sequencial (`BIGINT IDENTITY` para OLTP interno; `UUIDv7` time-ordered para sistemas distribuídos)?
- [ ] **Integridade Soberana no Storage Engine:** Relacionamentos possuem `FOREIGN KEY` explícita com regra clara (`ON DELETE NO ACTION / RESTRICT`)? Status e valores possuem constraints `CHECK` semânticas?
- [ ] **Normalização 3NF:** O schema foi modelado na 3ª Forma Normal? Qualquer desnormalização está formalmente justificada por medições empíricas de profiling?
- [ ] **Concorrência Não Bloqueante (RCSI):** Em SQL Server, a base opera com `READ_COMMITTED_SNAPSHOT ON`? O `tempdb` possui múltiplos data files dimensionados para os núcleos de CPU?
- [ ] **Auditoria por Temporal Tables:** Tabelas com histórico de auditoria utilizam `SYSTEM_VERSIONING = ON` nativo com política de retenção automática configurada?
- [ ] **Índices Compostos e Covering:** A ordem das colunas no índice composto segue **Igualdade $\to$ Faixa/Sort $\to$ `INCLUDE`**?
- [ ] **Zero-Downtime:** A migração segue o ciclo **Expand and Contract** (adição não-destrutiva, escrita dupla, backfill em lote e remoção tardia)?
- [ ] **Índices Online:** A criação de índices em tabelas ativas inclui `WITH (ONLINE = ON)` (SQL Server) ou `CONCURRENTLY` (PostgreSQL)?
- [ ] **Resiliência do Cache In-Memory:** As operações de cache implementam Single-Flight Mutex (`lock:{key}`) ou algoritmo XFetch contra Cache Stampede?
- [ ] **TTL com Jitter:** Os tempos de expiração de chaves de cache incluem jitter aleatório (+10% a 15%) para evitar Cache Avalanche?
- [ ] **Comandos Seguros no Redis:** A desalocação de chaves massivas utiliza `UNLINK` e inspeções iterativas usam `SCAN`?

