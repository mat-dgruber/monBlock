# Checklist de Lançamento e Homologação de Produto (GTM & Release) (`.agents/rules/product-management-ciclo.md`)

<!-- Fonte canônica: templates/rules/product-management-ciclo.md (guides/product-management/guia-product-management-ciclo-completo.md) — instalado por PM-01 -->

Regra always-on: aplique este checklist em liberação de qualquer funcionalidade ou produto. Itens abertos bloqueiam a promoção. Guia completo em `.agents/ai-guides/guides/product-management/guia-product-management-ciclo-completo.md`.

## 15. Checklist Canônico de Lançamento e Homologação de Produto (GTM & Release)

Utilize este checklist executivo antes de liberar qualquer nova funcionalidade ou produto no mercado:

| Dimensão | Item de Verificação | Critério de Aceitação / Evidência | Status |
| :--- | :--- | :--- | :--- |
| **Risco de Valor** | Problema Real Validado | Pelo menos 5 clientes demonstraram interesse real ou pré-aderiram à solução. | [ ] |
| **Risco de Usabilidade** | Teste de Usabilidade | Taxa de sucesso de tarefas > 80% em testes moderados ou remotos sem auxílio. | [ ] |
| **Risco de Factibilidade** | Avaliação de Engenharia | Arquitetura revisada, contratos de API acordados e sem blockers de infraestrutura. | [ ] |
| **Risco de Viabilidade** | Compliance, Legal & Finanças | Em conformidade com LGPD/GDPR, modelo de precificação testado e aprovado. | [ ] |
| **Documentação & PRD** | Critérios de Aceitação BDD | Histórias de usuário documentadas no padrão Given/When/Then e sem ambiguidades. | [ ] |
| **Instrumentação** | Telemetria & Analytics | Eventos de tracking do funil (Acquisition ➔ Activation ➔ Retention) homologados em staging. | [ ] |
| **Go-To-Market** | Capacitação de Times | Vendas, Suporte ao Cliente e Marketing treinados com FAQ e documentação interna. | [ ] |
| **Estratégia de Release** | Feature Flags & Rollout | Lançamento faseado configurado (Ex.: 5% internal ➔ 25% beta ➔ 100% público geral). | [ ] |
| **Observabilidade** | Monitoramento de Erros | Dashboards de logs, taxa de erro HTTP 5xx e latência p99 configurados com alertas. | [ ] |
| **Plano de Rollback** | Reversibilidade Garantida | Procedimento documentado e testado para desativar a feature flag em < 2 minutos em caso de anomalia. | [ ] |

---
