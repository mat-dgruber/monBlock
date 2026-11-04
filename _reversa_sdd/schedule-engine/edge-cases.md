# Unit: `schedule-engine`, Casos Extremos (Edge Cases)

> Extraído do binário Mach-O (`doc_level = detalhado`). **Aviso:** estes casos pertencem ao modelo `ACSchedule`/`ACScheduleHelper`, ainda **não reconciliado** com o snapshot persistido `ACScheduleGroup`/`ACScheduleUnit` (ver [`requirements.md`](requirements.md#escopo-e-reconciliação-pendente)). São prescritivos, derivados de leitura estática, sem teste dinâmico.

---

## EC-SCH-01: Aplicativo Já Aberto Quando a Janela de Horário Inicia
- **Evidência no binário (`ACMonitorTask checkMonitoringAppWindowOnScreen` em `0x100009bc0`):**
  - Mesmo que o aplicativo tenha sido aberto antes do início da janela de bloqueio (quando `monitorItemScheduleAvailable:` retornava `NO`), o timer contínuo de 1 segundo (`_windowWatchTimer`) reavalia `monitorItemScheduleAvailable:` para todas as janelas visíveis na tela.
- **Comportamento:** No exato segundo em que a janela de horário (`fromTime`) passa a vigorar, o aplicativo aberto é imediatamente coberto pela `ACMaskWindow` (se em primeiro plano) ou ocultado/encerrado. 🟡 (leitura estática; comportamento em runtime não testado)

## EC-SCH-02: Desbloqueio Temporário (`granted == YES`) Durante Mudança de Horário
- **Evidência no binário (`ACRunningApp.granted` em `0x1000383a0` + `ACMonitorTask:0x100008360`):**
  - Quando o usuário insere a senha para um aplicativo bloqueado por agenda, `ACRunningApp.granted` permanece `YES` enquanto o app estiver ativo, e só é revogado pelos gatilhos de sessão (`_resignTimer`, `HIDIdleTime` ou `NSWorkspaceWillSleepNotification`). 🟡 (leitura estática; enumeração de gatilhos não é exaustiva nem testada)

## EC-SCH-03: Datas Base Diferentes em `fromTime` e `toTime` (`NSDate`)
- **Evidência no binário (`NSDate (Schedule)` em `0x10002dc50` e `ACScheduleHelper:0x10001cc3c`):**
  - Como `NSDatePicker` armazena um `NSDate` completo (incluindo ano/mês/dia do momento em que a regra foi criada), comparar `[now compare:fromTime]` diretamente falharia nos dias seguintes. O `ACScheduleHelper` normaliza a comparação extraindo apenas `NSCalendarUnitHour` e `NSCalendarUnitMinute` via `NSCalendar.currentCalendar`. 🟡 (leitura estática; modelo não reconciliado, sem teste dinâmico)
