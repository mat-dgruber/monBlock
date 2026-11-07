/**
 * Catálogo canônico das 11 categorias de bloqueio web do monBlock (Fase 1 MVP).
 *
 * A categoria `adult` (Conteúdo Adulto & Pornografia) vem habilitada e trancada
 * por padrão (Catraca Unidirecional Append-Only — ADR-0003).
 */

import { domainToASCII } from 'node:url';
import { LISTS } from './lists.generated.js';

// MARK: - Limites por camada (RN-WEB-09)

/** Teto de domínios no perfil dos navegadores: URLBlocklist do Chromium/Edge documenta 1000 entradas. */
export const POLICY_DOMAIN_LIMIT = 900;
/** Teto de domínios no /etc/hosts (2 linhas por domínio). Acima disso o corte é pela ordem de prioridade. */
export const HOSTS_MAX_DOMAINS = 25_000;

// MARK: - Tipos e Interfaces de Categoria

/**
 * Definição estrutural de uma categoria pré-cadastrada de bloqueio.
 */
export interface CategoryDefinition {
  id: string;
  namePt: string;
  enabledByDefault: boolean;
  domains: string[];
  keywords: string[];
}

// MARK: - Catálogo Pré-Cadastrado (11 Categorias)

/**
 * Lista imutável das 11 categorias pré-cadastradas do monBlock.
 */
const META: ReadonlyArray<{ id: string; namePt: string; enabledByDefault: boolean }> = [
  {
    id: 'adult',
    namePt: 'Conteúdo Adulto & Pornografia',
    enabledByDefault: true,
  },
  {
    id: 'gambling',
    namePt: 'Apostas & Cassinos (Bets)',
    enabledByDefault: false,
  },
  {
    id: 'games',
    namePt: 'Jogos Online',
    enabledByDefault: false,
  },
  {
    id: 'proxy',
    namePt: 'Proxies, VPNs & Bypass',
    enabledByDefault: false,
  },
  {
    id: 'dating',
    namePt: 'Sites de Relacionamento',
    enabledByDefault: false,
  },
  {
    id: 'social',
    namePt: 'Redes Sociais',
    enabledByDefault: false,
  },
  {
    id: 'video',
    namePt: 'Streaming & Vídeos',
    enabledByDefault: false,
  },
  {
    id: 'forums',
    namePt: 'Fóruns & Comunidades Mistas',
    enabledByDefault: false,
  },
  {
    id: 'shopping',
    namePt: 'Compras por Impulso',
    enabledByDefault: false,
  },
  {
    id: 'news',
    namePt: 'Notícias & Portais',
    enabledByDefault: false,
  },
  {
    id: 'search_unsafe',
    namePt: 'Buscadores sem SafeSearch',
    enabledByDefault: false,
  },
];

const lines = (text: string): string[] => (text ? text.split('\n') : []);

/** Catálogo completo: metadados acima + listas geradas de `lists/*.txt` (ordem = prioridade). */
export const PREDEFINED_CATEGORIES: ReadonlyArray<CategoryDefinition> = META.map((m) => ({
  ...m,
  domains: lines(LISTS[m.id]?.domains ?? ''),
  keywords: lines(LISTS[m.id]?.keywords ?? ''),
}));

/** Domínios que vão para o perfil dos navegadores (os `POLICY_DOMAIN_LIMIT` de maior prioridade). */
export function policyDomains(category: CategoryDefinition): string[] {
  return category.domains.slice(0, POLICY_DOMAIN_LIMIT);
}

// MARK: - Índice por sufixo (vigia a cada 1,5 s)

const INDEX = new Map<string, Set<string>>(PREDEFINED_CATEGORIES.map((c) => [c.id, new Set(c.domains)]));

/**
 * A primeira categoria entre `enabledIds` que bloqueia o host (domínio exato ou subdomínio).
 * Busca por sufixo em `Set`: custo proporcional ao número de rótulos, não ao tamanho da lista.
 */
export function findCategoryForHost(host: string, enabledIds: readonly string[]): CategoryDefinition | undefined {
  let h = domainToASCII(host.trim().toLowerCase().replace(/^www\./, ''));
  while (h) {
    for (const id of enabledIds) {
      if (INDEX.get(id)?.has(h)) return PREDEFINED_CATEGORIES.find((c) => c.id === id);
    }
    const dot = h.indexOf('.');
    h = dot < 0 ? '' : h.slice(dot + 1);
  }
  return undefined;
}
