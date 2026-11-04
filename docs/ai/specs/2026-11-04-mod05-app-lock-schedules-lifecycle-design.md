# Sub-Especificação Modular 05 (MOD-05) — Bloqueio de Aplicativos Nativos, Agendamentos (`Schedules`) & Autodefesa do Ciclo de Vida

- **Data:** 2026-11-04
- **Código do Módulo:** `MOD-05`
- **Caminho Canônico:** `docs/ai/specs/2026-11-04-mod05-app-lock-schedules-lifecycle-design.md`
- **Master Spec Vinculada:** `docs/ai/specs/2026-11-04-monblock-master-design.md`
- **Domínio DDD Correspondente:** `docs/domains/app_lock_schedules/`
- **ADRs de Referência:**
  - `docs/adrs/0001-arquitetura-split-privilegiada-daemon-monblockd.md`
  - `docs/adrs/0003-catraca-unidirecional-append-only-e-aprovacao-ajudante.md`
  - `docs/adrs/0004-pareamento-duravel-tripla-persistencia-e-recuperacao-3-niveis.md`
- **Status:** **CONGELADO / FORA DE EXECUÇÃO ATUAL (Aguardando Revisão Dedicada Pós-MVP Web — Fases 2 & 3)**

---

## 1. Objetivo & Escopo Core

O **Módulo 05 (`MOD-05`)** especifica a evolução das **Fases 2 e 3** do `monBlock`: o **Motor de Bloqueio de Aplicativos Nativos (`AppLockEngine`)**, o **Motor de Janelas de Agendamento (`ScheduleEngine`)** e os mecanismos de **Autodefesa do Ciclo de Vida e Anti-Tamper de Relógio (`LifecycleSelfDefense`)**.

Inspirado nas capacidades mapeadas na engenharia reversa de referência (`_reversa_sdd/app-lock-engine/`, `_reversa_sdd/schedule-engine/` e `_reversa_sdd/lifecycle-autostart/`), porém corrigindo todas as suas fragilidades de segurança, o `MOD-05` estabelece:
1. **Bloqueio de Aplicativos Desktop (`AppLockEngine`):** Interceptação de lançamento de aplicativos bloqueados por `bundleId` (ex.: clientes de jogos, navegadores secundários não gerenciados, apps de mensagens ou mídia), encerrando o processo infrator em `< 300ms` e exibindo a janela de bloqueio CCAT para solicitação ao Ajudante.
2. **Allowlist de Processos Vitais do Sistema (`CRITICAL_PROCESS_ALLOWLIST` — `RN-APP-02`):** Proteção estrita impedindo o bloqueio de processos essenciais do sistema operacional (`com.apple.finder`, `com.apple.loginwindow`, `com.apple.SystemPreferences`, `com.apple.Terminal` quando em recuperação, e o próprio `com.ccat.monblock`).
3. **Janelas de Agendamento Regidas pela Catraca `Append-Only` (`ScheduleEngine`):** Suporte a janelas horárias recorrentes por dia da semana (ex.: bloqueio de redes sociais e jogos das `22:00` às `07:00` ou em horário comercial `08:00` às `18:00`). O usuário pode **ampliar** a janela de bloqueio sozinho, mas **encurtar ou excluir** um agendamento ativo exige autorização do Ajudante (`ADR-0003`).
4. **Proteção Anti-Tamper de Relógio e Fuso Horário:** Detecção de manipulação manual de data/hora ou fuso horário (`timezone`) pelo usuário para tentar escapar de uma janela de agendamento ou do Cooldown de 72h, utilizando delta monotônico de `os.uptime()`.

### 1.1. Mapeamento de Arquivos Planejados (`src/` e `tests/`)

| Caminho do Arquivo | Papel Arquitetural | Fase Alvo |
| :--- | :--- | :--- |
| `src/domain/app-schedule-engine.ts` | Lógica pura de avaliação de `AppLockRule`, `ScheduleWindow`, cálculo de interseção de horários, detecção de clock drift monotônico e validação da Catraca `Append-Only` para agendamentos. | Fase 2 |
| `src/enforcers/macos-app-enforcer.ts` | Monitoramento de processos e pacotes `.app` no macOS (`NSWorkspaceDidLaunchApplicationNotification` / `ps` + `process.kill(pid, 'SIGKILL')`), respeitando `CRITICAL_PROCESS_ALLOWLIST`. | Fase 2 |
| `src/daemon/clock-guard.ts` | Verificador monotônico de relógio (`os.uptime()` vs `Date.now()`) e vigilância de integridade do `LaunchDaemon` (`com.ccat.monblockd.plist`). | Fase 3 |
| `tests/domain/app-schedule-engine.test.ts` | Suíte unitária AAA validando `CRITICAL_PROCESS_ALLOWLIST`, janelas horárias que cruzam a meia-noite (`22:00 -> 06:00`), Catraca de agendamentos e detecção de adulteração de relógio. | Fase 2 |

### 1.2. Contratos de Entrada e Saída (`TypeScript`)

```typescript
// src/domain/app-schedule-engine.ts
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Domingo .. 6 = Sábado

export interface ScheduleWindow {
  id: string;
  label: string;
  days: DayOfWeek[];
  startMinuteOfDay: number; // 0..1439 (ex.: 22:00 = 1320)
  endMinuteOfDay: number;   // 0..1439 (ex.: 07:00 = 420)
}

export interface AppLockRule {
  bundleId: string;
  appName: string;
  alwaysBlocked: boolean;
  scheduleIds: string[];
}

export interface ClockIntegrityCheck {
  tampered: boolean;
  driftSeconds: number;
  effectiveNowMs: number;
}
```

---

## 2. Restrições Técnicas, Casos de Borda & Invariantes

### 2.1. Restrições Não-Funcionais (SLAs)
- **Latência de Contenção de App Bloqueado:** `p95 < 300ms` entre o evento de inicialização do aplicativo (`bundleId`) e o envio de `SIGTERM`/`SIGKILL` + exibição do overlay CCAT.
- **Tolerância de Drift de Relógio (NTP Normal vs. Adulteração):** Ajustes normais de NTP de até `+-120 segundos` são absorvidos normalmente; saltos bruscos superiores a `300 segundos` (`5 minutos`) em relação ao delta de `os.uptime()` acionam o modo `CLOCK_TAMPER_FAIL_CLOSED`.

### 2.2. Invariantes de Domínio
1. **Invariante `INV-APP-ALLOW-01` (`CRITICAL_PROCESS_ALLOWLIST` — `RN-APP-02`):** Processos vitais do macOS (`com.apple.finder`, `com.apple.loginwindow`, `com.apple.WindowServer`, `com.apple.securityAgent`, `com.ccat.monblock`) jamais podem ser adicionados à lista de bloqueio ou encerrados pelo `macos-app-enforcer.ts`.
2. **Invariante `INV-SCHED-RATCHET-02` (Catraca `Append-Only` de Agendamentos):** O usuário pode adicionar novos dias da semana ou aumentar a duração em minutos de um `ScheduleWindow` livremente; remover dias, reduzir a janela horária ou desvincular um `bundleId` bloqueado exige `partnerAuthorized: true`.
3. **Invariante `INV-SLEEP-REVOKE-03` (Revogação de Desbloqueio Temporário em Sleep — `RN-APP-04`):** Quando o sistema operacional emite evento de suspensão (`sleep`) ou troca de sessão de usuário, qualquer concessão temporária de aplicativo é revogada imediatamente para impedir que o app permaneça aberto sem supervisão no retorno.
4. **Invariante `INV-CLOCK-04` (Fail-Closed sob Adulteração de Relógio/Timezone):** Se `ClockIntegrityCheck.tampered === true`, todas as regras vinculadas a agendamentos (`scheduleIds`) passam a operar como **bloqueadas em tempo integral (`alwaysBlocked = true`)** até que o relógio seja ressincronizado com NTP válido ou autorizado pelo Ajudante.

### 2.3. Casos de Borda Tratados (`Corner Cases`)
- **Janelas Horárias que Cruzam a Meia-Noite (`Overnight Schedules`):** Quando `startMinuteOfDay > endMinuteOfDay` (ex.: `22:00` [1320] até `06:00` [360]), o avaliador divide a verificação entre o final do dia `D` (`minute >= 1320`) e a madrugada do dia `(D + 1) % 7` (`minute < 360`).
- **Mudança de Fuso Horário (`Timezone`) ou Horário de Verão (DST):** Os agendamentos persistem o offset IANA original configurado no momento da criação; alterar o fuso horário nas Preferências do Sistema de `America/Sao_Paulo` para `Pacific/Kiritimati` (+14h) não antecipa o fim da janela de bloqueio.
- **Renomeação do Executável `.app` pelo Usuário (`RN-APP-01`):** A identificação do aplicativo bloqueado utiliza o `CFBundleIdentifier` do `Info.plist` assinado do pacote e o caminho do binário, impedindo bypass simples por renomear `Steam.app` para `Calculadora.app`.

---

## 3. Arquitetura, Limites Modulares & Contratos de Erro (`RFC 9457`)

### 3.1. Limites Modulares (Verificados via Graphify)
- `src/domain/app-schedule-engine.ts` é um módulo puro de domínio (sem chamadas de SO), recebendo timestamps e listas de regras por parâmetro.
- `src/enforcers/macos-app-enforcer.ts` e `src/daemon/clock-guard.ts` são adaptadores gerenciados pelo `monblockd` (`MOD-03`).

### 3.2. Contrato Padronizado de Erros (`RFC 9457 Problem Details`)
Tentativas de cadastrar um aplicativo da `CRITICAL_PROCESS_ALLOWLIST`, reduzir uma janela de agendamento sem autorização do Ajudante ou operar com relógio adulterado retornam `application/problem+json`:

```json
{
  "type": "https://monblock.ccat.local/problems/403",
  "title": "Redução de janela de agendamento não autorizada",
  "status": 403,
  "detail": "Reduzir o horário do agendamento 'Noite sem Distrações (22:00-07:00)' exige autorização do Ajudante.",
  "instance": "/ipc/schedules/update"
}
```

---

## 4. Resiliência: Timeouts, Retry com Backoff + Jitter, Concorrência, Idempotência & Circuit Breaker

1. **Timeouts Explícitos (`ms`) no Encerramento de Processos:**
   - Ao detectar um app bloqueado, o enforcer envia primeiro `SIGTERM` (ou `NSRunningApplication.terminate()`) com timeout gracioso de `200ms`; se o processo ainda existir após `200ms`, aplica `SIGKILL` (`kill -9`) imediato.
   - Consultas de verificação de relógio remoto (cabeçalho `Date` HTTPS) possuem timeout de `2000ms`.
2. **Retry com Backoff Exponencial + Jitter:**
   - Em caso de falha transitória na leitura de metadados `Info.plist` de um app recém-montado em disco, o enforcer tenta até 3 vezes (`50ms`, `150ms`, `350ms` + jitter `0-30ms`).
3. **Concorrência, Debounce de Eventos de Lançamento & Idempotência:**
   - Aplicativos que disparam múltiplos processos filhos simultâneos (ex.: helpers de jogos ou Electron apps) são agrupados por `bundleId` com `debounce` de `100ms` e chave de idempotência do evento para exibir apenas 1 modal de bloqueio ao usuário em vez de dezenas de janelas repetidas.
4. **Circuit Breaker & Isolamento de Recursos (`Bulkhead`):**
   - O loop de vigilância de aplicativos e relógio tem cota máxima de execução e circuit breaker interno para jamais exceder `0.5% CPU`, isolado das rotas críticas de bloqueio web (`MOD-01`).
5. **Limites de Fronteira de Dados (`Payload Boundaries`):**
   - Máximo de `100` aplicativos bloqueados (`MAX_BLOCKED_APPS = 100`) e máximo de `32` janelas de agendamento (`MAX_SCHEDULES = 32`), com validação estrita de `startMinuteOfDay` e `endMinuteOfDay` no intervalo inteiro `0..1439`.

---

## 5. Segurança Defensiva Zero-Trust & Autodefesa

- **Validação Estrita de `bundleId` e PIDs:** O `macos-app-enforcer.ts` valida formato estrito de `bundleId` (`/^[a-zA-Z0-9.-]{3,128}$/`) e confere o UID/caminho do processo antes de enviar sinais POSIX, evitando terminação acidental de daemons do sistema.
- **Vigilância Anti-Tamper de Relógio (`ClockGuard`):** A cada `30 segundos`, o `monblockd` compara `deltaWallClock = Date.now() - lastWallClockMs` com `deltaMonotonic = (os.uptime() - lastUptimeSec) * 1000`. Se `Math.abs(deltaWallClock - deltaMonotonic) > 300_000`, registra evento de adulteração e trava os agendamentos em modo `Fail-Closed`.
- **Zero Segredos Hardcoded:** Toda autorização de desbloqueio de app ou edição de agendamento reutiliza o `PartnerGuard` (`MOD-02`) com `scrypt`, `HMAC-SHA256` e `crypto.timingSafeEqual`.

---

## 6. Design UI/UX (Seletor de Apps, Grade de Horários & Overlay de App Bloqueado), WCAG 2.2 AAA & Motion

As telas de gestão de aplicativos e agendamentos (integradas ao `MOD-04`) seguem o **Design System CCAT (`docs/design/tokens.css`)**:

- **4 Temas CCAT & Zero Roxo:** Suporte integral a `capycro`, `dark-tech`, `light-fintech` e `high-contrast`, sem qualquer cor roxa/violeta.
- **5 Estados Obrigatórios de Interface:**
  1. `Loading / Skeleton`: Enquanto escaneia a pasta `/Applications` para listar ícones e `bundleId` dos aplicativos instalados.
  2. `Empty State`: Estado inicial quando nenhum aplicativo nativo ou janela de agendamento foi configurado.
  3. `Error State (RFC 9457)`: Banner `role="alert"` quando o usuário tenta encurtar um agendamento sem autorização do Ajudante ou quando o `ClockGuard` detecta adulteração do relógio do sistema.
  4. `Partial / Degraded State`: Alerta quando o fuso horário do sistema diverge do fuso original do agendamento, informando que a regra está protegida em modo conservador.
  5. `Populated State`: Lista de aplicativos protegidos com badge `"Sempre Bloqueado"` ou `"Agendado (22:00 - 07:00)"` em `tabular-nums` e cadeado `Append-Only`.
- **Acessibilidade WCAG 2.2 AA/AAA, Alternativa a Drag (2.5.7) & APCA:**
  - Contraste `APCA Lc >= 75`, alvos `>= 44x44px` e `:focus-visible` explícito.
  - Em conformidade estrita com **WCAG 2.2 Critério 2.5.7 (Dragging Movements)**, a seleção de horários de início e fim não depende de arrastar barras na linha do tempo: oferece inputs numéricos/selects acessíveis por teclado (`Hora Inicial`, `Hora Final` e checkboxes para `Dom..Sáb`).
- **Animação, Framerate Independence (`deltaTime`) & Acessibilidade Vestibular:**
  - Transições do overlay de bloqueio de aplicativo operam apenas com `transform` e `opacity` na GPU (`60fps`), desativando qualquer animação sob `@media (prefers-reduced-motion: reduce)` e `prefers-reduced-transparency: reduce`.
  - Contadores de tempo restante até o fim de uma janela agendada são calculados por `deltaTime` / tempo real decorrido (`performance.now()` / `os.uptime()`).

---

## 7. Pre-Mortem & Modos de Falha (Blast Radius)

| Incidente Hipotético (Pre-Mortem 3h da Manhã) | Blast Radius | Causa Raiz | Mitigação Implementada |
| :--- | :--- | :--- | :--- |
| **1. Usuário adiciona `Finder.app` ou `loginwindow` na lista de bloqueio** | Sessão gráfica do macOS inutilizada | Falta de filtro de processos críticos do sistema operacional. | `CRITICAL_PROCESS_ALLOWLIST` bloqueia o cadastro na UI e é verificada novamente no `macos-app-enforcer.ts` antes de qualquer `kill` (`RN-APP-02`). |
| **2. Usuário muda o relógio do Mac de `23:30` para `14:00` para jogar durante agendamento noturno** | Bypass da janela `22:00 - 07:00` | Avaliação baseada apenas na hora local manipulável. | `ClockGuard` detecta divergência entre `Date.now()` e `os.uptime()` (`> 5 min`) e trava todas as regras agendadas em `alwaysBlocked = true`. |
| **3. Agendamento `22:00 -> 06:00` falha após a meia-noite (`00:30`)** | Aplicativo liberado indevidamente na madrugada | Comparação ingênua `now >= start && now <= end` que falha quando `start > end`. | Tratamento explícito de janelas overnight (`now >= start || now < end`) com transição correta do dia da semana anterior. |

---

## 8. Matriz de Alternativas Consideradas (Trade-offs)

| Alternativa | Descrição | Prós | Contras | Veredito |
| :--- | :--- | :--- | :--- | :---: |
| **Abordagem A (Polling Simples por Nome de Processo)** | Matar processos apenas pelo nome (`killall Steam`). | Simples de escrever. | Facilmente burlado renomeando o `.app` e desperdiça CPU com polling curto. | Rejeitada |
| **Abordagem B (Permissão Livre para Editar Agendamentos)** | Deixar o usuário alterar horários de agendamento sem senha quando não está no horário ativo. | Menos pedidos ao Ajudante. | Permite que o usuário desative o agendamento das `22:00` às `21:55` antes dele começar. | Rejeitada |
| **Abordagem C (`bundleId` + Catraca `Append-Only` em Agendamentos + `ClockGuard` Monotônico)** | Identificação por `CFBundleIdentifier`, Catraca exigindo Ajudante para reduzir janelas e guarda monotônica de relógio. | Imune a renomeação de `.app`, imune a edição prévia de horário e resistente a troca de relógio/fuso. | Requer cálculo de interseção de intervalos horários na Catraca. | **Eleita** |

---

## 9. Reversibilidade & Plano de Rollback

1. **Salvaguarda de Recuperação de Emergência (`Safe Mode Process Allowlist`):**
   - Caso um aplicativo corporativo legítimo seja bloqueado por engano, o Ajudante pode conceder desbloqueio temporário (`15m`/`60m`) ou permanente via Token `HMAC-SHA256` / Telegram (`MOD-02`), cessando imediatamente a interceptação daquele `bundleId`.
2. **Rollback Instantâneo do `macos-app-enforcer`:**
   - Desativar o watcher de aplicativos interrompe o listener `NSWorkspace` imediatamente sem afetar os processos já em execução no sistema operacional.

---

## 10. Estratégia de Testabilidade & Pirâmide de Testes (AAA)

1. **Testes Unitários de Agendamento, Overnight e Clock Guard (`tests/domain/app-schedule-engine.test.ts`):**
   - *Arrange:* Janela `22:00 -> 06:00` às segundas-feiras, regra para `com.valvesoftware.steam` e tentativa de incluir `com.apple.finder`.
   - *Act:* Avaliação em `Segunda 23:15`, `Terça 02:30` (madrugada seguinte), `Terça 08:00`, simulação de salto retroativo de relógio (`-3 horas` com `uptime` avançando `+10s`) e tentativa de reduzir a janela para `23:00 -> 05:00` sem autorização do Ajudante.
   - *Assert:* Verifica bloqueio ativo às `23:15` e `02:30`, liberação às `08:00`, imunidade absoluta de `com.apple.finder`, ativação de `tampered: true` no salto de relógio e rejeição da redução de janela pela Catraca `Append-Only`.
2. **Testes de Integração do Enforcer de Processos:**
   - Simulação com processo dummy de teste verificando envio de `SIGTERM`, fallback para `SIGKILL` após timeout de `200ms` e emissão do evento de bloqueio com idempotência.
