import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESIGN_DIR = path.resolve(__dirname, '../docs/design');
const PORT = Number(process.env.PORT || 49152);

// MARK: - Respostas RFC 9457 Problem Details

/**
 * Envia uma resposta de erro padronizada segundo a RFC 9457 (Problem Details for HTTP APIs).
 */
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

// MARK: - Servidor HTTP Local do monBlock

/**
 * Cria uma instância do servidor HTTP local do monBlock (`127.0.0.1:49152`),
 * servindo a tela de bloqueio (`/blocked`), showcase de tokens (`/showcase`),
 * folha de estilos (`/tokens.css`), healthcheck (`/api/health`), submissão
 * idempotente de pedidos ao Ajudante (`POST /api/unblock-requests`) e fallback
 * `404` no formato `RFC 9457 Problem Details`.
 */
export function createMonBlockHttpServer() {
  // ponytail: in-memory Map para deduplicação de Idempotency-Key por instância do servidor
  const idempotencyStore = new Map();

  return http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);

    if (req.method === 'GET' && url.pathname === '/tokens.css') {
      const css = fs.readFileSync(path.join(DESIGN_DIR, 'tokens.css'));
      res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
      return res.end(css);
    }

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/blocked')) {
      const html = fs.readFileSync(path.join(DESIGN_DIR, 'blocked-page.html'));
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
      });
      return res.end(html);
    }

    if (req.method === 'GET' && url.pathname === '/showcase') {
      const html = fs.readFileSync(path.join(DESIGN_DIR, 'tokens-showcase.html'));
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
      });
      return res.end(html);
    }

    if (req.method === 'GET' && url.pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(
        JSON.stringify({
          status: 'ok',
          service: 'monblock-preview-server',
          routes: ['/blocked', '/showcase', '/api/health', '/api/unblock-requests'],
        })
      );
    }

    if (req.method === 'POST' && url.pathname === '/api/unblock-requests') {
      const idempotencyKey = String(req.headers['idempotency-key'] || '').trim();
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        if (idempotencyKey && idempotencyStore.has(idempotencyKey)) {
          const cached = idempotencyStore.get(idempotencyKey);
          res.writeHead(202, {
            'Content-Type': 'application/json; charset=utf-8',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
          });
          return res.end(JSON.stringify({ ...cached, deduplicated: true }));
        }

        let payload = {};
        const rawBody = Buffer.concat(chunks).toString('utf8').trim();
        if (rawBody) {
          try {
            payload = JSON.parse(rawBody);
          } catch {
            return sendProblemDetails(
              res,
              400,
              'Payload JSON inválido',
              'O corpo da requisição não pôde ser interpretado como JSON válido.',
              url.pathname
            );
          }
        }

        const record = {
          status: 'accepted',
          requestId: `req_${crypto.randomBytes(6).toString('hex')}`,
          domain: typeof payload.domain === 'string' ? payload.domain : null,
          deduplicated: false,
        };

        if (idempotencyKey) {
          idempotencyStore.set(idempotencyKey, record);
        }

        res.writeHead(202, {
          'Content-Type': 'application/json; charset=utf-8',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
        });
        return res.end(JSON.stringify(record));
      });
      return;
    }

    return sendProblemDetails(
      res,
      404,
      'Rota não encontrada',
      `A rota ${url.pathname} não existe. Acesse /blocked ou /showcase.`,
      url.pathname
    );
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createMonBlockHttpServer();
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`monBlock test server running at http://127.0.0.1:${PORT}/blocked`);
  });
}
