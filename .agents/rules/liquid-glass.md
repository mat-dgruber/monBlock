# Checklist de Liquid Glass (`.agents/rules/liquid-glass.md`)

<!-- Fonte canônica: templates/rules/liquid-glass.md (guides/design-ui-ux/guia-liquid-glass-refracao-optica-web.md) — instalado por GLASS-01 -->

Regra always-on: aplique este checklist em homologação de superfícies com Liquid Glass. Itens abertos bloqueiam a promoção. Guia completo em `.agents/ai-guides/guides/design-ui-ux/guia-liquid-glass-refracao-optica-web.md`.

## 📋 8. Matriz de Auditoria & Checklist de Qualidade

Antes de homologar qualquer componente ou superfície construída com Liquid Glass, certifique-se de cumprir os 6 critérios de aprovação técnica:

|   #   | Critério de Qualidade        | Verificação Obrigatória                                                                                                       | Status |
| :---: | :--------------------------- | :---------------------------------------------------------------------------------------------------------------------------- | :----: |
| **1** | **Refração vs. Névoa**       | O fundo sofre distorção vetorial perceptível (`feDisplacementMap`) e não apenas uma lavagem leitosa de cores.                 |  [ ]   |
| **2** | **Desfoque Equilibrado**     | O valor de `blur()` está limitado entre `2px` e `4px` para preservar a legibilidade das formas do fundo sem granulados secos. |  [ ]   |
| **3** | **Compensação de Saturação** | O filtro inclui `saturate(160% – 200%)` para compensar a perda luminosa da difração.                                          |  [ ]   |
| **4** | **Luz Especular Superior**   | O elemento conta com borda/sombra interna (`inset 0 1px 0 rgba(255,255,255,...)`) simulando reflexo zenital lapidado.         |  [ ]   |
| **5** | **Safety Check Sensorial**   | O componente possui `@media (prefers-reduced-transparency: reduce)` que substitui a refração por fundo 100% sólido.           |  [ ]   |
| **6** | **Legibilidade Tipográfica** | Os textos dentro da superfície possuem peso firme (`font-medium` ou superior) e taxa de contraste WCAG 2.2 AA (≥ 4.5:1).      |  [ ]   |
