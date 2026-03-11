import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { generateApiKey, hashApiKey } from '../auth.js';
import { insertApiKey, listApiKeysByTenant, deleteApiKey } from '../db/index.js';

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
 * API key management routes.
 * - Internal endpoint for platform provisioning (protected by ASH_INTERNAL_SECRET)
 * - Public endpoints for dashboard API key management (protected by normal auth)
 */
export function apiKeyRoutes(app: FastifyInstance): void {
  // Internal: platform provisioning
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

  // Public: list API keys for current tenant (key hash hidden)
  app.get('/api/api-keys', async (req, reply) => {
    const tenantId = (req as any).tenantId || 'default';
    const keys = await listApiKeysByTenant(tenantId);
    return reply.send({
      keys: keys.map((k) => ({
        id: k.id,
        label: k.label,
        keyPrefix: k.keyHash?.slice(0, 12) ? '••••••••' : undefined,
        createdAt: k.createdAt,
      })),
    });
  });

  // Public: create a new API key
  app.post('/api/api-keys', async (req, reply) => {
    const tenantId = (req as any).tenantId || 'default';
    const { label } = (req.body || {}) as { label?: string };

    const plainKey = generateApiKey();
    const hmacSecret = process.env.ASH_CREDENTIAL_KEY;
    const keyHash = hashApiKey(plainKey, hmacSecret);
    const id = randomUUID();

    const record = await insertApiKey(id, tenantId, keyHash, label || 'dashboard-key');
    return reply.status(201).send({ id: record.id, key: plainKey });
  });

  // Public: revoke an API key
  app.delete('/api/api-keys/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const deleted = await deleteApiKey(id);
    if (!deleted) {
      return reply.status(404).send({ error: 'API key not found' });
    }
    return reply.status(204).send();
  });
}
