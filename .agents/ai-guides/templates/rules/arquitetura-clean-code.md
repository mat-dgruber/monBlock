# Checklist de Governança Arquitetural e Clean Code (`.agents/rules/arquitetura-clean-code.md`)

<!-- Fonte canônica: templates/rules/arquitetura-clean-code.md (guides/architecture/guia-arquitetura-software-design-clean-code.md) — instalado por ARCH-01 -->

Regra always-on: aplique este checklist em code review, RFCs e aprovação de PRs críticos. Itens abertos bloqueiam a promoção. Guia completo em `.agents/ai-guides/guides/architecture/guia-arquitetura-software-design-clean-code.md`.

## 12. Checklist de Governança Arquitetural e Code Review

Utilize este checklist em sessões de revisão de design técnico (RFCs) e aprovação de Pull Requests críticos:

### A. Soberania do Domínio e Fronteiras
- [ ] As entidades do domínio são puras e não dependem de decorators ou classes de ORMs (ex.: TypeORM, SQLAlchemy, Eloquent)?
- [ ] A regra de dependência incondicional está sendo preservada (as camadas internas desconhecem a infraestrutura externa)?
- [ ] Mapeadores de fronteira (Mappers) traduzem explicitamente os DTOs de entrada e modelos do banco para entidades de domínio?

### B. Rigor em Princípios de Design e Clean Code
- [ ] Cada classe ou use case possui um único ator como razão para mudar (SRP)?
- [ ] Não há flag arguments booleanos bifurcando a execução de métodos internos?
- [ ] O código adota Value Objects para combater Primitive Obsession (ex.: CPF, E-mail, Moeda)?
- [ ] Nenhum bloco `catch` engole exceções de forma silenciosa?
- [ ] Funções respeitam o princípio de nível único de abstração (SLAP)?

### C. Sustentabilidade e Governança
- [ ] Decisões estruturais irreversíveis (Tipo 1) foram formalizadas através de uma ADR aprovada?
- [ ] Há testes unitários herméticos garantindo a integridade dos Use Cases sem depender de rede ou banco de dados externo?
- [ ] A solução evita abstrações prematuras e obedece ao princípio YAGNI?
- [ ] As exceções lançadas são tipadas semanticamente dentro do domínio de negócio?
