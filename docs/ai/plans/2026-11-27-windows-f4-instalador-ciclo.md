# Plano: F4 do Windows — instalador, atualização, desinstalação, autostart e CI

- **Data:** 2026-11-27
- **Status:** RASCUNHO, aguardando `/plan-criticize` e aprovação
- **Spec:** `docs/ai/specs/2026-11-25-correcao-suporte-windows-design.md` (v3) — itens **W3 (resto), W12, W16, W18, W19**
- **ADR:** 0016 (aprovada), D1, D3 e D4 (desinstalação por tarefa agendada)
- **Depende de:** F3 (mergeada) e PR #22 (correções do teste real como SYSTEM)
- **Pré-condição de release (spec):** P10 com o Defender ativo; nesta máquina o antivírus ativo é o Malwarebytes, então fica no checklist de release.
- **Branch:** `feat/windows-f4` a partir de `dev`

## 1. Objetivo

Sair de "scripts de dev" para um produto instalável. Um `monBlock-Setup-<versão>.exe` instala o serviço e o app, abre o app no logon e se atualiza com hash conferido. A desinstalação só acontece pelo fluxo autorizado pelo Ajudante e deixa a máquina limpa. O CI prova tudo isso como SYSTEM a cada PR, sem UAC.

Fora do escopo: Camada 3 (F5), assinatura Authenticode (risco aceito na spec §3) e ARM64.

## 1.1 Restrições

- **Ferramentas:** Inno Setup 6 (`ISCC.exe`), versão e SHA-256 fixados no build. No CI, instalado por download com hash conferido, nunca por `choco` sem pin. `@electron/packager` como devDependency com versão exata.
- **Node do SEA:** fixado em `package.json#engines` + `.nvmrc` (D3). O build falha se a versão divergir. Hoje roda o 24.19.0 local.
- **Desinstalação:** `Uninstallable=no` (sem entrada em "Aplicativos"). Só o daemon desinstala, depois do `UNINSTALL_AUTHORIZED` validado.
- **Instalação idempotente:** upgrade por cima com o serviço rodando, porque o `PrepareToInstall` para o serviço antes.

## 2. Alternativas

| Item | Opções | Escolha |
|---|---|---|
| Instalador | **Inno Setup 6** (D3) · WiX/MSI (mais verboso e exige ferramenta .NET) · NSIS (scripts mais frágeis) | Inno (ADR-0016) |
| Pacote do app | **@electron/packager** (simples, já está na D3) · electron-builder (traz auto-update próprio, que conflitaria com o updater SHA-256 da ADR-0012) | packager |
| Desinstalação | **tarefa agendada única como SYSTEM** (S0/P6: sobrevive à parada do serviço) · spawn detached (é morto pelo WinSW) · o próprio serviço apagando a si mesmo (não consegue) | tarefa agendada |
| E2E do serviço | **job `windows-latest` (admin sem UAC)** · laboratório de VMs (fica para o release) | CI |

## 3. Passos (TDD onde houver lógica; commit por item)

### 3.1 W3 — pacote e instalador
1. `scripts/build-app-win.ps1`: `npm run build` → `@electron/packager . monBlock --platform=win32 --arch=x64 --out build/windows-app --icon packaging/windows/monblock.ico --asar` com só `dist/`, `package.json` e `node_modules` de produção.
2. `packaging/windows/monblock.iss`:
   - `PrivilegesRequired=admin`, `Uninstallable=no`, `ArchitecturesInstallIn64BitMode=x64compatible`;
   - instala o app em `{autopf}\monBlock\app` e o daemon (o mesmo conteúdo do `build\windows` atual) em `{autopf}\monBlock`;
   - `PrepareToInstall`: se o serviço existir, `monblockd-service.exe stop` e espera parar (timeout de 30 s);
   - `[Run]`: equivalente ao `install-service.ps1` (WinSW `install` + `start`, `DATA_DIR` com ACL, backup do hosts com hash);
   - atalho do Menu Iniciar e de `{commonstartup}` com `AppUserModelID: com.ccat.monblock` (W14, W19).
3. `scripts/build-windows-setup.ps1` reescrito: build do SEA → build do app → `ISCC` → `monBlock-Setup-<versão>.exe` + `.sha256`. WinSW, Inno e Node com hash conferido.
4. Teste: script de smoke do instalador (`/VERYSILENT /SUPPRESSMSGBOXES`) no CI (3.4).

### 3.2 W12 — desinstalação autorizada
1. `packaging/windows/uninstall.ps1`, idempotente:
   - para e remove o serviço (WinSW);
   - remove todas as chaves e valores gerenciados (o mesmo conjunto do `uninstall-dev.ps1`, incluindo `InPrivateModeAvailability`);
   - restaura o hosts do backup e confere o hash (com novas tentativas, pela trava do antivírus vista na F3);
   - roda `icacls hosts /reset`;
   - apaga `DATA_DIR` e `INSTALL_DIR` e, por último, a tarefa agendada.
2. `entry.ts` `onUninstalled` no `win32`: `schtasks /create /tn monblock-uninstall /ru SYSTEM /sc once /st 00:00 /f /tr "powershell -NoProfile -ExecutionPolicy Bypass -File <INSTALL_DIR>\uninstall.ps1"` + `schtasks /run`, com `.on('error')`. Se o script falhar no meio, a tarefa fica e roda de novo no próximo boot (`/sc onstart`, segunda tarefa criada junto e apagada pelo script ao concluir).
3. `restoreSystemCleanState` do enforcer passa a remover também `DnsOverHttpsMode`, `IncognitoModeAvailability`/`InPrivateModeAvailability` e os valores do Firefox.
4. Testes: unitário do comando montado por plataforma (`spawnFn` falso); unitário do `restoreSystemCleanState` (lista de `reg delete`); E2E de máquina limpa no CI.

### 3.3 W16 — atualização
1. `updater.ts`: escolher o asset por plataforma (`.pkg` no darwin, `monBlock-Setup-*.exe` no win32), SHA-256 fail-closed (ADR-0012), abrir com `shell.openPath`. Renomear `pkgUrl`/`pkgPath` → `installerUrl`/`installerPath` de uma vez, junto com o renderer.
2. Testes: estender `tests/main/updater.test.ts` com `platform` injetado (exe com hash ok; sem `.sha256` recusa; hash divergente recusa).

### 3.4 W18 — CI do pacote como SYSTEM
1. Job `windows-package` (o job `windows` atual continua para os testes):
   - build completo (3.1) e instalação `/VERYSILENT`;
   - **E2E** (`tests/e2e/windows/run.ps1`, versão do `e2e-admin.ps1` deste teste real):
     - serviço `Running` como `LocalSystem`;
     - `GET_STATE` e `MUTATE_RULES` como **usuário comum** criado no runner (`net user` + tarefa `/ru`) em < 2 s;
     - acesso remoto: tentativa por `\\localhost\pipe` registrada (inconclusiva, ver S0);
     - bloco no hosts e `reg query`;
     - `taskkill` → volta em ≤ 10 s;
     - pipe impostor com o serviço parado → `pipe-server-check` = `verified:false`;
     - `UNINSTALL_AUTHORIZED` não dá para disparar sem Ajudante, então o E2E chama a tarefa diretamente → **máquina limpa** (sem serviço, pastas, chaves e com o hosts igual ao hash original).
   - Artifact `monBlock-Setup-<versão>.exe` + `.sha256` (7 dias).
2. **Correção que o teste real pediu:** `entry.test.ts` (modo dev) usa o pipe real `\\.\pipe\monblockd` e falha com `EADDRINUSE` se o serviço estiver instalado. O modo dev passa a aceitar `MONBLOCK_DEV_PIPE_NAME`, que os testes usam com um nome aleatório.

### 3.5 W19 — autostart
- O atalho em `{commonstartup}` com o AppUserModelID abre o app minimizado (`--hidden`, que já existe). Aceite: no logon, o app está na bandeja em ≤ 30 s (validação manual nesta máquina).

### 3.6 Fechamento
- `0.10.0` (MINOR) no `package.json`/`VERSION`, CHANGELOG com a seção da versão.
- Validação nesta máquina com o usuário presente: instalar o Setup (1 UAC), logon/autostart, toast com nome "monBlock", atualização de 0.10.0 → 0.10.1 de teste, desinstalação autorizada pelo Ajudante (precisa do Telegram pareado pelo usuário).

## 4. Resiliência e casos de borda

- **Upgrade com o serviço rodando:** o `PrepareToInstall` para o serviço. Se não parar em 30 s, aborta sem sobrescrever (o binário em uso falharia). Mensagem clara.
- **Instalação interrompida:** o `[Run]` é idempotente (o `install-service` já reinstala por cima). O Inno faz rollback dos arquivos.
- **Desinstalação interrompida** (queda de energia): a tarefa `onstart` refaz no próximo boot. O hosts volta pelo hash. A tarefa só se apaga com tudo limpo.
- **Antivírus segurando o hosts** durante a desinstalação: novas tentativas (lição da F3). Se ainda assim falhar, a tarefa permanece e o log registra.
- **Hash do Setup divergente no updater:** recusa e não abre nada (ADR-0012).
- **Pre-mortem (3h da manhã):** um update quebrado instala um daemon que não sobe. O WinSW tenta 3 vezes e para. As Camadas 1 e 2 continuam aplicadas (estão em arquivo e no Registro), mas sem watchdog, e o app mostra "Proteção não verificada". Rollback: o usuário roda o Setup anterior (o updater guarda o último `.exe` válido em `%LOCALAPPDATA%\monBlock\updates`).

## 5. Segurança

- `Uninstallable=no` e a desinstalação só pelo daemon depois do `UNINSTALL_AUTHORIZED` (credencial do Ajudante).
- `uninstall.ps1` em `%ProgramFiles%` (só admin grava). A tarefa roda como SYSTEM com caminho absoluto.
- Downloads de ferramentas com hash fixado. O Setup publicado acompanha o `.sha256`. Sem Authenticode (SmartScreen avisa): risco aceito, registrado no README.
- Usuário comum de teste no CI: senha aleatória gerada no job, nunca em log, e usuário removido no fim.

## 6. Rollback

- **Código:** `git revert` por item. O macOS e o Linux não mudam (tudo atrás de `win32`, exceto o `restoreSystemCleanState`, que só cresce).
- **Máquina:** `uninstall.ps1` é idempotente. Enquanto o W12 não estiver pronto, o `uninstall-dev.ps1` continua servindo.

## 7. Pronto quando

- [ ] O job `windows-package` fica verde: Setup gerado, instalado, E2E como SYSTEM e máquina limpa.
- [ ] Testes unitários novos verdes; macOS/Linux sem regressão.
- [ ] Validação manual nesta máquina (instalar, autostart, toast, update, desinstalação autorizada).
- [ ] `0.10.0` com CHANGELOG; relatório em `docs/ai/reports/`.
