/**
 * @file watcher-loop.ts
 * @description Loop da Camada 3 no app (ADR-0002), comum a macOS e Windows (W5).
 *
 * Extraído do `main.ts` sem mudar o comportamento do macOS:
 * - guarda de concorrência (nunca dois ciclos ao mesmo tempo);
 * - intervalo de 1,5 s com backoff até 5 s se a inspeção passar de 800 ms (contenção do AppKit / carga);
 * - erro no ciclo → 5 s;
 * - grant `*` ativo → não inspeciona; os outros grants entram como allowlist das regras;
 * - `isAvailable` falso (helper do Windows em CLM) → o loop para de vez, sem martelar o sistema.
 */

import type { RuleEngineState } from '../domain/rule-engine.js';

export interface WatcherLoopState {
  rules: RuleEngineState;
  temporaryGrants: Array<{ target: string; expiresAtMs: number }>;
}

export interface WatcherLike {
  inspectOnce(nowMs: number): Promise<{ blocked: boolean; browser?: string; domain?: string; ruleLabel?: string }>;
}

export interface WatcherLoopOptions {
  watcher: WatcherLike;
  fetchState: () => Promise<WatcherLoopState | null>;
  onRules: (rules: RuleEngineState) => void;
  isAvailable?: () => boolean;
  onScheduled?: (delayMs: number) => void;
  log?: (msg: string, err?: unknown) => void;
}

export function startBrowserWatcherLoop(options: WatcherLoopOptions): () => void {
  const log = options.log ?? ((msg, err) => (err ? console.error(msg, err) : console.log(msg)));
  let stopped = false;
  let inspecting = false;
  let timer: NodeJS.Timeout | null = null;
  let nextDelayMs = 1500;
  let lastRules: RuleEngineState | null = null;

  const tick = async (): Promise<void> => {
    if (stopped || inspecting) return;
    if (options.isAvailable && !options.isAvailable()) {
      stopped = true;
      return;
    }
    inspecting = true;
    const startedAt = Date.now();
    try {
      let wildcard = false;
      const state = await options.fetchState();
      // Horário depois da consulta: um grant que venceu enquanto ela rodava já não vale.
      const now = Date.now();
      if (state) {
        lastRules = state.rules;
        const grants = state.temporaryGrants.filter((g) => g.expiresAtMs > now);
        wildcard = grants.some((g) => g.target === '*');
        options.onRules({ ...state.rules, allowlistDomains: [...state.rules.allowlistDomains, ...grants.map((g) => g.target)] });
      } else if (lastRules) {
        // Daemon sem resposta: continua com as últimas regras (fail-closed), mas sem nenhum grant, que
        // poderia já ter vencido ou sido revogado.
        options.onRules(lastRules);
      }
      if (!wildcard) {
        const res = await options.watcher.inspectOnce(now);
        // Evento de auditoria em JSON com horário UTC. Sem título nem URL (podem ter dados pessoais).
        if (res.blocked) {
          log(JSON.stringify({ event: 'layer3.block', at: new Date(now).toISOString(), browser: res.browser, rule: res.ruleLabel ?? res.domain }));
        }
      }
      nextDelayMs = Date.now() - startedAt > 800 ? Math.min(5000, nextDelayMs + 1000) : 1500;
    } catch (err) {
      log('[monBlock] Falha no ciclo do watcher:', err);
      nextDelayMs = 5000;
    } finally {
      inspecting = false;
      if (!stopped) {
        options.onScheduled?.(nextDelayMs);
        timer = setTimeout(() => void tick(), nextDelayMs);
      }
    }
  };

  void tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
