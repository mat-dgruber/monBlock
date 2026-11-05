/**
 * @file block-server.ts
 * @description Servidor HTTP Local do monBlock (127.0.0.1:49152).
 *
 * Responsável por:
 * 1. Servir a página educacional de bloqueio (/blocked e /) com cabeçalhos CSP estritos.
 * 2. Disponibilizar os design tokens CSS (/tokens.css) e o catálogo visual (/showcase).
 * 3. Prover probe de saúde (/api/health) e endpoint de solicitação de desbloqueio com
 *    garantia de idempotência atômica (/api/unblock-requests).
 * 4. Retornar erros padronizados no formato RFC 9457 (Problem Details for HTTP APIs).
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_DESIGN_DIR = path.resolve(__dirname, '../../docs/design');
const DEFAULT_PORT = Number(process.env.MONBLOCK_HTTP_PORT || 49152);

export interface MonBlockHttpServerOptions {
  port?: number;
  designDir?: string;
  onUnblockRequest?: (payload: {
    domain?: string;
    challengeCode?: string;
    reason?: string;
  }) => Promise<{ status: string; requestId: string; domain: string | null }>;
}

export interface ProblemDetailsPayload {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
}

// MARK: - Respostas RFC 9457 Problem Details

/**
 * Envia uma resposta de erro padronizada segundo a RFC 9457 (Problem Details for HTTP APIs).
 */
export function sendProblemDetails(
  res: http.ServerResponse,
  status: number,
  title: string,
  detail: string,
  instance: string
): void {
  res.writeHead(status, {
    'Content-Type': 'application/problem+json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  });
  const body: ProblemDetailsPayload = {
    type: `https://monblock.ccat.local/problems/${status}`,
    title,
    status,
    detail,
    instance,
  };
  res.end(JSON.stringify(body));
}

// MARK: - Factory do Servidor HTTP Local

/**
 * Cria uma instância do servidor HTTP local do monBlock (`127.0.0.1:49152`),
 * servindo a tela de bloqueio (`/blocked`), showcase de tokens (`/showcase`),
 * folha de estilos (`/tokens.css`), healthcheck (`/api/health`), submissão
 * idempotente de pedidos ao Ajudante (`POST /api/unblock-requests`) e fallback
 * `404` no formato `RFC 9457 Problem Details`.
 */
export function createMonBlockHttpServer(options?: MonBlockHttpServerOptions): http.Server {
  const port = options?.port ?? DEFAULT_PORT;
  const designDir = options?.designDir ?? DEFAULT_DESIGN_DIR;

  // Cache em memória limitado a 1.000 chaves para deduplicação atômica por Idempotency-Key
  const idempotencyStore = new Map<string, Record<string, unknown>>();
  const inFlightKeys = new Set<string>();
  const MAX_IDEMPOTENCY_ENTRIES = 1000;
  const MAX_BODY_BYTES = 16 * 1024;
  const HTML_CSP =
    "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:";

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);

    if (req.method === 'GET' && url.pathname === '/tokens.css') {
      try {
        const cssPath = path.join(designDir, 'tokens.css');
        if (!fs.existsSync(cssPath)) throw new Error('Arquivo não encontrado');
        const css = fs.readFileSync(cssPath);
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
        const htmlPath = path.join(designDir, 'blocked-page.html');
        if (!fs.existsSync(htmlPath)) throw new Error('Arquivo não encontrado');
        const html = fs.readFileSync(htmlPath);
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
        const htmlPath = path.join(designDir, 'tokens-showcase.html');
        if (!fs.existsSync(htmlPath)) throw new Error('Arquivo não encontrado');
        const html = fs.readFileSync(htmlPath);
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
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      let aborted = false;

      req.on('data', (chunk: Buffer) => {
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

      req.on('end', async () => {
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
          let payload: Record<string, unknown> = {};
          const rawBody = Buffer.concat(chunks).toString('utf8').trim();
          if (rawBody) {
            try {
              payload = JSON.parse(rawBody) as Record<string, unknown>;
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

          let record: Record<string, unknown>;
          if (options?.onUnblockRequest) {
            record = await options.onUnblockRequest({
              domain: typeof payload.domain === 'string' ? payload.domain : undefined,
              challengeCode:
                typeof payload.challengeCode === 'string' ? payload.challengeCode : undefined,
              reason: typeof payload.reason === 'string' ? payload.reason : undefined,
            });
          } else {
            record = {
              status: 'accepted',
              requestId: `req_${crypto.randomBytes(6).toString('hex')}`,
              domain: typeof payload.domain === 'string' ? payload.domain : null,
              deduplicated: false,
            };
          }

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
