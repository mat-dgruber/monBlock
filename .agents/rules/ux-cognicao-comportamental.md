# Checklist de UX Comportamental e Cognição (`.agents/rules/ux-cognicao-comportamental.md`)

<!-- Fonte canônica: templates/rules/ux-cognicao-comportamental.md (guides/design-ui-ux/guia-regras-ux-design-cognicao-comportamental.md) — instalado por UX-01 -->

Regra always-on: aplique este checklist em homologação de telas e fluxos. Itens abertos bloqueiam a promoção. Guia completo em `.agents/ai-guides/guides/design-ui-ux/guia-regras-ux-design-cognicao-comportamental.md`.

## 11. Checklist de Homologação e Auditoria de UX

Antes de promover qualquer tela ou fluxo para homologação e produção, o Tech Lead e o Designer devem validar os 12 critérios obrigatórios:

- [ ] **1. Mapeamento de Intenção do Sistema:** O fluxo prioriza o Sistema 1 (atalhos, reconhecimento, defaults) e reserva o Sistema 2 exclusivamente para momentos deliberados ou críticos?
- [ ] **2. Avaliação de Habilidade de Fogg:** A interface minimizou os 6 fatores de atrito (tempo, esforço físico, ciclos mentais, desvios de rotina)?
- [ ] **3. Auditoria do Funil CREATE:** O usuário possui um gatilho visível ($Cue$), reação segura ($Reaction$), custo transparente ($Evaluation$), facilidade técnica ($Ability$), senso de urgência autêntico ($Timing$) e fechamento inequívoco ($Execution$)?
- [ ] **4. Triagem do Espectro de Decisão:** Ações triviais possuem defaults inteligentes (*opt-out* ético); ações destrutivas ou de alto valor possuem fricção protetiva e períodos de resfriamento?
- [ ] **5. Cumprimento das Leis de UX:**
  - [ ] Lei de Hick: No máximo 3 a 5 opções primárias visíveis sem revelação progressiva.
  - [ ] Lei de Fitts: Alvos de toque $\ge 48\times 48\text{ px}$ com foco ergonômico na *thumb zone*.
  - [ ] Lei de Miller: Dados longos agrupados em *chunks* digeríveis (máximo $7 \pm 2$).
  - [ ] Lei de Jakob: Ícones e posições respeitam as convenções globais da indústria.
- [ ] **6. Inexistência de Dark Patterns:** Ausência total de Roach Motel, Confirmshaming, Sneak into Basket, contadores falsos de escassez ou armadilhas de cancelamento.
- [ ] **7. Paridade de Cancelamento:** Cancelar ou reverter a assinatura exige o mesmo número de etapas do que a adesão inicial.
- [ ] **8. Affordance e Contraste dos CTAs:** A ação primária domina visualmente a hierarquia da tela; seu texto declara explicitamente o verbo de ação e o objeto.
- [ ] **9. Tratamento Tolerante de Entrada:** Validação de formulário em tempo real (*inline feedback*) sem exigir recarregamento da página; formatos flexíveis para telefones e documentos.
- [ ] **10. Fechamento Inequívoco de Tarefas:** Feedback imediato de sucesso ($\le 200\text{ms}$) com resumo do que foi efetuado, prevenindo duplo clique acidental.
- [ ] **11. Transparência de Custos:** Valores totais, taxas e políticas de cobrança são comunicados antes do clique decisivo, sem surpresas ocultas.
- [ ] **12. Instrumentação e Telemetria:** O fluxo possui rastreamento de eventos de conversão, erros de validação e funil analítico para cálculo de TSR e TTR em produção.

---
