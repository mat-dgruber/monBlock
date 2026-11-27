// P7: compara 3 formas de abrir a página de bloqueio e grava a URL que chegou de fato ao servidor local.
// Roda como main do Electron: `npx electron spikes/windows/redirect/open-url.cjs <outFile>`.
const fs = require('node:fs');
const http = require('node:http');
const { execFile } = require('node:child_process');
const { app, shell } = require('electron');

const outFile = process.argv[process.argv.length - 1];
const QUERY = '?domain=a.com&reason=CATEGORY&rule=Categoria%3A%20Adulto,x';
const received = {};
const server = http.createServer((req, res) => {
  const m = req.url.match(/^\/m\/(\w+)/);
  if (m) received[m[1]] = req.url;
  res.end('ok');
});

const waitFor = (method, ms) =>
  new Promise((resolve) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (received[method] || Date.now() - t0 > ms) {
        clearInterval(iv);
        resolve(received[method] ?? null);
      }
    }, 250);
  });
const run = (file, args) =>
  new Promise((resolve) => execFile(file, args, (err) => resolve({ exitCode: err ? err.code ?? 'error' : 0, error: err?.message })));

app.whenReady().then(async () => {
  await new Promise((r) => server.listen(49999, '127.0.0.1', r));
  const base = 'http://127.0.0.1:49999/m';
  const report = { expectedQuery: QUERY };

  report.openExternal = { call: await shell.openExternal(`${base}/openExternal${QUERY}`).then(() => 'resolved', (e) => e.message) };
  report.openExternal.received = await waitFor('openExternal', 25_000);

  report.explorer = { call: await run('explorer.exe', [`${base}/explorer${QUERY}`]) };
  report.explorer.received = await waitFor('explorer', 25_000);

  const url = `${base}/cmdstart${QUERY}`;
  report.cmdStart = { call: await run('cmd.exe', ['/c', 'start', '""', `"${url}"`]) };
  report.cmdStart.received = await waitFor('cmdstart', 25_000);

  for (const k of ['openExternal', 'explorer', 'cmdStart']) {
    report[k].intact = report[k].received ? report[k].received.endsWith(QUERY) : null;
  }
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  app.exit(0);
});
