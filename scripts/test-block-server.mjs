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
  // ponytail: in-memory Map limitada a 1000 chaves para deduplicação de Idempotency-Key por instância do servidor
  const idempotencyStore = new Map();
  const inFlightKeys = new Set();
  const MAX_IDEMPOTENCY_ENTRIES = 1000;
  const MAX_BODY_BYTES = 16 * 1024;
  const HTML_CSP =
    "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:";

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);

    if (req.method === 'GET' && url.pathname === '/tokens.css') {
      try {
        const css = fs.readFileSync(path.join(DESIGN_DIR, 'tokens.css'));
        res.writeHead(200, {
          'Content-Type': 'text/css; charset=utf-8',
          'X-Content-Type-Options': 'nosniff',
        });
        return res.end(css);
      } catch {
        return sendProblemDetails(
          res,
          500,
          'Erro ao carregar tokens CSS',
          'Não foi possível ler o arquivo de estilos estático.',
          url.pathname
        );
      }
    }

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/blocked')) {
      try {
        const html = fs.readFileSync(path.join(DESIGN_DIR, 'blocked-page.html'));
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': HTML_CSP,
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
        });
        return res.end(html);
      } catch {
        return sendProblemDetails(
          res,
          500,
          'Erro ao carregar página de bloqueio',
          'Não foi possível ler o template HTML da página de bloqueio.',
          url.pathname
        );
      }
    }

    if (req.method === 'GET' && url.pathname === '/showcase') {
      try {
        const html = fs.readFileSync(path.join(DESIGN_DIR, 'tokens-showcase.html'));
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': HTML_CSP,
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
        });
        return res.end(html);
      } catch {
        return sendProblemDetails(
          res,
          500,
          'Erro ao carregar showcase',
          'Não foi possível ler o template HTML do showcase.',
          url.pathname
        );
      }
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
      let totalBytes = 0;
      let aborted = false;

      req.on('data', (chunk) => {
        if (aborted) return;
        totalBytes += chunk.length;
        if (totalBytes > MAX_BODY_BYTES) {
          aborted = true;
          sendProblemDetails(
            res,
            413,
            'Payload Too Large',
            `O corpo da requisição excede o limite máximo de ${MAX_BODY_BYTES} bytes (16 KB).`,
            url.pathname
          );
          req.resume();
          return;
        }
        chunks.push(chunk);
      });

      req.on('end', () => {
        if (aborted) return;

        if (idempotencyKey && idempotencyStore.has(idempotencyKey)) {
          const cached = idempotencyStore.get(idempotencyKey);
          res.writeHead(202, {
            'Content-Type': 'application/json; charset=utf-8',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
          });
          return res.end(JSON.stringify({ ...cached, deduplicated: true }));
        }

        if (idempotencyKey && inFlightKeys.has(idempotencyKey)) {
          return sendProblemDetails(
            res,
            409,
            'Requisição concorrente em andamento',
            'Já existe uma requisição com esta Idempotency-Key sendo processada.',
            url.pathname
          );
        }

        if (idempotencyKey) {
          inFlightKeys.add(idempotencyKey);
        }

        try {
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
            if (idempotencyStore.size >= MAX_IDEMPOTENCY_ENTRIES) {
              const oldestKey = idempotencyStore.keys().next().value;
              if (oldestKey !== undefined) {
                idempotencyStore.delete(oldestKey);
              }
            }
            idempotencyStore.set(idempotencyKey, record);
          }

          res.writeHead(202, {
            'Content-Type': 'application/json; charset=utf-8',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
          });
          return res.end(JSON.stringify(record));
        } finally {
          if (idempotencyKey) {
            inFlightKeys.delete(idempotencyKey);
          }
        }
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

  server.requestTimeout = 5000;
  server.headersTimeout = 3000;
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createMonBlockHttpServer();
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`monBlock test server running at http://127.0.0.1:${PORT}/blocked`);
  });
}
