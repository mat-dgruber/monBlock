# Sub-Especificação Modular 02 (MOD-02) — Guardião do Ajudante, Catraca Unidirecional `Append-Only`, Bot do Telegram & Recuperação em 3 Níveis

- **Data:** 2026-11-04
- **Código do Módulo:** `MOD-02`
- **Caminho Canônico:** `docs/ai/specs/2026-11-04-mod02-partner-guard-telegram-design.md`
- **Master Spec Vinculada:** `docs/ai/specs/2026-11-04-monblock-master-design.md`
- **Domínio DDD Correspondente:** `docs/domains/partner_accountability/`
- **ADRs de Referência:**
  - `docs/adrs/0001-arquitetura-split-privilegiada-daemon-monblockd.md`
  - `docs/adrs/0003-catraca-unidirecional-append-only-e-aprovacao-ajudante.md`
  - `docs/adrs/0004-pareamento-duravel-tripla-persistencia-e-recuperacao-3-niveis.md`
- **Status:** Especificação Técnica Modular (Fase 1 MVP)

---

## 1. Objetivo & Escopo Core

O **Módulo 02 (`MOD-02`)** implementa o núcleo de **Responsabilidade Compartilhada (*Accountability Partner* / "Ajudante")** do `monBlock`, substituindo a proteção frágil de senha local em MD5 sem salt (identificada na engenharia reversa de `_reversa_sdd/security-persistence/`) por:

1. **Catraca Unidirecional `Append-Only` (`canMutateProtectionRule`):** O usuário pode aumentar o bloqueio a qualquer instante sem senha, mas jamais pode reduzir regras, desativar categorias, adicionar exceções na allowlist ou destravar o Modo Anônimo sem autorização criptográfica do Ajudante.
2. **Criptografia Defensiva (`PartnerGuard`):** Derivação lenta de senha com `crypto.scryptSync` (`N=16384, r=8, p=1`, salt aleatório de 16 bytes), comparação em tempo constante via `crypto.timingSafeEqual`, e tokens de Desafio-Resposta offline assinados com `HMAC-SHA256` e proteção anti-replay (`RN-LIM-02`).
3. **Comunicação Direta via Bot do Telegram + Raio-X com Blur:** Envio de pedidos de desbloqueio diretamente para o celular do Ajudante (`api.telegram.org`) a custo zero de servidor, acompanhados de metadados higienizados e captura visual offscreen com desfoque gaussiano (`blur(24px)`) e spoiler (`has_spoiler: true`).
4. **Recuperação de Senha em 3 Níveis Anti-Impulso:** (Nível 1) comando `/reset_senha` no Telegram do Ajudante, (Nível 2) Kit de Emergência de 5 códigos de uso único (`REC-XXXXXX-XXXXXX`), e (Nível 3) Cooldown Time-Lock fail-closed de 72 horas com bloqueio 100% ativo durante toda a espera.

### 1.1. Mapeamento de Arquivos (`src/` e `tests/`)

| Caminho do Arquivo                     | Papel Arquitetural                                                                                                                                                                                                        | Status no Repositório                       |
| :------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------- |
| `src/domain/partner-guard.ts`        | Guardião criptográfico: `hashPartnerPassword`, `verifyPartnerPassword`, `generateChallengeToken`, `verifyChallengeToken`, `generateRecoveryKit`, `evaluateEmergencyCooldown` e `canMutateProtectionRule`. | Implementado e testado                       |
| `src/daemon/telegram-client.ts`      | Cliente HTTP resiliente para a API do Bot do Telegram (`sendUnblockRequestCard`, `pollPartnerCallbacks`, `handleRemotePasswordReset`), com timeout, retry com backoff + jitter e circuit breaker.                   | Especificado para implementação na Etapa 3 |
| `src/daemon/unblock-inspector.ts`    | Inspetor Raio-X: sanitiza URL, valida anti-SSRF contra IPs privados e captura snapshot com desfoque `blur(24px)` para avaliação digna pelo Ajudante.                                                                  | Especificado para implementação na Etapa 3 |
| `tests/domain/partner-guard.test.ts` | Suíte unitária AAA cobrindo `scrypt` + `timingSafeEqual`, tokens `HMAC-SHA256`, anti-replay `usedTokens`, Kit de 5 códigos, Cooldown de 72h fail-closed e Catraca `Append-Only`.                             | Implementado (`14/14` suites verdes)       |

### 1.2. Contratos de Entrada e Saída (`TypeScript`)

```typescript
// src/domain/partner-guard.ts
export type UnlockDuration = '15m' | '60m' | 'permanent';

export interface ProtectionMutationParams {
  current: RuleEngineState;
  next: RuleEngineState;
  partnerAuthorized: boolean;
}

export interface ProtectionMutationResult {
  allowed: boolean;
  reason?: string;
}

export function hashPartnerPassword(password: string): string;
export function verifyPartnerPassword(password: string, storedHash: string): boolean;

export function generateChallengeToken(
  secret: string,
  challengeCode: string,
  duration: UnlockDuration
): string;

export function verifyChallengeToken(params: {
  secret: string;
  challengeCode: string;
  token: string;
  usedTokens: Set<string>;
}): { valid: boolean; duration?: UnlockDuration };

export function generateRecoveryKit(): { plainCodes: string[]; hashedCodes: string[] };

export function evaluateEmergencyCooldown(
  startedAtIso: string,
  nowMs: number
): { unlocked: boolean; remainingHours: number };

export function canMutateProtectionRule(
  params: ProtectionMutationParams
): ProtectionMutationResult;
```

---

## 2. Restrições Técnicas, Casos de Borda & Invariantes

### 2.1. Restrições Não-Funcionais (SLAs e Criptografia)

- **Custo Computacional de Hashing (`scrypt`):** Parâmetros calibrados (`N=16384, r=8, p=1`, saída de 64 bytes) para tempo de verificação entre `40ms` e `120ms` em hardware desktop padrão, inviabilizando força bruta por GPU sem travar a resposta IPC.
- **SLA de Despacho ao Telegram:** `p95 < 2500ms` para envio do card de solicitação ao `telegram_chat_id` do Ajudante quando online; fallback instantâneo (`< 5ms`) para exibição do `challengeCode` offline (`MB-XXXX-XX`).
- **Infraestrutura Cloud Zero:** Nenhuma dependência de backend SaaS pago; comunicação direta `monblockd -> https://api.telegram.org`.

### 2.2. Invariantes de Domínio

1. **Invariante `INV-RATCHET-01` (Catraca Unidirecional `Append-Only`):** Quando `partnerAuthorized === false`, `canMutateProtectionRule` rejeita imediatamente qualquer transição `current -> next` que:
   - Remova qualquer categoria presente em `current.enabledCategories`;
   - Remova qualquer domínio presente em `current.blockedDomains`;
   - Remova qualquer termo presente em `current.keywords`;
   - Adicione qualquer domínio novo em `next.allowlistDomains`;
   - Altere `lockIncognito` de `true` para `false`.
2. **Invariante `INV-REPLAY-04` (Anti-Replay Estrito — `RN-LIM-02`):** Todo token `UNLOCK-<DURATION>-<MAC10>` validado por `verifyChallengeToken` é inserido imediatamente no conjunto `usedTokens` (e persistido na tabela `used_tokens`). Uma segunda submissão do mesmo token retorna obrigatoriamente `{ valid: false }`.
3. **Invariante `INV-COOLDOWN-05` (Fail-Closed 72h):** `evaluateEmergencyCooldown(startedAtIso, nowMs)` retorna `{ unlocked: false, remainingHours: 72 }` se `startedAtIso` for inválido (`NaN`), vazio ou corrompido, e exige `elapsed >= 72 * 3600 * 1000` (`259.200.000 ms`) para retornar `unlocked: true`.
4. **Invariante `INV-RECOVERY-06` (Kit de 5 Códigos Single-Use):** `generateRecoveryKit()` produz exatamente 5 códigos no formato `REC-XXXXXX-XXXXXX` (48 bits de entropia hexadecimal aleatória por código) e retorna apenas seus hashes `scrypt$<salt>$<derived>` para armazenamento em disco.

### 2.3. Casos de Borda Tratados (`Corner Cases`)

- **Hashes Malformados ou Legados:** Se `storedHash` não possuir exatamente 3 segmentos separados por `$`, prefixo `scrypt`, salt não-vazio e chave derivada de 64 bytes (128 caracteres hex), `verifyPartnerPassword` retorna `false` sem lançar exceção não tratada.
- **Manipulação de Relógio Retroativa no Cooldown:** Se o usuário alterar o relógio do sistema para o passado (`nowMs < startMs`), `Math.max(0, nowMs - startMs)` fixa `elapsed = 0`, mantendo `unlocked: false` e `remainingHours: 72`.
- **Normalização Case-Insensitive na Catraca e nos Tokens:** `canMutateProtectionRule` normaliza espaços e caixa (`trim().toLowerCase()`) para não acusar falso positivo quando o usuário reenvia a mesma lista com capitalização diferente; `verifyChallengeToken` normaliza o token com `trim().toUpperCase()`.
- **Proteção Anti-SSRF no Raio-X:** Antes de capturar o título/print da página solicitada, o `unblock-inspector` resolve o host e bloqueia conexões para faixas privadas/loopback (`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `::1`).

---

## 3. Arquitetura, Limites Modulares & Contratos de Erro (`RFC 9457`)

### 3.1. Limites Modulares (Verificados via Graphify)

- `src/domain/partner-guard.ts` é um módulo de **Domínio Puro** que depende exclusivamente de `node:crypto` e do tipo `RuleEngineState` de `src/domain/rule-engine.ts`.
- `src/daemon/telegram-client.ts` e `src/daemon/unblock-inspector.ts` operam na camada de **Serviço / Daemon (`monblockd`)**, orquestrando chamadas externas e persistindo tokens consumidos no `StateStore` (`MOD-03`).

### 3.2. Contrato Padronizado de Erros (`RFC 9457 Problem Details`)

Qualquer falha de autorização do Ajudante, violação da Catraca `Append-Only`, token expirado/reutilizado ou rate-limit retorna `application/problem+json`:

```json
{
  "type": "https://monblock.ccat.local/problems/403",
  "title": "Operação bloqueada pela Catraca Unidirecional",
  "status": 403,
  "detail": "Desativar a categoria 'adult' exige autorização do Ajudante.",
  "instance": "/api/rules/categories"
}
```

|        Status HTTP        | `type`                                     | Cenário de Disparo                                                                                                   |
| :-----------------------: | :------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------- |
|   `401 Unauthorized`   | `https://monblock.ccat.local/problems/401` | Senha do Ajudante incorreta, token `HMAC-SHA256` inválido ou Recovery Code já utilizado.                          |
|     `403 Forbidden`     | `https://monblock.ccat.local/problems/403` | Tentativa de reduzir proteção (`canMutateProtectionRule` retornou `allowed: false`) sem credencial do Ajudante. |
|     `409 Conflict`     | `https://monblock.ccat.local/problems/409` | Tentativa de reutilizar um token `UNLOCK-*` já presente em `usedTokens` (`RN-LIM-02`).                         |
| `429 Too Many Requests` | `https://monblock.ccat.local/problems/429` | Excesso de tentativas de senha/código de recuperação (rate limit de 3 falhas a cada 15 minutos).                   |

---

## 4. Resiliência: Timeouts, Retry com Backoff + Jitter, Concorrência, Idempotência & Circuit Breaker

1. **Timeouts Explícitos (`ms`) & AbortController:**
   - Chamadas HTTPS para `https://api.telegram.org/bot<token>/sendPhoto` e `sendMessage` utilizam `AbortController` com timeout estrito de `5000ms`.
   - A captura de snapshot offscreen pelo `unblock-inspector` possui timeout rígido de `3000ms`; caso a página alvo demore mais para carregar, o pedido é enviado imediatamente ao Ajudante apenas com os metadados textuais (URL higienizada + regra disparada + justificativa do usuário).
2. **Retry com Backoff Exponencial + Jitter:**
   - Falhas transitórias de rede (`ECONNRESET`, `ETIMEDOUT`, HTTP `502`/`503`/`504`) ao contatar `api.telegram.org` disparam até 3 retentativas com backoff exponencial (`500ms`, `1500ms`, `3500ms`) acrescido de jitter aleatório (`0-250ms`).
3. **Concorrência, Idempotência & Exclusão Mútua:**
   - O consumo de tokens em `verifyChallengeToken` e de códigos do Kit de Emergência ocorre de forma atômica na memória e em transação `BEGIN IMMEDIATE` no SQLite, prevenindo condição de corrida (*race condition*) caso duas requisições concorrentes enviem o mesmo token simultaneamente.
   - Submissões de pedidos de desbloqueio respeitam `Idempotency-Key` para impedir spam de mensagens repetidas no Telegram do Ajudante.
4. **Circuit Breaker, Rate Limiting & Degradação Graciosa Offline:**
   - Após 5 falhas consecutivas na API do Telegram, o Circuit Breaker abre por `60.000ms` (`60s`). Durante o estado aberto, o sistema degrada graciosamente para o **Modo Desafio-Resposta Offline**: exibe o `challengeCode` (`MB-XXXX-XX`) na tela para que o usuário envie por SMS/WhatsApp/ligação ao Ajudante e receba o token `UNLOCK-15M-<MAC10>`.
   - Rate limiter defensivo limita verificações de senha/Recovery Code a 3 tentativas a cada 15 minutos (`900.000ms`), bloqueando ataques de força bruta local.
5. **Limites de Fronteira de Dados (`Payload Boundaries`):**
   - Justificativa textual do usuário (`user_reason`) limitada a `500` caracteres UTF-8 (entradas vazias ou nulas são rejeitadas com `400 Bad Request`); imagem do Raio-X com blur comprimida em JPEG/WebP limitada a `250 KB`.

---

## 5. Segurança Defensiva Zero-Trust & Privacidade (LGPD)

- **Comparação em Tempo Constante (`crypto.timingSafeEqual`):** Tanto `verifyPartnerPassword` quanto `verifyChallengeToken` comparam buffers de mesmo comprimento via `crypto.timingSafeEqual`, eliminando ataques de canal lateral (*timing attacks*).
- **Privacidade Visual e Dignidade (Raio-X com Blur + Reveal):**
  - Na tela local do usuário (`:49152/blocked`), nenhum print explícito é exibido — apenas a explicação limpa da regra que atuou.
  - Para o Ajudante, a captura da aba bloqueada recebe filtro **Gaussian Blur (`blur(24px)`)** antes de sair da máquina e é enviada ao Telegram com `has_spoiler: true`. O Ajudante vê primeiro o resumo contextual e só revela a imagem se julgar necessário para auditar um falso positivo.
- **Gestão Segura de Segredos (Zero Hardcoded Secrets):** O `telegram_bot_token` e o `hmac_secret` nunca ficam no código-fonte ou em variáveis expostas ao Renderer Electron; são guardados no System Keychain (`0600`) ou injetados em desenvolvimento via `op run --`.

---

## 6. Design UI/UX (Fluxos do Ajudante, Pareamento e Recuperação), WCAG 2.2 AAA & Motion

As interfaces de interação com o `PartnerGuard` (Modal de Autorização do Ajudante, Onboarding do Kit de 5 Códigos e Central de Recuperação em 3 Níveis) seguem o **Design System CCAT (`docs/design/tokens.css`)**:

- **4 Temas CCAT & Zero Roxo:** Suporte completo a `capycro` (Warm Ivory `#F6F4EE`), `dark-tech`, `light-fintech` e `high-contrast`, sem qualquer matiz roxo/violeta.
- **5 Estados Obrigatórios de Interface:**
  1. `Loading / Skeleton`: Exibido durante o cálculo assíncrono do hash `scrypt` ou enquanto aguarda confirmação de entrega do card no Telegram.
  2. `Empty State`: Estado inicial do painel de concessões temporárias quando não há nenhum desbloqueio temporário ativo.
  3. `Error State (RFC 9457)`: Alerta semântico (`role="alert"`) exibindo o motivo exato retornado por `canMutateProtectionRule` (ex.: `"Remover a palavra-chave 'porn' exige autorização do Ajudante."`) ou erro de token já utilizado.
  4. `Partial / Degraded State`: Card de contingência quando o Circuit Breaker do Telegram está aberto (exibindo o `challengeCode` offline) ou banner fixo quando o Cooldown de 72h está em contagem regressiva.
  5. `Populated State`: Exibição do status do Ajudante pareado, códigos restantes do Kit de Emergência (`X/5 disponíveis`) e cronômetros regressivos com `font-variant-numeric: tabular-nums`.
- **Acessibilidade WCAG 2.2 AA/AAA & APCA:**
  - Contraste `>= 7:1` (`APCA Lc >= 75`), alvos de clique `>= 44x44px`, `:focus-visible` nítido, suporte integral a colar tokens e senhas (`onPaste` habilitado conforme WCAG 2.2 3.3.8 — Autenticação Acessível) e navegação por teclado (`Escape` fecha modal com foco restaurado ao botão de origem).
- **Animação, Framerate Independence (`deltaTime`) & Acessibilidade Vestibular:**
  - Animações de abertura de modal e transição de revelação (`Reveal`) restritas a `transform` e `opacity` no compositor GPU (`60fps`).
  - Desativação integral de transições sob `@media (prefers-reduced-motion: reduce)` e `prefers-reduced-transparency: reduce`.
  - O contador regressivo do Cooldown de 72h e dos desbloqueios de `15m`/`60m` utiliza `evaluateEmergencyCooldown(startedAtIso, Date.now())` baseado em tempo real decorrido (`deltaTime` / `elapsed`), imune a throttling de background.

---

## 7. Pre-Mortem & Modos de Falha (Blast Radius)

| Incidente Hipotético (Pre-Mortem 3h da Manhã)                                           | Blast Radius                                                 | Causa Raiz                                                               | Mitigação Implementada                                                                                                                           |
| :---------------------------------------------------------------------------------------- | :----------------------------------------------------------- | :----------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Usuário tenta reaproveitar um token `UNLOCK-15M-*` usado ontem**            | Reabertura não autorizada de site bloqueado                 | Falta de vinculação ao desafio único ou falta de registro de consumo. | O HMAC inclui `${challengeCode}:${duration}` e `verifyChallengeToken` grava o token em `usedTokens` na primeira validação (`RN-LIM-02`). |
| **2. Ajudante perde o celular com Telegram e esquece a Senha Mestra**               | Risco de bloqueio eterno (*brick*) da máquina do usuário | Ausência de rota de contingência sem servidor central.                 | Escada de Recuperação em 3 Níveis (`ADR-0004`): uso de 1 dos 5 códigos `REC-XXXXXX-XXXXXX` ou início do Cooldown Time-Lock de 72h.        |
| **3. Usuário adianta o relógio do macOS em +4 dias para zerar o Cooldown de 72h** | Burla do Time-Lock de emergência                            | Confiança exclusiva no `Date.now()` manipulável pelo usuário local. | Cruzamento com delta monotônico de `os.uptime()` persistido pelo daemon e validação de horário via cabeçalho HTTPS `Date` (`ADR-0004`). |
| **4. API do Telegram sofre instabilidade global ou bloqueio de rede**               | Ajudante não recebe notificação push no celular           | Dependência exclusiva de canal online único.                           | Circuit Breaker abre após 5 falhas e ativa imediatamente o fluxo de Desafio-Resposta Offline via Token `HMAC-SHA256`.                           |

---

## 8. Matriz de Alternativas Consideradas (Trade-offs)

| Alternativa                                                                                                    | Descrição                                                                                                                                                        | Prós                                                                                          | Contras                                                                                             |     Veredito     |
| :------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------- | :--------------: |
| **Abordagem A (Hash MD5 Local — Cisdem AppCrypt)**                                                      | Senha única em MD5 sem salt salva em `.plist` do usuário.                                                                                                      | Implementação trivial.                                                                       | Quebrada em segundos e sem separação entre usuário e Ajudante.                                   |    Rejeitada    |
| **Abordagem B (Servidor Cloud SaaS Próprio)**                                                           | Backend pago intermediando todos os pedidos e contas de Ajudantes.                                                                                                 | Dashboard web centralizado.                                                                    | Custo recorrente de servidor, risco de privacidade em nuvem e ponto único de falha se o SaaS cair. |    Rejeitada    |
| **Abordagem C (`PartnerGuard` + Telegram Bot Direto + HMAC Offline + 3 Níveis — `ADR-0003/0004`)** | `scrypt` + `timingSafeEqual`, tokens `HMAC-SHA256` anti-replay, Bot Telegram direto e recuperação em 3 níveis (Telegram / Kit 5 Códigos / Cooldown 72h). | Custo R$ 0 de servidor, funciona online e offline, privacidade local e zero brecha de impulso. | Exige geração do Kit de 5 códigos durante o onboarding inicial.                                  | **Eleita** |

---

## 9. Reversibilidade & Plano de Rollback

1. **Revogação Imediata de Concessões Temporárias (`Grants`):**
   - Qualquer desbloqueio temporário (`15m`, `60m`) pode ser revogado instantaneamente pelo Ajudante via botão `"Revogar Agora"` no Telegram ou automaticamente quando o macOS entra em suspensão (`NSWorkspaceWillSleepNotification` — `RN-APP-04`), reaplicando `/etc/hosts` e Browser Policies em `< 100ms`.
2. **Cancelamento Voluntário do Cooldown de 72h:**
   - Caso o usuário tenha iniciado o Cooldown de 72h em um momento de vulnerabilidade e recobre a clareza (ou o Ajudante clique em `"Cancelar Timer"` no alerta de 6/6h do Telegram), o estado `cooldown_started_at` é limpo atomicamente e a proteção segue intacta.
3. **Rotação Atômica de Credenciais do Ajudante:**
   - Ao utilizar `/reset_senha` ou um código do Kit de Emergência, o novo hash `scrypt` substitui o anterior em transação atômica com backup de estado no `StateStore`.

---

## 10. Estratégia de Testabilidade & Pirâmide de Testes (AAA)

1. **Testes Unitários Criptográficos e de Domínio (`tests/domain/partner-guard.test.ts`):**
   - *Arrange:* Senha mestra do Ajudante, segredo HMAC, `challengeCode = 'MB-8492-X7'`, `usedTokens = new Set()`, e dois estados `RuleEngineState` (`current` vs `next`).
   - *Act:* Execução de `hashPartnerPassword`, `verifyPartnerPassword`, `generateChallengeToken`, `verifyChallengeToken` (1ª e 2ª chamada), `generateRecoveryKit`, `evaluateEmergencyCooldown` (em `t = 12h`, `t = 72h`, `t < 0` e data inválida) e `canMutateProtectionRule`.
   - *Assert:* Confirma que a senha correta valida (`true`), senha incorreta falha (`false`), replay do mesmo token falha na 2ª tentativa (`valid: false`), Kit gera 5 códigos únicos `REC-XXXXXX-XXXXXX`, Cooldown mantém `unlocked: false` antes de 72h, e a Catraca `Append-Only` permite adições sem senha mas bloqueia qualquer remoção com mensagem descritiva.
2. **Testes de Integração do Fluxo de Desbloqueio (`tests/server/block-server.test.ts`):**
   - *Arrange:* Servidor HTTP local ativo e submissão de pedido com cabeçalho `Idempotency-Key`.
   - *Act:* Disparo concorrente de `POST /api/unblock-requests` e validação de payloads inválidos.
   - *Assert:* Verifica deduplicação idempotente (`202 Accepted`) e contratos de erro `RFC 9457` (`application/problem+json`).
3. **Testes E2E de Fluxo de Autorização e Acessibilidade:**
   - Simulação completa do bloqueio de remoção de categoria na UI, abertura do modal do Ajudante, colagem (`paste`) de token `UNLOCK-15M-*` e verificação de foco e contraste WCAG 2.2 AAA.
