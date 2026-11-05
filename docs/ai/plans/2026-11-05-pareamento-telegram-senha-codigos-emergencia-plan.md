# Plano de Implementação: Pareamento Remoto via Telegram, Definição de Senha Mestra e Entrega Exclusiva de Códigos de Emergência

- **Data:** 2026-11-05
- **Status:** Proposto (Aguardando Auditoria e Aprovação)
- **Autor:** Engenheiro de Software Sênior & Pair Programmer (Antigravity)
- **Alvo:** `docs/ai/plans/2026-11-05-pareamento-telegram-senha-codigos-emergencia-plan.md`
- **Spec de Referência:** `docs/ai/specs/2026-11-05-pareamento-telegram-senha-codigos-emergencia-design.md`
- **Padrões Normativos:** `AGENTS.md`, `ADR-0001`, `ADR-0004`, OWASP Zero-Trust, CCAT e WCAG 2.2 AAA.

---

## 1. Objetivo & Escopo Core

Eliminar a autossabotagem no monBlock migrando a criação da Senha Mestra e a custódia dos 5 Códigos de Emergência (`REC-*`) exclusivamente para o Telegram do Ajudante de Responsabilidade (*Accountability Partner*). A aplicação desktop nunca solicitará a criação de senha ao usuário local e não permitirá o download ou cópia de códigos de emergência em sua máquina.

---

## 2. Restrições Técnicas & Invariantes de Segurança

1. **Sem Servidores Externos Próprios:** Toda comunicação é direta entre o daemon local no Mac e a API oficial do Telegram (`https://api.telegram.org/bot<token>/`).
2. **Long-Polling Seguro (`getUpdates`):** O daemon escuta atualizações do Telegram usando `getUpdates` com parâmetro `offset` para evitar reprocessamento de mensagens antigas.
3. **Autenticação em Tempo Constante:** Apenas mensagens vindas do `pairedChatId` verificado via `crypto.timingSafeEqual` podem executar `/senha <senha>`. Mensagens de qualquer outro `chatId` são sumariamente rejeitadas.
4. **Zero Vazamento de PII/Segredos:** A senha do Ajudante recebida é imediatamente convertida em PBKDF2 hash com salt aleatório e apagada da memória volátil. Os códigos `REC-*` em texto puro são enviados unicamente para o chat do Ajudante e descartados da memória; apenas seus hashes SHA-256 são persistidos em disco.
5. **Reversibilidade & Timeout de 15 Minutos:** Um pareamento pendente expira após 15 minutos caso o Ajudante não responda. O usuário pode cancelar a qualquer momento no app, revertendo para o estado desemparelhado sem bloqueio ou corrupção de estado.

---

## 3. Matriz de Alternativas Avaliadas

| Abordagem | Alternativa 1 (Webhook Público) | Alternativa 2 (Proposta: Long Polling Local) | Alternativa 3 (Polling Simulado no Renderer) |
|---|---|---|---|
| **Arquitetura** | Exige Ngrok ou túnel exposto | Daemon local consome `getUpdates` diretamente | Renderer faz fetch HTTP via bridge |
| **Segurança** | Alto risco (porta aberta na internet) | **Zero-Trust (sem portas abertas, conexão outbound)** | Risco de vazamento de segredos no Renderer |
| **Complexidade** | Alta | **Baixa/Média (APIs nativas do Telegram)** | Média |
| **Veredito** | Rejeitada | **ESCOLHIDA** | Rejeitada |

---

## 4. Fases de Execução & Tarefas Detalhadas

### Fase 1: Telegram Client (`src/daemon/telegram-client.ts`)
- [ ] Implementar `sendPairingInvitation(params: { partnerName: string, userMachineName: string })`.
- [ ] Implementar `sendEmergencyKit(params: { codes: string[], partnerName: string })`.
- [ ] Implementar `pollUpdates(offset?: number, timeoutSec?: number)` consumindo método `getUpdates` do Telegram.
- [ ] Implementar `deleteMessage(chatId: string, messageId: number)` para apagar a mensagem contendo `/senha` no chat do Ajudante.
- [ ] Testes unitários em `tests/daemon/telegram-client.test.ts` cobrindo todas as novas operações e descarte de remetentes não autorizados.

### Fase 2: Daemon de Governança (`src/daemon/monblockd.ts`)
- [ ] Adicionar estado transitório `pendingPairing` com `partnerName`, `telegramChatId`, `token`, `expiresAtMs`.
- [ ] Implementar comando `INITIATE_PAIRING`:
  - Valida `partnerName` e `telegramChatId`.
  - Dispara convite via `sendPairingInvitation`.
  - Registra estado pendente e inicia rotina assíncrona de escuta de senha.
- [ ] Implementar processamento do comando `/senha <valor>`:
  - Valida tamanho mínimo de 6 caracteres.
  - Gera `passwordHash` (PBKDF2) e `salt`.
  - Gera 5 chaves de emergência via `generateRecoveryKit()`.
  - Envia chaves ao Telegram via `sendEmergencyKit`.
  - Salva estado persistente com `paired: true` e hashes dos códigos.
  - Finaliza estado pendente.
- [ ] Implementar comando `CHECK_PAIRING_STATUS` e `CANCEL_PAIRING`.
- [ ] Testes unitários em `tests/daemon/monblockd.test.ts`.

### Fase 3: IPC Bridge & Preload (`src/main/main.ts`, `src/preload/`)
- [ ] Registrar canais IPC `monblock:initiate-pairing`, `monblock:check-pairing-status`, `monblock:cancel-pairing`.
- [ ] Expor métodos tipados em `src/preload/preload.ts` e `src/preload/preload-bridge.cjs`.

### Fase 4: Interface Desktop (`src/renderer/index.html`, `renderer-init.js`)
- [ ] Remover input de Senha Mestra do Passo 3 do Onboarding.
- [ ] Criar card de progresso em tempo real: *"Convite enviado! Aguardando seu Ajudante definir a Senha Mestra no Telegram..."* com botão *"Cancelar Convite"*.
- [ ] Adicionar polling suave a cada 2s de `checkPairingStatus()` durante o estado de espera.
- [ ] Atualizar Passo 4 do Onboarding: remover botões de cópia e download de `.txt`. Exibir card informativo de custódia exclusiva pelo Ajudante.
- [ ] Testes de UI em `tests/ui/desktop-ui.test.ts` validando a ausência do input de senha e conformidade WCAG 2.2 AAA / Zero Roxo.

---

## 5. Pre-Mortem & Plano de Reversibilidade (Rollback)

- **Se o Ajudante não responder:** O pareamento pendente expira após 15 minutos sem alterar `paired: false`. O botão *"Cancelar Convite"* cancela a rotina de escuta imediatamente.
- **Se a API do Telegram falhar:** O Circuit Breaker do `TelegramPartnerClient` abre e notifica a interface: *"Não foi possível conectar ao Telegram. Verifique sua conexão e tente novamente."*
- **Rollback de Código:** Caso qualquer regressão seja detectada durante os testes automatizados, o repositório pode ser revertido ao commit anterior sem impacto aos dados de persistência existentes.

---

## 6. Critérios de Aceite e Verificação Final

- [ ] `npm test`: 100% dos testes passam sem regressões.
- [ ] `npx tsc --noEmit`: 0 erros de compilação.
- [ ] A interface desktop não exibe senhas ou códigos de emergência em texto puro em nenhum momento da jornada.

