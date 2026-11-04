# ADR-001: Bloqueio de Websites via Polling AppleEvents (`NSAppleScript`) em vez de Extensão de Rede

- **Status:** Aceito (Extraído retroativamente da versão 7.11.0)
- **Confiança:** 🟢 CONFIRMADO (`ACMonitorBrowser`, `ACScriptHelper`, `ACBrowserAuthManager`)

---

## Contexto

Um bloqueador de sites no macOS precisa interceptar a navegação em múltiplos navegadores (Safari, Chrome, Edge, Brave, Opera, Opera GX, Arc, Ecosia, Dia) para aplicar regras de bloqueio por domínio, URL, palavras-chave combinadas e horários agendados, redirecionando o usuário para `https://www.cisdem.com/blocked-website.html` (ou uma URL customizada), inclusive em navegação HTTPS.

## Decisão

Implementar o bloqueio de websites inteiramente em userland por meio de **polling periódico de AppleEvents (`NSAppleScript`)** executado em uma fila GCD serial (`ACScriptHelper.queueForScriptExcute`), consultando `get URL of active tab of every window` (ou `current tab` no Safari) e reescrevendo a propriedade `URL` da aba bloqueada via AppleScript (`set URL of the_tab to "https://www.cisdem.com/blocked-website.html"`).

Para viabilizar essa comunicação sob o Hardened Runtime do macOS, o binário declara o entitlement `com.apple.security.automation.apple-events` acompanhado da lista `com.apple.security.temporary-exception.apple-events` para os 10 Bundle IDs suportados, e gerencia o consentimento do usuário via `ACBrowserAuthManager` (`AEDeterminePermissionToAutomateTarget`).

## Alternativas Consideradas

1. **Modificação de `/etc/hosts`:**
   - Exige privilégios de `root` a cada ativação/desativação ou mudança de horário (`Schedule`).
   - Não permite bloquear caminhos de URL específicos nem palavras-chave na URL (`matchKeywordItem:withURL:`), nem redirecionar limpiamente conexões HTTPS (devido a HSTS e validação de certificado TLS) para `https://www.cisdem.com/blocked-website.html`.
2. **`NetworkExtension` (`NEFilterDataProvider` / `NEPacketTunnelProvider`):**
   - Exige entitlement especial restrito da Apple (`com.apple.developer.networking.networkextension`), aprovação de System Extension pelo usuário no boot/Configurações e não consegue redirecionar uma requisição HTTPS para outra página HTTPS sem instalar uma CA raiz MITM no Keychain.
3. **Extensões de Navegador (WebExtensions):**
   - Exigiria instalar e manter extensões separadas na Chrome Web Store, Safari Extensions e Firefox Add-ons, que o usuário poderia desinstalar facilmente dentro do próprio navegador.

## Consequências

### Positivas
- Funciona transparentemente em páginas HTTPS sem necessidade de proxy MITM, certificado raiz ou privilégio `root`.
- Permite inspecionar a URL completa (incluindo path e query string) para aplicar regras de palavras-chave combinadas por vírgula (`AND`).
- Redireciona a aba diretamente para `https://www.cisdem.com/blocked-website.html` sem erro de TLS no navegador.

### Negativas / Limitações Técnicas
- **Dependência de Suporte a AppleScript no Navegador:** Navegadores que não expõem suas abas via dicionário AppleScript — notadamente o **Mozilla Firefox** (`ACMonitorFirfoxBrowser` implementa apenas `-browserName` e herda o script padrão Chromium, que falha no Firefox) ou navegadores não listados nos 10 Bundle IDs — não podem ter abas lidas/redirecionadas por esse método.
- **Latência de Polling e Consumo de IPC:** Há uma pequena janela de tempo (intervalo do `monitorTimer`) entre a abertura da URL e o disparo do AppleScript de redirecionamento, além de tráfego constante de AppleEvents enquanto o navegador está ativo.
- **Atrito de Permissão TCC (`Privacy_Automation`):** O usuário precisa autorizar cada navegador individualmente (mitigado na v7.11.0 pelo painel dedicado `ACBrowserAuthPanel`).
