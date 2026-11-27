# Especificação de Design: Correção do Suporte ao Windows (W1–W21)

**Data:** 2026-11-25 · **Revisão v2:** 2026-11-27
**Status:** APROVADA v2 (2026-11-27). Incorpora a auditoria goldfish-critic (que reprovou a v1 para F3–F5) e as respostas da sabatina. Scanner `/plan-criticize`: 0/100. Próximo artefato: plano do S0 em `docs/ai/plans/`.
**Versão alvo:** `0.10.0` (MINOR: passa a suportar uma plataforma de verdade; sem quebra de contrato IPC no macOS/Linux)
**Base:** [relatório de revisão](../reports/2026-11-25-revisao-funcionalidade-windows.md) (branch `dev`, commit `e4033cf`)
**Artefatos:** esta spec fica em `docs/ai/specs/`. O plano de cada fase vai para `docs/ai/plans/`. O spike (S0) vai para `docs/ai/reports/`.
**ADRs afetadas:** a ADR-0013 e a ADR-0015 têm premissas falsas. Esta spec pede a **ADR-0016** (seção 5).

---

## 0. Glossário

- **Ajudante:** a pessoa de confiança pareada pelo Telegram. A UI envia pelo IPC a **senha do Ajudante** (`PAIR_PARTNER`, `SET_BOT_TOKEN.currentPartnerPassword`) e códigos de desafio/emergência (`VERIFY_OFFLINE_TOKEN`, `VERIFY_RECOVERY_CODE`) **em claro**. Quem escuta o IPC captura esses segredos.
- **Camadas:**
  - Camada 1: arquivo `hosts`.
  - Camada 2: políticas de navegador no Registro (`HKLM\SOFTWARE\Policies`).
  - Camada 3: watcher de abas no app Electron.
- **Grant:** liberação temporária (`temporaryGrants`). O grant `*` libera tudo.
- **`cleanShutdown`:** marca gravada na parada limpa (`monblockd.ts:489,512`). Sem essa marca, o próximo boot avisa o Ajudante sobre inatividade.
- **`CRITICAL_INFRA_ALLOWLIST`:** domínios que nunca vão para o hosts (`hosts-enforcer.ts`).
- **`buildProblem`:** gerador de Problem Details (RFC 9457) do daemon.
- **`INSTALL_DIR` (Windows):** `%ProgramFiles%\monBlock`. É o equivalente do `HELPER_DIR` do macOS e guarda `monblockd.exe`, WinSW, `design\` e `uninstall.ps1`.
- **`DATA_DIR` (Windows):** `%ProgramData%\monBlock`.

## 1. Contexto

A ADR-0015 diz que o Windows tem paridade com as 3 camadas, mas o caminho Windows nunca rodou fora de mocks:

- o daemon sai no boot (`process.getuid` não existe);
- o `.exe` registrado com `sc.exe` não é serviço (erro 1053);
- não há build do daemon nem do app;
- o named pipe nasce com o DACL padrão (Everyone só lê);
- a Camada 3 não está ligada e o script dela tem um bug fatal com `$pid`;
- **provavelmente a Camada 2 não importa nada**, porque o `.reg` usa a abreviação `HKLM\`, e o formato `.reg` exige `HKEY_LOCAL_MACHINE\` (a confirmar no S0).

Duas premissas da ADR-0015 / ADR-0013 são falsas e serão corrigidas pela ADR-0016:

1. "O daemon roda como Serviço Windows nativo": um SEA do Node não implementa o protocolo do SCM.
2. "Pipe com DACL restrita a Administradores e SYSTEM": nenhum código aplica DACL. O mais perto que o `node:net` oferece é `listen({ readableAll, writableAll })`, que abre o pipe para Everyone.

## 2. Objetivos

- Instalar, iniciar e manter o `monblockd` como SYSTEM no Windows 10 22H2+ e no Windows 11 (x64).
- Fazer o app Electron (usuário comum, sem elevação) conversar com o daemon, **sem entregar segredos a um impostor**.
- Fazer as Camadas 1, 2 e 3 funcionarem e serem verificáveis, inclusive com detecção de remoção do Registro.
- Gerar instalador, atualização e desinstalação. A desinstalação só acontece pelo fluxo autorizado pelo Ajudante.
- Ter o job `windows-latest` no CI exercitando o caminho real.

## 3. Não objetivos

- Windows ARM64, Server, 7/8.
- Assinatura Authenticode (fica como risco: SmartScreen).
- Bloqueio de apps (MOD-05) no Windows.
- Watcher no Linux. É um achado lateral (`main.ts:691`) e terá spec própria.
- Mudar o protocolo de linhas JSON ou os comandos do daemon.
- Resistir a um administrador determinado. O produto dificulta e **detecta** (drift → Ajudante), mas não impede (ver §8).

## 4. Fases e ordem (dependências reais)

| Fase | Itens | Depende de | Precisa de Windows real? |
|------|-------|-----------|------------------------|
| **S0 — Spike** (≤ 2 dias) | Validar premissas: `.reg` com `HKLM` × `HKEY_LOCAL_MACHINE`; `listen({readableAll, writableAll})` + ACE; descritor do pipe por instância; WinSW e árvore de processos; `explorer.exe`/`shell.openExternal`; UTF-8 × UTF-16LE no `reg import`; verificação do dono do pipe pelo cliente (W21) | — | Sim |
| F1 — Camadas 1/2 e correções locais | W9 (+ prefixo `HKEY_LOCAL_MACHINE`), W10, W13, W14, W15, W17 (conforme S0) | S0 | Não (mocks), com validação no S0 |
| F2 — Entry multiplataforma | W1, W20 | F1 | Não |
| F3 — Serviço + IPC (ADR-0016) | W2, W4, W21 | F2 + S0 | Sim |
| F4 — Build, instalador, update, desinstalação, autostart, CI | W3, W12, W16, W18, W19 | F3 | Sim |
| F5 — Camada 3 completa | W5 + W6 + W7 + W8 + W11a (juntos), depois W11b | F3 (o `GET_STATE` precisa do IPC) | Parcial |

Regra: **o W5 só liga o watcher junto com o W8** (helper persistente). Até lá a Camada 3 fica desligada no Windows, sem custo de CPU.

Cada fase gera commits atômicos e uma entrada no `CHANGELOG.md`. F3–F5 só começam com a ADR-0016 aprovada.

### Critério de saída do S0

O S0 sai com um relatório em `docs/ai/reports/`. Cada premissa recebe **PASSOU** ou **FALHOU**, com o comando e a saída como evidência.

O critério binário do IPC é: com o pipe criado e um usuário comum sem elevação, 10 conexões simultâneas fazem `GET_STATE` com sucesso; um logon de rede (SMB / `\\host\pipe\monblockd`) é **negado**.

## 5. Decisões (ADR-0016)

### D1 — Serviço: **WinSW v2.12.0** (estável, MIT), versão e SHA-256 fixados no build

- O WinSW envia Ctrl+C. O Node recebe como `SIGINT`, que já é tratado em `entry.ts:306`.
- XML com `<preshutdown>true</preshutdown>` e `<preshutdownTimeout>` para gravar o `cleanShutdown` no desligamento do Windows (a parada comum tem cerca de 5 s).
- `<stoptimeout>10 sec</stoptimeout>`.
- Alternativas descartadas:
  - NSSM: sem manutenção.
  - Tarefa agendada: não é serviço.
  - Addon N-API: compilação nativa.

### D2 — IPC: named pipe; o S0 escolhe entre 2 variantes

- **D2-A (preferida):** `server.listen({ path, readableAll: true, writableAll: true })`. O libuv aplica `uv_pipe_chmod` no descritor do pipe.
  - Isso abre para Everyone, inclusive logons de rede. Então o S0 precisa provar que um acesso remoto é negado: `PIPE_REJECT_REMOTE_CLIENTS` é o padrão do libuv recente, e é isso que o S0 confirma.
  - Se o descritor valer para todas as instâncias, **não há reaplicação periódica** (YAGNI).
- **D2-B (fallback, se D2-A falhar no S0):** TCP `127.0.0.1` + handshake por token.
  - Token em `DATA_DIR\run\ipc.token`, ACL `SY:F BA:F IU:R`, rotacionado a cada boot e comparado com `crypto.timingSafeEqual`.
  - **O servidor se prova primeiro** (W21).
  - Linhas que começam com verbo HTTP derrubam a conexão.
  - Limite assumido: o token não é controle de acesso; qualquer usuário interativo, inclusive outra conta com Fast User Switching, consegue lê-lo.
- **Em ambas as variantes:** o transporte é defesa em profundidade. A autorização real é a credencial do Ajudante validada no daemon. A anti-impostura do cliente fica no W21.

### D3 — Empacotamento: `@electron/packager` + Inno Setup 6

- `PrivilegesRequired=admin`.
- **`Uninstallable=no`**: sem entrada em "Aplicativos > Desinstalar". A remoção acontece só pela desinstalação autorizada pelo Ajudante (W12).
- `PrepareToInstall` para o serviço antes de um upgrade.
- AppUserModelID `com.ccat.monblock`.
- Autostart do app (W19).
- A versão do Node fica fixada em `package.json#engines` e `.nvmrc`. O `.sh` atual usa o `node` do `PATH`; os dois scripts passam a falhar se a versão divergir.

### D4 — Camada 3: helper PowerShell persistente + UI Automation

- **Passo 1 (F5):** um processo persistente lê o processo e o título da janela em primeiro plano (`GetForegroundWindow` + `GetWindowText`). O título limpo vai para avaliação.
- **Passo 2 (F5, W11b):** UI Automation para a URL real e o redirecionamento.
- Extensão forçada por política fica fora de escopo.

---

## 6. Requisitos por item

Formato: **Problema → Mudança → Aceite (BDD) → Testes**. Os caminhos valem para o commit `e4033cf`.

### 🔴 Bloqueadores

#### W1 — Detecção de privilégio (`src/daemon/entry.ts:280`)

- **Mudança:** criar `isPrivileged(platform = process.platform, execFn = execFileSync): boolean`, síncrona.
  - `darwin`/`linux`: `getuid() === 0`.
  - `win32`: `true` se a saída de `%SystemRoot%\System32\whoami.exe /groups` (caminho absoluto) contiver `S-1-16-16384` (System) ou `S-1-16-12288` (High). Qualquer erro → `false`.
  - Usar em `main()`, `flushDns` e `onUninstalled`.
  - **`checkBrowserProfile` continua só em `darwin`**: ele chama o `profiles` do macOS e no Windows acusaria drift falso.
- **Aceite:**
  - *Dado* o daemon rodando como SYSTEM, *então* ele sobe sem `MONBLOCK_DEV_ROOT_DIR`, com `flushDns=true` e `checkBrowserProfile` indefinido.
  - *Dado* um usuário comum sem a variável de dev, *então* sai com código 1.
- **Testes:** unitário com `execFn` falso (System, High, Medium, erro); unitário garantindo que `checkBrowserProfile` só é passado em `darwin`.

#### W2 — Serviço real (`scripts/windows/install-service.ps1`)

- **Mudança (D1):**
  - Criar `packaging/windows/monblockd-service.xml`:
    - `id=monblockd`;
    - `onfailure restart 5 sec` ×3 e `resetfailure 1 day`;
    - `stoptimeout 10 sec` e `preshutdown`;
    - log com rotação em `DATA_DIR\logs`.
  - `install-service.ps1` passa a usar `monblockd-service.exe install|start`; o `sc.exe create` sai.
  - **Pipe ocupado no boot** (`EADDRINUSE`, filho órfão ou impostor): o daemon registra o erro, **mantém as Camadas 1/2 aplicadas** (o `tick` roda antes do IPC, `entry.ts:209`), avisa o Ajudante e encerra com código ≠ 0. O WinSW reinicia, o que limita o número de tentativas.
- **Aceite:**
  - *Dado* um reboot, *então* `Get-Service monblockd` fica `Running` em ≤ 60 s.
  - *Dado* `taskkill /f` no `monblockd.exe`, *então* ele volta em ≤ 10 s.
  - *Dado* `Stop-Service` **ou um desligamento do Windows**, *então* o `cleanShutdown` é gravado e o próximo boot não avisa inatividade.
- **Testes:** E2E (W18), incluindo um ciclo `Restart-Computer`, se o runner permitir; senão, `Stop-Service` + verificação da marca.

#### W3 — Build (`scripts/build-daemon-sea.sh`, `scripts/build-windows-setup.ps1`)

- **Mudança (D3):**
  - `scripts/build-daemon-sea.ps1`: esbuild → `node --experimental-sea-config` → copiar `node.exe` → `signtool remove /s` (se existir) → `postject` sem `--macho-segment-name`, com a versão fixada como no `.sh`.
  - Validar a versão do Node contra o `engines`.
  - `@electron/packager` para `win32-x64`.
  - `packaging/windows/monblock.iss` com as opções da D3, instalando em `INSTALL_DIR`.
  - Os SHA-256 de WinSW, `postject` e Inno são verificados no build.
  - O build gera `monBlock-Setup-<versão>.exe` e o `.sha256`.
- **Aceite:** *Dado* um runner Windows limpo, *então* saem o `.exe` e o `.sha256`, e o hash confere.

#### W4 — IPC acessível (`src/daemon/ipc-server.ts`, `src/main/daemon-client.ts`)

- **Mudança (D2, conforme o S0):**
  - D2-A: no `win32`, `listen({ path, readableAll: true, writableAll: true })`. Nada muda no macOS/Linux.
  - D2-B: handshake descrito na D2, com erros em `buildProblem` (RFC 9457) antes de fechar.
- **Aceite:**
  - *Dado* um usuário comum sem elevação, *então* `GET_STATE` responde 200.
  - *Dado* um acesso pela rede, *então* é negado.
  - (D2-B) *Dado* um `fetch` de uma página para a porta, *então* a conexão cai sem executar comando.
- **Testes:** unitários do handshake (D2-B); E2E com usuário comum (W18).

### 🟠 Altos

#### W9 — Registro: prefixo e valores antigos (`windows-platform-enforcer.ts:36-120`) — **crítico, entra na F1**

- **Problema 1:** as chaves usam `HKLM\`. Se o S0 confirmar que o `.reg` exige `HKEY_LOCAL_MACHINE\`, a Camada 2 inteira não funciona hoje.
- **Problema 2:** o `reg import` só mescla, então valores antigos continuam valendo. Um `URLAllowlist` velho mantém um site liberado depois que o grant expira.
- **Mudança:**
  - Gerar as chaves com `HKEY_LOCAL_MACHINE\` (constantes separadas para o `.reg` e para o `reg delete`/`reg query`, onde `HKLM` é válido).
  - Antes de cada lista, emitir `[-HKEY_LOCAL_MACHINE\...\URLBlocklist]`, `[-...\URLAllowlist]` e `[-...\Firefox\WebsiteFilter]`.
- **Riscos aceitos:**
  - Durante o import há uma janela de milissegundos com a lista vazia; o hosts (Camada 1) cobre.
  - Políticas corporativas que já existam nessas subchaves são sobrescritas.
  - As duas coisas ficam documentadas na ADR-0016.
- **Aceite:**
  - *Dado* o manifesto, *então* nenhuma linha de chave usa `HKLM\`.
  - *Dada* uma allowlist que cai de 3 para 1 item, *então* só o valor `"1"` existe (`reg query`).
- **Testes:** unitário (prefixo, ordem `[-…]` antes da recriação); E2E com `reg query`.

#### W10 — Falhas silenciosas e drift do Registro (`windows-platform-enforcer.ts:54-62, 189-195, 212-231`)

- **Mudança:**
  - O executor padrão **lança** no `win32` (fora dele continua sem efeito).
  - `applyWebRules` executa **todos** os passos mesmo se um falhar (hosts, ACL, flush, import) e acumula `lastApplyFailures` num campo **privado** do `WindowsPlatformEnforcer`. O contrato `PlatformEnforcer` das 3 plataformas não muda.
  - `verifyApplied` (síncrono, como no contrato) inclui as falhas no drift e **lê o Registro**: `execFileSync('reg', ['query', key, '/s'], { timeout: 5000 })` para cada chave gerenciada. Os valores lidos são comparados com o esperado; chave ausente ou valor divergente vira drift `registry:<chave>`. O watchdog já reaplica e avisa o Ajudante.
- **Aceite:**
  - *Dado* um `reg import` com código ≠ 0, *então* o hosts ainda é aplicado e o drift contém `registry:import`.
  - *Dado* um admin que apaga `...\Google\Chrome\URLBlocklist`, *então* o próximo `tick` acusa drift, reimporta e avisa o Ajudante.
- **Testes:** unitário com `commandExecutor` e `execFileSync` falsos (falha parcial, chave ausente, valor divergente, timeout).

#### W21 — Anti-impostura do servidor IPC (novo)

- **Problema:** um usuário comum pode criar `\\.\pipe\monblockd` (ou ocupar a porta, na D2-B) enquanto o daemon está parado. A UI então entrega a **senha do Ajudante** ao impostor.
- **Mudança:**
  - Antes de enviar qualquer comando com segredo (`PAIR_PARTNER`, `SET_BOT_TOKEN`, `VERIFY_*`, desinstalação), o `daemon-client` verifica que o servidor é o serviço:
    - D2-A: obtém o PID do servidor do pipe (`GetNamedPipeServerProcessId`, via o helper do S0) e confere que o dono do processo é `S-1-5-18`.
    - D2-B: o servidor responde um desafio do cliente com HMAC por uma chave que só o SYSTEM lê. O cliente valida pela assinatura pública gravada pelo instalador (S0 escolhe).
  - Falhou → o comando com segredo é recusado com aviso "Serviço do monBlock não verificado". Comandos sem segredo (`GET_STATE`) seguem.
  - O serviço sobe no boot antes de qualquer logon, o que reduz a janela.
- **Aceite:** *Dado* um processo de usuário comum servindo `\\.\pipe\monblockd`, *quando* a UI tenta parear, *então* nada é enviado e o usuário vê o aviso.
- **Testes:** unitário do gate por tipo de comando; E2E com pipe impostor.

### 🟡 Médios e baixos

#### W12 — Desinstalação (`src/daemon/entry.ts:296`) — F4

- **Problema:** `spawn('/bin/sh')` dá `ENOENT` sem listener de `error`, e o daemon cai. Além disso, um script filho do serviço seria morto pelo WinSW ao parar o serviço.
- **Mudança:**
  - Criar `INSTALL_DIR\uninstall.ps1`, que:
    - para e remove o serviço (WinSW);
    - remove **todas** as chaves e valores gerenciados: `URLBlocklist`, `URLAllowlist`, `DnsOverHttpsMode`, `IncognitoModeAvailability` e, no Firefox, `DisablePrivateBrowsing`, `DNSOverHTTPS` e `WebsiteFilter`. O `restoreSystemCleanState` também passa a remover esses valores;
    - restaura a ACL padrão do hosts (`icacls hosts /reset`);
    - apaga `DATA_DIR` e `INSTALL_DIR`, e o próprio script por último.
  - No `win32`, o `onUninstalled` registra **uma tarefa agendada única** (`schtasks /create /ru SYSTEM /sc once …` + `/run`) que executa o script fora da árvore do serviço. A tarefa se apaga no fim.
  - Em todas as plataformas: `.on('error', log)` no spawn.
  - Se o script falhar no meio, ele é idempotente; a tarefa permanece e é reexecutada no próximo boot até concluir.
- **Aceite:**
  - *Dada* uma desinstalação autorizada, *então* em ≤ 60 s `reg query` não mostra nenhum valor gerenciado, o hosts não tem o bloco nem ACL alterada, o serviço e as pastas não existem, e o daemon não registra exceção não tratada.
- **Testes:** unitário da escolha do comando por plataforma; E2E de "máquina limpa".

#### W13 — Ícone da bandeja (`src/main/main.ts:681-682`)

- **Mudança:** o mesmo PNG do escudo, sem `setTemplateImage`, em 16×16 (32×32 com DPI alto).
- **Aceite:** no Windows, `!trayIcon.isEmpty()`.
- **Teste:** unitário da escolha do ícone.

#### W14 — Notificações

- **Mudança:** `app.setAppUserModelId('com.ccat.monblock')` antes do `ready` no `win32`, igual ao atalho do Inno.
- **Aceite:** o toast aparece com o nome "monBlock" no app instalado.
- **Testes:** unitário da chamada; validação manual.

#### W15 — Caminhos relativos ao drive (`src/daemon/entry.ts:43-53`)

- **Problema:** `path.join('/', …)` gera `\ProgramData\…`, relativo ao drive atual, e ignora `SystemRoot`.
- **Mudança:** no `win32` sem `rootDir`, usar `process.env.ProgramData` (padrão `C:\ProgramData`) e `process.env.SystemRoot` (padrão `C:\Windows`) com `path.win32`.
- **Aceite:** com `ProgramData=D:\PD`, o `appSupportDir` fica `D:\PD\monBlock`.
- **Teste:** unitário de `resolveLayout` com `env` injetado.

#### W16 — Atualização (`src/main/updater.ts:177`) — F4

- **Mudança:**
  - Escolher o asset por plataforma (`.pkg` no `darwin`, `monBlock-Setup-*.exe` no `win32`), com SHA-256 fail-closed (ADR-0012), abrindo com `shell.openPath`.
  - Renomear `pkgUrl`/`pkgPath` para `installerUrl`/`installerPath` **de uma vez**, no mesmo commit do renderer, sem aliases.
  - O instalador para o serviço no upgrade (D3).
- **Aceite:** no Windows, uma release com `.exe` e `.sha256` valida e abre; sem hash, recusa; um upgrade com o serviço rodando termina com o serviço `Running` na nova versão.
- **Teste:** estender `tests/main/updater.test.ts` com `platform` injetado.

#### W17 — Codificação do `.reg` — rebaixado, decidido no S0

- **Fato:** os domínios já saem em punycode ASCII (`new URL` em `rule-engine.ts:78`), então IDN não é problema.
- **Mudança:** só se o S0 mostrar que o `reg import` recusa UTF-8 com o cabeçalho `Version 5.00`. Nesse caso, gravar em UTF-16LE com BOM numa função local do enforcer Windows, sem mexer em `writeIfChanged`/`writeFileAtomically` (compartilhados).
- **Aceite:** o arquivo gerado é aceito pelo `reg import` (`$LASTEXITCODE -eq 0`).

#### W18 — CI no Windows (`.github/workflows/ci.yml`) — F4

- **Mudança:** job `windows-package` em `windows-latest`:
  - `npm ci`, `typecheck`, `test`, build (W3), instalação `/VERYSILENT`;
  - E2E:
    - serviço `Running`;
    - `GET_STATE` como **usuário comum criado no runner** (`net user` + uma tarefa agendada com `/ru <usuário>` executando `tests/e2e/windows/ipc.mjs`);
    - acesso remoto negado;
    - bloco no hosts;
    - `reg query`;
    - `taskkill` e o serviço voltando;
    - pipe impostor (W21);
    - desinstalação de "máquina limpa" (W12);
  - artifact com retenção de 7 dias.
- **Aceite:** o job fica verde e obrigatório para merge na `main`.

#### W19 — Autostart do app (novo) — F4

- **Mudança:** o Inno cria um atalho em `{commonstartup}` com o AppUserModelID. O app não expõe opção de desligar o autostart; a Camada 3 depende dele.
- **Aceite:** *Dado* um logon, *então* o app está na bandeja em ≤ 30 s.

#### W20 — ACL do `DATA_DIR` verificada no boot (novo) — F2

- **Problema:** o `umask` não vale no Windows. O `vault.key` e o `state.primary` dependem da ACL que o `install-service.ps1` aplica.
- **Mudança:** no boot, se privilegiado no `win32`, `icacls DATA_DIR` é lido. Se houver ACE para Users, Everyone ou Authenticated Users, o daemon reaplica `/inheritance:r` com SYSTEM e Administradores apenas. Se não conseguir, **falha fechado** (não lê o cofre) e avisa.
- **Aceite:** *Dado* um `icacls DATA_DIR /grant Users:F`, *quando* o daemon reinicia, *então* a ACE some antes da leitura do `vault.key`.
- **Teste:** unitário com `execFn` falso.

### 🔵 Camada 3 (F5, entregue junta)

#### W5 — Ligar o watcher (`src/main/main.ts:691`)

- **Mudança:** extrair `startBrowserWatcherLoop(watcher, call): () => void` (retorna a função de parada), com a guarda de concorrência, o backoff e o grant `*` atuais. Escolher o watcher por plataforma (`darwin` → macOS, `win32` → Windows). **Só é ligado no `win32` junto com o W8.**
- **Aceite:** no Windows, `inspectOnce` é chamado periodicamente; com grant `*`, não é chamado.
- **Teste:** unitário com timers falsos.

#### W6 — Bug do `$pid` (`windows-watcher.ts:85-90`)

- **Mudança:**
  - Usar `[uint32]$procId = 0` e `[ref]$procId`.
  - Ler o título com `GetWindowText(hwnd)`, não com `MainWindowTitle`, que pode ser de outra janela do mesmo processo.
- **Aceite:** com o Chrome em primeiro plano, retorna `browser: 'chrome'` e o título daquela janela.
- **Teste:** E2E no job Windows; sem teste por regex.

#### W7 — Avaliação por título (`windows-watcher.ts:242-245`)

- **Mudança:** quando não houver URL, tirar do título o sufixo do navegador (` - Google Chrome`, ` — Mozilla Firefox`, ` - Microsoft Edge`, ` - Brave`, ` - Vivaldi`, ` - Opera`) e chamar `evaluateUrlAndTitle({ url: tituloLimpo, title: tituloLimpo })`. O passo 1 do rule engine casa termos com domínios de categoria.
  - **Grant:** sem domínio, só o grant `*` se aplica.
  - **Redirecionamento:** `domain=` recebe o rótulo da regra (`ruleLabel`).
- **Aceite:**
  - *Dado* "Pornhub - Google Chrome" com a categoria adulto ativa, *então* bloqueia.
  - *Dadas* as frases de `tests/domain/fixtures/frases-legitimas.tsv`, *então* não bloqueia.
- **Teste:** unitário com adapter falso + fixtures.

#### W8 — Helper persistente (`windows-watcher.ts:95`)

- **Mudança:**
  - Um processo `powershell -NoProfile -NonInteractive -EncodedCommand <loop>` que compila o `Add-Type` uma vez e faz `while ($l = [Console]::In.ReadLine()) { … ; [Console]::Out.Flush() }`.
  - Comandos fixos: `probe` → JSON `{proc,title}`.
  - Timeout de 2 s por probe: se estourar, mata e **recria no próximo tick**, sem backoff.
  - Encerrar no `will-quit`.
  - Se o `Add-Type` falhar (Constrained Language Mode / AppLocker), a Camada 3 fica desligada, com aviso único na UI e no log.
- **Aceite:**
  - 100 ciclos criam 1 processo.
  - Um processo travado é recriado.
  - Com CLM ativo, o app não fica em loop.
- **Teste:** unitário com `spawnFn` falso.

#### W11a — Redirecionamento seguro (`windows-watcher.ts:142`)

- **Mudança:** trocar `cmd.exe /c start` por `shell.openExternal(url)` do Electron (o watcher roda no main process), injetado no adapter.
- **Aceite:** uma URL com `&reason=…&rule=…` chega inteira.
- **Teste:** unitário do argumento passado.

#### W11b — Redirecionar a mesma aba (depois do W11a)

- **Mudança:** UI Automation (D4 passo 2) para ler a URL e escrever a página bloqueada na barra de endereço.
- **Limites conhecidos:**
  - o Enter exige `SendInput`, que só roda se a janela ainda estiver em primeiro plano; senão, usa o W11a;
  - UIPI bloqueia navegador elevado;
  - liga a árvore de acessibilidade do Chromium, com custo de CPU a medir.
- **Aceite:** checklist manual por navegador; a mesma aba mostra `127.0.0.1:49152/blocked`.

---

## 7. Segurança (Zero-Trust)

- Segredos do Ajudante só saem do app depois da verificação do servidor (W21).
- O IPC não é confiável: toda mutação exige a credencial do Ajudante.
- Tokens são comparados com `crypto.timingSafeEqual` e nunca vão para log.
- Erros de handshake e transporte usam `buildProblem` (RFC 9457) sem stack trace.
- Binários de terceiros (WinSW, `postject`, Inno) têm versão e SHA-256 fixados.
- O helper do W8 aceita só comandos fixos. O redirecionamento valida o prefixo `http://127.0.0.1:49152/blocked` no Node, antes de sair.
- Zero PII: título e URL não vão para log, só o domínio ou o rótulo da regra.
- `DATA_DIR` fica restrito a SYSTEM e Administradores e é verificado no boot (W20).

## 8. Riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| Premissa do S0 falha (D2-A, `.reg`, WinSW) | Cada uma tem fallback desenhado (D2-B, UTF-16LE, tarefa agendada); o S0 decide antes da F1 |
| Admin local remove o produto à mão (serviço, chaves, hosts) | `Uninstallable=no` tira o caminho fácil; drift de Registro/hosts (W10) e inatividade sem `cleanShutdown` avisam o Ajudante. Limite assumido na ADR-0016 |
| Pipe ou porta ocupados por impostor | W21 + serviço sobe no boot + Ajudante avisado no `EADDRINUSE` (W2) |
| Defender marca o hosts como `HostsFileHijack` | Teste no CI com o Defender ativo; domínios da Microsoft vão para a `CRITICAL_INFRA_ALLOWLIST` se aparecerem |
| AMSI / Defender marca o helper do W8/W11b | Comandos fixos, sem download; testar no CI; degradar com aviso |
| SmartScreen sem assinatura | Fora do escopo; dívida registrada |
| UIA muda entre versões de navegador | Fallback para título + `shell.openExternal` |
| `rename` do hosts com `EPERM`/`EBUSY` | Watchdog de 60 s + `lastApplyFailures` (W10) |
| Janela com blocklist vazia no reimport (W9) | Milissegundos; Camada 1 cobre; aceito |

## 9. Rollback

- **S0:** não muda o repositório, só gera relatório.
- **F1/F2/F5:** `git revert` dos commits da fase.
- **F3/F4:** a desinstalação autorizada (W12) é o rollback da máquina e é idempotente. Se falhar no meio, a tarefa agendada é reexecutada no boot.
  - O teste de "máquina limpa" (W18) verifica com `reg query`, hosts, `icacls hosts`, `Get-Service` e `Test-Path` que nada sobrou.
- **Registro:** sem backup próprio. O monBlock sobrescreve as subchaves gerenciadas e as remove por completo na desinstalação; políticas corporativas prévias nessas subchaves não são restauradas (ADR-0016).

## 10. Definição de pronto

- [ ] Relatório do S0 com todas as premissas PASSOU/FALHOU e a variante D2 escolhida.
- [ ] Critérios de aceite W1–W21 verdes (unitários + E2E Windows no CI).
- [ ] `npm run typecheck` e `npm test` verdes nas 3 plataformas.
- [ ] ADR-0016 aprovada, corrigindo a ADR-0013 e a ADR-0015.
- [ ] `CHANGELOG.md` e `VERSION` → `0.10.0`.
- [ ] `docs/domains/` atualizado onde o comportamento por plataforma mudou.
- [ ] `graphify update .` executado.

## 11. Histórico de revisão

- **v1 (2026-11-25):** W1–W18; aprovada em 2026-11-26.
- **v2 (2026-11-27):** auditoria cega do goldfish-critic (reprovou F3–F5) + sabatina.
  - Novos: S0, W19 (autostart), W20 (ACL do `DATA_DIR`), W21 (anti-impostura).
  - W9 sobe para crítico (prefixo `HKLM`).
  - W5–W8 juntos na F5; W12 vai para a F4 com tarefa agendada; `Uninstallable=no`.
  - `verifyApplied` passa a ler o Registro.
  - Fora: reaplicação periódica da DACL, aliases do updater e backoff do helper (YAGNI).
  - W17 rebaixado; correções no W1 (`checkBrowserProfile`), W6 (`GetWindowText`), W7 (título como termo), W11a (`shell.openExternal`).
