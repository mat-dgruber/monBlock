/**
 * Testes Automatizados AAA — Módulo 04 (MOD-04: Aplicativo Desktop Electron, Menu da Tray macOS e Interface CCAT).
 *
 * Valida:
 * - Isolamento Zero-Trust da BrowserWindow e bloqueio de navegação externa (`src/main/main.ts`)
 * - Menu da Tray macOS com "Sair" e sem opção de desativar o bloqueio (`INV-UI-TRAY-03`) e ocultação de janela no close (`RN-LIFE-01`)
 * - Ponte segura Preload (`src/preload/preload.ts`) sem vazamento de `ipcRenderer` bruto
 * - Estrutura semântica, 4 temas CCAT, 5 estados de UI, 4 views da jornada, 11 categorias e Zero-Roxo (`src/renderer/index.html`)
 * - Lógica controladora do Renderer (`src/renderer/app.ts`): lote <= 100 domínios, cronômetro deltaTime 72h e Catraca Append-Only
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { PREDEFINED_CATEGORIES } from '../../src/domain/categories.js';
import {
  buildTrayMenuTemplate,
  trayTitleFor,
  createSecureWindowOptions,
  handleWindowCloseEvent,
  validateNavigationUrl,
} from '../../src/main/main.js';
import { createMonBlockPreloadApi, exposeMonBlockPreload } from '../../src/preload/preload.js';
import {
  attemptCategoryToggle,
  createInitialUiControllerState,
  evaluateUrlBlockStatus,
  formatRemainingCooldown,
  getActiveRulesList,
  initRendererDom,
  parseAndValidateBatchInput,
  transitionUiState,
} from '../../src/renderer/app.js';

describe('MOD-04: Processo Principal Electron & Menu da Tray macOS (src/main/main.ts)', () => {
  it('createSecureWindowOptions deve impor tríade Zero-Trust, show: false e backgroundColor #F6F4EE', () => {
    // Arrange & Act
    const options = createSecureWindowOptions('/app/dist/preload/preload.js');

    // Assert
    expect(options.show).toBe(false);
    expect(options.backgroundColor).toBe('#F6F4EE');
    expect(options.webPreferences.nodeIntegration).toBe(false);
    expect(options.webPreferences.contextIsolation).toBe(true);
    expect(options.webPreferences.sandbox).toBe(true);
    expect(options.webPreferences.webSecurity).toBe(true);
    expect(options.webPreferences.allowRunningInsecureContent).toBe(false);
    expect(options.webPreferences.preload).toBe('/app/dist/preload/preload.js');
  });

  it('validateNavigationUrl deve permitir apenas loopback :49152 e file:// da aplicação, bloqueando file:///etc/passwd e URLs externas', () => {
    // Arrange & Act & Assert
    expect(validateNavigationUrl('http://127.0.0.1:49152/blocked')).toBe(true);
    expect(validateNavigationUrl('http://127.0.0.1:49152/showcase')).toBe(true);
    expect(validateNavigationUrl('file:///Users/app/src/renderer/index.html')).toBe(true);
    expect(validateNavigationUrl('file:///Users/app/docs/design/blocked-page.html')).toBe(true);
    expect(validateNavigationUrl('file:///opt/monblock/custom.html', '/opt/monblock')).toBe(true);

    expect(validateNavigationUrl('file:///etc/passwd')).toBe(false);
    expect(validateNavigationUrl('file:///Users/outro')).toBe(false);
    expect(validateNavigationUrl('file:///Users/app/src/renderer/../../etc/passwd')).toBe(false);
    expect(validateNavigationUrl('https://evil.example.com/phish')).toBe(false);
    expect(validateNavigationUrl('http://127.0.0.1:8080/other')).toBe(false);
    expect(validateNavigationUrl('javascript:alert(1)')).toBe(false);
    expect(validateNavigationUrl('not-a-valid-url')).toBe(false);
  });

  it('buildTrayMenuTemplate deve incluir os itens obrigatórios, Sair, e JAMAIS opção de desativar o bloqueio (INV-UI-TRAY-03)', () => {
    // Arrange
    const handlers = {
      onQuickAdd: vi.fn(),
      onRequestUnblock: vi.fn(),
      onEnterToken: vi.fn(),
      onOpenDashboard: vi.fn(),
      onQuit: vi.fn(),
    };

    // Act
    const menu = buildTrayMenuTemplate(
      {
        active: true,
        partnerName: 'Ana',
      },
      handlers
    );

    // Assert
    const ids = menu.filter((item) => item.id).map((item) => item.id);
    expect(ids).toContain('status-header');
    expect(ids).toContain('quick-add');
    expect(ids).not.toContain('block-active-tab');
    expect(ids).toContain('request-unblock');
    expect(ids).toContain('enter-token');
    expect(ids).toContain('open-dashboard');

    const header = menu.find((i) => i.id === 'status-header');
    expect(header?.label).toContain('Proteção ativa');
    expect(header?.label).toContain('Ajudante: Ana');
    expect(header?.enabled).toBe(false);

    expect(menu.find((i) => i.id === 'quick-add')?.label).toBe(
      'Bloquear site ou palavra-chave...'
    );
    expect(menu.find((i) => i.id === 'request-unblock')?.label).toBe(
      'Solicitar desbloqueio ao Ajudante...'
    );
    expect(menu.find((i) => i.id === 'enter-token')?.label).toBe(
      'Inserir código de liberação...'
    );
    expect(menu.find((i) => i.id === 'open-dashboard')?.label).toBe(
      'Abrir painel principal'
    );

    // INV-UI-TRAY-03: sair fecha só a UI (o daemon root segue impondo); desativar nunca
    expect(menu.find((i) => i.id === 'quit')?.label).toBe('Sair do monBlock (a proteção continua ativa)');
    const serialized = JSON.stringify(menu).toLowerCase();
    expect(serialized).not.toMatch(/\b(desativar|pausar)\b/);

    // Acionamento dos handlers
    menu.find((i) => i.id === 'quick-add')?.click?.();
    menu.find((i) => i.id === 'request-unblock')?.click?.();
    menu.find((i) => i.id === 'enter-token')?.click?.();
    menu.find((i) => i.id === 'open-dashboard')?.click?.();
    menu.find((i) => i.id === 'quit')?.click?.();

    expect(handlers.onQuickAdd).toHaveBeenCalledTimes(1);
    expect(handlers.onRequestUnblock).toHaveBeenCalledTimes(1);
    expect(handlers.onEnterToken).toHaveBeenCalledTimes(1);
    expect(handlers.onOpenDashboard).toHaveBeenCalledTimes(1);
    expect(handlers.onQuit).toHaveBeenCalledTimes(1);
  });

  it('handleWindowCloseEvent deve ocultar a janela ao fechar sem encerrar a proteção (RN-LIFE-01)', () => {
    // Arrange
    const preventDefault = vi.fn();
    const hide = vi.fn();

    // Act — Fechamento normal (não autorizado pelo Ajudante)
    handleWindowCloseEvent({ preventDefault }, { hide }, false);

    // Assert
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(hide).toHaveBeenCalledTimes(1);

    // Act — Fechamento durante o quit do app (Sair, Cmd+Q, desinstalação autorizada)
    handleWindowCloseEvent({ preventDefault }, { hide }, true);
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it('buildTrayMenuTemplate deve exibir contadores regressivos tabular-nums de pausa temporária ou cooldown 72h', () => {
    const noop = vi.fn();
    const handlers = {
      onQuickAdd: noop,
      onRequestUnblock: noop,
      onEnterToken: noop,
      onOpenDashboard: noop,
      onQuit: noop,
    };

    const pauseMenu = buildTrayMenuTemplate(
      { active: true, temporaryUnlockRemainingFormatted: '14:22' },
      handlers
    );
    expect(pauseMenu[0]?.label).toContain('14:22');

    const cooldownMenu = buildTrayMenuTemplate(
      { active: true, cooldownRemainingFormatted: '71:59:10' },
      handlers
    );
    expect(cooldownMenu[0]?.label).toContain('71:59:10');
  });
});

describe('MOD-04: Ponte Segura Preload (src/preload/preload.ts)', () => {
  it('createMonBlockPreloadApi deve expor apenas os métodos contratados e nunca expor ipcRenderer bruto', async () => {
    // Arrange
    const invokeMock = vi.fn().mockResolvedValue({ ok: true });

    // Act
    const api = createMonBlockPreloadApi(invokeMock);

    // Assert
    expect(Object.keys(api).sort()).toEqual(
      [
        'addBatchDomains',
        'addKeywords',
        'cancelPairing',
        'checkPairingStatus',
        'checkUrl',
        'enableCategory',
        'getCategories',
        'getState',
        'initiatePairing',
        'pairPartner',
        'requestAuthorizedUninstall',
        'requestUnblock',
        'triggerEmergencyCooldown',
        'verifyOfflineToken',
      ].sort()
    );
    expect((api as unknown as Record<string, unknown>).ipcRenderer).toBeUndefined();

    await api.getState();
    expect(invokeMock).toHaveBeenCalledWith('monblock:get-state');

    await api.enableCategory('gambling');
    expect(invokeMock).toHaveBeenCalledWith('monblock:enable-category', { categoryId: 'gambling' });

    await api.addBatchDomains(['bet365.com']);
    expect(invokeMock).toHaveBeenCalledWith('monblock:add-batch-domains', {
      domains: ['bet365.com'],
    });

    await api.addKeywords(['cassino,online']);
    expect(invokeMock).toHaveBeenCalledWith('monblock:add-keywords', {
      keywords: ['cassino,online'],
    });

    await api.verifyOfflineToken({
      challengeCode: ' mb-8492-x7 ',
      token: ' unlock-15m-abcdef1234 ',
    });
    expect(invokeMock).toHaveBeenCalledWith('monblock:verify-offline-token', {
      challengeCode: 'MB-8492-X7',
      token: 'UNLOCK-15M-ABCDEF1234',
    });

    await api.triggerEmergencyCooldown();
    expect(invokeMock).toHaveBeenCalledWith('monblock:trigger-emergency-cooldown', {});

    await api.requestAuthorizedUninstall({
      authMethod: 'PASSWORD',
      credential: 'partner-secret',
    });
    expect(invokeMock).toHaveBeenCalledWith('monblock:request-authorized-uninstall', {
      authMethod: 'PASSWORD',
      credential: 'partner-secret',
    });

    await api.requestAuthorizedUninstall({
      authMethod: 'PERMANENT_TOKEN',
      credential: 'UNLOCK-PERMANENT-123456',
      challengeCode: 'MB-8492-X7',
    });
    expect(invokeMock).toHaveBeenCalledWith('monblock:request-authorized-uninstall', {
      authMethod: 'PERMANENT_TOKEN',
      credential: 'UNLOCK-PERMANENT-123456',
      challengeCode: 'MB-8492-X7',
    });

    await api.initiatePairing({ partnerName: 'Ana', telegramChatId: '12345' });
    expect(invokeMock).toHaveBeenCalledWith('monblock:initiate-pairing', {
      partnerName: 'Ana',
      telegramChatId: '12345',
    });

    await api.checkPairingStatus();
    expect(invokeMock).toHaveBeenCalledWith('monblock:check-pairing-status');

    await api.cancelPairing();
    expect(invokeMock).toHaveBeenCalledWith('monblock:cancel-pairing');

    await api.requestAuthorizedUninstall({
      authMethod: 'COOLDOWN_72H',
      credential: '',
    });
    expect(invokeMock).toHaveBeenCalledWith('monblock:request-authorized-uninstall', {
      authMethod: 'COOLDOWN_72H',
      credential: '',
    });

    const exposeInMainWorld = vi.fn();
    const exposed = exposeMonBlockPreload({ exposeInMainWorld }, { invoke: invokeMock });
    expect(exposeInMainWorld).toHaveBeenCalledWith('monblock', exposed);

    await expect(
      api.pairPartner({
        partnerName: 'Ana',
        telegramChatId: '12345',
        password: 'secret',
        confirmedRecoveryCodes: false,
      })
    ).rejects.toThrow(/Kit de Emergência/);
  });
});

describe('MOD-04: Interface Desktop CCAT & Conformidade WCAG 2.2 AAA / Zero-Roxo (src/renderer/index.html)', () => {
  const htmlPath = path.resolve(__dirname, '../../src/renderer/index.html');

  it('aviso do perfil dos navegadores: escondido por padrão, anunciado e com passos em <dialog>', () => {
    // Arrange & Act
    // HTML + CSS do renderer (o CSS saiu do <style> inline para renderer.css; CSP sem unsafe-inline)
    const html = fs.readFileSync(htmlPath, 'utf-8') + fs.readFileSync(htmlPath.replace('index.html', 'renderer.css'), 'utf-8');
    const banner = html.match(/<section id="profileBanner"[^>]*>/)?.[0] ?? '';

    // Assert
    expect(banner).toContain('role="status"');
    expect(banner).toContain('hidden');
    expect(banner).not.toContain('data-state-panel');
    expect(html).toContain('id="openProfileSettingsBtn"');
    expect(html).toContain('<dialog id="profileStepsDialog" aria-labelledby="profile-steps-title">');
    expect(html).toContain('Gerenciamento de Dispositivos');
    const update = html.match(/<section id="serviceUpdateBanner"[^>]*>/)?.[0] ?? '';
    expect(update).toContain('role="status"');
    expect(update).toContain('hidden');
    expect(html).toContain('id="updateServiceBtn"');
  });

  it('deve conter os 4 temas CCAT, os 5 estados visuais, as 4 views, as 11 categorias e Zero-Roxo', () => {
    // Arrange & Act
    const html = fs.readFileSync(htmlPath, 'utf-8') + fs.readFileSync(htmlPath.replace('index.html', 'renderer.css'), 'utf-8');

    // Assert — Idioma, tema inicial e vínculo com tokens.css
    expect(html).toContain('lang="pt-BR"');
    expect(html).toContain('data-theme="capycro-ivory"');
    expect(html).toContain('../../docs/design/tokens.css');
    expect(html).toContain('/tokens.css');

    // Assert — 4 Temas CCAT
    expect(html).toContain('capycro-ivory');
    expect(html).toContain('dark-tech');
    expect(html).toContain('light-fintech');
    expect(html).toContain('high-contrast-aaa');

    // Assert — Semântica HTML5
    expect(html).toContain('<header');
    expect(html).toContain('<nav');
    expect(html).toContain('<main');
    expect(html).toContain('<dialog');

    // Assert — 5 Estados Visuais Obrigatórios (loading, empty, error RFC 9457, partial, active)
    expect(html).toContain('data-ui-state=');
    expect(html).toContain('data-state-panel="loading"');
    expect(html).toContain('id="emptyRulesHint"');
    expect(html).toContain('data-state-panel="error"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="assertive"');
    expect(html).toContain('RFC 9457');
    expect(html).toContain('id="profileBanner"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('data-state-panel="active"');

    // Assert — 4 Views da Jornada Completa
    expect(html).toContain('data-view="onboarding"');
    expect(html).toContain('data-view="categories"');
    expect(html).toContain('data-view="rules"');
    expect(html).toContain('data-view="partner"');

    // Assert —Todas as 11 categorias de PREDEFINED_CATEGORIES presentes
    for (const cat of PREDEFINED_CATEGORIES) {
      expect(html).toContain(`data-category-id="${cat.id}"`);
      expect(html).toContain(cat.namePt);
    }

    // Assert — Lote 0 / 100 domínios e aviso educativo RN-WEB-07
    expect(html).toContain('0 / 100 domínios');
    expect(html).toContain('RN-WEB-07');
    expect(html).toContain('instituição');
    expect(html).toContain('sexta-feira');

    // Assert — A interface não exibe código de desafio fictício como autorização real.
    expect(html).not.toContain('MB-8492-X7');
    expect(html).toContain('Desafio indisponível nesta versão');
    expect(html).toContain('id="recoveryTargetInput"');
    expect(html).toContain('UNLOCK-15M-');
    expect(html).toContain('UNLOCK-60M-');
    expect(html).toContain('UNLOCK-PERMANENT-');
    expect(html).toContain('REC-');
    expect(html).toContain('Não iniciada');
    expect(html).toContain('Desinstalação Autorizada pelo Ajudante');

    // Assert — WCAG 2.2 AAA, tabular-nums, prefers-reduced-motion e Zero Roxo
    expect(html).toContain(':focus-visible');
    expect(html).toContain('prefers-reduced-motion: reduce');
    expect(html).toContain('tabular-nums');
    expect(html.toLowerCase()).not.toMatch(/#8b5cf6|#7c3aed|#a855f7|#6366f1|\b(purple|violet|indigo)\b/);

    // Assert — Correções da auditoria MOD-04 (skip-link, ocultação data-state-panel, aria-pressed/aria-current, #useRecoveryCodeBtn, dialog inputs)
    expect(html).toContain('<a href="#main-content" class="skip-link">Pular para o conteúdo principal</a>');
    expect(html).toContain('html[data-ui-state="active"] [data-state-panel]:not([data-state-panel="active"])');
    expect(html).toContain('[data-view][hidden]');
    expect(html).toContain('id="themeSelect"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('id="useRecoveryCodeBtn"');
    expect(html).toContain('id="partnerAuthDialog"');
    expect(html).not.toContain('id="confirmPartnerAuthBtn"');

    // Invariante de Segurança Comportamental CCAT: Proibição de Senha e Download Local no Onboarding
    expect(html).not.toContain('id="onboardingPasswordInput"');
    expect(html).not.toContain('id="copyRecoveryCodesBtn"');
    expect(html).not.toContain('id="downloadRecoveryCodesBtn"');
    expect(html).toContain('id="onboardingPairBtn"');
    expect(html).toContain('id="cancelPairingBtn"');
    expect(html).toContain('Custódia Exclusiva dos 5 Códigos de Emergência');
  });

  it('docs/design/tokens.css, blocked-page.html e tokens-showcase.html devem ter seletores unificados, contraste WCAG AA/AAA e acessibilidade completa', () => {
    const tokensCss = fs.readFileSync(path.resolve(__dirname, '../../docs/design/tokens.css'), 'utf-8');
    const blockedHtml = fs.readFileSync(path.resolve(__dirname, '../../docs/design/blocked-page.html'), 'utf-8');
    const showcaseHtml = fs.readFileSync(path.resolve(__dirname, '../../docs/design/tokens-showcase.html'), 'utf-8');

    expect(tokensCss).toContain('[data-theme="capycro-ivory"]');
    expect(tokensCss).toContain('[data-theme="light-fintech"]');
    expect(tokensCss).toContain('[data-theme="dark-tech"]');
    expect(tokensCss).toContain('[data-theme="high-contrast-aaa"]');
    expect(tokensCss).toContain('--primary-color: #005A64;');
    expect(tokensCss).toContain('--accent-color: #B84227;');
    expect(tokensCss).toContain('--success-color: #2E6B34;');
    expect(tokensCss).toContain('--accent-color: #0369a1;');
    expect(tokensCss).toContain('min-height: var(--touch-target-min);');

    expect(blockedHtml).not.toContain('min-height:2.25rem;');
    expect(blockedHtml).toContain("event.key === 'Escape'");

    expect(showcaseHtml).toContain('.input-field:focus-visible');
    expect(showcaseHtml).toContain('aria-live="polite"');
    expect(showcaseHtml).not.toContain('onclick="alert(');
  });
});

describe('MOD-04: Controlador do Renderer (src/renderer/app.ts)', () => {
  it('parseAndValidateBatchInput deve aceitar até 100 domínios, filtrar infra crítica e rejeitar > 100 com RFC 9457', () => {
    // Arrange — Lote válido com infra crítica infiltrada
    const rawText = 'bet365.com\nhttps://www.blaze.com/promo\nlocalhost\napi.telegram.org';

    // Act
    const okResult = parseAndValidateBatchInput(rawText);

    // Assert
    expect(okResult.ok).toBe(true);
    expect(okResult.domains).toEqual(['bet365.com', 'blaze.com']);
    expect(okResult.ignoredInfraCount).toBe(2);

    // Arrange — Lote excedendo 100 domínios
    const overLimitText = Array.from({ length: 101 }, (_, i) => `site${i}.com`).join('\n');

    // Act
    const errResult = parseAndValidateBatchInput(overLimitText);

    // Assert
    expect(errResult.ok).toBe(false);
    expect(errResult.problem?.status).toBe(400);
    expect(errResult.problem?.title).toContain('Limite');
    expect(errResult.problem?.detail).toContain('100');
  });

  it('formatRemainingCooldown deve calcular tempo restante via deltaTime real em formato HH:MM:SS', () => {
    // Arrange
    const startedAtMs = 1_700_000_000_000;
    const oneHourLaterMs = startedAtMs + 3_600_000;
    const after72HoursMs = startedAtMs + 72 * 3_600_000 + 1000;

    // Act & Assert
    expect(formatRemainingCooldown(startedAtMs, startedAtMs)).toEqual({
      expired: false,
      remainingMs: 259_200_000,
      formatted: '72:00:00',
    });
    expect(formatRemainingCooldown(startedAtMs, oneHourLaterMs)).toEqual({
      expired: false,
      remainingMs: 255_600_000,
      formatted: '71:00:00',
    });
    expect(formatRemainingCooldown(startedAtMs, after72HoursMs)).toEqual({
      expired: true,
      remainingMs: 0,
      formatted: '00:00:00',
    });
  });

  it('attemptCategoryToggle deve ativar categoria inativa em 1 clique (Append-Only) e bloquear desativação sem Ajudante', () => {
    // Arrange
    const initialState = createInitialUiControllerState();
    expect(initialState.ruleState.enabledCategories).toContain('adult');

    // Act 1 — Ativar categoria inativa ('gambling') sem precisar do Ajudante
    const addResult = attemptCategoryToggle(initialState, 'gambling');

    // Assert 1
    expect(addResult.allowed).toBe(true);
    expect(addResult.requiresPartnerDialog).toBe(false);
    expect(addResult.nextState.ruleState.enabledCategories).toContain('gambling');

    // Act 2 — Tentar desativar 'adult' sem credencial do Ajudante
    const removeAttempt = attemptCategoryToggle(addResult.nextState, 'adult');

    // Assert 2 — Bloqueado pela Catraca Append-Only com Problem Details RFC 9457 e exigência de modal
    expect(removeAttempt.allowed).toBe(false);
    expect(removeAttempt.requiresPartnerDialog).toBe(true);
    expect(removeAttempt.nextState.uiState).toBe('error');
    expect(removeAttempt.problem?.status).toBe(403);
    expect(removeAttempt.nextState.ruleState.enabledCategories).toContain('adult');

    // Act 3 — Desativar 'gambling' COM autorização explícita do Ajudante
    const authorizedRemove = attemptCategoryToggle(addResult.nextState, 'gambling', true);
    expect(authorizedRemove.allowed).toBe(true);
    expect(authorizedRemove.nextState.ruleState.enabledCategories).not.toContain('gambling');

    // Act 4 — Transição explícita para estado partial (offline) e active
    const partialState = transitionUiState(removeAttempt.nextState, 'partial');
    expect(partialState.uiState).toBe('partial');

    // Act 5 — Hidratação de eventos DOM (initRendererDom)
    const listeners: Record<string, () => void> = {};
    let currentThemeAttr = 'capycro-ivory';
    const themeBtn = {
      getAttribute: (n: string) => (n === 'data-theme-select' ? 'dark-tech' : null),
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
      addEventListener: (_t: string, cb: () => void) => {
        listeners.themeClick = cb;
      },
    };
    const navBtn = {
      getAttribute: (n: string) => (n === 'data-nav-target' ? 'partner' : null),
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
      addEventListener: (_t: string, cb: () => void) => {
        listeners.navClick = cb;
      },
      classList: { add: vi.fn(), remove: vi.fn() },
    };
    const viewEl = {
      getAttribute: (n: string) => (n === 'data-view' ? 'partner' : null),
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
      addEventListener: vi.fn(),
    };
    const controller = initRendererDom({
      documentElement: {
        setAttribute: (_n, v) => {
          currentThemeAttr = v;
        },
        getAttribute: () => currentThemeAttr,
      },
      querySelectorAll: (sel: string) => {
        if (sel === '[data-theme-select]') return [themeBtn];
        if (sel === '[data-nav-target]') return [navBtn];
        if (sel === '[data-view]') return [viewEl];
        return [];
      },
      getElementById: () => null,
    });
    listeners.themeClick?.();
    expect(currentThemeAttr).toBe('dark-tech');
    expect(controller.getState().theme).toBe('dark-tech');
    listeners.navClick?.();
    expect(controller.getState().currentView).toBe('partner');
    expect(viewEl.removeAttribute).toHaveBeenCalledWith('hidden');
  });

  it('evaluateUrlBlockStatus e getActiveRulesList devem suportar o Verificador Raio-X e a tabela de regras', () => {
    // Arrange
    const state = createInitialUiControllerState().ruleState;
    state.blockedDomains = ['custom-distraction.com'];
    state.keywords = ['apostas,online'];

    // Act 1 — Verificar URL de categoria ativa (adult)
    const adultCheck = evaluateUrlBlockStatus('https://pornhub.com/video', state);
    expect(adultCheck.blocked).toBe(true);
    expect(adultCheck.reason).toBe('CATEGORY');

    // Act 2 — Verificar URL de domínio customizado
    const customCheck = evaluateUrlBlockStatus('custom-distraction.com', state);
    expect(customCheck.blocked).toBe(true);
    expect(customCheck.reason).toBe('CUSTOM_DOMAIN');

    // Act 3 — Verificar site livre
    const safeCheck = evaluateUrlBlockStatus('https://developer.mozilla.org', state);
    expect(safeCheck.blocked).toBe(false);

    // Act 4 — Listar todas as regras ativas consolidadas
    const rules = getActiveRulesList(state);
    expect(rules.length).toBeGreaterThan(5);
    const hasCustom = rules.some((r) => r.item === 'custom-distraction.com');
    expect(hasCustom).toBe(true);

    // Act 5 — Filtrar regras por busca textual
    const filtered = getActiveRulesList(state, 'custom');
    expect(filtered.length).toBe(1);
    expect(filtered[0]?.item).toBe('custom-distraction.com');
  });
});

describe('trayTitleFor', () => {
  it('sinaliza estado não verificado e perfil pendente; vazio quando tudo certo', () => {
    expect(trayTitleFor(null)).toBe(' ?');
    expect(trayTitleFor({ browserProfileInstalled: false })).toBe(' !');
    expect(trayTitleFor({ browserProfileInstalled: true })).toBe('');
    expect(trayTitleFor({ browserProfileInstalled: null })).toBe('');
  });
});
