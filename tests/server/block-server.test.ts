import { describe, it, expect } from 'vitest';
import { createMonBlockHttpServer } from '../../src/server/block-server.js';

describe('Local Block Server, Idempotency & RFC 9457 Problem Details', () => {
  it('serve /blocked, /showcase, /tokens.css, /api/health e retorna application/problem+json em 404', async () => {
    const server = createMonBlockHttpServer();
    expect(server.requestTimeout).toBe(5000);
    expect(server.headersTimeout).toBe(3000);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 49152;

    try {
      const blockedRes = await fetch(`http://127.0.0.1:${port}/blocked?url=https://bet365.com`);
      expect(blockedRes.status).toBe(200);
      expect(blockedRes.headers.get('x-frame-options')).toBe('DENY');
      expect(blockedRes.headers.get('x-content-type-options')).toBe('nosniff');
      expect(blockedRes.headers.get('content-security-policy')).toContain("default-src 'self'");
      const html = await blockedRes.text();
      expect(html).toContain('Por que esta página foi pausada?');

      const showcaseRes = await fetch(`http://127.0.0.1:${port}/showcase`);
      expect(showcaseRes.status).toBe(200);
      expect(showcaseRes.headers.get('content-security-policy')).toContain("default-src 'self'");

      const tokensRes = await fetch(`http://127.0.0.1:${port}/tokens.css`);
      expect(tokensRes.status).toBe(200);
      expect(tokensRes.headers.get('content-type')).toContain('text/css');

      const healthRes = await fetch(`http://127.0.0.1:${port}/api/health`);
      expect(healthRes.status).toBe(200);
      const health = await healthRes.json();
      expect(health.status).toBe('ok');

      const notFoundRes = await fetch(`http://127.0.0.1:${port}/rota-inexistente`);
      expect(notFoundRes.status).toBe(404);
      expect(notFoundRes.headers.get('content-type')).toContain('application/problem+json');
      const problem = await notFoundRes.json();
      expect(problem.status).toBe(404);
      expect(problem.title).toBe('Rota não encontrada');
    } finally {
      server.close();
    }
  });

  it('POST /api/unblock-requests sem Ajudante ligado responde 503 Problem Details (nada foi enviado)', async () => {
    const server = createMonBlockHttpServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 49152;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/unblock-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'k-sem-ajudante' },
        body: JSON.stringify({ domain: 'bet365.com', reason: 'estudo', durationMinutes: 15 }),
      });
      expect(res.status).toBe(503);
      expect(res.headers.get('content-type')).toContain('application/problem+json');
      expect((await res.json()).detail).toContain('Nada foi enviado');
    } finally {
      server.close();
    }
  });

  it('processa POST /api/unblock-requests com 202 Accepted e deduplicação por Idempotency-Key', async () => {
    const server = createMonBlockHttpServer({
      onUnblockRequest: async (p) => ({ status: 'accepted', requestId: `req_${p.domain}`, domain: p.domain ?? null, deduplicated: false } as never),
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 49152;

    try {
      const firstRes = await fetch(`http://127.0.0.1:${port}/api/unblock-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'idem-key-001',
        },
        body: JSON.stringify({ domain: 'bet365.com', reason: 'Revisão técnica' }),
      });
      expect(firstRes.status).toBe(202);
      const firstBody = await firstRes.json();
      expect(firstBody.status).toBe('accepted');
      expect(firstBody.deduplicated).toBe(false);

      const secondRes = await fetch(`http://127.0.0.1:${port}/api/unblock-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'idem-key-001',
        },
        body: JSON.stringify({ domain: 'bet365.com', reason: 'Revisão técnica' }),
      });
      expect(secondRes.status).toBe(202);
      const secondBody = await secondRes.json();
      expect(secondBody.requestId).toBe(firstBody.requestId);
      expect(secondBody.deduplicated).toBe(true);

      const badJsonRes = await fetch(`http://127.0.0.1:${port}/api/unblock-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{invalid-json',
      });
      expect(badJsonRes.status).toBe(400);
      expect(badJsonRes.headers.get('content-type')).toContain('application/problem+json');

      const oversizedBody = JSON.stringify({ domain: 'bet365.com', reason: 'x'.repeat(17 * 1024) });
      const tooLargeRes = await fetch(`http://127.0.0.1:${port}/api/unblock-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: oversizedBody,
      });
      expect(tooLargeRes.status).toBe(413);
      expect(tooLargeRes.headers.get('content-type')).toContain('application/problem+json');
    } finally {
      server.close();
    }
  });
});

describe('POST /api/unlock-code', () => {
  it('nunca libera nada: 501 Problem Details orientando a validar no app', async () => {
    const server = createMonBlockHttpServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 49152;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/unlock-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'UNLOCK-15M-ABCDEF' }),
      });
      expect(res.status).toBe(501);
      expect(res.headers.get('content-type')).toContain('application/problem+json');
      expect((await res.json()).detail).toContain('Nada foi liberado');
    } finally {
      server.close();
    }
  });
});
