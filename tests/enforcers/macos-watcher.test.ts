/**
 * @file macos-watcher.test.ts
 * @description Suíte TDD (AAA) para o Watcher Universal macOS (MOD-01 - Camada 3).
 * Valida interceptação de Safari/Chrome/Firefox, debounce de 150ms,
 * respeito à RN-WEB-07 (Scunthorpe/contextos benignos), TemporaryGrants ativos
 * e higienização Zero-PII no redirecionamento para :49152/blocked.
 */

import { describe, expect, it, vi } from 'vitest';
import type { RuleEngineState } from '../../src/domain/rule-engine.js';
import {
  MacOSBrowserWatcher,
  SUPPORTED_MACOS_BROWSERS,
  type ActiveTabSnapshot,
  type BrowserTabAdapter,
} from '../../src/enforcers/macos-watcher.js';

function createBaseRules(overrides: Partial<RuleEngineState> = {}): RuleEngineState {
  return {
    enabledCategories: ['adult', 'gambling'],
    blockedDomains: ['custom-blocked.org'],
    allowlistDomains: ['liberado.org'],
    keywords: ['tit', 'sex', 'cassino,online'],
    lockIncognito: true,
    ...overrides,
  };
}

function createMockAdapter(initialTab: ActiveTabSnapshot | null = null): BrowserTabAdapter & {
  setTab: (tab: ActiveTabSnapshot | null) => void;
  redirects: Array<{ browser: string; targetUrl: string }>;
} {
  let currentTab = initialTab;
  const redirects: Array<{ browser: string; targetUrl: string }> = [];

  return {
    redirects,
    setTab(tab: ActiveTabSnapshot | null) {
      currentTab = tab;
    },
    getActiveTab: vi.fn(async () => currentTab),
    redirectActiveTab: vi.fn(async (browser: string, targetUrl: string) => {
      redirects.push({ browser, targetUrl });
    }),
  };
}

describe('MOD-01: MacOSBrowserWatcher (Camada 3 - Watcher Universal macOS)', () => {
  it('deve listar todos os navegadores macOS suportados (Safari, Chrome, Brave, Arc, Edge, Firefox)', () => {
    // Arrange & Act & Assert
    expect(SUPPORTED_MACOS_BROWSERS).toEqual([
      'Safari',
      'Google Chrome',
      'Brave Browser',
      'Arc',
      'Microsoft Edge',
      'Firefox',
    ]);
  });

  it('deve interceptar abas violadoras no Safari, Google Chrome e Firefox higienizando query strings sensíveis', async () => {
    // Arrange
    const rules = createBaseRules();
    const adapter = createMockAdapter();
    const watcher = new MacOSBrowserWatcher({
      adapter,
      getRules: () => rules,
    });

    const browsersToTest = [
      {
        browser: 'Safari',
        url: 'https://www.pornhub.com/view_video.php?viewkey=ph999&token=secret_session_123#top',
        title: 'Vídeo Adulto',
        expectedDomain: 'pornhub.com',
        expectedReason: 'CATEGORY',
      },
      {
        browser: 'Google Chrome',
        url: 'https://sub.custom-blocked.org/auth?cpf=12345678900&jwt=eyJ0eXAi',
        title: 'Portal Restrito',
        expectedDomain: 'sub.custom-blocked.org',
        expectedReason: 'CUSTOM_DOMAIN',
      },
      {
        browser: 'Firefox',
        url: 'https://portal-jogos.io/mesa?user=matheus',
        title: 'Jogue no Cassino Online Agora',
        expectedDomain: 'portal-jogos.io',
        expectedReason: 'KEYWORD',
      },
    ] as const;

    // Act & Assert
    let nowMs = 1_000_000;
    for (const scenario of browsersToTest) {
      adapter.setTab({
        browser: scenario.browser,
        url: scenario.url,
        title: scenario.title,
      });
      nowMs += 500;
      const result = await watcher.inspectOnce(nowMs);

      expect(result.blocked).toBe(true);
      expect(result.browser).toBe(scenario.browser);
      expect(result.domain).toBe(scenario.expectedDomain);
      expect(result.reason).toBe(scenario.expectedReason);
      expect(result.cleanUrl).not.toContain('?');
      expect(result.cleanUrl).not.toContain('secret_session_123');
      expect(result.cleanUrl).not.toContain('12345678900');
      expect(result.redirectUrl).toContain('http://127.0.0.1:49152/blocked?');
      expect(result.redirectUrl).toContain(`domain=${encodeURIComponent(scenario.expectedDomain)}`);
      expect(result.redirectUrl).toContain(`reason=${scenario.expectedReason}`);
      expect(result.redirectUrl).not.toContain('secret_session_123');
      expect(result.redirectUrl).not.toContain('12345678900');
    }

    expect(adapter.redirects).toHaveLength(3);
  });

  it('deve respeitar RN-WEB-07 e NÃO bloquear URLs/títulos legítimos com "instituição" ou "sexta-feira"', async () => {
    // Arrange
    const rules = createBaseRules({
      keywords: ['tit', 'sex', 'anal', 'ass'],
    });
    const adapter = createMockAdapter({
      browser: 'Safari',
      url: 'https://portal-universidade.edu.br/institui%C3%A7%C3%A3o/constituicao-titulo',
      title: 'Expediente da Instituição: atendimento de segunda a sexta-feira (seg. a sex.)',
    });
    const watcher = new MacOSBrowserWatcher({
      adapter,
      getRules: () => rules,
    });

    // Act
    const result = await watcher.inspectOnce(2_000_000);

    // Assert
    expect(result.blocked).toBe(false);
    expect(adapter.redirects).toHaveLength(0);
  });

  it('deve permitir navegação quando o domínio possui um TemporaryGrant ativo (expiresAtMs > nowMs) e bloquear após expirar', async () => {
    // Arrange
    const rules = createBaseRules();
    const adapter = createMockAdapter({
      browser: 'Brave Browser',
      url: 'https://custom-blocked.org/artigo',
      title: 'Artigo de Pesquisa',
    });
    const watcher = new MacOSBrowserWatcher({
      adapter,
      getRules: () => rules,
      debounceMs: 150,
    });

    watcher.grantTemporaryAccess('custom-blocked.org', 5_000_000 + 15 * 60 * 1000);

    // Act 1: Dentro da janela da concessão temporária
    const allowedDuringGrant = await watcher.inspectOnce(5_000_000 + 60_000);

    // Assert 1
    expect(allowedDuringGrant.blocked).toBe(false);
    expect(allowedDuringGrant.grantedTemporary).toBe(true);
    expect(adapter.redirects).toHaveLength(0);

    // Act 2: Após expiração da concessão temporária
    const blockedAfterExpiry = await watcher.inspectOnce(5_000_000 + 16 * 60 * 1000);

    // Assert 2
    expect(blockedAfterExpiry.blocked).toBe(true);
    expect(adapter.redirects).toHaveLength(1);
    expect(adapter.redirects[0]?.browser).toBe('Brave Browser');
  });

  it('deve aplicar debounce (150ms) e cache de última aba (lastCheckedKey) para evitar reavaliação redundante', async () => {
    // Arrange
    const rules = createBaseRules();
    const adapter = createMockAdapter({
      browser: 'Arc',
      url: 'https://docs.developer.apple.com/documentation',
      title: 'Apple Developer Documentation',
    });
    const watcher = new MacOSBrowserWatcher({
      adapter,
      getRules: () => rules,
      debounceMs: 150,
    });

    // Act
    const firstCheck = await watcher.inspectOnce(10_000);
    const secondCheckWithinDebounce = await watcher.inspectOnce(10_080);
    const thirdCheckAfterDebounce = await watcher.inspectOnce(10_200);

    // Assert
    expect(firstCheck.blocked).toBe(false);
    expect(firstCheck.debounced).toBeFalsy();
    expect(secondCheckWithinDebounce.blocked).toBe(false);
    expect(secondCheckWithinDebounce.debounced).toBe(true);
    expect(thirdCheckAfterDebounce.debounced).toBeFalsy();
  });

  it('deve revogar concessão temporária imediatamente via revokeTemporaryAccess e rejeitar redirecionamento externo no OsascriptBrowserTabAdapter', async () => {
    // Arrange
    const { OsascriptBrowserTabAdapter } = await import('../../src/enforcers/macos-watcher.js');
    const osAdapter = new OsascriptBrowserTabAdapter(500);
    const rules = createBaseRules();
    const adapter = createMockAdapter({
      browser: 'Microsoft Edge',
      url: 'https://custom-blocked.org/painel',
      title: 'Painel Restrito',
    });
    const watcher = new MacOSBrowserWatcher({
      adapter,
      getRules: () => rules,
      initialGrants: [{ domain: 'custom-blocked.org', expiresAtMs: 9_000_000 }],
    });

    // Act
    watcher.revokeTemporaryAccess('custom-blocked.org');
    const afterRevoke = await watcher.inspectOnce(1_000_000);

    // Assert
    expect(afterRevoke.blocked).toBe(true);
    await expect(
      osAdapter.redirectActiveTab('Safari', 'https://evil.example.com/phishing')
    ).rejects.toThrow('URL de redirecionamento inválida');
  });

  it('suporta grant curinga ("*"), higieniza cacheKey sem PII e avalia abas com título vazio e redirecionamento Firefox no OsascriptBrowserTabAdapter', async () => {
    // Arrange
    const { OsascriptBrowserTabAdapter } = await import('../../src/enforcers/macos-watcher.js');
    const executedCommands: Array<{ file: string; args: readonly string[] }> = [];
    const customExec = vi.fn(async (file: string, args: readonly string[]) => {
      executedCommands.push({ file, args });
      return { stdout: 'Safari\nhttps://www.pornhub.com/watch?token=pii_secret\n' };
    });

    const osAdapter = new OsascriptBrowserTabAdapter(customExec);
    const tabWithEmptyTitle = await osAdapter.getActiveTab();
    expect(tabWithEmptyTitle).toEqual({
      browser: 'Safari',
      url: 'https://www.pornhub.com/watch?token=pii_secret',
      title: '',
    });

    const firefoxRedirectOk = await osAdapter.redirectActiveTab(
      'Firefox',
      'http://127.0.0.1:49152/blocked?domain=pornhub.com'
    );
    expect(firefoxRedirectOk).toBe(true);
    expect(executedCommands[1]?.args[1]).toContain('Firefox');
    expect(executedCommands[1]?.args[1]).toContain('open location safeRedirectUrl');

    // Wildcard grant '*' libera qualquer domínio enquanto ativo
    const rules = createBaseRules();
    const adapter = createMockAdapter({
      browser: 'Safari',
      url: 'https://www.pornhub.com/watch?token=pii_secret',
      title: '',
    });
    const watcher = new MacOSBrowserWatcher({
      adapter,
      getRules: () => rules,
      initialGrants: [{ target: '*', expiresAtMs: 50_000 }],
    });

    const wildcardResult = await watcher.inspectOnce(10_000);
    expect(wildcardResult.blocked).toBe(false);
    expect(wildcardResult.grantedTemporary).toBe(true);

    // Debounce por cleanUrl (mudar query string sensível dentro da janela de debounce continua debounced e não retém PII)
    adapter.setTab({
      browser: 'Safari',
      url: 'https://www.pornhub.com/watch?token=other_secret',
      title: '',
    });
    const debouncedCleanUrl = await watcher.inspectOnce(10_050);
    expect(debouncedCleanUrl.debounced).toBe(true);
  });
});
