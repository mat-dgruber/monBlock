# Plano de Engenharia Reversa — Cisdem AppCrypt v7.11.0 (build 7110)

## Fase 1 — Reconhecimento
- [x] ✅ **Scout** — Mapeamento de superfície do bundle `/Applications/Cisdem AppCrypt.app`, frameworks embutidos, entitlements, assets e arquivos de persistência em `~/Library/`.

## Fase 2 — Escavação (Archaeologist)
- [x] ✅ **Archaeologist** — Análise do módulo `app-lock-engine` (`ACMonitorTask`, `ACRunningAppsMgr`, `ACRunningApp`, `ACWindowServer`, `ACMaskWndControl`, `ACMaskWindow`, `ACPasswordPanel`, `ACSystemInfo`)
- [x] ✅ **Archaeologist** — Análise do módulo `web-block-engine` (`ACMonitorBrowser` + 10 subclasses de navegadores, `ACScriptHelper`, `ACBrowserAuthManager`, `ACBrowserAuthPanel`, `ACPopularURLs`, `ACWebListFile`, `ACCommaHintHelper`)
- [x] ✅ **Archaeologist** — Análise do módulo `schedule-engine` (`ACSchedule`, `ACScheduleHelper`, `ACGeneralSchedulePanel`, `ACCustomSchedulePanel`, `ACScheduleEditDialog`, `ACScheduleTableCell`)
- [x] ✅ **Archaeologist** — Análise do módulo `security-and-persistence` (`ACPreferences`, `ACMonitorItemsMgr`, `ACMonitorItem`, `SAMKeychain`, `ACFailedAttemptsManager`, `ACFailedAttempt`, `ACCameraShot`, `ACLog`)
- [x] ✅ **Archaeologist** — Análise do módulo `self-defense-and-lifecycle` (`AppDelegate`, `ACMonitorAppSelf`, `ACFileSystemEventMonitor`, `ACLaunchAgent`, `ACStatusItemManager`, `ACShortcutBinder`)

## Fase 3 — Interpretação
- [x] ✅ **Detective** — Extração de regras de negócio implícitas, máquinas de estado, permissões TCC/macOS e ADRs retroativos (`001` a `004`)
- [x] ✅ **Architect** — Diagramas C4 (Contexto, Containers, Componentes), ERD de entidades serializadas, Deployment/Runtime macOS e Spec Impact Matrix

## Fase 4 — Geração de Especificações (SDD)
- [x] ✅ **Writer** — Especificações executáveis (`requirements.md`, `design.md`, `tasks.md`, `contracts.md`, `edge-cases.md`) por módulo + `user-stories/fluxos-principais.md` + `traceability/code-spec-matrix.md`

## Fase 5 — Revisão e Qualidade
- [x] ✅ **Reviewer** — Auditoria de confiança (`confidence-report.md`), lacunas (`gaps.md`) e questões (`questions.md`)
