# Changelog

Todas as mudanças notáveis deste projeto são documentadas aqui.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o versionamento segue [SemVer 2.0.0](https://semver.org/lang/pt-BR/).

## [Unreleased]
### Adicionado
- Proteção estendida a Vivaldi, Opera, Chromium e Chrome Beta/Canary: o perfil dos navegadores ganha os 5 identificadores e o watcher passa a ler/redirecionar a aba deles. **Quem já tem o perfil instalado verá o aviso "Falta 1 passo" e precisa aprovar o perfil atualizado.** Versão 0.4.0.
- Watcher (palavras-chave e redirecionamento para a página de bloqueio) passa a reconhecer o navegador Dia, que usa o mesmo dicionário AppleScript do Chromium.
- Rota inicial do app por pareamento (Primeiros passos se não pareado, Categorias se pareado; "Agora não" persiste), revisão de contraste, estados honestos (cabeçalho, "Tentar novamente", "Proteção parcial"), onboarding acessível (stepper com setas, passo 4 só após o pareamento), CSS externo com CSP `style-src 'self'`, motion calmo com `prefers-reduced-motion` e sublinhado animado no passo ativo do stepper (spec `docs/ai/specs/2026-11-06-rota-inicial-e-revisao-telas-design.md`).
- Título da tray sinaliza o estado da proteção no macOS (`?` não verificado, `!` perfil dos navegadores pendente).
- Aprovação guiada do perfil dos navegadores: página de conclusão no Instalador, `postinstall` abre Ajustes > Geral > Gerenciamento de Dispositivos, e o app mostra um aviso com "Abrir Ajustes" enquanto o daemon não encontrar o perfil (`browserProfileInstalled` no `GET_STATE`).
- "Sair do monBlock" na tray; Cmd+Q e SIGTERM voltam a encerrar o app (a proteção segue no daemon root).
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
- Implementação TDD do `MOD-04` (`src/main/main.ts`, `src/preload/preload.ts`, `src/renderer/index.html`, `src/renderer/app.ts`): Aplicativo Desktop Electron com Tríade Zero-Trust, Menu da Tray na Barra de Menu do macOS sem opção de saída (`INV-UI-TRAY-03`), Wizard de Onboarding em 4 passos, Dashboard das 11 categorias e Central do Ajudante nos 4 temas CCAT (Zero Roxo), elevando a suíte para 66 testes automatizados passando.
- Daemon `monblockd` como root sob `launchd` (ADR-0007): entrada `src/daemon/entry.ts` com o layout de `/Library/Application Support/monBlock`, `/var/db/monblock` e socket `/var/run/monblock/monblockd.sock` (`root:monblock 0750`), watchdog de 60 s (reaplicação, detecção de adulteração, heartbeat e aviso de inatividade ao Ajudante) e página de bloqueio servida pelo daemon.
- IPC por socket Unix (`src/daemon/ipc-server.ts`, `src/main/daemon-client.ts`): NDJSON até 64 KiB, 8 conexões, timeout e reconexão com backoff + jitter; o Electron passa a ser só cliente e mostra "Proteção não verificada" quando o daemon não responde.
- Relógio confiável assimétrico (`src/daemon/trusted-clock.ts`, RN-DAEMON-08) ancorado no cabeçalho `Date` do Telegram.
- Tombstone de pareamento (RN-DAEMON-07), rate limit persistido de credenciais do Ajudante (RN-DAEMON-09) e migração única dos cofres de userland (`MIGRATE_LEGACY_STATE`, RN-DAEMON-10).
- Imposição no sistema: `/etc/hosts` com `uchg` e flush de DNS, políticas Chromium (Chrome/Brave/Edge) com perfil `.mobileconfig`, plist do Firefox em `/Library/Preferences` e `verifyApplied`.
- Instalador `.pkg` com binário Node SEA universal (`npm run build:pkg`), `uninstall.sh` disparado só por desinstalação autorizada, e job de CI que gera o `.pkg` e roda o E2E como root (`tests/e2e/root/run.sh`).
- `monBlock.app` para macOS (`npm run build:app`, `scripts/build-app.sh`) com o `monblockd.pkg` em `Contents/Resources/`, para o botão "Reinstalar serviço"; a CI gera, assina ad-hoc, roda um smoke e publica o artefato `monBlock-app`.

### Corrigido
- Bloqueio por palavras-chave e redirecionamento para a página de bloqueio não agiam: o `.app` não declarava `NSAppleEventsUsageDescription`, então o macOS negava a Automação do navegador sem perguntar. A chave foi adicionada ao `build-app.sh` e o watcher agora registra no console quando não consegue ler a aba.
- Bloqueio por DNS ineficaz: o daemon (umask 077) gravava `/etc/hosts` em 0600 e o mDNSResponder, que roda sem root, ignorava o arquivo inteiro; os sites continuavam abrindo. O hosts agora é gravado em 0644, um hosts já existente em 0600 é reparado no próximo ciclo e o modo errado conta como desvio no watchdog.
- Blindagem pós-auditoria `/review max geral` em `MOD-01` a `MOD-04`: remoção de `nowMs` controlado por cliente IPC no Cooldown de 72h (`nowFn` isolado no daemon), exigência de `requirePermanentToken` em `MUTATE_RULES`, reconciliação efetiva de `TemporaryGrant` no `/etc/hosts` e `BrowserPolicies`, diferenciação entre falha de I/O (`ioError`) e adulteração criptográfica no `TripleStateStore`, unificação dos seletores `data-theme` e contraste WCAG 2.2 AA/AAA em `docs/design/tokens.css`, hidratação `initRendererDom` e limite de payload `16 KB` + `Content-Security-Policy` no servidor local `:49152`.

### Segurança
- Apagar os cofres, adiantar o relógio, ler o `hmacSecret` ou matar o processo deixam de desfazer o bloqueio para usuário Standard: estado, chave e imposição saem do processo Electron e passam ao daemon root.
