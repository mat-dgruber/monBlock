# Relatório de Confiança da Extração Reversa (`confidence-report.md`)

> Revisão documental do framework Reversa (`doc_level = detalhado`); cobertura limitada à evidência estática disponível. Não constitui validação integral nem teste dinâmico.

---

## 1. Resumo Executivo de Confiança

| Métrica | Valor |
|---|---|
| **Alvo Analisado** | `/Applications/Cisdem AppCrypt.app` (`v7.11.0`, build `7110`) + `https://www.cisdem.com/blocked-website.html` |
| **Total de Unidades SDD** | 5 (`app-lock-engine`, `web-block-engine`, `schedule-engine`, `security-and-persistence`, `self-defense-and-lifecycle`) |
| **Total de Classes Objective-C Auditadas** | 79 classes no executável principal + 3 frameworks embutidos (`MASShortcut`, `Paddle`, `Sparkle`) |
| **Afirmações 🟢 CONFIRMADO** | Evidência estática pontual, sem percentual de cobertura mensurável; ver [`rea-evidence-dossier.md`](rea-evidence-dossier.md). |
| **Afirmações 🟡 INFERIDO** | Há inferências e semânticas não confirmadas; não quantificadas. |
| **Afirmações 🔴 LACUNA** | Há conflitos de modelos/endereço de agenda, fontes brutas ausentes e validações pendentes; ver [`gaps.md`](gaps.md). |

---

## 2. Confiança por Unidade de Especificação

| Unidade | Requisitos | Design | Tarefas | Edge Cases / Contratos | Status da Revisão Cruzada |
|---|---|---|---|---|---|
| `app-lock-engine` | Amostrado | Amostrado | Pendente | Amostrado | Inspeção estática documentada; testes de ativação/KVO pendentes |
| `web-block-engine` | Amostrado | Amostrado | Pendente | Amostrado | `otool -ov`, `strings` e `Assets.car` citados; scripts e TCC não testados dinamicamente |
| `schedule-engine` | Prescritivo, não validado no snapshot | Modelos conflitantes | TT-SCH-01..03 pendentes | Pendente | `ACSchedule`/`ACScheduleHelper` vs. `ACScheduleGroup`/`ACScheduleUnit`; `0x100009b70` vs. `0x100009730` |
| `security-and-persistence` | Amostrado | Amostrado | Pendente | Pendente | Arquivo local `csdv.dsc` observado; restauração/backup e desserialização não testados |
| `self-defense-and-lifecycle` | Amostrado | Amostrado | Pendente | Pendente | Símbolos e LaunchAgent local citados; restauração não testada |

---

## 3. Limites da Revisão Cruzada (`Reviewer` Checklist)

1. **[`code-analysis.md`](code-analysis.md) ↔ [`data-dictionary.md`](data-dictionary.md):** há evidência de offsets e chaves arquivadas, mas a correspondência integral de ivars/seletores não foi demonstrada; agenda exige reconciliação com [`schedule-engine/design.md`](schedule-engine/design.md) e [`rea-evidence-dossier.md`](rea-evidence-dossier.md).
2. **[`flowcharts/schedule-engine.md`](flowcharts/schedule-engine.md) ↔ [`schedule-engine/design.md`](schedule-engine/design.md):** divergem no modelo e no endereço de `monitorItemScheduleAvailable:`; os demais fluxogramas e designs por unidade não foram validados endereço a endereço.
3. **[`web-block-engine/contracts.md`](web-block-engine/contracts.md) ↔ `Assets.car` e página de bloqueio:** IDs, entitlements e categorias estão documentados, mas correspondência 1:1 e completude não foram revalidadas nesta auditoria. A página citada não demonstra comportamento em execução.
4. **Testes pendentes:** executar TT-SCH-01..03 de [`schedule-engine/tasks.md`](schedule-engine/tasks.md), validar redirecionamento/TCC de navegador, interceptação de apps e recuperação de persistência em ambiente autorizado; nenhum teste dinâmico é reivindicado aqui.
