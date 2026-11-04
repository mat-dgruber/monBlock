/**
 * Catálogo canônico das 11 categorias de bloqueio web do monBlock (Fase 1 MVP).
 *
 * A categoria `adult` (Conteúdo Adulto & Pornografia) vem habilitada e trancada
 * por padrão (Catraca Unidirecional Append-Only — ADR-0003).
 */

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
