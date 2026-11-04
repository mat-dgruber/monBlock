// MARK: - Tipos e Contratos de Políticas de Navegadores

/**
 * Parâmetros de entrada para geração das políticas corporativas multi-navegador.
 */
export interface BrowserPolicyParams {
  blockedDomains: string[];
  allowlistDomains: string[];
  lockIncognito: boolean;
}

// MARK: - Construtor de Políticas Multi-Browser (Chromium & Firefox)

/**
 * Gera os manifestos de políticas gerenciadas para navegadores baseados em Chromium
 * (Chrome, Brave, Edge, Arc, Vivaldi, Opera) e Firefox.
 *
 * Desativa DNS-over-HTTPS (DoH) para garantir eficácia da camada `/etc/hosts`,
 * aplica `URLBlocklist`/`URLAllowlist` (com precedência de exceções) e controla
 * a disponibilidade de janelas anônimas/privadas conforme `lockIncognito`.
 *
 * @param params Domínios bloqueados, domínios liberados (allowlist) e trava de modo anônimo.
 * @returns Objetos `chromiumPolicy` e `firefoxPolicy` prontos para serialização.
 */
export function buildBrowserPolicies(params: BrowserPolicyParams): {
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
