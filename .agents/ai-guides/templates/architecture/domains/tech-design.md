# Domínio de [Nome do Domínio]: Design Técnico (Tech Design)

---

## 1. Camada Frontend (Agnóstica de Framework)
[Descreva a arquitetura client-side do domínio, fluxo de dados e separação de responsabilidades na interface.]

*   **Arquitetura de Componentes de UI:** Separação estrita entre Componentes de Apresentação (Stateless / Presentational) e Componentes Contêiner (Stateful / Smart Components).
*   **Gerenciamento de Estado:**
    *   *Estado Local:* Dados efêmeros de UI e interação.
    *   *Estado Global da Aplicação:* Sessão, preferências e estados compartilhados entre módulos.
    *   *Cache de Servidor / Remote State:* Sincronização, invalidação e revalidação de dados remotos.
*   **Camada de Transporte e Cliente de API:** Abstração de cliente HTTP/WebSocket, interceptors de autenticação e normalização de DTOs para Entidades de Domínio de UI.
*   **Invariantes de Validação e Feedback ao Usuário:** Validação síncrona/reativa em formulários, estados de transição (loading/skeleton), feedback de erro contextual e recuperação graciosa.

---

## 2. Camada Backend (Agnóstica de Stack)
[Descreva a arquitetura server-side baseada em DDD e Clean Architecture.]

*   **Camada de Apresentação / Borda:** Controllers, Handlers de Mensagens/Eventos, definição de Rotas e Middlewares de validação/autenticação.
*   **Camada de Aplicação:** Application Services, orquestração de operações e comandos/consultas.
*   **Casos de Uso (se adotado):** Use Cases como bloco opcional (ver `guia-ddd-pragmatico-unit-of-work-use-cases.md`); em projeto enxuto, o Service coeso faz o papel.
*   **Camada de Domínio:** Entidades de Negócio, Agregados, Value Objects, Regras e Invariantes Centrais, Domain Services e Domain Events.
*   **Camada de Infraestrutura e Persistência:** Implementações de Repositórios, Gateways, Adapters de Banco de Dados (SQL/NoSQL) e mensageria externa.
*   **Contratos e DTOs Tipados Formais:** Definição de contratos formais de entrada e saída via OpenAPI 3.1, Schemas JSON ou interfaces/tipos estritos da linguagem.

---

## 3. Acesso a Dados, Persistência e Transacionalidade
[Descreva a estratégia de queries parametrizadas (Prepared Statements / ORM seguro), índices necessários para performance e controle de transações ACID.]

*   **Fronteira Transacional por store (se adotado Unit of Work):** para cada store (SQL, Mongo, cache, BigQuery), informe se há UoW (sim/não) e por quê; UoW nunca atravessa stores, transações curtas sem I/O externo, consistência entre stores via Outbox.

---

## 4. Assinatura de Endpoints (API Layer)
*   **Caminho:** `MÉTODO /api/v1/{recurso}`
*   **Autenticação / Autorização:** `Bearer JWT`, validação de escopos/policies (RBAC/ABAC)
*   **Payload de Entrada (Input):** `SchemaIn` / DTO formal tipado
*   **Payload de Saída (Output):** `SchemaOut` / DTO formal tipado
*   **Códigos de Resposta HTTP Mapeados:**
    *   HTTP 200 / 201: Sucesso na operação
    *   HTTP 400 (`Bad Request`): Dados ou formato de requisição inválidos
    *   HTTP 401 (`Unauthorized`): Token ausente, inválido ou expirado
    *   HTTP 403 (`Forbidden`): Usuário autenticado sem permissão para o recurso
    *   HTTP 404 (`Not Found`): Registro ou entidade não encontrada
    *   HTTP 409 (`Conflict`): Violação de unicidade ou concorrência
    *   HTTP 422 (`Unprocessable Entity`): Falha de validação semântica de regras de negócio
    *   HTTP 500 (`Internal Server Error`): Erro inesperado interno

---

## 5. Resiliência, Filas e Eventos Assíncronos
[Descreva se o domínio publica/consome eventos assíncronos (Message Brokers / Queues), políticas de retry com backoff exponencial, chave de idempotência e timeouts.]
