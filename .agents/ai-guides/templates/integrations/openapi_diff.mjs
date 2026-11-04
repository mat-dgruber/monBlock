// Fonte canônica: templates/integrations/openapi_diff.mjs (guia-scalar-openapi-dx.md §8) — instalado por SCALAR-04
// Uso: node openapi_diff.mjs <spec-base.json> <spec-proposta.json>  → exit 1 se houver breaking changes.
import { diffOpenApi, formatDiffMarkdown } from '@scalar/openapi-diff';
import { readFileSync } from 'node:fs';

const [base, proposta] = process.argv.slice(2);
const diff = diffOpenApi(JSON.parse(readFileSync(base, 'utf-8')), JSON.parse(readFileSync(proposta, 'utf-8')));
console.log(`Recomendação SemVer: ${diff.recommendedBump.toUpperCase()}`);
if (diff.breaking.length > 0) {
  console.error('Breaking changes detectadas no contrato da API!');
  console.log(formatDiffMarkdown(diff));
  process.exit(1);
}
