<!--
================================================================================
LOG DE MANUTENÇÃO DE DOCUMENTAÇÃO
--------------------------------------------------------------------------------
Data       | Autor          | Descrição
--------------------------------------------------------------------------------
2026-11-06 | Matheus Diniz  | Criação da ADR 0010 definindo broker único do Telegram e cofre do token.
================================================================================
-->

# ADR 0010: Broker único do Telegram e token do bot no cofre do daemon

| Metadado | Detalhe |
| :--- | :--- |
| **Status** | **Aprovada** (2026-11-06) |
| **Decisores** | Matheus Diniz |
| **Tags** | `telegram`, `seguranca`, `daemon` |
| **ADRs Relacionadas** | Complementa ADR-0007 (daemon root, relógio confiável) |

## Contexto

O pedido de liberação nunca chegava ao Ajudante: não havia como configurar o bot e nada lia os botões. O Telegram devolve `409 Conflict` com dois leitores de `getUpdates`, e sem `offset` persistido decisões antigas seriam reprocessadas após reinício.

## 2. Decisão de Arquitetura

1. **Token no cofre do daemon** (`telegramBot`), nunca em `config.json` à mão nem no app. O estado público expõe só `configured` e `username`.
2. **Um único leitor** de `getUpdates` (laço do broker em `entry.ts`, `pollTelegramOnce`), com `offset` por `botId` gravado no mesmo `save` atômico da decisão.
3. **Decisão atômica**: `decideRequest` (transição única) + grant temporário + offset num só `save`. Valida chat e `from.id` do Ajudante pareado.
4. **API local** `/api/*` exige token de página por sessão e Host de loopback; `unlock-code` por HTTP nunca libera.
5. Pareamento por link `t.me/<bot>?start=<código>` (uso único, chat privado).

## Alternativas

- *Token em `config.json`*: exige editar arquivo de sistema; rejeitada.
- *Webhook em servidor próprio*: custo e superfície desproporcionais para app local; rejeitada.

## Consequências

- Troca/remoção do bot exige senha do Ajudante quando pareado.
- Rollback: sem bot configurado, o comportamento anterior (`503 Nada foi enviado`) permanece.
