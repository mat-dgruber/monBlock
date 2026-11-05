# Domínio de Responsabilidade Compartilhada e Ajudante (`partner_accountability`): Design Técnico (Tech Design)

---

## 1. Camada Frontend

*   **Componentes de UI do Domínio:**
    1. **Wizard de Onboarding do Ajudante:** Fluxo guiado para cadastro do nome do Ajudante e Chat ID do Telegram. A definição da Senha Mestra é delegada diretamente ao Ajudante no Telegram via comando `/senha <senha>`, e os 5 códigos do Kit de Emergência (`REC-XXXXXX-XXXXXX`) são entregues exclusivamente no Telegram do Ajudante, sem exibição nem download na máquina do usuário (Custódia Exclusiva Anti-Autossabotagem — `ADR-0005`).
    2. **Modal / Card de Desafio-Resposta Offline (Tela `:49152/blocked` e App Desktop):** Exibe o código de desafio atual (`challengeCode`, ex.: `MB-8492-X7`) em fonte monoespaçada (`--font-mono`, `tabular-nums`) e campo de entrada para o token `UNLOCK-<DURATION>-<MAC10>` fornecido pelo Ajudante.
    3. **Central de Recuperação em 3 Níveis:** Interface dedicada com abas claras para (1) Solicitar `/reset_senha` via Telegram, (2) Inserir código `REC-XXXXXX-XXXXXX` do Kit de Emergência e (3) Iniciar/acompanhar o cronômetro regressivo do Cooldown de 72 horas calculado por `deltaTime` real (`Date.now() - startMs`).
*   **Feedback de Erro e Estados:**
    *   Violações da Catraca `Append-Only` (`canMutateProtectionRule().allowed === false`) exibem alerta semântico (`role="alert"`) com a razão exata retornada pelo domínio (ex.: `"Desativar a categoria 'adult' exige autorização do Ajudante."`).

---

## 2. Camada Backend

*   **Camada de Domínio Criptográfico (`src/domain/partner-guard.ts`):**
    *   Implementada utilizando exclusivamente o módulo nativo `node:crypto` (zero dependências NPM externas vulneráveis a ataques de *supply chain*).
    *   Exporta `hashPartnerPassword`, `verifyPartnerPassword`, `generateChallengeToken`, `verifyChallengeToken`, `generateRecoveryKit`, `evaluateEmergencyCooldown` e `canMutateProtectionRule`.
*   **Camada de Integração com Telegram (`TelegramPartnerClient`):**
    *   Comunica-se via HTTPS (`https://api.telegram.org/bot<TOKEN>/...`) usando credenciais injetadas de forma segura (Keychain / `op run --`).
    *   Envia mensagens estruturadas com `inline_keyboard` contendo callbacks assinados para `15m`, `60m`, `permanent` e `deny`.

---

## 3. Acesso a Dados, Persistência e Transacionalidade

*   **Persistência Atômica de Tokens Consumidos (`usedTokens`) e Kit de Emergência:**
    *   Para garantir a invariante `INV-REPLAY-04` (*Single-Use Tokens*), o registro de um token `UNLOCK-*` em `usedTokens` ou a invalidação de um código `REC-*` ocorre na mesma transação SQLite (`BEGIN IMMEDIATE ... COMMIT`) que aplica a mudança de estado em `RuleEngineState`.
*   **Espelhamento nos 3 Cofres (`ADR-0004`):**
    *   O hash da senha do Ajudante (`passwordHash`), o segredo HMAC (`hmacSecret`), os hashes remanescentes do Kit de Emergência e o timestamp `cooldownStartedAtIso` são replicados nos 3 cofres do `StateStore` (`SQLite 0600`, macOS System Keychain e `/var/db/monblock/partner.seal`).

---

## 4. Assinatura de Endpoints

### 4.1. `POST /api/unblock-requests` (Submissão de Pedido ao Ajudante)
*   **Caminho:** `POST http://127.0.0.1:49152/api/unblock-requests`
*   **Autenticação / Autorização:** Loopback local com cabeçalho `Idempotency-Key`.
*   **Payload de Entrada (Input):**
    ```json
    {
      "domain": "xvideos.com",
      "challengeCode": "MB-8492-X7",
      "reason": "Solicitação de revisão de bloqueio"
    }
    ```
*   **Payload de Saída (Output — `202 Accepted`):**
    ```json
    {
      "status": "accepted",
      "requestId": "req_9f8e7d6c5b4a",
      "domain": "xvideos.com",
      "deduplicated": false
    }
    ```
*   **Códigos de Resposta HTTP Mapeados:**
    *   HTTP 202 (`Accepted`): Pedido aceito (ou deduplicado via `Idempotency-Key`).
    *   HTTP 400 (`Bad Request` — `RFC 9457`): Payload JSON inválido.

### 4.2. Comandos IPC do Guardião (`monblockd.sock`)
*   **`PARTNER_VERIFY_TOKEN`**: Recebe `{ challengeCode, token }`, invoca `verifyChallengeToken()` e retorna `{ valid: boolean, duration?: '15m' | '60m' | 'permanent' }` (ou erro `403 Forbidden` se inválido/replay).
*   **`PARTNER_MUTATE_RULES`**: Recebe `{ nextState, partnerTokenOrPassword }`, valida `canMutateProtectionRule()` e retorna `200 OK` ou `403 Forbidden` (`RFC 9457 Problem Details`) com `detail: result.reason`.
*   **`PARTNER_START_COOLDOWN`**: Inicia o Time-Lock de 72 horas e retorna `{ unlocked: false, remainingHours: 72 }`.

---

## 5. Resiliência, Filas e Eventos Assíncronos

*   **Timeout, Backoff Exponencial + Jitter e Circuit Breaker para Telegram:**
    *   Requisições para `api.telegram.org` possuem timeout de `5000ms` e política de até 3 retentativas com backoff exponencial (`500ms`, `1500ms`, `3500ms`) + jitter aleatório (`0-250ms`).
    *   Após 5 falhas consecutivas de rede (ex.: usuário sem internet ou bloqueio de firewall), o Circuit Breaker abre por `60s` e a UI destaca imediatamente o fluxo de **Desafio-Resposta Offline (`HMAC-SHA256`)**, permitindo que o Ajudante gere o código `UNLOCK-<DURATION>-<MAC10>` sem depender de conectividade direta da máquina protegida com o Telegram.
