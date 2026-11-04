# Changelog

Todas as mudanças notáveis deste projeto são documentadas aqui.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o versionamento segue [SemVer 2.0.0](https://semver.org/lang/pt-BR/).

## [Unreleased]
### Adicionado
- Estrutura Dual-Harness Nível 3 (`.agents/`, `.claude/`, `.gemini/`, `AGENTS.md`, hooks de governança e memórias sincronizadas).
- Engenharia reversa completa do aplicativo de referência em `_reversa_sdd/`.
- Especificação de Arquitetura (`docs/architecture/ARCHITECTURE_SPEC.md`) e 4 ADRs canônicas (`docs/adrs/0001..0004`).
- Especificação de Design e Plano de Implementação do MVP em `docs/ai/specs/2026-11-04-monblock-mvp-design.md` e `docs/ai/plans/2026-11-04-monblock-mvp-plan.md` (`Risk Score: 0/100`).
- Design System Oficial CCAT (`docs/design/tokens.css`), Tela de Bloqueio limpa com componentes `.ccat-*` (`docs/design/blocked-page.html`) e servidor local `scripts/test-block-server.mjs` (`127.0.0.1:49152`).
- Implementação TDD do MVP Fase 1 (`src/domain/categories.ts`, `src/domain/rule-engine.ts`, `src/domain/partner-guard.ts`, `src/enforcers/hosts-enforcer.ts`, `src/enforcers/browser-policy-enforcer.ts`, `scripts/test-block-server.mjs`) com 14 testes automatizados no Vitest (`tests/`).
- Prevenção geral de falsos positivos em palavras-chave (`RN-WEB-07` — Scunthorpe problem) por fronteira de palavra inteira Unicode (`(?<![\p{L}\p{N}])termo(?![\p{L}\p{N}])`), decodificação de URLs acentuadas (`safeDecodeUri`) e higienização de abreviações cotidianas (`sex.`, `seg a sex`, `tit.`).
- Master Spec (`docs/ai/specs/2026-11-04-monblock-master-design.md`), 5 Sub-Especificações Modulares (`MOD-01` a `MOD-05` em `docs/ai/specs/`, com `MOD-05` congelado para Fase 2) e documentação completa dos 5 Bounded Contexts DDD em `docs/domains/`.
- Implementação TDD do `MOD-03` (`src/storage/state-store.ts`, `src/enforcers/platform-enforcer.ts`, `src/daemon/monblockd.ts`): Tripla Persistência Redundante com `Self-Healing (2 de 3)` (`HMAC-SHA256`), protocolo IPC com `RFC 9457 Problem Details` e Desinstalação Autorizada (`UNINSTALL_AUTHORIZED` — `RN-DAEMON-06`).
- Implementação TDD do `MOD-01` e `MOD-02` (`src/enforcers/macos-watcher.ts`, `src/daemon/telegram-client.ts`): Watcher universal de abas no macOS (Safari, Chrome, Brave, Arc, Edge, Firefox) sem shell interpolation e cliente do Bot do Telegram com Raio-X (`has_spoiler: true`), Circuit Breaker e fallback automático para Desafio-Resposta Offline `HMAC-SHA256`.
- Implementação TDD do `MOD-04` (`src/main/main.ts`, `src/preload/preload.ts`, `src/renderer/index.html`, `src/renderer/app.ts`): Aplicativo Desktop Electron com Tríade Zero-Trust, Menu da Tray na Barra de Menu do macOS sem opção de saída (`INV-UI-TRAY-03`), Wizard de Onboarding em 4 passos, Dashboard das 11 categorias e Central do Ajudante nos 4 temas CCAT (Zero Roxo), elevando a suíte para 48 testes automatizados passando.

