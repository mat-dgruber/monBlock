# Domínio de Bloqueio de Aplicativos Nativos, Agendamentos e Autodefesa (`app_lock_schedules`): Design Técnico (Tech Design)

---

## 1. Camada Frontend

*   **Componentes Visuais no App Desktop Electron:**
    1. **Seletor de Aplicativos Nativos (`AppPickerGrid`):** Lista os aplicativos instalados em `/Applications` com ícone, nome e `bundleId`, destacando com cadeado aqueles já protegidos pela Catraca `Append-Only`.
    2. **Editor Visual de Grades Horárias (`ScheduleMatrix`):** Grade semanal (`Dom` a `Sáb`, `00:00` às `23:59`) estilizada com tokens CCAT (`--color-brand-primary: #005A64` para blocos ativos) e tipografia numérica `tabular-nums`. Permite adicionar novos blocos livremente e exige token do Ajudante para reduzir blocos existentes.
    3. **Banner de Alerta de Relógio (`ClockSkewAlert`):** Caso o `MonotonicClockGuard` detecte manipulação de data/hora, exibe aviso semântico (`role="alert"`) explicando que as regras agendadas entraram em bloqueio preventivo (*Fail-Closed*) até a regularização do relógio NTP.

---

## 2. Camada Backend

*   **Camada de Domínio (`ScheduleEvaluator` & `MonotonicClockGuard`):**
    *   `isScheduleActiveNow(schedule, wallClockDate, clockSkewDetected)`: função pura que retorna `true` imediatamente se `clockSkewDetected === true` (*Fail-Closed*) ou se o dia/minuto atual pertencer à janela configurada (incluindo suporte a janelas que atravessam `00:00`).
    *   Integração direta com `evaluateEmergencyCooldown(startedAtIso, nowMs)` de `src/domain/partner-guard.ts`, assegurando que atrasos no relógio (`nowMs < startMs`) resultem em `Math.max(0, nowMs - startMs)` e mantenham `{ unlocked: false, remainingHours: 72 }`.
*   **Camada de Enforcer de Processos (`AppProcessEnforcer`):**
    *   Observa eventos de lançamento de processos no sistema operacional, verifica se o `bundleId` consta na lista bloqueada ativa e aplica contenção imediata (`terminate()` / `SIGKILL`) caso não haja concessão temporária vigente do Ajudante.

---

## 3. Acesso a Dados, Persistência e Transacionalidade

*   **Armazenamento Relacional no `StateStore` (`SQLite STRICT`):**
    *   Tabelas `locked_apps` (`bundle_id TEXT PRIMARY KEY`, `app_name TEXT NOT NULL`, `always_blocked INTEGER NOT NULL`) e `schedule_windows` (`schedule_id TEXT PRIMARY KEY`, `days_json TEXT NOT NULL`, `start_hhmm TEXT NOT NULL`, `end_hhmm TEXT NOT NULL`).
    *   O resumo criptográfico (`rulesDigest`) das tabelas `locked_apps` e `schedule_windows` compõe o selo `/var/db/monblock/partner.seal`, impedindo exclusão direta via cliente SQLite externo.

---

## 4. Assinatura de Endpoints

### 4.1. Comandos IPC do Domínio (`/var/run/monblockd.sock`)
*   **Caminho / Canal:** Comando `SCHEDULE_UPSERT` e `APPLOCK_MUTATE` via Unix Domain Socket `/var/run/monblockd.sock`.
*   **Autenticação / Autorização:** Livre para expansão de bloqueio (`Append-Only`); requer `partnerToken` (`UNLOCK-*`) ou senha do Ajudante para qualquer redução de janela ou remoção de `bundleId`.
*   **Payload de Entrada (Input — `SCHEDULE_UPSERT`):**
    ```json
    {
      "command": "SCHEDULE_UPSERT",
      "payload": {
        "scheduleId": "sch_foco_noturno",
        "label": "Toque de Recolher Digital",
        "daysOfWeek": [0, 1, 2, 3, 4, 5, 6],
        "startTimeHHMM": "22:00",
        "endTimeHHMM": "06:30",
        "targetCategories": ["adult", "gambling", "social", "games"],
        "targetBundleIds": ["com.valvesoftware.steam"]
      }
    }
    ```
*   **Códigos de Resposta Mapeados (`RFC 9457 Problem Details` em falhas):**
    *   `200 OK`: Grade horária ou bloqueio de aplicativo persistido e ativado.
    *   `400 Bad Request`: Formato `HH:MM` inválido ou `bundleId` pertencente à allowlist crítica do SO.
    *   `403 Forbidden`: Tentativa de encurtar horário ou remover aplicativo sem `partnerAuthorized: true`.

---

## 5. Resiliência, Filas e Eventos Assíncronos

*   **Monitoramento Baseado em Eventos + Fallback de Polling Leve:**
    *   A detecção de aplicativos bloqueados prioriza notificações de eventos de ativação de janela do SO (latência $< 50\text{ms}$), complementada por um ciclo de reconciliação leve a cada `2000ms` para capturar processos iniciados em segundo plano.
*   **Relógio Monotônico Imune a Suspensão e Alteração Manual:**
    *   Todas as durações de desbloqueio temporário (`15m`, `60m`) e janelas de Cooldown (`72h`) são validadas cruzando timestamps UTC persistidos nos 3 cofres com contadores monotônicos, garantindo que alterações manuais nas configurações de Data e Hora do sistema nunca antecipem o fim de um bloqueio.
