# Checkpoint de Sessão — Concepção, Arquitetura, Design CCAT e Plano MVP do monBlock

- **Data:** 2026-11-04
- **Status:** Especificação, Design System CCAT, Tela de Bloqueio, Plano de Implementação e ADRs concluídos e sincronizados no Harness. Aguardando decisão de início da implementação das Tasks 1–6 do Plano MVP.

---

## 1. Artefatos Canônicos do Projeto

| Domínio | Caminho Absoluto | Papel |
| :--- | :--- | :--- |
| **Arquitetura Consolidada** | `/Users/matheus.diniz_1/Documents/GitHub/monBlock/docs/architecture/ARCHITECTURE_SPEC.md` | Especificação de arquitetura de sistemas (Camadas 1-3, IPC Zod, SQLite WAL, Tripla Persistência, Máquina de Estados, Sequências) |
| **Design Spec do MVP** | `/Users/matheus.diniz_1/Documents/GitHub/monBlock/docs/ai/specs/2026-11-04-monblock-mvp-design.md` | Especificação técnica e funcional detalhada do MVP Fase 1 (auditada via `/plan-criticize`) |
| **Plano de Implementação MVP** | `/Users/matheus.diniz_1/Documents/GitHub/monBlock/docs/ai/plans/2026-11-04-monblock-mvp-plan.md` | Plano de execução TDD em 6 Tasks com código TypeScript/Vitest completo (auditado via `/plan-criticize`) |
| **Design Tokens CCAT** | `/Users/matheus.diniz_1/Documents/GitHub/monBlock/docs/design/tokens.css` | Tokens CSS oficiais com 4 temas (Capycro diurno, Dark Tech noturno automático, Light Fintech, High Contrast AAA) e regra Zero Roxo |
| **Guia do Design System** | `/Users/matheus.diniz_1/Documents/GitHub/monBlock/docs/design/design.md` | Diretrizes visuais, tipografia, paleta semântica, acessibilidade WCAG 2.2 AA/AAA e componentes |
| **Tela de Bloqueio Interativa** | `/Users/matheus.diniz_1/Documents/GitHub/monBlock/docs/design/blocked-page.html` | Página de bloqueio autocontida com respiração 4-4-4, Card 1 focado no usuário e Card 2 com `.ccat-select`, `.ccat-segmented`, `.ccat-input`, `.ccat-btn` |
| **ADR 0001** | `/Users/matheus.diniz_1/Documents/GitHub/monBlock/docs/adrs/0001-arquitetura-split-privilegiada-daemon-monblockd.md` | Separação entre UI Electron desprivilegiada e Daemon Root `monblockd` |
| **ADR 0002** | `/Users/matheus.diniz_1/Documents/GitHub/monBlock/docs/adrs/0002-bloqueio-web-em-3-camadas-hosts-policies-watcher.md` | Defesa Web em 3 camadas (`/etc/hosts` atômico + Browser Policies + Watcher AppleEvents/`AXUIElement`) |
| **ADR 0003** | `/Users/matheus.diniz_1/Documents/GitHub/monBlock/docs/adrs/0003-catraca-unidirecional-append-only-e-aprovacao-ajudante.md` | Catraca Unidirecional `Append-Only` e aprovação pelo Ajudante (Telegram Bot + Token HMAC + Senha Argon2id/scrypt) |
| **ADR 0004** | `/Users/matheus.diniz_1/Documents/GitHub/monBlock/docs/adrs/0004-pareamento-duravel-tripla-persistencia-e-recuperacao-3-niveis.md` | Tripla Persistência Self-Healing do Ajudante e Recuperação de Senha em 3 níveis |

---

## 2. Decisões Técnicas e de Produto Consolidadas (R1–R3)

1. **Catraca Unidirecional (`Append-Only`):**
   - Usuário adiciona domínios, palavras-chave, ativa as 11 categorias pré-cadastradas (*Conteúdo Adulto* já ativo/trancado de fábrica) e tranca a flag opcional de Modo Anônimo sem senha.
   - Nenhuma remoção, desativação ou pausa ocorre sem assinatura HMAC ou senha do Ajudante.
2. **Defesa Web Resiliente em 3 Camadas:**
   - `/etc/hosts` atômico com backup `.bak`, `chflags uchg`, DNS Family `1.1.1.3` e `FSEvents`.
   - Enterprise Browser Policies (`.plist` para Chromium/Safari e `policies.json` para Firefox) desativando DoH e controlando Modo Anônimo.
   - Watcher Universal (AppleEvents + `AXUIElement` para cobrir inclusive o Firefox).
3. **Ajudante Custo R$ 0 + Recuperação em 3 Níveis:**
   - Bot do Telegram + Token `HMAC-SHA256` (`crypto.timingSafeEqual` + anti-replay) + Senha Mestra (`Argon2id`/`scrypt`).
   - Raio-X com Blur Gaussiano forte por padrão e botão *"Revelar Imagem"* exclusivo para o Ajudante.
   - Recuperação via `/reset_senha` no Telegram (Nível 1), 5 códigos de uso único (Nível 2) ou Cooldown Time-Lock de 72h mantendo 100% do bloqueio ativo (Nível 3).
4. **Pareamento Durável (Tripla Persistência Self-Healing):**
   - SQLite primário (`0600`) + macOS System Keychain + `/var/db/monblock/partner.seal` (`AES-256-GCM` + `chflags schg,uchg`).

---

## 3. Próximos Passos

1. Aprovação formal do usuário sobre a Spec (`docs/ai/specs/2026-11-04-monblock-mvp-design.md`) e o Plano (`docs/ai/plans/2026-11-04-monblock-mvp-plan.md`).
2. Execução das Tasks 1 a 6 do Plano MVP via TDD (Vitest + TypeScript Strict):
   - **Task 1:** Contratos compartilhados, `CRITICAL_ALLOWLIST`, `11 categorias` e schemas Zod IPC.
   - **Task 2:** Motor criptográfico (`scrypt`/`Argon2id`, `HMAC-SHA256` `timingSafeEqual`, 5 códigos de recuperação) e `PartnerSealManager` (3 cofres).
   - **Task 3:** Store SQLite com Catraca Unidirecional (`Append-Only`), anti-replay e Cooldown Time-Lock de 72h.
   - **Task 4:** `MacOSPlatformEnforcer` (`/etc/hosts` atômico, Browser Policies `.plist`/`policies.json`, parser de URL/keywords).
   - **Task 5:** Servidor HTTP local (`127.0.0.1:49152/blocked`) com `RFC 9457 Problem Details`, headers CSP e integração com `docs/design/blocked-page.html`.
   - **Task 6:** Cliente Bot do Telegram (alertas com Blur, inline callbacks, `/gerar_token` e `/reset_senha`).
