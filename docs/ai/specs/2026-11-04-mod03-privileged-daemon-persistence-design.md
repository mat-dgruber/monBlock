# Sub-Especificação Modular 03 (MOD-03) — Daemon Privilegiado (`monblockd`), IPC Unix Socket & Tripla Persistência Self-Healing

- **Data:** 2026-11-04
- **Código do Módulo:** `MOD-03`
- **Caminho Canônico:** `docs/ai/specs/2026-11-04-mod03-privileged-daemon-persistence-design.md`
- **Master Spec Vinculada:** `docs/ai/specs/2026-11-04-monblock-master-design.md`
- **Domínio DDD Correspondente:** `docs/domains/daemon_persistence/`
- **ADRs de Referência:**
  - `docs/adrs/0001-arquitetura-split-privilegiada-daemon-monblockd.md`
  - `docs/adrs/0002-bloqueio-web-em-3-camadas-hosts-policies-watcher.md`
  - `docs/adrs/0003-catraca-unidirecional-append-only-e-aprovacao-ajudante.md`
  - `docs/adrs/0004-pareamento-duravel-tripla-persistencia-e-recuperacao-3-niveis.md`
- **Status:** Especificação Técnica Modular (Fase 1 MVP — Etapa 2 do Roadmap)

---

## 1. Objetivo & Escopo Core

O **Módulo 03 (`MOD-03`)** especifica a **Camada Privilegiada de Execução e Persistência Tripla (`monblockd` + `StateStore`)** do `monBlock`, resolvendo a principal vulnerabilidade arquitetural de bloqueadores userland (como o Cisdem AppCrypt documentado em `_reversa_sdd/`, no qual encerrar o processo na UI via `kill -9` ou apagar o arquivo `.plist` em `~/Library/Application Support` desativava todo o bloqueio).

O `MOD-03` garante que:
1. **Imunidade a `kill -9` na Interface Gráfica (`ADR-0001`):** O motor de bloqueio roda como serviço de sistema (`root`, supervisionado pelo `launchd` com `KeepAlive: true` em `/Library/LaunchDaemons/com.ccat.monblockd.plist`). Fechar ou matar o aplicativo Electron tem impacto zero sobre o bloqueio.
2. **Fronteira IPC Zero-Trust (`/var/run/monblockd.sock`):** Toda comunicação entre a UI desprivilegiada e o daemon passa por validação de schema, verificação de integridade e fiscalização da Catraca Unidirecional (`PartnerGuard.canMutateProtectionRule`).
3. **Tripla Persistência com Auto-Reparo (`Self-Healing 2 de 3` — `ADR-0004`):** O vínculo do Ajudante e o estado crítico das regras são replicados em 3 cofres independentes:
   - **Cofre 1:** Banco primário SQLite (`STRICT`, `WAL`, permissão `0600`) / arquivo de estado assinado em `/Library/Application Support/monBlock/`;
   - **Cofre 2:** **macOS System Keychain** (`com.ccat.monblock.partner`);
   - **Cofre 3:** Selo imutável `/var/db/monblock/partner.seal` protegido com `chflags uchg`.
   Se 1 ou 2 cofres forem apagados ou corrompidos durante atualização ou tentativa de sabotagem, o `StateStore` reconstrói automaticamente os cofres ausentes no boot mantendo o bloqueio **100% ativo (`Fail-Closed`)**.
4. **Abstração Multi-OS (`PlatformEnforcer`):** Define a interface única para macOS (MVP Fase 1), Windows (Windows Service `SYSTEM` + WFP/Registry) e Linux (`systemd` + `chattr +i`).

### 1.1. Mapeamento de Arquivos (`src/` e `tests/`)

| Caminho do Arquivo | Papel Arquitetural | Status no Repositório |
| :--- | :--- | :--- |
| `src/storage/state-store.ts` | Persistência Tripla Self-Healing (`StateStore`), assinatura `HMAC-SHA256` por registro (`row_hmac`), escrita atômica `.tmp` + `renameSync` e reconciliação automática entre os 3 cofres. | Especificado para implementação na Etapa 2 |
| `src/daemon/monblockd.ts` | Orquestrador do Daemon Privilegiado: servidor IPC Unix Socket (`/var/run/monblockd.sock`), integração entre `RuleEngine`, `PartnerGuard`, `StateStore` e `PlatformEnforcer`. | Especificado para implementação na Etapa 2 |
| `src/enforcers/platform-enforcer.ts` | Contrato `PlatformEnforcer` desacoplando as chamadas específicas de SO (macOS `LaunchDaemon`/`pfctl`/`chflags`, Windows e Linux). | Especificado para implementação na Etapa 2 |
| `tests/storage/state-store.test.ts` | Suíte de integração AAA testando escrita nos 3 cofres, detecção de adulteração de HMAC, auto-reparo (`Self-Healing`) quando 1 ou 2 cofres são deletados e modo `TAMPER_LOCKDOWN`. | Especificado para implementação na Etapa 2 |
| `tests/daemon/monblockd.test.ts` | Suíte de integração AAA testando comandos IPC (`GET_STATE`, `MUTATE_RULES`, `AUTHORIZE_UNBLOCK`, `START_COOLDOWN`) e respostas `RFC 9457`. | Especificado para implementação na Etapa 2 |

### 1.2. Contratos de Entrada e Saída (`TypeScript`)

```typescript
// src/storage/state-store.ts
import type { RuleEngineState } from '../domain/rule-engine.js';

export interface PartnerBindingRecord {
  partnerName: string;
  passwordHash: string;          // scrypt$<salt>$<derived>
  hmacSecretEncrypted: string;
  telegramChatId?: string;
  recoveryCodeHashes: string[];  // 5 hashes scrypt
  cooldownStartedAtIso?: string | null;
  updatedAtIso: string;
  signatureHmac: string;
}

export interface PersistedSystemState {
  version: number;
  rules: RuleEngineState;
  partner: PartnerBindingRecord | null;
  usedTokens: string[];
  tamperLockdown: boolean;
}

export interface ReconciliationReport {
  healthy: boolean;
  repairedVaults: Array<'PRIMARY_DB' | 'KEYCHAIN_VAULT' | 'SEAL_FILE'>;
  tamperDetected: boolean;
  state: PersistedSystemState;
}
```

---

## 2. Restrições Técnicas, Casos de Borda & Invariantes

### 2.1. Restrições Não-Funcionais (SLAs e Orçamento do Daemon)
- **Pegada de Memória e CPU (`monblockd`):** `< 50MB RAM` (RSS) e `< 1% CPU` em regime estacionário.
- **Tempo de Boot e Auto-Reparo (`Self-Healing`):** `< 150ms` para ler os 3 cofres, validar assinaturas `HMAC-SHA256`, restaurar cofres ausentes e reaplicar `/etc/hosts` + Browser Policies no startup do `launchd`.
- **Latência de Comandos IPC no Socket Unix:** `p99 < 15ms` para comandos de leitura/adição de regras e `p99 < 120ms` para comandos que exigem derivação `scrypt`.

### 2.2. Invariantes de Domínio e Persistência
1. **Invariante `INV-HEAL-01` (Sobrevivência `>= 1 de 3` Cofres):** Enquanto pelo menos 1 dos 3 cofres (`PRIMARY_DB`, `KEYCHAIN_VAULT`, `SEAL_FILE`) contiver um payload com `signatureHmac` válida, o `StateStore` recupera integralmente o vínculo do Ajudante e as regras ativas, regravando imediatamente os cofres faltantes ou corrompidos.
2. **Invariante `INV-FAILCLOSED-02` (`TAMPER_LOCKDOWN` em Adulteração Total):** Se um invasor com acesso físico tentar corromper simultaneamente os arquivos em disco com assinaturas inválidas, o daemon entra em estado `tamperLockdown: true`, mantendo a categoria `adult` e o bloqueio de `/etc/hosts` travados até validação pelo Ajudante ou cumprimento do Cooldown de 72h.
3. **Invariante `INV-IPC-03` (Mediação Obrigatória pelo `PartnerGuard`):** O handler IPC `MUTATE_RULES` no `monblockd` jamais persiste um novo `RuleEngineState` sem antes invocar `canMutateProtectionRule({ current, next, partnerAuthorized })`.

### 2.3. Casos de Borda Tratados (`Corner Cases`)
- **Divergência de Versão entre Cofres (Queda de Energia no Meio do Commit):** Se o Cofre 1 tiver `version: 12` (com HMAC válido) e o Cofre 3 tiver `version: 11` (porque a máquina desligou antes de atualizar o `.seal`), o reconciliador elege deterministicamente o cofre íntegro de maior `version` / `updatedAtIso` e sincroniza os demais.
- **Socket Stale Após Crash Abrupto (`EADDRINUSE`):** Ao iniciar, o `monblockd` verifica se `/var/run/monblockd.sock` já existe; se nenhuma conexão ativa responder ao ping de healthcheck em `200ms`, remove o arquivo de socket órfão (`fs.unlinkSync`) antes do `server.listen`.
- **Permissões de Arquivo Indevidas:** O `StateStore` aplica `mode: 0o600` em todos os arquivos de estado e valida que payloads vazios, `null` ou truncados em UTF-8 sejam descartados em favor dos cofres íntegros.

---

## 3. Arquitetura, Limites Modulares & Contratos de Erro (`RFC 9457`)

### 3.1. Limites Modulares (Verificados via Graphify)
- `src/storage/state-store.ts` encapsula toda a lógica de leitura/escrita atômica e reconciliação de cofres, expondo métodos síncronos/assíncronos limpos para o `monblockd`.
- `src/daemon/monblockd.ts` atua como a camada de **Aplicação / Orquestração Privilegiada**, conectando o transporte IPC/HTTP aos módulos puros `src/domain/rule-engine.ts` e `src/domain/partner-guard.ts` e aos adaptadores `src/enforcers/*`.

### 3.2. Contrato Padronizado de Erros IPC & HTTP (`RFC 9457 Problem Details`)
Tanto o servidor HTTP local (`127.0.0.1:49152`) quanto o protocolo de resposta do Unix Socket (`/var/run/monblockd.sock`) retornam erros estruturados segundo a **RFC 9457 (`application/problem+json`)**:

```json
{
  "type": "https://monblock.ccat.local/problems/423",
  "title": "Estado em Tamper Lockdown (Fail-Closed)",
  "status": 423,
  "detail": "Foi detectada tentativa de remoção não autorizada de cofre de persistência. O bloqueio foi restaurado automaticamente.",
  "instance": "/ipc/monblockd/reconcile"
}
```

| Status | `type` | Cenário de Disparo |
| :---: | :--- | :--- |
| `400 Bad Request` | `https://monblock.ccat.local/problems/400` | Comando IPC fora do schema esperado ou lote de domínios inválido. |
| `403 Forbidden` | `https://monblock.ccat.local/problems/403` | Mutação rejeitada pela Catraca Unidirecional `Append-Only`. |
| `423 Locked` | `https://monblock.ccat.local/problems/423` | Operação bloqueada porque o daemon detectou adulteração (`tamperLockdown: true`) ou Cooldown de 72h ativo. |
| `500 Internal Server Error` | `https://monblock.ccat.local/problems/500` | Falha de I/O tratada em modo `Fail-Closed` (sem vazar stack trace). |

---

## 4. Resiliência: Timeouts, Retry com Backoff + Jitter, Concorrência, Idempotência & Circuit Breaker

1. **Timeouts Explícitos (`ms`) & Deadlines:**
   - Conexões IPC no socket `/var/run/monblockd.sock` possuem timeout de inatividade de `3000ms` e deadline de execução de comando de `2000ms`.
   - Chamadas ao utilitário `/usr/bin/security` (macOS System Keychain) possuem timeout estrito de `1500ms`.
2. **Retry com Backoff Exponencial + Jitter:**
   - Em caso de contenção de lock (`SQLITE_BUSY` ou `EBUSY` no arquivo `.seal`), o `StateStore` executa até 3 tentativas com backoff exponencial (`50ms`, `150ms`, `400ms`) + jitter aleatório (`0-40ms`).
3. **Concorrência, Mutex de Escrita & Idempotência:**
   - O `monblockd` serializa todas as mutações de estado através de uma fila sequencial interna (Mutex/Lock em memória no processo único do daemon), eliminando condições de corrida (*race conditions*) entre requisições simultâneas da UI e callbacks do Telegram.
   - Todas as gravações nos cofres de disco usam escrita em arquivo `.tmp` seguida de `fs.renameSync` atômico e verificação de `Idempotency-Key` por comando.
4. **Circuit Breaker, Isolamento & Degradação Graciosa (`Fail-Closed`):**
   - Se o Cofre 2 (Keychain) estiver temporariamente inacessível durante o boot antes do desbloqueio completo do volume, o Circuit Breaker do adaptador Keychain opera com os Cofres 1 e 3 em modo `Fail-Closed` e agenda a ressincronização automática no próximo ciclo de `30s`.
5. **Limites de Fronteira de Dados (`Payload Boundaries`):**
   - Mensagens IPC no socket Unix são limitadas a `32 KB` por frame NDJSON (`\n`-delimited JSON); frames maiores são descartados imediatamente para evitar exaustão de memória (OOM).

---

## 5. Segurança Defensiva Zero-Trust, Blindagem Anti-Deleção & Desinstalação Autorizada

- **Blindagem em 4 Níveis Contra Edição/Deleção Manual de Arquivos pelo Usuário (`RN-DAEMON-05`):**
  1. **Propriedade `root:wheel` (`0600`/`0644`) + Flag Imutável de Kernel (`chflags uchg,schg`):**
     - Os arquivos críticos (`/Library/LaunchDaemons/com.ccat.monblockd.plist`, `/Library/PrivilegedHelperTools/com.ccat.monblockd`, `/var/db/monblock/partner.seal`, `/var/db/monblock/state.db` e `/etc/hosts`) pertencem a `root:wheel` com permissão `0600` (bancos/selo) e flag imutável `chflags uchg`. Qualquer tentativa do usuário comum no Finder ou Terminal de editar, mover ou apagar esses arquivos falha imediatamente no kernel com `Permission denied` / `Operation not permitted`.
  2. **Desacoplamento e Auto-Restauração do Pacote `.app` (`App Bundle Self-Repair`):**
     - O daemon real (`monblockd`) executa fora da pasta `/Applications` (em `/Library/PrivilegedHelperTools/`). Se o usuário arrastar `/Applications/monBlock.app` para a Lixeira, **o bloqueio permanece 100% ativo** e o `monblockd` restaura automaticamente `/Applications/monBlock.app` a partir do snapshot assinado em `/var/db/monblock/app-bundle.bak`.
  3. **Supervisão Perpétua pelo PID 1 (`launchd KeepAlive: true`):**
     - O manifesto `/Library/LaunchDaemons/com.ccat.monblockd.plist` define `KeepAlive: true` e `RunAtLoad: true`. Se o processo `monblockd` for encerrado à força, o `launchd` (PID 1 do macOS) o reinicia em `< 1s` e executa `reconcileAndHeal()` nos 3 cofres.
  4. **Assinatura Criptográfica de Estado (`signatureHmac` / `row_hmac`):**
     - Cada snapshot salvo nos 3 cofres recebe um `HMAC-SHA256` calculado sobre o JSON canônico (`version`, `rules`, `partner`, `usedTokens`) e validado via `crypto.timingSafeEqual`. Qualquer edição manual do arquivo em disco invalida o HMAC e aciona a restauração a partir dos outros cofres.
- **Protocolo Exclusivo de Desregistro e Desinstalação (`IPC: UNINSTALL_AUTHORIZED` — `RN-DAEMON-06`):**
  - **Não existe script `.sh` desprotegido** que o usuário possa rodar para remover o `monBlock`.
  - O desligamento definitivo e remoção do `LaunchDaemon` ("desinstalar/apagar o app de vez") só pode ser executado pelo próprio binário `monblockd` (`uid 0`) após validar internamente no `PartnerGuard` **uma das 3 provas criptográficas**:
    1. **Token `HMAC-SHA256` de Desinstalação (`UNLOCK-PERMANENT-<MAC10>`)** gerado pelo Ajudante para o `challengeCode` daquela máquina e ainda não consumido em `usedTokens`; **OU**
    2. **Senha Mestra do Ajudante** verificada via `verifyPartnerPassword(password, storedHash)` (`scrypt` + `timingSafeEqual`); **OU**
    3. **Conclusão Integral do Cooldown Time-Lock de 72 Horas** (`evaluateEmergencyCooldown(startedAtIso, nowMs).unlocked === true`), sem detecção de adulteração de relógio.
  - Somente quando essa verificação retorna `true` dentro do processo `monblockd` é que ele executa a sequência atômica de desmontagem:
    1. Remove `chflags nouchg` de `/etc/hosts` e executa `rollbackHostsFromBackup('/etc/hosts')` + flush de DNS;
    2. Remove as Browser Policies gerenciadas de Chromium e Firefox;
    3. Remove `chflags nouchg` de `/var/db/monblock/*` e apaga os 3 cofres (`SQLite`, `Keychain`, `partner.seal`);
    4. Remove `/Library/LaunchDaemons/com.ccat.monblockd.plist` e descarrega o serviço via `launchctl bootout system/com.ccat.monblockd`.
- **Princípio do Menor Privilégio:** O daemon executa apenas as operações de imposição e guarda de estado; ele nunca renderiza HTML arbitrário nem carrega código remoto.
- **Proteção de Segredos e PII:** Chaves mestras de assinatura são derivadas de segredo residente na memória do daemon / System Keychain (ou injetadas via `op run --` em ambiente de teste), jamais gravadas em texto puro no repositório.

---

## 6. Design UI/UX (Indicadores de Saúde do Daemon & Self-Healing), WCAG 2.2 AAA & Motion

Embora o `monblockd` seja um serviço de background, seu estado de saúde e telemetria local refletem diretamente no cabeçalho da UI Desktop (`MOD-04`) e na Tela de Bloqueio (`:49152/blocked`) segundo o **Design System CCAT**:

- **4 Temas CCAT & Zero Roxo:** Badges de status do daemon (`Proteção Ativa`, `Self-Healing Restaurado`, `Tamper Lockdown`) utilizam tokens semânticos (`--ccat-status-success`, `--ccat-status-warning`, `--ccat-status-danger`) nos 4 temas (`capycro`, `dark-tech`, `light-fintech`, `high-contrast`), sem uso de roxo.
- **5 Estados de Interface Refletidos pelo Daemon:**
  1. `Loading / Skeleton`: Enquanto o cliente Electron aguarda o handshake inicial do socket `/var/run/monblockd.sock`.
  2. `Empty State`: Estado inicial pré-onboarding quando `partner === null` nos 3 cofres.
  3. `Error State (RFC 9457)`: Exibição de alerta estruturado (`role="alert"`) caso uma mutação IPC retorne `403 Forbidden` ou `423 Locked`.
  4. `Partial / Degraded State`: Badge informativo caso 1 dos 3 cofres tenha precisado de auto-reparo (`repairedVaults.length > 0`) ou quando o daemon opera em modo offline.
  5. `Populated / Healthy State`: Indicador verde de integridade `3/3 Cofres Sincronizados` com contadores `tabular-nums`.
- **Acessibilidade WCAG 2.2 AA/AAA & APCA:** Contraste `APCA Lc >= 75`, região `aria-live="polite"` para mudanças de status do daemon, `:focus-visible` explícito e navegação por teclado.
- **Animação, `deltaTime` & `prefers-reduced-motion`:** Indicadores de pulso/sincronização usam apenas `transform` e `opacity` no compositor GPU, respeitam `@media (prefers-reduced-motion: reduce)` e calculam intervalos de reconexão e uptime por tempo real decorrido (`deltaTime` / `performance.now()`).

---

## 7. Pre-Mortem & Modos de Falha (Blast Radius)

| Incidente Hipotético (Pre-Mortem 3h da Manhã) | Blast Radius | Causa Raiz | Mitigação Implementada |
| :--- | :--- | :--- | :--- |
| **1. Usuário apaga `/Library/Application Support/monBlock/monblock.db`** | Tentativa de resetar a senha do Ajudante e zerar categorias | Remoção manual de arquivo único de banco de dados. | Reconciliação `Self-Healing` restaura o Cofre 1 a partir do Cofre 2 (Keychain) e Cofre 3 (`partner.seal`) em `< 50ms` e ativa `tamperLockdown: true`. |
| **2. Atualização do app Electron sobrescreve a pasta `/Applications/monBlock.app`** | Perda de configuração em upgrades se o estado ficasse dentro do bundle `.app` | Estado acoplado ao pacote da interface gráfica. | Os 3 cofres residem fora do `.app` (`/Library/Application Support`, `System.keychain` e `/var/db/monblock`), preservando 100% do pareamento. |
| **3. Queda de energia exatamente durante a gravação do estado** | Arquivo JSON/SQLite truncado com 0 bytes | Escrita direta sem arquivo temporário. | Escrita atômica em `.tmp` + `fs.renameSync` + eleição do cofre de maior `version` com `signatureHmac` íntegra. |
| **4. Cliente malicioso envia payload gigante no socket IPC** | Exaustão de RAM (OOM) no processo `monblockd` | Leitura de stream ilimitada no socket Unix. | Limite estrito de `32 KB` por mensagem no socket com desconexão imediata do cliente infrator. |

---

## 8. Matriz de Alternativas Consideradas (Trade-offs)

| Alternativa | Descrição | Prós | Contras | Veredito |
| :--- | :--- | :--- | :--- | :---: |
| **Abordagem A (Arquivo `.plist` Único em Userland)** | Salvar regras e hash em `~/Library/Preferences/` (padrão Cisdem). | Zero necessidade de daemon ou permissões elevadas. | Usuário deleta o arquivo em 1 comando (`rm`) e destrói todo o bloqueio. | Rejeitada |
| **Abordagem B (Kernel Extension / System Extension EndpointSecurity)** | Driver no kernel do macOS interceptando syscalls. | Proteção máxima em nível de kernel. | Exige entitlement restrito da Apple indisponível para distribuição ágil multiplataforma. | Rejeitada |
| **Abordagem C (`monblockd` LaunchDaemon + Tripla Persistência Self-Healing — `ADR-0001/0004`)** | Daemon privilegiado via `launchd` + reconciliação automática entre SQLite `0600`, Keychain e `partner.seal`. | Sobrevive a `kill -9` na UI e restaura cofres apagados sem depender de kext proprietária. | Requer camada IPC estruturada e reconciliador determinístico. | **Eleita** |

---

## 9. Reversibilidade & Plano de Rollback

1. **Rollback Automático de Estado Corrompido:**
   - Se uma gravação no Cofre 1 falhar na validação de HMAC pós-escrita, o `StateStore` reverte instantaneamente a partir do Cofre 2 ou Cofre 3 sem interromper o serviço.
2. **Desregistro Limpo e Autorizado do `LaunchDaemon`:**
   - Mediante token válido do Ajudante (`UNLOCK-PERMANENT-*`) ou conclusão do Cooldown de 72h, o comando `UNINSTALL_AUTHORIZED` remove a flag `chflags nouchg` de `/var/db/monblock/partner.seal` e `/etc/hosts`, restaura `/etc/hosts.monblock.bak` e descarrega `/Library/LaunchDaemons/com.ccat.monblockd.plist` via `launchctl bootout system`.

---

## 10. Estratégia de Testabilidade & Pirâmide de Testes (AAA)

1. **Testes Unitários e de Integração do `StateStore` (`tests/storage/state-store.test.ts`):**
   - *Arrange:* Instanciação do `StateStore` apontando os 3 cofres (`primaryPath`, `keychainMockPath`, `sealPath`) para diretórios temporários isolados.
   - *Act:* Gravação de um estado com Ajudante pareado; em seguida, deleção proposital do Cofre 1 e adulteração de bytes no Cofre 2, mantendo apenas o Cofre 3 íntegro, e execução de `reconcileAndHeal()`.
   - *Assert:* Verifica que `reconcileAndHeal()` detecta a adulteração (`tamperDetected: true`), reconstrói os Cofres 1 e 2 idênticos ao Cofre 3 (`repairedVaults: ['PRIMARY_DB', 'KEYCHAIN_VAULT']`) e preserva a proteção ativa (`tamperLockdown: true`).
2. **Testes de Integração do Daemon e Orquestração (`tests/daemon/monblockd.test.ts`):**
   - *Arrange:* Inicialização do controlador `MonBlockDaemon` com `StateStore`, `RuleEngine`, `PartnerGuard` e `HostsEnforcer` em diretório temporário.
   - *Act:* Envio de comandos de adição de categoria/domínio (sem senha do Ajudante) e tentativa de remoção de categoria (primeiro sem senha, depois com senha/token válido do Ajudante).
   - *Assert:* Confirma que a adição tem sucesso imediato (`200 OK`) e atualiza o arquivo `hosts`, a remoção sem senha falha com `403 Forbidden` (`RFC 9457`), e a remoção com credencial válida do Ajudante é aprovada e persistida nos 3 cofres.
