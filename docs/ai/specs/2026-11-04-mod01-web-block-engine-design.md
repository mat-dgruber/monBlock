# Sub-Especificação Modular 01 (MOD-01) — Motor de Bloqueio Web em 3 Camadas

- **Data:** 2026-11-04
- **Código do Módulo:** `MOD-01`
- **Caminho Canônico:** `docs/ai/specs/2026-11-04-mod01-web-block-engine-design.md`
- **Master Spec Vinculada:** `docs/ai/specs/2026-11-04-monblock-master-design.md`
- **Domínio DDD Correspondente:** `docs/domains/web_blocking/`
- **ADRs de Referência:**
  - `docs/adrs/0001-arquitetura-split-privilegiada-daemon-monblockd.md`
  - `docs/adrs/0002-bloqueio-web-em-3-camadas-hosts-policies-watcher.md`
  - `docs/adrs/0003-catraca-unidirecional-append-only-e-aprovacao-ajudante.md`
  - `docs/adrs/0004-pareamento-duravel-tripla-persistencia-e-recuperacao-3-niveis.md`
- **Status:** Especificação Técnica Modular (Fase 1 MVP)

---

## 1. Objetivo & Escopo Core

O **Módulo 01 (`MOD-01`)** implementa o **Motor de Bloqueio Web em 3 Camadas (Defesa em Profundidade)** do `monBlock`, eliminando os pontos cegos identificados na engenharia reversa de referência (`_reversa_sdd/web-block-engine/`, na qual o bloqueio dependia apenas de polling via AppleEvents e falhava integralmente no Firefox e diante de DNS-over-HTTPS).

### 1.1. Mapeamento de Arquivos (`src/`, `scripts/` e `tests/`)

| Caminho do Arquivo | Papel Arquitetural | Status no Repositório |
| :--- | :--- | :--- |
| `src/domain/categories.ts` | Catálogo imutável `PREDEFINED_CATEGORIES` com as 11 categorias de bloqueio (`CategoryDefinition`), sendo `adult` habilitada por padrão (`enabledByDefault: true`). | Implementado e testado |
| `src/domain/rule-engine.ts` | Motor determinístico `RuleEngine` (`sanitizeAndNormalizeUrl`, `validateBatchDomains`, `evaluateUrlAndTitle`, `MAX_BATCH_DOMAINS = 100`, `CRITICAL_INFRA_ALLOWLIST`). | Implementado e testado |
| `src/enforcers/hosts-enforcer.ts` | Camada 1 (Rede/Kernel): escrita atômica em `/etc/hosts` (`applyAtomicHostsBlock`) e restauração (`rollbackHostsFromBackup`) com suporte a imutabilidade `chflags uchg`. | Implementado e testado |
| `src/enforcers/browser-policy-enforcer.ts` | Camada 2 (Enterprise Browser Policies): geração de manifestos gerenciados (`buildBrowserPolicies`) para Chromium (`URLBlocklist`, `URLAllowlist`, `DnsOverHttpsMode: 'off'`, `IncognitoModeAvailability`) e Firefox (`WebsiteFilter`, `DNSOverHTTPS.Locked`, `DisablePrivateBrowsing`). | Implementado e testado |
| `src/enforcers/macos-watcher.ts` | Camada 3 (Watcher Universal): inspeção ativa de URLs e títulos de abas via AppleEvents (`osascript` para Safari, Chrome, Brave, Edge, Arc) e Accessibility API (`AXUIElement` para Firefox e derivados Gecko), redirecionando violações para `http://127.0.0.1:49152/blocked`. | Especificado para implementação na Etapa 3 |
| `scripts/test-block-server.mjs` | Servidor HTTP local (`127.0.0.1:49152`) com `createMonBlockHttpServer()` e erros padronizados via `sendProblemDetails()` (`RFC 9457 Problem Details`). | Implementado e testado |
| `tests/domain/rule-engine.test.ts` | Suíte unitária AAA validando higienização de URL, precedência `ALLOWLIST > BLOCKLIST`, lote de 100 domínios e palavras-chave simples/`AND`. | Implementado (`14/14` suites verdes) |
| `tests/enforcers/enforcers.test.ts` | Suíte de integração AAA validando escrita atômica `.monblock.tmp`, backup `.monblock.bak`, rollback e geração de políticas Chromium/Firefox. | Implementado (`14/14` suites verdes) |
| `tests/server/block-server.test.ts` | Suíte de integração HTTP validando `/blocked`, `/api/health`, idempotência em `POST /api/unblock-requests` e `RFC 9457` (`application/problem+json`). | Implementado (`14/14` suites verdes) |

### 1.2. Contratos de Entrada e Saída (`TypeScript`)

```typescript
// src/domain/categories.ts
export interface CategoryDefinition {
  id: string;
  namePt: string;
  enabledByDefault: boolean;
  domains: string[];
  keywords: string[];
}

// src/domain/rule-engine.ts
export interface RuleEngineState {
  enabledCategories: string[];
  blockedDomains: string[];
  allowlistDomains: string[];
  keywords: string[];
  lockIncognito: boolean;
}

export interface BlockDecision {
  blocked: boolean;
  reason?: 'CATEGORY' | 'CUSTOM_DOMAIN' | 'KEYWORD';
  ruleLabel?: string;
}

export function sanitizeAndNormalizeUrl(
  rawInput: string
): { domain: string; cleanUrl: string } | null;

export function validateBatchDomains(rawDomains: string[]): {
  valid: boolean;
  domains: string[];
  error?: string;
};

export function evaluateUrlAndTitle(input: {
  url: string;
  title: string;
  state: RuleEngineState;
}): BlockDecision;
```

---

## 2. Restrições Técnicas, Casos de Borda & Invariantes

### 2.1. Restrições Não-Funcionais (SLAs e Orçamento de Recursos)
- **Latência de Decisão do `RuleEngine`:** `p99 < 1ms` em memória para avaliação de `evaluateUrlAndTitle`.
- **Latência de Bloqueio na Camada 1 (`/etc/hosts`):** `< 1ms` na resolução DNS do kernel macOS (`mDNSResponder`).
- **Latência de Redirecionamento na Camada 3 (`macos-watcher.ts`):** `p95 < 400ms` entre a abertura/mudança de aba e o redirecionamento para `http://127.0.0.1:49152/blocked`.
- **Orçamento de CPU e Memória do Watcher:** Consumo médio `< 1% CPU` e `< 35MB RSS` em execução contínua no daemon.

### 2.2. Invariantes de Domínio
1. **Invariante `INV-RATCHET-01` (Catraca Unidirecional `Append-Only`):** Adicionar categorias, domínios bloqueados, palavras-chave ou ativar `lockIncognito: true` é permitido livremente ao usuário; remover regras, desativar categorias, inserir itens em `allowlistDomains` ou mudar `lockIncognito` para `false` exige `partnerAuthorized: true` validado pelo `PartnerGuard` (`ADR-0003`).
2. **Invariante `INV-PRECEDENCE-03` (`ALLOWLIST > BLOCKLIST` — `RN-WEB-01`):** Se um domínio (ou superdomínio via `matchesDomain`) consta em `allowlistDomains`, `evaluateUrlAndTitle` retorna `{ blocked: false }` antes de inspecionar categorias, domínios customizados ou palavras-chave.
3. **Invariante `INV-INFRA-02` (`CRITICAL_INFRA_ALLOWLIST` Anti-Lockout):** Os hosts `localhost`, `127.0.0.1`, `api.telegram.org`, `accounts.google.com`, `appleid.apple.com` e `login.microsoftonline.com` jamais são incluídos no bloco `# >>> MONBLOCK START >>>` do `/etc/hosts` nem bloqueados por palavras-chave acidentais no título da página.
4. **Invariante `INV-LOOP-04` (Prevenção de Loop Infinito — `RN-WEB-02`):** Qualquer URL iniciada por `http://127.0.0.1:49152/blocked` retorna imediatamente `{ blocked: false }`, impedindo que o watcher redirecione uma aba que já exibe a Tela de Bloqueio.

### 2.3. Casos de Borda Tratados (`Corner Cases`)
- **Esquemas Não-HTTP Maliciosos:** Entradas como `javascript:alert(1)`, `data:text/html,...`, `file:///etc/passwd` ou strings vazias/nulas (`null`, `""`) são rejeitadas por `sanitizeAndNormalizeUrl`, retornando `null`.
- **Normalização de `www.` e Subdomínios:** `https://WWW.PornHub.com/view?token=secret#frag` é higienizado para `domain: 'pornhub.com'` e `cleanUrl: 'https://pornhub.com/view'` (sem query string nem fragmento), e `sub.pornhub.com` casa com `pornhub.com` via `host.endsWith('.pornhub.com')`.
- **Operador Lógico `AND` em Palavras-Chave (`RN-WEB-06`):** Termos separados por vírgula (ex.: `'cassino,online'` ou `'roleta,aposta'`) só disparam bloqueio quando **todos** os termos aparecem simultaneamente na concatenação `${cleanUrl} ${title}`.
- **Prevenção Geral de Falsos Positivos (*Scunthorpe Problem*, Fronteira de Palavra e Contexto Cotidiano — `RN-WEB-07`):**
  - **Decodificação Prévia de URL (`safeDecodeUri`):** Antes de avaliar fronteiras de palavra, a URL e o título passam por `decodeURIComponent` seguro para que palavras acentuadas codificadas (ex.: `institui%C3%A7%C3%A3o`) sejam reconstituídas como uma única palavra contínua (`instituição`) em vez de serem partidas pelo caractere `%`.
  - **Fronteira de Palavra Inteira Unicode (`matchesKeywordWholeWord`):** Cada termo é avaliado via regex Unicode `(?<![\p{L}\p{N}])termo(?![\p{L}\p{N}])` (`flag 'iu'`), resolvendo na raiz o *Scunthorpe Problem*: termos curtos como `'tit'`, `'sex'`, `'anal'`, `'ass'` ou `'cum'` **jamais** bloqueiam rotas ou títulos que os contenham dentro de outras palavras (`"instituição"`, `"instituicao"`, `"título"`, `"constituição"`, `"atitude"`, `"sexta-feira"`, `"unissex"`, `"análise"`, `"canal"`, `"assunto"`, `"documento"`).
  - **Higienização de Abreviações e Contextos Cotidianos Benignos (`sanitizeBenignTitleContexts`):** Abreviações seguidas de ponto no título (`"sex."`, `"tit."`, `"art."`, `"cap."`, `"prof."`), faixas de dias úteis (`"seg a sex"`, `"sex, sáb e dom"`) e rótulos cadastrais/médicos (`"sexo: masculino"`, `"sexo feminino"`) são neutralizados antes da avaliação.
  - **Sugestão Assistida de Combinação `AND` para Termos Curtos na UI:** Ao cadastrar uma keyword de $\le 3$ caracteres, a interface orienta o usuário sobre o funcionamento por palavra inteira e sugere combinações com vírgula (`ex.: tit,porn` ou `sex,video`) caso deseje restringir apenas contextos explícitos.
- **Preservação de Entradas Customizadas no `/etc/hosts`:** `applyAtomicHostsBlock` substitui apenas o trecho entre `# >>> MONBLOCK START >>>` e `# <<< MONBLOCK END <<<`, preservando mapeamentos de Docker, Kubernetes e VPNs locais.

---

## 3. Arquitetura, Limites Modulares & Contratos de Erro (`RFC 9457`)

### 3.1. Limites Modulares (Verificados via Graphify)
- `src/domain/categories.ts` e `src/domain/rule-engine.ts` são **módulos puros de domínio** (zero dependências de I/O, rede ou sistema de arquivos).
- `src/enforcers/hosts-enforcer.ts` e `src/enforcers/browser-policy-enforcer.ts` pertencem à camada de **Infraestrutura / Enforcers** (`ADR-0001`, `ADR-0002`) e dependem unicamente das regras já validadas pelo domínio.
- `scripts/test-block-server.mjs` (e o listener HTTP do daemon em `127.0.0.1:49152`) expõe a fronteira HTTP local para a Tela de Bloqueio e para submissão de pedidos ao Ajudante.

### 3.2. Contrato Padronizado de Erros HTTP (`RFC 9457 Problem Details`)
Todas as falhas nas rotas HTTP do servidor local (`127.0.0.1:49152`) respondem com `Content-Type: application/problem+json; charset=utf-8`, `X-Content-Type-Options: nosniff` e `X-Frame-Options: DENY`:

```json
{
  "type": "https://monblock.ccat.local/problems/400",
  "title": "Payload JSON inválido",
  "status": 400,
  "detail": "O corpo da requisição não pôde ser interpretado como JSON válido.",
  "instance": "/api/unblock-requests"
}
```

| Status HTTP | `type` | Cenário de Disparo |
| :---: | :--- | :--- |
| `400 Bad Request` | `https://monblock.ccat.local/problems/400` | JSON malformado ou lote de domínios acima de `MAX_BATCH_DOMAINS = 100`. |
| `403 Forbidden` | `https://monblock.ccat.local/problems/403` | Violação da Catraca Unidirecional `Append-Only` sem autorização do Ajudante. |
| `404 Not Found` | `https://monblock.ccat.local/problems/404` | Rota inexistente no servidor local `127.0.0.1:49152`. |
| `413 Payload Too Large` | `https://monblock.ccat.local/problems/413` | Corpo HTTP superior ao limite defensivo de `16 KB`. |

---

## 4. Resiliência: Timeouts, Retry com Backoff + Jitter, Concorrência, Idempotência & Circuit Breaker

1. **Timeouts Explícitos (`ms`) & AbortController:**
   - Execuções de `osascript` / `AXUIElement` no `macos-watcher.ts` possuem `timeout: 1500ms` por ciclo de inspeção e `AbortController` para encerrar processos filhos caso um navegador congele (Beachball no macOS).
   - Requisições HTTP locais para `POST /api/unblock-requests` possuem timeout de leitura de body de `3000ms`.
2. **Retry com Backoff Exponencial + Jitter:**
   - Caso a aplicação de `dscacheutil -flushcache` ou a escrita de políticas gerenciadas encontre lock transitório de arquivo no macOS, o enforcer executa até 3 tentativas com backoff exponencial (`100ms`, `300ms`, `700ms`) somado a jitter aleatório uniforme (`0-50ms`).
3. **Concorrência, Escrita Atômica & Idempotência:**
   - `applyAtomicHostsBlock` grava primeiramente em `${hostsFilePath}.monblock.tmp` (UTF-8) e efetiva a substituição via `fs.renameSync(tmpPath, hostsFilePath)` (operação atômica POSIX no mesmo filesystem), evitando leitura truncada pelo resolver DNS.
   - O endpoint `POST /api/unblock-requests` lê o cabeçalho `Idempotency-Key` e armazena o resultado em `idempotencyStore`, retornando `202 Accepted` com `"deduplicated": true` em submissões concorrentes ou cliques duplos (double-submit).
4. **Circuit Breaker, Bulkhead & Degradação Graciosa:**
   - Se um navegador específico (ex.: Safari ou Arc) falhar na consulta AppleEvents por 5 ciclos seguidos (ex.: permissão de Automação revogada pelo usuário), o circuit breaker daquele adaptador entra em fallback e aciona a leitura de título via `AXUIElement` + reforço imediato na camada `/etc/hosts` e `BrowserPolicyEnforcer`, mantendo as demais camadas operantes.
5. **Limites de Fronteira de Dados (`Payload Boundaries`):**
   - `validateBatchDomains` impõe teto estrito de `MAX_BATCH_DOMAINS = 100` domínios por lote (`RN-WEB-04`), filtrando duplicatas via `Set` e entradas vazias/nulas.

---

## 5. Segurança Defensiva Zero-Trust & Privacidade (LGPD)

- **Higienização de PII e Credenciais em URL (`sanitizeAndNormalizeUrl`):** Remove automaticamente `username`, `password`, `search` (query strings como `?session=...&token=...&cpf=...`) e `hash` antes de qualquer log, persistência ou envio ao Ajudante, cumprindo minimização de dados (LGPD).
- **Cabeçalhos de Blindagem no Servidor `:49152`:** Todas as respostas incluem `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` e Content-Security-Policy restrita a `'self'`.
- **Prevenção de Command Injection no Watcher:** O `macos-watcher.ts` nunca interpola URLs de abas dentro de strings de shell; utiliza `execFile` com array de argumentos fixos e passa a URL de redirecionamento (`http://127.0.0.1:49152/blocked`) como constante estática.
- **Zero Segredos Hardcoded:** Nenhum token ou segredo reside nos módulos de bloqueio web; variáveis sensíveis em scripts operacionais utilizam injeção em RAM via 1Password CLI (`op run --`).

---

## 6. Design UI/UX (Tela Local de Bloqueio `:49152/blocked`), WCAG 2.2 AAA & Motion

A Tela de Bloqueio servida pelo Módulo 01 (`docs/design/blocked-page.html` + `docs/design/tokens.css`) segue estritamente o **Design System CCAT**:

- **4 Temas Semânticos CCAT & Zero Roxo:**
  - Suporte nativo a `capycro` (**Capycro Warm Ivory** `#F6F4EE` + Teal `#005A64` + Terracotta `#C84B31`), `dark-tech` (`#0B0F17`), `light-fintech` (`#F8FAFC`) e `high-contrast` (`#000000` / `#FFFFFF` / `#FFD60A`). Proibição absoluta de tons roxos/violetas.
- **5 Estados de Interface Obrigatórios na Página `/blocked`:**
  1. `Loading / Skeleton`: Estado de carregamento enquanto inspeciona os parâmetros da regra acionada (`category`, `domain`, `keyword`) e consulta o status do daemon.
  2. `Empty State`: Exibido quando a página `/blocked` é acessada diretamente sem query params de violação, mostrando orientação educativa sobre a proteção ativa.
  3. `Error State (RFC 9457)`: Banner semântico (`role="alert"`, `aria-live="assertive"`) renderizando `title` e `detail` de respostas `application/problem+json` (ex.: falha ao submeter justificativa ou token inválido).
  4. `Partial / Degraded State`: Modo de contingência exibindo o `challengeCode` (`MB-XXXX`) para aprovação offline via Token `HMAC-SHA256` quando o Telegram está sem conexão, ou banner do Cooldown de 72h.
  5. `Populated / Active Block State`: Card principal exibindo domínio higienizado, badge da regra acionada (`Categoria: Conteúdo Adulto & Pornografia` ou `Palavra-chave combinada`), formulário de justificativa ao Ajudante e contadores em `font-variant-numeric: tabular-nums`.
- **Acessibilidade WCAG 2.2 AA/AAA & Contraste Perceptual APCA:**
  - Contraste textual `>= 7:1` (`APCA Lc >= 75`), botões e controles com área mínima de toque/clique `>= 44x44px` (`2.75rem`), `:focus-visible` explícito de `2px solid` com `outline-offset: 2px`, semântica HTML nativa (`<main>`, `<section>`, `<dialog>`) e permissão total de colar códigos (`onPaste` livre — WCAG 2.2 3.3.8).
- **Animação, Framerate Independence (`deltaTime`) & Acessibilidade Vestibular:**
  - Transições visuais utilizam exclusivamente propriedades de compositor GPU (`transform`, `opacity`) a `60fps`/`120fps` com curva `cubic-bezier(0.22, 1, 0.36, 1)`.
  - Sob `@media (prefers-reduced-motion: reduce)` e `prefers-reduced-transparency: reduce`, todas as animações e efeitos de desfoque são desativados instantaneamente (`transition-duration: 0.01ms !important`).
  - O cronômetro de expiração na tela calcula o tempo restante via diferença de timestamp real (`deltaTime` / `elapsed = Date.now() - startMs` / `performance.now()`), nunca acumulando deriva por frames perdidos.

---

## 7. Pre-Mortem & Modos de Falha (Blast Radius)

| Incidente Hipotético (Pre-Mortem 3h da Manhã) | Blast Radius | Causa Raiz | Mitigação Implementada |
| :--- | :--- | :--- | :--- |
| **1. Queda de energia durante atualização do `/etc/hosts`** | Sistema operacional sem resolução de nomes local | Escrita não-atômica truncando `/etc/hosts`. | Escrita em `/etc/hosts.monblock.tmp` + `fs.renameSync` atômico + backup `.monblock.bak` criado antes da primeira mutação. |
| **2. Regra de keyword `'login'` ou `'token'` bloqueia SSO corporativo** | Usuário impedido de autenticar no Google/Apple/Microsoft ou falar com Ajudante | Avaliação de palavras-chave antes da allowlist de infraestrutura. | `CRITICAL_INFRA_ALLOWLIST` avaliada no passo 1 de `evaluateUrlAndTitle` e filtrada em `applyAtomicHostsBlock`. |
| **3. Loop infinito de redirecionamento sobrecarregando o navegador** | Aba piscando continuamente em `127.0.0.1:49152/blocked` | URL da própria página de bloqueio contendo termo bloqueado na query string. | Guard explícito `if (cleanUrl.startsWith('http://127.0.0.1:49152/blocked')) return { blocked: false }` (`RN-WEB-02`). |
| **4. Usuário abre Firefox com DNS-over-HTTPS ativo para burlar `/etc/hosts`** | Bypass da Camada 1 de rede | Firefox usa resolver DoH próprio por padrão. | `buildBrowserPolicies` gera `DNSOverHTTPS: { Enabled: false, Locked: true }` e `WebsiteFilter` no `policies.json` do Firefox. |

---

## 8. Matriz de Alternativas Consideradas (Trade-offs)

| Alternativa | Descrição | Prós | Contras | Veredito |
| :--- | :--- | :--- | :--- | :---: |
| **Abordagem A (Lean Insegura)** | Bloqueio apenas via `/etc/hosts` puro. | Zero consumo de CPU em background. | Incapaz de filtrar palavras-chave em URLs/títulos (`RN-WEB-06`) e vulnerável a DoH em navegadores. | Rejeitada |
| **Abordagem B (Legado Cisdem)** | Apenas polling de AppleEvents (`NSAppleScript`) a cada 1s. | Não toca em arquivos de rede do SO. | Ignora completamente o Firefox, possui latência perceptível e morre com `kill -9`. | Rejeitada |
| **Abordagem C (Defesa em 3 Camadas — `ADR-0002`)** | `/etc/hosts` atômico + Enterprise Policies (`.plist`/`policies.json`) + Watcher Universal (`AppleEvents` + `AXUIElement`). | Latência `< 1ms` para domínios, cobertura de 100% dos navegadores (incluindo Firefox), trava de Modo Anônimo e filtro de keywords `AND`. | Exige sincronização coordenada dos 3 enforcers pelo daemon. | **Eleita** |

---

## 9. Reversibilidade & Plano de Rollback

1. **Rollback Atômico do `/etc/hosts`:**
   - A função `rollbackHostsFromBackup(hostsFilePath)` verifica a existência de `${hostsFilePath}.monblock.bak`, copia para `${hostsFilePath}.monblock.rollback.tmp` e executa `fs.renameSync(tmpPath, hostsFilePath)`, restaurando o arquivo original byte a byte em `< 5ms`.
2. **Rollback de Políticas Corporativas de Navegadores:**
   - Remoção controlada dos arquivos `/Library/Managed Preferences/com.google.Chrome.plist`, `com.brave.Browser.plist`, `com.microsoft.edgemac.plist` e `/Applications/Firefox.app/Contents/Resources/distribution/policies.json`, seguida de `killall cfprefsd`.
3. **Feature Flag de Contingência do Watcher:**
   - Caso uma atualização futura do macOS altere o dicionário AppleEvents de um navegador específico, a flag `MONBLOCK_WATCHER_SAFE_MODE=1` desativa apenas o adaptador de script daquele navegador mantendo `/etc/hosts` e `BrowserPolicies` 100% ativos.

---

## 10. Estratégia de Testabilidade & Pirâmide de Testes (AAA)

Todos os testes seguem estritamente o padrão **AAA (*Arrange, Act, Assert*)** via Vitest e Playwright:

1. **Testes Unitários (`tests/domain/rule-engine.test.ts`):**
   - *Arrange:* Estado com categoria `adult` ativa, `blockedDomains: ['custom-bad.org']`, `allowlistDomains: [' Liberado.Pornhub.com ']`, `keywords: ['cassino,online', 'proibido']`.
   - *Act:* Execução de `sanitizeAndNormalizeUrl`, `validateBatchDomains` (com 100 e 101 itens) e `evaluateUrlAndTitle`.
   - *Assert:* Verifica higienização de query strings, rejeição de lote `> 100`, proteção de `CRITICAL_INFRA_ALLOWLIST`, precedência `ALLOWLIST > BLOCKLIST`, e disparo exato de keywords simples e `AND`.
2. **Testes de Integração de Sistema de Arquivos (`tests/enforcers/enforcers.test.ts`):**
   - *Arrange:* Diretório temporário (`fs.mkdtempSync`) contendo arquivo `hosts` com entradas customizadas pré-existentes (`127.0.0.1 meu-projeto.local`).
   - *Act:* Chamada de `applyAtomicHostsBlock`, seguida de `rollbackHostsFromBackup` e `buildBrowserPolicies`.
   - *Assert:* Verifica preservação de `meu-projeto.local`, criação de `.monblock.bak`, ausência de domínios críticos (`api.telegram.org`) na lista bloqueada, restauração idêntica no rollback e estrutura exata de `chromiumPolicy` e `firefoxPolicy`.
3. **Testes de Integração HTTP & E2E Visual (`tests/server/block-server.test.ts`):**
   - *Arrange:* Instanciação de `createMonBlockHttpServer()` em porta efêmera local.
   - *Act:* Requisições `GET /blocked`, `GET /api/health`, `POST /api/unblock-requests` (com mesmo `Idempotency-Key` e com JSON malformado) e `GET /rota-inexistente`.
   - *Assert:* Verifica status `200`, `202` (`deduplicated: true`), `400` e `404` com cabeçalho `application/problem+json` (`RFC 9457 Problem Details`) e conformidade WCAG 2.2 AAA nos 4 temas CCAT.
