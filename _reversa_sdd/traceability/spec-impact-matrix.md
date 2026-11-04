# Matriz de Impacto entre Especificações (Spec Impact Matrix)

> Gerada pelo agente **Architect** (`doc_level = detalhado`, 🟢 CONFIRMADO).

---

## Matriz de Dependência e Impacto Cruzado

| Módulo Origem (Se alterado...) | `app-lock-engine` | `web-block-engine` | `schedule-engine` | `security-and-persistence` | `self-defense-and-lifecycle` |
|---|---|---|---|---|---|
| **`app-lock-engine`** | — | **Médio:** `ACRunningApp` hospeda a propriedade `_monitorBrowser` e detecta quando um navegador é lançado/encerrado. | **Baixo:** Apenas consome `-monitorItemScheduleAvailable:`. | **Alto:** Dispara `ACPWDInputWndCtrl` → `ACPasswordMgr` e `ACCapturePhoto` em falhas de senha. | **Médio:** Protege os 3 apps de segurança (`Activity Monitor`, `Terminal`, `System Settings`). |
| **`web-block-engine`** | **Baixo:** Usa `ACRunningApp` apenas como container de ciclo de vida do processo do navegador. | — | **Baixo:** Consome `-monitorItemScheduleAvailable:` por URL/domínio. | **Alto:** Lê listas `_monitorWebsites`, `_blackWebsites`, `_whiteWebsites` e `redirectionURL` de `ACPreferences`. | **Nenhum** |
| **`schedule-engine`** | **Alto:** Mudanças em `-nowInSchedule` alteram imediatamente quando aplicativos ficam bloqueados ou liberados. | **Alto:** Mudanças em `-nowInSchedule` alteram imediatamente quando sites ficam bloqueados ou liberados. | — | **Alto:** `ACScheduleGroup` e `ACScheduleUnit` são serializados dentro de `csdv.dsc` e `dgh.xvc`. | **Nenhum** |
| **`security-and-persistence`** | **Crítico:** Fornece `ACMonitorItemsMgr` (`_blackMonitorApps`, `_whiteMonitorApps`) e timers de ociosidade (`HIDIdleTime`). | **Crítico:** Fornece listas de sites, `blockAll`, `redirectionURL` e `ACPopularURLs`. | **Alto:** Persiste `scheduleGroupToAll` e os `scheduleGroup` individuais de cada `ACMonitorItem`. | — | **Alto:** Fornece flags `monitorSelf`, `grantMonitorSelf` e `automaticallyStartWithSystem`. |
| **`self-defense-and-lifecycle`** | **Médio:** Garante que o processo `ACMonitorTask` permaneça vivo e inicie no login (`-runMode autoLaunched`). | **Médio:** Inicia `ACBrowserAuthManager.startGlobalHeartbeat` no boot. | **Baixo** | **Médio:** `ACAppStateMgr` invoca `-saveCriticalData` antes de encerrar o processo. | — |
