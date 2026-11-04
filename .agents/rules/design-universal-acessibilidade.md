# Checklist de Design Universal, UI/UX e Acessibilidade (`.agents/rules/design-universal-acessibilidade.md`)

<!-- Fonte canônica: templates/rules/design-universal-acessibilidade.md (guides/design-ui-ux/guia-universal-design-ui-ux-acessibilidade.md) — instalado por UI-01 -->

Regra always-on: aplique este checklist em lançamento de qualquer tela ou componente. Itens abertos bloqueiam a promoção. Guia completo em `.agents/ai-guides/guides/design-ui-ux/guia-universal-design-ui-ux-acessibilidade.md`.

## 📋 12. Scorecard e Checklist de Auditoria `/design-review`

Utilize esta matriz como roteiro compulsório de auditoria antes de lançar qualquer nova tela ou componente em produção:

### 📊 Matriz de Avaliação (0 a 10 Pontos por Dimensão)

| Dimensão                                    | Critérios de Avaliação                                                                                                                                                                                                                                                                      | Nota (0-10) |  Status  |
| :------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :---------: | :------: |
| **1. Arquitetura & UX**                     | Grid 4/8pt via `rem`/`clamp()`, hierarquia visual, contraste WCAG 2.2 AA (≥ 4.5:1), Tailwind CSS First, componentes in-house sem libs pesadas                                                                                                                                               |   `__/10`   | 🟢/🟡/🔴 |
| **2. Polimento & Micro-UX**                 | 5 estados (Loading, Empty, Error, Success, Disabled), skeletons sem CLS, touch targets ≥ `2.75rem`, `aria-live` em atualizações dinâmicas                                                                                                                                                   |   `__/10`   | 🟢/🟡/🔴 |
| **3. Animação & Interação (Física Fluida)** | Molas com damping/response adequados, resposta imediata a pointerdown, tracking 1:1 sem travamento, interruptibilidade em voo a partir do valor atual, projeção de momentum, rubber-banding, GPU only (transform/opacity), `@starting-style`, `prefers-reduced-motion` e harmonia sensorial |   `__/10`   | 🟢/🟡/🔴 |
| **4. Tipografia & Identidade**              | Escala fluida com `clamp()`, optical sizing (`font-optical-sizing: auto`), tracking específico por tamanho (negativo em display, positivo em legendas), zero `font-size` em `px`, measure de 45-75ch, Inter, Material Symbols, zero hex hardcoded                                           |   `__/10`   | 🟢/🟡/🔴 |
| **5. Estética & Multi-Tema**                | 3 temas (Claro, Escuro, Alto Contraste AAA), elevação por luminosidade, materiais translúcidos com hierarquia de peso (proibido empilhar glass claro sobre claro), `forced-colors`, `prefers-reduced-transparency`, zero AI slop                                                            |   `__/10`   | 🟢/🟡/🔴 |
| **6. Z-Index & Overlays**                   | Escala de `--z-*` respeitada, overlays em portal root, sem stacking contexts inesperados, `isolation: isolate` onde necessário, `overflow:hidden` não corta                                                                                                                                 |   `__/10`   | 🟢/🟡/🔴 |
| **7. Responsividade Fluida**                | `clamp()` em tipo e espaçamento, Container Queries, `svh`/`dvh`, sem larguras/alturas fixas em `px`, safe areas mobile                                                                                                                                                                      |   `__/10`   | 🟢/🟡/🔴 |

> **Pontuação Geral do Componente/Tela:** `___ / 70 Pontos`
>
> - **63 a 70 Pontos:** 🟢 **Aprovado com Excelência (Pronto para Produção)**
> - **49 a 62 Pontos:** 🟡 **Aprovado com Ressalvas (Ajustes finos recomendados)**
> - **Abaixo de 49 Pontos:** 🔴 **Reprovado (Requer refatoração estrutural)**

---

## 🏁 Conclusão & Aplicação Inter-Projetos

Este guia deve ser adotado como a especificação de engenharia de frontend de referência para novos repositórios e produtos digitais.

Ao iniciar um novo projeto:

1. Copie os **Tokens Semânticos** dos **3 Temas** e a escala de **Espaçamentos 8pt em `rem`/`clamp()`**.
2. Configure a **escala tipográfica fluida** com `clamp()` e a fonte padrão **Inter**.
3. Configure a biblioteca unificada de ícones **Material Symbols Outlined**.
4. Construa os componentes atômicos próprios (**In-House Design System**), evitando bibliotecas de terceiros.
5. Adote **Tailwind CSS** para toda estilização utilitária, restringindo CSS/SCSS a casos estritamente indispensáveis.
6. Valide cada tela nos 3 modos: **Light**, **Dark** e **Alto Contraste**; simule `forced-colors` e `prefers-reduced-motion`.
7. Configure a escala de **`--z-*`** e garanta que todos os overlays sejam renderizados em **portais** no `<body>`.
8. Configure `aria-live` para regiões dinâmicas e alvos de toque mínimos de **`2.75rem`**.
9. Aplique a skill `/design-review` em cada PR ou componente para garantir conformidade contínua.
