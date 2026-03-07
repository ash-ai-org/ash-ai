import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { generateApiKey, hashApiKey } from '../auth.js';
import { insertApiKey } from '../db/index.js';

const internalSecret = process.env.ASH_INTERNAL_SECRET;

function validateInternalAuth(req: FastifyRequest, reply: FastifyReply): boolean {
  if (!internalSecret) {
    if (process.env.NODE_ENV === 'production') {
      reply.status(503).send({ error: 'Internal endpoints disabled — ASH_INTERNAL_SECRET is required in production' });
      return false;
    }
    return true;
  }
  const auth = req.headers.authorization;
  if (!auth) {
    reply.status(401).send({ error: 'Unauthorized — invalid or missing internal secret' });
    return false;
  }
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (provided.length === 0) {
    reply.status(401).send({ error: 'Unauthorized — invalid or missing internal secret' });
    return false;
  }
  const expected = Buffer.from(internalSecret);
  const actual = Buffer.from(provided);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    reply.status(401).send({ error: 'Unauthorized — invalid or missing internal secret' });
    return false;
  }
  return true;
}

/**
 * Internal endpoint for provisioning per-tenant API keys.
 * Called by the platform to lazily create Ash API keys for each tenant.
 * Protected by ASH_INTERNAL_SECRET when set.
 */
export function apiKeyRoutes(app: FastifyInstance): void {
  app.post('/api/internal/api-keys', async (req, reply) => {
    if (!validateInternalAuth(req, reply)) return;

    const { tenantId, label } = req.body as { tenantId: string; label?: string };
    if (!tenantId || typeof tenantId !== 'string') {
      return reply.status(400).send({ error: 'Missing required field: tenantId' });
    }

    const plainKey = generateApiKey();
    const hmacSecret = process.env.ASH_CREDENTIAL_KEY;
    const keyHash = hashApiKey(plainKey, hmacSecret);
    const id = randomUUID();

    const record = await insertApiKey(id, tenantId, keyHash, label || `platform-${tenantId}`);

    return reply.send({ id: record.id, key: plainKey, tenantId: record.tenantId });
  });
}
