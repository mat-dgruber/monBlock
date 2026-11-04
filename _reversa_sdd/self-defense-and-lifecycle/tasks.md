# Unit: `self-defense-and-lifecycle`, Tarefas de Implementação

## Pré-requisitos
- [x] `Info.plist` configurado com `LSUIElement = true`

## Tarefas

- [ ] T-DEF-01, Implementar `ACFileSystemEventMonitor` encapsulando `FSEventStreamCreate`, `FSEventStreamScheduleWithRunLoop` e `FSEventStreamStart`.
  - Origem no legado: `Contents/MacOS/Cisdem AppCrypt:0x10001e994`–`0x10001f050`
  - Critério de pronto: Disparar bloco/delegate sempre que o diretório monitorado sofrer alterações no filesystem.
  - Confiança: 🟢

- [ ] T-DEF-02, Implementar `ACMonitorAppSelf` com backup `/usr/bin/tar -czf` (`.tgz.gz`) e restauração automática `/usr/bin/tar -xvf`.
  - Origem no legado: `Contents/MacOS/Cisdem AppCrypt:0x10002d068`–`0x10002d600`
  - Critério de pronto: Restaurar o `.app` automaticamente se o bundle for removido enquanto o processo estiver ativo.
  - Confiança: 🟢

- [ ] T-DEF-03, Implementar `ACLaunchAgent` gerenciando `~/Library/LaunchAgents/com.cisdem.appencrypt.plist` (`RunAtLoad = true`, `-autoLaunch`).
  - Origem no legado: `Contents/MacOS/Cisdem AppCrypt:0x10002247c`–`0x100022a00`
  - Critério de pronto: Gravar e remover o plist sincronizado com `ACPreferences.autoLaunch`.
  - Confiança: 🟢

- [ ] T-DEF-04, Implementar `ACStatusItemManager` e integração `MASShortcut` (`ACShortcutBinder`) no `AppDelegate`.
  - Origem no legado: `Contents/MacOS/Cisdem AppCrypt:0x10001d194`, `0x1000026b0`
  - Critério de pronto: Exibir menu na barra de status e exigir senha mestra antes de encerrar ou desabilitar o bloqueio.
  - Confiança: 🟢

## Tarefas de Teste

- [ ] TT-DEF-01, Testar remoção de `Cisdem AppCrypt.app` com o processo ativo e verificar restauração automática via `tar -xvf`.
- [ ] TT-DEF-02, Testar criação e remoção de `~/Library/LaunchAgents/com.cisdem.appencrypt.plist` ao alternar `Launch at system startup`.

## Ordem Sugerida
1. `T-DEF-01` (`ACFileSystemEventMonitor`) → 2. `T-DEF-02` (`ACMonitorAppSelf`) → 3. `T-DEF-03` (`ACLaunchAgent`) → 4. `T-DEF-04` (`ACStatusItemManager` + `AppDelegate`).

## Lacunas Pendentes (🔴)
Nenhuma lacuna bloqueante registrada nesta unidade, dentro do escopo da análise estática (sem teste dinâmico; TT-DEF pendentes). Ver `../gaps.md` e `../rea-evidence-dossier.md` (limites).
