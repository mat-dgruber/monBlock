# Unit: `schedule-engine`, Design Técnico

## Reconciliação pendente
Este design descreve `ACSchedule`/`ACScheduleHelper` com `ACMonitorItemsMgr.generalSchedules` e `ACMonitorItem.schedules/enableCustomSchedule` e atribui `monitorItemScheduleAvailable:` a `0x100009b70`. O snapshot persistido em [`../data-dictionary.md`](../data-dictionary.md), [`../code-analysis.md`](../code-analysis.md), [`../flowcharts/schedule-engine.md`](../flowcharts/schedule-engine.md) e [`../rea-evidence-dossier.md`](../rea-evidence-dossier.md) usa `ACScheduleGroup`/`ACScheduleUnit`, `scheduleGroupToAll`, `scheduleGroup/useSelfSchedule` e atribui ao mesmo seletor `0x100009730`. Não foi estabelecida relação entre essas descrições nem qual endereço corresponde ao snapshot; verificar binário/fatia e serialização antes de usar este design para reimplementação. Requisitos prescritivos associados não estão validados para o snapshot em disco.

## Interface

| Símbolo Objective-C | Assinatura | Retorno | Observação |
|---|---|---|---|
| `+[ACSchedule supportsSecureCoding]` | `()` | `BOOL` | Retorna `YES` (`0x10002d620`) |
| `-[ACSchedule isEqualToSchedule:]` | `(ACSchedule *other)` | `BOOL` | Compara `fromTime`, `toTime`, `dayOfTheWeek` e `enabled` (`0x10002da78`) |
| `+[ACScheduleHelper scheduleAvailable:]` | `(NSArray<ACSchedule *> *schedules)` | `BOOL` | Verifica se `[NSDate date]` satisfaz alguma janela habilitada (`0x10001cc3c`) |
| `+[ACScheduleHelper currentScheduleAvailabel]` | `()` | `BOOL` | Atalho que avalia `ACMonitorItemsMgr.generalSchedules` (`0x10001cb64`) |
| `-[ACMonitorTask monitorItemScheduleAvailable:]` | `(ACMonitorItem *item)` | `BOOL` | Seleciona `item.schedules` ou `generalSchedules` (`0x100009b70`) |
| `+[NSString(Schedule) stringWithDaysOfTheWeek:]` | `(NSInteger mask)` | `NSString *` | Formata máscara de dias (`"Mon, Tue..."`, `"Weekdays"`, `"Every Day"`) (`0x10001e3a0`) |

## Fluxo Principal
1. Durante uma verificação de bloqueio de app (`-runningAppsMgr:shouldLaunchApplication:` ou `-checkMonitoringAppWindowOnScreen`) ou de URL (`-websiteIsBlock:`), o `ACMonitorTask` localiza o `ACMonitorItem` correspondente.
2. `ACMonitorTask` invoca `-[ACMonitorTask monitorItemScheduleAvailable:item]`.
3. Se `item.enableCustomSchedule == YES`, a função passa `item.schedules` para `+[ACScheduleHelper scheduleAvailable:]`; caso contrário, passa `ACMonitorItemsMgr.sharedMonitorItemsMgr.generalSchedules`.
4. `+[ACScheduleHelper scheduleAvailable:]` extrai os componentes de data atuais (`NSCalendarUnitWeekday`, `NSCalendarUnitHour`, `NSCalendarUnitMinute`) de `[NSDate date]` e itera sobre cada `ACSchedule *`:
   - Ignora itens com `schedule.enabled == NO`.
   - Verifica se o bit correspondente ao dia da semana atual está ativo em `schedule.dayOfTheWeek`.
   - Converte `fromTime`, `toTime` e a hora atual para minutos desde a meia-noite (`hour * 60 + minute`) e verifica se o horário atual está contido no intervalo `[fromMinutes, toMinutes]`.
5. Se qualquer `ACSchedule` corresponder, retorna `YES` imediatamente; se nenhum corresponder ao fim da lista, retorna `NO`.

## Fluxos Alternativos
- **Exceções Globais de Website (`whiteWebsites` e `blackWebsites`):** Avaliadas em `-[ACMonitorTask websiteIsBlock:]` **antes** de `-monitorItemScheduleAvailable:`, portanto funcionam 24/7 independentemente de agenda.
- **Modo `blockAll` de Websites:** Quando `ACMonitorItemsMgr.blockAll == YES`, o bloqueio de todas as URLs (exceto `whiteWebsites`) respeita a agenda global (`+[ACScheduleHelper currentScheduleAvailabel]`).

## Dependências
- `security-and-persistence`: `ACMonitorItemsMgr` armazena `_generalSchedules` e os objetos `ACMonitorItem` (cada um com `_schedules` e `_enableCustomSchedule`).

## Decisões de Design Identificadas

| Decisão | Evidência no código | Confiança |
|---|---|---|
| Comparação de horários baseada em componentes de calendário (`hour`/`minute`) independentes da data civil de criação de `fromTime`/`toTime`. | `ACScheduleHelper:0x10001cc3c` + `NSDate (Schedule):0x10002dc50` | 🟡 (leitura estática; modelo não reconciliado) |
| Cópia profunda (`NSCopying`) de arrays `ACSchedule` ao abrir `ACCustomSchedulePanel` para permitir cancelamento ou confirmação atômica. | `ACCustomSchedulePanel:0x10002ab48` | 🟡 (leitura estática; modelo não reconciliado) |

## Estado Interno
- Layout atribuído a `ACSchedule` em `arm64` (dimensão total **não determinada**: a anotação anterior de `24 bytes` é incompatível com o ivar em `+32`; offsets a revalidar):
  - `+8` (`0x08`): `BOOL _enabled`
  - `+16` (`0x10`): `NSDate *_fromTime`
  - `+24` (`0x18`): `NSDate *_toTime`
  - `+32` (`0x20`): `NSInteger _dayOfTheWeek`

## Observabilidade
- Mudanças de agenda disparam salvamento imediato em `ACMonitorItemsMgr` e reavaliação das janelas abertas via `-[ACMonitorTask checkMonitoringApps]`.

## Riscos e Lacunas
- 🟡 Inferido (leitura estática; sem teste dinâmico): a avaliação de agenda lê o relógio local (`[NSDate date]`). Hipótese: um usuário com privilégios de administrador que altere o horário do sistema (caso `System Preferences.app` não esteja bloqueado) poderia contornar a janela de horário. Não testado.
