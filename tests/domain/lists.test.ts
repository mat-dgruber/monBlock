import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  HOSTS_MAX_DOMAINS,
  POLICY_DOMAIN_LIMIT,
  PREDEFINED_CATEGORIES,
  findCategoryForHost,
  policyDomains,
} from '../../src/domain/categories.js';
import { evaluateUrlAndTitle } from '../../src/domain/rule-engine.js';
import { CRITICAL_INFRA_ALLOWLIST, buildManagedHostsContent } from '../../src/enforcers/hosts-enforcer.js';
import { generateBrowserMobileconfig } from '../../src/enforcers/platform-enforcer.js';

const HOST = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const EXCLUSIONS = fs.readFileSync('src/domain/lists/exclusions.txt', 'utf8')
  .split('\n').map((l) => l.replace(/#.*/, '').trim()).filter(Boolean);
const isExcluded = (d: string): boolean =>
  [...EXCLUSIONS, ...CRITICAL_INFRA_ALLOWLIST].some((e) => d === e || d.endsWith(`.${e}`));
const allEnabled = PREDEFINED_CATEGORIES.map((c) => c.id);
const pairs = (file: string): Array<[string, string]> =>
  fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => { const [u, t] = l.split('\t'); return [u, t ?? ''] as [string, string]; });

describe('listas: normalização e unicidade (a)', () => {
  for (const cat of PREDEFINED_CATEGORIES) {
    it(`${cat.id}: domínios válidos, minúsculos, sem www. e sem duplicata`, () => {
      expect(cat.domains.length).toBeGreaterThan(0);
      for (const d of cat.domains) {
        expect(d, d).toMatch(HOST);
        expect(d.startsWith('www.'), d).toBe(false);
      }
      expect(new Set(cat.domains).size).toBe(cat.domains.length);
    });
    it(`${cat.id}: palavras-chave minúsculas, termo isolado com 3+ letras e sem duplicata`, () => {
      for (const k of cat.keywords) {
        expect(k, k).toBe(k.toLowerCase());
        for (const t of k.split(',')) expect(t.trim().length, k).toBeGreaterThanOrEqual(k.includes(',') ? 2 : 3);
      }
      expect(new Set(cat.keywords).size).toBe(cat.keywords.length);
    });
  }
  it('lists.generated.ts está em sincronia com lists/*.txt', () => {
    expect(() => execFileSync('node', ['scripts/gen-lists.mjs', '--check'], { stdio: 'pipe' })).not.toThrow();
  });
});

describe('listas: infraestrutura crítica (b)', () => {
  it('nenhuma categoria contém domínio da allowlist crítica ou das exclusões', () => {
    for (const cat of PREDEFINED_CATEGORIES) {
      for (const d of cat.domains) expect(isExcluded(d), `${cat.id}:${d}`).toBe(false);
    }
  });
  it('o hosts nunca grava infra crítica mesmo que a lista tivesse', () => {
    const { content } = buildManagedHostsContent('', ['api.telegram.org', 'pornhub.com']);
    expect(content).not.toContain('api.telegram.org');
    expect(content).toContain('0.0.0.0 pornhub.com');
  });
});

describe('listas: casamento de domínio por sufixo', () => {
  it('bloqueia o apex e subdomínios, só em categoria ativa', () => {
    const d = PREDEFINED_CATEGORIES.find((c) => c.id === 'adult')!.domains[0];
    expect(findCategoryForHost(d, ['adult'])?.id).toBe('adult');
    expect(findCategoryForHost(`a.b.${d}`, ['adult'])?.id).toBe('adult');
    expect(findCategoryForHost(`www.${d}`, ['adult'])?.id).toBe('adult');
    expect(findCategoryForHost(d, ['gambling'])).toBeUndefined();
    expect(findCategoryForHost(`x${d}`, ['adult'])).toBeUndefined();
  });
  it('conhece os sites-âncora de cada categoria padrão', () => {
    const anchors: Record<string, string> = {
      adult: 'pornhub.com', gambling: 'bet365.com', games: 'roblox.com', proxy: 'croxyproxy.com',
      dating: 'tinder.com', social: 'instagram.com', video: 'netflix.com', forums: 'reddit.com',
      shopping: 'shopee.com.br', news: 'tmz.com', search_unsafe: 'yandex.com',
    };
    for (const [id, d] of Object.entries(anchors)) expect(findCategoryForHost(d, [id])?.id, `${id}:${d}`).toBe(id);
  });
});

describe('listas: falsos positivos e alvos nas palavras-chave (c)', () => {
  const state = { enabledCategories: allEnabled, blockedDomains: [], allowlistDomains: [], keywords: [], lockIncognito: false };
  const safe = pairs('tests/domain/fixtures/frases-legitimas.tsv');
  const targets = pairs('tests/domain/fixtures/frases-alvo.tsv');
  it('as suítes de frases existem e têm tamanho útil', () => {
    expect(safe.length).toBeGreaterThanOrEqual(60);
    expect(targets.length).toBeGreaterThanOrEqual(30);
  });
  it('nenhuma frase legítima pt-BR é bloqueada por palavra-chave', () => {
    for (const [url, title] of safe) {
      const r = evaluateUrlAndTitle({ url, title, state });
      // Sites reais das listas (ex.: g1) são bloqueados por domínio quando a categoria está ativa; aqui só importa a palavra-chave.
      expect(r.reason === 'KEYWORD', `${url} | ${title} -> ${r.ruleLabel}`).toBe(false);
    }
  });
  it('as frases-alvo são bloqueadas', () => {
    for (const [url, title] of targets) {
      expect(evaluateUrlAndTitle({ url, title, state }).blocked, `${url} | ${title}`).toBe(true);
    }
  });
});

describe('listas: desempenho (d) e limites por camada', () => {
  it('o hosts com o catálogo inteiro monta em < 250 ms e respeita o teto', () => {
    const all = PREDEFINED_CATEGORIES.flatMap((c) => c.domains).slice(0, HOSTS_MAX_DOMAINS);
    const t = performance.now();
    const { content, writtenCount } = buildManagedHostsContent('127.0.0.1 localhost\n', all);
    expect(performance.now() - t).toBeLessThan(250);
    expect(writtenCount).toBeLessThanOrEqual(HOSTS_MAX_DOMAINS);
    expect(content.length).toBeLessThan(5_000_000);
  });
  it('1000 avaliações de aba com todas as categorias ativas < 1,5 s', () => {
    const state = { enabledCategories: allEnabled, blockedDomains: [], allowlistDomains: [], keywords: [], lockIncognito: false };
    const t = performance.now();
    for (let i = 0; i < 1000; i++) {
      evaluateUrlAndTitle({ url: `https://exemplo${i}.com.br/receita-de-bolo?q=${i}`, title: 'Receita de bolo de cenoura com cobertura', state });
    }
    expect(performance.now() - t).toBeLessThan(1500);
  });
  it('o perfil dos navegadores leva no máximo 900 domínios do adult e < 1 MB', () => {
    const adult = PREDEFINED_CATEGORIES.find((c) => c.id === 'adult')!;
    expect(policyDomains(adult).length).toBeLessThanOrEqual(POLICY_DOMAIN_LIMIT);
    const profile = generateBrowserMobileconfig({ blockedDomains: policyDomains(adult), allowlistDomains: [], lockIncognito: true });
    expect(profile.length).toBeLessThan(1_000_000);
  });
});

describe('listas: fonte única para a UI (e)', () => {
  it('renderer-init.js não carrega listas literais nem CATEGORIES_DATA', () => {
    const js = fs.readFileSync('src/renderer/renderer-init.js', 'utf8');
    expect(js).not.toContain('CATEGORIES_DATA');
    expect(js).not.toContain('pornhub.com');
  });
  it('o catálogo tem as 11 categorias esperadas', () => {
    expect(allEnabled).toEqual(['adult', 'gambling', 'games', 'proxy', 'dating', 'social', 'video', 'forums', 'shopping', 'news', 'search_unsafe']);
  });
});
