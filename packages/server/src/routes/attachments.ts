import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { insertAttachment, getAttachment, listAttachmentsBySession, listAttachmentsByMessage, getSession } from '../db/index.js';

/** Maximum attachment size (default 10 MB). */
const MAX_ATTACHMENT_SIZE = parseInt(process.env.ASH_MAX_ATTACHMENT_SIZE || String(10 * 1024 * 1024), 10);

export function attachmentRoutes(app: FastifyInstance, dataDir: string): void {
  // Upload attachment to a session (stores in local data dir)
  app.post<{ Params: { id: string } }>('/api/sessions/:id/attachments', {
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
          filename: { type: 'string', minLength: 1 },
          mimeType: { type: 'string', default: 'application/octet-stream' },
          content: { type: 'string', description: 'Base64-encoded file content' },
          messageId: { type: 'string', format: 'uuid', description: 'Message to attach to (optional — can be linked later)' },
        },
        required: ['filename', 'content'],
      },
      response: {
        201: {
          type: 'object',
          properties: { attachment: { $ref: 'Attachment#' } },
          required: ['attachment'],
        },
        400: { $ref: 'ApiError#' },
        404: { $ref: 'ApiError#' },
        413: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const session = await getSession(req.params.id);
    if (!session || session.tenantId !== req.tenantId) {
      return reply.status(404).send({ error: 'Session not found', statusCode: 404 });
    }

    const { filename, mimeType, content, messageId } = req.body as {
      filename: string;
      mimeType?: string;
      content: string;
      messageId?: string;
    };

    const buffer = Buffer.from(content, 'base64');
    if (buffer.length > MAX_ATTACHMENT_SIZE) {
      return reply.status(413).send({ error: `Attachment too large (max ${MAX_ATTACHMENT_SIZE} bytes)`, statusCode: 413 });
    }

    const id = randomUUID();
    const effectiveMessageId = messageId || 'unlinked';
    const storagePath = join('attachments', session.id, id, filename);
    const fullPath = join(dataDir, storagePath);

    // Store file locally
    mkdirSync(join(dataDir, 'attachments', session.id, id), { recursive: true });
    writeFileSync(fullPath, buffer);

    // Also write to sandbox workspace if it exists
    const workspaceDir = join(dataDir, 'sandboxes', session.sandboxId, 'workspace');
    if (existsSync(workspaceDir)) {
      const attachDir = join(workspaceDir, 'attachments');
      mkdirSync(attachDir, { recursive: true });
      writeFileSync(join(attachDir, filename), buffer);
    }

    const attachment = await insertAttachment(
      id, req.tenantId, effectiveMessageId, session.id,
      filename, mimeType ?? 'application/octet-stream', buffer.length, storagePath,
    );

    return reply.status(201).send({ attachment });
  });

  // List attachments for a session
  app.get<{ Params: { id: string } }>('/api/sessions/:id/attachments', {
    schema: {
      tags: ['sessions'],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            attachments: { type: 'array', items: { $ref: 'Attachment#' } },
          },
          required: ['attachments'],
        },
        404: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const session = await getSession(req.params.id);
    if (!session || session.tenantId !== req.tenantId) {
      return reply.status(404).send({ error: 'Session not found', statusCode: 404 });
    }
    const attachments = await listAttachmentsBySession(session.id, req.tenantId);
    return reply.send({ attachments });
  });

  // Download an attachment by ID
  app.get<{ Params: { id: string } }>('/api/attachments/:id', {
    schema: {
      tags: ['attachments'],
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
    const attachment = await getAttachment(req.params.id);
    if (!attachment || attachment.tenantId !== req.tenantId) {
      return reply.status(404).send({ error: 'Attachment not found', statusCode: 404 });
    }

    const fullPath = join(dataDir, attachment.storagePath);
    if (!existsSync(fullPath)) {
      return reply.status(404).send({ error: 'Attachment file not found on disk', statusCode: 404 });
    }

    const content = readFileSync(fullPath);
    return reply
      .header('Content-Type', attachment.mimeType)
      .header('Content-Disposition', `attachment; filename="${attachment.filename}"`)
      .send(content);
  });

  // Delete an attachment
  app.delete<{ Params: { id: string } }>('/api/attachments/:id', {
    schema: {
      tags: ['attachments'],
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
      response: {
        204: { type: 'null' },
        404: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const attachment = await getAttachment(req.params.id);
    if (!attachment || attachment.tenantId !== req.tenantId) {
      return reply.status(404).send({ error: 'Attachment not found', statusCode: 404 });
    }

    // Best-effort delete from disk
    const fullPath = join(dataDir, attachment.storagePath);
    try { const { unlinkSync } = await import('node:fs'); unlinkSync(fullPath); } catch { /* file may be gone */ }

    await import('../db/index.js').then(db => db.deleteAttachment(req.params.id));
    return reply.status(204).send();
  });
}
