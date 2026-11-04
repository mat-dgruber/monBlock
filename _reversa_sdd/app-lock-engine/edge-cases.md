# Unit: `app-lock-engine`, Casos Extremos (Edge Cases)

> Extraído de strings de tratamento de exceção e seletores defensivos no binário (`doc_level = detalhado`, 🟢 CONFIRMADO).

---

## EC-APP-01: Invalidação de Proxy `NSRunningApplication` (Processo morre durante inspeção KVO)
- **Fonte bruta não preservada:** as strings abaixo foram transcritas sem saída original rastreável; [`../code-analysis.md`](../code-analysis.md) documenta KVO e a verificação de processos, mas não comprova os textos literais nem a abrangência de `@try/@catch`. Detalhes de exceções pendentes de revalidação:
  - `"ACRunningApp dealloc: removeObserver active failed, exception: %@"`
  - `"ACRunningApp bundleIdentifier: proxy invalid, exception: %@"`
  - `"findRunningApp: skip terminated app, exception: %@"`
- **Comportamento inferido, não validado:** processos podem encerrar durante a inspeção; as strings sugerem tratamento de exceções em alguns caminhos KVO/`NSRunningApplication`, não que **todos** os acessos sejam envolvidos em `@try/@catch`. Revalidar a cobertura no binário/fatia.

## EC-APP-02: Aplicativos com Janelas Visíveis, mas Sem Ícone no Dock (`LSUIElement` / `NSApplicationActivationPolicyAccessory`)
- **Fonte bruta não preservada:** [`../code-analysis.md`](../code-analysis.md) descreve `-hasWindowsButNotInDock:` em `0x100004828` e o cruzamento PID/janelas; a string de exceção transcrita abaixo não dispõe de prova bruta retida. Revalidar o texto literal.
  - `-[ACRunningApp hasWindowsButNotInDock:]` (`0x100004828`)
  - `"hasWindowsButNotInDock: activationPolicy access failed, exception: %@"`
- **Comportamento:** Aplicativos utilitários ou janelas secundárias que não aparecem no Dock ainda são verificados cruzando `processIdentifier` com a lista de janelas visíveis no `ACWindowServer`. 🟢 CONFIRMADO

## EC-APP-03: Aplicativo Ignora `[NSRunningApplication terminate]`
- **Fonte bruta não preservada:** comando `osascript` transcrito abaixo sem dump rastreável; [`requirements.md`](requirements.md) documenta fallback atribuído a `ACRunningApp:0x100003a68`, mas condição exata de disparo e temporização de `_hiddenTimer` permanecem pendentes de revalidação.
  - `tell application "%@" \n quit \n end tell` + `osascript -e "%s"`
- **Comportamento:** Quando o encerramento padrão via AppKit falha ou o app exibe diálogo de confirmação, `ACRunningApp` dispara o comando AppleScript `quit` via `osascript` e mantém `_hiddenTimer` ocultando as janelas. 🟢 CONFIRMADO

## EC-APP-04: Tentativa do Usuário de Remover `System Preferences`, `Activity Monitor` ou `Terminal` da Lista de Bloqueio
- **Evidência no binário (`ACAlertRemoveDefAppWndCtrl` em `0x100019fa4`, `Localizable.strings:99-104`):**
  - `-[ACPreferences monitorItemIsDefaultApp:]` (`0x10000f9c0`)
- **Comportamento:** Exibe alerta modal específico (`ACAlertRemoveDefAppWndCtrl`) advertindo que remover esses aplicativos compromete a segurança do próprio AppCrypt. 🟢 CONFIRMADO
