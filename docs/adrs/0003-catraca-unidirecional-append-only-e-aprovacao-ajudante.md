<!--
================================================================================
LOG DE MANUTENÇÃO DE DOCUMENTAÇÃO
--------------------------------------------------------------------------------
Data       | Autor          | Descrição
--------------------------------------------------------------------------------
2026-11-04 | adr-governor   | Criação da ADR 0003 detalhando a catraca unidirecional append-only, aprovação via Ajudante e Raio-X com blur.
================================================================================
-->

# ADR 0003: Catraca Unidirecional Append-Only, Aprovação pelo Ajudante (Telegram + HMAC + Argon2id) e Raio-X com Blur

| Metadado | Detalhe |
| :--- | :--- |
| **Status** | **Aprovada** (2026-11-04) |
| **Decisores** | Arquitetura monBlock, SecOps, Produto, Tech Lead |
| **Tags** | `[security]`, `[cryptography]`, `[argon2id]`, `[telegram-bot]`, `[accountability-partner]` |
| **Impacto Sistêmico** | Alto (`rule-engine`, `partner-auth`, `unblock-inspector`) |
| **ADRs Relacionadas** | Supera ADR-003 de `_reversa_sdd/`; Relacionada a ADR-0001 e ADR-0004 |

## Contexto
Bloqueadores convencionais falham porque a mesma pessoa que configura o bloqueio detém a chave para desativá-lo. No aplicativo de referência (`_reversa_sdd/security-persistence/design.md` e `ADR-003`), além de o próprio usuário possuir a senha única, o hash utilizado era **MD5 simples sem salt** (`ACPasswordMgr.passwordMD5Value`), permitindo quebra instantânea por *rainbow tables* ou leitura do arquivo `csdv.dsc`.

Além disso, quando um bloqueio legítimo ocorre por falso positivo (ex.: um artigo de notícias ou ferramenta de trabalho barrado por palavra-chave), o Ajudante (*Accountability Partner*) precisa avaliar o pedido rapidamente pelo celular, entendendo o que é a página sem ser exposto de surpresa a imagens explícitas e sem exigir infraestrutura paga de servidores Cloud no MVP.

### Riscos Identificados e Problemas a Resolver:
1. **Recaída por Impulso no Painel de Regras**: Se o usuário puder desmarcar uma categoria ou remover um site bloqueado sem autorização externa, o bloqueio perde sua eficácia comportamental.
2. **Criptografia Fraca e Replay de Tokens**: Uso de algoritmos legados (MD5/SHA1) ou reutilização de códigos de liberação anteriores pelo usuário.
3. **Exposição Indesejada ou Falta de Contexto para o Ajudante**: Enviar apenas a URL nua dificulta identificar falsos positivos, enquanto enviar um screenshot sem filtro pode expor conteúdo explícito ao Ajudante.

---

## 1. Fundamentação Jurídica & Fontes Normativas Diretas (Se aplicável)

| Diploma Legal / Normativo | Artigos / Dispositivos Principais | Aplicação Prática no Sistema |
| :--- | :--- | :--- |
| **Guia de Segurança Defensiva Zero-Trust** | `.agents/ai-guides/guides/architecture/guia-seguranca-defensiva-zero-trust.md` | Hashing resistente a GPU (`Argon2id`/`scrypt`), comparação em tempo constante (`crypto.timingSafeEqual`) e sanitização de PII em URLs. |
| **Engenharia Reversa Cisdem AppCrypt** | `_reversa_sdd/security-persistence/requirements.md` (`RN-SEC-01`, `RN-LIM-02`, `RN-APP-04`) | Evolução da lista de códigos consumidos anti-replay e revogação de sessões temporárias em `sleep`. |

---

## 2. Decisão de Arquitetura

Estabelecer o modelo de **Catraca Unidirecional (`Append-Only`)** combinado com **Autenticação Multi-Canal do Ajudante a Custo Zero de Servidor** e **Inspeção Raio-X com Blur Gaussiano**:

1. **Invariante da Catraca Unidirecional (`Append-Only`)**:
   - **Operações de Endurecimento (Livres para o Usuário)**: Ativar qualquer uma das 11 categorias pré-cadastradas (sendo *Conteúdo Adulto* ativa e trancada desde a instalação), adicionar domínios à blocklist, adicionar palavras-chave e ativar a flag *"Bloquear Modo Anônimo"*.
   - **Operações de Afrouxamento (Exclusivas do Ajudante)**: Desativar categorias, remover domínios/palavras-chave, cadastrar exceções na allowlist (`whiteWebsites`), liberar temporariamente um site (`15 min`, `1h`, `24h`) ou desativar o bloqueio do Modo Anônimo exigem validação criptográfica no `monblockd`.
2. **Três Mecanismos de Aprovação pelo Ajudante (Custo R$ 0 de Infraestrutura)**:
   - **Canal Remoto Principal — Bot do Telegram API**: O `monblockd` envia o card do pedido diretamente para o `telegram_chat_id` do Ajudante com botões inline (`Liberar 15m`, `Liberar 1h`, `Liberar Permanente`, `Negar`).
   - **Canal Offline/Assíncrono — Token de Desafio-Resposta (`HMAC-SHA256`)**: Cada solicitação gera um `challenge_code` curto (ex.: `MB-8492-X7`). O Ajudante gera um token assinado validado via `crypto.timingSafeEqual` e registrado na tabela `used_tokens` para impedir replay (`RN-LIM-02`).
   - **Canal Presencial — Senha Mestra do Ajudante**: Armazenada exclusivamente como hash **Argon2id** (`memoryCost: 64MB, timeCost: 3, parallelism: 4`).
3. **Raio-X Contextual + Print Offscreen com Blur Gaussiano**:
   - O `unblock-inspector` sanitiza query strings sensíveis (`token`, `session`, `key`, `password`), bloqueia IPs privados contra SSRF, extrai título/descrição/regra acionada e captura um snapshot via `BrowserWindow` offscreen (`sandbox: true`, timeout `3.000ms`), aplicando **Gaussian Blur** por padrão com botão de **"Revelar Imagem"** (`has_spoiler: true` no Telegram e toggle no Card HTML).

### Matriz de Avaliação de Alternativas (Trade-off Matrix)

| Critério de Avaliação | Opção A: Senha MD5 Local (Cisdem AppCrypt) | Opção B: Backend SaaS Próprio Obrigatório | Opção C: Argon2id + HMAC Anti-Replay + Telegram Bot API Direta (Eleita) |
| :--- | :--- | :--- | :--- |
| **Custo / Esforço** | Baixo | Alto (custo mensal de servidor/banco) | Baixo (R$ 0 de servidor no MVP) |
| **Latência de Aprovação** | Presencial apenas | `< 2s` | `< 2s` (Telegram) ou Offline via Token HMAC |
| **Segurança & Privacidade** | Crítica (MD5 quebrável) | Média (dados trafegam em nuvem central) | Alta (Argon2id + dados locais + print com Spoiler) |
| **Complexidade Operacional** | Baixa | Alta | Baixa |
| **Curva de Aprendizado** | Rápida | Longa | Rápida |

```text
[Usuário Solicita Desbloqueio de URL]
          |
          v
[unblock-inspector (monblockd)]
  |-- 1. Sanitiza Query Strings + Valida Anti-SSRF (Rejeita IPs Privados)
  |-- 2. Extrai Metadados (Título, H1, Regra/Keyword exata que bloqueou)
  |-- 3. Captura Snapshot Offscreen (3000ms max) + Aplica Gaussian Blur
          |
          +---> [Via Telegram Bot API] ---> Celular do Ajudante (Foto c/ Spoiler + Resumo + Botões 1-Click)
          |
          +---> [Via Card HTML Offline] --> Challenge Code (MB-XXXX) -> Ajudante gera Token HMAC-SHA256
                                                                        validado c/ timingSafeEqual
```

---

## 3. Matriz de Implementação Técnica (*IN-CODE*)

### 3.1 Camada de Backend / Daemon (`partner-auth` & `unblock-inspector`)
- **Validação em Tempo Constante**: Todos os tokens HMAC e códigos de desafio são comparados via `crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))`.
- **Revogação Automática de Grants Temporários (`RN-APP-04`)**: Quando o sistema operacional emite `NSWorkspaceWillSleepNotification` ou atinge o tempo de expiração, o `monblockd` revoga imediatamente as concessões temporárias e reescreve `/etc/hosts` e Browser Policies.
- **Circuit Breaker no Telegram**: Após 5 falhas de rede consecutivas, abre o circuito por `30s` e orienta o usuário na UI a utilizar o Card HTML + Token HMAC offline.

### 3.2 Camada de Frontend / Client (`Electron UI`)
- **Trava Visual e Semântica da Catraca**: Categorias ativas exibem cadeado trancado; clicar em desativar abre diretamente o modal de solicitação ao Ajudante (com `onPaste` livre em conformidade com WCAG 3.3.8).

### 3.3 Camada de Persistência e Banco de Dados (ANSI SQL)
```sql
CREATE TABLE unblock_request (
    id TEXT PRIMARY KEY,
    target_url_sanitized TEXT NOT NULL,
    target_domain TEXT NOT NULL,
    matched_rule_desc TEXT NOT NULL,
    page_title TEXT,
    page_summary TEXT,
    user_reason TEXT NOT NULL,
    screenshot_blurred_b64 TEXT,
    challenge_code TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('PENDING', 'APPROVED_TEMP', 'APPROVED_PERM', 'DENIED')),
    created_at TEXT NOT NULL
) STRICT;

CREATE TABLE used_tokens (
    token_hash CHAR(64) PRIMARY KEY,
    request_id TEXT NOT NULL REFERENCES unblock_request(id),
    consumed_at TEXT NOT NULL
) STRICT;

CREATE TABLE temporary_grant (
    id TEXT PRIMARY KEY,
    domain TEXT NOT NULL,
    granted_by TEXT NOT NULL CHECK (granted_by IN ('TELEGRAM', 'PASSWORD', 'TOKEN')),
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes IN (15, 60, 1440)),
    expires_at TEXT NOT NULL,
    revoke_on_sleep INTEGER NOT NULL DEFAULT 1 CHECK (revoke_on_sleep IN (0, 1))
) STRICT;
```

---

## 6. Matriz de Conformidade e Mitigação de Riscos

| Risco Mapeado no Contexto | Impacto Potencial | Mitigação Arquitetural e Técnica Adotada |
| :--- | :--- | :--- |
| **Ataque de Replay com Token HMAC antigo** | Alto | Tabela `used_tokens` armazena o SHA-256 de cada token consumido e vincula o HMAC ao `challenge_code` único do pedido. |
| **SSRF via URL maliciosa no Raio-X** | Alto | Filtro de rede rejeita faixas privadas (`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`) antes do snapshot. |
| **Vazamento de tokens de sessão na URL capturada** | Médio | Higienização automática de parâmetros de query string antes de persistir ou enviar ao Telegram. |

---

## 7. Consequências e Resultados

### Positivas
- **Eliminação de Recaída por Auto-Sabotagem**: O usuário tem autonomia total para aumentar sua proteção em momentos de clareza, mas nunca para reduzi-la sozinho em momentos de impulso.
- **Operação Gratuita e Sem Dependência de Nuvem**: O uso direto da API do Bot do Telegram e de tokens HMAC elimina custos de hospedagem de backend no MVP.
- **Proteção Visual do Ajudante**: O blur gaussiano e a flag `has_spoiler` evitam exposição acidental a imagens impróprias durante a análise.

### Negativas e Trade-offs Assumidos
- **Dependência de Resposta Humana para Falsos Positivos**: Caso um domínio legítimo seja bloqueado por uma regra de palavra-chave ampla, o usuário precisará aguardar a aprovação do Ajudante (mitigado pela allowlist automática de domínios críticos de SSO/trabalho).
- **Custo de Memória na Renderização Offscreen**: A captura do snapshot instanciará uma `BrowserWindow` oculta temporária por até `3.000ms`, sendo destruída imediatamente após o print.
