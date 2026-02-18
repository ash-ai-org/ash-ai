import type { FastifyInstance } from 'fastify';

/**
 * API key authentication hook.
 *
 * If ASH_API_KEY is set, all requests (except /health and /docs) must include
 * a matching `Authorization: Bearer <key>` header. If ASH_API_KEY is not set,
 * auth is disabled (local dev mode).
 */
export function registerAuth(app: FastifyInstance, apiKey: string | undefined): void {
  if (!apiKey) {
    app.log.info('ASH_API_KEY not set — auth disabled (local dev mode)');
    return;
  }

  app.addHook('onRequest', async (request, reply) => {
    // Health and docs endpoints are always public
    if (request.url === '/health' || request.url.startsWith('/docs')) {
      return;
    }

    const header = request.headers.authorization;
    if (!header) {
      return reply.status(401).send({ error: 'Missing Authorization header', statusCode: 401 });
    }

    // Expect "Bearer <key>"
    const parts = header.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer' || parts[1] !== apiKey) {
      return reply.status(401).send({ error: 'Invalid API key', statusCode: 401 });
    }
  });

  app.log.info('API key authentication enabled');
}
