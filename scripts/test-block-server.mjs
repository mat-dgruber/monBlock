import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESIGN_DIR = path.resolve(__dirname, '../docs/design');
const PORT = Number(process.env.PORT || 49152);

function sendProblemDetails(res, status, title, detail, instance) {
  res.writeHead(status, {
    'Content-Type': 'application/problem+json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  });
  res.end(
    JSON.stringify({
      type: `https://monblock.ccat.local/problems/${status}`,
      title,
      status,
      detail,
      instance,
    })
  );
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);

  if (url.pathname === '/tokens.css') {
    const css = fs.readFileSync(path.join(DESIGN_DIR, 'tokens.css'));
    res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
    return res.end(css);
  }

  if (url.pathname === '/' || url.pathname === '/blocked') {
    const html = fs.readFileSync(path.join(DESIGN_DIR, 'blocked-page.html'));
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    });
    return res.end(html);
  }

  if (url.pathname === '/showcase') {
    const html = fs.readFileSync(path.join(DESIGN_DIR, 'tokens-showcase.html'));
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    });
    return res.end(html);
  }

  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(
      JSON.stringify({
        status: 'ok',
        service: 'monblock-preview-server',
        routes: ['/blocked', '/showcase', '/api/health'],
      })
    );
  }

  return sendProblemDetails(
    res,
    404,
    'Rota não encontrada',
    `A rota ${url.pathname} não existe. Acesse /blocked ou /showcase.`,
    url.pathname
  );
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`monBlock test server running at http://127.0.0.1:${PORT}/blocked`);
});
