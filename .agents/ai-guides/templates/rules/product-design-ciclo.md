# Checklist de Product Design (`.agents/rules/product-design-ciclo.md`)

<!-- Fonte canônica: templates/rules/product-design-ciclo.md (guides/design-ui-ux/guia-product-design-ciclo-completo.md) — instalado por PD-01 -->

Regra always-on: aplique este checklist em aprovação de designs para desenvolvimento ou produção. Itens abertos bloqueiam a promoção. Guia completo em `.agents/ai-guides/guides/design-ui-ux/guia-product-design-ciclo-completo.md`.

## 14. Checklist de Governança e Homologação de Product Design

Utilize este checklist normativo como portão de qualidade (*quality gate*) antes de aprovar designs para desenvolvimento ou lançamento em produção:

| Dimensão | Item de Verificação | Critério de Aceitação / Evidência | Status |
| :--- | :--- | :--- | :--- |
| **Discovery** | Problema Evidenciado | Declaração de problema validada com no mínimo 5 entrevistas ou dados quantitativos reais. | [ ] |
| **Discovery** | Alinhamento JTBD | Job principal e circunstância claramente documentados (Quando [X], Quero [Y], Para que [Z]). | [ ] |
| **Estratégia** | Árvore de Oportunidades | Mapeamento explícito de Outcome ➔ Opportunities ➔ Solutions com Teresa Torres OST. | [ ] |
| **Estratégia** | Priorização Racional | Score RICE ou Kano calculado para justificar a inclusão no ciclo atual de desenvolvimento. | [ ] |
| **UX & Fluxo** | Mapeamento de Estados | Cobertura explícita dos 8 estados em cada tela: Default, Hover, Active, Focus, Disabled, Loading, Empty, Error. | [ ] |
| **UI & Tokens** | Zero Hardcoded Values | Todas as cores, tipografias e espaçamentos usam tokens semânticos do Design System. | [ ] |
| **Acessibilidade**| Conformidade WCAG 2.2 | Relação de contraste mínima 4.5:1 (texto normal), suporte a navegação por teclado e rótulos ARIA. | [ ] |
| **Engenharia** | Specs de API & Dados | Designer e desenvolvedores revisaram payloads de API, tempos de resposta e comportamento offline/latência. | [ ] |
| **Engenharia** | Dev Mode Pronto | Frame organizado no Figma com variáveis, auto-layout, componentes variantes e notas de specs. | [ ] |
| **Release** | Rollout & Feature Flag | Plano de ativação gradual (Canary / Beta interno) com métricas de monitoramento e rollback. | [ ] |
| **Medição** | Instrumentação de Analytics | Eventos de tracking definidos no PRD para medir adoção, retenção e satisfação no framework HEART. | [ ] |
| **Ética & IA** | Anti-Dark Patterns | Ausência de confirmação humilhante (*confirmshaming*), custos ocultos ou armadilhas de cancelamento. | [ ] |

---
