import type { FastifyInstance } from 'fastify';
import { join } from 'node:path';
import { existsSync, rmSync } from 'node:fs';
import { getSession } from '../db/index.js';
import { createBundle, extractBundle, hasPersistedState, restoreSessionState } from '@ash-ai/sandbox';
import type { RunnerCoordinator } from '../runner/coordinator.js';

/** Max body size for workspace uploads: ~134MB base64 ≈ 100MB binary. */
const WORKSPACE_BODY_LIMIT = 134 * 1024 * 1024;

export function workspaceRoutes(app: FastifyInstance, coordinator: RunnerCoordinator, dataDir: string): void {
  // Download workspace as tar.gz bundle
  app.get<{ Params: { id: string } }>('/api/sessions/:id/workspace', {
    schema: {
      tags: ['sessions'],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
      response: {
        404: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const session = await getSession(req.params.id);
    if (!session || session.tenantId !== req.tenantId) {
      return reply.status(404).send({ error: 'Session not found', statusCode: 404 });
    }

    // Try live sandbox workspace first
    let workspaceDir: string | null = null;
    let tempDir: string | null = null;
    try {
      const backend = await coordinator.getBackendForRunnerAsync(session.runnerId);
      const sandbox = backend.getSandbox(session.sandboxId);
      if (sandbox) {
        workspaceDir = sandbox.workspaceDir;
      }
    } catch { /* runner may be gone */ }

    // Fall back to persisted snapshot
    if (!workspaceDir || !existsSync(workspaceDir)) {
      const snapshotDir = join(dataDir, 'sessions', session.id, 'workspace');
      if (existsSync(snapshotDir)) {
        workspaceDir = snapshotDir;
      } else if (hasPersistedState(dataDir, session.id, session.tenantId)) {
        tempDir = join(dataDir, 'tmp', `bundle-${session.id}-${Date.now()}`);
        restoreSessionState(dataDir, session.id, tempDir, session.tenantId);
        workspaceDir = tempDir;
      }
    }

    if (!workspaceDir || !existsSync(workspaceDir)) {
      return reply.status(404).send({ error: 'No workspace available for this session', statusCode: 404 });
    }

    try {
      const bundle = createBundle(workspaceDir);
      return reply
        .header('Content-Type', 'application/gzip')
        .header('Content-Disposition', `attachment; filename="${session.id}.tar.gz"`)
        .send(bundle);
    } finally {
      // Clean up temp directory if we created one
      if (tempDir) {
        try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* best effort */ }
      }
    }
  });

  // Upload/restore workspace from tar.gz bundle
  app.post<{ Params: { id: string } }>('/api/sessions/:id/workspace', {
    bodyLimit: WORKSPACE_BODY_LIMIT,
    schema: {
      tags: ['sessions'],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
      body: {
        type: 'object',
        properties: {
          bundle: { type: 'string', description: 'Base64-encoded tar.gz bundle' },
        },
        required: ['bundle'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
        400: { $ref: 'ApiError#' },
        404: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const session = await getSession(req.params.id);
    if (!session || session.tenantId !== req.tenantId) {
      return reply.status(404).send({ error: 'Session not found', statusCode: 404 });
    }

    const { bundle: b64 } = req.body as { bundle: string };
    const bundleBuffer = Buffer.from(b64, 'base64');

    if (bundleBuffer.length === 0) {
      return reply.status(400).send({ error: 'Empty bundle', statusCode: 400 });
    }

    // Extract into live sandbox workspace if available
    try {
      const backend = await coordinator.getBackendForRunnerAsync(session.runnerId);
      const sandbox = backend.getSandbox(session.sandboxId);
      if (sandbox) {
        extractBundle(bundleBuffer, sandbox.workspaceDir);
        return reply.send({ message: 'Workspace restored to live sandbox' });
      }
    } catch { /* runner may be gone */ }

    // Fall back to persisting as a snapshot
    const snapshotDir = join(dataDir, 'sessions', session.id, 'workspace');
    extractBundle(bundleBuffer, snapshotDir);
    return reply.send({ message: 'Workspace saved as snapshot' });
  });
}
