# Domínio de [Nome do Domínio]: Visão Geral (Overview)

---

## 1. Propósito e Contexto de Negócio
[Descreva em 2-3 parágrafos o papel deste módulo no ecossistema da aplicação, o Bounded Context delimitado, os problemas de negócio que ele resolve e quem são os principais atores e personas impactadas.]

---

## 2. Entidades Principais e Relacionamentos
[Insira o diagrama ER ou de classes em formato ASCII ou Mermaid demonstrando a cardinalidade das entidades de persistência e agregados correspondentes ao domínio.]

### 2.1. [Nome da Entidade / Agregado 1] (ex: `users` / `orders`)
*   **Papel:** [O que esta entidade representa, ex: Usuário, Pedido, Fatura, Item de Inventário, Notificação, Evento de Auditoria]
*   **Atributos de Destaque:** [Identificadores únicos (UUID/ID), chaves estrangeiras, campos com restrição de unicidade e atributos sensíveis (PII/LGPD/GDPR)]

### 2.2. [Nome da Entidade / Agregado 2] (ex: `order_items` / `transactions`)
*   **Papel:** [Descrição da responsabilidade e ciclo de vida da entidade secundária]
*   **Atributos de Destaque:** [Chaves de associação, quantitativos e estados transitórios]

---

## 3. Fluxo de Trabalho Geral (Workflow)
[Descreva as etapas sequenciais de transição do fluxo do domínio, ex: Checkout de Pedido ➔ Reserva de Inventário ➔ Cobrança no Gateway ➔ Emissão de Recibo ➔ Notificação ao Cliente.]
