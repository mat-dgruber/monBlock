# Checklist de Dashboards Anti-Slop (`.agents/rules/dashboard-anti-slop.md`)

<!-- Fonte canônica: templates/rules/dashboard-anti-slop.md (guides/design-ui-ux/guia-dashboard-design-anti-slop-ui-ux.md) — instalado por DASH-01 -->

Regra always-on: aplique este checklist em publicação de painéis e telas analíticas. Itens abertos bloqueiam a promoção. Guia completo em `.agents/ai-guides/guides/design-ui-ux/guia-dashboard-design-anti-slop-ui-ux.md`.

## 📋 9. Checklist de Auditoria Anti-Slop: Do & Don't Definitivo

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
