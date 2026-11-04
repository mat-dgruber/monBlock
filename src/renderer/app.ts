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
