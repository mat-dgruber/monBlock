# Unit: `app-lock-engine`, Tarefas de Implementação

## Pré-requisitos
- [x] Entidades `ACMonitorItem`, `ACMonitorItemsMgr` e `ACPreferences` definidas
- [x] Subsistema de validação de senha (`ACPasswordMgr`) disponível

## Tarefas

- [ ] T-APP-01, Implementar `ACWindowServer` e `ACWindowInfo` usando `CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly, kCGNullWindowID)` filtrando por `kCGWindowOwnerPID`.
  - Origem no legado: `Contents/MacOS/Cisdem AppCrypt:0x100019e34` (`-[ACWindowServer windowOnScreenForProccessorWithID:]`)
  - Critério de pronto: Retornar array de `ACWindowInfo` com `frameOnScreen` (`CGRect`), `wndID` e `ownerProcessID`.
  - Confiança: 🟢

- [ ] T-APP-02, Implementar wrapper `ACRunningApp` com KVO em `active` e `hidden`, guard flag `_notRespondActiveNotification` e timers `_resignTimer`, `_hiddenTimer` e `_terminateTimer`.
  - Origem no legado: `Contents/MacOS/Cisdem AppCrypt:0x100001dd0`–`0x100004c74` (`ACRunningApp`)
  - Critério de pronto: Detectar ativação/desativação sem recursão e suportar `-hideWithoutNotification` e `-terminateWithoutNotification`.
  - Confiança: 🟢

- [ ] T-APP-03, Implementar `ACMaskWndControl` e `ACMaskWindow` com geração de imagem borrada via CoreImage (`CIGaussianBlur`) ou imagem customizada.
  - Origem no legado: `Contents/MacOS/Cisdem AppCrypt:0x10004932c` (`-[ACMaskWndControl makeDisplayMaskImage]`)
  - Critério de pronto: Cobrir todas as janelas do PID bloqueado instantaneamente ao ativar.
  - Confiança: 🟢

- [ ] T-APP-04, Implementar `ACMonitorTask` com regras `-appIsBlock:`, `-appItemBlock:isBlackMode:app:`, auto-lock por `IOHIDSystem` (`HIDIdleTime`) e listener `NSWorkspaceWillSleepNotification`.
  - Origem no legado: `Contents/MacOS/Cisdem AppCrypt:0x100009084`–`0x10000ac18` (`ACMonitorTask`)
  - Critério de pronto: Bloquear em modo Blacklist e Allowlist e revogar `granted` no sleep ou ociosidade.
  - Confiança: 🟢

## Tarefas de Teste

- [ ] TT-APP-01, Testar interceptação de aplicativo na Blocklist e liberação após senha correta (`granted = YES`).
- [ ] TT-APP-02, Testar expiração de `granted` via `_resignTimer` e via `NSWorkspaceWillSleepNotification`.
- [ ] TT-APP-03, Garantir que `com.apple.finder` e `loginwindow` nunca sejam bloqueados mesmo em modo Allowlist.

## Ordem Sugerida
1. `T-APP-01` (`ACWindowServer`) → 2. `T-APP-02` (`ACRunningApp`) → 3. `T-APP-03` (`ACMaskWndControl`) → 4. `T-APP-04` (`ACMonitorTask`).

## Lacunas Pendentes (🔴)
Nenhuma lacuna bloqueante registrada nesta unidade, dentro do escopo da análise estática; fluxos reconstruídos a partir de metadados e disassembly, sem teste dinâmico. TT-APP pendentes. Ver `../gaps.md` e `../rea-evidence-dossier.md` (limites).
