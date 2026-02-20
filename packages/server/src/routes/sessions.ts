import type { FastifyInstance } from 'fastify';
import type { ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SSE_WRITE_TIMEOUT_MS, timingEnabled, startTimer, logTiming } from '@ash-ai/shared';
import { getAgent, insertSession, getSession, listSessions, updateSessionStatus, updateSessionSandbox, touchSession, updateSessionRunner } from '../db/index.js';
import type { RunnerCoordinator } from '../runner/coordinator.js';
import { restoreSessionState, hasPersistedState, restoreStateFromCloud } from '@ash-ai/sandbox';

/** Structured log line for every resume — always on, not gated by ASH_DEBUG_TIMING. */
function logResume(path: 'warm' | 'cold', sessionId: string, agentName: string): void {
  process.stderr.write(JSON.stringify({
    type: 'resume_hit',
    path,
    sessionId,
    agentName,
    ts: new Date().toISOString(),
  }) + '\n');
}

const idParam = {
  type: 'object',
  properties: { id: { type: 'string', format: 'uuid' } },
  required: ['id'],
} as const;

const sessionResponse = {
  type: 'object',
  properties: { session: { $ref: 'Session#' } },
  required: ['session'],
} as const;

/**
 * Write an SSE frame with backpressure. If the kernel TCP send buffer is full,
 * waits for `drain` up to SSE_WRITE_TIMEOUT_MS before giving up.
 */
export async function writeSSE(raw: ServerResponse, frame: string): Promise<void> {
  const canWrite = raw.write(frame);
  if (!canWrite) {
    let timer: ReturnType<typeof setTimeout>;
    let onDrain: () => void;

    const drained = await Promise.race([
      new Promise<true>((resolve) => {
        onDrain = () => resolve(true);
        raw.once('drain', onDrain);
      }),
      new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), SSE_WRITE_TIMEOUT_MS);
      }),
    ]);

    if (drained) {
      clearTimeout(timer!);
    } else {
      raw.removeListener('drain', onDrain!);
      throw new Error('Client write timeout — closing stream');
    }
  }
}

export function sessionRoutes(app: FastifyInstance, coordinator: RunnerCoordinator, dataDir: string): void {
  // Create session — picks the best runner via coordinator
  app.post('/api/sessions', {
    schema: {
      tags: ['sessions'],
      body: {
        type: 'object',
        properties: {
          agent: { type: 'string' },
        },
        required: ['agent'],
      },
      response: {
        201: sessionResponse,
        400: { $ref: 'ApiError#' },
        404: { $ref: 'ApiError#' },
        500: { $ref: 'ApiError#' },
        503: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const { agent } = req.body as { agent: string };

    const agentRecord = await getAgent(agent, req.tenantId);
    if (!agentRecord) {
      return reply.status(404).send({ error: `Agent "${agent}" not found`, statusCode: 404 });
    }

    const sessionId = randomUUID();

    try {
      const { backend, runnerId } = coordinator.selectBackend();

      const handle = await backend.createSandbox({
        sessionId,
        agentDir: agentRecord.path,
        agentName: agentRecord.name,
        sandboxId: sessionId,
        onOomKill: () => {
          updateSessionStatus(sessionId, 'paused').catch((err) =>
            console.error(`Failed to update session status on OOM: ${err}`)
          );
        },
      });

      const session = await insertSession(sessionId, agentRecord.name, handle.sandboxId, req.tenantId);
      const effectiveRunnerId = runnerId === '__local__' ? null : runnerId;
      await updateSessionRunner(sessionId, effectiveRunnerId);
      await updateSessionStatus(sessionId, 'active');

      return reply.status(201).send({ session: { ...session, status: 'active', runnerId: effectiveRunnerId } });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('capacity reached') || msg.includes('No runners available')) {
        return reply.status(503).send({ error: msg, statusCode: 503 });
      }
      return reply.status(500).send({ error: `Failed to create session: ${msg}`, statusCode: 500 });
    }
  });

  // List sessions (optional ?agent=name filter)
  app.get('/api/sessions', {
    schema: {
      tags: ['sessions'],
      querystring: {
        type: 'object',
        properties: {
          agent: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            sessions: { type: 'array', items: { $ref: 'Session#' } },
          },
          required: ['sessions'],
        },
      },
    },
  }, async (req, reply) => {
    const { agent } = req.query as { agent?: string };
    return reply.send({ sessions: await listSessions(req.tenantId, agent || undefined) });
  });

  // Get session
  app.get<{ Params: { id: string } }>('/api/sessions/:id', {
    schema: {
      tags: ['sessions'],
      params: idParam,
      response: {
        200: sessionResponse,
        404: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const session = await getSession(req.params.id);
    if (!session || session.tenantId !== req.tenantId) {
      return reply.status(404).send({ error: 'Session not found', statusCode: 404 });
    }
    return reply.send({ session });
  });

  // Send message — routes to the correct runner for the session
  app.post<{ Params: { id: string } }>('/api/sessions/:id/messages', {
    schema: {
      tags: ['sessions'],
      params: idParam,
      body: {
        type: 'object',
        properties: {
          content: { type: 'string' },
          includePartialMessages: { type: 'boolean' },
        },
        required: ['content'],
      },
      response: {
        200: {
          type: 'string',
          description: 'SSE stream. Events: `message` (SDK Message JSON), `error` ({error: string}), `done` ({sessionId: string})',
        },
        400: { $ref: 'ApiError#' },
        404: { $ref: 'ApiError#' },
        500: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const timing = timingEnabled();
    const elapsed = timing ? startTimer() : null;

    const session = await getSession(req.params.id);
    if (!session || session.tenantId !== req.tenantId) {
      return reply.status(404).send({ error: 'Session not found', statusCode: 404 });
    }
    if (session.status !== 'active') {
      return reply.status(400).send({ error: `Session is ${session.status}`, statusCode: 400 });
    }

    const { content, includePartialMessages } = req.body as { content: string; includePartialMessages?: boolean };

    let backend;
    try {
      backend = coordinator.getBackendForRunner(session.runnerId);
    } catch {
      await updateSessionStatus(session.id, 'error');
      return reply.status(500).send({ error: 'Runner not available', statusCode: 500 });
    }

    const sandbox = backend.getSandbox(session.sandboxId);
    if (!sandbox) {
      await updateSessionStatus(session.id, 'error');
      return reply.status(500).send({ error: 'Sandbox not found', statusCode: 500 });
    }

    const lookupMs = elapsed?.() ?? 0;

    // Mark running BEFORE any async work — prevents eviction
    backend.markRunning(session.sandboxId);

    await touchSession(session.id);

    // SSE response
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    let eventCount = 0;
    let firstEventMs = 0;

    try {
      const events = backend.sendCommand(session.sandboxId, {
        cmd: 'query',
        prompt: content,
        sessionId: session.id,
        ...(includePartialMessages && { includePartialMessages: true }),
      });

      for await (const event of events) {
        eventCount++;
        if (eventCount === 1 && elapsed) {
          firstEventMs = elapsed();
        }

        if (event.ev === 'message') {
          await writeSSE(reply.raw, `event: message\ndata: ${JSON.stringify(event.data)}\n\n`);
        } else if (event.ev === 'error') {
          await writeSSE(reply.raw, `event: error\ndata: ${JSON.stringify({ error: event.error })}\n\n`);
        } else if (event.ev === 'done') {
          await writeSSE(reply.raw, `event: done\ndata: ${JSON.stringify({ sessionId: event.sessionId })}\n\n`);
          // Best-effort state persistence after each completed turn
          backend.persistState(session.sandboxId, session.id, session.agentName);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: msg })}\n\n`);
    } finally {
      // Mark waiting after message processing completes
      backend.markWaiting(session.sandboxId);
    }

    if (elapsed) {
      logTiming({
        type: 'timing',
        source: 'server',
        sessionId: session.id,
        sandboxId: session.sandboxId,
        lookupMs: Math.round(lookupMs * 100) / 100,
        firstEventMs: Math.round(firstEventMs * 100) / 100,
        totalMs: Math.round(elapsed() * 100) / 100,
        eventCount,
        timestamp: new Date().toISOString(),
      });
    }

    reply.raw.end();
  });

  // Pause session
  app.post<{ Params: { id: string } }>('/api/sessions/:id/pause', {
    schema: {
      tags: ['sessions'],
      params: idParam,
      response: {
        200: sessionResponse,
        400: { $ref: 'ApiError#' },
        404: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const session = await getSession(req.params.id);
    if (!session || session.tenantId !== req.tenantId) {
      return reply.status(404).send({ error: 'Session not found', statusCode: 404 });
    }
    if (session.status !== 'active') {
      return reply.status(400).send({ error: `Cannot pause session with status "${session.status}"`, statusCode: 400 });
    }

    // Best-effort persist state before pausing
    try {
      const backend = coordinator.getBackendForRunner(session.runnerId);
      backend.persistState(session.sandboxId, session.id, session.agentName);
    } catch { /* runner may be gone */ }

    await updateSessionStatus(session.id, 'paused');
    return reply.send({ session: { ...session, status: 'paused' } });
  });

  // Resume session — may route to a different runner
  app.post<{ Params: { id: string } }>('/api/sessions/:id/resume', {
    schema: {
      tags: ['sessions'],
      params: idParam,
      response: {
        200: sessionResponse,
        404: { $ref: 'ApiError#' },
        410: { $ref: 'ApiError#' },
        500: { $ref: 'ApiError#' },
        503: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const session = await getSession(req.params.id);
    if (!session || session.tenantId !== req.tenantId) {
      return reply.status(404).send({ error: 'Session not found', statusCode: 404 });
    }
    if (session.status === 'ended') {
      return reply.status(410).send({ error: 'Session has ended — create a new session', statusCode: 410 });
    }
    if (session.status === 'active') {
      return reply.send({ session });
    }

    // Resumable statuses: 'paused', 'error', 'starting'
    const agentRecord = await getAgent(session.agentName, req.tenantId);
    if (!agentRecord) {
      return reply.status(404).send({ error: `Agent "${session.agentName}" not found`, statusCode: 404 });
    }

    // Fast path: try the same runner if sandbox is still alive
    try {
      const oldBackend = coordinator.getBackendForRunner(session.runnerId);
      if (oldBackend.isSandboxAlive(session.sandboxId)) {
        oldBackend.recordWarmHit();
        logResume('warm', session.id, session.agentName);
        await updateSessionStatus(session.id, 'active');
        return reply.send({ session: { ...session, status: 'active' } });
      }
    } catch { /* runner gone — cold path */ }

    // Cold path: pick any healthy runner
    try {
      const oldWorkspaceDir = join(dataDir, 'sandboxes', session.id, 'workspace');
      const workspaceExists = existsSync(oldWorkspaceDir);

      if (!workspaceExists) {
        if (hasPersistedState(dataDir, session.id, session.tenantId)) {
          restoreSessionState(dataDir, session.id, oldWorkspaceDir, session.tenantId);
        } else {
          // Fall back to cloud storage
          const restored = await restoreStateFromCloud(dataDir, session.id, session.tenantId);
          if (restored) {
            restoreSessionState(dataDir, session.id, oldWorkspaceDir, session.tenantId);
          }
        }
      }

      const workspaceAvailable = existsSync(oldWorkspaceDir);
      const { backend, runnerId } = coordinator.selectBackend();

      const handle = await backend.createSandbox({
        sessionId: session.id,
        agentDir: agentRecord.path,
        agentName: session.agentName,
        sandboxId: session.id,
        skipAgentCopy: workspaceAvailable,
        onOomKill: () => {
          updateSessionStatus(session.id, 'paused').catch((err) =>
            console.error(`Failed to update session status on OOM: ${err}`)
          );
        },
      });
      backend.recordColdHit();
      logResume('cold', session.id, session.agentName);

      const effectiveRunnerId = runnerId === '__local__' ? null : runnerId;
      await updateSessionSandbox(session.id, handle.sandboxId);
      await updateSessionRunner(session.id, effectiveRunnerId);
      await updateSessionStatus(session.id, 'active');

      return reply.send({ session: { ...session, sandboxId: handle.sandboxId, status: 'active', runnerId: effectiveRunnerId } });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('capacity reached') || msg.includes('No runners available')) {
        return reply.status(503).send({ error: msg, statusCode: 503 });
      }
      return reply.status(500).send({ error: `Failed to resume session: ${msg}`, statusCode: 500 });
    }
  });

  // End session
  app.delete<{ Params: { id: string } }>('/api/sessions/:id', {
    schema: {
      tags: ['sessions'],
      params: idParam,
      response: {
        200: sessionResponse,
        404: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const session = await getSession(req.params.id);
    if (!session || session.tenantId !== req.tenantId) {
      return reply.status(404).send({ error: 'Session not found', statusCode: 404 });
    }

    // Persist state and destroy sandbox (best-effort — runner may be gone)
    try {
      const backend = coordinator.getBackendForRunner(session.runnerId);
      backend.persistState(session.sandboxId, session.id, session.agentName);
      await backend.destroySandbox(session.sandboxId);
    } catch { /* runner may be gone */ }

    await updateSessionStatus(session.id, 'ended');
    return reply.send({ session: { ...session, status: 'ended' } });
  });
}
