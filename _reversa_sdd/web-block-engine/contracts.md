# Unit: `web-block-engine`, Contratos de Protocolo (AppleEvents, Redirecionamento HTTP e Formatos)

> Extraído do binário Mach-O e de `Assets.car` (`doc_level = detalhado`, 🟢 CONFIRMADO).

---

## 1. Contrato de Entitlements e Alvos AppleEvents (`Info.plist` / Code Signature)

| Target Bundle Identifier | Nome Comercial | Classe Handler no AppCrypt | Cor Hex no `ACBrowserAuthPanel` | Dialeto AppleScript | Confiança |
|---|---|---|---|---|---|
| `com.google.Chrome` | Google Chrome | `ACMonitorChromeBrowser` | `#39c4ff` / `#fbc02d` | Chromium (`active tab`) | 🟢 CONFIRMADO |
| `com.apple.Safari` | Safari | `ACMonitorSafariBrowser` | `#0b62a8` | Safari (`current tab` + `close_list`) | 🟢 CONFIRMADO |
| `com.microsoft.edgemac` | Microsoft Edge | `ACMonitorEdgeBrowser` | `#008b69` | Chromium (`active tab`) | 🟢 CONFIRMADO |
| `com.brave.Browser` | Brave Browser | `ACMonitorBraveBrowser` | `#fb542b` | Chromium (`active tab`) | 🟢 CONFIRMADO |
| `com.operasoftware.Opera` | Opera | `ACMonitorOperaBrowser` | `#ff1b2d` | Chromium (`active tab`) | 🟢 CONFIRMADO |
| `com.operasoftware.OperaGX` | Opera GX | `ACMonitorOperaGXBrowser` | `#a946ff` | Chromium (`active tab`) | 🟢 CONFIRMADO |
| `company.thebrowser.Browser` | Arc | `ACMonitorArcBrowser` | `#7c5cfc` | Arc/Dia (`tab t of window w`) | 🟢 CONFIRMADO |
| `org.ecosia.browser` | Ecosia | `ACMonitorEcosiaBrowser` | `#008b69` | Chromium (`active tab`) | 🟢 CONFIRMADO |
| `company.thebrowser.dia` | Dia | `ACMonitorDiaBrowser` | `#ff6b35` | Arc/Dia (`tab t of window w`) | 🟢 CONFIRMADO |
| `org.mozilla.firefox` | Firefox | `ACMonitorFirfoxBrowser` | `#888888` | Herda Chromium (não funcional no Firefox) | 🟢 CONFIRMADO |

---

## 2. Contrato de Redirecionamento Web (`blockToURL`)

- **URL Padrão de Bloqueio:**
  ```text
  https://www.cisdem.com/blocked-website.html
  ```
  - **Comportamento da Página (`https://www.cisdem.com/blocked-website.html`):** Página estática HTTPS hospedada nos servidores da Cisdem (sem query parameters dinâmicos injetados pelo app). Não recebe o domínio bloqueado na URL; serve apenas como landing page informativa indicando que o site foi bloqueado pelo Cisdem AppCrypt. 🟢 CONFIRMADO
- **URL Customizada (`ACPreferences.customRedirectionURLString`):**
  - Habilitada quando `ACPreferences.customRedirection == YES`.
  - Validação obrigatória: deve começar com `http://` ou `https://`.

---

## 3. Contrato do Catálogo `popularURLs` (`Assets.car`)

- **Localização:** `Contents/Resources/Assets.car` → `NSDataAsset` nomeado `"popularURLs"` (`UTI = com.apple.property-list`, `32.945 bytes`, SHA-1 `A761561E02C889DC97389C003E9CD7E1652B6F5630977A13C4900DF977DE7BDE`).
- **Estrutura XML Property List:** Dicionário raiz contendo 11 chaves (`NSArray<NSString *>` de domínios cada):
  1. `Dating Sites`
  2. `Email Sites`
  3. `Gambling Sites`
  4. `Games Sites`
  5. `News Sites`
  6. `Porn Sites`
  7. `Proxy Sites`
  8. `Search Engines`
  9. `Shopping Sites`
  10. `Social Sites`
  11. `Video Sites`
