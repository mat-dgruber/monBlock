# 🛡️ Especificação de Design e Produto — monBlock (Fase 1: MVP)

- **Data:** 2026-11-04
- **Status:** 🟢 Aprovado & Blindado v2 pós `/plan-criticize`, `/security-audit` e `/design-review`
- **Governança de Artefatos:** Spec (`docs/ai/specs/2026-11-04-monblock-mvp-design.md`), Plano (`docs/ai/plans/2026-11-04-monblock-mvp-plan.md`), `docs/ai/reports/`, `docs/architecture/ARCHITECTURE_SPEC.md`, `docs/design/`
- **Plataforma Alvo do MVP:** macOS (`darwin`), com arquitetura `PlatformEnforcer` desacoplada para Windows (`win32`) e Linux (`linux`).
- **Identidade Visual:** Branding Oficial **CCAT** (`docs/design/tokens.css` — 4 Temas: `Capycro Wellness` [Padrão Diurno], `Escuro Tech` [Padrão Noturno], `Claro Fintech` e `Alto Contraste WCAG AAA`, contraste perceptual APCA `Lc >= 75`).

---

## 0. Restrições Técnicas, Limites & SLOs

- **Custo de Infraestrutura no MVP:** **R$ 0,00** (zero servidor backend próprio; comunicação remota via API pública do Bot do Telegram com Long-Polling HTTPS + Card HTML offline).
- **Latência & Performance:** `< 1ms` para bloqueio em `/etc/hosts`, `p95 < 400ms` para interceptação de abas/palavras-chave e `p95 < 3.000ms` para captura offscreen com Blur.
- **Memória e CPU:** Daemon `monblockd` com orçamento máximo de `50MB RAM` e `< 1% CPU`.
- **Limites de Dados:** Adição em lote de até `100 domínios` por operação (`RN-WEB-04`), suporte a listas com `100.000+ domínios` no `/etc/hosts` sem OOM (streaming IO) e truncamento de captura de página em `64KB` de texto DOM.

---

## 1. Problema & Visão do Produto

O acesso irrestrito à pornografia e jogos de azar na internet causa sérios danos pessoais. Bloqueadores comuns falham porque o próprio usuário consegue desativá-los em momentos de impulso. Além disso, conforme provado na engenharia reversa do aplicativo de referência (**Cisdem AppCrypt v7.11.0**, documentado em `_reversa_sdd/`), bloqueadores que operam apenas em espaço de usuário (*userland*) sofrem de 3 falhas críticas:
1. Podem ser encerrados via `kill -9` ou Monitor de Atividade.
2. Não bloqueiam em nível de rede/kernel (se o app estiver fechado, a máquina fica desprotegida).
3. Falham no **Firefox** e em navegadores fora da lista hardcoded de AppleScript (`_reversa_sdd/web-block-engine/design.md:49`).

O **`monBlock`** resolve essas três falhas combinando **persistência em nível de SO/Rede (ativa mesmo sem o app)** com uma **Catraca Unidirecional (`Append-Only`)** onde o usuário pode adicionar bloqueios livremente, mas **apenas o Ajudante (*Accountability Partner*)** pode autorizar desbloqueios.

---

## 2. Arquitetura do MVP (Fase 1 — Bloqueio de Sites & Ajudante)

### 2.1 Defesa em Profundidade em 3 Camadas (Todos os Navegadores)
1. **Camada 1 — Rede & Kernel (Ativa mesmo com o App fechado):**
   - Gerenciamento do `/etc/hosts` redirecionando domínios bloqueados para `0.0.0.0`, travado com flag imutável `chflags uchg` e limpeza imediata do cache DNS (`dscacheutil -flushcache` + `killall -HUP mDNSResponder`).
   - Opção de enforcement de **DNS Familiar** (`1.1.1.3` Cloudflare Malware & Adult Content Blocking / CleanBrowsing) + âncora `pfctl` (`/etc/pf.anchors/com.ccat.monblock`).
2. **Camada 2 — Políticas Nativas de Todos os Navegadores (`Enterprise Policies`):**
   - Geração de políticas gerenciadas para **Chrome, Brave, Edge, Arc, Opera, Vivaldi** (`/Library/Managed Preferences/<bundle>.plist`) e **Firefox** (`policies.json` / Managed Preferences):
     - Sincroniza `URLBlocklist` e `URLAllowlist` nativamente nos navegadores.
     - Desativa DNS-over-HTTPS interno do navegador (`DnsOverHttpsMode = off`) para impedir bypass da Camada 1.
     - Controla a **Flag Opcional "Bloquear Modo Anônimo"**: desligada por padrão para não atrapalhar trabalho/testes (já que as Camadas 1, 2 e 3 continuam bloqueando sites proibidos mesmo dentro da janela anônima!), mas caso o usuário ative a flag, ela desativa janelas anônimas/privadas nos navegadores e só o Ajudante pode destravá-la.
3. **Camada 3 — Watcher Universal de Abas & Palavras-Chave + Tela de Bloqueio Local:**
   - Monitora abas ativas em **todos os navegadores** usando AppleEvents (`osascript` otimizado para Safari, Chrome, Brave, Edge, Arc, Opera) + **Accessibility API (`AXUIElement`)** para Firefox e navegadores alternativos.
   - Avalia URLs e títulos contra **palavras-chave simples e combinadas por vírgula (`AND`)** (inspirado em `RN-WEB-06` de `_reversa_sdd/`).
   - Quando uma aba viola uma regra, redireciona imediatamente a aba para o servidor local do `monBlock` (`http://127.0.0.1:49152/blocked?url=...&rule=...`), exibindo a **Tela de Bloqueio CCAT** com o botão de solicitar desbloqueio ao Ajudante.

### 2.2 As 11 Categorias Pré-Cadastradas + Lista Customizada
Inspirado no catálogo `popularURLs` (`_reversa_sdd/web-block-engine/contracts.md`), o `monBlock` já traz **11 categorias curadas por tópicos**:
1. **Conteúdo Adulto & Pornografia** *(Ativada e trancada por padrão)*
2. **Apostas & Cassinos (Bets/Gambling)**
3. **Jogos Online (Games)**
4. **Proxies, VPNs & Bypass**
5. **Sites de Relacionamento (Dating)**
6. **Redes Sociais (Social)**
7. **Streaming & Vídeos (Video)**
8. **Fóruns & Comunidades Mistas**
9. **Compras por Impulso (Shopping)**
10. **Notícias & Portais (News)**
11. **Buscadores sem SafeSearch**

- **Regra da Catraca:** O usuário pode **ativar** qualquer categoria ou **adicionar** novos domínios (individualmente ou em lote até 100 por vez) e palavras-chave com 1 clique. Porém, **desativar** uma categoria ativa ou **remover** um domínio/palavra-chave exige autorização do Ajudante.

### 2.3 Fluxo do Ajudante (*Accountability Partner*) & Raio-X com Print Blur/Revelar
Quando o usuário precisa acessar uma URL bloqueada (ex: falso positivo no trabalho/estudo) e clica em **"Solicitar Desbloqueio ao Ajudante"**:
1. **Coleta Segura de Contexto (`UnblockInspector`):**
   - Sanitiza a URL (remove tokens/senhas de query string).
   - Faz fetch seguro e renderiza a página em uma `BrowserWindow` oculta (`offscreen`) do Electron.
   - Extrai: **URL**, **Causa exata do bloqueio** (qual categoria, domínio ou palavra-chave disparou), **Título (`<title>`)**, **Resumo textual (`meta description` + `H1/H2`)** e **Screenshot da página**.
   - Aplica **Gaussian Blur pesado** na imagem por padrão, gerando também a camada revelável sob clique exclusivo do Ajudante.
2. **Envio e Aprovação (Duplo Canal sem Custo de Servidor):**
   - **Canal 1 — Bot do Telegram Interativo:** Envia ao celular do Ajudante o resumo + causa do bloqueio + print com **Spoiler nativo (`has_spoiler: true`)** + botões inline:
     - `[✅ Liberar 15 min]`
     - `[✅ Liberar 1 hora]`
     - `[✅ Liberar Permanente (Allowlist)]`
     - `[❌ Negar Pedido]`
     Quando o Ajudante toca no botão no Telegram, o `monBlock` recebe a confirmação e aplica a liberação na hora.
   - **Canal 2 — Card HTML Autocontido + Código de Desafio (`HMAC` / Senha Mestra):** Gera um arquivo/card HTML que pode ser enviado por WhatsApp/E-mail contendo o Raio-X + o Print borrado com o botão **"👁️ Revelar Imagem"** + o `Challenge Code` (`ex: MB-7391`). O Ajudante pode digitar sua **Senha Mestra (`Argon2id`)** na máquina ou gerar o **Contra-Código de Liberação (`HMAC-SHA256`)** para `15m`, `1h` ou `Permanente`.
3. **Expiração & Auto-Lock (`TemporaryGrant`):**
   - Desbloqueios temporários mostram um cronômetro regressivo (`tabular-nums`) e revogam o acesso automaticamente ao zerar o tempo ou se o Mac entrar em repouso (`sleep`).

---

## 3. Casos de Borda, Exceções, Recuperação de Senha & Vínculo Durável (Blindagem v2)

### 3.1 Como Vincular Usuário ↔ Ajudante sem Perder o Vínculo
- **Handshake de Pareamento Assinado (`PAIR-XXXX-YYYY` + QR Code Telegram):**
  - Na configuração inicial, o `monblockd` gera uma chave secreta `HMAC-SHA256` de 256 bits e um link/QR Code de pareamento para o Bot do Telegram do Ajudante.
  - Quando o Ajudante confirma no celular (ou define sua Senha Mestra `Argon2id` na máquina), o vínculo é salvo com **Tripla Persistência Redundante**:
    1. Banco SQLite `root:wheel 0600` (`/Library/Application Support/monBlock/monblock.db`).
    2. **System Keychain do macOS (`/Library/Keychains/System.keychain`)** — sobrevive a reinstalações ou exclusão da pasta do app.
    3. Snapshot selado e imutável (`/var/db/monblock/partner.seal` com `chflags uchg`).
  - Se um dos 3 arquivos for corrompido ou apagado, o `monblockd` reconstrói automaticamente o vínculo a partir dos outros dois no boot (Self-Healing).

### 3.2 E se o Usuário ou o Ajudante Esquecer a Senha? (Recuperação em 3 Níveis sem Brecha para Impulso)
1. **Nível 1 — Redefinição Instantânea via Bot do Telegram do Ajudante:**
   - Se o Ajudante esquecer a Senha Mestra presencial, basta enviar `/reset_senha` no chat do Telegram já vinculado; o Bot gera uma nova senha ou aprova o desbloqueio diretamente pelo celular.
2. **Nível 2 — Kit de Emergência com 5 Códigos de Uso Único (`One-Time Recovery Codes`):**
   - No momento do vínculo inicial, o sistema gera um cartão PDF/TXT para o Ajudante guardar (ex: no 1Password/e-mail dele) com **5 códigos descartáveis** (inspirado em `RN-LIM-02`). Cada código usado é marcado na tabela `used_tokens` e invalidado para sempre.
3. **Nível 3 — Desbloqueio de Emergência com `Time-Lock Cooldown de 72 Horas` (Se o Ajudante Perder Tudo):**
   - Caso o Ajudante perca o celular, a senha e os códigos de recuperação ao mesmo tempo, o usuário pode iniciar a **Contingência de 72 Horas**:
     - O bloqueio **permanece 100% ativo durante todas as 72 horas** (impedindo qualquer recaída por impulso momentâneo).
     - O Ajudante recebe alertas a cada 6h e pode **cancelar o timer com 1 clique** se não for uma emergência real.

### 3.3 Taxonomia de Casos de Borda & Prevenção de Erros
- **Concorrência, Idempotência & Double-Submit:** Cliques repetidos em "Pedir Desbloqueio" utilizam `Idempotency-Key` baseada em `hash(domain + minute_bucket)` e `debounce` de 500ms na UI, evitando flood no Telegram do Ajudante.
- **Escrita Atômica e Rollback do `/etc/hosts`:** Nunca edita `/etc/hosts` diretamente. Cria `/etc/hosts.monblock.bak`, escreve apenas entre `# >>> MONBLOCK START >>>` e `# <<< MONBLOCK END <<<` em arquivo temporário e executa `rename` atômico. Em caso de erro ou desinstalação autorizada pelo Ajudante, restaura o `.bak` intacto.
- **Allowlist de Infraestrutura Crítica (Anti-Lockout):** Domínios essenciais (`localhost`, `127.0.0.1`, `api.telegram.org`, `accounts.google.com`, `appleid.apple.com`, `login.microsoftonline.com`) nunca podem ser bloqueados por regra de palavra-chave, garantindo que o usuário nunca perca login corporativo nem a comunicação com o Ajudante.
- **Contrato de Erros HTTP (`RFC 9457 Problem Details`):** O servidor local (`127.0.0.1:49152`) responde falhas com `application/problem+json` (`type`, `title`, `status`, `detail`, `instance`), circuit breaker e timeout de `3.000ms` com backoff exponencial + jitter.

### 3.4 Estados Completos de UI & Acessibilidade WCAG 2.2 AAA / APCA
- **5 Estados Visuais Obrigatórios:** `Idle`, `Loading (Skeleton Shimmer sem CLS)`, `Empty State` (acionável), `Error State` (RFC 9457 amigável com botão de Retry) e `Partial/Success State`.
- **Conformidade WCAG 2.2 & APCA (`Lc >= 75`):**
  - `2.4.11 Focus Not Obscured` (`scroll-padding-top: 5rem` + `:focus-visible`).
  - `2.5.7 Dragging Movements` (todos os botões/toggles operáveis por clique simples e teclado).
  - `3.3.8 Accessible Authentication` (`onPaste` habilitado para colar Token HMAC ou Senha Mestra do 1Password).
  - Respeito a `@media (prefers-reduced-motion: reduce)` e `@media (prefers-reduced-transparency: reduce)`, animações restritas ao compositor GPU (`transform` e `opacity`) e contadores/cronômetros derivados do tempo real decorrido (`deltaTime` / `performance.now()`).

### 3.5 Estratégia de Testes Automatizados (Pirâmide AAA)
- **Unit Tests (Vitest):** Motor de regras (`RN-WEB-01..06`), precedência `whiteWebsites > blackWebsites`, palavras-chave combinadas (`AND`), higienização de URL e validação criptográfica `Argon2id` + `HMAC-SHA256` (`timingSafeEqual`).
- **Integration Tests:** Escrita atômica e rollback de `hosts` em diretório temporário, geração de `policies.json` (Firefox) e `.plist` (Chromium/Safari), e servidor local `/blocked` com respostas `RFC 9457`.
- **E2E Tests (Playwright):** Fluxo completo da Tela de Bloqueio (`http://127.0.0.1:49152/blocked`), alternância dos 4 temas CCAT, botão de "Revelar Imagem" com Blur e envio/validação de código do Ajudante.
