# Domínio da Interface Desktop Electron e Design System CCAT (`desktop_ui_ccat`): Design Técnico (Tech Design)

---

## 1. Camada Frontend

*   **Arquitetura de Design System (`docs/design/tokens.css`):**
    *   Tokens semânticos organizados em superfícies (`--color-bg-canvas`, `--color-bg-surface`, `--color-bg-elevated`), texto (`--color-text-primary`, `--color-text-secondary`, `--color-text-muted`), marca (`--color-brand-primary: #005A64`, `--color-brand-accent: #C84B31`), status (`--color-status-success`, `--color-status-warning`, `--color-status-danger`) e escala de `z-index` controlada (`--z-base`, `--z-sticky`, `--z-modal`, `--z-toast`).
    *   Utilitários nativos `.ccat-card`, `.ccat-btn`, `.ccat-btn-primary`, `.ccat-btn-accent`, `.ccat-badge`, `.ccat-code` e `.tabular-nums`.
*   **Superfícies Implementadas (`docs/design/`):**
    *   `docs/design/blocked-page.html`: Tela de interceptação servida em `http://127.0.0.1:49152/blocked` somente leitura (0.4.0): tema pelo sistema (Capycro, Capycro escuro, alto contraste), dados reais da query (`domain`, `rule`), saída segura (fechar aba/Esc) e respiração guiada opcional. Não há formulário de pedido, campo de código nem seletor de tema: a liberação depende de um Ajudante pareado no app (spec `docs/ai/specs/2026-11-06-refino-pagina-de-bloqueio-design.md`).
    *   `docs/design/tokens-showcase.html`: Catálogo vivo dos tokens e componentes servido em `http://127.0.0.1:49152/showcase`.
*   **Ponte Segura Electron (`src/preload/preload.ts`):**
    ```typescript
    export interface MonBlockBridge {
      getState(): Promise<RuleEngineState>;
      addBatchDomains(domains: string[]): Promise<{ valid: boolean; added: number; error?: string }>;
      enableCategory(categoryId: string): Promise<void>;
      requestPartnerUnblock(payload: { domain: string; reason: string }): Promise<{ requestId: string }>;
      verifyUnlockToken(payload: { challengeCode: string; token: string }): Promise<{ valid: boolean; duration?: string }>;
    }
    ```

---

## 2. Camada Backend

No contexto de `desktop_ui_ccat`, a camada backend imediata compreende o **Processo Principal do Electron (`src/main/`)** e o **Servidor HTTP Local (`scripts/test-block-server.mjs`)**:

*   **Servidor HTTP Local (`createMonBlockHttpServer` em `scripts/test-block-server.mjs`):**
    *   Serve os ativos estáticos com cabeçalhos de segurança (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`) e responde erros padronizados pela função `sendProblemDetails(res, status, title, detail, instance)` seguindo a **RFC 9457 (`application/problem+json; charset=utf-8`)**.
*   **Processo Principal Electron (`src/main/main.ts`):**
    *   Gerencia o ciclo de vida da janela, ícone de bandeja (`Tray` macOS), bloqueio de múltiplas instâncias (`requestSingleInstanceLock`) e tradução de chamadas `ipcMain.handle` para mensagens no socket do daemon.

---

## 3. Acesso a Dados, Persistência e Transacionalidade

*   **Zero Segredos no Armazenamento Web (`localStorage`):**
    *   Conforme as diretrizes Zero-Trust, nenhum token de desbloqueio, hash de senha ou credencial do Ajudante é armazenado em `localStorage`, `sessionStorage` ou `IndexedDB` do navegador/Electron. Apenas a preferência visual cosmética do tema (`data-theme`) pode ser mantida localmente na camada de apresentação.
*   **Cache de Idempotência em Memória (`idempotencyStore`):**
    *   O servidor `:49152` mantém um `Map` em memória indexado pelo cabeçalho `Idempotency-Key` para deduplicar submissões repetidas oriundas da página `/blocked`.

---

## 4. Assinatura de Endpoints

### 4.1. `GET /` e `GET /blocked`
*   **Caminho:** `GET http://127.0.0.1:49152/blocked`
*   **Payload de Saída (Output):** HTML5 semântico (`text/html; charset=utf-8`) de `docs/design/blocked-page.html`.
*   **Códigos de Resposta HTTP Mapeados:** `200 OK`.

### 4.2. `GET /tokens.css`
*   **Caminho:** `GET http://127.0.0.1:49152/tokens.css`
*   **Payload de Saída (Output):** Folha de estilos CSS (`text/css; charset=utf-8`) de `docs/design/tokens.css`.
*   **Códigos de Resposta HTTP Mapeados:** `200 OK`.

### 4.3. `GET /showcase`
*   **Caminho:** `GET http://127.0.0.1:49152/showcase`
*   **Payload de Saída (Output):** HTML5 semântico (`text/html; charset=utf-8`) de `docs/design/tokens-showcase.html`.
*   **Códigos de Resposta HTTP Mapeados:** `200 OK`.

### 4.4. Fallback `RFC 9457 Problem Details` (`400` / `404`)
*   **Headers:** `Content-Type: application/problem+json; charset=utf-8`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`.
*   **Payload de Saída (Exemplo `404`):**
    ```json
    {
      "type": "https://monblock.ccat.local/problems/404",
      "title": "Rota não encontrada",
      "status": 404,
      "detail": "A rota /inexistente não existe. Acesse /blocked ou /showcase.",
      "instance": "/inexistente"
    }
    ```

---

## 5. Resiliência, Filas e Eventos Assíncronos

*   **Prevenção de Submissão Duplicada (Debounce + `Idempotency-Key`):**
    *   Ao acionar o botão de pedido ao Ajudante na tela `/blocked`, o botão entra em estado `disabled` com indicador textual imediato e envia um cabeçalho `Idempotency-Key` único por sessão de bloqueio, garantindo que cliques duplos ou reconexões recebam `202 Accepted` com `"deduplicated": true`.
*   **Degradação Graciosa quando o Daemon ou Rede Estão Indisponíveis:**
    *   Se a chamada assíncrona ao Telegram falhar ou a máquina estiver offline, a interface transiciona sem travamentos para o **Modo de Desafio-Resposta Offline**, destacando o `challengeCode` local para validação via `HMAC-SHA256`.

*   **Temas (0.5.0):** `capycro-ivory` (padrão), `capycro-dark` (marca à noite com detalhes marrons, `tokens.css` + `renderer.css`), `dark-tech`, `light-fintech` e `high-contrast-aaa`. A página de bloqueio escolhe pelo sistema: alto contraste > `capycro-dark` > `capycro`.
