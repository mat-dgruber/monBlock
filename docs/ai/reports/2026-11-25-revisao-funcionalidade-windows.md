# Revisão de funcionalidade no Windows — monBlock v0.9.1

Data: 2026-11-25 · Branch: `dev` (e4033cf) · Método: leitura estática + `typecheck` + `npm test` (336/336 verdes no macOS; nenhum teste roda em Windows real — CI só tem `ubuntu-latest` e `macos-latest`).

**Veredito: NÃO funcional no Windows.** O código Windows existe (enforcer, watcher, named pipe), mas o daemon não sobe, a UI não falaria com ele e a Camada 3 não está ligada. Os testes passam porque todos os comandos do Windows são mocks.

## 🔴 Bloqueadores

| # | Onde | Problema | Correção sugerida |
|---|------|----------|-------------------|
| W1 | `src/daemon/entry.ts:280-285` | `process.getuid` não existe no Windows → `isRoot=false` → sem `MONBLOCK_DEV_ROOT_DIR` o daemon faz `process.exit(1)`. Mesmo em modo dev, `flushDns` e checagens de admin ficam desligados. | No `win32`, considerar privilegiado se rodando como SYSTEM/admin (ex.: `net session` ou checar SID via `whoami /groups`). |
| W2 | `scripts/windows/install-service.ps1:38` | `sc.exe create` aponta para um `.exe` Node comum. Ele não chama `StartServiceCtrlDispatcher` → SCM mata em ~30 s com erro 1053. | Envolver com WinSW/NSSM (ou `node-windows`), ou usar Tarefa Agendada como SYSTEM no boot. |
| W3 | `scripts/build-daemon-sea.sh` / `scripts/build-windows-setup.ps1` | Não existe build do `monblockd.exe`: o SEA é só macOS (`--macho-segment-name`), e o `.ps1` só copia design + script, sem daemon, sem app Electron, sem script Inno. Não há o que instalar. | Passo SEA para Windows (`postject` sem `--macho-segment-name`) + empacotamento do Electron (electron-builder/forge) + script `.iss`. |
| W4 | `src/daemon/ipc-server.ts:112-121` | Named pipe criado sem DACL. O DACL padrão dá só **leitura** para Everyone; o Electron (usuário comum, ou admin com token filtrado pelo UAC) não consegue escrever → toda chamada IPC falha. | Criar o pipe com DACL explícita (ex.: `D:(A;;GA;;;SY)(A;;GA;;;BA)(A;;GRGW;;;IU)`); o Node não expõe isso, então precisa de addon nativo, proxy em TCP loopback com token, ou serviço wrapper. **Decisão arquitetural → ADR.** |
| W5 | `src/main/main.ts:691` | O watcher (Camada 3) só é instanciado em `darwin`. `WindowsBrowserWatcher` nunca roda. | Ligar o `WindowsBrowserWatcher` no mesmo loop (com o mesmo backoff). |
| W6 | `src/enforcers/windows-watcher.ts:85-86` | Mesmo se ligado: `$pid` é variável automática somente-leitura no PowerShell (`$PID`). `$pid = 0` dá erro e `Get-Process -Id $pid` retorna o **próprio PowerShell** → nunca casa com navegador → nunca bloqueia. | Renomear para `$procId`. |

## 🟠 Altos

| # | Onde | Problema |
|---|------|----------|
| W7 | `windows-watcher.ts:113-117` | `url = MainWindowTitle` (ex.: "YouTube - Google Chrome"). `sanitizeAndNormalizeUrl` não acha URL e o watcher retorna `blocked:false` antes de avaliar o título (linha 243). Na prática a Camada 3 no Windows não bloqueia nada. Ler URL exige UI Automation (barra de endereço). |
| W8 | `windows-watcher.ts:95` | Abre um `powershell` + `Add-Type` (compila C#) a cada ciclo (~1,5 s) → centenas de ms de CPU por tick. Precisa de processo persistente ou helper nativo. |
| W9 | `windows-platform-enforcer.ts:202` | `reg import` só **mescla**: valores numerados velhos ficam. Quando a lista encolhe (categoria desligada, grant que expira saindo do allowlist), entradas antigas ficam ativas — o `URLAllowlist` velho pode manter um site liberado depois do grant expirar. Correção: emitir `[-HKLM\...\URLBlocklist]`/`[-...\URLAllowlist]`/`[-...\WebsiteFilter]` antes de recriar as chaves no `.reg`. |
| W10 | `windows-platform-enforcer.ts:54-62` | O executor padrão engole todo erro (`icacls`, `reg import`, `ipconfig`). `verifyApplied` só compara o arquivo `.reg` em disco, não o Registro → falha silenciosa de imposição. |
| W11 | `windows-watcher.ts:142` | `execFile('cmd.exe', ['/c','start','""', '"url"'])`: o Node re-escapa as aspas (`\"`) e o `cmd` não entende `\"`; com `&` na query (`&reason=…&rule=…`) a URL é cortada ou vira comando. Além disso `start` abre **nova aba** no navegador padrão, não redireciona a aba ativa. Usar `windowsVerbatimArguments: true` ou `explorer.exe <url>` / `rundll32 url.dll,FileProtocolHandler`. |

## 🟡 Médios / baixos

- **W12** `entry.ts:296` — desinstalação autorizada faz `spawn('/bin/sh', …)`; no Windows dá `ENOENT` num `ChildProcess` sem listener de `error` → exceção não tratada derruba o daemon. Precisa de `uninstall.ps1` equivalente.
- **W13** `main.ts:682` — ícone da tray no Windows é `nativeImage.createEmpty()` → slot invisível na bandeja; usuário não acha o app.
- **W14** Sem `app.setAppUserModelId(...)` → notificações toast não aparecem no app empacotado no Windows.
- **W15** `entry.ts:43-53` — `path.join('/', 'ProgramData/...')` vira `\ProgramData\...` relativo ao drive atual; quebra se o Windows não estiver em `C:`. Usar `process.env.ProgramData` / `process.env.SystemRoot`.
- **W16** `updater.ts:177` — só procura asset `.pkg`; sem update no Windows.
- **W17** `.reg` gravado em UTF-8 com cabeçalho `Version 5.00` (que espera UTF-16LE). Funciona para ASCII, mas domínios IDN não-punycode corrompem. Validar em máquina real.
- **W18** CI sem `windows-latest`: nada do caminho Windows é exercitado fora de mocks.

## ✅ O que está certo

- Fábrica `createPlatformEnforcer('win32')` → `WindowsPlatformEnforcer`.
- Escrita atômica do `hosts` (rename com backup), marcadores e rollback; ~8,6 k domínios (~17 k linhas) não pesa no cliente DNS.
- Chaves de política corretas (Chrome/Edge/Brave/Chromium/Vivaldi + Firefox `WebsiteFilter`, `DNSOverHTTPS`, `DisablePrivateBrowsing`), limite de 900 domínios.
- `chown`/`chmod` do socket protegidos para `win32`; caminho de pipe igual entre daemon e `main.ts`.
- `install-service.ps1` exige admin e restringe ACL de `%ProgramData%\monBlock`.

## Ordem sugerida

1. W6 + W5 + W9 + W11 (pequenos, ~1 dia, testáveis com mocks).
2. W1 + W15 + W12 (entry multiplataforma).
3. ADR para W2 + W4 (wrapper de serviço + transporte IPC com ACL) — maior decisão.
4. W3 + W18 (build/instalador + job `windows-latest` com E2E como admin).
5. W7/W8 (UI Automation para ler URL) — maior esforço.
