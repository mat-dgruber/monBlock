# Changelog

Todas as mudanças notáveis deste projeto são documentadas aqui.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o versionamento segue [SemVer 2.0.0](https://semver.org/lang/pt-BR/).

## [Unreleased]
### Adicionado
- CI: job `windows-latest` com typecheck, testes, build e smoke do daemon (Named Pipe `\\.\pipe\monblockd` e hosts gerado em modo dev).

### Corrigido
- Windows, Camada 2: o manifesto `.reg` usava a abreviação `HKLM\`, que o `reg import` ignora com código 0; nenhuma política de navegador era gravada. Agora usa `HKEY_LOCAL_MACHINE\`, apaga cada lista antes de recriá-la (sem allowlist antiga valendo) e grava sem BOM (W9).
- Windows: falhas de `icacls`, `ipconfig`, `reg import` não são mais engolidas; todos os passos rodam e as falhas viram drift. O drift lê o Registro (`reg query`) e acusa chave apagada ou valor alterado (W10).
- Windows: caminhos do daemon vêm de `%ProgramData%` e `%SystemRoot%`, não mais relativos ao drive corrente (W15).
- Windows: ícone da bandeja visível (era vazio) e notificações com o AppUserModelID `com.ccat.monblock` (W13, W14).
- Windows: o daemon reconhece que roda como SYSTEM/administrador pelo SID de integridade (`whoami /groups`) e sobe sem `MONBLOCK_DEV_ROOT_DIR`; antes saía no boot porque `process.getuid` não existe (W1).
- Windows: no boot, a ACL de `%ProgramData%\monBlock` é conferida por SID e restringida a SYSTEM e Administradores; se não der, o cofre não é aberto (W20).
- Windows: o Edge trava a navegação InPrivate com `InPrivateModeAvailability` (o `IncognitoModeAvailability` dava "Erro").
- Windows, modo dev: o daemon não roda mais `icacls`/`reg` no sistema real.
- Linux: sem root, o enforcer não escala mais com `sudo -n` (travava arquivos de teste com `chattr +i`).
- `resolveLayout` usa `path.posix` (darwin/linux) e `path.win32` (win32) pela plataforma alvo, e não pela do host.
- `npm run build` funciona no Windows: a cópia de assets saiu do `cp` para `scripts/copy-assets.mjs`.
- `.gitattributes` fixa EOL em LF; com o `core.autocrlf=true` do Git for Windows, o `gen-lists --check` falhava.
- Os enforcers POSIX ignoram o modo do hosts no `win32`, que não tem modo POSIX; antes acusavam drift em todo tick.
- A suíte roda no Windows: os testes de IPC usam Named Pipe e os testes de modo POSIX são pulados no `win32`.

## [0.9.1] - 2026-11-19
### Corrigido
- Resiliência do Watcher macOS contra travamento de interface (hang):
  - Prevenção de concorrência: adicionada trava explícita (`isInspecting` e `isExecuting`) no ciclo de inspeção e no adaptador AppleScript (`OsascriptBrowserTabAdapter`), descartando chamadas sobrepostas e prevenindo contenção de eventos AppKit/AppleEvents.
  - Backoff dinâmico sob carga do sistema: o loop do vigia agora eleva automaticamente o intervalo de 1500 ms para até 5000 ms quando uma inspeção exceder 800 ms ou encontrar falhas, aliviando a contenção de I/O (ex.: sob indexação do Spotlight).
  - Redução de contenção do AppKit na Tray: a reconstrução periódica do menu `NSMenu` da bandeja do sistema foi espaçada de 10 s para 30 s com trava contra chamadas concorrentes, mantendo atualização imediata reativa a mutações IPC.
  - Otimização do motor de regras: adicionado fast-path nativo O(N) e cache em memória de termos de palavras-chave (`getParsedKeywordTerms`), acelerando a avaliação de abas em 18x (de ~1,4 s para ~78 ms por milhar).

## [0.9.0] - 2026-11-18
### Adicionado
- Fundação Arquitetural Multiplataforma ([ADR-0013](file:///Users/matheus.diniz_1/Documents/GitHub/monBlock/docs/adrs/0013-fundacao-arquitetural-multiplataforma-linux-windows.md)): fábrica abstrata `createPlatformEnforcer(platform, options)` desacoplando o daemon de particularidades de SO, layout de caminhos de sistema agnóstico (`resolveLayout` para `darwin`, `linux` e `win32`), e suporte a canais IPC via Unix Domain Socket (`0750`, grupo `monblock`) e Windows Named Pipe (`\\.\pipe\monblockd`).
- Imposição Nativa de Sistema e Políticas no Linux ([ADR-0014](file:///Users/matheus.diniz_1/Documents/GitHub/monBlock/docs/adrs/0014-politicas-corporativas-e-imposicao-no-linux.md)):
  - Camada 1: `/etc/hosts` atômico com atributo imutável `chattr +i` e descarga de cache DNS via `resolvectl flush-caches` / `systemd-resolve`.
  - Camada 2: Políticas corporativas multi-navegador em manifestos JSON gerenciados em `/etc/opt/chrome/policies/managed/`, `/etc/chromium/policies/managed/`, `/etc/brave/policies/managed/`, `/etc/opt/edge/policies/managed/`, `/etc/vivaldi/policies/managed/` e `/etc/firefox/policies/policies.json`.
  - Camada 3: `LinuxBrowserWatcher` com adaptador `X11BrowserTabAdapter` inspecionando janelas via `xdotool` / `xprop WM_CLASS` e redirecionando para `127.0.0.1:49152/blocked` via `xdg-open`.
  - Empacotamento e Sandboxing: unidade `scripts/linux/monblockd.service` com `ProtectSystem=strict`, `CapabilityBoundingSet=CAP_NET_BIND_SERVICE CAP_DAC_OVERRIDE CAP_LINUX_IMMUTABLE` e script gerador de pacote `.deb` (`scripts/build-linux-pkg.sh`).
- Imposição Nativa de Sistema e Políticas no Windows ([ADR-0015](file:///Users/matheus.diniz_1/Documents/GitHub/monBlock/docs/adrs/0015-politicas-corporativas-e-imposicao-no-windows.md)):
  - Camada 1: `%SystemRoot%\System32\drivers\etc\hosts` com descritor de segurança NTFS (`icacls`) restringindo usuários comuns a leitura e garantindo controle total apenas a SYSTEM e Administradores; descarga de DNS via `ipconfig /flushdns`.
  - Camada 2: Geração e importação de manifestos `.reg` sob `HKLM\SOFTWARE\Policies` para Chrome, Edge, Brave, Chromium, Vivaldi e Firefox (`URLBlocklist`, `URLAllowlist`, `WebsiteFilter`, bloqueio de DoH e Incógnito).
  - Camada 3: `WindowsBrowserWatcher` com adaptador `WindowsBrowserTabAdapter` consultando janela em primeiro plano via Win32/PowerShell (`GetForegroundWindow`) e redirecionamento seguro via `cmd.exe /c start`.
  - Serviço do Windows: script de provisionamento `scripts/windows/install-service.ps1` criando serviço Windows automático sob `NT AUTHORITY\SYSTEM` com reinício em falha em 5s e proteção de `%ProgramData%\monBlock`.
- Suporte ao navegador Facet (`app.panes.browser`): monitoramento de abas ativas e detecção de palavras-chave/URLs via System Events e redirecionamento direcionado para a página de bloqueio via `/usr/bin/open -b app.panes.browser`.

## [0.8.1] - 2026-11-07
### Corrigido
- App preso em "Conferindo proteção...": o botão "Bloquear de novo" (0.8.0) usava uma variável fora de escopo e o script da interface falhava ao iniciar. Novo teste executa o script do renderer e falha se ele lançar erro na inicialização.

## [0.8.0] - 2026-11-07
### Adicionado
- Liberação permanente para falsos positivos: o pedido "Permanente" da página de bloqueio chega ao Ajudante com o botão **Liberar permanente**; o primeiro toque só pergunta ("Tem certeza?") e só o segundo libera. O daemon acrescenta apenas o domínio pedido (com subdomínios) à lista de liberados, no mesmo `save` atômico da decisão, e reaplica as regras nos três cofres de bloqueio. Motivo obrigatório (mín. 10 caracteres), recusa endereço IP, limite de 3 liberações por 24 h e 200 entradas, e cada liberação fica registrada em `permanentReleases`.
- Testes: dois toques obrigatórios, cancelar, outro chat, toque repetido sem duplicar, limite diário, motivo curto.

- Interface: os endereços liberados para sempre aparecem na tabela de regras ("Liberado para sempre pelo Ajudante") com o botão **Bloquear de novo**. Voltar a bloquear é endurecer a regra, então não pede a senha do Ajudante.

## [0.7.0] - 2026-11-07
### Adicionado
- Telegram T2/T3 (parcial): mensagem do pedido em português claro, sem jargão; token do bot mascarado em erros e logs (`maskBotToken`); ADR-0009 (broker único e cofre do token).
- Telegram T1: pedido de liberação de ponta a ponta. A página de bloqueio cria o pedido (`CREATE_UNBLOCK_REQUEST`), o Ajudante recebe a mensagem com 15 min / 1 hora / Negar (sem "Permanente" até a T2), o broker do daemon (único leitor de `getUpdates`, offset por bot) lê o botão e, no mesmo `save` atômico, grava a decisão, a liberação temporária e o offset; o botão é respondido (`answerCallbackQuery`) e a mensagem editada. Só vale o chat e o usuário do Ajudante pareado; botão antigo não aprova pedido vencido; duplo toque não duplica a liberação. Limites: 1 pedido pendente por endereço, no máximo 3 pendentes e 2 min entre pedidos. A página consulta `GET /api/unblock-requests/:id` e mostra o código offline quando o Telegram falha.
- API local da página de bloqueio protegida: toda rota `/api/*` (exceto `/api/health`) exige o token de página da sessão (cabeçalho `X-MonBlock-Token`) e `Host` de loopback; sem isso responde `403`.
- Telegram T0b: pareamento do Ajudante por link (`INITIATE_PAIRING_LINK`): o app gera `t.me/<bot>?start=<código>` (uso único, 15 min); quem abrir o link em chat privado e apresentar o código vira o Ajudante e recebe o convite para definir a senha. Chat ID digitado continua como alternativa. Código errado, grupo e segunda tentativa são ignorados.
- Telegram T0: o app conecta o bot do Telegram (passo a passo do @BotFather + campo do token). O comando `SET_BOT_TOKEN` valida o formato, confere no `getMe` e guarda o token só no cofre do daemon; o estado público mostra apenas `bot: { configured, username }`. Com Ajudante pareado, trocar o bot exige a senha dele. Spec `docs/ai/specs/2026-11-06-telegram-gestao-envio-respostas-design.md`.

## [0.6.0] - 2026-11-06
### Adicionado
- Listas de categorias ampliadas: `adult` 6.397 domínios e 258 palavras-chave; `gambling` 408/113 (bets brasileiras incluídas); `games` 184/27; `proxy` 116/26; `dating` 82/27; `social` 105; `video` 103; `forums` 60; `shopping` 238/6; `news` 224/4; `search_unsafe` 25. Dados em `src/domain/lists/*.txt` (a ordem é a prioridade), gerados para TypeScript por `scripts/gen-lists.mjs`, que falha o build em domínio inválido, duplicado ou excluído. Spec `docs/ai/specs/2026-11-06-listas-de-categorias-ampliadas-design.md`, ADR-0009, RN-WEB-08 a 10 e `NOTICE` com as fontes e licenças.
- Camadas por prioridade: perfil dos navegadores com os 900 primeiros domínios do `adult` (limite documentado de 1000 do `URLBlocklist`), `/etc/hosts` com teto de 25 mil domínios (domínios do usuário primeiro) e vigia com a lista completa por índice de sufixo.
- IPC `monblock:get-categories` e `monblock:check-url`: a UI usa o catálogo do app como fonte única e o teste de endereço usa o mesmo motor do vigia.
- Testes: normalização/unicidade, exclusões de infra crítica, 82 frases pt-BR legítimas sem falso positivo, 41 frases-alvo, orçamentos de desempenho e limite do perfil.

### Alterado
- **Quem já tem o perfil dos navegadores instalado verá "Falta 1 passo" e precisa aprovar o perfil atualizado** (a lista do `adult` no perfil passou de 5 para 900 domínios).
- O motor de domínios usa busca por sufixo em `Set` (antes percorria a lista inteira por aba).
- `VERSION` e `package.json` alinhados em 0.6.0.

### Pendente
- Latência do mDNSResponder com ~8 mil domínios (16 mil linhas) não medida: exige root. Domínios curados pelos agentes não foram checados por DNS.

### Adicionado (anteriores)
- Página de bloqueio: logo da CCAT (Capycro Avectech), respiração etérea e automática (halo suave, com pausa e `prefers-reduced-motion`) e pedido de liberação ao Ajudante (15 min, 1 hora ou permanente + motivo, via Telegram, e campo de código que nunca libera por conta própria: `POST /api/unlock-code` responde `501`) que só diz "enviado" com a confirmação do servidor. `POST /api/unblock-requests` sem Ajudante ligado passou a responder `503` Problem Details ("Nada foi enviado") em vez de `202`.
- Tema **Capycro escuro** (marca à noite: verde-azulado mineral + terracota sobre carvão quente, com detalhes marrons nas bordas e rótulos; contraste AA/AAA) em `tokens.css`, no painel (opção "Capycro escuro") e como tema automático da página de bloqueio no modo escuro do sistema.
- Página de bloqueio refeita: dados reais da query (`domain`, `rule`, domínio em punycode), sem afirmações falsas, tema pelo sistema, saída segura em destaque. Spec `docs/ai/specs/2026-11-06-refino-pagina-de-bloqueio-design.md`.
- Spec do watcher fora do app Electron (futuro): `docs/ai/specs/2026-11-06-watcher-separado-design.md`.
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
