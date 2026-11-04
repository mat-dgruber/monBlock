# monBlock Phase 1 MVP Implementation Plan

- **Data:** 2026-11-04
- **Governança de Artefatos Canônicos (`docs/ai/`):** Spec (`docs/ai/specs/2026-11-04-monblock-mvp-design.md`), Plano (`docs/ai/plans/2026-11-04-monblock-mvp-plan.md`), Relatórios (`docs/ai/reports/`), Arquitetura (`docs/architecture/ARCHITECTURE_SPEC.md`) e Design (`docs/design/design.md`).

## 1. Problema, Objetivo, Visão do Produto & Escopo Core

O acesso irrestrito a conteúdo nocivo e apostas causa danos pessoais, e bloqueadores userland tradicionais sofrem bypass trivial via `kill -9`, ausência de proteção no kernel/rede quando fechados e falha no Firefox (`_reversa_sdd/web-block-engine/design.md:49`). O objetivo deste plano é construir o MVP Fase 1 do `monBlock` (macOS first, multi-OS ready via `PlatformEnforcer`) com bloqueio persistente de sites e palavras-chave em todos os navegadores, Catraca Unidirecional (`Append-Only`), fluxo de aprovação pelo Ajudante (Telegram Bot + Token HMAC/Senha Argon2id + Raio-X com Blur) e interface CCAT acessível (WCAG 2.2 AAA). Fora de escopo na Fase 1 (Non-Goals): bloqueio de binários desktop (`AppLockEngine` — Fase 2) e painel SaaS multi-tenant (Fase 3).

**Architecture:** Arquitetura Split Privilegiada em 3 camadas: (1) Core de Domínio e Daemon privilegiado (`monblockd`) gerenciando SQLite (`0600`) com tripla persistência do vínculo do Ajudante, (2) Adaptadores `PlatformEnforcer` aplicando bloqueio em `/etc/hosts` (`chflags uchg` + escrita atômica `.bak`), Enterprise Browser Policies (`.plist` / `policies.json`) e Watcher Universal (AppleEvents + `AXUIElement`), e (3) Servidor Local (`127.0.0.1:49152`) + App Electron com Design System CCAT.

**Tech Stack:** TypeScript 5.x, Node.js 22+, Electron, SQLite (`node:sqlite` / `better-sqlite3`), `node:crypto` (`scrypt`/`Argon2id` + `HMAC-SHA256` + `timingSafeEqual`), Vitest, Playwright.

## Global Constraints, Resiliência, Segurança, UI/UX (5 Estados, WCAG 2.2 AAA / APCA) & Motion

- **Custo de Infraestrutura no MVP:** `R$ 0,00` (API pública do Bot do Telegram via HTTPS + Card HTML offline).
- **Latência & Performance:** `< 1ms` em `/etc/hosts`, `p95 < 400ms` para interceptação de abas/palavras-chave, `p95 < 3.000ms` para captura offscreen com Blur, `< 50MB RAM` e `< 1% CPU` no `monblockd`.
- **Limites de Dados:** Adição em lote de até `100 domínios` por operação (`RN-WEB-04`), suporte a `100.000+ domínios` em `/etc/hosts` e truncamento de DOM em `64KB`.
- **Invariante da Catraca (`Append-Only`):** Adicionar bloqueio/categoria ou ativar a flag "Bloquear Modo Anônimo" é livre para o usuário; remover regra, desativar categoria ou destravar Modo Anônimo exige `PartnerAuthorizationToken` válido.
- **Allowlist Crítica Anti-Lockout:** `localhost`, `127.0.0.1`, `api.telegram.org`, `accounts.google.com`, `appleid.apple.com`, `login.microsoftonline.com` nunca podem ser bloqueados.
- **Matriz de Alternativas & Trade-offs (Lean vs. Split Privilegiado):**
  - *Opção A (Apenas Userland Electron — Rejeitada):* Sofre bypass trivial via `kill -9` ou fechamento da janela, como evidenciado no Cisdem AppCrypt (`ADR-0001`).
  - *Opção B (Extensão de Navegador Isolada — Rejeitada):* Pode ser removida ou desabilitada em perfis secundários.
  - *Opção C Selecionada (Defesa Híbrida em 3 Camadas: `/etc/hosts` + Enterprise Policies + Watcher Universal):* Combina menor código em TypeScript com persistência real no kernel/SO e cobertura do Firefox (`ADR-0002`).
- **Pre-Mortem, Modos de Falha, Blast Radius & Resiliência Defensiva:**
  - *Modo de Falha 1 (Corrupção do `/etc/hosts` em crash de energia):* Mitigado por backup prévio `/etc/hosts.monblock.bak`, escrita exclusiva entre delimitadores `# >>> MONBLOCK START >>>` e `# <<< MONBLOCK END <<<` em arquivo `.tmp` e `fs.renameSync` atômico com rollback imediato (`rollbackHostsFromBackup`).
  - *Modo de Falha 2 (Indisponibilidade da API do Telegram ou Timeout de Rede):* Timeout estrito de `3.000ms`, Retry com Exponential Backoff + Full Jitter, Circuit Breaker (abre após 5 falhas consecutivas por 30s) e fallback gracioso para o Card HTML + Challenge Code `HMAC-SHA256` offline.
  - *Modo de Falha 3 (Double-Submit / Concorrência em Pedidos de Desbloqueio):* Mitigado com `Idempotency-Key` (`hash(domain + minute_bucket)`), `debounce` de 500ms na UI e proteção anti-replay (`usedTokens` + `crypto.timingSafeEqual`).
  - *Modo de Falha 4 (Perda de Senha ou Vínculo do Ajudante):* Tripla persistência redundante (`monblock.db` `0600` + `System.keychain` + `/var/db/monblock/partner.seal` `uchg`) e recuperação em 3 níveis (`/reset_senha` no Telegram, 5 códigos de uso único no Kit de Emergência e Cooldown Time-Lock de 72h com bloqueio 100% ativo durante a espera).
- **Estados Completos de UI (5 Estados Obrigatórios) & Acessibilidade WCAG 2.2 AAA / APCA (`Lc >= 75`):**
  - **5 Estados Visuais Obrigatórios:** `Idle`, `Loading (Skeleton Shimmer sem CLS)`, `Empty State` (acionável), `Error State` (RFC 9457 `application/problem+json` amigável com botão de Retry) e `Partial/Success State`.
  - **Conformidade WCAG 2.2 AAA & APCA:** Branding Oficial CCAT (`docs/design/tokens.css`, 4 temas: `Capycro Wellness`, `Escuro Tech`, `Claro Fintech`, `Alto Contraste WCAG AAA`, zero roxo / Purple Ban, contraste APCA `Lc >= 75`), `2.4.11 Focus Not Obscured` (`scroll-padding-top: 5rem` + `:focus-visible`), `2.5.7 Dragging Movements` (todos os botões/toggles operáveis por clique simples e teclado) e `3.3.8 Accessible Authentication` (`onPaste` habilitado para colar Token HMAC ou Senha Mestra do 1Password).
- **Animação, Motion, DeltaTime & GPU Compositor:**
  - Respeito estrito a `@media (prefers-reduced-motion: reduce)` e `@media (prefers-reduced-transparency: reduce)`.
  - Animações restritas exclusivamente ao compositor GPU (`transform` e `opacity`, sem layout thrashing).
  - Cronômetros regressivos (`tabular-nums`) e loops de UI baseados em tempo real decorrido (`deltaTime` via `performance.now()` / `requestAnimationFrame`), independentes da taxa de atualização do monitor (60Hz/120Hz).

---

### Task 1: Bootstrap do Projeto, Catálogo das 11 Categorias e Motor de Regras (`RuleEngine`)

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/domain/categories.ts`
- Create: `src/domain/rule-engine.ts`
- Test: `tests/domain/rule-engine.test.ts`

**Interfaces:**
- Consumes: Nenhuma (módulo base de domínio puro).
- Produces:
  - `PREDEFINED_CATEGORIES: ReadonlyArray<CategoryDefinition>` (11 categorias com `adult` ativa e trancada por padrão)
  - `CRITICAL_INFRA_ALLOWLIST: ReadonlySet<string>`
  - `sanitizeAndNormalizeUrl(rawInput: string): { domain: string; cleanUrl: string } | null`
  - `evaluateUrlAndTitle(input: { url: string; title: string; state: RuleEngineState }): BlockDecision`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/domain/rule-engine.test.ts
import { describe, it, expect } from 'vitest';
import {
  PREDEFINED_CATEGORIES,
  sanitizeAndNormalizeUrl,
  evaluateUrlAndTitle,
  type RuleEngineState,
} from '../../src/domain/rule-engine.js';

describe('RuleEngine & Categories (RN-WEB-01..06)', () => {
  it('inclui 11 categorias pré-cadastradas com Conteúdo Adulto ativo por padrão', () => {
    expect(PREDEFINED_CATEGORIES).toHaveLength(11);
    const adult = PREDEFINED_CATEGORIES.find((c) => c.id === 'adult');
    expect(adult?.enabledByDefault).toBe(true);
  });

  it('higieniza URLs removendo query strings sensíveis e normalizando www.', () => {
    const res = sanitizeAndNormalizeUrl('HTTPS://www.Bet365.com/home?token=secret123#top');
    expect(res).toEqual({
      domain: 'bet365.com',
      cleanUrl: 'https://bet365.com/home',
    });
  });

  it('nunca bloqueia domínios da allowlist crítica (anti-lockout)', () => {
    const state: RuleEngineState = {
      enabledCategories: ['adult', 'gambling'],
      blockedDomains: ['api.telegram.org', 'localhost'],
      allowlistDomains: [],
      keywords: ['telegram', 'login'],
      lockIncognito: false,
    };
    const decision = evaluateUrlAndTitle({
      url: 'https://api.telegram.org/bot123/sendMessage',
      title: 'Telegram Login',
      state,
    });
    expect(decision.blocked).toBe(false);
  });

  it('respeita precedência Allowlist > Blocklist e palavras-chave combinadas por vírgula (AND)', () => {
    const state: RuleEngineState = {
      enabledCategories: ['adult'],
      blockedDomains: ['example-casino.com'],
      allowlistDomains: [' safe.example-casino.com '],
      keywords: ['apostas,bonus'],
      lockIncognito: false,
    };

    expect(
      evaluateUrlAndTitle({
        url: 'https://safe.example-casino.com/docs',
        title: 'Documentação',
        state,
      }).blocked
    ).toBe(false);

    const kwMatch = evaluateUrlAndTitle({
      url: 'https://portal-esporte.com/artigo',
      title: 'Melhores apostas com bonus hoje',
      state,
    });
    expect(kwMatch).toEqual({
      blocked: true,
      reason: 'KEYWORD',
      ruleLabel: 'Palavra-chave combinada: apostas,bonus',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/rule-engine.test.ts`
Expected: FAIL with module not found `../../src/domain/rule-engine.js`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/domain/categories.ts
export interface CategoryDefinition {
  id: string;
  namePt: string;
  enabledByDefault: boolean;
  domains: string[];
  keywords: string[];
}

export const PREDEFINED_CATEGORIES: ReadonlyArray<CategoryDefinition> = [
  {
    id: 'adult',
    namePt: 'Conteúdo Adulto & Pornografia',
    enabledByDefault: true,
    domains: ['pornhub.com', 'xvideos.com', 'xnxx.com', 'onlyfans.com', 'redtube.com'],
    keywords: ['porn', 'xxx', 'nsfw', 'hentai'],
  },
  {
    id: 'gambling',
    namePt: 'Apostas & Cassinos (Bets)',
    enabledByDefault: false,
    domains: ['bet365.com', 'blaze.com', 'stake.com', 'betano.com', 'sportingbet.com'],
    keywords: ['cassino,online', 'roleta,aposta', 'slot,bonus'],
  },
  {
    id: 'games',
    namePt: 'Jogos Online',
    enabledByDefault: false,
    domains: ['roblox.com', 'poki.com', 'twitch.tv'],
    keywords: ['jogos,online,gratis'],
  },
  {
    id: 'proxy',
    namePt: 'Proxies, VPNs & Bypass',
    enabledByDefault: false,
    domains: ['hidemyass.com', 'croxyproxy.com', 'kproxy.com'],
    keywords: ['web,proxy,unblock'],
  },
  {
    id: 'dating',
    namePt: 'Sites de Relacionamento',
    enabledByDefault: false,
    domains: ['tinder.com', 'badoo.com', 'bumble.com'],
    keywords: ['encontros,casuais'],
  },
  {
    id: 'social',
    namePt: 'Redes Sociais',
    enabledByDefault: false,
    domains: ['instagram.com', 'tiktok.com', 'x.com', 'facebook.com'],
    keywords: [],
  },
  {
    id: 'video',
    namePt: 'Streaming & Vídeos',
    enabledByDefault: false,
    domains: ['netflix.com', 'primevideo.com'],
    keywords: [],
  },
  {
    id: 'forums',
    namePt: 'Fóruns & Comunidades Mistas',
    enabledByDefault: false,
    domains: ['reddit.com', '4chan.org', '9gag.com'],
    keywords: [],
  },
  {
    id: 'shopping',
    namePt: 'Compras por Impulso',
    enabledByDefault: false,
    domains: ['shopee.com.br', 'aliexpress.com', 'shein.com'],
    keywords: [],
  },
  {
    id: 'news',
    namePt: 'Notícias & Portais',
    enabledByDefault: false,
    domains: ['tmz.com', 'buzzfeed.com'],
    keywords: [],
  },
  {
    id: 'search_unsafe',
    namePt: 'Buscadores sem SafeSearch',
    enabledByDefault: false,
    domains: ['yandex.com', 'duckduckgo.com'],
    keywords: [],
  },
];
```

```typescript
// src/domain/rule-engine.ts
import { PREDEFINED_CATEGORIES, type CategoryDefinition } from './categories.js';

export { PREDEFINED_CATEGORIES, type CategoryDefinition };

export const CRITICAL_INFRA_ALLOWLIST: ReadonlySet<string> = new Set([
  'localhost',
  '127.0.0.1',
  'api.telegram.org',
  'accounts.google.com',
  'appleid.apple.com',
  'login.microsoftonline.com',
]);

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

export function sanitizeAndNormalizeUrl(rawInput: string): { domain: string; cleanUrl: string } | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProto);
    const domain = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (!domain || !domain.includes('.') && domain !== 'localhost' && domain !== '127.0.0.1') {
      return null;
    }
    const cleanUrl = `${parsed.protocol}//${domain}${parsed.pathname === '/' ? '' : parsed.pathname}`;
    return { domain, cleanUrl };
  } catch {
    return null;
  }
}

function matchesDomain(host: string, ruleDomain: string): boolean {
  const cleanRule = ruleDomain.trim().toLowerCase().replace(/^www\./, '');
  return host === cleanRule || host.endsWith(`.${cleanRule}`);
}

export function evaluateUrlAndTitle(input: {
  url: string;
  title: string;
  state: RuleEngineState;
}): BlockDecision {
  const normalized = sanitizeAndNormalizeUrl(input.url);
  if (!normalized) return { blocked: false };

  const { domain, cleanUrl } = normalized;
  if (CRITICAL_INFRA_ALLOWLIST.has(domain)) {
    return { blocked: false };
  }
  if (cleanUrl.startsWith('http://127.0.0.1:49152/blocked')) {
    return { blocked: false };
  }

  // RN-WEB-01: Precedência máxima da Allowlist (whiteWebsites)
  for (const allowed of input.state.allowlistDomains) {
    if (matchesDomain(domain, allowed)) {
      return { blocked: false };
    }
  }

  // Categorias ativas
  for (const catId of input.state.enabledCategories) {
    const cat = PREDEFINED_CATEGORIES.find((c) => c.id === catId);
    if (!cat) continue;
    if (cat.domains.some((d) => matchesDomain(domain, d))) {
      return {
        blocked: true,
        reason: 'CATEGORY',
        ruleLabel: `Categoria: ${cat.namePt}`,
      };
    }
  }

  // Domínios customizados (blackWebsites)
  for (const blocked of input.state.blockedDomains) {
    if (matchesDomain(domain, blocked)) {
      return {
        blocked: true,
        reason: 'CUSTOM_DOMAIN',
        ruleLabel: `Domínio bloqueado: ${blocked.trim().toLowerCase()}`,
      };
    }
  }

  // Palavras-chave simples e combinadas por vírgula (AND — RN-WEB-06)
  const haystack = `${cleanUrl} ${input.title}`.toLowerCase();
  const activeCategoryKeywords = input.state.enabledCategories.flatMap(
    (id) => PREDEFINED_CATEGORIES.find((c) => c.id === id)?.keywords ?? []
  );
  const allKeywords = [...activeCategoryKeywords, ...input.state.keywords];

  for (const rawKw of allKeywords) {
    const terms = rawKw
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    if (terms.length > 0 && terms.every((term) => haystack.includes(term))) {
      return {
        blocked: true,
        reason: 'KEYWORD',
        ruleLabel:
          terms.length > 1
            ? `Palavra-chave combinada: ${terms.join(',')}`
            : `Palavra-chave: ${terms[0]}`,
      };
    }
  }

  return { blocked: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/rule-engine.test.ts`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json src/domain/categories.ts src/domain/rule-engine.ts tests/domain/rule-engine.test.ts
git commit -m "feat(domain): implementar catálogo de 11 categorias e RuleEngine com precedência e palavras-chave AND"
```

---

### Task 2: Guardião Criptográfico do Ajudante, Catraca Unidirecional e Recuperação em 3 Níveis (`PartnerGuard`)

**Files:**
- Create: `src/domain/partner-guard.ts`
- Test: `tests/domain/partner-guard.test.ts`

**Interfaces:**
- Consumes: `RuleEngineState` de `src/domain/rule-engine.ts`
- Produces:
  - `hashPartnerPassword(password: string): string`
  - `verifyPartnerPassword(password: string, storedHash: string): boolean`
  - `generateChallengeToken(secret: string, challengeCode: string, duration: '15m' | '60m' | 'permanent'): string`
  - `verifyChallengeToken(params: { secret: string; challengeCode: string; token: string; usedTokens: Set<string> }): { valid: boolean; duration?: '15m' | '60m' | 'permanent' }`
  - `generateRecoveryKit(): { plainCodes: string[]; hashedCodes: string[] }`
  - `evaluateEmergencyCooldown(startedAtIso: string, nowMs: number): { unlocked: boolean; remainingHours: number }`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/domain/partner-guard.test.ts
import { describe, it, expect } from 'vitest';
import {
  hashPartnerPassword,
  verifyPartnerPassword,
  generateChallengeToken,
  verifyChallengeToken,
  generateRecoveryKit,
  evaluateEmergencyCooldown,
} from '../../src/domain/partner-guard.js';

describe('PartnerGuard Crypto, Replay Protection & 72h Cooldown', () => {
  it('valida senha do Ajudante com derivação lenta e timingSafeEqual', () => {
    const hash = hashPartnerPassword('SenhaForteDoAjudante#2026');
    expect(verifyPartnerPassword('SenhaForteDoAjudante#2026', hash)).toBe(true);
    expect(verifyPartnerPassword('SenhaErrada', hash)).toBe(false);
  });

  it('gera e valida token HMAC de desafio-resposta e bloqueia replay (RN-LIM-02)', () => {
    const secret = 'super-secret-256-bit-key';
    const challenge = 'MB-8492-X7';
    const used = new Set<string>();

    const token = generateChallengeToken(secret, challenge, '15m');
    const firstTry = verifyChallengeToken({ secret, challengeCode: challenge, token, usedTokens: used });
    expect(firstTry).toEqual({ valid: true, duration: '15m' });

    // Segunda tentativa com o mesmo token deve ser rejeitada (anti-replay)
    const replayTry = verifyChallengeToken({ secret, challengeCode: challenge, token, usedTokens: used });
    expect(replayTry.valid).toBe(false);
  });

  it('gera kit de emergência com 5 códigos únicos e mantém bloqueio ativo nas 72h de cooldown', () => {
    const kit = generateRecoveryKit();
    expect(kit.plainCodes).toHaveLength(5);
    expect(kit.hashedCodes).toHaveLength(5);

    const start = '2026-11-04T00:00:00.000Z';
    const after12h = Date.parse(start) + 12 * 3600 * 1000;
    const after73h = Date.parse(start) + 73 * 3600 * 1000;

    expect(evaluateEmergencyCooldown(start, after12h)).toEqual({
      unlocked: false,
      remainingHours: 60,
    });
    expect(evaluateEmergencyCooldown(start, after73h)).toEqual({
      unlocked: true,
      remainingHours: 0,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/partner-guard.test.ts`
Expected: FAIL with module not found `../../src/domain/partner-guard.js`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/domain/partner-guard.ts
import crypto from 'node:crypto';

const DURATIONS = ['15m', '60m', 'permanent'] as const;
export type UnlockDuration = (typeof DURATIONS)[number];

export function hashPartnerPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPartnerPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, expectedHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function generateChallengeToken(
  secret: string,
  challengeCode: string,
  duration: UnlockDuration
): string {
  const mac = crypto
    .createHmac('sha256', secret)
    .update(`${challengeCode}:${duration}`)
    .digest('hex')
    .slice(0, 10)
    .toUpperCase();
  return `UNLOCK-${duration.toUpperCase()}-${mac}`;
}

export function verifyChallengeToken(params: {
  secret: string;
  challengeCode: string;
  token: string;
  usedTokens: Set<string>;
}): { valid: boolean; duration?: UnlockDuration } {
  const cleanToken = params.token.trim().toUpperCase();
  if (params.usedTokens.has(cleanToken)) {
    return { valid: false };
  }

  for (const duration of DURATIONS) {
    const expected = generateChallengeToken(params.secret, params.challengeCode, duration);
    const a = Buffer.from(cleanToken);
    const b = Buffer.from(expected);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      params.usedTokens.add(cleanToken);
      return { valid: true, duration };
    }
  }
  return { valid: false };
}

export function generateRecoveryKit(): { plainCodes: string[]; hashedCodes: string[] } {
  const plainCodes: string[] = [];
  const hashedCodes: string[] = [];
  for (let i = 0; i < 5; i++) {
    const raw = `REC-${crypto.randomBytes(3).toString('hex').toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    plainCodes.push(raw);
    hashedCodes.push(hashPartnerPassword(raw));
  }
  return { plainCodes, hashedCodes };
}

export function evaluateEmergencyCooldown(
  startedAtIso: string,
  nowMs: number
): { unlocked: boolean; remainingHours: number } {
  const startMs = Date.parse(startedAtIso);
  const cooldownMs = 72 * 3600 * 1000;
  const elapsed = Math.max(0, nowMs - startMs);
  if (elapsed >= cooldownMs) {
    return { unlocked: true, remainingHours: 0 };
  }
  const remainingHours = Math.ceil((cooldownMs - elapsed) / (3600 * 1000));
  return { unlocked: false, remainingHours };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/partner-guard.test.ts`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add src/domain/partner-guard.ts tests/domain/partner-guard.test.ts
git commit -m "feat(auth): implementar PartnerGuard com derivação lenta, HMAC anti-replay e cooldown de 72h"
```

---

### Task 3: Adaptadores Multi-Browser & Escrita Atômica de `/etc/hosts` (`PlatformEnforcer`)

**Files:**
- Create: `src/enforcers/hosts-enforcer.ts`
- Create: `src/enforcers/browser-policy-enforcer.ts`
- Test: `tests/enforcers/platform-enforcer.test.ts`

**Interfaces:**
- Consumes: `CRITICAL_INFRA_ALLOWLIST` de `src/domain/rule-engine.ts`
- Produces:
  - `applyAtomicHostsBlock(hostsFilePath: string, blockedDomains: string[]): { backupPath: string; writtenCount: number }`
  - `rollbackHostsFromBackup(hostsFilePath: string): boolean`
  - `buildBrowserPolicies(params: { blockedDomains: string[]; allowlistDomains: string[]; lockIncognito: boolean }): { chromiumPolicy: Record<string, unknown>; firefoxPolicy: Record<string, unknown> }`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/enforcers/platform-enforcer.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  applyAtomicHostsBlock,
  rollbackHostsFromBackup,
} from '../../src/enforcers/hosts-enforcer.js';
import { buildBrowserPolicies } from '../../src/enforcers/browser-policy-enforcer.js';

describe('PlatformEnforcer: Atomic /etc/hosts & Multi-Browser Policies', () => {
  it('preserva entradas originais do /etc/hosts, cria .bak e faz rollback limpo', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'monblock-hosts-'));
    const hostsPath = path.join(tmpDir, 'hosts');
    const originalContent = '127.0.0.1 localhost\n::1 localhost\n';
    fs.writeFileSync(hostsPath, originalContent, 'utf8');

    const res = applyAtomicHostsBlock(hostsPath, ['bet365.com', 'localhost']);
    expect(res.writtenCount).toBe(1); // localhost ignorado pela allowlist crítica

    const updated = fs.readFileSync(hostsPath, 'utf8');
    expect(updated).toContain('127.0.0.1 localhost');
    expect(updated).toContain('0.0.0.0 bet365.com');
    expect(updated).toContain('0.0.0.0 www.bet365.com');

    expect(rollbackHostsFromBackup(hostsPath)).toBe(true);
    expect(fs.readFileSync(hostsPath, 'utf8')).toBe(originalContent);
  });

  it('gera políticas para Chromium/Brave/Edge/Arc e Firefox respeitando a flag de Modo Anônimo', () => {
    const unlocked = buildBrowserPolicies({
      blockedDomains: ['bet365.com'],
      allowlistDomains: ['docs.bet365.com'],
      lockIncognito: false,
    });
    expect(unlocked.chromiumPolicy.DnsOverHttpsMode).toBe('off');
    expect(unlocked.chromiumPolicy.IncognitoModeAvailability).toBe(0);
    expect((unlocked.firefoxPolicy as any).policies.DisablePrivateBrowsing).toBe(false);

    const locked = buildBrowserPolicies({
      blockedDomains: ['bet365.com'],
      allowlistDomains: [],
      lockIncognito: true,
    });
    expect(locked.chromiumPolicy.IncognitoModeAvailability).toBe(1);
    expect((locked.firefoxPolicy as any).policies.DisablePrivateBrowsing).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/enforcers/platform-enforcer.test.ts`
Expected: FAIL with module not found `../../src/enforcers/hosts-enforcer.js`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/enforcers/hosts-enforcer.ts
import fs from 'node:fs';
import { CRITICAL_INFRA_ALLOWLIST } from '../domain/rule-engine.js';

const START_MARKER = '# >>> MONBLOCK START >>>';
const END_MARKER = '# <<< MONBLOCK END <<<';

export function applyAtomicHostsBlock(
  hostsFilePath: string,
  blockedDomains: string[]
): { backupPath: string; writtenCount: number } {
  const backupPath = `${hostsFilePath}.monblock.bak`;
  const tmpPath = `${hostsFilePath}.monblock.tmp`;
  const current = fs.existsSync(hostsFilePath) ? fs.readFileSync(hostsFilePath, 'utf8') : '';

  if (!fs.existsSync(backupPath)) {
    fs.writeFileSync(backupPath, current, 'utf8');
  }

  const baseContent = current
    .replace(new RegExp(`${START_MARKER}[\\s\\S]*?${END_MARKER}\\n?`, 'g'), '')
    .trimEnd();

  const safeDomains = Array.from(
    new Set(
      blockedDomains
        .map((d) => d.trim().toLowerCase().replace(/^www\./, ''))
        .filter((d) => d && !CRITICAL_INFRA_ALLOWLIST.has(d))
    )
  );

  const lines: string[] = [START_MARKER];
  for (const domain of safeDomains) {
    lines.push(`0.0.0.0 ${domain}`);
    lines.push(`0.0.0.0 www.${domain}`);
  }
  lines.push(END_MARKER);

  const nextContent = `${baseContent}\n\n${lines.join('\n')}\n`;
  fs.writeFileSync(tmpPath, nextContent, 'utf8');
  fs.renameSync(tmpPath, hostsFilePath);

  return { backupPath, writtenCount: safeDomains.length };
}

export function rollbackHostsFromBackup(hostsFilePath: string): boolean {
  const backupPath = `${hostsFilePath}.monblock.bak`;
  if (!fs.existsSync(backupPath)) return false;
  const tmpPath = `${hostsFilePath}.monblock.rollback.tmp`;
  fs.copyFileSync(backupPath, tmpPath);
  fs.renameSync(tmpPath, hostsFilePath);
  return true;
}
```

```typescript
// src/enforcers/browser-policy-enforcer.ts
export function buildBrowserPolicies(params: {
  blockedDomains: string[];
  allowlistDomains: string[];
  lockIncognito: boolean;
}): {
  chromiumPolicy: Record<string, unknown>;
  firefoxPolicy: Record<string, unknown>;
} {
  const chromiumPolicy: Record<string, unknown> = {
    URLBlocklist: params.blockedDomains,
    URLAllowlist: params.allowlistDomains,
    DnsOverHttpsMode: 'off',
    IncognitoModeAvailability: params.lockIncognito ? 1 : 0,
  };

  const firefoxPolicy: Record<string, unknown> = {
    policies: {
      WebsiteFilter: {
        Block: params.blockedDomains.map((d) => `*://*.${d}/*`),
        Exceptions: params.allowlistDomains.map((d) => `*://*.${d}/*`),
      },
      DNSOverHTTPS: {
        Enabled: false,
        Locked: true,
      },
      DisablePrivateBrowsing: params.lockIncognito,
    },
  };

  return { chromiumPolicy, firefoxPolicy };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/enforcers/platform-enforcer.test.ts`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add src/enforcers/hosts-enforcer.ts src/enforcers/browser-policy-enforcer.ts tests/enforcers/platform-enforcer.test.ts
git commit -m "feat(enforcers): implementar escrita atômica de /etc/hosts com rollback e policies multi-navegador"
```

---

### Task 4: Servidor Local de Bloqueio (`127.0.0.1:49152`), Idempotência e Contrato `RFC 9457`

**Files:**
- Modify: `scripts/test-block-server.mjs`
- Test: `tests/server/block-server.test.ts`

**Interfaces:**
- Consumes: `docs/design/blocked-page.html`, `docs/design/tokens.css`, `docs/design/tokens-showcase.html`
- Produces:
  - Rotas HTTP em `127.0.0.1:49152`: `GET /blocked`, `GET /showcase`, `GET /tokens.css`, `GET /api/health`, `POST /api/unblock-requests` (com `Idempotency-Key` e resposta `RFC 9457 Problem Details` em erros).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/server/block-server.test.ts
import { describe, it, expect } from 'vitest';
import { createMonBlockHttpServer } from '../../scripts/test-block-server.mjs';

describe('Local Block Server & RFC 9457 Problem Details', () => {
  it('serve /blocked com headers de segurança e retorna application/problem+json em 404', async () => {
    const server = createMonBlockHttpServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 49152;

    try {
      const blockedRes = await fetch(`http://127.0.0.1:${port}/blocked?url=https://bet365.com`);
      expect(blockedRes.status).toBe(200);
      expect(blockedRes.headers.get('x-frame-options')).toBe('DENY');
      const html = await blockedRes.text();
      expect(html).toContain('Por que esta página foi pausada?');

      const notFoundRes = await fetch(`http://127.0.0.1:${port}/rota-inexistente`);
      expect(notFoundRes.status).toBe(404);
      expect(notFoundRes.headers.get('content-type')).toContain('application/problem+json');
      const problem = await notFoundRes.json();
      expect(problem.status).toBe(404);
      expect(problem.title).toBe('Rota não encontrada');
    } finally {
      server.close();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/block-server.test.ts`
Expected: FAIL (`createMonBlockHttpServer` not exported)

- [ ] **Step 3: Write minimal implementation**

Export `createMonBlockHttpServer()` in `scripts/test-block-server.mjs` and guard `server.listen(PORT)` when imported by tests (`import.meta.url === \`file://\${process.argv[1]}\``).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/server/block-server.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/test-block-server.mjs tests/server/block-server.test.ts
git commit -m "feat(server): exportar createMonBlockHttpServer com suporte a RFC 9457 e testes de integração"
```
