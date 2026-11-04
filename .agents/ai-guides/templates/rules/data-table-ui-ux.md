# Checklist de Data Tables (`.agents/rules/data-table-ui-ux.md`)

<!-- Fonte canônica: templates/rules/data-table-ui-ux.md (guides/design-ui-ux/guia-componente-tabela-data-table-ui-ux.md) — instalado por TABLE-01 -->

Regra always-on: aplique este checklist em PRs que contenham tabelas de dados. Itens abertos bloqueiam a promoção. Guia completo em `.agents/ai-guides/guides/design-ui-ux/guia-componente-tabela-data-table-ui-ux.md`.

## 📋 10. Matriz de Auditoria & Scorecard de Excelência

Antes de aprovar um pull request contendo uma tabela de dados, aplique o seguinte checklist:

| Critério de Avaliação                        | Requisito Esperado                                                                                                                      | Status |
| :------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------- | :----: |
| **1. Alinhamento de Números**                | Valores monetários e quantitativos alinhados à direita com `text-right` e `tabular-nums`. Cabeçalho numérico também alinhado à direita. |  [ ]   |
| **2. Alinhamento de Textos**                 | Nomes e descrições alinhados à esquerda (`text-left`).                                                                                  |  [ ]   |
| **3. Fim das Listras Zebradas**              | Fundo limpo com separadores sutis de 1px (`border-b border-slate-100`) e iluminação suave no `:hover`.                                  |  [ ]   |
| **4. Zero Truncamento em Números**           | Moedas, taxas e contagens têm largura suficiente e jamais recebem reticências (`ellipsis`).                                             |  [ ]   |
| **5. Células Vazias Semânticas**             | Ausência de dado tratada com travessão (`—`) e label acessível; nunca nulo, em branco ou `0`.                                           |  [ ]   |
| **6. Truncamento com Tooltip**               | Textos longos truncados graciosamente com tooltip acessível no hover/foco.                                                              |  [ ]   |
| **7. Persistência de Contexto (Sticky)**     | Cabeçalho fixo no topo da rolagem vertical e primeira coluna fixa na rolagem horizontal.                                                |  [ ]   |
| **8. Economia de Ações**                     | Ações de linha reveladas progressivamente no hover/focus (ou via botão kebab em dispositivos touch).                                    |  [ ]   |
| **9. Ordenação Limpa**                       | Setas de ordenação exibidas de forma clara apenas na coluna atualmente ordenada.                                                        |  [ ]   |
| **10. Controle de Densidade**                | Alturas canônicas respeitadas (40px compacta, 48px padrão, 56px confortável) com seletor ergonômico.                                    |  [ ]   |
| **11. Acessibilidade WCAG 2.2**              | Uso de tags semânticas (`<th>`, `scope="col"`, `scope="row"`), rótulos `aria-label` e contraste mínimo de 4.5:1.                        |  [ ]   |
| **12. Estado de Loading**                    | Esqueletos (skeletons) com alturas idênticas às linhas para evitar CLS (Cumulative Layout Shift).                                       |  [ ]   |
| **13. Seleção Múltipla**                     | Checkbox com estado `indeterminate` correto via `ref`, Shift+click funcional, barra de bulk actions que substitui a toolbar ao surgir.  |  [ ]   |
| **14. Confirmação antes de Bulk Destrutivo** | Ações de exclusão/irreversíveis em massa exigem modal de confirmação com contagem explícita do impacto.                                 |  [ ]   |
