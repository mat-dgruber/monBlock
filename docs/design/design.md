# 🎨 Especificação Técnica de Design System — monBlock (Branding CCAT)

> **Status:** 🟢 Homologado (100% Readiness)  
> **Assinatura Visual:** CCAT — *Organic Elegance, Leveza Premium & Mindful Security*  
> **Arquitetura de Temas:** 4 Temas Nativos (`Capycro Wellness` [Padrão Diurno], `Escuro Tech` [Padrão Noturno], `Claro Fintech`, `Alto Contraste WCAG AAA`)  
> **Artefatos Canônicos:** Spec (`docs/ai/specs/2026-11-04-monblock-mvp-design.md`) e Plano (`docs/ai/plans/2026-11-04-monblock-mvp-plan.md`)

---

## 1. Resumo Executivo de UI/UX

O `monBlock` aplica a linguagem visual da holding **CCAT** a um contexto de **proteção comportamental e responsabilidade compartilhada (*Accountability Partner*)**. Em vez de interfaces agressivas de antivírus com sirenes vermelhas que geram ansiedade, o `monBlock` opera sob o **Protocolo Anti-Pânico CCAT**:

1. **Padrão Diurno Capycro (`#faf9f6` / `#5d8a8c` / `#d8704c`):** Superfície acolhedora em bege pergaminho e azul-petróleo que reduz a tensão cognitiva quando uma página é interceptada.
2. **Padrão Noturno Tech (`#0f172a` / `#1e293b` / `#60a5fa` / `#f97316`):** Ativado automaticamente via `prefers-color-scheme: dark` ou seletor manual, oferecendo elevação por luminosidade sem cansaço ocular.
3. **Proibição Absoluta do Roxo (*Purple Ban*):** Nenhum componente utiliza tons de roxo, violeta ou índigo.
4. **Catraca Visual Clara:** Itens protegidos pelo Ajudante exibem um selo de cadeado orgânico (`Locked by Partner`), diferenciando claramente ações livres do usuário (`+ Adicionar Bloqueio`, `Ativar Categoria`) de ações que dependem do Ajudante (`Solicitar Desbloqueio`).

---

## 2. Mapeamento dos 4 Temas Oficiais

| Token Semântico | 1. Capycro (Padrão Claro) | 2. Escuro Tech (Padrão Noite) | 3. Claro Fintech | 4. Alto Contraste AAA |
| :--- | :---: | :---: | :---: | :---: |
| `--surface-ground` | `#faf9f6` | `#0f172a` | `#f8fafc` | `#000000` |
| `--surface-card` | `#ffffff` | `#1e293b` | `#ffffff` | `#121212` |
| `--surface-border` | `#ebdcc5` | `#334155` | `#e2e8f0` | `#ffffff` (2px) |
| `--text-color` | `#3e3a35` | `#f8fafc` | `#1e293b` | `#ffffff` |
| `--text-color-secondary` | `#7a6b5d` | `#94a3b8` | `#64748b` | `#e5e5e5` |
| `--primary-color` | `#5d8a8c` | `#60a5fa` | `#2563eb` | `#ffff00` |
| `--accent-color` | `#d8704c` | `#f97316` | `#0284c7` | `#00ffff` |
| `--success-color` | `#5a9261` | `#4ade80` | `#15803d` | `#4ade80` |

---

## 3. Superfícies do Produto (`monBlock`)

### 3.1 Dashboard Principal (Electron Window `1120x740`)
- **Sidebar Retrátil (`240px` / `64px`):**
  1. **Escudo & Status (`Overview`):** Status do daemon `monblockd`, navegadores protegidos (Chrome, Safari, Brave, Arc, Edge, Firefox), status do DNS Familiar e da Flag de Modo Anônimo.
  2. **Categorias & Tópicos (11 Categorias):** Cards com toggle unidirecional (*Conteúdo Adulto*, *Apostas e Cassinos*, *Jogos*, *Relacionamento*, *Proxies/VPN*, *Redes Sociais*, *Vídeo*, etc.).
  3. **Lista de Sites & Palavras-Chave (`Append-Only`):** Input rápido para adicionar domínios (até 100 em lote — `RN-WEB-04`) e palavras-chave combinadas por vírgula (`RN-WEB-06`), mais aba de Exceções (`Always Allow`).
  4. **Ajudante (`Accountability Partner`):** Configuração do Bot Telegram, teste de notificação, validação de Token `HMAC` / Senha Mestra e histórico de solicitações.

### 3.2 Tela de Bloqueio & Solicitação ao Ajudante (`127.0.0.1:49152/blocked`)
- Exibida quando o vigia de abas leva o navegador à página (domínio ou palavra-chave bloqueada). Tema pelo sistema: alto contraste > **Capycro escuro** > Capycro.
  - **Cabeçalho:** logo da CCAT (Capycro Avectech), *"Esta página está pausada."* (Playfair Display) e a saída segura em destaque (**Fechar esta aba**, atalho `Esc`).
  - **Respiração etérea e automática:** orbe, anel e brilho suaves (4 s inspira, 6 s solta, calculados pelo tempo decorrido), com **Pausar animação** (WCAG 2.2.2) e parada sob `prefers-reduced-motion`.
  - **Por que foi pausada:** dados reais da query (`domain` em punycode, `rule`); a linha sem dado fica oculta; "Quem bloqueou" é sempre o vigia de abas. Nada de exemplos fixos.
  - **Pedir liberação ao Ajudante:** duração (`15 min`, `1 hora`, `Permanente`), motivo e **Pedir aprovação no Telegram** (`POST /api/unblock-requests`, `Idempotency-Key`, timeout de 8 s). Só diz "enviado" com `202`; sem Ajudante pareado o servidor responde `503` e a página diz "Nada foi enviado".
  - **Código do Ajudante:** campo "Validar código" (`POST /api/unlock-code`) que **nunca libera nada**: responde `501` orientando a validar no app (Ajudante e recuperação).
  - Não há seletor de tema, preview borrado nem comprovante offline nesta página.

---

## 4. Acessibilidade WCAG 2.2 AAA & Ergonomia

- **Touch Targets:** Todos os botões, toggles de categoria e controles possuem altura mínima de `44px` (`2.75rem`).
- **Numerais Tabulares:** Contadores de domínios bloqueados, cronômetros de liberação temporária (`14:59`) e códigos de desafio usam `.tabular-nums`.
- **Estados Visuais Obrigatórios:** Todos os controles implementam os 6 estados (`Default`, `Hover`, `Active`, `Focus-Visible`, `Disabled/Locked by Partner` e `Loading Anti-CLS`).
