---
name: project-monblock-vision
description: Visão de produto, regras de negócio, Catraca Append-Only, Ajudante via Telegram/HMAC e recuperação em 3 níveis do monBlock
type: project
tags: [monblock, product, accountability, mvp, electron, telegram, append-only]
applies_to: [docs/architecture/ARCHITECTURE_SPEC.md, docs/ai/specs/2026-11-04-monblock-mvp-design.md, docs/ai/plans/2026-11-04-monblock-mvp-plan.md]
relations:
  - type: see_also
    target: architecture.md
  - type: see_also
    target: decisions.md
---

O projeto `monBlock` é um aplicativo desktop multiplataforma (Electron: macOS MVP Fase 1, preparado para Windows e Linux via interface `PlatformEnforcer`) voltado ao bloqueio resiliente de conteúdo nocivo e responsabilidade compartilhada (*Accountability Partner* / "Ajudante").

**Why:** O acesso impulsivo a conteúdo adulto, apostas e distrações derrota bloqueadores convencionais quando o próprio usuário consegue desativá-los sozinho em momentos de vulnerabilidade.

**How to apply:**
- **Catraca Unidirecional (`Append-Only`):** O usuário pode adicionar livremente domínios, palavras-chave, ativar categorias e trancar flags protetoras a qualquer instante (zero fricção para endurecer). O usuário **nunca** pode remover, editar para afrouxar, pausar ou desbloquear sem autorização criptográfica do Ajudante.
- **11 Categorias Pré-Cadastradas:**
  - *Conteúdo Adulto / Pornografia* vem **ativo e trancado por padrão** desde a instalação.
  - Outras 10 categorias pré-cadastradas prontas para ativação com 1 clique: *Apostas / Cassinos / Bets*, *Jogos Online*, *Proxies / VPNs / Bypass*, *Redes Sociais*, *Streaming & Vídeo*, *Fóruns & Imageboards*, *Relacionamento / Dating*, *Compras por Impulso*, *Notícias & Doomscrolling*, *IA Generativa NSFW*.
- **Flag Opcional Trancável para Modo Anônimo / Incognito:** O usuário pode ativar e trancar (append-only) o bloqueio de janelas anônimas/privadas (`IncognitoModeAvailability = 1` / `DisablePrivateBrowsing = true`) via Enterprise Browser Policies; depois de trancado, apenas o Ajudante pode destrancar.
- **Aprovação pelo Ajudante (Custo R$ 0 de Infra):**
  1. **Bot do Telegram (Custo Zero):** Notificação rica ao Ajudante com botões inline (*Aprovar 15 min*, *Aprovar 1h*, *Aprovar Permanente*, *Negar*) e comando `/gerar_token`.
  2. **Token de Uso Único Assinado (`HMAC-SHA256`):** Formato `MB1-<window>-<scopeHash>-<dur>-<hmac16>`, validado offline com `crypto.timingSafeEqual` e tabela anti-replay `used_tokens`.
  3. **Senha Mestra Local do Ajudante:** Derivada via `Argon2id` / `crypto.scryptSync` com salt aleatório de 32 bytes.
- **Raio-X Contextual com Proteção de Privacidade:** Quando o usuário pede desbloqueio, o sistema extrai metadados sanitizados e captura screenshot em janela offscreen isolada (`sandbox: true`, `persist:xray-ephemeral`) aplicando **Blur Gaussiano forte por padrão** + botão explícito *"Revelar Imagem"* exclusivo para o Ajudante.
- **Recuperação de Senha / Ajudante em 3 Níveis:**
  1. **Nível 1 (Instantâneo):** Comando `/reset_senha` pelo Ajudante no Bot do Telegram.
  2. **Nível 2 (Instantâneo Offline):** **5 Códigos de Recuperação de Uso Único** gerados no onboarding e entregues ao Ajudante (armazenados apenas como hashes `Argon2id`/`scrypt`).
  3. **Nível 3 (Emergência Solitária):** **Cooldown Time-Lock de 72 horas** ininterruptas com alertas diários ao Telegram do Ajudante e no desktop, **mantendo 100% do bloqueio ativo** durante as 72h.
- **Roadmap em Fases:**
  - **Fase 1 (MVP macOS):** Bloqueio web em 3 camadas + Catraca Append-Only + 11 categorias + Ajudante via Telegram/Token HMAC/Senha + Recuperação 3 níveis + Tela de Bloqueio CCAT.
  - **Fase 2:** Bloqueio de aplicativos desktop e proteção contra encerramento de apps.
  - **Fase 3:** Inspeção de conteúdo in-app e expansão multi-OS completa (Windows/Linux).
