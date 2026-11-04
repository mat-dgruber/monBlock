# Unit: `web-block-engine`, Casos Extremos (Edge Cases)

> Extraído do binário Mach-O (`doc_level = detalhado`, 🟢 CONFIRMADO).

---

## EC-WEB-01: Mutação de Coleção de Abas Durante Fechamento no Safari
- **Fonte bruta não preservada:** `ACMonitorSafariBrowser -appleScriptForCloseURL:` (`0x1000412fc`); roteiro transcrito em [`../code-analysis.md`](../code-analysis.md) §2.4. A redação exata do script exige revalidação na fonte original:
  - `set close_list to {}` → `set close_list to {the_tab} & close_list` → `repeat with the_tab in close_list` → `close the_tab`.
- **Motivo Técnico:** No Safari, executar `close the_tab` dentro de `repeat with the_tab in every tab of the_wnd` altera o array de abas durante a iteração e faz o AppleScript pular abas adjacentes ou lançar erro de índice. Acumular em `close_list` antes de fechar resolve o bug. 🟢 CONFIRMADO

## EC-WEB-02: Referência de Objeto de Aba no Arc e Dia (`ACMonitorArcBrowser` / `ACMonitorDiaBrowser`)
- **Fonte bruta não preservada:** overrides de `ACMonitorArcBrowser` (`0x10004a27c`) e `ACMonitorDiaBrowser` (`0x10004a4b8`) e AppleScript indexado transcrito em [`../code-analysis.md`](../code-analysis.md) §2.4; falha do `for-each` no runtime não demonstrada:
  - Usa `repeat with w from 1 to wndCount` e `repeat with t from 1 to tabCount` acessando `URL of tab t of window w`.
- **Motivo técnico hipotético:** A indexação de janelas/abas aparece no script transcrito; a alegação de falha de referência AppleEvent usando variável `for-each` precisa de reprodução autorizada. 🟡 INFERIDO

## EC-WEB-03: Navegador Fechado Quando o Usuário Clica em "Authorize" no `ACBrowserAuthPanel`
- **Evidência no binário (`ACBrowserAuthManager requestAuthForBundleID:` em `0x10003c5fc`; fonte bruta não preservada, ver [`../code-analysis.md`](../code-analysis.md) §2 para o fluxo transcrito, pendente de revalidação):**
  - Invoca `/usr/bin/open` com `--args --no-startup-window`.
- **Motivo Técnico:** A API `AEDeterminePermissionToAutomateTarget` do macOS exige que o processo alvo esteja em execução (ou seja lançado) para registrar o consentimento TCC, por isso o AppCrypt inicia o navegador sem janela inicial. 🟢 CONFIRMADO
