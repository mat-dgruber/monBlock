# 🎨 Guias de Design System, UI/UX & Acessibilidade

<div align="center">

[![Category](https://img.shields.io/badge/Category-Design%20%26%20Accessibility-EC4899?style=for-the-badge)](../../README.md)
[![Accessibility](https://img.shields.io/badge/Accessibility-WCAG%202.2%20AAA-F59E0B?style=for-the-badge)](../../README.md)

<p align="center">
  <b>Diretrizes técnicas para criação e manutenção de interfaces acessíveis, design tokens semânticos, micro-interações e padrões visuais anti-slop.</b>
</p>

</div>

---

## 📂 Guias Disponíveis no Diretório

```text
guides/design-ui-ux/
├── guia-universal-design-ui-ux-acessibilidade.md      ──> Framework das 5 Lentes de Design & WCAG 2.2 AAA
├── guia-liquid-glass-refracao-optica-web.md           ──> Vidro Líquido, Refração Vetorial (SVG) & Óptica Realista
├── guia-regras-ux-design-cognicao-comportamental.md   ──> Psicologia Cognitiva, Modelos Fogg/CREATE e Leis de UX
├── guia-product-design-ciclo-completo.md              ──> Ciclo de Vida Completo, Estratégia, Handoff e DesignOps
├── guia-componente-tabela-data-table-ui-ux.md         ──> As 6 Decisões da Data Table, Alinhamento Óptico & tnum
└── guia-dashboard-design-anti-slop-ui-ux.md           ──> Os 5 Pilares Anti-Slop de Dashboards, KPIs 1+N & tnum
```

---

## 📋 Detalhamento dos Guias

> ⚙️ Os 6 guias deste diretório têm **Heurísticas Executáveis** aplicadas pelo `/setup`: `design-universal-acessibilidade` (UI-01..07 — instala `tokens.css` e os linters de acessibilidade), `ux-cognicao-comportamental` (UX-01..02), `product-design-ciclo` (PD-01..02), `data-table-ui-ux` (TABLE-01..03), `dashboard-anti-slop` (DASH-01..02, `tabular-nums` coberto por UI-02/TABLE-02) e `liquid-glass` (GLASS-01..03). Todos instalam seu checklist em `.agents/rules/<slug>.md` e a linha **Design & UI/UX** do `CLAUDE.md`.

| Guia Técnico                                                                                           | Descrição & Propósito                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| :----------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`guia-universal-design-ui-ux-acessibilidade.md`](guia-universal-design-ui-ux-acessibilidade.md) ⚙️ `design-universal-acessibilidade`       | Manual completo e agnóstico de UI/UX estruturado sobre o **Framework das 5 Lentes**: Conformidade estrita com **WCAG 2.2 AA/AAA**, arquitetura de **Design Tokens Semânticos** (Cores, Tipografia com Optical Sizing & Tracking, Espaçamento), catálogo de **Micro-Interações e Física Fluida Apple** (molas com damping/response, tracking 1:1, interruptibilidade, momentum projection e rubber-banding), materiais translúcidos com hierarquia de profundidade, eliminação de **Anti-Slop Visual** e padrões de **Layout Responsivo**. |
| [`guia-liquid-glass-refracao-optica-web.md`](guia-liquid-glass-refracao-optica-web.md) ⚙️ `liquid-glass`                 | Manual canônico de **Liquid Glass**: Superação do "retângulo cinza lavado" através de refração óptica real com **Filtros SVG** (`<feTurbulence>` e `<feDisplacementMap>`), composição atmosférica (`backdrop-filter: url(#lg) blur(3px) saturate(180%)`), **iluminação especular** zenital lapidada (`inset 0 1px 0 rgba`), calibração de dispersão, safety checks de acessibilidade (`prefers-reduced-transparency`) e componente React/Tailwind.                                                                                        |
| [`guia-regras-ux-design-cognicao-comportamental.md`](guia-regras-ux-design-cognicao-comportamental.md) ⚙️ `ux-cognicao-comportamental` | Manual técnico de UX Design ancorado em **Ciência Comportamental** e **Psicologia Cognitiva**: Teoria do Processo Dual (Sistema 1 vs. Sistema 2), modelos **B = MAP (Fogg)** e **CREATE (Wendel)**, Loops de Hábito (**Hook Model** e Duhigg), catálogo anti-dark patterns e métricas de usabilidade (**SUS, CES, HEART**).                                                                                                                                                                                                               |
| [`guia-product-design-ciclo-completo.md`](guia-product-design-ciclo-completo.md) ⚙️ `product-design-ciclo`                       | Manual normativo de Product Design percorrendo o ciclo de vida completo: **Descoberta & Síntese** (Entrevistas, JTBD, Personas), **Definição & Estratégia** (Opportunity Solution Trees, PMF), **Priorização** (RICE, MoSCoW, Kano), **Arquitetura da Informação**, **UI Foundations & Design Tokens (8 Estados)**, **Validação & Testes de Usabilidade**, **Handoff com Engenharia (Figma Dev Mode)**, **Ship & Scale (Rollouts, Feature Flags, DesignOps)**, **Product Analytics (HEART)** e **Design Ético com IA**.                   |
| [`guia-componente-tabela-data-table-ui-ux.md`](guia-componente-tabela-data-table-ui-ux.md) ⚙️ `data-table-ui-ux`             | Manual canônico para concepção de **Data Tables**: Superação do modelo "planilha disfarçada" através das **6 Decisões Arquiteturais** (Align, Rows, Density, Sticky, Cells, Actions), tipografia tabular (`tabular-nums`), virtualização, 6 estados de tela, acessibilidade WCAG 2.2 e implementação de referência em React/Tailwind CSS.                                                                                                                                                                                                 |
| [`guia-dashboard-design-anti-slop-ui-ux.md`](guia-dashboard-design-anti-slop-ui-ux.md) ⚙️ `dashboard-anti-slop`                 | Manual canônico de **Design de Dashboards & Métricas (KPIs)**: Eliminação sistemática dos vícios visuais da UI gerada por IA (_"AI-Made Look"_) através dos **5 Pilares Anti-Slop** (Flat Accent sem gradientes espúrios, Hero Numbers sem blocos pastel coloridos, Hierarquia 1+N com North Star Metric, Hairline Borders sem excesso de sombras e Precisão Temporal com `tabular-nums` e Sparklines), Bento Grids executivos, conformidade WCAG 2.2 AAA e componente de referência em Angular 21 Standalone / Tailwind CSS.             |
