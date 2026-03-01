import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { generateApiKey, hashApiKey } from '../auth.js';
import { insertApiKey } from '../db/index.js';

const internalSecret = process.env.ASH_INTERNAL_SECRET;

function validateInternalAuth(req: FastifyRequest, reply: FastifyReply): boolean {
  if (!internalSecret) return true;
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${internalSecret}`) {
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
