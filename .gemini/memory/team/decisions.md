---
name: security-and-adr-decisions
description: Decisões R1-R3 aprovadas, criptografia Argon2id/scrypt + HMAC-SHA256, privacidade do Raio-X e Design System CCAT (Zero Roxo)
type: architecture_decision
tags: [security, adr, cryptography, design-system, ccat, ux, telegram, recovery]
applies_to: [docs/adrs/0001-arquitetura-split-privilegiada-daemon-monblockd.md, docs/adrs/0002-bloqueio-web-em-3-camadas-hosts-policies-watcher.md, docs/adrs/0003-catraca-unidirecional-append-only-e-aprovacao-ajudante.md, docs/adrs/0004-pareamento-duravel-tripla-persistencia-e-recuperacao-3-niveis.md, docs/design/tokens.css, docs/design/blocked-page.html]
relations:
  - type: depends_on
    target: architecture.md
  - type: see_also
    target: project.md
---

Decisões arquiteturais, criptográficas e de Design/UX consolidadas nas sabatinas R1-R3 e formalizadas nas ADRs `0001` a `0004`:

1. **Consolidação R1-R3 (Arquitetura, Produto e Resiliência):**
   - **ADR-0001 (`docs/adrs/0001-arquitetura-split-privilegiada-daemon-monblockd.md`):** Separação entre UI Electron desprivilegiada e Daemon Root `monblockd` via IPC Unix Socket validado por Zod.
   - **ADR-0002 (`docs/adrs/0002-bloqueio-web-em-3-camadas-hosts-policies-watcher.md`):** Bloqueio Web em 3 camadas (`/etc/hosts` atômico com `.bak` + `chflags uchg` + DNS Family `1.1.1.3`; Enterprise Browser Policies `.plist`/`policies.json` com flag opcional de Modo Anônimo; Watcher Universal AppleEvents + `AXUIElement` cobrindo Firefox).
   - **ADR-0003 (`docs/adrs/0003-catraca-unidirecional-append-only-e-aprovacao-ajudante.md`):** Catraca Unidirecional `Append-Only`, aprovação pelo Ajudante a custo zero via Bot do Telegram + Token `HMAC-SHA256` (`crypto.timingSafeEqual` + nonce anti-replay) + Senha Mestra `Argon2id`/`scrypt` (`N=32768, r=8, p=1, keylen=64`).
   - **ADR-0004 (`docs/adrs/0004-pareamento-duravel-tripla-persistencia-e-recuperacao-3-niveis.md`):** Pareamento durável do Ajudante com Tripla Persistência Self-Healing (SQLite `0600` + System Keychain + `/var/db/monblock/partner.seal`) e Recuperação de Senha em 3 Níveis (`/reset_senha` Telegram, 5 códigos de recuperação de uso único, Cooldown Time-Lock de 72h com bloqueio 100% ativo).

2. **Privacidade e Segurança no Raio-X Contextual:**
   - A captura de tela da URL bloqueada ocorre em `BrowserWindow` offscreen efêmera (`sandbox: true`, `persist:xray-ephemeral`, timeout rígido de 4s), redimensionada para `800x450` JPEG.
   - A imagem é enviada ao Ajudante com **Blur Gaussiano forte aplicado por padrão** e exige clique explícito em *"Revelar Imagem"* (evitando exposição acidental a conteúdo explícito).
   - Sanitização de URLs remove query params sensíveis (`token`, `code`, `session`, `password`, `key`) antes do envio ao Telegram.

3. **Design System Oficial CCAT (`docs/design/tokens.css` e `docs/design/blocked-page.html`):**
   - **Regra Zero Roxo:** Proibição absoluta de tons de roxo/violeta/indigo em qualquer superfície.
   - **4 Temas Oficiais com Troca Automática Diurna/Noturna:**
     1. `:root` (**Capycro Warm Ivory — Diurno Padrão 06h–18h**): Fundo creme quente `#F5F2EB`, texto `#161514`, acento âmbar terracota `#B85020` e verde sálvia `#236B48`.
     2. `[data-theme="dark-tech"]` (**Dark Tech — Noturno Padrão 18h–06h**): Obsidian `#090D16`, ciano `#0EA5E9`, esmeralda `#10B981`.
     3. `[data-theme="light-fintech"]` (**Light Fintech Clean**): Alabaster `#F8FAFC`, azul `#0284C7`.
     4. `[data-theme="high-contrast"]` (**High Contrast AAA**): Preto puro `#000000`, amarelo `#FFD600`, ciano `#00E5FF` (contraste > 14:1).
   - **Arquitetura da Tela de Bloqueio (`docs/design/blocked-page.html`):**
     - **Coluna 1 (Card de Contexto para o Usuário):** Exibe apenas a explicação clara do motivo do bloqueio (URL, regra/palavra-chave acionada, categoria, horário e status de proteção ativa) + micro-interação de respiração 4-4-4 e botão primário *"Voltar para local seguro"*. Sem detalhes técnicos internos do sistema.
     - **Coluna 2 (Painel de Ação com Componentes Customizados CCAT):** Todos os controles seguem os tokens CCAT (`.ccat-select` dropdown customizado com `role="listbox"`, `.ccat-segmented` segmented control para escopo/duração, `.ccat-input` com `font-family: var(--font-mono)` e `.ccat-btn` com estados e feedback `aria-live="polite"`).
