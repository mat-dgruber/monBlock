# Plano de Implementação — Refatoração Integral de UI & UX do monBlock

> **Data:** 2026-11-05  
> **Status:** 🟢 Aprovado para Execução  
> **Artefato Canônico:** `docs/ai/plans/2026-11-05-refatoracao-ui-ux-fluxo-completo-plan.md`  
> **Referência da Spec:** `docs/ai/specs/2026-11-05-refatoracao-ui-ux-fluxo-completo-design.md`  
> **Guia Normativo:** CPB Dual-Harness, Clean Architecture e Design System CCAT.

---

## 1. Objetivo Técnico & Escopo

Refatorar a camada de apresentação desktop do `monBlock` ([`src/renderer/index.html`](file:///Users/matheus.diniz_1/Documents/GitHub/monBlock/src/renderer/index.html), [`src/renderer/app.ts`](file:///Users/matheus.diniz_1/Documents/GitHub/monBlock/src/renderer/app.ts) e [`src/renderer/renderer-init.js`](file:///Users/matheus.diniz_1/Documents/GitHub/monBlock/src/renderer/renderer-init.js)) para implementar uma experiência premium de foco e segurança comportamental sem anti-patterns visuais:
1. **Shell Desktop Dual-Rail:** Sidebar lateral fixa com navegação semântica, indicador de status do daemon e perfil rápido do Ajudante.
2. **Onboarding Wizard (Primeiro Acesso):** Stepper em 4 fases guiadas (Boas-vindas, Escudo Base, Pareamento do Telegram com validação e Kit de Códigos de Emergência `REC-*`).
3. **Inspeção e Transparência das 11 Categorias:** Cards ricos com contadores de regras, lista expansível de domínios/palavras-chave embutidos e atalho para adicionar regras diretamente.
4. **Gerenciador de Bloqueios Avançado:**
   - Verificador universal de URLs (*"Raio-X de Bloqueio"* em tempo real).
   - Tabela de sites bloqueados com busca reativa e paginação.
   - Nuvem de termos e palavras-chave combinadas com badges interativos.
   - Aba de Exceções & Lista Permitida (*Always Allow / Allowlist*).
5. **Central do Ajudante & Pausa Consciente:** Modal de reflexão anti-impulso (mini-timer respiratório 4-7-8) integrado a solicitação via Telegram, tokens offline HMAC e Cooldown 72h.

---

## 2. Restrições Técnicas & Invariantes

- **Invariante Zero-Purple (`RN-UI-01`):** Nenhum tom na faixa de roxo/índigo. Uso estrito de `#005A64`, `#C84B31`, `#F6F4EE` e neutros CCAT.
- **Invariante de Acessibilidade (`RN-UI-02`):** Áreas de clique $\ge 44\text{px}$, anel `:focus-visible` explícito, numerais `.tabular-nums` e suporte obrigatório a `prefers-reduced-motion`.
- **Invariante Zero-Trust Electron (`RN-UI-03`):** Proibido `nodeIntegration` ou vazamento de segredos para `localStorage`. Comunicação isolada via `window.monblock`.
- **Invariante da Catraca Append-Only (`ADR-0003` / `INV-UI-RATCHET-01`):** Adições de bloqueio são imediatas; desativações exigem autorização do Ajudante ou espera de 72h.

---

## 3. Matriz de Alternativas & Análise de Decisão

| Dimensão | Alternativa 1: HTML5 + CSS Tokens + JS Nativo Modular (Escolhida) | Alternativa 2: Migração Total para React / Vite SPA | Alternativa 3: Ajustes Pontuais no HTML Atual (Lean) |
| :--- | :--- | :--- | :--- |
| **Complexidade** | **Baixa/Média:** Aproveita a estrutura existente sem overhead de empacotamento ou dependências. | **Alta:** Exigiria reescrever o pipeline de build, bundler, router e hidratação. | **Mínima:** Não resolve a falta de transparência nem o onboarding quebrado. |
| **Performance** | **Instantânea:** Tempo de carregamento `< 30ms`, zero layout shift (CLS = 0). | **Média:** Bundle de ~300KB a mais, tempo de parsing no boot do Electron. | **Instantânea**, porém experiência visual monótona e confusa. |
| **UX & Ergonomia** | **Excelente:** Atende 100% dos guias CCAT, WCAG 2.2 AAA e ergonomia desktop. | **Excelente**, porém com custo de arquitetura desproporcional. | **Insatisfatória:** Mantém o usuário no escuro sem ver regras ou ter onboarding. |
| **Veredito** | **Adotada:** Melhor equilíbrio entre performance, segurança Zero-Trust e elegância. | Rejeitada (YAGNI / complexidade acidental). | Rejeitada (não atende aos requisitos do usuário). |

---

## 4. Fases e Passos de Execução

### Fase 1: Arquitetura HTML & Estilos CSS em `src/renderer/index.html`
- [ ] Construir layout Dual-Rail (Sidebar lateral retrátil + Canvas principal).
- [ ] Implementar a estrutura do Onboarding Stepper (Passos 1 a 4 com navegação e formulário de pareamento).
- [ ] Refatorar os cards das 11 categorias com gavetas/detalhes expansíveis para inspeção de domínios e termos.
- [ ] Criar o componente Verificador de URL (*"Raio-X"*), a Data Table de Sites com campo de busca e a Nuvem de Palavras-Chave.
- [ ] Criar o Modal de Pausa Consciente e o Modal de Inspeção de Regras.

### Fase 2: Lógica de Estado e Domínio em `src/renderer/app.ts`
- [ ] Exportar dados das categorias e catálogo para consumo imediato no renderer.
- [ ] Implementar função pura `evaluateUrlBlockStatus(url, state)` para o Raio-X instantâneo.
- [ ] Implementar paginação e filtro de busca em memória para a lista de domínios combinados.
- [ ] Manter e expandir as funções de validação de lotes (`parseAndValidateBatchInput`) e Cooldown (`formatRemainingCooldown`).

### Fase 3: Hidratação e Interatividade no Runtime em `src/renderer/renderer-init.js`
- [ ] Conectar os listeners do Stepper do Onboarding (avançar, voltar, pareamento com feedback e geração/download de códigos).
- [ ] Conectar o Verificador de URL em tempo real no evento `input`.
- [ ] Renderizar a lista de domínios e palavras-chave sob demanda com filtros de texto.
- [ ] Conectar os botões de expansão de categoria ("Ver sites protegidos nesta categoria").
- [ ] Conectar a Pausa Consciente de 10 segundos ao clicar em "Solicitar Desbloqueio".

### Fase 4: Testes Automatizados e Homologação
- [ ] Executar a suíte completa de testes (`npm test`) garantindo que todos os 66+ testes continuem verdes.
- [ ] Atualizar e expandir `tests/ui/desktop-ui.test.ts` para testar os novos componentes de UI e lógica do controlador.

---

## 5. Pre-Mortem & Plano de Rollback

- **Blast Radius:** Restrito aos arquivos do renderer (`src/renderer/index.html`, `src/renderer/app.ts`, `src/renderer/renderer-init.js`). O daemon `monblockd`, os enforcers e os cofres `TripleStateStore` não são tocados.
- **Rollback:** `git checkout -- src/renderer/` restaura imediatamente a versão anterior se houver qualquer problema de inicialização.

---
