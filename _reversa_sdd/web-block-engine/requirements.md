# Unit: `web-block-engine` — Requisitos Operacionais

## Visão Geral
Subsistema responsável por monitorar URLs abertas em 10 navegadores web no macOS via polling de AppleEvents (`NSAppleScript`), gerenciar permissões TCC Automation (`ACBrowserAuthManager`), avaliar regras de bloqueio (Block All, Blocklist, Allowlist, Exceções Always Allow/Block, 11 categorias de sites populares e palavras-chave combinadas por vírgula) e redirecionar abas bloqueadas para `https://www.cisdem.com/blocked-website.html` (ou URL customizada).

## Responsabilidades
- Detectar navegadores suportados em execução e iniciar polling periódico de URLs (`ACMonitorBrowser.monitorTimer`).
- Executar scripts AppleScript de forma serializada em background (`ACScriptHelper.queueForScriptExcute`).
- Verificar e solicitar permissão TCC Automation por navegador (`ACBrowserAuthManager`, `ACBrowserAuthPanel`).
- Avaliar se cada URL aberta deve ser bloqueada (`-[ACMonitorTask websiteIsBlock:]`) e redirecionar a aba correspondente.

## Regras de Negócio
- Navegadores suportados (10): Chrome (`com.google.Chrome`), Safari (`com.apple.Safari`), Edge (`com.microsoft.edgemac`), Brave (`com.brave.Browser`), Opera (`com.operasoftware.Opera`), Opera GX (`com.operasoftware.OperaGX`), Arc (`company.thebrowser.Browser`), Ecosia (`org.ecosia.browser`), Dia (`company.thebrowser.dia`) e Firefox (`org.mozilla.firefox`). 🟢
- `whiteWebsites` (*Always Allow*) tem precedência absoluta sobre qualquer regra de bloqueio, inclusive sobre `blockAll == YES`. 🟢
- Palavras-chave separadas por vírgula exigem que a URL contenha **todas** as palavras simultaneamente (lógica `AND`). 🟢
- A URL de destino padrão do redirecionamento é `https://www.cisdem.com/blocked-website.html`, podendo ser alterada por `customRedirectionURLString` (desde que comece com `http://` ou `https://`). 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|---|---|---|---|
| RF-WEB-01 | Ler URLs da aba ativa (`getActiveURLsWithCompleteHandler:`) e de todas as abas (`getOpenedURLsWithCompleteHandler:`) via AppleScript. | Must | Extrair lista de `NSURL` de todas as janelas do navegador ativo. |
| RF-WEB-02 | Avaliar regras de domínio, subdomínio, palavras-chave combinadas por vírgula, `blockAll` e exceções (`whiteWebsites` / `blackWebsites`). | Must | `-[ACMonitorTask websiteIsBlock:]` retorna `YES` apenas para URLs proibidas no horário atual. |
| RF-WEB-03 | Redirecionar aba bloqueada para `https://www.cisdem.com/blocked-website.html` (ou URL customizada) via AppleScript, com fallback de fechar aba + abrir nova aba. | Must | Aba bloqueada navega imediatamente para `blockToURL` sem entrar em loop infinito. |
| RF-WEB-04 | Inspecionar e solicitar permissão TCC Automation (`AEDeterminePermissionToAutomateTarget`) com painel de status por navegador (`ACBrowserAuthPanel`). | Should | Exibir status `Authorized` / `Denied` / `Authorize` e abrir Configurações do Sistema quando negado. |
| RF-WEB-05 | Fornecer 11 categorias de sites populares (`ACPopularURLs` via `Assets.car`) e importação/exportação `.txt`. | Should | Permitir bloqueio em 1 clique por categoria e importação em lote. |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|---|---|---|---|
| Concorrência | Execução de `NSAppleScript` isolada em fila GCD serial (`queueForScriptExcute`) para não travar a main thread. | `ACScriptHelper:0x100041688` | 🟢 |
| Usabilidade | Dica automática de palavras-chave combinadas (`ACCommaHintHelper`) exibida no máximo 1 vez por dia (`AC_CommaHint_LastDate`). | `ACCommaHintHelper:0x10003b0c4` | 🟢 |

## Critérios de Aceitação

```gherkin
Dado que o Web Block está ativo e "youtube.com" está na Blocklist
Quando o usuário abre "https://www.youtube.com/watch?v=123" no Google Chrome, Safari, Arc ou Dia
Então o AppCrypt detecta a URL no próximo tick do monitorTimer e redireciona a aba para "https://www.cisdem.com/blocked-website.html"

Dado que o usuário cadastrou a keyword combinada "work, meeting"
Quando o usuário acessa uma URL contendo ambos os termos "work" e "meeting"
Então a página é bloqueada e redirecionada; se contiver apenas um dos termos, a página é permitida
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|---|---|---|
| Polling AppleScript + Avaliação `-websiteIsBlock:` + Redirecionamento | Must | Núcleo funcional do bloqueio de websites |
| Painel de Autorização TCC (`ACBrowserAuthManager` / `ACBrowserAuthPanel`) | Must | Sem permissão TCC Automation o bloqueio web não funciona no macOS |
| Exceções Globais (`Always Allow` / `Always Block`) e `blockAll` | Should | Essencial para controle parental / foco estrito |
| Categorias `ACPopularURLs` e `ACQuickAddWebCtr` | Could | Conveniência de cadastro rápido |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---|---|---|
| `Contents/MacOS/Cisdem AppCrypt` | `ACMonitorBrowser` + 10 subclasses (`0x100039064`–`0x10004a4b8`) | 🟢 |
| `Contents/MacOS/Cisdem AppCrypt` | `ACScriptHelper` (`0x10004157c`–`0x100041e88`) | 🟢 |
| `Contents/MacOS/Cisdem AppCrypt` | `ACBrowserAuthManager` & `ACBrowserAuthPanel` (`0x10003b97c`–`0x100041000`) | 🟢 |
| `Contents/MacOS/Cisdem AppCrypt` | `ACPopularURLs` (`0x1000496c8`–`0x10004a24c`) & `ACWebListFile` (`0x1000065c0`–`0x100006bf4`) | 🟢 |
