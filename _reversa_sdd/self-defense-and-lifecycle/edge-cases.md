# Unit: `self-defense-and-lifecycle`, Casos Extremos (Edge Cases)

> Extraído do binário Mach-O (`doc_level = detalhado`, 🟢 CONFIRMADO).

---

## EC-DEF-01: Usuário Arrasta `/Applications/Cisdem AppCrypt.app` para a Lixeira com o App Rodando
- **Evidência no binário (`ACMonitorAppSelf` em `0x10002d068`–`0x10002d5c4`):**
  - No macOS, mover um `.app` em execução para `~/.Trash` renomeia o diretório no APFS sem encerrar o processo em memória.
  - O `ACFileSystemEventMonitor` detecta imediatamente que `/Applications/Cisdem AppCrypt.app` deixou de existir no caminho original e invoca `-[ACMonitorAppSelf restoreApp]`, que executa `/usr/bin/tar -xvf <backup.tgz.gz> -C /Applications`, recriando o aplicativo intacto. 🟢 CONFIRMADO

## EC-DEF-02: Ícone da Barra de Menus Oculto e Usuário Esquece o Atalho Global
- **Evidência no binário (`AppDelegate applicationShouldHandleReopen:hasVisibleWindows:` em `0x100003684`):**
  - Mesmo quando o ícone da barra de menus (`NSStatusItem`) foi ocultado nas preferências, clicar duas vezes no ícone do `Cisdem AppCrypt.app` no Finder (ou abri-lo via Spotlight) dispara `applicationShouldHandleReopen:hasVisibleWindows:`, que solicita a senha mestra e reabre a janela principal. 🟢 CONFIRMADO

## EC-DEF-03: Inicialização Silenciosa no Login (`-autoLaunch`)
- **Evidência no binário (`ACLaunchAgent` em `0x10002247c` + `AppDelegate:0x1000029d8`):**
  - O plist `~/Library/LaunchAgents/com.cisdem.appencrypt.plist` passa o argumento `-autoLaunch` em `ProgramArguments`. Quando presente, o `AppDelegate` inicia todos os monitores em background sem abrir a janela de senha inicial na tela do usuário. 🟢 CONFIRMADO
