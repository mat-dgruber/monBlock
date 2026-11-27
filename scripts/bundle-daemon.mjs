// Bundle CJS único do monblockd para o Node SEA (o SEA não carrega ESM multi-arquivo).
// `import.meta.url` vira constante: o guard de "arquivo principal" do entry fica falso e quem chama main() é o stdin abaixo.
// Uso: node scripts/bundle-daemon.mjs <saida.cjs>   (pela API, sem o quoting frágil do --define no PowerShell 5.1)
import { build } from 'esbuild';

const outfile = process.argv[2];
if (!outfile) {
  console.error('uso: node scripts/bundle-daemon.mjs <saida.cjs>');
  process.exit(2);
}
await build({
  stdin: {
    contents:
      "import { main } from './src/daemon/entry.ts'; main().catch((e) => { console.error('[monblockd]', e?.message); process.exit(1); });",
    sourcefile: 'sea-entry.ts',
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  // No Windows, `file:///monblockd-sea` não é absoluto e o fileURLToPath do guard lança no boot.
  define: { 'import.meta.url': JSON.stringify(process.platform === 'win32' ? 'file:///C:/monblockd-sea' : 'file:///monblockd-sea') },
  outfile,
  logLevel: 'warning',
});
