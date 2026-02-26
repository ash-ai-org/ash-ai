import { createHash, createHmac, randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Db } from './db/index.js';

/**
 * Generate a prefixed API key with 24 random bytes (base64url).
 * The `ash_` prefix aids identifiability (e.g. GitHub secret scanning, log grep).
 */
export function generateApiKey(): string {
  return `ash_${randomBytes(24).toString('base64url')}`;
}

/**
 * Extend Fastify request with tenantId.
 * After auth runs, every request has a tenantId attached (defaults to 'default').
 */
declare module 'fastify' {
  interface FastifyRequest {
    tenantId: string;
  }
}

/**
 * HMAC-SHA256 hash of an API key using a server-side secret.
 * Prevents rainbow table attacks on stored key hashes.
 * Falls back to plain SHA-256 if no secret is available (local dev mode).
 */
export function hashApiKey(key: string, secret?: string): string {
  if (secret) {
    return createHmac('sha256', secret).update(key).digest('hex');
  }
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
 * 5. No auth header + no ASH_API_KEY set + no DB keys → tenantId = 'default' (first-run, no keys anywhere)
 * 6. No match → 401
 */
export function registerAuth(app: FastifyInstance, apiKey: string | undefined, db?: Db, hasDbKeys?: boolean): void {
  const hmacSecret = process.env.ASH_CREDENTIAL_KEY;

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
      if (!apiKey && !hasDbKeys) {
        // No keys configured anywhere — allow through (first-run before any keys exist)
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
      // Try HMAC hash first (new keys), then fall back to plain SHA-256 (legacy keys)
      const hmacHash = hmacSecret ? hashApiKey(bearerKey, hmacSecret) : null;
      const legacyHash = hashApiKey(bearerKey);

      if (hmacHash) {
        const apiKeyRecord = await db.getApiKeyByHash(hmacHash);
        if (apiKeyRecord) {
          request.tenantId = apiKeyRecord.tenantId;
          return;
        }
      }

      // Fall back to legacy hash for keys created before HMAC migration
      const apiKeyRecord = await db.getApiKeyByHash(legacyHash);
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

  if (!apiKey && !hasDbKeys) {
    app.log.info('No API keys configured — auth disabled, all requests use tenant "default"');
  } else {
    app.log.info('API key authentication enabled');
  }
}
