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
    durationMinutes?: number;
    permanent?: boolean;
    ruleLabel?: string;
    title?: string;
  }) => Promise<Record<string, unknown>>;
  /** Estado de um pedido já criado (a página consulta a cada poucos segundos). `null` = não existe. */
  getUnblockRequest?: (requestId: string) => Promise<Record<string, unknown> | null>;
}

/** Recusa do handler de pedido (limites, sem Ajudante…): vira Problem Details com o status certo. */
export class UnblockRequestError extends Error {
  constructor(
    readonly status: 400 | 403 | 429 | 502 | 503,
    readonly title: string,
    readonly detail: string
  ) {
    super(detail);
  }
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

  // Token de página por sessão: só a página servida por este processo o conhece. Um site qualquer aberto no
  // navegador pode mandar POST para 127.0.0.1, mas não consegue ler este token (política de mesma origem).
  const pageToken = crypto.randomBytes(24).toString('base64url');
  const tokenOk = (req: http.IncomingMessage): boolean => {
    const given = Buffer.from(String(req.headers['x-monblock-token'] ?? ''), 'utf8');
    const wanted = Buffer.from(pageToken, 'utf8');
    return given.length === wanted.length && crypto.timingSafeEqual(given, wanted);
  };
  // Host precisa ser o loopback: bloqueia DNS rebinding (nome externo apontando para 127.0.0.1).
  const hostOk = (req: http.IncomingMessage): boolean => /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(String(req.headers.host ?? ''));

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    const isApi = url.pathname.startsWith('/api/') && url.pathname !== '/api/health';
    if (isApi && (!hostOk(req) || !tokenOk(req))) {
      req.resume();
      return sendProblemDetails(
        res,
        403,
        'Acesso negado',
        'Esta rota só aceita chamadas feitas pela própria página de bloqueio.',
        url.pathname
      );
    }

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
        const html = fs.readFileSync(htmlPath, 'utf8').replace('</head>', `<meta name="monblock-token" content="${pageToken}" />\n</head>`);
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

          // Sem entrega real ao Ajudante (nenhum handler ligado), a resposta é honesta: nada foi enviado.
          if (!options?.onUnblockRequest) {
            return sendProblemDetails(
              res,
              503,
              'Pedido não enviado',
              'Ainda não há um Ajudante pareado para receber o pedido. Nada foi enviado.',
              url.pathname
            );
          }
          const record: Record<string, unknown> = await options.onUnblockRequest({
            domain: typeof payload.domain === 'string' ? payload.domain : undefined,
            challengeCode:
              typeof payload.challengeCode === 'string' ? payload.challengeCode : undefined,
            reason: typeof payload.reason === 'string' ? payload.reason : undefined,
            durationMinutes:
              typeof payload.durationMinutes === 'number' ? payload.durationMinutes : undefined,
            permanent: payload.permanent === true ? true : undefined,
            ruleLabel: typeof payload.ruleLabel === 'string' ? payload.ruleLabel.slice(0, 120) : undefined,
            title: typeof payload.title === 'string' ? payload.title.slice(0, 120) : undefined,
          });

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
        } catch (err) {
          if (err instanceof UnblockRequestError) {
            return sendProblemDetails(res, err.status, err.title, err.detail, url.pathname);
          }
          // Falha do handler não pode virar unhandled rejection nem deixar a requisição pendurada.
          return sendProblemDetails(
            res,
            502,
            'Falha ao registrar pedido de desbloqueio',
            'O pedido não pôde ser processado agora. Tente novamente.',
            url.pathname
          );
        } finally {
          if (idempotencyKey) {
            inFlightKeys.delete(idempotencyKey);
          }
        }
      });
      return;
    }

    // Estado de um pedido (a página consulta até a resposta do Ajudante).
    const statusMatch = /^\/api\/unblock-requests\/([A-Za-z0-9_-]{4,64})$/.exec(url.pathname);
    if (req.method === 'GET' && statusMatch) {
      if (!options?.getUnblockRequest) {
        return sendProblemDetails(res, 404, 'Pedido não encontrado', 'Não há pedidos nesta versão.', url.pathname);
      }
      options
        .getUnblockRequest(statusMatch[1]!)
        .then((record) => {
          if (!record) return sendProblemDetails(res, 404, 'Pedido não encontrado', 'Esse pedido não existe ou já foi limpo.', url.pathname);
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
          });
          return res.end(JSON.stringify(record));
        })
        .catch(() => sendProblemDetails(res, 502, 'Falha ao consultar o pedido', 'Tente novamente em instantes.', url.pathname));
      return;
    }

    // Validar código: a verificação acontece no app (IPC do daemon). Por HTTP local qualquer página poderia
    // tentar liberar bloqueios, então esta rota nunca libera nada e orienta o uso do app.
    if (req.method === 'POST' && url.pathname === '/api/unlock-code') {
      req.resume();
      return sendProblemDetails(
        res,
        501,
        'Validação feita no app',
        'Cole o código no app monBlock, em Ajudante e recuperação: é lá que ele é validado. Nada foi liberado por esta página.',
        url.pathname
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

  server.requestTimeout = 5000;
  server.headersTimeout = 3000;
  return server;
}

