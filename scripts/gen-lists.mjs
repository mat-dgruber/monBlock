// Gera src/domain/lists.generated.ts a partir de src/domain/lists/*.txt (docs: RN-WEB-08).
// Falha o build (exit 1) em linha inválida, duplicata ou domínio excluído. Uso: node scripts/gen-lists.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import { domainToASCII } from 'node:url';

const DIR = 'src/domain/lists';
const OUT = 'src/domain/lists.generated.ts';
const IDS = ['adult', 'gambling', 'games', 'proxy', 'dating', 'social', 'video', 'forums', 'shopping', 'news', 'search_unsafe'];
const HOST = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const errors = [];

const lines = (file) =>
  fs.readFileSync(path.join(DIR, file), 'utf8').replace(/^﻿/, '').split(/\r?\n/)
    .map((raw, i) => ({ text: raw.replace(/#.*$/, '').trim().toLowerCase(), at: `${file}:${i + 1}` }))
    .filter((l) => l.text);

const excluded = lines('exclusions.txt').map((l) => l.text);
const isExcluded = (d) => excluded.some((e) => d === e || d.endsWith(`.${e}`));

const out = {};
const seen = new Map();
for (const id of IDS) {
  const domains = [];
  const set = new Set();
  for (const { text, at } of lines(`${id}.domains.txt`)) {
    const d = domainToASCII(text.replace(/^www\./, ''));
    if (!HOST.test(d)) errors.push(`${at}: dominio invalido "${text}"`);
    else if (isExcluded(d)) errors.push(`${at}: dominio excluido "${d}"`);
    else if (set.has(d)) errors.push(`${at}: duplicata "${d}"`);
    else { set.add(d); domains.push(d); }
  }
  const keywords = [];
  for (const { text, at } of lines(`${id}.keywords.txt`)) {
    const terms = text.split(',').map((t) => t.trim());
    if (terms.some((t) => !t || t.length < (terms.length > 1 ? 2 : 3))) errors.push(`${at}: termo vazio/curto em "${text}"`);
    else keywords.push(terms.join(','));
  }
  out[id] = { domains: domains.join('\n'), keywords: [...new Set(keywords)].join('\n') };
}
if (errors.length) { console.error(errors.slice(0, 50).join('\n') + (errors.length > 50 ? `\n... +${errors.length - 50}` : '')); process.exit(1); }

const src = `// GERADO por scripts/gen-lists.mjs a partir de src/domain/lists/*.txt. Nao edite a mao.\nexport const LISTS: Readonly<Record<string, { domains: string; keywords: string }>> = ${JSON.stringify(out, null, 1)};\n`;
if (process.argv.includes('--check')) {
  if (!fs.existsSync(OUT) || fs.readFileSync(OUT, 'utf8') !== src) { console.error('lists.generated.ts desatualizado: rode node scripts/gen-lists.mjs'); process.exit(1); }
} else fs.writeFileSync(OUT, src);
for (const id of IDS) console.log(id.padEnd(14), String(out[id].domains ? out[id].domains.split('\n').length : 0).padStart(6), 'dominios', String(out[id].keywords ? out[id].keywords.split('\n').length : 0).padStart(4), 'palavras');
