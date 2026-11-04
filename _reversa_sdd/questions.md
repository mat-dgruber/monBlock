# Perguntas de Alinhamento e Decisões Futuras (`questions.md`)

> Há lacunas técnicas na evidência estática do `Cisdem AppCrypt.app` (`v7.11.0`), inclusive modelos/endereço de agenda conflitantes e testes de comportamento pendentes (ver [`gaps.md`](gaps.md)). As perguntas abaixo orientam eventual evolução ou reimplementação (`monBlock`), sem pressupor paridade demonstrada.

---

## Q-01: Suporte Real ao Mozilla Firefox no Web Block (`web-block-engine`)
- **Contexto Descoberto no Binário:** A classe `ACMonitorFirfoxBrowser` (`0x1000495ec`) apenas sobrescreve `-browserName` (`"Firefox"`) e herda os scripts AppleScript do Chromium (`active tab of front window`), que falham no Firefox porque o Firefox para macOS não expõe dicionário AppleScript (`sdef`) para leitura ou escrita de URLs de abas.
- **Pergunta para Evolução:** Em uma implementação própria (`monBlock`), deseja-se substituir o bloqueio do Firefox por uma WebExtension nativa (`Native Messaging`) ou por um proxy local / Network Extension (`NEFilterDataProvider`)?

## Q-02: Modernização Criptográfica da Persistência (`security-and-persistence`)
- **Contexto Descoberto no Binário:** O AppCrypt armazena a senha como MD5 sem salt (`CC_MD5`) e grava o grafo de regras em texto claro estruturado (`bplist00` via `NSKeyedArchiver`) nos caminhos camuflados `com.apple.sdev/csdv.dsc` e `com.app.cadlvq/dgh.xvc`.
- **Pergunta para Evolução:** Em uma nova versão, devemos substituir `CC_MD5` por `Argon2id` / `PBKDF2-HMAC-SHA256` e cifrar o payload serializado com `AES-256-GCM` (usando chave derivada ou armazenada no Secure Enclave / Keychain)?

## Q-03: Substituição de Polling user-space por `EndpointSecurity` / `FamilyControls` (`app-lock-engine` & `self-defense-and-lifecycle`)
- **Contexto Descoberto no Binário:** O bloqueio de processos ocorre em user-space via KVO (`NSWorkspace`) + `CGWindowListCopyWindowInfo` + `terminate`/`osascript`, e a autodefesa usa `FSEvents` + `/usr/bin/tar`.
- **Pergunta para Evolução:** O projeto-alvo deve manter a arquitetura 100% user-space sem privilégios de `root` (como o Cisdem AppCrypt faz para simplificar a instalação), ou adotar um daemon `LaunchDaemon` privilegiado / `EndpointSecurity` (`ES_EVENT_TYPE_AUTH_EXEC`)?
