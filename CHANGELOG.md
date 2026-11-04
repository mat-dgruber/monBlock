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

