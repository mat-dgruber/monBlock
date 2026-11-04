# Checklist de Conformidade Zero-Trust (`.agents/rules/seguranca-zero-trust.md`)

<!-- Fonte canônica: templates/rules/seguranca-zero-trust.md (guides/architecture/guia-seguranca-defensiva-zero-trust.md) — instalado por ZT-01 -->

Regra always-on: aplique este checklist em promoção de qualquer serviço, módulo ou rota para produção. Itens abertos bloqueiam a promoção. Guia completo em `.agents/ai-guides/guides/architecture/guia-seguranca-defensiva-zero-trust.md`.

## 8. Checklist Canônico de Conformidade e Segurança Contínua

Antes de promover qualquer serviço, módulo ou rota para o ambiente de produção, certifique-se do cumprimento integral dos seguintes itens:

### 1. Checklist de Frontend & Clientes Web
- [ ] **Sessão Protegida:** Cookies de autenticação configurados exclusivamente com `HttpOnly`, `Secure` e `SameSite=Lax/Strict`.
- [ ] **Zero JWT em LocalStorage:** Nenhuma credencial de longa duração ou token de sessão é armazenado em `localStorage` ou `sessionStorage`.
- [ ] **Web Crypto Segura:** Caches locais sensíveis utilizam AES-256-GCM com chaves `extractable: false` persistidas em IndexedDB.
- [ ] **Higienização de DOM:** Interpolações dinâmicas de HTML utilizam DOMPurify e Trusted Types; ausência de bypass sem validação.
- [ ] **Anti-SVG XSS:** Uploads ou renderizações de SVGs passam por sanitização ativa de tags `<script>` e manipuladores inline.
- [ ] **Headers HTTP Defensivos:** CSP estrita com nonces, HSTS Preload, COOP, COEP, CORP e Permissions-Policy ativados no gateway.
- [ ] **Anti-Clickjacking:** Inclusão de `frame-ancestors 'none'` na CSP e cabeçalho `X-Frame-Options: DENY`.
- [ ] **Ocultação Declarativa:** Elementos restritos são removidos do DOM via diretivas reativas (com plena ciência de que a autorização real reside no Backend).
- [ ] **Normalização Unicode:** Entradas textuais de filtros passam por normalização NFD no cliente.

### 2. Checklist de Backend, APIs & Persistência
- [ ] **Identidade Limpa:** Nenhuma rota aceita identificadores do próprio usuário (`id_usuario`, `cpf`) como parâmetro de URL.
- [ ] **Data Ownership Guard:** 100% das rotas que consultam ou alteram recursos específicos validam se o objeto pertence ao usuário ou ao seu tenant.
- [ ] **Envelope Encryption:** Campos confidenciais no banco são criptografados com DEK (AES-256-GCM) cifrada por KEK gerenciada em KMS/Vault, com descarte imediato da DEK da memória RAM.
- [ ] **Revogação Determinística:** O logout adiciona o `jti` à lista de revogação distribuída com TTL idêntico ao prazo remanescente do token.
- [ ] **Defesa Anti-Brute-Force:** Rate limiting ativo por IP e conta, bloqueando acessos após tentativas consecutivas incorretas.
- [ ] **Resiliência de Cache:** Implementação de fallback thread-safe em memória caso a camada de cache distribuído fique indisponível (*Zero Crash*).
- [ ] **Invalidação de Permissões:** Alterações de perfil purgam o cache de permissões atomicamente por prefixo.
- [ ] **Sanitização de Uploads:** Validação binária real de MIME Type por bytes mágicos; rollback físico imediato no storage em caso de falha de transação.
- [ ] **Comparações Seguras:** Hashes, tokens, nonces e assinaturas são comparados em tempo constante (`secrets.compare_digest` / `hash_equals`).
- [ ] **Encadeamento de Exceções:** Erros de infraestrutura usam `raise ... from exc`, evitando vazamento de stack traces e detalhes internos ao cliente.
- [ ] **Rate Limiting Anti-Lockout AD (Obrigatório):** Limiar da aplicação estritamente inferior ao GPO do Active Directory (máx 3 falhas na app vs 5 no AD), com intercepção prévia em cache antes de qualquer operação de bind LDAP.
- [ ] **Auditoria SIEM com Event IDs (Obrigatório):** Logs estruturados em JSON correlacionando Event IDs 4625 e 4740 do Active Directory, com proibição absoluta de registro de senhas em logs ou traces.
- [ ] **LDAPS & Proteção de DC (Altamente Recomendado):** Uso exclusivo de LDAPS (porta 636) / StartTLS, sanitização RFC 4515 contra LDAP Injection e proteção dos Domain Controllers com Bulkhead de conexões e timeout de 3 a 5s.
- [ ] **Anti-Password Spraying & Tarpit (Altamente Recomendado):** Detecção de tentativas em múltiplas contas pelo mesmo IP e introdução de delays exponenciais progressivos (tarpit).

### 3. Checklist de IA, Infraestrutura & SDLC
- [ ] **Delimitação Semântica de Prompts:** Prompts utilizam tags XML estritas (`<documento_contexto>`, `<entrada_usuario>`) com instrução explícita para não executar instruções contidas nos dados.
- [ ] **Context Scrubbing de PII:** Dados sensíveis sofrem mascaramento regex antes do despacho para provedores externos de LLM.
- [ ] **Validação de Saídas de IA:** Saídas de modelos sofrem validação estrita de schema antes de disparar APIs ou comandos; HTML gerado por IA passa por DOMPurify.
- [ ] **Human-in-the-Loop:** Ações mutativas ou destrutivas disparadas por agentes de IA exigem confirmação humana obrigatória.
- [ ] **Zero Segredos em Código/Disco:** Nenhuma credencial em texto claro no repositório; injeção dinâmica em tempo de execução via Secret Managers / Vaults.
- [ ] **Pre-commit Hooks:** Scanners de segredos rodam de forma síncrona nos hooks do Git antes de cada commit.
- [ ] **Sandboxing de Processos de IA:** Ferramentas locais de IA operam com diretivos restritos e arquivos confidenciais do SO montados em modo somente-leitura.
- [ ] **Supply Chain Security:** Versionamento estrito de lockfiles com integridade criptográfica SHA-512 e auditoria contínua de vulnerabilidades em CI/CD.
