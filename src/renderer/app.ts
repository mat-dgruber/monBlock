/**
 * Controlador de Estado do Renderer Desktop CCAT (MOD-04 — `src/renderer/app.ts`).
 *
 * Responsável por:
 * - Validar lotes de até 100 domínios (`MAX_BATCH_DOMAINS`) e reportar infra crítica ignorada (`INV-UI-INFRA-02`)
 * - Calcular o cronômetro regressivo de 72h por `deltaTime` real (`RN-UI-04`)
 * - Gerenciar a transição entre os 5 estados de UI (`loading`, `empty`, `error`, `partial`, `active`)
 * - Impor a Catraca Unidirecional `Append-Only` (`INV-UI-RATCHET-01`) integrando com `canMutateProtectionRule`
 */

import { canMutateProtectionRule, evaluateEmergencyCooldown } from '../domain/partner-guard.js';
import {
  CRITICAL_INFRA_ALLOWLIST,
  MAX_BATCH_DOMAINS,
  PREDEFINED_CATEGORIES,
  sanitizeAndNormalizeUrl,
  validateBatchDomains,
  type RuleEngineState,
} from '../domain/rule-engine.js';

// MARK: - Tipos de UI e Problem Details (RFC 9457)

export type CcatThemeId = 'capycro-ivory' | 'dark-tech' | 'light-fintech' | 'high-contrast-aaa';
export type UiVisualState = 'loading' | 'empty' | 'error' | 'partial' | 'active';
export type DashboardViewId = 'onboarding' | 'categories' | 'rules' | 'partner';

export interface ProblemDetailsRfc9457 {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
}

export interface UiControllerState {
  theme: CcatThemeId;
  uiState: UiVisualState;
  currentView: DashboardViewId;
  onboardingStep: 1 | 2 | 3 | 4;
  partnerName: string | null;
  challengeCode: string;
  cooldownStartedAtMs: number | null;
  ruleState: RuleEngineState;
  lastProblem: ProblemDetailsRfc9457 | null;
}

// MARK: - Fábrica de Estado Inicial

/**
 * Cria o estado inicial do controlador da UI com `adult` ativa e trancada por padrão (`ADR-0003`).
 */
export function createInitialUiControllerState(): UiControllerState {
  const defaultEnabled = PREDEFINED_CATEGORIES.filter((c) => c.enabledByDefault).map((c) => c.id);
  return {
    theme: 'capycro-ivory',
    uiState: 'active',
    currentView: 'categories',
    onboardingStep: 1,
    partnerName: 'Ajudante Pareado',
    challengeCode: 'MB-8492-X7',
    cooldownStartedAtMs: null,
    ruleState: {
      enabledCategories: defaultEnabled,
      blockedDomains: [],
      allowlistDomains: [],
      keywords: [],
      lockIncognito: true,
    },
    lastProblem: null,
  };
}

// MARK: - Validação de Lote de Domínios (<= 100) e Infra Crítica

/**
 * Faz o parse de um texto em lote (separado por quebras de linha, vírgulas ou espaços),
 * contabiliza domínios de infraestrutura crítica ignorados (`INV-UI-INFRA-02`) e retorna
 * erro estruturado em `RFC 9457 Problem Details` se exceder `MAX_BATCH_DOMAINS = 100`.
 */
export function parseAndValidateBatchInput(rawText: string): {
  ok: boolean;
  domains: string[];
  ignoredInfraCount: number;
  problem?: ProblemDetailsRfc9457;
} {
  const entries = rawText
    .split(/[\r\n,\s]+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (entries.length > MAX_BATCH_DOMAINS) {
    return {
      ok: false,
      domains: [],
      ignoredInfraCount: 0,
      problem: {
        type: 'https://monblock.ccat.local/problems/400',
        title: 'Limite de lote excedido',
        status: 400,
        detail: `Limite máximo de ${MAX_BATCH_DOMAINS} domínios por lote excedido (RN-WEB-04). Foram enviados ${entries.length} itens.`,
        instance: '/ipc/rules/batch-domains',
      },
    };
  }

  let ignoredInfraCount = 0;
  for (const item of entries) {
    const normalized = sanitizeAndNormalizeUrl(item);
    if (normalized && CRITICAL_INFRA_ALLOWLIST.has(normalized.domain)) {
      ignoredInfraCount += 1;
    }
  }

  const validation = validateBatchDomains(entries);
  if (!validation.valid) {
    return {
      ok: false,
      domains: [],
      ignoredInfraCount,
      problem: {
        type: 'https://monblock.ccat.local/problems/400',
        title: 'Lote inválido',
        status: 400,
        detail: validation.error ?? 'Falha ao validar lote de domínios.',
        instance: '/ipc/rules/batch-domains',
      },
    };
  }

  return {
    ok: true,
    domains: validation.domains,
    ignoredInfraCount,
  };
}

// MARK: - Cronômetro Regressivo via DeltaTime Real (72h Cooldown)

/**
 * Calcula e formata o tempo restante do Cooldown de 72 horas com base no `deltaTime` real
 * (`nowMs - startedAtMs`), em formato `HH:MM:SS` para exibição com `tabular-nums` (`RN-UI-04`).
 */
export function formatRemainingCooldown(
  startedAtMs: number,
  nowMs: number
): {
  expired: boolean;
  remainingMs: number;
  formatted: string;
} {
  const cooldownDurationMs = 72 * 3600 * 1000;
  const elapsedMs = Math.max(0, nowMs - startedAtMs);
  const remainingMs = Math.max(0, cooldownDurationMs - elapsedMs);
  const status = evaluateEmergencyCooldown(new Date(startedAtMs).toISOString(), nowMs);

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const formatted = [
    String(hours).padStart(2, '0'),
    String(minutes).padStart(2, '0'),
    String(seconds).padStart(2, '0'),
  ].join(':');

  return {
    expired: status.unlocked,
    remainingMs,
    formatted,
  };
}

// MARK: - Transição de Estados de UI & Catraca Append-Only

/**
 * Transiciona explicitamente entre os 5 estados visuais obrigatórios da interface.
 */
export function transitionUiState(
  state: UiControllerState,
  nextUiState: UiVisualState,
  problem: ProblemDetailsRfc9457 | null = null
): UiControllerState {
  return {
    ...state,
    uiState: nextUiState,
    lastProblem: problem,
  };
}

/**
 * Tenta alternar uma categoria de bloqueio aplicando a Catraca Unidirecional (`INV-UI-RATCHET-01`):
 * - Se a categoria está inativa, ativa em 1 clique imediatamente (`Append-Only`).
 * - Se já está ativa e não há autorização do Ajudante, bloqueia a desativação, abre o modal do
 *   Ajudante (`requiresPartnerDialog: true`) e registra o `ProblemDetails` RFC 9457 (`403`).
 */
export function attemptCategoryToggle(
  state: UiControllerState,
  categoryId: string,
  partnerAuthorized = false
): {
  allowed: boolean;
  requiresPartnerDialog: boolean;
  nextState: UiControllerState;
  problem?: ProblemDetailsRfc9457;
} {
  const isCurrentlyEnabled = state.ruleState.enabledCategories.includes(categoryId);
  const proposedCategories = isCurrentlyEnabled
    ? state.ruleState.enabledCategories.filter((id) => id !== categoryId)
    : [...state.ruleState.enabledCategories, categoryId];

  const nextRuleState: RuleEngineState = {
    ...state.ruleState,
    enabledCategories: proposedCategories,
  };

  const decision = canMutateProtectionRule({
    current: state.ruleState,
    next: nextRuleState,
    partnerAuthorized,
  });

  if (!decision.allowed) {
    const problem: ProblemDetailsRfc9457 = {
      type: 'https://monblock.ccat.local/problems/403',
      title: 'Ação bloqueada pela Catraca Unidirecional',
      status: 403,
      detail:
        decision.reason ??
        'A desativação de categorias ativas exige autorização do Ajudante (ADR-0003).',
      instance: `/ipc/categories/${categoryId}`,
    };
    return {
      allowed: false,
      requiresPartnerDialog: true,
      problem,
      nextState: transitionUiState(state, 'error', problem),
    };
  }

  return {
    allowed: true,
    requiresPartnerDialog: false,
    nextState: {
      ...state,
      uiState: 'active',
      ruleState: nextRuleState,
      lastProblem: null,
    },
  };
}

// MARK: - Hidratação de Eventos DOM do Renderer

export interface DomElementLike {
  getAttribute: (name: string) => string | null;
  setAttribute: (name: string, value: string) => void;
  removeAttribute: (name: string) => void;
  addEventListener: (type: string, listener: () => void) => void;
  classList?: {
    add: (cls: string) => void;
    remove: (cls: string) => void;
  };
  value?: string;
  textContent?: string | null;
}

export interface DocumentLike {
  documentElement: {
    setAttribute: (name: string, value: string) => void;
    getAttribute: (name: string) => string | null;
  };
  querySelectorAll: (selector: string) => Iterable<DomElementLike>;
  getElementById: (id: string) => DomElementLike | null;
}

/**
 * Conecta os listeners de troca de tema (`[data-theme-select]`), navegação entre views
 * (`[data-nav-target]`) e contador de lote de domínios quando executado no navegador.
 */
export function initRendererDom(doc: DocumentLike): { getState: () => UiControllerState } {
  let state = createInitialUiControllerState();

  const themeBtns = Array.from(doc.querySelectorAll('[data-theme-select]'));
  for (const btn of themeBtns) {
    btn.addEventListener('click', () => {
      const theme = (btn.getAttribute('data-theme-select') || 'capycro-ivory') as CcatThemeId;
      state = { ...state, theme };
      doc.documentElement.setAttribute('data-theme', theme);
      for (const b of themeBtns) {
        const isCurrent = b === btn;
        b.setAttribute('aria-pressed', isCurrent ? 'true' : 'false');
      }
    });
  }

  const navBtns = Array.from(doc.querySelectorAll('[data-nav-target]'));
  const views = Array.from(doc.querySelectorAll('[data-view]'));
  for (const btn of navBtns) {
    btn.addEventListener('click', () => {
      const target = (btn.getAttribute('data-nav-target') || 'categories') as DashboardViewId;
      state = { ...state, currentView: target };
      for (const b of navBtns) {
        if (b === btn) {
          b.setAttribute('aria-current', 'page');
          b.classList?.add('ccat-btn-primary');
        } else {
          b.removeAttribute('aria-current');
          b.classList?.remove('ccat-btn-primary');
        }
      }
      for (const v of views) {
        if (v.getAttribute('data-view') === target) {
          v.removeAttribute('hidden');
        } else {
          v.setAttribute('hidden', 'true');
        }
      }
    });
  }

  const batchTextarea = doc.getElementById('batchDomainsTextarea');
  const batchCounter = doc.getElementById('batchCounter');
  if (batchTextarea && batchCounter) {
    batchTextarea.addEventListener('input', () => {
      const parsed = parseAndValidateBatchInput(batchTextarea.value || '');
      batchCounter.textContent = `${parsed.domains.length} / ${MAX_BATCH_DOMAINS} domínios`;
    });
  }

  return {
    getState: () => state,
  };
}

// MARK: - Bootstrap Completo do DOM no Runtime Electron (`script-src 'self'`)

interface MonBlockWindowBridge {
  getState?: () => Promise<unknown>;
  pairPartner?: (payload: unknown) => Promise<unknown>;
  enableCategory?: (categoryId: string) => Promise<unknown>;
  addBatchDomains?: (domains: string[]) => Promise<unknown>;
  addKeywords?: (keywords: string[]) => Promise<unknown>;
  requestUnblock?: (payload: unknown) => Promise<unknown>;
  verifyOfflineToken?: (payload: unknown) => Promise<unknown>;
  verifyRecoveryCode?: (payload: unknown) => Promise<unknown>;
  triggerEmergencyCooldown?: (payload?: unknown) => Promise<unknown>;
  requestAuthorizedUninstall?: (payload: unknown) => Promise<unknown>;
  onTrayNavigate?: (cb: (viewId: string) => void) => void;
}

export function bootstrapDesktopRendererDom(): void {
  if (typeof document === 'undefined') return;

  const htmlEl = document.documentElement;
  const themeBtns = Array.from(document.querySelectorAll('[data-theme-select]'));
  const navBtns = Array.from(document.querySelectorAll('[data-nav-target]'));
  const views = Array.from(document.querySelectorAll('[data-view]'));
  const dialog = document.getElementById('partnerAuthDialog') as HTMLDialogElement | null;
  const closeDialogBtn = document.getElementById('closePartnerDialogBtn');
  const confirmDialogBtn = document.getElementById('confirmPartnerAuthBtn');
  const bridge = (globalThis as { monblock?: MonBlockWindowBridge }).monblock;

  function switchView(targetView: string): void {
    htmlEl.setAttribute('data-ui-state', 'active');
    for (const btn of navBtns) {
      const isMatch = btn.getAttribute('data-nav-target') === targetView;
      if (isMatch) {
        btn.setAttribute('aria-current', 'page');
        btn.classList.add('ccat-btn-primary');
      } else {
        btn.removeAttribute('aria-current');
        btn.classList.remove('ccat-btn-primary');
      }
    }
    for (const view of views) {
      if (view.getAttribute('data-view') === targetView) {
        view.removeAttribute('hidden');
      } else {
        view.setAttribute('hidden', 'true');
      }
    }
  }

  switchView('categories');

  for (const btn of themeBtns) {
    btn.addEventListener('click', () => {
      const theme = btn.getAttribute('data-theme-select') || 'capycro-ivory';
      htmlEl.setAttribute('data-theme', theme);
      for (const b of themeBtns) {
        b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
      }
    });
  }

  for (const btn of navBtns) {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-nav-target') || 'categories';
      switchView(target);
    });
  }

  document.querySelectorAll('[data-category-id]').forEach((card) => {
    const actionBtn = card.querySelector('[data-action]');
    if (!actionBtn) return;
    actionBtn.addEventListener('click', async () => {
      const action = actionBtn.getAttribute('data-action');
      const catId = card.getAttribute('data-category-id');
      if (action === 'request-partner-unlock') {
        if (dialog && typeof dialog.showModal === 'function') {
          dialog.showModal();
        }
        return;
      }
      if (action === 'enable-category' && catId) {
        if (bridge && typeof bridge.enableCategory === 'function') {
          await bridge.enableCategory(catId);
        }
        card.setAttribute('data-locked', 'true');
        const badge = card.querySelector('.ccat-badge');
        if (badge) {
          badge.className = 'ccat-badge ccat-badge-locked';
          badge.textContent = '🔒 Ativa e Trancada pelo Ajudante';
        }
        actionBtn.setAttribute('data-action', 'request-partner-unlock');
        actionBtn.className = 'ccat-btn';
        actionBtn.textContent = 'Solicitar Desbloqueio ao Ajudante';
      }
    });
  });

  if (closeDialogBtn && dialog) {
    closeDialogBtn.addEventListener('click', () => dialog.close());
  }
  if (confirmDialogBtn && dialog) {
    confirmDialogBtn.addEventListener('click', () => dialog.close());
  }

  const batchTextarea = document.getElementById('batchDomainsTextarea') as HTMLTextAreaElement | null;
  const batchCounter = document.getElementById('batchCounter');
  const submitBatchBtn = document.getElementById('submitBatchBtn');
  if (batchTextarea && batchCounter) {
    batchTextarea.addEventListener('input', () => {
      const parsed = parseAndValidateBatchInput(batchTextarea.value || '');
      batchCounter.textContent = `${parsed.domains.length} / ${MAX_BATCH_DOMAINS} domínios`;
    });
  }
  if (submitBatchBtn && batchTextarea) {
    submitBatchBtn.addEventListener('click', async () => {
      const parsed = parseAndValidateBatchInput(batchTextarea.value || '');
      if (parsed.ok && parsed.domains.length > 0 && bridge?.addBatchDomains) {
        await bridge.addBatchDomains(parsed.domains);
        batchTextarea.value = '';
        if (batchCounter) batchCounter.textContent = `0 / ${MAX_BATCH_DOMAINS} domínios`;
      }
    });
  }

  const keywordInput = document.getElementById('keywordInput') as HTMLInputElement | null;
  const submitKeywordBtn = document.getElementById('submitKeywordBtn');
  if (submitKeywordBtn && keywordInput) {
    submitKeywordBtn.addEventListener('click', async () => {
      const kw = keywordInput.value.trim();
      if (kw && bridge?.addKeywords) {
        await bridge.addKeywords([kw]);
        keywordInput.value = '';
      }
    });
  }

  const startCooldownBtn = document.getElementById('startCooldownBtn');
  const cooldownDisplay = document.getElementById('cooldownTimerDisplay');
  if (startCooldownBtn && cooldownDisplay) {
    startCooldownBtn.addEventListener('click', async () => {
      if (bridge?.triggerEmergencyCooldown) {
        await bridge.triggerEmergencyCooldown();
      }
      startCooldownBtn.textContent = 'Cooldown de 72h em Andamento (Ajudante Notificado)';
    });
  }

  if (bridge && typeof bridge.onTrayNavigate === 'function') {
    bridge.onTrayNavigate((viewId: string) => {
      if (viewId) switchView(viewId);
    });
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => bootstrapDesktopRendererDom());
  } else {
    bootstrapDesktopRendererDom();
  }
}

