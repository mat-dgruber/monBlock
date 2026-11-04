# Unit: `web-block-engine`, Tarefas de Implementação

## Pré-requisitos
- [x] Entitlement `com.apple.security.automation.apple-events` configurado no assinatura do app
- [x] Modelo `ACMonitorItem` e `ACMonitorItemsMgr` disponíveis

## Tarefas

- [ ] T-WEB-01, Implementar `ACScriptHelper` com fila GCD serial (`queueForScriptExcute`) e execução assíncrona de `NSAppleScript`.
  - Origem no legado: `Contents/MacOS/Cisdem AppCrypt:0x10004157c`–`0x100041e88`
  - Critério de pronto: Executar scripts AppleScript fora da main thread e converter erros `NSAppleScriptError*` em `NSError`.
  - Confiança: 🟢

- [ ] T-WEB-02, Implementar classe base `ACMonitorBrowser` e subclasses especializadas (`ACMonitorSafariBrowser`, `ACMonitorArcBrowser`, `ACMonitorDiaBrowser` e subclasses Chromium).
  - Origem no legado: `Contents/MacOS/Cisdem AppCrypt:0x100039064`–`0x10004a4b8`
  - Critério de pronto: Ler URLs ativas e redirecionar abas nos 3 dialetos AppleScript (Chromium, Safari, Arc/Dia).
  - Confiança: 🟢

- [ ] T-WEB-03, Implementar motor de avaliação `-[ACMonitorTask websiteIsBlock:]`, `-URL:containURL:` e `-matchKeywordItem:withURL:` (com suporte a vírgulas `AND`).
  - Origem no legado: `Contents/MacOS/Cisdem AppCrypt:0x1000098d0`, `0x10000cf7c`, `0x10000d868`
  - Critério de pronto: Respeitar precedência `whiteWebsites` > `blackWebsites` > `blockAll` > `monitorWebsites` + Schedule.
  - Confiança: 🟢

- [ ] T-WEB-04, Implementar `ACBrowserAuthManager` e `ACBrowserAuthPanel` usando `AEDeterminePermissionToAutomateTarget` e polling em duas frequências.
  - Origem no legado: `Contents/MacOS/Cisdem AppCrypt:0x10003b97c`–`0x100041000`
  - Critério de pronto: Detectar navegadores instalados, consultar status TCC e solicitar autorização com `--no-startup-window`.
  - Confiança: 🟢

- [ ] T-WEB-05, Implementar catálogo `ACPopularURLs` (11 categorias) e importador/exportador `ACWebListFile` (`.txt`).
  - Origem no legado: `Contents/MacOS/Cisdem AppCrypt:0x1000496c8`, `0x1000065c0` e `Assets.car` (`popularURLs`)
  - Critério de pronto: Carregar categorias predefinidas e exportar/importar listas em texto plano.
  - Confiança: 🟢

## Tarefas de Teste

- [ ] TT-WEB-01, Testar redirecionamento de URL bloqueada para `https://www.cisdem.com/blocked-website.html` no Safari, Chrome e Arc.
- [ ] TT-WEB-02, Testar keyword combinada `"work, meeting"` garantindo bloqueio apenas quando ambos os termos ocorrem na URL.
- [ ] TT-WEB-03, Testar modo `blockAll = YES` com exceção em `whiteWebsites` (*Always Allow*).

## Ordem Sugerida
1. `T-WEB-01` (`ACScriptHelper`) → 2. `T-WEB-02` (`ACMonitorBrowser`) → 3. `T-WEB-03` (`websiteIsBlock:`) → 4. `T-WEB-04` (`ACBrowserAuthManager`) → 5. `T-WEB-05` (`ACPopularURLs`).

## Lacunas Pendentes (🔴)
Nenhuma lacuna bloqueante registrada nesta unidade, dentro do escopo da análise estática (sem teste dinâmico; TT-WEB pendentes). Ver `../gaps.md` e `../rea-evidence-dossier.md` (limites).
