---
title: Guia Canônico de Design de Dashboards & Métricas (KPIs) em UI/UX & Design Systems
description: Manual técnico normativo para concepção, estilização, acessibilidade WCAG 2.2 AAA e ergonomia cognitiva de dashboards analíticos modernos. Da eliminação sistemática dos vícios da UI gerada por IA ("AI-Made Look") aos 5 pilares arquiteturais que transformam coleções genéricas de cards em instrumentos executivos de alta precisão.
version: 1.1.0
date: 2026-09-18
author: Matheus Diniz (Engenharia de Software & Design Systems)
---

<!--
=================================================================================
LOG DE MANUTENÇÃO E ALTERAÇÕES DO DOCUMENTO
=================================================================================
Data       | Autor          | Descrição da Alteração
-----------|----------------|--------------------------------------------------
2026-09-08 | Matheus Diniz  | Criação do Guia Canônico de Design de Dashboards
           | (Antigravity)  | estabelecendo os 5 Pilares Anti-Slop (Flat Accent,
           |                | Hero Numbers, Hierarquia 1+N, Hairline Surface,
           |                | Precisão Temporal com Sparklines e Tabular Digits),
           |                | integração executiva com Liquid Glass, conformidade
           |                | WCAG 2.2 AAA e componentes em Angular 21 e Tailwind.
2026-10-14 | Eduardo Batista| AGENTS.md como instrução única: referência DASH-02 passa a ser verificada no AGENTS.md. Bloco na versão 2.
=================================================================================
-->

# 📈 Guia Canônico de Design de Dashboards & Métricas (KPIs) em UI/UX & Design Systems

> _"Um dashboard sem hierarquia é apenas uma planilha com padding. Quando cada card flutua, nenhum se destaca. A interface gerada por IA pinta gradientes onde não tem nada a dizer."_  
> — Manifesto Canônico de Engenharia de Dashboards Analíticos

<div align="center">

[![Category](https://img.shields.io/badge/Category-Design%20Systems%20%26%20UI%2FUX-EC4899?style=for-the-badge)](../../README.md)
[![Accessibility](https://img.shields.io/badge/Accessibility-WCAG%202.2%20AAA-F59E0B?style=for-the-badge)](../../README.md)
[![Component](https://img.shields.io/badge/Component-Dashboard%20%2F%20KPI%20Grid-3B82F6?style=for-the-badge)](../../README.md)
[![Design Pattern](https://img.shields.io/badge/Pattern-Anti--Slop%20Executive%20UI-10B981?style=for-the-badge)](../../README.md)

<p align="center">
  <b>Manual prescritivo para projetar e implementar painéis analíticos, grids de métricas de alta densidade, tipografia tabular estável e hierarquia executiva sem poluição estética.</b>
</p>

</div>

---

## ⚙️ Heurísticas Executáveis

Bloco lido pelo `/setup` e por `skills/setup/scripts/verify_setup.py`. `when`/`verify` são shell (cwd = raiz do projeto, `AI_GUIDES_RUNTIME` aponta para `.agents/ai-guides`). `do` é shell ou começa com `agent:`.

```yaml heuristics
guide: dashboard-anti-slop
version: 2
requires: []
heuristics:
  - id: DASH-01
    title: Checklist de auditoria Anti-Slop Do & Don't (§9) em .agents/rules/dashboard-anti-slop.md
    when: "! test -f .agents/rules/dashboard-anti-slop.md"
    do: |
      mkdir -p .agents/rules
      cp "$AI_GUIDES_RUNTIME/templates/rules/dashboard-anti-slop.md" .agents/rules/dashboard-anti-slop.md
    verify: "grep -q 'Hierarquia 1+N' .agents/rules/dashboard-anti-slop.md"

  - id: DASH-02
    title: AGENTS.md referencia o guia
    when: "! grep -q 'guia-dashboard-design-anti-slop-ui-ux' AGENTS.md 2>/dev/null"
    do: |
      agent: Acrescente ao AGENTS.md, na seção de guias normativos, a linha:
      "- **Design & UI/UX:** Siga os guias em `.agents/ai-guides/guides/design-ui-ux/` — `guia-dashboard-design-anti-slop-ui-ux.md` (5 Pilares Anti-Slop, Hierarquia 1+N, hairline borders, tabular-nums, sparklines); checklists em `.agents/rules/`." Se a linha da categoria já existir, complete-a com este guia em vez de duplicá-la.
      Se AGENTS.md não existir, aplique antes o guia harness-commit-memoria.
    verify: "grep -q 'guia-dashboard-design-anti-slop-ui-ux' AGENTS.md"
```

---

## 📚 Fundamentos

### 🧭 Sumário Executivo

1. [O Diagnóstico: A Síndrome da UI Gerada por IA (_"The AI-Made Look"_)](#-1-o-diagnóstico-a-síndrome-da-ui-gerada-por-ia-the-ai-made-look)
2. [O Framework das 5 Decisões Canônicas (5 Tells ➔ 5 Fixes)](#-2-o-framework-das-5-decisões-canônicas-5-tells--5-fixes)
   - [Decisão 01: Cor Funcional vs. Gradiente Decorativo (Flat Accent)](#-decisão-01-cor-funcional-vs-gradiente-decorativo-flat-accent)
   - [Decisão 02: O Dado como Protagonista (The Number is the Hero)](#-decisão-02-o-dado-como-protagonista-the-number-is-the-hero)
   - [Decisão 03: Hierarquia Assimétrica 1+N (Anchor & North Star Metric)](#-decisão-03-hierarquia-assimétrica-1n-anchor--north-star-metric)
   - [Decisão 04: Disciplina de Elevação e Bordas Hairline (Surface Containment)](#-decisão-04-disciplina-de-elevação-e-bordas-hairline-surface-containment)
   - [Decisão 05: Precisão Temporal, Tipografia Tabular & Sparklines](#-decisão-05-precisão-temporal-tipografia-tabular--sparklines)
3. [Tipografia Tabular (`tnum`) e Prevenção de Tremor de Dados](#-3-tipografia-tabular-tnum-e-prevenção-de-tremor-de-dados)
4. [Anatomia dos Componentes: Hero Card vs. Secondary Cards](#-4-anatomia-dos-componentes-hero-card-vs-secondary-cards)
5. [Layouts Cognitivos: Scannability, Z-Pattern e Bento Grids Executivos](#-5-layouts-cognitivos-scannability-z-pattern-e-bento-grids-executivos)
6. [Integração com Liquid Glass & Design System Corporativo](#-6-integração-com-liquid-glass--design-system-corporativo)
7. [Acessibilidade Universal: WCAG 2.2 AAA em Visualização de Dados](#-7-acessibilidade-universal-wcag-22-aaa-em-visualização-de-dados)
8. [Implementação de Referência: Angular 21 Standalone & Tailwind CSS](#-8-implementação-de-referência-angular-21-standalone--tailwind-css)
9. [Checklist de Auditoria Anti-Slop: Do & Don't Definitivo](#-9-checklist-de-auditoria-anti-slop-do--dont-definitivo)

---

### 🔬 1. O Diagnóstico: A Síndrome da UI Gerada por IA (_"The AI-Made Look"_)

Modelos de Inteligência Artificial generativa e ferramentas automáticas de scaffolding popularizaram um dialeto visual repetitivo e empobrecido na construção de dashboards analíticos. Quando solicitados a criar interfaces financeiras ou gerenciais, agentes tendem a preencher vazios funcionais com ornamentação supérflua.

#### Os 5 Sintomas Crônicos (The 5 Tells)

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                          O ANATOMIA DA UI GERADA POR IA                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  1. Gradiente Púrpura-Azul  ──> Pintado em headers, botões e preenchimentos │
│  2. Caixas Pastéis de Ícone ──> 4 cores arco-íris para 4 números neutros    │
│  3. Cards Isométricos (1:1) ──> 4 cartões com peso idêntico (planilha fofa) │
│  4. Sombras & Cantos 16px   ──> Tudo flutua (shadow-xl) e nada se destaca   │
│  5. Textos de Placeholder   ──> "Welcome back, Jordan 👋", "+12.5% last mo" │
└─────────────────────────────────────────────────────────────────────────────┘
```

A consequência operacional deste padrão é a **fadiga cognitiva imediata**:

- O usuário executivo não sabe para onde olhar primeiro porque todos os cards possuem idêntico peso visual.
- Cores não representam severidade nem categoria; representam mero adorno.
- Bordas infladas e sombras espessas consomem espaço útil de tela, forçando scroll desnecessário e diminuindo a densidade analítica.

---

### 🏛️ 2. O Framework das 5 Decisões Canônicas (5 Tells ➔ 5 Fixes)

Para converter telas analíticas amadoras em consoles corporativos de alto nível, aplicam-se cinco transformações arquiteturais rigorosas.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            5 TELLS  ➔  5 FIXES                              │
├───────────────────────────────────┬─────────────────────────────────────────┤
│ TELL (Vício de IA)                │ FIX (Decisão Canônica)                  │
├───────────────────────────────────┼─────────────────────────────────────────┤
│ 1. Gradiente roxo/azul decorativo │ ➔ One Flat Accent (Cor com Propósito)   │
│ 2. Ícones em tiles pastéis 4-cores│ ➔ Drop the Tiles (O Número é o Herói)   │
│ 3. 4 cards idênticos com badge    │ ➔ Hierarquia 1 Primário + 3 Secundários │
│ 4. Raio 16px e shadow em tudo     │ ➔ Hairline Borders + Sombra Só no Modal │
│ 5. Saudação boba + % genérica     │ ➔ Período Explícito + tnum + Sparkline  │
└───────────────────────────────────┴─────────────────────────────────────────┘
```

---

#### 🎨 Decisão 01: Cor Funcional vs. Gradiente Decorativo (Flat Accent)

> _"A generated UI paints gradients where it has nothing to say. One flat accent, now color means something."_

##### O Problema

Dashboards gerados por IA abusam de `bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500` em cartões de métricas, headers de seções e fundos de gráficos. Isso rouba o contraste semântico: quando o sistema precisa emitir um alerta crítico (ex: inadimplência em vermelho ou meta atingida em esmeralda), o usuário não percebe a anomalia porque a tela já está saturada de cores quentes e gradientes.

##### A Correção Canônica

Adotar uma paleta base estritamente monocromática e neutra (Slate/Zinc/Gray), combinada com **um único tom de destaque plano (_Single Flat Accent_)** para indicar interatividade ou estado ativo, e **tokens funcionais estritos** para severidade.

```text
[ ANTI-PADRÃO (AI Slop) ]
Card Background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%)
Button:          linear-gradient(90deg, #3b82f6 0%, #8b5cf6 100%)
Text Accent:     text-transparent bg-clip-text bg-gradient-to-r...

[ PADRÃO CANÔNICO (Executive Minimal) ]
Card Background: Surface plana (bg-white dark:bg-slate-900)
Card Accent:     border-l-2 border-brand-500 OU ponto indicador único
Color Semantics: Cores reservadas exclusivamente para delta positivo/negativo ou status
```

```html
<!-- ANTES: Gradiente de IA sem propósito -->
<div class="rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-700 p-6 text-white shadow-xl">
  <span class="text-sm text-indigo-200">Faturamento Total</span>
  <h2 class="mt-1 text-3xl font-bold">R$ 1.240.500</h2>
</div>

<!-- DEPOIS: Acabamento plano funcional com contraste cirúrgico -->
<div
  class="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
>
  <span class="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
    Faturamento Líquido
  </span>
  <div class="mt-1.5 flex items-baseline gap-3">
    <span
      class="font-mono text-2xl font-semibold tabular-nums tracking-tight text-slate-900 dark:text-slate-50"
    >
      R$ 1.240.500,00
    </span>
  </div>
</div>
```

---

#### 💎 Decisão 02: O Dado como Protagonista (The Number is the Hero)

> _"Four colors for four numbers is decoration, not information. Drop the tiles, the number is the hero."_

##### O Problema

O layout clichê de IA insere em cada card um quadrado arredondado com fundo pastel (ex: azul claro para usuários, verde claro para receita, roxo claro para pedidos, laranja para tickets) abrigando um ícone Lucide/Heroicon genérico. Esse arranjo visual rouba o foco do dado principal: os olhos do operador pulam de ícone em ícone em vez de escanear os números.

##### A Correção Canônica

1. **Elimine os blocos pastel (_tiles_)**: Se o ícone for indispensável, posicione-o desprovido de fundo colorido, monocromático e discreto (`text-slate-400` com `size-4`).
2. **Amplie o valor numérico**: O número deve ser o elemento dominante da composição gráfica, utilizando escala tipográfica generosa (`text-2xl` a `text-4xl`), peso `font-semibold` ou `font-bold` e espaçamento compacto (`tracking-tight`).

```
[ ANTI-PADRÃO (AI-Made) ]          [ PADRÃO CANÔNICO (Data-First) ]
┌─────────────────────────┐        ┌─────────────────────────┐
│ [ 🔷 ]  Total Usuários │        │ Total de Usuários Ativos│
│                         │        │                         │
│ 14.820                  │   ➔    │ 14.820                  │
│ +5.2% vs mês anterior   │        │ ↑ 5,2%  vs. 30 dias ant.│
└─────────────────────────┘        └─────────────────────────┘
  (Ícone colorido distrai            (O número é a âncora;
   o olhar do número real)            legibilidade imediata)
```

---

#### ⚖️ Decisão 03: Hierarquia Assimétrica 1+N (Anchor & North Star Metric)

> _"A dashboard with no hierarchy is a spreadsheet with padding. One primary metric, big, three secondary, small. Your eye lands once."_

##### O Problema

Quatro caixas retangulares simétricas lado a lado em uma grid `grid-cols-4`, com idêntico padding, peso de texto e espaçamento vertical. Essa igualdade formal gera **paralisia de decisão** e impede o direcionamento da atenção executiva para o indicador que realmente dita o sucesso da operação (a _North Star Metric_).

##### A Correção Canônica: Padrão 1 Primário + N Secundários

Construa uma grade assimétrica onde a métrica mestra ocupe a âncora esquerda ou topo (com área ampliada, exibição de micrográfico e leitura contextual) enquanto as métricas complementares ocupam módulos condensados.

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                            LAYOUT ASSIMÉTRICO 1+N                           │
├─────────────────────────────────────────┬───────────────────────────────────┤
│  MÉTRICA PRIMÁRIA (HERO / NORTH STAR)   │  MÉTRICAS SECUNDÁRIAS (SATÉLITES) │
│  Volume Total Reembolsado               ├───────────────────────────────────┤
│                                         │  Adiantamentos Abertos            │
│  R$ 482.910,00                          │  R$ 45.120,00   (8 pendentes)     │
│  ─────────────────────────────────────  ├───────────────────────────────────┤
│  Tendência últimos 30 dias (Sparkline)  │  Tempo Médio de Liquidação        │
│  [ ~~~/\~~/\_/\_ ] +3,4% vs média anual │  2,4 dias       (meta: < 3,0 dias)│
│                                         ├───────────────────────────────────┤
│  842 solicitações liquidadas            │  Taxa de Conformidade             │
│  Período: 01 Ago - 31 Ago, 2026         │  98,6%          (alta aderência)  │
└─────────────────────────────────────────┴───────────────────────────────────┘
```

##### Estrutura de Grid Tailwind para Hierarquia 1+N

```html
<div class="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
  <!-- Métrica Primária: Ocupa 2 colunas em telas grandes -->
  <div
    class="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 lg:col-span-2"
  >
    <div>
      <span
        class="text-brand-600 dark:text-brand-400 text-xs font-semibold uppercase tracking-wider"
      >
        Indicador Principal (North Star)
      </span>
      <h3 class="mt-0.5 text-sm font-medium text-slate-500 dark:text-slate-400">
        Volume Total Operado
      </h3>
      <div class="mt-2 flex items-baseline gap-4">
        <span class="text-4xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-white">
          R$ 2.845.290,00
        </span>
        <span
          class="inline-flex items-center rounded bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
        >
          ↑ 12,4%
        </span>
      </div>
    </div>
    <!-- Slot de micrográfico integrado -->
    <div
      class="mt-6 flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-slate-500 dark:border-slate-800/80"
    >
      <span>Período: 01 a 31 de Agosto de 2026</span>
      <span class="tabular-nums">Meta atingida: 104,2%</span>
    </div>
  </div>

  <!-- Métricas Secundárias: Coluna lateral empilhada -->
  <div class="flex flex-col gap-4">
    <div
      class="flex flex-1 flex-col justify-center rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
    >
      <span class="text-xs text-slate-500 dark:text-slate-400">Tempo Médio de Análise</span>
      <span class="mt-1 text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
        1,8 dias
      </span>
    </div>
    <div
      class="flex flex-1 flex-col justify-center rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
    >
      <span class="text-xs text-slate-500 dark:text-slate-400">Pendências em Auditoria</span>
      <span class="mt-1 text-xl font-semibold tabular-nums text-amber-600 dark:text-amber-400">
        14 lotes
      </span>
    </div>
  </div>
</div>
```

---

#### 📐 Decisão 04: Disciplina de Elevação e Bordas Hairline (Surface Containment)

> _"16 pixel corners and a drop shadow on everything. When every card floats, nothing does. Hairline borders, tighter radius on smaller parts, shadow only on what opens above the page."_

##### O Problema

Na ânsia de dar profundidade, ferramentas automáticas aplicam `rounded-2xl` e `shadow-lg`/`shadow-indigo-500/10` em cada contêiner, botão, input e cartão da página. Essa proliferação causa:

1. Perda de referência física: a página inteira parece uma pilha desordenada de papéis flutuando no ar.
2. Incompatibilidade com elementos internos: um card de 16px abrigando botões de 16px e inputs de 16px gera nós geométricos deselegantes nos cantos.

##### A Regra de Ouro dos Raio Escalares (_Scale Radii Hierarchy_)

O raio de curvatura deve ser inversamente proporcional à granularidade do componente:

| Nível Arquitetural           | Escala do Raio (`border-radius`) | Tailwind Token               |
| :--------------------------- | :------------------------------- | :--------------------------- |
| **Painéis Globais / Modais** | 12px a 16px                      | `rounded-xl`                 |
| **Cards de Métrica / Grids** | 8px a 12px                       | `rounded-lg` ou `rounded-xl` |
| **Inputs, Botões & Selects** | 6px a 8px                        | `rounded-md` ou `rounded-lg` |
| **Badges, Tags & Chips**     | 4px a 6px                        | `rounded` ou `rounded-md`    |

##### A Disciplina da Sombra: Quando usar sombras?

- **Proibido em estado de repouso na página:** Cards de métrica, tabelas e gráficos repousam no mesmo plano dimensional. Sua delimitação deve ser feita via **bordas ultrafinas (_Hairline Borders_)**: `border border-slate-200 dark:border-white/10`.
- **Permitido exclusivamente em planos suspensos (`z-index > 10`):** Menus dropdown, popovers de data, gavetas laterais (_drawers_) e diálogos modais flutuantes.

---

#### ⏱️ Decisão 05: Precisão Temporal, Tipografia Tabular & Sparklines

> _"Welcome back, Jordan, waving hand. Plus 12.5% from last month. Placeholder copy and numbers with no shape. Name the period, tabular digits, a sparkline instead of a badge."_

##### O Problema

1. **Copy vazio:** Saudações informais gastam espaço nobre de cabeçalho sem fornecer utilidade decisória ao profissional corporativo.
2. **Métricas órfãs de contexto:** `+12.5%` não comunica se o crescimento ocorreu em relação à meta, ao mês anterior, ao mesmo mês do ano anterior (YoY) ou ao trimestre.
3. **Instabilidade visual:** Números normais sem alinhamento monospaçado causam tremor no layout quando valores sofrem live-reload via WebSockets ou SSE.

##### A Correção Canônica

1. **Substituir a saudação boba por meta-informação de contexto:** Indique o intervalo auditado exato e o carimbo de última sincronização.
2. **Obrigatoriedade de Dígitos Tabulares (`tabular-nums`):** Números com larguras idênticas para evitar oscilações.
3. **Substituir a badge estática por um _Sparkline_:** Uma badge isolada não revela a volatilidade; um micrográfico vetorial compacto de 16px a 24px de altura comunica se o crescimento foi consistente ou fruto de um pico pontual atípico.

```text
[ ANTI-PADRÃO (AI Slop) ]
Welcome back, Alex! 👋
R$ 54.200 (+12% from last month) [Badge Verde]

[ PADRÃO CANÔNICO (Executive Precision) ]
Painel Operacional — Reembolsos & Diárias
Intervalo: 01/08/2026 – 31/08/2026 • Atualizado há 4 min
R$ 54.200,00  ↑ 12,0% MoM  [ ~~~~~/\_/\  Sparkline ]
```

---

### 🔢 3. Tipografia Tabular (`tnum`) e Prevenção de Tremor de Dados

Em dashboards executivos, dígitos numéricos atualizam frequentemente (filtros dinâmicos, paginação, WebSocket). Em tipografias padrão sem números tabulares (como Inter ou Roboto com numerais proporcionais), o caractere `1` é consideravelmente mais estreito que o `8` ou o `0`.

Quando o número muda de `111.111` para `888.888`, a largura do texto se expande fisicamente, empurrando badges, bordas e colunas adjacentes para os lados (_Layout Shift_ cumulativo).

#### Configuração em CSS Nativo e Tailwind

```css
/* Definição canônica para cards numéricos e KPIs */
.kpi-metric {
  font-family: var(--font-sans, system-ui, sans-serif);
  font-feature-settings:
    'tnum' 1,
    'cv05' 1;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.025em;
}
```

```html
<!-- Aplicação direta com classes Tailwind -->
<span class="text-3xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-slate-50">
  {{ valorTotal | currency:'BRL':'symbol':'1.2-2' }}
</span>
```

---

### ⚡ 4. Anatomia dos Componentes: Hero Card vs. Secondary Cards

A engenharia de um grid de dashboards de alto padrão divide-se em duas assinaturas anatômicas fundamentais:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ANATOMIA DO HERO CARD                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Header: Label Semântico Uppercase (11px) + Tag de Status Operacional     │
│ 2. Core Value: Número Principal Gigante (32-40px, tabular-nums)             │
│ 3. Contextual Delta: Variação percentual + Período comparativo explícito    │
│ 4. Sparkline Visual: Curva vetorial SVG inline (tendência de 30 pontos)     │
│ 5. Footer: Meta operacional ou breakdown secundário (text-xs text-muted)    │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        ANATOMIA DO SECONDARY CARD                           │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Header: Label Conciso (12px, text-slate-500)                             │
│ 2. Core Value: Valor Médio (20-24px, tabular-nums)                          │
│ 3. Delta Simples: Seta direcional discreta + valor absoluto de diferença    │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### O Sparkline Vetorial Inline (`<svg>`)

Um sparkline profissional em dashboard não necessita de pesadas bibliotecas de charting (Chart.js ou D3) para o grid de cartões. Um elemento `<svg>` leve e nativo com `stroke` de 1.5px e preenchimento gradual transparente garante renderização instantânea a 0ms de bloqueio:

```html
<!-- Sparkline Ultraleve para Cards de Métricas -->
<svg class="h-7 w-24 overflow-visible" viewBox="0 0 100 30" fill="none" aria-hidden="true">
  <!-- Gradiente sutil de preenchimento sob a curva -->
  <defs>
    <linearGradient id="sparklineGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#10b981" stop-opacity="0.25" />
      <stop offset="100%" stop-color="#10b981" stop-opacity="0.00" />
    </linearGradient>
  </defs>
  <!-- Área preenchida -->
  <path d="M0,25 Q15,20 30,22 T60,10 T90,5 L90,30 L0,30 Z" fill="url(#sparklineGrad)" />
  <!-- Linha de tendência lapidada -->
  <path
    d="M0,25 Q15,20 30,22 T60,10 T90,5"
    stroke="#10b981"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>
```

---

### 🧭 5. Layouts Cognitivos: Scannability, Z-Pattern e Bento Grids Executivos

A organização de uma tela analítica segue o comportamento ocular de leitura executiva:

```text
[ ÂNCORA 1: Topo Esquerdo ] ───────────────> [ ÂNCORA 2: Topo Direito ]
Controles Globais, Filtro de Período          Ações Primárias (Exportar, Novo)
         │                                              │
         │ (Escaneamento Z-Pattern)                    │
         ▼                                              ▼
[ ÂNCORA 3: Centro-Esquerdo ] ─────────────> [ ÂNCORA 4: Centro-Direito ]
Hero KPI (Métrica North Star 1+N)             Gráfico de Decomposição / Status
         │                                              │
         ▼                                              ▼
[ ÁREA DE ALTA DENSIDADE ] ──────────────────────────────────────────────
Data Table Canônica (Transações, Solicitações, Auditoria Detalhada)
```

#### Regras de Ouro de Scannability:

1. **A regra dos 3 segundos:** Em três segundos, um diretor ou auditor deve identificar:
   - A saúde geral do setor (Positiva / Alerta / Crítica).
   - O volume total em trânsito financeiro.
   - A pendência imediata que exige sua assinatura ou intervenção.
2. **Bento Grid Racional:** Use grids assimétricos (ex: `grid-cols-12`) onde componentes com dados contínuos (tabelas e séries temporais) recebem maior largura (`col-span-8`), enquanto agregações categóricas recebem colunas laterais (`col-span-4`).

---

### 🪞 6. Integração com Liquid Glass & Design System Corporativo

Quando o dashboard é inserido em ecossistemas de alta fidelidade visual (como o padrão **Executive Liquid Glass** adotado no MonFinTrack e CPB Design System), os cartões de métrica devem harmonizar elegância e rigor funcional:

```scss
// Tokenização de Cards no estilo Liquid Glass Executivo
.executive-kpi-card {
  background: rgba(255, 255, 255, 0.75);
  backdrop-filter: blur(16px) saturate(160%);
  border: 1px solid rgba(226, 232, 240, 0.8);
  box-shadow:
    0 1px 2px 0 rgba(0, 0, 0, 0.03),
    inset 0 1px 0 0 rgba(255, 255, 255, 0.9);
  transition:
    border-color 200ms ease,
    transform 150ms ease;

  &:hover {
    border-color: rgba(59, 130, 246, 0.4);
  }
}

:host-context(.dark) .executive-kpi-card {
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow:
    0 1px 2px 0 rgba(0, 0, 0, 0.2),
    inset 0 1px 0 0 rgba(255, 255, 255, 0.05);

  &:hover {
    border-color: rgba(96, 165, 250, 0.3);
  }
}
```

---

### ♿ 7. Acessibilidade Universal: WCAG 2.2 AAA em Visualização de Dados

Dashboards falham frequentemente em auditorias de acessibilidade digital por utilizarem apenas cor para indicar tendências ou ocultarem valores contextuais para leitores de tela.

#### 1. Critério 1.4.1 (Uso de Cores - Nível A)

**Nunca indique status positivo/negativo apenas com verde ou vermelho.** Sempre acompanhe com:

- Ícone ou caractere direcional explícito (`↑`, `↓`, `→`).
- Texto audível para leitores de tela via classe `.sr-only` (`"Aumento de 12 por cento"`).

#### 2. Critério 1.4.3 e 1.4.6 (Contraste Mínimo e Aprimorado - AA e AAA)

- Textos grandes de KPIs (`>= 24px` ou `>= 18.5px bold`): Razão de contraste mínima de **4.5:1** (AAA requer **7:1**).
- Labels auxiliares (`11px` a `13px`): Razão de contraste mínima de **4.5:1** (AA) e **7:1** (AAA). Evite tons excessivamente esmaecidos como `text-slate-300` sobre fundo branco.

#### 3. Exemplo Semântico com Suporte a Screen Readers

```html
<div
  class="kpi-delta flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400"
>
  <span aria-hidden="true">↑ 8,4%</span>
  <span class="sr-only">Aumento de 8 vírgula 4 por cento em relação a Julho de 2026</span>
</div>
```

---

### 💻 8. Implementação de Referência: Angular 21 Standalone & Tailwind CSS

Abaixo encontra-se a arquitetura de componente canônico para o **Hero Metric Card** em Angular 21, utilizando Standalone Components, Signal Inputs e ChangeDetection OnPush:

```typescript
// src/app/shared/ui/dashboard/hero-kpi-card.ts
import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'gsd-hero-kpi-card',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 transition-colors dark:border-slate-800 dark:bg-slate-900"
      role="region"
      [attr.aria-label]="label()"
    >
      <!-- Topo: Label e Meta -->
      <div class="flex items-start justify-between gap-2">
        <div>
          <span
            class="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
          >
            {{ label() }}
          </span>
          <p *ngIf="sublabel()" class="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
            {{ sublabel() }}
          </p>
        </div>
        <div
          *ngIf="badgeText()"
          class="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
        >
          {{ badgeText() }}
        </div>
      </div>

      <!-- Meio: O Número como Herói -->
      <div class="my-4">
        <div
          class="font-sans text-3xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-slate-50 lg:text-4xl"
        >
          {{ formattedValue() }}
        </div>

        <!-- Variação Contextual -->
        <div class="mt-2 flex items-center gap-2">
          <span
            class="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold"
            [ngClass]="deltaClasses()"
          >
            <span aria-hidden="true">{{ isPositive() ? '↑' : '↓' }} {{ deltaPercent() }}%</span>
            <span class="sr-only">
              {{ isPositive() ? 'Crescimento' : 'Queda' }} de {{ deltaPercent() }} por cento
              comparado ao período anterior
            </span>
          </span>
          <span class="text-xs text-slate-500 dark:text-slate-400">
            {{ periodComparison() }}
          </span>
        </div>
      </div>

      <!-- Base: Rodapé com Sparkline ou Detalhes -->
      <div
        class="flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800/80 dark:text-slate-400"
      >
        <span>Última sincronização: {{ lastSync() }}</span>
        <ng-content select="[footer-action]"></ng-content>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
    `,
  ],
})
export class GsdHeroKpiCard {
  label = input.required<string>();
  sublabel = input<string>('');
  value = input.required<number | string>();
  isCurrency = input<boolean>(true);
  deltaPercent = input.required<number>();
  periodComparison = input<string>('vs. mês anterior');
  badgeText = input<string>('');
  lastSync = input<string>('Tempo real');

  isPositive = computed(() => this.deltaPercent() >= 0);

  deltaClasses = computed(() => {
    return this.isPositive()
      ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40'
      : 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40';
  });

  formattedValue = computed(() => {
    const val = this.value();
    if (typeof val === 'number' && this.isCurrency()) {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(val);
    }
    return val.toString();
  });
}
```

---

### 📋 9. Checklist de Auditoria Anti-Slop: Do & Don't Definitivo

Antes de publicar qualquer painel ou tela analítica, submeta o código à lista de verificação executiva:

| Dimensão Visual            | ❌ NÃO FAÇA (Anti-Padrão AI Slop)                               | ✅ FAÇA (Padrão Canônico Executivo)                                                                    |
| :------------------------- | :-------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------- |
| **Cores & Fundos**         | Gradientes roxo/azul/rosa em botões, cartões e gráficos.        | Cores de superfície sólidas e neutras com **1 único destaque plano**.                                  |
| **Ícones de KPI**          | Cada card tem um quadrado com fundo pastel diferente (4 cores). | Elimine as caixas de fundo; o **número é o elemento protagonista**.                                    |
| **Hierarquia da Grade**    | 4 cards simétricos idênticos em `grid-cols-4`.                  | **Hierarquia 1+N**: 1 métrica âncora grande + N métricas secundárias.                                  |
| **Bordas & Cantos**        | Raio exagerado de 16px em tudo (`rounded-2xl`).                 | Escala proporcional: 8-12px em cards, 6-8px em botões e inputs.                                        |
| **Sombras & Profundidade** | `drop-shadow-lg` em todos os cartões na tela.                   | **Hairline borders** (`border border-slate-200 dark:border-white/10`); sombra só em modais e popovers. |
| **Dígitos Numéricos**      | Numerais com larguras proporcionais variadas.                   | Tipografia estritamente tabular (`tabular-nums` / `font-feature-settings: 'tnum'`).                    |
| **Micrográficos**          | Apenas uma badge colorida dizendo `+12%`.                       | **Sparkline vetorial leve** revelando a tendência e dispersão do dado.                                 |
| **Textos de Saudação**     | _"Bem-vindo de volta, João! 👋"_ ocupando o topo.               | Cabeçalho analítico objetivo com intervalo e data de atualização.                                      |
| **Acessibilidade**         | Verde e vermelho sem indicativo textual ou ícone.               | Setas contextuais e texto `.sr-only` para leitores de tela (WCAG AAA).                                 |

---

<div align="center">
  <b>Guia Canônico de Design de Dashboards & Métricas • Engenharia de Software & Design Systems</b><br>
  <i>Padronização técnica aplicável a plataformas web corporativas, fintechs e sistemas ERP de alta densidade.</i>
</div>
