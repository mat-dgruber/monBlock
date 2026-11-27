// Copia os arquivos estáticos do renderer e do preload para dist/. Em Node para rodar igual no cmd, sh e pwsh.
import fs from 'node:fs';
import path from 'node:path';

const ASSETS = [
  ['src/renderer/index.html', 'dist/renderer/index.html'],
  ['src/renderer/renderer.css', 'dist/renderer/renderer.css'],
  ['src/renderer/renderer-init.js', 'dist/renderer/renderer-init.js'],
  ['src/preload/preload-bridge.cjs', 'dist/preload/preload-bridge.cjs'],
];

for (const [from, to] of ASSETS) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to);
}
