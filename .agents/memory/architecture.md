---
name: architecture-reference-and-monblock
description: Arquitetura Split Privilegiada (Electron + monblockd + PlatformEnforcer), bloqueio web em 3 camadas e Tripla Persistência Self-Healing
type: architecture_decision
tags: [architecture, electron, daemon, monblockd, web-block, hosts, browser-policies, keychain, sqlite]
applies_to: [docs/architecture/ARCHITECTURE_SPEC.md, docs/ai/specs/2026-11-04-monblock-mvp-design.md, docs/adrs/0001-arquitetura-split-privilegiada-daemon-monblockd.md, docs/adrs/0002-bloqueio-web-em-3-camadas-hosts-policies-watcher.md]
relations:
  - type: depends_on
    target: project.md
  - type: see_also
    target: decisions.md
---

A arquitetura do `monBlock` supera as limitações do app de referência mapeado em `_reversa_sdd/` (Cisdem AppCrypt v7.11.0, que dependia apenas de polling userland via AppleEvents e hash MD5) adotando uma **Arquitetura Split Privilegiada em 3 Camadas**:

1. **Camada 1 — UI Desprivilegiada (`Electron App`):**
   - Roda no usuário comum com tríade Zero-Trust (`nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`).
   - Se o usuário fechar a janela ou executar `kill -9` no Electron, **o bloqueio permanece 100% ativo**.

2. **Camada 2 — Daemon Privilegiado Resiliente (`monblockd`):**
   - Roda como `root` via `LaunchDaemon` (`/Library/LaunchDaemons/com.monblock.daemon.plist` com `KeepAlive: true` e `RunAtLoad: true`).
   - Comunica-se com a UI via Unix Domain Socket `/var/run/monblockd.sock` validando payloads com schemas **Zod** estritos e impondo a Catraca `Append-Only`.
   - Expõe servidor HTTP local em `127.0.0.1:49152` para servir a Tela de Bloqueio (`GET /blocked`) e endpoints de desbloqueio/Raio-X, padronizando erros com **RFC 9457 Problem Details** (`application/problem+json`).

3. **Camada 3 — Abstração Multi-OS (`PlatformEnforcer`) e Defesa Web em 3 Camadas:**
   - **Camada Web 1 (Rede/DNS — `/etc/hosts` Atômico + DNS Family):**
     - Escrita atômica entre `# >>> MONBLOCK START` e `# <<< MONBLOCK END` via arquivo temporário + `rename()`, com backup `/etc/hosts.monblock.bak`, trava imutável `chflags uchg /etc/hosts`, flush de cache DNS (`dscacheutil -flushcache` + `killall -HUP mDNSResponder`) e `FSEvents` para restauração imediata (< 100ms).
     - Enforça DNS Family (`1.1.1.3` / `1.0.0.3` Cloudflare Malware + Adult Content) e desativa DoH nos navegadores para impedir contorno de `/etc/hosts`.
   - **Camada Web 2 (Enterprise Browser Policies Nativas):**
     - Aplica `URLBlocklist`, `URLAllowlist`, `DnsOverHttpsMode = off` e flag opcional trancável de **Modo Anônimo** (`IncognitoModeAvailability = 1` / `DisablePrivateBrowsing = true`) em `/Library/Managed Preferences/` (Chrome, Brave, Edge, Arc, Vivaldi, Opera) e `distribution/policies.json` (Firefox).
   - **Camada Web 3 (Watcher Universal de URLs e Palavras-Chave):**
     - Combina AppleEvents (`NSAppleScript`) para Chromium/Safari com **macOS Accessibility API (`AXUIElement`)** para ler a barra de endereços (`AXTextField`) e título da janela do **Firefox** e navegadores derivados sem depender de extensões desinstaláveis.
     - Redireciona abas bloqueadas para `http://127.0.0.1:49152/blocked?...` com guarda anti-loop (`127.0.0.1:49152` nunca é bloqueado).

4. **Allowlist Crítica Imutável (Anti-Lockout):**
   - Hardcoded no binário do daemon: `localhost`, `127.0.0.1`, `::1`, `api.telegram.org` (garante comunicação com o Ajudante), e domínios de OAuth/SSO essenciais (`accounts.google.com`, `appleid.apple.com`, `login.microsoftonline.com`).
   - Precedência estrita: `CRITICAL_ALLOWLIST` > `Allowlist do Ajudante` > `Blocklist / Categorias / Palavras-chave`.

5. **Tripla Persistência Self-Healing do Vínculo do Ajudante:**
   - O registro do Ajudante (`partner_config` + `hmac_secret` + hashes de recuperação) é replicado em 3 cofres independentes:
     1. **SQLite Primário (WAL):** `/Library/Application Support/monBlock/monblock.db` (`root:wheel`, `0600`).
     2. **macOS System Keychain:** `/Library/Keychains/System.keychain` (`service = com.monblock.partner.seal`).
     3. **Shadow Seal Imutável:** `/var/db/monblock/partner.seal` (`AES-256-GCM` + `chflags schg,uchg`).
   - No boot e a cada 30s, `reconcilePartnerSeal()` reconstrói qualquer cofre ausente/corrompido a partir dos sobreviventes (quórum >= 1) e entra em **Lockdown Fail-Closed** se houver adulteração.
