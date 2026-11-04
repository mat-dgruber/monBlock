# Unit: `schedule-engine`, Tarefas de Implementação

## Reconciliação antes de implementar
T-SCH-01..04 são propostas **prescritivas não validadas para o snapshot em disco**: `ACSchedule`/`ACScheduleHelper`, `generalSchedules` e `schedules/enableCustomSchedule` (`monitorItemScheduleAvailable:` atribuído a `0x100009b70`) diferem de `ACScheduleGroup`/`ACScheduleUnit`, `scheduleGroupToAll` e `scheduleGroup/useSelfSchedule` (endereço atribuído `0x100009730`) documentados em [`../data-dictionary.md`](../data-dictionary.md), [`../code-analysis.md`](../code-analysis.md), [`../flowcharts/schedule-engine.md`](../flowcharts/schedule-engine.md) e [`../rea-evidence-dossier.md`](../rea-evidence-dossier.md). Não presumir equivalência ou obsolescência; revalidar ambos os endereços no mesmo binário/fatia e o contrato de serialização antes de implementar.

## Pré-requisitos
- [x] Categorias `NSDate (Schedule)` e `NSString (Schedule)` definidas

## Tarefas

- [ ] T-SCH-01, Implementar entidade `ACSchedule` conforme `NSSecureCoding` e `NSCopying` (`fromTime`, `toTime`, `dayOfTheWeek`, `enabled`).
  - Origem no legado: `Contents/MacOS/Cisdem AppCrypt:0x10002d620`–`0x10002dc50`
  - Critério de pronto: Codificar/decodificar as 4 chaves (`fromTime`, `toTime`, `dayOfTheWeek`, `enabled`) e comparar igualdade com `-isEqualToSchedule:`.
  - Confiança: 🟡 (modelo não reconciliado)

- [ ] T-SCH-02, Implementar `ACScheduleHelper` (`+scheduleAvailable:`, `+currentScheduleAvailabel`) e categorias auxiliares `NSDate (Schedule)` / `NSString (Schedule)`.
  - Origem no legado: `Contents/MacOS/Cisdem AppCrypt:0x10001cb64`–`0x10001e600`
  - Critério de pronto: Avaliar se `[NSDate date]` pertence a qualquer intervalo habilitado no dia da semana corrente.
  - Confiança: 🟡 (modelo não reconciliado)

- [ ] T-SCH-03, Integrar `-[ACMonitorTask monitorItemScheduleAvailable:]` com o fluxo de decisão de App Lock e Web Block.
  - Origem no legado: `Contents/MacOS/Cisdem AppCrypt:0x100009b70`
  - Critério de pronto: Priorizar `item.schedules` quando `item.enableCustomSchedule == YES` e usar `generalSchedules` caso contrário.
  - Confiança: 🔴 (endereço em conflito: `0x100009b70` vs `0x100009730`)

- [ ] T-SCH-04, Implementar `ACGeneralSchedulePanel`, `ACCustomSchedulePanel`, `ACScheduleEditDialog` e `ACScheduleTableCell`.
  - Origem no legado: `Contents/MacOS/Cisdem AppCrypt:0x1000116c0`, `0x10002ab48`, `0x100031520`
  - Critério de pronto: Permitir criar, editar, excluir e alternar o switch `enabled` de cada regra de horário.
  - Confiança: 🟡 (modelo não reconciliado)

## Tarefas de Teste

- [ ] TT-SCH-01, Testar `+[ACScheduleHelper scheduleAvailable:]` nos limites exatos de minuto inicial (`fromTime`) e final (`toTime`).
- [ ] TT-SCH-02, Testar alternância de `enableCustomSchedule` em um `ACMonitorItem` verificando isolamento em relação a `generalSchedules`.

- [ ] TT-SCH-03, Revalidar `monitorItemScheduleAvailable:` nos endereços atribuídos `0x100009b70` e `0x100009730` na mesma imagem/fatia e inspecionar as chaves arquivadas; documentar a relação entre modelos somente se houver evidência.

## Ordem Sugerida
1. `T-SCH-01` (`ACSchedule`) → 2. `T-SCH-02` (`ACScheduleHelper`) → 3. `T-SCH-03` (`monitorItemScheduleAvailable:`) → 4. `T-SCH-04` (Painéis UI).

## Lacunas Pendentes (🔴)
Há lacuna bloqueante para paridade com persistência: reconciliar os modelos e endereços antes de escolher o contrato de implementação. TT-SCH-01..03 permanecem pendentes; nenhuma execução dinâmica foi realizada.
