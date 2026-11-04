# Checklist de Review de System Design (`.agents/rules/system-design-distribuidos.md`)

<!-- Fonte canônica: templates/rules/system-design-distribuidos.md (guides/architecture/guia-system-design-sistemas-distribuidos.md) — instalado por SYSD-01 -->

Regra always-on: aplique este checklist em sabatinas arquiteturais, design reviews e go-live de sistemas distribuídos. Itens abertos bloqueiam a promoção. Guia completo em `.agents/ai-guides/guides/architecture/guia-system-design-sistemas-distribuidos.md`.

## ✅ 13. Checklist de Homologação e Review de System Design

Utilize este checklist em sabatinas arquiteturais, sessões de design review e antes do go-live de qualquer sistema distribuído de grande porte:

### 1. Requisitos e Estimativas
- [ ] Os requisitos funcionais essenciais e os requisitos explicitamente descartados do escopo foram validados com o negócio?
- [ ] Os cálculos de ordem de grandeza (QPS de escrita, QPS de leitura, largura de banda e storage em 5 anos) foram formalizados matematicamente?
- [ ] A capacidade da memória RAM para cache foi estimada respeitando a Regra de Pareto (80/20)?

### 2. Teoria e Consistência de Dados
- [ ] O sistema foi explicitamente projetado como **CP** ou **AP** sob partição de rede?
- [ ] O modelo de consistência de dados (Linearizabilidade, Causal, Read-Your-Writes, Eventual) atende aos requisitos do domínio?
- [ ] Caso utilize quóruns ($N, R, W$), a regra de quórum estrito ($W + R > N$) foi respeitada para caminhos críticos?

### 3. Camada de Borda e Roteamento
- [ ] O balanceador de carga possui redundancy ativa e os health checks estão devidamente configurados?
- [ ] A terminação SSL/TLS foi posicionada na borda para aliviar a carga de processamento dos backends?
- [ ] Assets estáticos estão desacoplados em Object Storage servidos via CDN com estratégia de cache-busting imutável?

### 4. Persistência e Sharding
- [ ] O esquema de dados foi validado contra os padrões de acesso reais (evitando joins trans-partição em NoSQL)?
- [ ] A Shard Key selecionada distribui leituras e escritas de maneira uniforme, sem risco de criação de hot partitions?
- [ ] A topologia de replicação prevê tolerância a falhas sem perda de dados (RPO = 0) para transações financeiras?

### 5. Caching e Resiliência
- [ ] As patologias clássicas de cache (Stampede, Avalanche e Penetration) possuem mitigações ativas no código?
- [ ] Todos os clientes HTTP externos e chamadas de banco possuem timeouts rígidos e pools de conexão dimensionados?
- [ ] As operações repetíveis por retry possuem garantia matemática de idempotência através de chaves únicas?

### 6. Assincronismo e Observabilidade
- [ ] Operações lentas foram descarregadas para workers assíncronos desacoplados por filas ou event streams?
- [ ] Mensagens venenosas são isoladas em Dead Letter Queues (DLQ) com alertas automáticos para o time de plantão?
- [ ] O sistema implementa os 3 pilares da observabilidade (Logs estruturados, Métricas RED/USE e Distributed Tracing OpenTelemetry)?

---
