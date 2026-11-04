# Domínio do Daemon Privilegiado e Tripla Persistência (`daemon_persistence`): Design Técnico (Tech Design)

---

## 1. Camada Frontend

Embora `daemon_persistence` seja um domínio majoritariamente de infraestrutura e sistema operacional, ele expõe telemetria de saúde para a camada visual (App Electron e Tela `:49152/blocked`):

*   **Indicadores de Saúde do Daemon e Cofres:**
    *   Badge de status na barra superior do Dashboard CCAT (`Proteção Ativa • Daemon Sincronizado` em verde `--color-status-success` `#0E9F6E` ou alerta de `Modo de Autodefesa / Tamper Detectado` em âmbar/terracota `--color-status-warning` / `--color-status-danger`).
*   **Consumo da Rota `/api/health`:**
    *   O frontend consulta `GET http://127.0.0.1:49152/api/health` com timeout de `2000ms` para confirmar a disponibilidade do serviço local antes de despachar formulários.

---

## 2. Camada Backend

*   **Daemon Supervisor (`monblockd`):**
    *   Configurado via manifesto `/Library/LaunchDaemons/com.ccat.monblockd.plist` com `RunAtLoad = true`, `KeepAlive = true` e `ThrottleInterval = 2`.
*   **Abstração `PlatformEnforcer` (`src/enforcers/`):**
    *   **Camada Hosts (`src/enforcers/hosts-enforcer.ts`):** Implementa `applyAtomicHostsBlock(hostsFilePath, blockedDomains)` e `rollbackHostsFromBackup(hostsFilePath)`, garantindo proteção a `CRITICAL_INFRA_ALLOWLIST` e escrita atômica via arquivo temporário `.monblock.tmp` + `fs.renameSync`.
    *   **Camada Browser Policies (`src/enforcers/browser-policy-enforcer.ts`):** Implementa `buildBrowserPolicies(params: BrowserPolicyParams)`, gerando simultaneamente os dicionários de políticas gerenciadas para Chromium (`URLBlocklist`, `URLAllowlist`, `DnsOverHttpsMode: 'off'`, `IncognitoModeAvailability`) e Firefox (`WebsiteFilter`, `DNSOverHTTPS`, `DisablePrivateBrowsing`).

---

## 3. Acesso a Dados, Persistência e Transacionalidade

*   **Arquitetura dos 3 Cofres (`TripleVaultStore` — `ADR-0004`):**
    1. **Cofre 1 — SQLite `STRICT` (`state.db`):**
       * Configurado com `PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;`.
       * Todas as mutações utilizam Prepared Statements parametrizados dentro de transações explícitas (`BEGIN IMMEDIATE ... COMMIT`).
    2. **Cofre 2 — System Keychain:**
       * Armazena o envelope JSON assinado (`partnerId`, `passwordHash`, `hmacSecret`, `schemaVersion`, `rulesDigest`) no chaveiro de sistema operacional.
    3. **Cofre 3 — Selo Imutável (`/var/db/monblock/partner.seal`):**
       * Gravação atômica via `/var/db/monblock/partner.seal.tmp` $\rightarrow$ `fs.renameSync` $\rightarrow$ `chflags uchg`.

---

## 4. Assinatura de Endpoints

### 4.1. `GET /api/health` (Healthcheck do Serviço Local)
*   **Caminho:** `GET http://127.0.0.1:49152/api/health`
*   **Autenticação / Autorização:** Loopback local (`127.0.0.1`)
*   **Payload de Saída (Output — `200 OK`):**
    ```json
    {
      "status": "ok",
      "service": "monblock-preview-server",
      "routes": ["/blocked", "/showcase", "/api/health", "/api/unblock-requests"]
    }
    ```
*   **Códigos de Resposta HTTP Mapeados:**
    *   HTTP 200 (`OK`): Servidor e motor ativos.
    *   HTTP 404 (`Not Found` — `RFC 9457 Problem Details`): Para qualquer caminho não mapeado (`application/problem+json; charset=utf-8`).

### 4.2. Protocolo IPC no Unix Domain Socket (`/var/run/monblockd.sock`)
*   **`DAEMON_GET_STATUS`**: Retorna `{ paired: boolean, schemaVersion: number, vaultsHealthy: boolean, state: RuleEngineState }`.
*   **`DAEMON_APPLY_RULES`**: Recebe `{ nextState: RuleEngineState, partnerToken?: string }`, valida na Catraca `canMutateProtectionRule()`, persiste nos 3 cofres e executa `applyAtomicHostsBlock()` + `buildBrowserPolicies()`.
*   **`DAEMON_ROLLBACK_UNINSTALL`**: Exige token `UNLOCK-PERMANENT-<MAC10>` ou Cooldown de 72h expirado (`evaluateEmergencyCooldown().unlocked === true`), executando `rollbackHostsFromBackup('/etc/hosts')`.

---

## 5. Resiliência, Filas e Eventos Assíncronos

*   **Loop de Reconciliação Periódica (Self-Healing Watchdog):**
    *   Além da verificação no boot, o `monblockd` executa um *heartbeat* interno a cada `30s` verificando a integridade do bloco `# >>> MONBLOCK START >>>` no `/etc/hosts` e a existência dos 3 cofres. Se qualquer alteração externa for detectada, a restauração atômica ocorre em $< 50\text{ms}$.
*   **Proteção contra Corrupção em Queda de Energia:**
    *   Tanto o `/etc/hosts` quanto o `partner.seal` utilizam o padrão *Write-Temporary-Then-Rename* (`fs.writeFileSync(tmp)` + `fs.renameSync(tmp, target)`), garantindo que o arquivo alvo jamais fique truncado ou parcialmente escrito.
