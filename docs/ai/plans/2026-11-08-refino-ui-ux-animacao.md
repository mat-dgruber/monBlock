# Plano de Implementação: Refino Completo de UI, UX e Animações (monBlock)

> **Data:** 2026-11-08  
> **Status:** Proposto para Aprovação  
> **Documentos de Referência:**  
> - `docs/ai/reports/2026-11-08-design-review.md`  
> - `docs/ai/reports/2026-11-08-ux-review.md`  
> - `.agents/rules/ux-cognicao-comportamental.md`  
> - `.agents/rules/desenvolvimento-desktop.md`  
> - `.agents/rules/universal-design-acessibilidade.md`  

---

## 1. Contexto e Objetivos

Este plano define a esteira cirúrgica de melhorias de **UI**, **UX**, **Acessibilidade Digital (WCAG 2.2 AA/AAA)** e **Animação Fluida (Apple Fluid Interfaces)** para todos os pontos de contato visual do monBlock:
1. **Aplicativo Desktop Electron:** `src/renderer/index.html`, `src/renderer/renderer.css`, `src/renderer/app.ts`, `src/renderer/renderer-init.js`.
2. **Página Web Educacional de Bloqueio:** `docs/design/blocked-page.html`.
3. **Página de Conclusão do Instalador macOS:** `packaging/macos/resources/conclusion.html`.
4. **Design Tokens e Catálogo Visual:** `docs/design/tokens.css`, `docs/design/tokens-showcase.html`.

---

## 2. Restrições Técnicas & Invariantes

- **Zero Novas Dependências:** Nenhuma biblioteca externa de UI ou JS (zero aumento de bundle size).
- **Zero Layout Shifts (CLS = 0):** Toda animação restrita a `transform` e `opacity` aceleradas por hardware GPU.
- **Isolamento de Janela e Segurança:** Manter estritamente `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` e CSP estrito.
- **Contratos e Seletores de Testes:** Preservação integral de todos os IDs (`#batchDomainsTextarea`, `#cooldownTimerDisplay`, etc.), classes essenciais e atributos `data-*` validados pela suíte `tests/ui/` (262 testes).
- **Governança de ADRs:** Como as alterações incidem em polimento visual, acessibilidade WCAG e fluidez de micro-interações sem alterar contratos de IPC ou modelos de persistência, permanecem sob o escopo da governança da arquitetura de UI existente (`ADR-0002` e `ADR-0003`), dispensando nova ADR formal.

---

## 3. Matriz de Alternativas de Resolução

| Abordagem | Descrição | Vantagens | Desvantagens | Veredito |
| :--- | :--- | :--- | :--- | :---: |
| **Alternativa A: Lean / Patch Estrito** | Apenas corrigir o seletor órfão `btn-secondary` e adicionar media queries de transparência. | Menor esforço imediato. | Ignora ganho ergonômico de micro-interações táteis e não atende aos princípios Apple Fluid. | Descartada |
| **Alternativa B: Balanceada & Cirúrgica (Recomendada)** | Refinar CSS nativo, implementar `:active` press scale, WCAG 2.4.11 `scroll-padding-top`, fallbacks de `prefers-reduced-transparency/motion`, transições suaves `enter-view` e ergonomia em `conclusion.html`. | Máxima fidelidade estética e acessibilidade com zero overhead de código ou riscos de quebra. | Exige validação atenta nos 5 temas visuais. | **Selecionada** |
| **Alternativa C: Reescrita Completa com Framework CSS** | Migrar todo o frontend para Tailwind CSS ou biblioteca de componentes externa. | Padrões de classes utilitárias amplos. | Alto blast radius, violação da arquitetura canônica existente, quebra de testes e aumento do bundle. | Descartada |

---

## 4. Pacotes de Trabalho Detalhados

### Pacote 1: Acessibilidade WCAG 2.2 & Blindagem de Transparência / Movimento
- **Arquivos:** `src/renderer/renderer.css`, `docs/design/blocked-page.html`, `packaging/macos/resources/conclusion.html`.
- **Ações:**
  1. **WCAG 2.4.11 (Focus Not Obscured):** Adicionar `scroll-padding-top: var(--space-8, 2rem);` em `src/renderer/renderer.css` nos contêineres `.app-content-wrapper` e `.app-main` para assegurar que elementos focados por teclado não fiquem escondidos sob o cabeçalho fixo ou toasts.
  2. **Fallback de Translucidez:** Adicionar media query `@media (prefers-reduced-transparency: reduce)` em `src/renderer/renderer.css` para `dialog#partnerAuthDialog::backdrop, dialog#profileStepsDialog::backdrop`, desativando `backdrop-filter: blur(...)` e aplicando fundo sólido opaco de alto contraste.
  3. **Fallback em blocked-page.html:** Aplicar `@media (prefers-reduced-transparency: reduce)` na respiração senoidal de `.halo` e `.orb` em `docs/design/blocked-page.html`.
  4. **Acessibilidade em conclusion.html:**
     - Adicionar link de salto acessível `<a href="#main" class="skip-link">Pular para o conteúdo principal</a>`.
     - Encapsular o conteúdo em `<main id="main">`.
     - Adicionar estilos de foco visível `:focus-visible`.
     - Conter a largura de linha em `max-width: 65ch; margin-inline: auto;` com tipografia fluida via `clamp()`.

### Pacote 2: Micro-interações, Animações e Fluidez (Apple Fluid Interfaces)
- **Arquivos:** `src/renderer/renderer.css`, `docs/design/blocked-page.html`.
- **Ações:**
  1. **Feedback Tátil no Pointer-Down:** Adicionar estado `:active:not(:disabled)` com `transform: scale(0.985); transition: transform 60ms ease-out;` em todos os botões `.ccat-btn`, gerando resposta neuromotora imediata.
  2. **Coreografia de Troca de Abas:** Aplicar animação sutil `enter-view` nos painéis `[data-view]:not([hidden])` (`translateY(4px) -> translateY(0)` e opacidade em 200ms) com `prefers-reduced-motion` desativando-a instantaneamente.
  3. **Hover & Focus Suaves:** Ajustar curvas de easing de transição para `cubic-bezier(0.16, 1, 0.3, 1)` em cards, inputs e badges.

### Pacote 3: Polimento Fino, Micro-UX & Consistência de Componentes
- **Arquivos:** `src/renderer/renderer-init.js`, `src/renderer/renderer.css`.
- **Ações:**
  1. **Correção de Classe Órfã:** Substituir `class="btn-secondary"` por `class="ccat-btn ccat-btn-secondary"` na linha 223 de `src/renderer/renderer-init.js` (botão "Bloquear de novo" na tabela de regras).
  2. **Declaração Estilística Canônica:** Declarar formalmente `.ccat-btn-secondary` em `src/renderer/renderer.css` com borda sutil `var(--ccat-border)`, fundo `var(--ccat-bg-elevated)` e hover consistente em todos os 5 temas.
  3. **Ergonomia e Fitts' Law:** Assegurar altura mínima de toque (`min-height: 48px` / `3rem`) para botões de ação e campos numéricos/códigos.

---

## 5. Matriz de Risco e Segurança

| Risco Identificado | Severidade | Probabilidade | Mitigação Proposta |
| :--- | :---: | :---: | :--- |
| Quebra de seletores esperados pelos testes | Média | Baixa | Nenhuma remoção de IDs, atributos `data-*` ou roles existentes. Todas as classes mantidas 100% retrocompatíveis. |
| Regressão de performance visual ou layout thrashing | Baixa | Baixa | Todas as novas animações e transições restritas estritamente a propriedades de GPU (`transform` e `opacity`). |
| Incompatibilidade com temas de alto contraste | Média | Baixa | Validação estrita em `high-contrast-aaa` com bordas explícitas e foco amarelo `#FFD60A`. |

---

## 6. Plano de Validação & Rollback

### Validação
1. Executar `python3 /Users/matheus.diniz_1/.gemini/config/skills/design-review/scripts/accessibility_checker.py .` e comprovar resolução das pendências.
2. Executar `python3 /Users/matheus.diniz_1/.gemini/config/skills/design-review/scripts/ux_audit.py .`.
3. Executar `npm test` e comprovar aprovação de todos os 262 testes do Vitest.

### Rollback
- Caso qualquer teste falhe ou ocorra divergência visual, os commits atômicos ou arquivos alterados podem ser revertidos via `git checkout -- src/renderer/ docs/design/ packaging/`.
