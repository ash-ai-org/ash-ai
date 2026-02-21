import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { insertCredential, getCredential, listCredentials, deleteCredentialById } from '../db/index.js';
import { encrypt, decrypt } from '../crypto.js';

const MASTER_KEY = process.env.ASH_CREDENTIAL_KEY;

export function credentialRoutes(app: FastifyInstance): void {
  // Store a new credential
  app.post('/api/credentials', {
    schema: {
      tags: ['credentials'],
      body: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['anthropic', 'openai', 'custom'] },
          key: { type: 'string', minLength: 1 },
          label: { type: 'string' },
        },
        required: ['type', 'key'],
      },
      response: {
        201: {
          type: 'object',
          properties: {
            credential: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                type: { type: 'string' },
                label: { type: 'string' },
                active: { type: 'boolean' },
                createdAt: { type: 'string' },
              },
            },
          },
        },
        400: { $ref: 'ApiError#' },
        500: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    if (!MASTER_KEY) {
      return reply.status(500).send({ error: 'Credential storage not configured (ASH_CREDENTIAL_KEY not set)', statusCode: 500 });
    }

    const { type, key, label } = req.body as { type: string; key: string; label?: string };
    const id = randomUUID();
    const { encrypted, iv, authTag } = encrypt(key, MASTER_KEY);

    const credential = await insertCredential(id, req.tenantId, type, encrypted, iv, authTag, label ?? '');
    return reply.status(201).send({ credential });
  });

  // List credentials (no plaintext returned)
  app.get('/api/credentials', {
    schema: {
      tags: ['credentials'],
      response: {
        200: {
          type: 'object',
          properties: {
            credentials: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  type: { type: 'string' },
                  label: { type: 'string' },
                  active: { type: 'boolean' },
                  createdAt: { type: 'string' },
                  lastUsedAt: { type: ['string', 'null'] },
                },
              },
            },
          },
        },
      },
    },
  }, async (req, reply) => {
    const creds = await listCredentials(req.tenantId);
    return reply.send({ credentials: creds });
  });

  // Delete credential
  app.delete<{ Params: { id: string } }>('/api/credentials/:id', {
    schema: {
      tags: ['credentials'],
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
      response: {
        204: { type: 'null' },
        404: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const cred = await getCredential(req.params.id);
    if (!cred || cred.tenantId !== req.tenantId) {
      return reply.status(404).send({ error: 'Credential not found', statusCode: 404 });
    }
    await deleteCredentialById(req.params.id);
    return reply.status(204).send();
  });
}

/**
 * Decrypt a credential by ID. Returns the plaintext key or null.
 * Used internally by session creation to inject credentials into sandbox env.
 */
export async function decryptCredential(credentialId: string, tenantId: string): Promise<{ type: string; key: string } | null> {
  if (!MASTER_KEY) return null;

  const cred = await getCredential(credentialId);
  if (!cred || cred.tenantId !== tenantId || !cred.active) return null;

  try {
    const key = decrypt(cred.encryptedKey, cred.iv, cred.authTag, MASTER_KEY);
    return { type: cred.type, key };
  } catch {
    return null;
  }
}
