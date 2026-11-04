# Sub-Especificação Modular 04 (MOD-04) — Aplicativo Desktop Electron, Isolamento Zero-Trust & Interface CCAT

- **Data:** 2026-11-04
- **Código do Módulo:** `MOD-04`
- **Caminho Canônico:** `docs/ai/specs/2026-11-04-mod04-electron-desktop-ccat-ui-design.md`
- **Master Spec Vinculada:** `docs/ai/specs/2026-11-04-monblock-master-design.md`
- **Domínio DDD Correspondente:** `docs/domains/desktop_ui_ccat/`
- **ADRs de Referência:**
  - `docs/adrs/0001-arquitetura-split-privilegiada-daemon-monblockd.md`
  - `docs/adrs/0002-bloqueio-web-em-3-camadas-hosts-policies-watcher.md`
  - `docs/adrs/0003-catraca-unidirecional-append-only-e-aprovacao-ajudante.md`
  - `docs/adrs/0004-pareamento-duravel-tripla-persistencia-e-recuperacao-3-niveis.md`
- **Status:** Especificação Técnica Modular (Fase 1 MVP — Etapa 4 do Roadmap)

---

## 1. Objetivo & Escopo Core

O **Módulo 04 (`MOD-04`)** especifica o **Aplicativo Desktop Multiplataforma em Electron (`src/main/`, `src/preload/`, `src/renderer/`)** e a **Tela Local de Bloqueio (`docs/design/blocked-page.html`)**, construídos sobre o **Design System Oficial CCAT (`docs/design/tokens.css`)**.

O aplicativo Electron atua exclusivamente como uma **Camada de Apresentação Desprivilegiada (*Userland*)** conectada ao daemon `monblockd` (`MOD-03`):
1. **Isolamento Defensivo Zero-Trust no Electron:** Configuração estrita de `BrowserWindow` com `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, `webSecurity: true`, Content-Security-Policy (CSP) restrita, bloqueio de navegação externa (`will-navigate`, `setWindowOpenHandler`) e instância única (`app.requestSingleInstanceLock()`).
2. **Jornada Completa do Usuário (Do Primeiro Acesso ao Uso Contínuo Diário na Janela Principal e na Tray macOS):**
   - **Fase A — Primeiro Acesso & Onboarding Guiado (Wizard de 4 Passos):**
     1. *Passo 1 (Boas-Vindas & Pacto da Catraca Unidirecional):* Introdução visual clara explicando que o usuário tem autonomia total para trancar sites, palavras-chave e categorias a qualquer instante, mas apenas o Ajudante pode destrancar.
     2. *Passo 2 (Ativação do Guardião `monblockd` & Permissões do macOS):* Solicitação guiada de permissão única de Administrador para registrar o `LaunchDaemon` e permissão de Acessibilidade/Automação para o Watcher de navegadores.
     3. *Passo 3 (Pareamento com o Ajudante — Telegram + Senha Mestra):* Vinculação do Ajudante via Bot do Telegram (QR Code / Deep Link com botão `"Testar Notificação no Telegram"`) e cadastro da Senha Mestra do Ajudante (`scrypt`).
     4. *Passo 4 (Kit de Emergência de 5 Códigos + Seleção Inicial das 11 Categorias):* Exibição dos 5 códigos de uso único (`REC-XXXXXX-XXXXXX`) com checkbox obrigatório de confirmação de guarda e ativação inicial das categorias desejadas (`Conteúdo Adulto` já ativa e trancada por padrão).
   - **Fase B — Uso Contínuo no Dia a Dia via Menu da Tray (Barra de Menu do macOS — Acesso Rápido):**
     - O ícone do `monBlock` permanece sempre visível na Menu Bar do macOS exibindo o estado atual e oferecendo atalhos de 1 clique (`TrayContextMenu`):
       - **Cabeçalho de Status:** `🛡️ Proteção Ativa • Ajudante: [Nome]` (ou contador regressivo `⏱️ Pausa: 14:22` / `⏳ Cooldown: 71h` quando aplicável);
       - **`➕ Bloquear Site ou Palavra-Chave Rápido...`** $\rightarrow$ Abre mini-popover/modal instantâneo para colar um domínio ou keyword e trancar na hora (`Append-Only`);
       - **`🔒 Bloquear Site da Aba Atual do Navegador`** $\rightarrow$ Detecta o domínio aberto no navegador ativo e o adiciona imediatamente à lista de bloqueio com 1 clique;
       - **`🤝 Solicitar Desbloqueio Temporário ao Ajudante...`** $\rightarrow$ Abre diretamente o modal de pedido ao Ajudante (justificativa + duração `15m`/`60m` + envio Telegram ou código de desafio offline `MB-XXXX`);
       - **`🔑 Inserir Token / Código do Ajudante...`** $\rightarrow$ Atalho direto para colar um token `UNLOCK-15M-...` recebido do Ajudante;
       - **`🖥️ Abrir Janela Principal do monBlock`** $\rightarrow$ Abre e foca a janela completa do aplicativo Electron;
       - *Invariante de Segurança da Tray:* **Não existe opção `"Sair / Quit / Desativar Bloqueio"` no menu da Tray.**
   - **Fase C — Uso na Janela Principal (4 Vistas do Dashboard Desktop CCAT):**
     - **Vista 1 — Onboarding de Pareamento do Ajudante & Kit de Emergência:** Exibida apenas no primeiro acesso (quando `partner === null`).
     - **Vista 2 — Dashboard das 11 Categorias com Cadeado `Append-Only`:** Exibição clara das 11 categorias (`adult` ativa e trancada desde a instalação), permitindo ativar novas categorias com 1 clique e exigindo autorização do Ajudante para desativar qualquer categoria ativa.
     - **Vista 3 — Bloqueio Customizado em Lote (até 100 Domínios) & Palavras-Chave (`AND` + Anti-Falso-Positivo):** Textarea para colagem em lote de até `100` domínios/URLs (`RN-WEB-04`), cadastro de palavras-chave simples ou combinadas por vírgula (`RN-WEB-06`, com aviso assistido para palavras curtas $\le 3$ letras), lista de exceções (`Allowlist` protegida pelo Ajudante) e chave trancável **"Bloquear Modo Anônimo"** (`lockIncognito`).
     - **Vista 4 — Central do Ajudante, Desinstalação Autorizada & Recuperação em 3 Níveis:** Solicitação de desbloqueio temporário, validação de Token `HMAC-SHA256` offline (`UNLOCK-15M-*`), redefinição via Recovery Code (`REC-*`), início/acompanhamento do **Cooldown Time-Lock de 72 Horas** e botão de **Desinstalação Autorizada (`UNINSTALL_AUTHORIZED`)**.

### 1.1. Mapeamento de Arquivos (`src/`, `docs/design/` e `tests/`)

| Caminho do Arquivo | Papel Arquitetural | Status no Repositório |
| :--- | :--- | :--- |
| `docs/design/tokens.css` | Design Tokens oficiais CCAT: 4 temas (`capycro`, `dark-tech`, `light-fintech`, `high-contrast`), tipografia fluida, espaçamento, zero roxo e utilitários `.ccat-*`. | Implementado e validado |
| `docs/design/blocked-page.html` | Tela de Bloqueio Local (`127.0.0.1:49152/blocked`) empática, com resumo da regra acionada, pedido ao Ajudante e suporte aos 4 temas CCAT. | Implementado e testado |
| `docs/design/tokens-showcase.html` | Bento Grid Showcase interativo de validação visual dos tokens CCAT. | Implementado e testado |
| `src/main/main.ts` | Processo Principal Electron: ciclo de vida (`ready-to-show` sem white flash), `requestSingleInstanceLock`, System Tray macOS e ponte IPC com `monblockd`. | Especificado para implementação na Etapa 4 |
| `src/preload/preload.ts` | Ponte segura (`contextBridge.exposeInMainWorld('monblock', ...)`) expondo apenas métodos tipados e higienizados para o Renderer. | Especificado para implementação na Etapa 4 |
| `src/renderer/index.html` & `src/renderer/app.ts` | Interface Desktop CCAT contendo as 4 vistas (Onboarding, Categorias, Domínios/Keywords em Lote e Central de Recuperação em 3 Níveis) e os 5 estados de UI. | Especificado para implementação na Etapa 4 |
| `tests/ui/desktop-ui.test.ts` | Suíte de testes automatizados validando isolamento Electron, fluxos da UI, acessibilidade WCAG 2.2 AAA e estados de erro `RFC 9457`. | Especificado para implementação na Etapa 4 |

### 1.2. Contrato da Ponte Preload (`window.monblock`)

```typescript
// src/preload/preload.ts
export interface MonBlockBridgeApi {
  getState(): Promise<PersistedSystemState>;
  enableCategory(categoryId: string): Promise<{ ok: boolean; state?: PersistedSystemState; problem?: ProblemDetails }>;
  addBatchDomains(rawDomains: string[]): Promise<{ ok: boolean; addedCount?: number; problem?: ProblemDetails }>;
  addKeyword(rawKeyword: string): Promise<{ ok: boolean; problem?: ProblemDetails }>;
  enableIncognitoLock(): Promise<{ ok: boolean; problem?: ProblemDetails }>;
  authorizeProtectedMutation(params: {
    nextState: RuleEngineState;
    authMethod: 'PASSWORD' | 'HMAC_TOKEN' | 'RECOVERY_CODE';
    credential: string;
    challengeCode?: string;
  }): Promise<{ ok: boolean; problem?: ProblemDetails }>;
  startEmergencyCooldown(): Promise<{ ok: boolean; cooldownStartedAtIso: string }>;
}
```

---

## 2. Restrições Técnicas, Casos de Borda & Invariantes

### 2.1. Restrições Não-Funcionais (Performance Desktop & UX)
- **Eliminação de White Flash no Boot:** A `BrowserWindow` inicia com `show: false` e `backgroundColor: '#F6F4EE'` (ou `#0B0F17` em modo escuro) e só é exibida no evento `ready-to-show` (`< 250ms`).
- **Independência da Janela em Relação ao Bloqueio (`RN-LIFE-01`):** Fechar a janela no botão vermelho do macOS (Traffic Light) apenas oculta a janela para a bandeja do sistema (Menu Bar Tray); mesmo que o processo Electron seja encerrado com `SIGKILL`, o `monblockd` mantém 100% do bloqueio ativo.
- **Orçamento de Renderização:** Zero animações que disparem *layout thrashing*; interações de filtro e alternância de abas respondem em `< 16ms` (`60fps`).

### 2.2. Invariantes de Interface e Segurança
1. **Invariante `INV-UI-RATCHET-01` (Representação Visual e Funcional da Catraca `Append-Only`):** Categorias ativas (`enabled: true`) e a trava `lockIncognito: true` exibem ícone de cadeado trancado (`Locked by Partner`). Clicar para desativar nunca altera o estado otimisticamente sem antes abrir o `<dialog>` de credencial do Ajudante e receber confirmação `200 OK` do daemon.
2. **Invariante `INV-UI-INFRA-02` (Filtro Visual de Infraestrutura Crítica):** Se o usuário colar um lote contendo `localhost` ou `api.telegram.org`, a UI informa que domínios de infraestrutura crítica foram ignorados automaticamente para evitar auto-sabotagem (`CRITICAL_INFRA_ALLOWLIST`).
3. **Invariante `INV-UI-PASTE-03` (Autenticação Acessível WCAG 2.2 3.3.8):** Nenhum campo de senha do Ajudante, código `UNLOCK-*` ou código `REC-*` bloqueia eventos `paste` ou gerenciadores de senha.

### 2.3. Casos de Borda Tratados (`Corner Cases`)
- **Colagem de Lote com Mais de 100 Domínios ou Linhas Vazias:** O parser do textarea divide por quebras de linha, vírgulas ou espaços, descarta linhas em branco e, se o total ultrapassar `MAX_BATCH_DOMAINS = 100`, exibe imediatamente o `Error State (RFC 9457)` sem truncar silenciosamente.
- **Tentativa de Abrir Múltiplas Instâncias do App:** `app.requestSingleInstanceLock()` intercepta a segunda instância e foca a janela existente (`mainWindow.restore(); mainWindow.focus()`).
- **Queda Temporária de Conexão com o Daemon:** Se o socket do `monblockd` estiver reiniciando via `launchd`, a UI entra em `Partial / Degraded State` com reconexão automática (`backoff + jitter`), desabilitando botões de mutação até o restabelecimento.

---

## 3. Arquitetura, Limites Modulares & Contratos de Erro (`RFC 9457`)

### 3.1. Limites Modulares (Arquitetura Multi-Processo Electron)
- **`src/main/main.ts` (Main Process):** Gerencia janelas nativas, Tray do macOS, cabeçalhos CSP e cliente IPC para o `monblockd`.
- **`src/preload/preload.ts` (Preload Script):** Executa em contexto isolado com `sandbox: true`, validando tipos primitivos antes de enviar mensagens via `ipcRenderer.invoke`.
- **`src/renderer/` (Renderer Process):** HTML5 semântico + CSS Tokens (`docs/design/tokens.css`) + TypeScript puro, sem acesso a `node:fs`, `node:child_process` ou segredos criptográficos.

### 3.2. Renderização Padronizada de Erros (`RFC 9457 Problem Details`)
Toda falha retornada pelo daemon (`application/problem+json`) é mapeada diretamente para o componente `.ccat-alert-error` (`role="alert"`) exibindo `problem.title` e `problem.detail` de forma clara e acionável:

```json
{
  "type": "https://monblock.ccat.local/problems/400",
  "title": "Limite de lote excedido",
  "status": 400,
  "detail": "Limite máximo de 100 domínios por lote excedido (RN-WEB-04).",
  "instance": "/ipc/rules/batch-domains"
}
```

---

## 4. Resiliência: Timeouts, Retry com Backoff + Jitter, Concorrência, Idempotência & Degradação

1. **Timeouts Explícitos (`ms`) & Prevenção de Spinners Infinitos:**
   - Toda chamada `ipcRenderer.invoke` no Renderer possui timeout de interface de `4000ms` via `AbortController` / `Promise.race`. Se excedido, o estado de `Loading` é encerrado imediatamente e substituído pelo `Error State` com botão `"Tentar Novamente"`.
2. **Retry com Backoff Exponencial + Jitter na Conexão com o Daemon:**
   - Caso a ponte IPC perca conexão com o daemon, o cliente executa reconexão automática em background com backoff exponencial (`300ms`, `900ms`, `2100ms`, teto `5000ms`) + jitter aleatório (`0-150ms`).
3. **Concorrência, Debounce & Idempotência (`Double-Submit Protection`):**
   - Botões de submissão (`"Adicionar Lote"`, `"Solicitar ao Ajudante"`, `"Confirmar Código"`) aplicam bloqueio imediato de reentrância (`aria-busy="true"`, `disabled`) e geram uma `Idempotency-Key` determinística por intenção de clique, impedindo submissões duplicadas.
   - Campos de busca/filtragem local de domínios aplicam `debounce` de `150ms`.
4. **Degradação Graciosa (`Partial / Degraded State`):**
   - Quando a máquina está sem internet (Telegram inacessível), a UI destaca automaticamente a aba **"Código de Desafio Offline (HMAC)"** para que o usuário continue podendo obter aprovação do Ajudante por telefone/SMS.
5. **Limites de Fronteira de Dados (`Payload Boundaries`):**
   - Inputs de texto possuem `maxlength` explícito (`253` chars por domínio individual, `100` linhas no lote, `120` chars por palavra-chave combinada, `500` chars na justificativa).

---

## 5. Segurança Defensiva Zero-Trust no Electron

- **Tríade Obrigatória de Isolamento (`ADR-0001`):**
  ```typescript
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    preload: path.join(__dirname, '../preload/preload.js'),
  }
  ```
- **Content-Security-Policy (CSP) Estrita:** `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' http://127.0.0.1:49152; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`.
- **Bloqueio de Navegação e Popups Externos:** Handlers `contents.on('will-navigate', (e) => e.preventDefault())` e `contents.setWindowOpenHandler(() => ({ action: 'deny' }))` ativos em todas as janelas.
- **Prevenção de XSS no Renderer:** Proibição de `innerHTML` com dados dinâmicos; toda renderização de domínios, palavras-chave ou mensagens de erro utiliza exclusivamente `textContent`.

---

## 6. Design System CCAT, 5 Estados de UI, WCAG 2.2 AAA / APCA & Motion

- **4 Temas Semânticos CCAT (`docs/design/tokens.css`) & Banimento Absoluto de Roxo:**
  1. `capycro` (**Capycro Warm Ivory** — Padrão Diurno): Fundo `#F6F4EE`, superfície `#EFECE4`, primário Deep Teal `#005A64`, destaque Terracotta `#C84B31`.
  2. `dark-tech` (**Dark Tech** — Padrão Noturno): Fundo `#0B0F17`, superfície `#131B2E`, primário Cyan `#22D3EE`.
  3. `light-fintech` (**Light Fintech**): Fundo `#F8FAFC`, superfície `#FFFFFF`, primário `#0F766E`.
  4. `high-contrast` (**High Contrast AAA**): Fundo `#000000`, texto `#FFFFFF`, foco e ação `#FFD60A`, bordas sólidas de `2px`.
  - **Zero Roxo:** Nenhum token ou componente utiliza cores nas faixas `#600080..#A855F7` ou `hue 250..310`.
- **5 Estados Obrigatórios em Cada Vista da UI:**
  1. `Loading / Skeleton`: Placeholders estruturais `.ccat-skeleton` durante leitura inicial do estado do daemon.
  2. `Empty State`: Mensagem clara e orientativa quando a lista de palavras-chave customizadas ou a lista de exceções (`Allowlist`) está vazia.
  3. `Error State (RFC 9457)`: Banner `.ccat-alert-error` (`role="alert"`) exibindo o erro estruturado quando a Catraca `Append-Only` impede uma remoção ou quando o lote excede 100 domínios.
  4. `Partial / Degraded State`: Banner de modo offline (com gerador de código de desafio `MB-XXXX-XX`) ou barra fixa de contagem regressiva do Cooldown de 72h.
  5. `Populated State`: Dashboard completo com contadores `tabular-nums`, badges de status das 11 categorias e tabela enxuta de regras ativas.
- **Acessibilidade WCAG 2.2 AA/AAA & Contraste APCA:**
  - Contraste `>= 7:1` (`APCA Lc >= 75` para texto principal e `Lc >= 60` para rótulos secundários).
  - Alvos interativos (`.ccat-btn`, switches de categoria, seletor de tema) com dimensões mínimas `>= 44x44px` (`2.75rem`).
  - Foco visível não obscurecido (`:focus-visible` com `outline: 2px solid var(--ccat-focus-ring)` — WCAG 2.2 2.4.11) e hierarquia semântica `<header>`, `<nav>`, `<main>`, `<section>`, `<dialog>`.
- **Animação, Framerate Independence (`deltaTime`) & Acessibilidade Vestibular:**
  - Micro-interações utilizam apenas `transform` e `opacity` no compositor GPU (`60fps`/`120fps`, `cubic-bezier(0.22, 1, 0.36, 1)`).
  - Suporte integral a `@media (prefers-reduced-motion: reduce)` e `prefers-reduced-transparency: reduce` (desativando transições e efeitos de blur).
  - Todos os timers de interface (Cooldown 72h e concessões temporárias de 15m/60m) calculam o tempo restante via `deltaTime` / tempo real decorrido (`Date.now() - startMs` / `performance.now()`).

---

## 7. Pre-Mortem & Modos de Falha (Blast Radius)

| Incidente Hipotético (Pre-Mortem 3h da Manhã) | Blast Radius | Causa Raiz | Mitigação Implementada |
| :--- | :--- | :--- | :--- |
| **1. Domínio malicioso cadastrado com payload `<img src=x onerror=...>` tenta XSS no Dashboard** | Execução de script no processo Renderer | Uso indevido de `innerHTML` ao listar regras bloqueadas. | Renderização exclusiva via `textContent` + CSP estrita sem `'unsafe-eval'` + `sandbox: true` e `nodeIntegration: false`. |
| **2. Usuário força o encerramento do app Electron (`Cmd+Q` ou Activity Monitor)** | Tentativa de navegar em sites bloqueados após fechar a janela | Confusão entre processo de UI e motor de bloqueio. | `window-all-closed` mantém o Tray ativo e toda a imposição reside no `monblockd` + `/etc/hosts` + Browser Policies (`ADR-0001`). |
| **3. Usuário perde os 5 códigos de emergência porque pulou o aviso no Onboarding** | Dificuldade futura caso esqueça a senha e perca o Telegram | Onboarding sem etapa de confirmação explícita. | O botão `"Concluir Pareamento"` exige checkbox obrigatório confirmando que os 5 códigos `REC-*` foram copiados/enviados ao Ajudante. |

---

## 8. Matriz de Alternativas Consideradas (Trade-offs)

| Alternativa | Descrição | Prós | Contras | Veredito |
| :--- | :--- | :--- | :--- | :---: |
| **Abordagem A (SPA Pesada com Dezenas de Dependências UI Externas)** | Importar múltiplos frameworks CSS/JS e bibliotecas de animação pesadas. | Componentes prontos de terceiros. | Aumenta superfície de supply-chain (OWASP), infla o bundle Electron e viola o Design System CCAT (Zero Roxo / Anti-Slop). | Rejeitada |
| **Abordagem B (UI Nativa Exclusiva SwiftUI/AppKit)** | Construir interface apenas para macOS em Swift. | Integração nativa macOS. | Impede reuso direto da camada de interface para Windows e Linux nas fases seguintes. | Rejeitada |
| **Abordagem C (Electron Isolado Zero-Trust + HTML Semântico + Tokens CCAT `tokens.css`)** | Shell Electron leve com tríade Zero-Trust e CSS Tokens canônicos sem dependências supérfluas. | Multiplataforma, bundle enxuto, inicialização `< 250ms`, 100% aderente aos 4 temas CCAT e WCAG 2.2 AAA. | Requer implementação disciplinada da ponte `contextBridge`. | **Eleita** |

---

## 9. Reversibilidade & Plano de Rollback

1. **Reversão Instantânea de Tema e Preferências Visuais:**
   - O seletor de temas (`capycro`, `dark-tech`, `light-fintech`, `high-contrast`) altera apenas o atributo `data-theme` na raiz `<html>`, permitindo reversão instantânea ao padrão `capycro` sem afetar regras de bloqueio.
2. **Rollback de Estado Otimista de UI:**
   - Caso uma adição de regra falhe na comunicação com o daemon, o estado visual da lista reverte imediatamente ao snapshot confirmado pelo `getState()` e exibe o banner `RFC 9457`.

---

## 10. Estratégia de Testabilidade & Pirâmide de Testes (AAA)

1. **Testes Unitários e de Contrato de UI (`tests/ui/desktop-ui.test.ts`):**
   - *Arrange:* Carregamento da estrutura DOM do Dashboard Desktop (`src/renderer/index.html`) e da configuração de segurança do `main.ts` / `preload.ts`.
   - *Act:* Inspeção das flags de isolamento (`nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`), dos 4 temas CCAT, dos 5 estados de UI e do bloqueio de remoção pela Catraca `Append-Only`.
   - *Assert:* Verifica presença de todas as 11 categorias, cadeado nas regras ativas, ausência de cores roxas, alvos `>= 44px` e conformidade `RFC 9457`.
2. **Auditoria Automatizada de Acessibilidade e UX (`accessibility_checker.py` & `ux_audit.py`):**
   - Verificação estática e dinâmica garantindo `0` erros de contraste, presença de `:focus-visible`, `@media (prefers-reduced-motion: reduce)` e semântica HTML completa.
