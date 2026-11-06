# Checklist de DDD Pragmático, Use Cases e Unit of Work (`.agents/rules/ddd-pragmatico.md`)

<!-- Fonte canônica: templates/rules/ddd-pragmatico.md (guides/architecture/guia-ddd-pragmatico-unit-of-work-use-cases.md) — instalado por DDDP-01 -->

Regra always-on para backends que adotaram o estilo DDD enxuto (ADR `ddd-pragmatico` ou `backend_style: enxuto` no manifesto do `/setup`). Aplique em code review e aprovação de PRs; itens abertos bloqueiam a promoção. Guia completo em `.agents/ai-guides/guides/architecture/guia-ddd-pragmatico-unit-of-work-use-cases.md`. Fiscalização automática dos itens de Use Cases e Unit of Work: `python3 .agents/scripts/architecture/check_ddd_pragmatico.py` (códigos `DDDP-R1..R4`, `DDDP-W1`).

## Precedência sobre o checklist arquitetura-clean-code

Quando existe ADR `ddd-pragmatico` (ou `backend_style: enxuto` no manifesto), este checklist **prevalece** sobre o checklist `.agents/rules/arquitetura-clean-code.md` nos itens abaixo. Isso vale também para projetos cujo checklist antigo já estava instalado:

- **A.1 (entidades puras, sem ORM):** não se aplica. No modelo híbrido o modelo ORM é a entidade de domínio; pode carregar invariantes locais e métodos de comportamento, mas não sessão, queries nem HTTP.
- **A.3 (Mappers obrigatórios entre DTO, modelo de banco e entidade):** não se aplica. Schemas (DTO) na borda e o modelo ORM no núcleo bastam; o Mapper só entra onde houver ganho real.

Os demais itens (A.2 regra de dependência, B e C) continuam valendo. Estilo Hexagonal/Clean purista declarado no manifesto: esta regra não se aplica e os itens A.1 e A.3 voltam a valer.

## Núcleo DDD Pragmático

- [ ] Cada módulo é um *vertical slice* com `models`, `schemas`, `repository`, `service`, `policies`, `exceptions` e `router`, e cada arquivo tem uma única responsabilidade?
- [ ] As dependências apontam numa só direção (router → use case/service → repository → models), sem import circular entre módulos?
- [ ] O modelo ORM carrega só invariantes locais e comportamento; sessão, queries e HTTP ficam fora dele?
- [ ] Regras de negócio vivem em service/use case coeso e testável, não em router, repository nem schema (sem *God Service*)?
- [ ] Autorização é `Policy` avaliada antes da escrita, e erros de domínio são exceções tipadas mapeadas para RFC 7807 no router?
- [ ] Validação que exige consulta (ex.: unicidade) recebe o repositório por porta, nunca o Unit of Work inteiro?
- [ ] Consistência entre stores distintos usa Outbox, evento, saga ou reconciliação idempotente, nunca um Unit of Work?

## Se usa Use Cases

- [ ] Cada Use Case é `VerbNounUseCase` com um único método `execute()`, com DTO na entrada e na saída?
- [ ] O Use Case não importa framework HTTP (`fastapi`, `starlette`, `flask`, `django.http`); a tradução HTTP é do router (`DDDP-R4`)?
- [ ] O Use Case orquestra vários repositórios/serviços ou combina autorização, escrita e auditoria? CRUD trivial e módulo de leitura/relatório chamam service/repositório direto, sem Use Case de fachada.
- [ ] A `Policy` roda antes da escrita e o router não contém orquestração?
- [ ] `use_cases.py` tem menos de ~400 linhas; acima disso virou o pacote `use_cases/` (`DDDP-W1`)?

## Se usa Unit of Work

- [ ] O Use Case (ou o service, quando o mesmo módulo não tem Use Cases) é o único dono do `commit`; repositório, router e helpers nunca chamam `commit` (`DDDP-R1`)?
- [ ] A transação é curta: nenhum HTTP externo, e-mail ou chamada lenta com o Unit of Work aberto (`DDDP-R2`)?
- [ ] O Unit of Work cobre um único recurso transacional e não importa cliente de outro store (BigQuery, Mongo, Redis, Elasticsearch) (`DDDP-R3`)?
- [ ] Leitura e relatório rodam sem Unit of Work ou com sessão read-only?
- [ ] Auditoria entra por porta do Unit of Work, não por `uow.session`?
- [ ] `flush` só onde o id é necessário antes do commit; re-fetch pós-commit só quando preciso?
- [ ] O escopo do Unit of Work por store está registrado na ADR de adesão, na seção `## Escopo do Unit of Work`?
- [ ] Os testes de Use Case usam `FakeUnitOfWork` em memória, sem banco?
