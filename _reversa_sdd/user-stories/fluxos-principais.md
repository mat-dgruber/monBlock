# User Stories e Fluxos Principais (Cisdem AppCrypt v7.11.0)

> Especificação comportamental orientada a cenários Gherkin extraída do binário Mach-O (`doc_level = detalhado`, 🟢 CONFIRMADO).

---

## US-01: Bloqueio Instantâneo de Aplicativo Protegido (`app-lock-engine`)
**Como** administrador do Mac,
**Quero** que qualquer aplicativo adicionado à lista *App Lock* exija a senha mestra ao ser aberto ou focado,
**Para** impedir acesso não autorizado a aplicativos sensíveis ou de distração.

```gherkin
Funcionalidade: Bloqueio de Aplicativos (App Lock)

  Cenário: Tentativa de abrir aplicativo bloqueado dentro do horário agendado
    Dado que "com.apple.Terminal" está cadastrado em "_monitorApps"
    E que a agenda do item está ativa no horário atual
    E que "ACRunningApp.granted" para o Terminal é "NO"
    Quando o usuário inicia ou traz o Terminal para o primeiro plano
    Então "ACRunningAppsMgr" detecta a ativação via KVO ("NSWorkspace.runningApplications" / "active")
    E "ACMaskWndControl" captura um snapshot das janelas do PID via "CGWindowListCreateImage"
    E aplica o filtro CoreImage "CIGaussianBlur" sobrepondo uma "ACMaskWindow" nos mesmos bounds
    E exibe o painel "ACPasswordPanel" solicitando a senha mestra

  Cenário: Senha incorreta com captura de foto pela câmera
    Dado que o painel "ACPasswordPanel" está visível para um aplicativo bloqueado
    E que a preferência "recordFailedAttempt" é "YES"
    Quando o usuário digita uma senha cujo MD5 difere da senha mestra
    Então "ACFailedAttemptsManager" aciona "ACCameraShot" via "AVCaptureSession"
    E salva o registro "ACFailedAttempt" com foto JPEG, timestamp e ícone do aplicativo
    E oculta ou encerra o aplicativo bloqueado
```

---

## US-02: Bloqueio e Redirecionamento de Websites (`web-block-engine`)
**Como** usuário focado em produtividade ou controle parental,
**Quero** bloquear domínios específicos, categorias de sites ou palavras-chave na URL em todos os navegadores suportados,
**Para** que qualquer aba proibida seja imediatamente redirecionada para a página de bloqueio.

```gherkin
Funcionalidade: Bloqueio de Websites via AppleEvents (Web Block)

  Cenário: Redirecionamento de domínio bloqueado para https://www.cisdem.com/blocked-website.html
    Dado que o navegador "com.google.Chrome" possui permissão TCC Automation concedida
    E que "youtube.com" está na lista "_monitorWebsites" com agenda ativa
    Quando o timer de polling de "ACMonitorChromeBrowser" dispara
    E o script AppleScript retorna a URL ativa "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    Então "-[ACMonitorTask websiteIsBlock:]" retorna "YES"
    E "ACMonitorChromeBrowser" executa o AppleScript de redirecionamento alterando a URL da aba para "https://www.cisdem.com/blocked-website.html"

  Cenário: Bloqueio por palavras-chave combinadas por vírgula (lógica AND)
    Dado que o item "game, online" (isKeyword = YES) está em "_monitorWebsites"
    Quando o usuário abre "https://example.com/online-courses"
    Então "-[ACMonitorItemsMgr matchKeywordItem:withURL:]" retorna "NO" (pois falta "game")
    Quando o usuário abre "https://example.com/play-online-game-now"
    Então "-[ACMonitorItemsMgr matchKeywordItem:withURL:]" retorna "YES" (ambos os termos presentes)
    E a aba é redirecionada para "https://www.cisdem.com/blocked-website.html"

  Cenário: Precedência de Always Allow (whiteWebsites) sobre Block All
    Dado que "ACMonitorItemsMgr.blockAll" é "YES"
    E que "wikipedia.org" está cadastrado em "_whiteWebsites" (Always Allow)
    Quando o usuário acessa "https://pt.wikipedia.org/wiki/macOS"
    Então "-[ACMonitorTask websiteIsBlock:]" retorna "NO" no Passo 1 (antes de avaliar blockAll)
```

---

## US-03: Persistência Camuflada e Autodefesa (`security-and-persistence` & `self-defense-and-lifecycle`)
**Como** administrador do controle de acesso,
**Quero** que o bloqueio resista à exclusão manual da pasta de suporte ou do próprio aplicativo no Finder,
**Para** evitar que usuários contornem o AppCrypt sem conhecer a senha mestra.

```gherkin
Funcionalidade: Autodefesa e Persistência Resiliente

  Cenário: Restauração automática das configurações a partir do espelho camuflado
    Dado que "ACPreferences" salvou os dados em "~/Library/Application Support/com.apple.sdev/csdv.dsc"
    E espelhou em "~/Library/Application Support/com.app.cadlvq/dgh.xvc"
    Quando o usuário apaga "~/Library/Application Support/Cisdem AppCrypt" e "com.apple.sdev/csdv.dsc"
    E o Cisdem AppCrypt é iniciado
    Então "+[ACPreferences sharedPreference]" restaura "csdv.dsc" a partir de "com.app.cadlvq/dgh.xvc"
    E mantém todos os aplicativos e sites bloqueados

  Cenário: Auto-restauração do bundle .app quando deletado em execução
    Dado que "ACMonitorAppSelf" criou o backup ".tgz.gz" via "/usr/bin/tar -czf"
    E está monitorando "/Applications/Cisdem AppCrypt.app" via "FSEventStreamCreate"
    Quando o usuário move "/Applications/Cisdem AppCrypt.app" para a Lixeira
    Então "ACFileSystemEventMonitor" notifica "ACMonitorAppSelf"
    E "-[ACMonitorAppSelf restoreApp]" executa "/usr/bin/tar -xvf" recriando "/Applications/Cisdem AppCrypt.app"
```
