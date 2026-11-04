# Unit: `schedule-engine` — Requisitos Operacionais

## Visão Geral
Subsistema responsável pelo agendamento temporal de regras de bloqueio no Cisdem AppCrypt (`ACSchedule`, `ACScheduleHelper`, `ACGeneralSchedulePanel`, `ACCustomSchedulePanel`). Permite aplicar janelas de bloqueio globais (*General Schedule*) ou customizadas por aplicativo/site individual (*Custom Schedule*), avaliadas em tempo real pelo `ACMonitorTask` a cada evento de aplicativo ou ciclo de polling de URL.

## Escopo e reconciliação pendente
O modelo `ACSchedule`/`ACScheduleHelper` (`generalSchedules`, `schedules`, `enableCustomSchedule`; endereço atribuído a `monitorItemScheduleAvailable:`: `0x100009b70`) aqui especificado não foi reconciliado com o snapshot persistido `ACScheduleGroup`/`ACScheduleUnit` (`scheduleGroupToAll`, `scheduleGroup`, `useSelfSchedule`; endereço atribuído: `0x100009730`) em [`../data-dictionary.md`](../data-dictionary.md), [`../code-analysis.md`](../code-analysis.md), [`../flowcharts/schedule-engine.md`](../flowcharts/schedule-engine.md) e [`../rea-evidence-dossier.md`](../rea-evidence-dossier.md). Os endereços conflitantes exigem rechecagem no mesmo binário/fatia; não há prova de equivalência, migração ou obsolescência entre modelos. As regras e os critérios de aceite abaixo são **prescritivos e não validados para o snapshot em disco**; marcações de confirmação não comprovam essa correspondência nem execução dinâmica.

## Responsabilidades
- Representar e persistir janelas de horário com hora de início (`fromTime`), hora de término (`toTime`), máscara de dias da semana (`dayOfTheWeek`) e estado de ativação (`enabled`).
- Avaliar se o instante atual (`[NSDate date]`) cai dentro de ao menos uma janela ativa de uma lista de `ACSchedule *` (`+[ACScheduleHelper scheduleAvailable:]`).
- Permitir que itens individuais (`ACMonitorItem`) herdem a agenda global (`enableCustomSchedule == NO`) ou utilizem uma lista própria de janelas (`enableCustomSchedule == YES`, `schedules`).

## Regras de Negócio
- **Precedência de Agenda por Item (`-[ACMonitorTask monitorItemScheduleAvailable:]`, `0x100009b70`):**
  1. Se `item.enableCustomSchedule == YES`, avalia exclusivamente `+[ACScheduleHelper scheduleAvailable:item.schedules]`.
  2. Se `item.enableCustomSchedule == NO` (padrão), avalia a agenda global `+[ACScheduleHelper scheduleAvailable:ACMonitorItemsMgr.generalSchedules]`. 🟡 não validado contra o snapshot persistido
- **Semântica de Lista Vazia ou Desabilitada:** Se todas as entradas `ACSchedule` estiverem com `enabled == NO` ou se nenhuma cobrir o dia/horário atual, o bloqueio fica inativo fora da janela; se o usuário não restringir horários (agenda padrão integral), o bloqueio permanece permanente. 🟡 não validado contra o snapshot persistido
- **Máscara de Dias da Semana (`ACSchedule.dayOfTheWeek`):** Bitmask/conjunto de dias da semana codificado via `NSCalendarUnitWeekday` e formatado para exibição pela categoria `NSString (Schedule)` (`+stringWithDaysOfTheWeek:`, `0x10001e3a0`). 🟡 não validado contra o snapshot persistido

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|---|---|---|---|
| RF-SCH-01 | Modelar `ACSchedule` com suporte a `NSSecureCoding` e `NSCopying` (`fromTime`, `toTime`, `dayOfTheWeek`, `enabled`). | Must | Serializar e desserializar `ACSchedule` sem perda de precisão de hora/minuto e dias da semana. |
| RF-SCH-02 | Avaliar `+[ACScheduleHelper scheduleAvailable:]` comparando dia da semana e minutos do dia de `[NSDate date]` contra `fromTime` e `toTime`. | Must | Retornar `YES` dentro do intervalo `[fromTime, toTime]` nos dias selecionados e `NO` fora dele. |
| RF-SCH-03 | Suportar override de agenda por item (`ACMonitorItem.enableCustomSchedule` + `ACMonitorItem.schedules`). | Must | Permitir que um app ou site específico tenha horários distintos do General Schedule. |
| RF-SCH-04 | Fornecer painéis de configuração global (`ACGeneralSchedulePanel`) e por item (`ACCustomSchedulePanel`) com `ACScheduleTableCell`. | Should | Permitir adicionar, remover, duplicar e ativar/desativar janelas de horário via UI. |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|---|---|---|---|
| Desempenho | Avaliação em memória $O(K)$ (onde $K$ é o número de janelas de horário do item/global) sem I/O de disco durante o hot-path de bloqueio. | `ACScheduleHelper:0x10001cc3c` | 🟡 (leitura estática; não reconciliado) |

## Critérios de Aceitação

```gherkin
Dado que o usuário configurou um Custom Schedule para "youtube.com" das 09:00 às 18:00 de Segunda a Sexta
Quando o relógio do sistema marca 14:30 de uma Quarta-feira
Então -[ACMonitorTask monitorItemScheduleAvailable:] retorna YES e "youtube.com" é bloqueado

Quando o relógio do sistema marca 19:00 de uma Quarta-feira (ou qualquer horário no Sábado)
Então -[ACMonitorTask monitorItemScheduleAvailable:] retorna NO e o acesso a "youtube.com" é permitido
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|---|---|---|
| Modelo `ACSchedule` + avaliador `ACScheduleHelper` | Must | Base para bloqueio agendado de apps e sites |
| Alternância entre General Schedule e Custom Schedule por `ACMonitorItem` | Must | Diferencial central do produto |
| Painéis de edição `ACGeneralSchedulePanel` e `ACCustomSchedulePanel` | Should | Configuração visual pelo usuário |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---|---|---|
| `Contents/MacOS/Cisdem AppCrypt` | `ACSchedule` (`0x10002d620`–`0x10002dc50`) | 🟡 não reconciliado |
| `Contents/MacOS/Cisdem AppCrypt` | `ACScheduleHelper` (`0x10001cb64`–`0x10001d15c`) | 🟡 não reconciliado |
| `Contents/MacOS/Cisdem AppCrypt` | `-[ACMonitorTask monitorItemScheduleAvailable:]` (`0x100009b70` ou `0x100009730`, conflito) | 🔴 endereço pendente |
| `Contents/MacOS/Cisdem AppCrypt` | `ACGeneralSchedulePanel` / `ACCustomSchedulePanel` (`0x1000116c0` / `0x10002ab48`) | 🟡 não reconciliado |
