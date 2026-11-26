# Especificação de Design: Correção do Suporte ao Windows (W1–W18)

**Data:** 2026-11-25
**Status:** APROVADA (2026-11-26) com as recomendações D1-A (WinSW), D2-A com spike e fallback D2-B, D3 (`@electron/packager` + Inno Setup 6) e D4 em 2 passos. `/plan-criticize`: 10/100. Próximo artefato: plano em `docs/ai/plans/`, por fase.
**Versão alvo:** `0.10.0` (MINOR: passa a suportar uma plataforma de verdade; sem quebra de contrato IPC no macOS/Linux)
**Base:** [relatório de revisão](../reports/2026-11-25-revisao-funcionalidade-windows.md) (branch `dev`, commit `e4033cf`)
**Artefatos:** esta spec em `docs/ai/specs/`; o plano de implementação de cada fase irá para `docs/ai/plans/`; os spikes (D2) para `docs/ai/reports/`.
**ADRs afetadas:** ADR-0013 e ADR-0015 (premissas que não valem na prática). Esta spec pede a **ADR-0016** (seção 5).

---

## 1. Contexto

A ADR-0015 diz que o Windows tem paridade com as 3 camadas de bloqueio, mas a revisão mostrou que o caminho Windows nunca rodou fora de mocks:

- o daemon sai no boot (`process.getuid` não existe);
- o `.exe` registrado com `sc.exe` não é um serviço de verdade (erro 1053);
- não existe build do daemon nem do app para Windows;
- o named pipe nasce com o DACL padrão (Everyone só lê), então a UI não consegue mandar comandos;
- a Camada 3 (watcher) não está ligada, e o script dela tem um bug fatal com `$pid`.

Duas premissas da ADR-0015 / ADR-0013 são **falsas** e precisam ser corrigidas pela ADR-0016:

1. "Named Pipe com DACL restrita": o `node:net` **não** permite definir DACL ao criar o pipe.
2. "O daemon roda como Serviço Windows nativo": um executável SEA do Node não implementa o protocolo do SCM.

## 2. Objetivos

- Instalar, iniciar e manter o `monblockd` como SYSTEM no Windows 10 22H2+ e no Windows 11 (x64).
- Permitir que o app Electron (usuário comum, sem elevação) converse com o daemon por IPC.
- Fazer as Camadas 1 (hosts), 2 (políticas do Registro) e 3 (watcher) funcionarem e serem verificáveis.
- Gerar instalador, atualização e desinstalação para Windows.
- Ter um job `windows-latest` no CI que exercite o caminho real, não só mocks.

## 3. Não objetivos

- Windows ARM64, Windows Server, Windows 7/8.
- Assinatura Authenticode / EV nesta entrega (fica registrada como risco: avisos do SmartScreen).
- Bloqueio de apps (MOD-05) no Windows.
- Ligar o watcher no Linux. É um achado lateral (`main.ts:691` também deixa o Linux de fora) e deve virar outra spec.
- Mudar o protocolo de linhas JSON do IPC ou os comandos do daemon.

## 4. Fases e ordem

| Fase | Itens | Depende de | Testável só com mocks? |
|------|-------|-----------|------------------------|
| F1 — Correções locais | W5, W6, W9, W10, W13, W14, W15, W17, W11a | — | Sim |
| F2 — Entry multiplataforma | W1, W12 | F1 | Sim (com DI de `platform`/`execFn`) |
| F3 — Serviço + IPC (ADR-0016) | W2, W4 | F2 + D1, D2 aprovadas | Não: precisa de Windows real |
| F4 — Build, instalador, update e CI | W3, W16, W18 | F3 + D3 | Não |
| F5 — Watcher completo | W7, W8, W11b | F1 + D4 | Parcial |

Cada fase gera commits atômicos (`fix(windows): …`, `feat(windows): …`) e uma entrada no `CHANGELOG.md`. As fases F3–F5 só começam depois da ADR-0016 aprovada.

## 5. Decisões em aberto (precisam de resposta antes de F3/F4/F5)

### D1 — Como o daemon roda como serviço (W2)

| Opção | Prós | Contras |
|-------|------|---------|
| **A. WinSW (recomendada)** — `monblockd-service.exe` + XML ao lado do `monblockd.exe` | Serviço real no SCM, com recuperação, `stop`/`start`, logs com rotação; binário único (licença MIT) | Mais um binário de terceiro no pacote (supply chain: fixar versão + SHA-256) |
| B. NSSM | Maduro, simples | Sem manutenção ativa desde 2017 |
| C. Tarefa Agendada como SYSTEM no boot | Nativo, sem binário extra | Não é serviço: sem semântica de parada, recuperação mais fraca, `onUninstalled`/`SIGTERM` diferentes |
| D. Addon N-API com `StartServiceCtrlDispatcher` | Sem binário de terceiro | Compilação nativa por versão do Node; contradiz "zero dependências nativas" da ADR-0015 |

### D2 — Transporte IPC com controle de acesso (W4)

| Opção | Prós | Contras |
|-------|------|---------|
| **A. Named pipe + DACL ajustada logo após o `listen` (recomendada se o spike passar)** — helper PowerShell/.NET aplica `PipeSecurity` com `SY:F`, `BA:F`, `IU:RW` | Mantém o pipe e o protocolo; paridade com o `0660 root:monblock` | Precisa de **spike**: o libuv cria várias instâncias do pipe e não se sabe se a DACL vale para todas. Se o spike falhar, cai para B |
| B. TCP `127.0.0.1:<porta>` + token de sessão em `%ProgramData%\monBlock\run\ipc.token` (ACL `SY:F`, `BA:F`, `IU:R`) | Sem código nativo; testável em qualquer SO | Qualquer processo local de usuário interativo lê o token (equivale ao grupo `monblock`). Exige recusar requisições HTTP (página web fazendo POST para localhost): primeira linha precisa ser o handshake `{"auth":…}`; linhas que começam com verbo HTTP derrubam a conexão |
| C. Addon nativo que cria o pipe com `SECURITY_ATTRIBUTES` | Correto por construção | Compilação nativa (mesmo problema da D1-D) |

Em qualquer opção, a autorização real continua sendo a credencial do Ajudante validada no daemon (a UI não é confiável). O transporte é só defesa em profundidade.

### D3 — Empacotamento do Electron e instalador (W3)

- **Recomendada:** `@electron/packager` (dev dependency, gera a pasta do app) + **Inno Setup 6** (`packaging/windows/monblock.iss`) para o instalador único que coloca app, daemon, WinSW e design, registra o serviço e cria o atalho com AppUserModelID.
- Alternativa: `electron-builder` (NSIS). Faz tudo num lugar só, mas é uma dependência maior e o fluxo de instalar um serviço como SYSTEM fica escondido em scripts NSIS.
- A dependência nova entra no ADR-0016.

### D4 — Ler a URL da aba ativa no Windows (W7, W8, W11b)

- **Recomendada, em 2 passos:**
  1. (F1) Avaliar só o **título** quando não há URL (o `evaluateUrlAndTitle` já suporta isso), num processo PowerShell **persistente**.
  2. (F5) Ler a barra de endereço via **UI Automation** (`System.Windows.Automation`, `ValuePattern`) no mesmo processo persistente, e redirecionar escrevendo a URL bloqueada nessa barra (`SetValue` + Enter).
- Alternativa: extensão de navegador forçada por política (`ExtensionInstallForcelist`). É a mais confiável, mas é um produto à parte (publicação na loja, manutenção). Fica fora de escopo.

---

## 6. Requisitos por item

Formato: **Problema → Mudança → Critérios de aceite (BDD) → Testes**. Os caminhos de arquivo valem para o commit `e4033cf`.

### 🔴 Bloqueadores

#### W1 — Detecção de privilégio no Windows (`src/daemon/entry.ts:280`)

- **Problema:** `process.getuid` não existe no Windows. O daemon conclui que não tem privilégio e sai com `exit(1)`.
- **Mudança:** criar `isPrivileged(platform, execFn)`:
  - `darwin`/`linux`: `getuid() === 0`, como hoje;
  - `win32`: `true` se `whoami /groups` contiver `S-1-16-16384` (nível de integridade System) ou `S-1-16-12288` (High, admin elevado).
  - Usar o resultado em `main()`, `flushDns`, `checkBrowserProfile` e `onUninstalled`.
- **Aceite:**
  - *Dado* o daemon rodando como SYSTEM no Windows, *quando* `main()` executa, *então* ele sobe sem `MONBLOCK_DEV_ROOT_DIR` e com `flushDns=true`.
  - *Dado* um usuário comum sem a variável de dev, *então* o processo sai com código 1 e uma mensagem clara.
- **Testes:** unitário de `isPrivileged` com `execFn` falso (saída de SYSTEM, admin elevado, usuário comum e erro do comando → `false`).

#### W2 — Daemon como serviço do Windows real (`scripts/windows/install-service.ps1`)

- **Problema:** o `sc.exe create` aponta para um `.exe` que não fala o protocolo do SCM.
- **Mudança (D1-A):**
  - `packaging/windows/monblockd-service.xml` (WinSW): `id=monblockd`, executável `monblockd.exe`, `onfailure restart 5 s` três vezes, `resetfailure 1 d`, `stoptimeout 10 s`, log com rotação em `%ProgramData%\monBlock\logs`.
  - O `install-service.ps1` passa a usar `monblockd-service.exe install|start`. Remover o `sc.exe create`.
  - O daemon trata o sinal de parada do WinSW (ele manda Ctrl+C → `SIGINT`), o que já existe em `main()`.
- **Aceite:**
  - *Dado* o pacote instalado, *quando* o Windows reinicia, *então* `Get-Service monblockd` mostra `Running` em até 60 s.
  - *Dado* o processo morto (`taskkill /f`), *então* ele volta em até 10 s.
  - *Dado* `Stop-Service`, *então* o daemon grava o desligamento limpo e **não** dispara o aviso de inatividade no próximo boot.
- **Testes:** E2E no `windows-latest` (W18).

#### W3 — Build do daemon e do app para Windows (`scripts/build-daemon-sea.sh`, `scripts/build-windows-setup.ps1`)

- **Problema:** o SEA é só macOS (`--macho-segment-name`) e o `.ps1` não gera nada instalável.
- **Mudança (D3):**
  - `scripts/build-daemon-sea.ps1`: esbuild (igual ao `.sh`) → `node --experimental-sea-config` → copiar `node.exe` → remover a assinatura (`signtool remove /s`, se existir) → `postject` sem `--macho-segment-name`.
  - Fixar as versões de `postject` e Node (iguais ao `.sh`).
  - `@electron/packager` para `win32-x64`.
  - `packaging/windows/monblock.iss`: instala em `%ProgramFiles%\monBlock`, coloca daemon, WinSW e `design\`, executa `install-service.ps1`, cria o atalho com `AppUserModelID=com.ccat.monblock` e registra o desinstalador (W12).
  - O `build-windows-setup.ps1` orquestra tudo e gera `monBlock-Setup-<versão>.exe` + `.sha256`.
- **Aceite:**
  - *Dado* `pwsh scripts/build-windows-setup.ps1` num runner Windows limpo, *então* saem `monBlock-Setup-x.y.z.exe` e o `.sha256`, com o hash conferindo.
- **Testes:** etapa de build no CI (W18).

#### W4 — IPC acessível ao usuário, com controle de acesso (`src/daemon/ipc-server.ts`, `src/main/daemon-client.ts`)

- **Problema:** o pipe nasce com o DACL padrão (Everyone só lê). O Electron sem elevação não consegue escrever.
- **Mudança (D2):**
  - **Spike primeiro (≤ 1 dia, em Windows real):** criar o pipe pelo `node:net`, aplicar `PipeSecurity` por um helper e validar com 10 conexões simultâneas de um usuário comum. Resultado registrado na ADR-0016.
  - Se D2-A passar: aplicar a DACL logo após o `listen` e **reaplicar** a cada `tick` (o libuv recria instâncias). Fail-closed: se a DACL falhar, o pipe fecha.
  - Se cair para D2-B: TCP loopback com handshake por token (rotacionado a cada boot e comparado em tempo constante, `crypto.timingSafeEqual`) e recusa de linhas HTTP. O `daemon-client` lê o token.
- **Aceite:**
  - *Dado* um usuário comum sem elevação, *quando* o app abre, *então* `GET_STATE` responde 200.
  - *Dado* uma página web fazendo `fetch('http://127.0.0.1:<porta>', {method:'POST', body:…})`, *então* a conexão cai sem executar comando (só D2-B).
  - *Dado* um processo sem acesso à ACL, *então* a conexão é negada.
- **Testes:**
  - unitários do handshake: token errado, token ausente, linha HTTP e linha longa demais;
  - E2E Windows com usuário comum criado no runner (`net user`).

#### W5 — Ligar o watcher no Windows (`src/main/main.ts:691`)

- **Problema:** o loop do watcher só existe para `darwin`.
- **Mudança:**
  - Extrair o loop (`watchTick` com guarda de concorrência e backoff) para `startBrowserWatcherLoop(watcher, call)`.
  - Criar o watcher por plataforma: `darwin` → `MacOSBrowserWatcher`, `win32` → `WindowsBrowserWatcher`.
  - O Linux fica fora (achado lateral).
- **Aceite:**
  - *Dado* `process.platform === 'win32'`, *quando* o app inicia, *então* `WindowsBrowserWatcher.inspectOnce` é chamado periodicamente.
  - *Dado* um grant `*` ativo, *então* `inspectOnce` não é chamado, como no macOS.
- **Testes:** unitário de `startBrowserWatcherLoop` com timers falsos (concorrência, backoff acima de 800 ms, grant curinga).

#### W6 — Bug do `$pid` no PowerShell (`src/enforcers/windows-watcher.ts:85-86`)

- **Problema:** `$pid` é a variável automática `$PID`, somente leitura. O script acaba sempre consultando o próprio PowerShell.
- **Mudança:** renomear para `$procId`.
- **Aceite:** *Dado* o Chrome em primeiro plano, *então* `getActiveTab()` retorna `browser: 'chrome'`.
- **Testes:**
  - unitário garantindo que o script não usa nenhuma variável automática (`/\$pid\b/i`, `$host`, `$input`, `$args`) como destino de atribuição;
  - verificação manual / E2E no Windows.

### 🟠 Altos

#### W7 — Avaliar pelo título quando não há URL (`windows-watcher.ts:242-245`)

- **Problema:** o watcher sai com `blocked:false` quando a "URL" (que na verdade é o título da janela) não é uma URL.
- **Mudança (F1, D4 passo 1):**
  - Remover o retorno antecipado. Quando não houver URL, chamar `evaluateUrlAndTitle({ url: '', title })`.
  - Tirar do título o sufixo do navegador (` - Google Chrome`, ` — Mozilla Firefox`, ` - Microsoft Edge`, etc.) antes de avaliar.
- **Mudança (F5, D4 passo 2):** ler a URL real por UI Automation. A avaliação por título continua como fallback.
- **Aceite:**
  - *Dado* o título "Pornhub - Google Chrome" com a categoria adulto ativa, *então* `blocked:true`.
  - *Dado* o título "Notícias sobre pornografia infantil — combate" (frases legítimas), *então* não bloqueia. Reaproveitar `tests/domain/fixtures/frases-legitimas.tsv`.
- **Testes:** unitário com adapter falso nos dois cenários + fixtures existentes.

#### W8 — PowerShell persistente (`windows-watcher.ts:95`)

- **Problema:** um `powershell` + `Add-Type` por ciclo custa centenas de ms de CPU.
- **Mudança:**
  - Um único processo `powershell -NoProfile -NonInteractive -Command -`, iniciado sob demanda, com o `Add-Type` compilado uma vez.
  - Protocolo por linha: comando `probe` → resposta JSON `{proc,title,url?}`.
  - Timeout de 2 s por probe; se estourar, mata e recria o processo, com backoff exponencial e jitter (até 30 s).
  - Encerrar junto com o `will-quit`.
- **Aceite:**
  - *Dado* 100 ciclos, *então* só 1 processo PowerShell foi criado.
  - *Dado* o processo travado, *então* ele é recriado e o watcher não fica preso.
- **Testes:** unitário com `spawnFn` falso (reuso, timeout com recriação, backoff, encerramento).

#### W9 — Valores antigos no Registro (`windows-platform-enforcer.ts:67-120`)

- **Problema:** o `reg import` só mescla, então valores numerados antigos continuam valendo. Um `URLAllowlist` velho pode manter um site liberado depois que o grant expira.
- **Mudança:** no manifesto, antes de cada subchave de lista, emitir uma linha de exclusão:
  - `[-<root>\URLBlocklist]` e `[-<root>\URLAllowlist]` para cada chave Chromium;
  - `[-HKLM\...\Firefox\WebsiteFilter]` para o Firefox.
- **Risco aceito:** políticas corporativas que já existam nessas subchaves são sobrescritas. Isso já acontece hoje, só que de forma parcial. Documentar na ADR-0016.
- **Aceite:**
  - *Dado* uma allowlist com 3 itens que cai para 1, *quando* o manifesto é importado, *então* só o valor `"1"` existe na subchave.
- **Testes:** unitário verificando que cada linha `[-…]` vem antes da recriação da chave; E2E com `reg query` no Windows.

#### W10 — Falhas silenciosas na imposição (`windows-platform-enforcer.ts:54-62`)

- **Problema:** o executor padrão engole todos os erros, e o `verifyApplied` só olha o arquivo `.reg` no disco.
- **Mudança:**
  - O executor padrão **lança** o erro quando `process.platform === 'win32'` (fora do Windows continua sem efeito, para dev e CI).
  - `applyWebRules` guarda `lastApplyFailures: string[]` (por exemplo `registry:import`, `hosts:acl`).
  - `verifyApplied` inclui essas falhas no drift.
  - O watchdog do daemon já reaplica e avisa o Ajudante quando há drift.
- **Aceite:**
  - *Dado* um `reg import` com código ≠ 0, *então* o `tick` registra o erro e o `verifyApplied` devolve `registry:import`.
- **Testes:** unitário com `commandExecutor` que falha.

#### W11 — Redirecionamento quebrado (`windows-watcher.ts:142`)

- **W11a (F1):** a URL é corrompida quando tem `&`.
  - **Mudança:** trocar `cmd.exe /c start` por `execFile('explorer.exe', [url])`, que não passa pelo parser do `cmd`.
  - **Aceite:** *dada* uma URL com `&reason=…&rule=…`, *então* o argumento entregue é exatamente a URL, sem truncar.
  - **Teste:** unitário do argv.
- **W11b (F5):** abrir uma aba nova não redireciona a aba atual.
  - **Mudança:** com UI Automation, escrever a URL bloqueada na barra de endereço da janela em primeiro plano e confirmar. O `explorer.exe` fica como fallback.
  - **Aceite:** *dada* uma aba bloqueada, *então* a mesma aba passa a mostrar `127.0.0.1:49152/blocked` (E2E manual com checklist).

### 🟡 Médios e baixos

#### W12 — Desinstalação no Windows (`src/daemon/entry.ts:296`)

- **Problema:** `spawn('/bin/sh')` dá `ENOENT` sem listener de `error`, e a exceção derruba o daemon.
- **Mudança:**
  - Criar `packaging/windows/uninstall.ps1`: para e remove o serviço via WinSW, restaura o hosts (o daemon já limpou), apaga as chaves do Registro e o `%ProgramData%\monBlock`, e chama o desinstalador do Inno em modo silencioso para o app.
  - No `win32`: `spawn('powershell', ['-NoProfile','-ExecutionPolicy','Bypass','-File', uninstall.ps1], { detached: true, stdio: 'ignore' })`.
  - Em todas as plataformas: adicionar `.on('error', log)`.
- **Aceite:**
  - *Dada* uma desinstalação autorizada pelo Ajudante, *então* em até 30 s não sobra serviço, chaves `monBlock` nem bloco no hosts, e o daemon não registra exceção não tratada.
- **Testes:** unitário da escolha do comando por plataforma; E2E Windows.

#### W13 — Ícone da bandeja invisível (`src/main/main.ts:682`)

- **Problema:** `nativeImage.createEmpty()` no Windows deixa um espaço vazio na bandeja.
- **Mudança:** usar o mesmo PNG do escudo, sem `setTemplateImage`, redimensionado para 16×16 (e 32×32 em telas com DPI alto).
- **Aceite:** *Dado* o Windows, *então* o ícone da bandeja não está vazio (`!trayIcon.isEmpty()`).
- **Testes:** unitário da função de escolha do ícone por plataforma.

#### W14 — Notificações do Windows (`src/main/main.ts`)

- **Mudança:** chamar `app.setAppUserModelId('com.ccat.monblock')` antes do `ready` quando for `win32`. O valor precisa ser igual ao do atalho do Inno (W3).
- **Aceite:** *Dado* o app instalado, *quando* chega uma notificação de desbloqueio, *então* aparece um toast com o nome "monBlock".
- **Testes:** unitário verificando a chamada no `win32`; validação manual no instalado.

#### W15 — Caminhos fixos em `C:` (`src/daemon/entry.ts:43-53`)

- **Mudança:**
  - No `win32` sem `rootDir`: usar `process.env.ProgramData` (padrão `C:\ProgramData`) e `process.env.SystemRoot` (padrão `C:\Windows`) com `path.win32.join`.
  - Com `rootDir` (dev): manter o prefixo.
- **Aceite:** *Dado* `ProgramData=D:\PD`, *então* o `appSupportDir` fica `D:\PD\monBlock`.
- **Testes:** unitário de `resolveLayout` com `env` injetado.

#### W16 — Atualização no Windows (`src/main/updater.ts:177`)

- **Mudança:**
  - Escolher o asset por plataforma: `.pkg` no `darwin`, `monBlock-Setup-*.exe` no `win32`.
  - Manter a verificação SHA-256 fail-closed (ADR-0012).
  - Abrir o instalador com `shell.openPath`.
  - Renomear os campos `pkgUrl`/`pkgPath` para `installerUrl`/`installerPath`, mantendo aliases por um ciclo, já que o renderer usa esses campos.
- **Aceite:**
  - *Dada* uma release com `.exe` e `.sha256`, *então* o download no Windows valida o hash e abre o instalador.
  - *Dado* um hash ausente, *então* recusa.
- **Testes:** estender `tests/main/updater.test.ts` com `platform` injetado.

#### W17 — Codificação do `.reg` (`windows-platform-enforcer.ts:199`)

- **Mudança:** gravar o manifesto em UTF-16LE com BOM (`'\ufeff' + text`, `Buffer.from(…, 'utf16le')`). O `verifyApplied` compara decodificando da mesma forma.
- **Aceite:** *Dado* um domínio IDN (`exemplo-ç.com`), *então* o valor no Registro fica íntegro.
- **Testes:** unitário dos bytes iniciais `FF FE` e do roundtrip.

#### W18 — CI no Windows (`.github/workflows/ci.yml`)

- **Mudança:** criar o job `windows-package` em `windows-latest`:
  1. `npm ci`, `typecheck`, `npm test`;
  2. `pwsh scripts/build-windows-setup.ps1`;
  3. instalação silenciosa (`/VERYSILENT`);
  4. E2E: serviço `Running`; `GET_STATE` como usuário comum; hosts com o bloco; `reg query` das políticas; matar o processo e ver o serviço voltar; desinstalação limpa;
  5. upload do instalador como artifact (retenção de 7 dias).
- **Aceite:** o job fica verde num PR e é obrigatório para merge na `main`.

---

## 7. Segurança (Zero-Trust)

- O IPC (W4) continua não confiável: toda mutação passa pela credencial do Ajudante. O token da D2-B é só transporte.
- Tokens são comparados com `crypto.timingSafeEqual` e nunca aparecem em log.
- Erros de handshake/transporte do IPC (W4) respondem com o `buildProblem` que já existe (Problem Details, RFC 9457: `type`, `title`, `status`, `detail`, `instance`) antes de fechar a conexão, sem stack trace.
- Binários de terceiros (WinSW, `postject`, Inno) ficam com versão fixa e SHA-256 verificado no build (supply chain).
- O helper PowerShell (W8) recebe só comandos fixos (`probe`, `redirect <url>`). A URL de redirecionamento é validada contra `http://127.0.0.1:49152/blocked` antes de sair do Node, como já acontece hoje.
- Zero PII: o título e a URL da janela não vão para log. Hoje só o domínio aparece no `console.log` do bloqueio, e isso continua assim.

## 8. Riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| A DACL do pipe não vale para todas as instâncias do libuv (D2-A) | Spike antes; fallback para D2-B já desenhado |
| Windows Defender marca a alteração do hosts como `HostsFileHijack` | Testar no CI com o Defender ativo; documentar exclusão; não bloquear domínios da Microsoft (somar à `CRITICAL_INFRA_ALLOWLIST` se aparecer) |
| SmartScreen bloqueia o instalador sem assinatura | Fora do escopo; registrado como dívida, a ser tratado com certificado em outra spec |
| UI Automation muda entre versões de navegador (F5) | Fallback para título + `explorer.exe`; testes manuais por navegador no checklist de release |
| `rename` do hosts com `EPERM`/`EBUSY` (arquivo aberto por antivírus) | Já existe retry implícito pelo watchdog de 60 s; registrar em `lastApplyFailures` (W10) |
| Admin local apaga o serviço ou as chaves | Mesmo modelo do macOS/Linux: o drift é detectado e o Ajudante é avisado; o produto não promete resistir a admin |

## 9. Rollback

- F1/F2: `git revert` dos commits da fase; nada persiste fora do repositório.
- F3/F4: o instalador anterior não existe (o Windows nunca funcionou), então o rollback é desinstalar (`uninstall.ps1`) e voltar o pacote para a versão anterior. A desinstalação limpa é critério de aceite do W12/W18.
- Registro e hosts: o `restoreSystemCleanState` + o backup `.monblock.bak` cobrem.

## 10. Definição de pronto

- [ ] Todos os critérios de aceite W1–W18 verdes (unitários + E2E Windows no CI).
- [ ] `npm run typecheck` e `npm test` verdes nas 3 plataformas.
- [ ] ADR-0016 aprovada, corrigindo as premissas da ADR-0013/0015.
- [ ] `CHANGELOG.md` e `VERSION` → `0.10.0`.
- [ ] `docs/domains/` atualizado onde o comportamento por plataforma mudou.
- [ ] `graphify update .` executado.
