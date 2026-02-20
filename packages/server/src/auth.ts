import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Db } from './db/index.js';

/**
 * Extend Fastify request with tenantId.
 * After auth runs, every request has a tenantId attached (defaults to 'default').
 */
declare module 'fastify' {
  interface FastifyRequest {
    tenantId: string;
  }
}

/** SHA-256 hash of an API key — used to look up keys without storing the raw value. */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Multi-tenant authentication hook.
 *
 * Resolution order:
 * 1. Public endpoints (/health, /docs) → skip auth, tenantId = 'default'
 * 2. Internal endpoints (/api/internal/) → skip auth, tenantId = 'default'
 * 3. Bearer token → hash → look up in api_keys table → set tenantId from DB row
 * 4. Bearer token matches ASH_API_KEY env → tenantId = 'default' (backward compat)
 * 5. No auth header + no ASH_API_KEY set → tenantId = 'default' (local dev mode)
 * 6. No match → 401
 */
export function registerAuth(app: FastifyInstance, apiKey: string | undefined, db?: Db): void {
  // Decorate request with tenantId so it's always available
  app.decorateRequest('tenantId', 'default');

  app.addHook('onRequest', async (request: FastifyRequest, reply) => {
    // Public endpoints — no auth required
    if (request.url === '/health' || request.url.startsWith('/docs')) {
      request.tenantId = 'default';
      return;
    }

    // Internal endpoints (runner registration, etc.) — no auth required
    if (request.url.startsWith('/api/internal/')) {
      request.tenantId = 'default';
      return;
    }

    const header = request.headers.authorization;

    // No auth header
    if (!header) {
      if (!apiKey) {
        // Dev mode: no ASH_API_KEY set, no auth required
        request.tenantId = 'default';
        return;
      }
      return reply.status(401).send({ error: 'Missing Authorization header', statusCode: 401 });
    }

    // Parse "Bearer <key>"
    const parts = header.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return reply.status(401).send({ error: 'Invalid Authorization header format', statusCode: 401 });
    }
    const bearerKey = parts[1];

    // Try api_keys table first (multi-tenant path)
    if (db) {
      const keyHash = hashApiKey(bearerKey);
      const apiKeyRecord = await db.getApiKeyByHash(keyHash);
      if (apiKeyRecord) {
        request.tenantId = apiKeyRecord.tenantId;
        return;
      }
    }

    // Fallback: check against ASH_API_KEY env (single-tenant backward compat)
    if (apiKey && bearerKey === apiKey) {
      request.tenantId = 'default';
      return;
    }

    return reply.status(401).send({ error: 'Invalid API key', statusCode: 401 });
  });

  if (!apiKey && !db) {
    app.log.info('ASH_API_KEY not set — auth disabled (local dev mode), all requests use tenant "default"');
  } else {
    app.log.info('API key authentication enabled (multi-tenant support active)');
  }
}
