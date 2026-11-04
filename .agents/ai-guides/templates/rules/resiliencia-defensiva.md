# Checklist de Resiliência Defensiva (`.agents/rules/resiliencia-defensiva.md`)

<!-- Fonte canônica: templates/rules/resiliencia-defensiva.md (guides/architecture/guia-padroes-resiliencia-defensiva.md) — instalado por RESIL-01 -->

Regra always-on: aplique este checklist em aprovação de PRs e novas rotas de integração. Itens abertos bloqueiam a promoção. Guia completo em `.agents/ai-guides/guides/architecture/guia-padroes-resiliencia-defensiva.md`.

## 🚫 7. Catálogo de Anti-Padrões Fatais (O que NUNCA fazer)

1. ❌ **Retentar Erros 4xx:** Erros como `400 Bad Request`, `401 Unauthorized` ou `422 Validation Error` são falhas de negócio/cliente. Retentá-los apenas consome CPU e nunca terá sucesso.
2. ❌ **Retry sem Jitter:** Fazer retries com tempos fixos (ex: exatamente a cada 1 segundo) garante que todos os clientes colidam simultaneamente no backend (_Thundering Herd_).
3. ❌ **Timeout no Banco Ausente:** Deixar queries de banco sem `statement_timeout` ou limite de lock. Um lock de tabela travará todas as conexões da aplicação.
4. ❌ **Liveness Probe Dependendo do Banco:** Colocar verificação de banco no `/livez`. Se o banco sofrer lentidão momentânea, o Kubernetes reiniciará todos os pods da aplicação em massa, agravando a indisponibilidade.
5. ❌ **Fallback que Depende de Outra Rede:** Se o serviço primário na nuvem caiu, tentar chamar outro serviço síncrono na nuvem como fallback tem alta probabilidade de falhar pelo mesmo incidente de infraestrutura.
6. ❌ **DLQ sem Alertas:** Enviar mensagens para uma Dead Letter Queue sem alarme no Grafana/CloudWatch cria um cemitério silencioso de transações perdidas.
7. ❌ **Gravar Idempotência só no Final:** Se a gravação da chave ocorrer após o efeito colateral, duas requisições simultâneas passarão pelo teste inicial e duplicarão a transação.
8. ❌ **Circuit Breaker com Limiar Global:** Usar um único disjuntor para todas as APIs externas. Se o serviço de SMS falhar, o serviço de Pagamentos não deve ser desligado.
9. ❌ **Requisições e Streams sem Cancelamento no Cliente:** Disparar requisições ou assinar fluxos assíncronos sem gerenciamento de ciclo de vida (`AbortController`, descarte de observadores/subscrições), retendo conexões HTTP obsoletas e gerando vazamentos de memória.
10. ❌ **Erros HTTP Ad-Hoc em Projetos Novos ou Vazamento de Exceção Bruta:** Criar novos projetos retornando strings soltas (`{"err": msg}`) ou stack traces de banco/framework em vez de adotar a **RFC 9457 (`application/problem+json`)** por padrão, ou forçar migração quebrando consumidores existentes sem estratégia de compatibilidade.

---

## ✅ 8. Checklist de Homologação e Code Review de Resiliência

Antes de aprovar Pull Requests ou subir novas rotas de integração para produção, verifique:

- [ ] **Timeouts Granulares:** Todos os clientes HTTP externos (SDKs de rede, HTTP clients) e conexões de persistência possuem limites rígidos de socket, conexão e leitura explicitamente configurados?
- [ ] **Tratamento de 5xx:** Os retries automáticos filtram estritamente erros $\ge 500$ e utilizam _Backoff Exponencial_ com _Jitter_?
- [ ] **Idempotência:** Rotas com efeitos colaterais sensíveis exigem o cabeçalho `Idempotency-Key`?
- [ ] **Isolamento:** Endpoints de relatórios pesados ou exportações possuem limites estritos de concorrência (_Bulkhead_)?
- [ ] **Outbox Pattern:** Eventos de mensageria críticos são persistidos na mesma transação atômica do banco de dados?
- [ ] **Graceful Shutdown:** Servidores web e workers escutam `SIGTERM` e drenam tarefas pendentes antes do término?
- [ ] **Probes Corretas:** `/livez` verifica apenas o processo interno e `/readyz` verifica conectividade com infraestrutura crítica?
- [ ] **Respostas de Erro Padronizadas (RFC 9457):** Projetos novos ou sem padronização retornam `application/problem+json` seguindo a **RFC 9457** (`type`, `title`, `status`, `detail`, `instance`, `errors[]`)? Projetos existentes (especialmente com RFC 7807) receberam sugestão de evolução compatível para a RFC 9457 sem quebrar clientes ativos?
- [ ] **Observabilidade:** Métricas e logs estruturados são emitidos na abertura de disjuntores, quedas para DLQ e ativação de fallbacks?

---
