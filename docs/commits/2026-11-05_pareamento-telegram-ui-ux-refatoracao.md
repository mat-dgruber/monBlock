<!--
================================================================================
LOG DE MANUTENÇÃO DE DOCUMENTAÇÃO
--------------------------------------------------------------------------------
Data       | Autor          | Descrição
--------------------------------------------------------------------------------
2026-11-05 | Matheus Diniz  | Registro consolidado de desenvolvimento da sessão: pareamento Telegram, UI/UX e ADR-0005.
================================================================================
-->

# Registro de Desenvolvimento — 2026-11-05

| Metadado | Detalhe |
| :--- | :--- |
| **Escopo Principal** | Pareamento Remoto via Telegram, Custódia Exclusiva de Códigos e Refatoração UI/UX Desktop |
| **Commits Gerados** | 5 micro-commits (+ 1 de documentação) |
| **Arquivos Modificados** | 15 arquivos |
| **ADRs Vinculadas / Geradas** | `docs/adrs/0005-pareamento-telegram-custodia-exclusiva-codigos-emergencia.md` |

---

## 1. Visão Geral das Alterações
Nesta sessão foi realizada uma reestruturação profunda da experiência do usuário (UI/UX) do monBlock e um salto fundamental na arquitetura de segurança do Ajudante de Responsabilidade (CCAT). Eliminou-se a digitação de senha mestra no aplicativo desktop local e o download dos códigos de emergência pelo usuário, delegando a criação da senha diretamente ao Ajudante no Telegram e garantindo a custódia exclusiva dos 5 códigos offline via mensageria criptografada. No frontend, a barra lateral foi fixada à altura da janela sem scrolls indesejados, com nova identidade visual vetorial CCAT, chips de domínios e termos diferenciados por cores semânticas, e ícones Retina no Tray do macOS.

---

## 2. Arquitetura Afetada & Decisões (ADRs)
- **Decisões Registradas:**
  - `docs/adrs/0005-pareamento-telegram-custodia-exclusiva-codigos-emergencia.md`: Eliminação do input de senha mestra local e download de códigos pelo usuário protegido. A criação da credencial ocorre remotamente pelo Ajudante no Telegram (`/senha <senha>`) com remoção de rastro por `deleteMessage`, e os 5 códigos `REC-*` são entregues exclusivamente ao Ajudante.
- **Diagrama de Relações e Fluxos:**

```mermaid
graph TD
    subgraph Frontend [Renderer - Electron Desprivilegiado]
        UI[Painel Desktop CCAT]
        Preload[ContextBridge / Preload IPC]
    end

    subgraph Backend [Daemon - monblockd]
        Daemon[MonBlockDaemon Core]
        Lock[Lock de Concorrência Polling]
        Store[(Tripla Persistência: DB / Keychain / Seal)]
    end

    subgraph Remote [Canais Externos]
        TelegramAPI[Telegram Bot API]
        Partner[Ajudante de Foco no Telegram]
    end

    UI -->|1. Inicia Convite| Preload
    Preload -->|2. IPC INITIATE_PAIRING| Daemon
    Daemon -->|3. Envia Convite HTML| TelegramAPI
    TelegramAPI -->|4. Notifica Ajudante| Partner
    Partner -->|5. Responde /senha| TelegramAPI
    Daemon -->|6. Long-Polling getUpdates| TelegramAPI
    Daemon -->|7. Envia Kit Códigos REC-*| TelegramAPI
    TelegramAPI -->|8. Entrega Kit Exclusivo| Partner
    Daemon -->|9. Apaga /senha| TelegramAPI
    Daemon -->|10. Persiste Hash| Store
    Daemon -->>|11. Status Paired (Sem Códigos)| Preload
    Preload -->>|12. Feedback de Custódia| UI
```

---

## 3. Mapa de Arquivos Modificados

| Arquivo | Camada Técnica | Resumo da Modificação |
| :--- | :--- | :--- |
| `src/daemon/telegram-client.ts` | Daemon / Integração | Suporte a `sendPairingInvitation`, `sendEmergencyKit`, `pollUpdates`, `extractPasswordFromUpdate`, `deleteMessage` em HTML |
| `src/daemon/monblockd.ts` | Daemon / Core | Comandos `INITIATE_PAIRING`, `CHECK_PAIRING_STATUS`, `CANCEL_PAIRING`, lock de polling e persistência atômica |
| `src/main/main.ts` | Electron Main | Ícones Retina PNG 36x36 @2x para Tray e IPC handlers para pareamento |
| `src/preload/preload.ts` & `.cjs` | Preload IPC | Tipagem e exposição de `initiatePairing`, `checkPairingStatus`, `cancelPairing` |
| `src/renderer/index.html` | Apresentação / UI | Sidebar fixa com flexbox, logotipo vetorial CCAT, badges semânticos e tela educativa de custódia exclusiva |
| `src/renderer/renderer-init.js` | UI / Controller | Gerenciamento do polling a cada 2s com cancelamento no `switchView` e `beforeunload` |
| `tests/daemon/telegram-client.test.ts` | Testes / Integração | Suíte de testes para templates HTML, deleteMessage, long polling e mitigação de erros |
| `tests/daemon/monblockd.test.ts` | Testes / Backend | Cobertura do ciclo completo de pareamento remoto e garantia de omissão dos códigos no IPC |
| `tests/ui/desktop-ui.test.ts` | Testes / Frontend | Validações do contrato de preload, ausência de inputs de senha e remoção de botões de cópia |
| `docs/adrs/0005-*.md` | Arquitetura / ADR | Registro formal da decisão de custódia exclusiva e pareamento remoto |
| `docs/domains/partner_accountability/` | Domínio / Docs | Sincronização reversa com `RN-PARTNER-05` e novo wizard de onboarding |

---

## 4. Detalhamento por Commit

### `docs(specs): formalizar specs e planos para refatoracao ui-ux e pareamento telegram`
- **Razão da alteração:** Planejamento e validação socrática de baixo risco (Risk Score 0/100) para intervenção de UX e segurança.
- **Comportamento atual:** Especificações e planos canônicos aprovados e versionados em `docs/ai/`.

### `feat(daemon): implementar pareamento remoto via telegram e custodia exclusiva de codigos`
- **Razão da alteração:** Eliminar o vetor de autossabotagem da digitação de senha na máquina protegida e guarda de códigos locais.
- **Comportamento atual:** Daemon orquestra o convite via HTML, monitora `/senha`, apaga a mensagem, despacha os códigos unicamente ao Telegram e salva credenciais nos 3 cofres.

### `feat(desktop): atualizar tray com icones retina e registrar handlers ipc de pareamento`
- **Razão da alteração:** Modernização do ícone de bandeja do macOS e ponte IPC desprivilegiada.
- **Comportamento atual:** Tray utiliza buffer Retina nativo com `setTemplateImage` e handlers IPC respondem a comandos assíncronos de pareamento.

### `feat(ui): remodelar layout com sidebar fixa badges semanticos e onboarding por telegram`
- **Razão da alteração:** Resolução do bug de layout da sidebar, hierarquia de cores dos cards de bloqueio e nova tela de onboarding.
- **Comportamento atual:** Sidebar fixa na viewport, cards com chips Teal (domínios) e Terracotta (termos), sem botões nem inputs de códigos.

### `docs(architecture): adicionar adr-0005 e atualizar regras de negocio e tech design`
- **Razão da alteração:** Governança técnica e conformidade CPB com os 6 gatilhos normativos de ADR.
- **Comportamento atual:** ADR 0005 formalizada e índice reindexado; regras de domínio atualizadas com `RN-PARTNER-05`.

---

## 5. Dívida Técnica & Próximos Passos

- [ ] Executar o provisionamento da esteira de CI/CD automática via GitHub Actions (`.github/workflows/ci.yml`).
- [ ] Explorar deep link Telegram (`tg://resolve?domain=...&start=...`) para agilizar ainda mais o início da conversa pelo Ajudante.
