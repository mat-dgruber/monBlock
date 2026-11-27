# Plano: F3 do Windows — serviço e IPC (ADR-0016)

- **Data:** 2026-11-27
- **Status:** APROVADO (2026-11-27). `/plan-criticize`: 0/100.
- **Spec:** `docs/ai/specs/2026-11-25-correcao-suporte-windows-design.md` (v3) — itens **W2, W4, W21** (+ o mínimo do W3 para instalar nesta máquina)
- **ADR:** `docs/adrs/0016-servico-ipc-e-correcoes-do-suporte-windows.md` — aprovada (2026-11-27).
- **Depende de:** F2 (W1: daemon sobe como SYSTEM)
- **Fecha com:** P4 remoto (segunda máquina) — sem ela, a F3 fecha com o item marcado "não validado" no relatório.

## 1. Objetivo

Instalar o `monblockd` como serviço Windows real (WinSW, SYSTEM) nesta máquina e o app Electron (usuário comum, sem elevação) falar com ele pelo pipe, sem entregar segredos a um impostor. Ao fim desta fase dá para **usar o app de verdade** com Camadas 1 e 2 ativas.

Fora do escopo (F4): instalador Inno, `@electron/packager`, updater, desinstalação por tarefa agendada (W12), autostart, CI de pacote. Fora (F5): Camada 3.

## 1.1 Restrições

- Windows 11 x64 desta máquina como alvo de validação (Malwarebytes ativo, Defender passivo); sem assinatura Authenticode.
- Node 22 LTS para o SEA (o do S0); se o `node` local for 24, o build baixa/usa um Node 22 portátil com SHA-256 fixado ou aborta — a decisão fica no passo 3.1.
- O app roda via `npm run electron`, que hoje **quebra no Windows** (`cp`). Depende do `scripts/copy-assets.mjs` da sessão `ci/windows`; se ela ainda não tiver mergeado, a F3 traz o mesmo arquivo (conflito trivial).
- Protocolo IPC (linhas JSON) e comandos do daemon não mudam (spec §3).
- Latência: `GET_STATE` < 100 ms local; verificação W21 (helper PowerShell pontual) < 2 s, só antes de comandos com segredo.

## 2. Alternativas (já decididas na ADR-0016, D1/D2)

- Serviço: **WinSW v2.12.0** (validado no S0, P6/P9) vs NSSM (sem manutenção) vs tarefa agendada (não é serviço).
- IPC: **D2-A** (DACL padrão + `SetSecurityInfo` pelo daemon, validado no S0, P4: 30/30) vs D2-B (TCP + token, fallback) vs `readableAll` (abre para Everyone — descartado).
- Anti-impostura: **PPID do servidor == PID do serviço** (S0, P5) vs dono S-1-5-18 (o usuário comum não consegue consultar — descartado).

## 3. Passos

### 3.1 Build mínimo do daemon (parte do W3)
1. `scripts/build-daemon-sea.ps1`: mesmo bundle esbuild do `.sh` (CJS, `import.meta.url` constante) → `node --experimental-sea-config` → copiar `node.exe` → `npx postject@1.0.0-alpha.6 … --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2` (sem `--macho-segment-name`) → `monblockd.exe --selftest`.
2. Baixar WinSW v2.12.0 x64 para `build/windows/` com **SHA-256 fixado** `05b82d46…a0da` (confirmar com uma segunda fonte antes de fixar; divergência → aborta).
3. `packaging/windows/monblockd-service.xml` (W2): `id=monblockd`, `executable=%BASE%\monblockd.exe`, `onfailure restart 5 sec` ×3, `resetfailure 1 day`, `stoptimeout 10 sec`, `preshutdown true` + `preshutdownTimeout 15 sec`, log `roll-by-size` em `%ProgramData%\monBlock\logs`.

### 3.2 Instalação (W2)
1. `scripts/windows/install-service.ps1` reescrito: exige admin; copia `monblockd.exe`, `monblockd-service.exe` (WinSW renomeado), o XML, `design\` e `pipe-acl.ps1` para `%ProgramFiles%\monBlock`; cria `DATA_DIR` com ACL `SY:F BA:F` sem herança; `monblockd-service.exe install` + `start`; espera `Running` em ≤ 30 s.
2. `scripts/windows/uninstall-dev.ps1` (só dev, até o W12): `stop` + `uninstall` do serviço, `restoreSystemCleanState` equivalente (bloco do hosts, `icacls hosts /reset`, `reg delete` das subchaves gerenciadas), apagar `INSTALL_DIR` e `DATA_DIR`. **Usado para limpar esta máquina** ao fim do teste.
3. Pipe ocupado no boot (`EADDRINUSE`): o `tick` já rodou antes do IPC (Camadas 1/2 aplicadas); registrar, avisar o Ajudante (`notifyPartner` existente, best effort) e sair com código 2; o WinSW reinicia (máx. 3 em 1 dia).

### 3.3 DACL do pipe (W4, D2-A)
1. `packaging/windows/pipe-acl.ps1` (do spike `apply-dacl.ps1`): `Add-Type` com P/Invoke `CreateFile` no pipe + `SetSecurityInfo(SE_KERNEL_OBJECT, [uint32]0x80000004)` com a SDDL `D:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;GRGW;;;IU)(D;;GA;;;NU)`; imprime `{"ok":true}` e sai 0.
2. `ipc-server.ts`: no `win32`, depois do `listen`, `applyPipeDacl(pipeName)` com `spawnFn` injetável, timeout de 20 s. **Sucesso só com a linha `{"ok":true}`** — o achado do P8 mostrou que em CLM o PowerShell sai 0 sem imprimir nada, então código de saída sozinho não basta.
3. Falha → o pipe fica no DACL padrão (fail-closed: usuário comum só lê), `IpcServer.aclStatus = 'failed'`, e o `verifyApplied`/watchdog reporta drift `ipc:dacl` (aviso ao Ajudante pelo fluxo existente).
4. Testes: unitário com `spawnFn` falso (ok, saída vazia com código 0, código ≠ 0, timeout) e o drift `ipc:dacl`.

### 3.4 Anti-impostura (W21)
1. `src/main/pipe-server-check.ts`: `verifyPipeServer(pipeName, runFn)` roda um helper pontual (`powershell` com P/Invoke `GetNamedPipeServerProcessId`, do spike `owner-probe.ps1`) e compara `Win32_Process(serverPid).ParentProcessId` com `Win32_Service('monblockd').ProcessId`. Resultado em cache por conexão; refeito a cada reconexão e **depois** de abrir a conexão (janela de reuso de PID).
2. `DaemonClient.call`: comandos com segredo (`PAIR_PARTNER`, `SET_BOT_TOKEN`, `VERIFY_OFFLINE_TOKEN`, `VERIFY_RECOVERY_CODE`, desinstalação) exigem `verified === true` no `win32`; senão rejeita com Problem 503 "Serviço do monBlock não verificado". `GET_STATE` e demais seguem.
3. Em dev (`!app.isPackaged` + `MONBLOCK_SOCKET_PATH`), o gate pode ser desligado só por `MONBLOCK_DEV_SKIP_PIPE_CHECK=1`, ignorado em build empacotado.
4. Testes: gate por tipo de comando (win32 e não-win32), helper falhando → não verificado, PPID divergente → não verificado.

### 3.5 Teste real nesta máquina (o que o usuário pediu)
Com o app rodando de `npm run electron` (sem empacotar; o empacotamento é F4):
1. `build-daemon-sea.ps1` → `install-service.ps1` (UAC). `Get-Service monblockd` = `Running`; `whoami /groups` do daemon com `S-1-16-16384` (log).
2. App como usuário comum: `GET_STATE` 200; pareamento com o Ajudante (Telegram) **feito pelo usuário** — o token do bot e a senha são digitados por ele na UI, nunca por mim.
3. Escolher uma categoria de teste; conferir bloco no hosts real, `reg query`, Edge/Chrome com `ERR_BLOCKED_BY_ADMINISTRATOR` e a página de bloqueio em `127.0.0.1:49152`.
4. `taskkill /f /im monblockd.exe` → volta em ≤ 10 s; `Stop-Service` → `cleanShutdown` gravado; pipe impostor (usuário comum servindo `\\.\pipe\monblockd` com o serviço parado) → UI recusa o pareamento.
5. Limpeza: `uninstall-dev.ps1`; conferir hosts igual ao backup (hash), sem chaves gerenciadas, sem serviço, sem pastas.

## 4. Resiliência e borda

- WinSW mata a árvore ao parar: o daemon não pode ter filhos que precisem sobreviver (só o W12, na F4, via tarefa agendada).
- Janela de ~3,5 s entre `listen` e DACL: UI recebe `EPERM` e reconecta (o `DaemonClient` já tem reconexão).
- Helper `pipe-acl` bloqueado por CLM/WDAC: fail-closed + drift; a D2-B fica como plano de contingência (não implementada nesta fase — YAGNI até aparecer).
- Malwarebytes/Defender bloqueando `monblockd.exe` não assinado: registrar no relatório; assinatura é risco aceito (spec §3).
- **Pre-mortem — serviço em loop de crash** (ex.: ACL do W20 falhando): o WinSW reinicia 3× e para; a Camada 1 continua no hosts (arquivo), mas sem watchdog. Detecção: o app mostra "Proteção não verificada" (offline) e o log em `DATA_DIR\logs`. Rollback: `uninstall-dev.ps1`.
- **Pre-mortem — bloqueio exagerado no hosts real** (categoria errada derrubando sites de trabalho): o teste usa só uma categoria escolhida pelo usuário, e a limpeza é testada antes (passo 3.5.5 é ensaiado numa pasta de teste primeiro).
- Hosts real: backup do instalador em `DATA_DIR\hosts.monblock.bak` antes da primeira escrita; o `uninstall-dev.ps1` restaura e confere o hash, com timeout (lição do P10: o `Copy-Item` travou).

## 5. Segurança

- Segredos do Telegram só via UI pelo usuário; nada em arquivo de teste ou log (o `maskBotToken` existente).
- `pipe-acl.ps1` e WinSW em `%ProgramFiles%\monBlock` (herda ACL de admin); o helper roda com caminho absoluto, `-NoProfile -NonInteractive -ExecutionPolicy Bypass`.
- Downloads com hash fixado; divergência aborta o build.

## 6. Rollback

- Máquina: `uninstall-dev.ps1` (idempotente; pode rodar de novo).
- Código: `git revert` dos commits da F3; o caminho macOS/Linux não muda (gates por `win32`).

## 7. Pronto quando

- [ ] Testes unitários verdes; macOS/Linux sem regressão.
- [ ] Serviço `Running` como SYSTEM nesta máquina; app de usuário comum com `GET_STATE` 200.
- [ ] Bloqueio real (hosts + Edge/Chrome) e página de bloqueio funcionando.
- [ ] `taskkill` → volta; impostor → recusado; `cleanShutdown` no `Stop-Service`.
- [ ] Máquina limpa após o `uninstall-dev.ps1`.
- [ ] ADR-0016 marcada aprovada; relatório da F3 em `docs/ai/reports/`; P4 remoto registrado como pendente se não houver segunda máquina.
