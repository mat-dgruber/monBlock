# System Design: [Nome do Sistema]

<!-- Fonte canônica: templates/architecture/system-design.md (guia-system-design-sistemas-distribuidos.md §1, The 4-Step Blueprint) — instalado por SYSD-02 -->

> Documento vivo. Seções 1 e 2 são preenchidas no setup; as demais evoluem com ADRs em `docs/adrs/`.

## 1. Escopo e Requisitos

### 1.1. Requisitos Funcionais Essenciais
- [preencher: o que o sistema faz, em 3 a 7 itens]

### 1.2. Fora do Escopo (explicitamente descartado)
- [preencher]

### 1.3. Requisitos Não-Funcionais (QARs)
| Atributo | Meta | Como medir |
| :--- | :--- | :--- |
| Disponibilidade | [ex.: 99,9% mensal] | [SLO / alerta] |
| Latência | [ex.: p99 < 300 ms] | [APM / tracing] |
| Consistência | [CP ou AP sob partição; modelo: linearizável / causal / eventual] | [testes de caos] |
| Durabilidade | [ex.: RPO = 0 para transações financeiras] | [backup / réplica síncrona] |

## 2. Estimativas de Ordem de Grandeza (Back-of-the-Envelope)
| Métrica | Estimativa (hoje) | Estimativa (5 anos) | Base de cálculo |
| :--- | :--- | :--- | :--- |
| Usuários ativos diários (DAU) | [preencher] | | |
| QPS de leitura / escrita | [preencher] | | [DAU × ações / 86 400 s; pico = 2-3×] |
| Storage total | [preencher] | | [registros × tamanho médio] |
| Largura de banda | [preencher] | | [QPS × payload médio] |
| Cache (RAM) | [preencher] | | [Pareto 80/20 do tráfego diário] |

## 3. Arquitetura de Alto Nível (High-Level Design)
[Diagrama C4 nível 1-2 (Mermaid) com fronteiras Frontend / Client Edge · Ingress / BFF · Backend Core · Persistência · Mensageria.]

## 4. Deep Dive e Gargalos
### 4.1. Consistência de Dados (CAP / PACELC)
[Decisão CP ou AP; quóruns N/R/W quando aplicável (W + R > N em caminhos críticos).]
### 4.2. Camada de Borda e Roteamento
[DNS/Anycast, CDN e cache-busting, LB L4/L7 com health checks, terminação TLS.]
### 4.3. Persistência e Sharding
[Paradigma (SQL/NoSQL/NewSQL), replicação, shard key e mitigação de hot partitions.]
### 4.4. Caching
[Topologia, estratégia de escrita, evicção e mitigação de stampede/avalanche/penetration.]
### 4.5. Assincronismo e Mensageria
[Filas vs. logs de eventos, semântica de entrega, idempotência, Outbox, DLQ com alertas, backpressure.]
### 4.6. Observabilidade
[Logs estruturados, métricas RED/USE e tracing OpenTelemetry.]

## 5. Decisões Registradas
| ADR | Decisão |
| :--- | :--- |
| [docs/adrs/NNNN-*.md] | [resumo] |
