import type { FastifyInstance } from 'fastify';
import type { ServerResponse } from 'node:http';
import type { SandboxPool } from '@ash-ai/sandbox';
import { persistSessionState, syncStateToCloud } from '@ash-ai/sandbox';
import { SSE_WRITE_TIMEOUT_MS } from '@ash-ai/shared';

/**
 * Write an SSE frame with backpressure.
 */
async function writeSSE(raw: ServerResponse, frame: string): Promise<void> {
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

export function sandboxRoutes(app: FastifyInstance, pool: SandboxPool, dataDir: string): void {
  // Create sandbox
  app.post('/runner/sandboxes', async (req, reply) => {
    const body = req.body as {
      sessionId: string;
      agentDir: string;
      agentName: string;
      sandboxId?: string;
      skipAgentCopy?: boolean;
      limits?: Record<string, number>;
      extraEnv?: Record<string, string>;
      startupScript?: string;
      mcpServers?: Record<string, unknown>;
      systemPrompt?: string;
    };

    try {
      const sandbox = await pool.create({
        agentDir: body.agentDir,
        sessionId: body.sessionId,
        id: body.sandboxId,
        agentName: body.agentName,
        skipAgentCopy: body.skipAgentCopy,
        limits: body.limits,
        extraEnv: body.extraEnv,
        startupScript: body.startupScript,
        mcpServers: body.mcpServers as Record<string, import('@ash-ai/shared').McpServerConfig> | undefined,
        systemPrompt: body.systemPrompt,
      });

      return reply.status(201).send({
        sandboxId: sandbox.id,
        workspaceDir: sandbox.workspaceDir,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('capacity reached')) {
        return reply.status(503).send({ error: msg });
      }
      return reply.status(500).send({ error: `Failed to create sandbox: ${msg}` });
    }
  });

  // Destroy sandbox
  app.delete<{ Params: { id: string } }>('/runner/sandboxes/:id', async (req, reply) => {
    await pool.destroy(req.params.id);
    return reply.status(204).send();
  });

  // Send command to sandbox — returns SSE stream
  app.post<{ Params: { id: string } }>('/runner/sandboxes/:id/cmd', async (req, reply) => {
    const sandbox = pool.get(req.params.id);
    if (!sandbox) {
      return reply.status(404).send({ error: 'Sandbox not found' });
    }

    const body = req.body as {
      cmd: string;
      prompt?: string;
      sessionId?: string;
      includePartialMessages?: boolean;
    };

    pool.markRunning(req.params.id);

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    try {
      const events = sandbox.client.sendCommand(body as any);
      for await (const event of events) {
        if (event.ev === 'message') {
          await writeSSE(reply.raw, `event: message\ndata: ${JSON.stringify(event.data)}\n\n`);
        } else if (event.ev === 'error') {
          await writeSSE(reply.raw, `event: error\ndata: ${JSON.stringify({ error: event.error })}\n\n`);
        } else if (event.ev === 'done') {
          await writeSSE(reply.raw, `event: done\ndata: ${JSON.stringify({ sessionId: event.sessionId })}\n\n`);
        } else if (event.ev === 'exec_result') {
          await writeSSE(reply.raw, `event: exec_result\ndata: ${JSON.stringify({ exitCode: event.exitCode, stdout: event.stdout, stderr: event.stderr })}\n\n`);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: msg })}\n\n`);
    } finally {
      pool.markWaiting(req.params.id);
    }

    reply.raw.end();
  });

  // Interrupt a running sandbox command (fire-and-forget)
  app.post<{ Params: { id: string } }>('/runner/sandboxes/:id/interrupt', async (req, reply) => {
    const sandbox = pool.get(req.params.id);
    if (!sandbox) {
      return reply.status(404).send({ error: 'Sandbox not found' });
    }
    sandbox.client.writeCommand({ cmd: 'interrupt' });
    return reply.send({ ok: true });
  });

  // Persist state on runner's filesystem
  app.post<{ Params: { id: string } }>('/runner/sandboxes/:id/persist', async (req, reply) => {
    const sandbox = pool.get(req.params.id);
    if (!sandbox) {
      return reply.status(404).send({ error: 'Sandbox not found' });
    }

    const { sessionId, agentName } = req.body as { sessionId: string; agentName: string };
    const success = persistSessionState(dataDir, sessionId, sandbox.workspaceDir, agentName);
    if (success) {
      syncStateToCloud(dataDir, sessionId).catch((err) =>
        console.error(`[runner] Cloud sync failed for ${sessionId}:`, err)
      );
    }
    return reply.send({ success });
  });

  // Mark sandbox running/waiting
  app.post<{ Params: { id: string } }>('/runner/sandboxes/:id/mark', async (req, reply) => {
    const { state } = req.body as { state: 'running' | 'waiting' };
    if (state === 'running') {
      pool.markRunning(req.params.id);
    } else {
      pool.markWaiting(req.params.id);
    }
    return reply.send({ ok: true });
  });

  // Get sandbox info
  app.get<{ Params: { id: string } }>('/runner/sandboxes/:id', async (req, reply) => {
    const sandbox = pool.get(req.params.id);
    if (!sandbox) {
      return reply.status(404).send({ error: 'Sandbox not found' });
    }
    return reply.send({
      sandboxId: sandbox.id,
      workspaceDir: sandbox.workspaceDir,
      alive: sandbox.process.exitCode === null,
    });
  });
}
