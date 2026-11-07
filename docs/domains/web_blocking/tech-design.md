# Domínio de Bloqueio Web em 3 Camadas (`web_blocking`): Design Técnico (Tech Design)

---

## 1. Camada Frontend

*   **Superfícies de UI do Domínio:**
    1. **Tela Local de Bloqueio (`docs/design/blocked-page.html` servida em `http://127.0.0.1:49152/blocked`):** Página estática ultra-rápida estilizada exclusivamente com tokens do Design System Oficial CCAT (`docs/design/tokens.css`, tema padrão *Capycro Warm Ivory* `#F6F4EE` e suporte a 4 temas sem roxo). Somente leitura (0.4.0): exibe o domínio (em ASCII/punycode) e a regra acionada (`ruleLabel`) recebidos do vigia de abas, a saída segura e uma explicação honesta de que a página não libera acessos. O formulário de pedido ao Ajudante e o campo de código `UNLOCK-<DURATION>-<MAC10>` foram removidos da página até existir Ajudante pareado e entrega real do pedido (o endpoint `POST /api/unblock-requests` segue no servidor).
    2. **Painel de Categorias e Regras no App Desktop Electron:** Exibe os switches das 11 categorias de `PREDEFINED_CATEGORIES` (com ícone de cadeado nas categorias ativas indicando que a desativação requer o Ajudante), campo de inserção em lote (`MAX_BATCH_DOMAINS = 100`) e lista de palavras-chave simples/combinadas.
*   **Invariantes de Validação e Feedback ao Usuário:**
    *   Erros de validação de lote ou bloqueios da Catraca `Append-Only` são apresentados em banners semânticos (`role="alert"`, `aria-live="polite"`) formatados a partir do payload `RFC 9457 Problem Details`.
    *   Todos os botões e switches respeitam área mínima de clique de `44x44px` (`2.75rem`) e foco visível `:focus-visible`.

---

## 2. Camada Backend

A arquitetura interna do domínio segue separação estrita entre **Núcleo de Domínio Puro (Zero I/O)** e **Enforcers de Infraestrutura**:

*   **Camada de Domínio (`src/domain/categories.ts`, `src/domain/rule-engine.ts`):**
    *   Funções 100% puras, síncronas e determinísticas (`sanitizeAndNormalizeUrl`, `validateBatchDomains`, `evaluateUrlAndTitle`). Não realizam chamadas de rede nem acesso a disco, permitindo execução em $< 1\text{ms}$ por avaliação de aba.
*   **Camada de Aplicação / Enforcers (`src/enforcers/hosts-enforcer.ts`, `src/enforcers/browser-policy-enforcer.ts`):**
    *   `applyAtomicHostsBlock(hostsFilePath, blockedDomains)` e `rollbackHostsFromBackup(hostsFilePath)`: gerenciam a escrita atômica POSIX e restauração do `/etc/hosts`.
    *   `buildBrowserPolicies(params: BrowserPolicyParams)`: transforma o estado de domínio nos contratos exatos exigidos pelos navegadores Chromium do perfil (`CHROMIUM_BUNDLE_IDS`: Chrome, Brave, Edge, Vivaldi, Opera, Chromium, Chrome Beta/Canary; o Arc e o Dia são cobertos só pelo DNS e pelo vigia) (`URLBlocklist`, `URLAllowlist`, `DnsOverHttpsMode`, `IncognitoModeAvailability`) e pelo Mozilla Firefox (`policies.WebsiteFilter`, `policies.DNSOverHTTPS`, `policies.DisablePrivateBrowsing`).
*   **Camada de Borda HTTP Local (`scripts/test-block-server.mjs`):**
    *   Servidor HTTP nativo (`node:http`) vinculado estritamente ao loopback `127.0.0.1:49152` (`createMonBlockHttpServer()`), servindo `/blocked`, `/tokens.css`, `/showcase`, `/api/health` e `/api/unblock-requests`.

---

## 3. Acesso a Dados, Persistência e Transacionalidade

*   **Transacionalidade em Sistema de Arquivos (`/etc/hosts`):**
    *   Para evitar corrupção do arquivo `/etc/hosts` em caso de queda de energia ou `SIGKILL`, `applyAtomicHostsBlock()` jamais edita o arquivo in-place. O algoritmo lê o conteúdo atual, cria `/etc/hosts.monblock.bak` (se ainda não existir), escreve o novo conteúdo completo em `/etc/hosts.monblock.tmp` e invoca `fs.renameSync(tmpPath, hostsFilePath)` (operação atômica no nível do inode POSIX).
    *   **Permissão `0644` obrigatória:** o `/etc/hosts` é gravado (e restaurado no rollback) em `0644` com `chmod` explícito, porque o daemon roda com `umask 077` e o mDNSResponder (sem root) ignora por completo um hosts `0600`, deixando os sites abertos. `applyWebRules` repara um hosts com conteúdo certo e modo errado, e `verifyApplied` conta o modo fora de `0644` como desvio. A trava `uchg` é sempre reposta (`finally`) após a regravação.
    *   De forma análoga, `rollbackHostsFromBackup()` copia `.monblock.bak` para `.monblock.rollback.tmp` e executa `fs.renameSync` sobre o arquivo alvo.
*   **Persistência do Estado de Regras (`RuleEngineState`):**
    *   As listas `enabledCategories`, `blockedDomains`, `allowlistDomains`, `keywords` e a flag `lockIncognito` são persistidas pelo `StateStore` do daemon privilegiado em SQLite `STRICT` (`0600`) com verificação de integridade.

---

## 4. Assinatura de Endpoints

### 4.1. `GET /blocked` (e `GET /`)
*   **Caminho:** `GET http://127.0.0.1:49152/blocked`
*   **Autenticação / Autorização:** Loopback local público (`127.0.0.1`)
*   **Payload de Saída (Output):** Documento HTML (`text/html; charset=utf-8`) da Tela de Bloqueio CCAT com cabeçalhos `X-Content-Type-Options: nosniff` e `X-Frame-Options: DENY`.
*   **Códigos de Resposta HTTP Mapeados:** `200 OK`.

### 4.2. `GET /api/health`
*   **Caminho:** `GET http://127.0.0.1:49152/api/health`
*   **Payload de Saída (Output):**
    ```json
    {
      "status": "ok",
      "service": "monblock-preview-server",
      "routes": ["/blocked", "/showcase", "/api/health", "/api/unblock-requests"]
    }
    ```
*   **Códigos de Resposta HTTP Mapeados:** `200 OK`.

### 4.3. `POST /api/unblock-requests`
*   **Caminho:** `POST http://127.0.0.1:49152/api/unblock-requests`
*   **Autenticação / Cabeçalhos:** Header `Idempotency-Key: <uuid>` para deduplicação de submissões.
*   **Payload de Entrada (Input):**
    ```json
    {
      "domain": "bet365.com",
      "reason": "Preciso acessar para encerrar conta antiga"
    }
    ```
*   **Payload de Saída (Output — `202 Accepted`):**
    ```json
    {
      "status": "accepted",
      "requestId": "req_a1b2c3d4e5f6",
      "domain": "bet365.com",
      "deduplicated": false
    }
    ```
*   **Códigos de Resposta HTTP Mapeados:**
    *   HTTP 202 (`Accepted`): Solicitação registrada (ou deduplicada com `"deduplicated": true` quando `Idempotency-Key` já foi processada).
    *   HTTP 400 (`Bad Request` — `application/problem+json` RFC 9457): Quando o corpo da requisição contém JSON malformado (`title: "Payload JSON inválido"`).
    *   HTTP 404 (`Not Found` — `application/problem+json` RFC 9457): Rota inexistente (`type: "https://monblock.ccat.local/problems/404"`).

---

## 5. Resiliência, Filas e Eventos Assíncronos

*   **Idempotência de Submissão (`idempotencyStore`):** Cliques múltiplos no botão "Pedir Desbloqueio ao Ajudante" com a mesma `Idempotency-Key` retornam imediatamente o registro em cache com `"deduplicated": true`, prevenindo flood de notificações no Telegram do Ajudante.
*   **Isolamento de Falhas do Watcher de Navegadores:** No macOS, a inspeção de abas via AppleEvents/`osascript` aplica timeout rígido de `1500ms` por processo para impedir que uma janela travada do navegador congele o loop de fiscalização do daemon.
*   **Defesa em Profundidade Independente:** Caso o Watcher de abas sofra atraso ou falta de permissão de Acessibilidade, as Camadas 1 (`/etc/hosts`) e 2 (`BrowserPolicies` com DoH desativado) continuam bloqueando a resolução e o carregamento dos domínios das 11 categorias e da blocklist sem qualquer degradação.

*   **Cobertura por camada (0.4.0):** DNS (`/etc/hosts`) vale para qualquer app que use o resolvedor do sistema; a política de navegador, para os identificadores de `CHROMIUM_BUNDLE_IDS` e o Firefox; o vigia de abas (`SUPPORTED_MACOS_BROWSERS`), para os navegadores com AppleScript, incluindo Dia, Vivaldi, Opera, Chromium e Chrome Beta/Canary. Quem tinha o perfil antigo precisa aprovar o perfil atualizado (a checagem exige todos os identificadores).

*   **Contrato HTTP da página de bloqueio (0.5.0):** `POST /api/unblock-requests` exige um handler de entrega real (`onUnblockRequest`); sem Ajudante ligado responde `503` Problem Details ("Nada foi enviado") em vez de `202`. Aceita `domain`, `reason`, `durationMinutes` ou `permanent: true`. `POST /api/unlock-code` nunca libera acessos (por HTTP local qualquer página poderia tentar derrubar bloqueios): responde `501` orientando a validar o código no app (IPC do daemon).
