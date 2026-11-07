// Monta src/domain/lists/adult.domains.txt (uso offline, a saida e versionada; nao roda no CI).
// Copia SO dominios de blocklistproject/porn (Unlicense). As outras listas (PornAway, Bon-Appetit, Clefspeare13)
// servem de SINAL de ranking: nada delas e copiado. Ordem: seed curado, depois mais sinais primeiro, depois alfabetica.
// Uso: node scripts/curate-adult.mjs <blp-porn.txt> <seed.txt> <sinal1.txt> [sinal2.txt ...]
import fs from 'node:fs';
const [blpFile, seedFile, ...sigFiles] = process.argv.slice(2);
const MIN_SIGNALS = 2;
const rd = (f) => fs.readFileSync(f, 'utf8').split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim().toLowerCase())
  .filter(Boolean).map((l) => l.split(/\s+/).pop().replace(/^www\./, ''))
  .filter((d) => /^[a-z0-9.-]+\.[a-z0-9-]+$/.test(d) && !['localhost', '0.0.0.0'].includes(d));
const excl = fs.readFileSync('src/domain/lists/exclusions.txt', 'utf8').split('\n').map((l) => l.replace(/#.*/, '').trim()).filter(Boolean);
const bad = (d) => excl.some((e) => d === e || d.endsWith(`.${e}`)) || d.length > 60 || /^\d+(\.\d+)+$/.test(d);
const sigs = sigFiles.map((f) => new Set(rd(f)));
const seed = rd(seedFile).filter((d) => !bad(d));
const scored = [...new Set(rd(blpFile))].filter((d) => !bad(d))
  .map((d) => [d, sigs.filter((s) => s.has(d)).length]).filter(([, s]) => s >= MIN_SIGNALS)
  .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([d]) => d);
const all = [...new Set([...seed, ...scored])];
fs.writeFileSync('src/domain/lists/adult.domains.txt',
  `# adult: curadoria monBlock. Seed proprio + blocklistproject/Lists porn (Unlicense), ranqueado por sinais. Ver NOTICE.\n# A ordem e a prioridade: as primeiras 900 linhas vao para o perfil dos navegadores.\n${all.join('\n')}\n`);
console.log('seed', seed.length, 'blp>=sinais', scored.length, 'total', all.length);
