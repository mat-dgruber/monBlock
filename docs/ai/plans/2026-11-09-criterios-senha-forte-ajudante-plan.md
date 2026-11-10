# Plano de Implementação: Critérios de Senha Forte para Ajudante e Feedback Interativo via Telegram

- **Data:** 2026-11-09
- **Status:** Proposto (Aguardando Auditoria e Aprovação)
- **Documento de Origem:** `docs/ai/specs/2026-11-09-criterios-senha-forte-ajudante-design.md`
- **Alvo:** `docs/ai/plans/2026-11-09-criterios-senha-forte-ajudante-plan.md`

---

## 1. Resumo Executivo

Este plano implementa a validação de **Senha Forte** para o Ajudante de Foco no monBlock, contemplando:
1. Criação do validador unificado `validateMasterPassword` em `src/domain/partner-guard.ts` (mínimo 8 caracteres, maiúscula, minúscula, número, caractere especial, proibição de nome e senhas óbvias).
2. Atualização de `sendPairingInvitation` em `src/daemon/telegram-client.ts` com instruções explícitas dos critérios de senha forte.
3. Tratamento de erro interativo no broker do Telegram em `src/daemon/monblockd.ts`: se o Ajudante enviar `/senha` que não atenda aos critérios, o bot higieniza a mensagem (`deleteMessage`) e responde imediatamente com um checklist visual indicando o que faltou cumprir.
4. Aplicação consistente da validação no comando IPC `PAIR_PARTNER` e na interface de onboarding do app desktop.
5. Suíte de testes unitários e de integração validando os critérios, casos de borda e o loop de feedback do Telegram.

---

## 2. Restrições Técnicas & Limites Operacionais

1. **Limite de Tamanho e Custo Criptográfico:** A senha deve ter no máximo 128 bytes (UTF-8) para evitar ataques de DoS por exaustão de CPU no cálculo do hash `scrypt`.
2. **Latência de Polling e Concorrência:** As validações ocorrem dentro da fila serializada do daemon (`runExclusive`). O envio de mensagens de feedback de erro não pode travar o ciclo de poll nem exceder o rate limit do Telegram (máximo 1 msg/s por chat).
3. **Higienização Obrigatória:** A remoção da mensagem do Telegram (`deleteMessage`) deve ocorrer com tratamento de erro tolerante a falhas (não lançar exceção se a API do Telegram falhar ao deletar).
4. **Isolamento Zero-Trust:** A senha bruta nunca deve ser gravada em logs, persistida no estado JSON ou repassada via IPC para o Renderer do Electron.

---

## 3. Matriz de Avaliação de Alternativas (Trade-offs)

| Dimensão | Opção A: Validação Simples por Regex no Client | Opção B: Senha Forte Centralizada + Bot Interativo (Eleita) | Opção C: Gerar Senha Aleatória Automática |
| :--- | :--- | :--- | :--- |
| **Complexidade** | Baixa | Moderada (requer feedback em chat) | Média |
| **Experiência do Ajudante** | Frustrante (falha sem saber o porquê) | **Excelente (checklist visual com itens pendentes)** | Confusa (precisa salvar senha longa dada pelo bot) |
| **Segurança e Entropia** | Baixa | **Alta (NIST SP 800-63B)** | Máxima |
| **Veredito** | Rejeitada (má UX e frágil) | **ESCOLHIDA (Equilíbrio ideal segurança e UX)** | Rejeitada (fricção desnecessária ao parceiro) |

---

## 4. Arquivos Afetados

| Arquivo | Mudança Principal |
| :--- | :--- |
| `src/domain/partner-guard.ts` | Implementar `validateMasterPassword` com retorno de checklist de critérios e lista de erros. |
| `src/daemon/telegram-client.ts` | Atualizar mensagem de `sendPairingInvitation` e método `extractPasswordFromUpdate` para suportar detalhes de validação. |
| `src/daemon/monblockd.ts` | Tratar senha inválida no loop de `CHECK_PAIRING_STATUS`, disparando feedback detalhado via `client.sendMessage` e deleção da mensagem fraca. Atualizar `PAIR_PARTNER`. |
| `src/renderer/renderer-init.js` | Atualizar validação e mensagens de feedback na interface desktop caso o pareamento manual com senha seja acionado. |
| `tests/unit/partner-guard.test.ts` | Adicionar testes unitários para todos os critérios de senha forte (tamanho, caracteres, nomes, senhas triviais). |
| `tests/unit/telegram-client.test.ts` | Testar extração de senha com os novos critérios e sanitização. |
| `tests/integration/telegram-pairing.test.ts` | Testar fluxo completo de recebimento de senha fraca -> resposta com checklist -> envio de senha forte -> pareamento concluído. |

---

## 5. Tarefas de Implementação Passo a Passo

### Fase 1: Domínio e Validação de Senha Forte
- [ ] Criar função `validateMasterPassword(password: string, options?: { partnerName?: string }): { valid: boolean; errors: string[]; checklist: { label: string; passed: boolean }[] }` em `src/domain/partner-guard.ts`.
- [ ] Criar testes unitários em `tests/unit/partner-guard.test.ts` testando:
  - Senha com menos de 8 caracteres (falha)
  - Senha sem maiúscula (falha)
  - Senha sem minúscula (falha)
  - Senha sem número (falha)
  - Senha sem símbolo especial (falha)
  - Senha contendo o nome do ajudante (falha)
  - Senha comum proibida (`12345678`, `password123`, etc.) (falha)
  - Senha forte válida (sucesso)

### Fase 2: Atualização do Cliente Telegram
- [ ] Atualizar o template de convite em `TelegramPartnerClient.sendPairingInvitation` listando claramente os 4 critérios e fornecendo exemplo (`/senha Foco#2026!`).
- [ ] Adaptar `TelegramPartnerClient.extractPasswordFromUpdate` para retornar a senha bruta e validação estruturada.

### Fase 3: Feedback Interativo no Daemon
- [ ] No `CHECK_PAIRING_STATUS` em `src/daemon/monblockd.ts`:
  - Se o comando recebido for `/senha` ou `/password`:
    - Executar `validateMasterPassword(rawPassword, { partnerName: pendingPairing.partnerName })`.
    - Se for **inválida**:
      - Executar `client.deleteMessage(chatId, messageId)` (higienização).
      - Enviar mensagem no Telegram com o checklist de pendências formatado em HTML/Markdown.
      - Manter o pareamento pendente aguardando a nova tentativa.
    - Se for **válida**:
      - Proceder com o hash scrypt, persistência do estado, envio dos 5 códigos de emergência (`sendEmergencyKit`) e conclusão do pareamento.
- [ ] Atualizar handler do comando `PAIR_PARTNER` para rejeitar com `buildProblem(400)` mensagens fora do padrão forte.

### Fase 4: Interface e Verificação Integrada
- [ ] Executar suíte de testes completa: `npm run test` / `npx vitest run`.
- [ ] Verificar build de produção: `npm run build`.

---

## 6. Análise de Risco e Plano de Rollback

| Risco | Impacto | Mitigação |
| :--- | :--- | :--- |
| Ajudantes com dificuldade de criar senha complexa no chat | Médio | Mensagem de convite já inclui exemplo pronto e o feedback do bot aponta exatamente qual regra não foi atendida. |
| Usuários existentes com senhas antigas de 6 caracteres | Baixo | `verifyPartnerPassword` preserva a compatibilidade com hashes scrypt já armazenados. Critério forte incide apenas na criação e troca de senha. |
| Falha no `deleteMessage` por permissão do bot | Baixo | Tratamento defensivo com `catch` silencioso; a validação e o envio do feedback continuam operando normalmente. |

**Plano de Rollback:**
Caso haja regressão, a função de validação pode reverter para `length >= 6` sem alterar a estrutura de dados persistida, pois o esquema do banco de dados e formato do hash scrypt permanecem inalterados.
