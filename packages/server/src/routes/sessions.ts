import type { FastifyInstance } from 'fastify';
import type { ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SSE_WRITE_TIMEOUT_MS, timingEnabled, startTimer, logTiming, type SessionConfig } from '@ash-ai/shared';
import { getAgent, insertSession, insertForkedSession, getSession, listSessions, updateSessionStatus, updateSessionSandbox, updateSessionConfig, touchSession, updateSessionRunner, insertMessage, listMessages, insertSessionEvent, insertSessionEvents, listSessionEvents } from '../db/index.js';
import { classifyBridgeMessage, classifyToStreamEvents } from '@ash-ai/shared';
import { VERSION } from '../version.js';
import type { RunnerCoordinator } from '../runner/coordinator.js';
import type { TelemetryExporter } from '../telemetry/exporter.js';
import { restoreSessionState, hasPersistedState, restoreStateFromCloud, restoreAgentFromCloud } from '@ash-ai/sandbox';
import { decryptCredential } from './credentials.js';
import { touchCredentialUsed } from '../db/index.js';
import { recordUsageFromMessage } from '../usage/extractor.js';

/** Structured log line for every resume — always on, not gated by ASH_DEBUG_TIMING. */
function logResume(path: 'warm' | 'cold', sessionId: string, agentName: string, source?: 'local' | 'cloud' | 'fresh'): void {
  process.stderr.write(JSON.stringify({
    type: 'resume_hit',
    path,
    ...(source ? { source } : {}),
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

export function sessionRoutes(app: FastifyInstance, coordinator: RunnerCoordinator, dataDir: string, telemetry: TelemetryExporter): void {
  // Create session — picks the best runner via coordinator
  app.post('/api/sessions', {
    schema: {
      tags: ['sessions'],
      body: {
        type: 'object',
        properties: {
          agent: { type: 'string' },
          credentialId: { type: 'string' },
          extraEnv: { type: 'object', additionalProperties: { type: 'string' } },
          startupScript: { type: 'string' },
          model: { type: 'string', description: 'Model override for this session. Overrides agent .claude/settings.json default.' },
          mcpServers: {
            type: 'object',
            description: 'Per-session MCP servers. Merged into agent .mcp.json (session overrides agent). Enables sidecar pattern.',
            additionalProperties: {
              type: 'object',
              properties: {
                url: { type: 'string' },
                command: { type: 'string' },
                args: { type: 'array', items: { type: 'string' } },
                env: { type: 'object', additionalProperties: { type: 'string' } },
              },
            },
          },
          systemPrompt: { type: 'string', description: 'System prompt override. Replaces agent CLAUDE.md for this session.' },
          permissionMode: { type: 'string', enum: ['bypassPermissions', 'permissionsByAgent', 'default'], description: 'Permission mode for the SDK inside the sandbox. Defaults to bypassPermissions (sandbox isolation is the security boundary).' },
          allowedTools: { type: 'array', items: { type: 'string' }, description: 'Whitelist of allowed tool names for this session.' },
          disallowedTools: { type: 'array', items: { type: 'string' }, description: 'Blacklist of disallowed tool names for this session.' },
          betas: { type: 'array', items: { type: 'string' }, description: 'Beta feature flags for this session.' },
          subagents: { type: 'object', additionalProperties: true, description: 'Programmatic subagent definitions. Passed through to the SDK as `agents`.' },
          initialAgent: { type: 'string', description: 'Which subagent to use for the main thread. Maps to SDK `agent` option.' },
        },
        required: ['agent'],
      },
      response: {
        201: sessionResponse,
        400: { $ref: 'ApiError#' },
        404: { $ref: 'ApiError#' },
        422: { $ref: 'ApiError#' },
        500: { $ref: 'ApiError#' },
        503: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const { agent, credentialId, extraEnv: bodyExtraEnv, startupScript, model, mcpServers, systemPrompt, permissionMode, allowedTools, disallowedTools, betas, subagents, initialAgent } = req.body as { agent: string; credentialId?: string; extraEnv?: Record<string, string>; startupScript?: string; model?: string; mcpServers?: Record<string, { url?: string; command?: string; args?: string[]; env?: Record<string, string> }>; systemPrompt?: string; permissionMode?: string; allowedTools?: string[]; disallowedTools?: string[]; betas?: string[]; subagents?: Record<string, unknown>; initialAgent?: string };

    const agentRecord = await getAgent(agent, req.tenantId);
    if (!agentRecord) {
      return reply.status(404).send({ error: `Agent "${agent}" not found`, statusCode: 404 });
    }

    // Validate agent directory exists on disk — auto-restore from cloud if missing
    if (!existsSync(agentRecord.path)) {
      const restored = await restoreAgentFromCloud(agentRecord.name, agentRecord.path, req.tenantId);
      if (!restored) {
        return reply.status(422).send({ error: `Agent directory not found at "${agentRecord.path}". The agent "${agent}" may need to be re-deployed.`, statusCode: 422 });
      }
      console.log(`[sessions] Restored agent "${agent}" from cloud storage`);
    }

    // Resolve credential to env vars if provided
    let extraEnv: Record<string, string> | undefined;
    if (credentialId) {
      const cred = await decryptCredential(credentialId, req.tenantId);
      if (!cred) {
        return reply.status(400).send({ error: 'Invalid or inaccessible credential', statusCode: 400 });
      }
      const envKey = cred.type === 'anthropic' ? 'ANTHROPIC_API_KEY' : cred.type === 'openai' ? 'OPENAI_API_KEY' : 'ASH_CUSTOM_API_KEY';
      extraEnv = { [envKey]: cred.key };
      touchCredentialUsed(credentialId).catch(() => {});
    }

    // Merge body-level extraEnv (overrides credential env on conflict)
    if (bodyExtraEnv) {
      extraEnv = { ...extraEnv, ...bodyExtraEnv };
    }

    // Inject permission mode into sandbox env (bridge reads ASH_PERMISSION_MODE)
    if (permissionMode) {
      extraEnv = { ...extraEnv, ASH_PERMISSION_MODE: permissionMode };
    }

    const sessionId = randomUUID();

    try {
      const { backend, runnerId } = await coordinator.selectBackend();

      const handle = await backend.createSandbox({
        sessionId,
        agentDir: agentRecord.path,
        agentName: agentRecord.name,
        sandboxId: sessionId,
        extraEnv,
        startupScript,
        mcpServers,
        systemPrompt,
        onOomKill: () => {
          updateSessionStatus(sessionId, 'paused').catch((err) =>
            console.error(`Failed to update session status on OOM: ${err}`)
          );
        },
      });

      // Resolve effective model: explicit request > agent record > null (SDK default)
      const effectiveModel = model || agentRecord.model || undefined;

      // Build session-level SDK config (persisted on session, injected into every query)
      const sessionConfig: SessionConfig | null = (allowedTools || disallowedTools || betas || subagents || initialAgent)
        ? { allowedTools, disallowedTools, betas, subagents, initialAgent }
        : null;

      const session = await insertSession(sessionId, agentRecord.name, handle.sandboxId, req.tenantId, undefined, effectiveModel, sessionConfig);
      const effectiveRunnerId = runnerId === '__local__' ? null : runnerId;
      await updateSessionRunner(sessionId, effectiveRunnerId);
      await updateSessionStatus(sessionId, 'active');

      // Record lifecycle event
      insertSessionEvent(sessionId, 'lifecycle', JSON.stringify({ action: 'created', agentName: agentRecord.name, model: effectiveModel }), req.tenantId).catch((err) => console.error(`Failed to persist lifecycle event: ${err}`));
      telemetry.emit({ sessionId, agentName: agentRecord.name, type: 'lifecycle', data: { status: 'active', action: 'created' } });

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

  // Update session config (mid-session control)
  app.patch<{ Params: { id: string } }>('/api/sessions/:id/config', {
    schema: {
      tags: ['sessions'],
      params: idParam,
      body: {
        type: 'object',
        properties: {
          model: { type: 'string', description: 'Model override for subsequent queries.' },
          allowedTools: { type: 'array', items: { type: 'string' }, description: 'Whitelist of allowed tool names.' },
          disallowedTools: { type: 'array', items: { type: 'string' }, description: 'Blacklist of disallowed tool names.' },
          betas: { type: 'array', items: { type: 'string' }, description: 'Beta feature flags.' },
          subagents: { type: 'object', additionalProperties: true, description: 'Programmatic subagent definitions.' },
          initialAgent: { type: 'string', description: 'Which subagent to use for the main thread.' },
        },
      },
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

    const { model, allowedTools, disallowedTools, betas, subagents, initialAgent } = req.body as { model?: string; allowedTools?: string[]; disallowedTools?: string[]; betas?: string[]; subagents?: Record<string, unknown>; initialAgent?: string };

    // Merge with existing config (patch semantics — only provided fields are updated)
    const existingConfig = session.config ?? {};
    const newConfig: SessionConfig = {
      ...existingConfig,
      ...(allowedTools !== undefined && { allowedTools }),
      ...(disallowedTools !== undefined && { disallowedTools }),
      ...(betas !== undefined && { betas }),
      ...(subagents !== undefined && { subagents }),
      ...(initialAgent !== undefined && { initialAgent }),
    };

    const hasConfig = Object.keys(newConfig).some(k => (newConfig as any)[k] != null);
    await updateSessionConfig(session.id, model, hasConfig ? newConfig : null);

    const updated = await getSession(session.id);
    return reply.send({ session: updated });
  });

  // List messages for a session
  app.get<{ Params: { id: string } }>('/api/sessions/:id/messages', {
    schema: {
      tags: ['sessions'],
      params: idParam,
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 1000, default: 100 },
          after: { type: 'integer', minimum: 0, default: 0, description: 'Return messages after this sequence number' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            messages: { type: 'array', items: { $ref: 'Message#' } },
          },
          required: ['messages'],
        },
        404: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const session = await getSession(req.params.id);
    if (!session || session.tenantId !== req.tenantId) {
      return reply.status(404).send({ error: 'Session not found', statusCode: 404 });
    }
    const { limit, after } = req.query as { limit?: number; after?: number };
    const messages = await listMessages(session.id, req.tenantId, { limit, afterSequence: after });
    return reply.send({ messages });
  });

  // List session events (timeline)
  app.get<{ Params: { id: string } }>('/api/sessions/:id/events', {
    schema: {
      tags: ['sessions'],
      params: idParam,
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 1000, default: 200 },
          after: { type: 'integer', minimum: 0, default: 0, description: 'Return events after this sequence number' },
          type: { type: 'string', description: 'Filter by event type' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            events: { type: 'array', items: { $ref: 'SessionEvent#' } },
          },
          required: ['events'],
        },
        404: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const session = await getSession(req.params.id);
    if (!session || session.tenantId !== req.tenantId) {
      return reply.status(404).send({ error: 'Session not found', statusCode: 404 });
    }
    const { limit, after, type } = req.query as { limit?: number; after?: number; type?: string };
    const events = await listSessionEvents(session.id, req.tenantId, {
      limit,
      afterSequence: after,
      type: type as any,
    });
    return reply.send({ events });
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
          model: { type: 'string', description: 'Model override for this query. Overrides session and agent defaults.' },
          maxTurns: { type: 'integer', minimum: 1, description: 'Maximum agentic turns for this query.' },
          maxBudgetUsd: { type: 'number', minimum: 0, description: 'Maximum budget in USD for this query.' },
          effort: { type: 'string', enum: ['low', 'medium', 'high', 'max'], description: 'Effort level for this query.' },
          thinking: { type: 'object', properties: { type: { type: 'string' }, budgetTokens: { type: 'integer' } }, required: ['type'], description: 'Thinking configuration for this query.' },
          outputFormat: { type: 'object', properties: { type: { type: 'string' }, schema: { type: 'object', additionalProperties: true } }, required: ['type', 'schema'], description: 'Output format constraint for this query.' },
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

    const { content, includePartialMessages, model: messageModel, maxTurns, maxBudgetUsd, effort, thinking, outputFormat } = req.body as { content: string; includePartialMessages?: boolean; model?: string; maxTurns?: number; maxBudgetUsd?: number; effort?: 'low' | 'medium' | 'high' | 'max'; thinking?: { type: string; budgetTokens?: number }; outputFormat?: { type: string; schema: Record<string, unknown> } };

    let backend;
    try {
      backend = await coordinator.getBackendForRunnerAsync(session.runnerId);
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

    // Persist user message
    insertMessage(session.id, 'user', JSON.stringify({ type: 'user', content }), req.tenantId).catch((err) =>
      console.error(`Failed to persist user message: ${err}`)
    );
    telemetry.emit({ sessionId: session.id, agentName: session.agentName, type: 'message', data: { role: 'user', content } });

    // SSE response
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // Emit session_start as first SSE event — clients know which session they're streaming
    await writeSSE(reply.raw, `event: session_start\ndata: ${JSON.stringify({ sessionId: session.id, version: VERSION })}\n\n`);

    let eventCount = 0;
    let firstEventMs = 0;

    try {
      // Model precedence: per-message > session-level > agent default (.claude/settings.json)
      const queryModel = messageModel || session.model || undefined;

      // Session-level config (persisted on session record, injected into every query)
      const cfg = session.config;

      const events = backend.sendCommand(session.sandboxId, {
        cmd: 'query',
        prompt: content,
        sessionId: session.id,
        ...(includePartialMessages && { includePartialMessages: true }),
        ...(queryModel && { model: queryModel }),
        // Per-message SDK options
        ...(maxTurns != null && { maxTurns }),
        ...(maxBudgetUsd != null && { maxBudgetUsd }),
        ...(effort && { effort }),
        ...(thinking && { thinking }),
        ...(outputFormat && { outputFormat }),
        // Session-level SDK options (from session config)
        ...(cfg?.allowedTools && { allowedTools: cfg.allowedTools }),
        ...(cfg?.disallowedTools && { disallowedTools: cfg.disallowedTools }),
        ...(cfg?.betas && { betas: cfg.betas }),
        ...(cfg?.subagents && { subagents: cfg.subagents }),
        ...(cfg?.initialAgent && { initialAgent: cfg.initialAgent }),
      });

      for await (const event of events) {
        eventCount++;
        if (eventCount === 1 && elapsed) {
          firstEventMs = elapsed();
        }

        if (event.ev === 'message') {
          const data = event.data as Record<string, any>;

          // Emit granular SSE events (text_delta, tool_use, etc.) + raw message in one pass
          const streamEvents = classifyToStreamEvents(data);
          for (const se of streamEvents) {
            await writeSSE(reply.raw, `event: ${se.type}\ndata: ${JSON.stringify(se.data)}\n\n`);
          }

          // Persist complete assistant messages (not partial stream events)
          if (data.type === 'assistant' || data.type === 'result') {
            insertMessage(session.id, 'assistant', JSON.stringify(data), req.tenantId).catch((err) =>
              console.error(`Failed to persist assistant message: ${err}`)
            );
            telemetry.emit({ sessionId: session.id, agentName: session.agentName, type: 'message', data: { role: 'assistant', messageType: data.type } });
          }
          // Extract and record usage metrics once per turn (result has the usage summary)
          if (data.type === 'result') {
            recordUsageFromMessage(data, session.id, session.agentName, req.tenantId);
          }

          // Classify and persist timeline events (non-blocking)
          const classified = classifyBridgeMessage(data);
          if (classified.length > 0) {
            insertSessionEvents(
              classified.map((c) => ({
                sessionId: session.id,
                type: c.type,
                data: JSON.stringify(c.data),
                tenantId: req.tenantId,
              }))
            ).catch((err) => console.error(`Failed to persist session events: ${err}`));
            for (const c of classified) {
              telemetry.emit({ sessionId: session.id, agentName: session.agentName, type: c.type, data: c.data });
            }
          }
        } else if (event.ev === 'error') {
          await writeSSE(reply.raw, `event: error\ndata: ${JSON.stringify({ error: event.error })}\n\n`);
          // Persist error as timeline event
          insertSessionEvent(session.id, 'error', JSON.stringify({ error: event.error }), req.tenantId).catch((err) =>
            console.error(`Failed to persist error event: ${err}`)
          );
          telemetry.emit({ sessionId: session.id, agentName: session.agentName, type: 'error', data: { error: event.error } });
        } else if (event.ev === 'done') {
          await writeSSE(reply.raw, `event: done\ndata: ${JSON.stringify({ sessionId: event.sessionId })}\n\n`);
          // Best-effort state persistence after each completed turn
          backend.persistState(session.sandboxId, session.id, session.agentName);
          telemetry.emit({ sessionId: session.id, agentName: session.agentName, type: 'turn_complete', data: {} });
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: msg })}\n\n`);
      // Signal stream completion — the session remains active (not ended)
      reply.raw.write(`event: done\ndata: ${JSON.stringify({ sessionId: session.id })}\n\n`);
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

  // Get sandbox logs for a session
  app.get<{ Params: { id: string } }>('/api/sessions/:id/logs', {
    schema: {
      tags: ['sessions'],
      params: idParam,
      querystring: {
        type: 'object',
        properties: {
          after: { type: 'integer', minimum: -1, default: -1, description: 'Return log entries with index > after' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            logs: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  index: { type: 'integer' },
                  level: { type: 'string', enum: ['stdout', 'stderr', 'system'] },
                  text: { type: 'string' },
                  ts: { type: 'string' },
                },
                required: ['index', 'level', 'text', 'ts'],
              },
            },
            source: { type: 'string' },
          },
          required: ['logs', 'source'],
        },
        404: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const session = await getSession(req.params.id);
    if (!session || session.tenantId !== req.tenantId) {
      return reply.status(404).send({ error: 'Session not found', statusCode: 404 });
    }

    const { after } = req.query as { after?: number };
    const afterIndex = after != null && after >= 0 ? after : undefined;

    try {
      const backend = await coordinator.getBackendForRunnerAsync(session.runnerId);
      const logs = backend.getLogs(session.sandboxId, afterIndex);
      return reply.send({ logs, source: 'sandbox' });
    } catch {
      // Sandbox/runner not available — return empty logs
      return reply.send({ logs: [], source: 'sandbox' });
    }
  });

  // Execute a command in the session's sandbox (synchronous — waits for result)
  app.post<{ Params: { id: string } }>('/api/sessions/:id/exec', {
    schema: {
      tags: ['sessions'],
      params: idParam,
      body: {
        type: 'object',
        properties: {
          command: { type: 'string' },
          timeout: { type: 'integer', minimum: 1, maximum: 300000 },
        },
        required: ['command'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            exitCode: { type: 'integer' },
            stdout: { type: 'string' },
            stderr: { type: 'string' },
          },
          required: ['exitCode', 'stdout', 'stderr'],
        },
        400: { $ref: 'ApiError#' },
        404: { $ref: 'ApiError#' },
        500: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const session = await getSession(req.params.id);
    if (!session || session.tenantId !== req.tenantId) {
      return reply.status(404).send({ error: 'Session not found', statusCode: 404 });
    }
    if (session.status !== 'active') {
      return reply.status(400).send({ error: `Session is ${session.status}`, statusCode: 400 });
    }

    const { command, timeout } = req.body as { command: string; timeout?: number };

    let backend;
    try {
      backend = await coordinator.getBackendForRunnerAsync(session.runnerId);
    } catch {
      return reply.status(500).send({ error: 'Runner not available', statusCode: 500 });
    }

    const sandbox = backend.getSandbox(session.sandboxId);
    if (!sandbox) {
      return reply.status(500).send({ error: 'Sandbox not found', statusCode: 500 });
    }

    try {
      const events = backend.sendCommand(session.sandboxId, { cmd: 'exec', command, timeout });
      for await (const event of events) {
        if (event.ev === 'exec_result') {
          return reply.send({ exitCode: event.exitCode, stdout: event.stdout, stderr: event.stderr });
        }
        if (event.ev === 'error') {
          return reply.status(500).send({ error: event.error, statusCode: 500 });
        }
      }
      return reply.status(500).send({ error: 'No exec result received', statusCode: 500 });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: `Exec failed: ${msg}`, statusCode: 500 });
    }
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
      const backend = await coordinator.getBackendForRunnerAsync(session.runnerId);
      backend.persistState(session.sandboxId, session.id, session.agentName);
    } catch { /* runner may be gone */ }

    await updateSessionStatus(session.id, 'paused');
    insertSessionEvent(session.id, 'lifecycle', JSON.stringify({ action: 'paused' }), req.tenantId).catch((err) => console.error(`Failed to persist lifecycle event: ${err}`));
    telemetry.emit({ sessionId: session.id, agentName: session.agentName, type: 'lifecycle', data: { status: 'paused' } });
    return reply.send({ session: { ...session, status: 'paused' } });
  });

  // Stop session — explicit user action (distinct from pause which is idle-based)
  app.post<{ Params: { id: string } }>('/api/sessions/:id/stop', {
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
    if (session.status !== 'active' && session.status !== 'starting') {
      return reply.status(400).send({ error: `Cannot stop session with status "${session.status}"`, statusCode: 400 });
    }

    // Persist state and destroy sandbox
    try {
      const backend = await coordinator.getBackendForRunnerAsync(session.runnerId);
      backend.persistState(session.sandboxId, session.id, session.agentName);
      await backend.destroySandbox(session.sandboxId);
    } catch { /* runner may be gone */ }

    await updateSessionStatus(session.id, 'stopped');
    insertSessionEvent(session.id, 'lifecycle', JSON.stringify({ action: 'stopped' }), req.tenantId).catch((err) => console.error(`Failed to persist lifecycle event: ${err}`));
    telemetry.emit({ sessionId: session.id, agentName: session.agentName, type: 'lifecycle', data: { status: 'stopped' } });
    return reply.send({ session: { ...session, status: 'stopped' as const } });
  });

  // Fork session — create a new session branching from parent's state and messages
  app.post<{ Params: { id: string } }>('/api/sessions/:id/fork', {
    schema: {
      tags: ['sessions'],
      params: idParam,
      response: {
        201: sessionResponse,
        404: { $ref: 'ApiError#' },
        422: { $ref: 'ApiError#' },
        500: { $ref: 'ApiError#' },
        503: { $ref: 'ApiError#' },
      },
    },
  }, async (req, reply) => {
    const parentSession = await getSession(req.params.id);
    if (!parentSession || parentSession.tenantId !== req.tenantId) {
      return reply.status(404).send({ error: 'Session not found', statusCode: 404 });
    }

    const agent = await getAgent(parentSession.agentName, req.tenantId);
    if (!agent) {
      return reply.status(404).send({ error: `Agent "${parentSession.agentName}" not found`, statusCode: 404 });
    }

    if (!existsSync(agent.path)) {
      const restored = await restoreAgentFromCloud(agent.name, agent.path, req.tenantId);
      if (!restored) {
        return reply.status(422).send({ error: `Agent directory not found at "${agent.path}". The agent "${parentSession.agentName}" may need to be re-deployed.`, statusCode: 422 });
      }
      console.log(`[sessions] Restored agent "${parentSession.agentName}" from cloud storage`);
    }

    // Persist parent workspace state if sandbox is still live
    try {
      const parentBackend = await coordinator.getBackendForRunnerAsync(parentSession.runnerId);
      parentBackend.persistState(parentSession.sandboxId, parentSession.id, parentSession.agentName);
    } catch { /* parent runner may be gone — will rely on existing snapshot */ }

    const forkId = randomUUID();

    try {
      // Create sandbox for the forked session (cold start — will restore parent state on resume)
      const { backend, runnerId } = await coordinator.selectBackend();
      const handle = await backend.createSandbox({
        sessionId: forkId,
        agentDir: agent.path,
        agentName: agent.name,
        sandboxId: forkId,
        onOomKill: () => {
          updateSessionStatus(forkId, 'paused').catch((err) =>
            console.error(`Failed to update session status on OOM: ${err}`)
          );
        },
      });

      // Restore parent workspace state into new sandbox
      const snapshotDir = join(dataDir, 'snapshots', parentSession.id);
      if (existsSync(snapshotDir)) {
        restoreSessionState(dataDir, parentSession.id, handle.workspaceDir, parentSession.agentName);
      }

      // Create forked session with copied messages
      const forkedSession = await insertForkedSession(forkId, parentSession, handle.sandboxId);
      const effectiveRunnerId = runnerId === '__local__' ? null : runnerId;
      await updateSessionRunner(forkId, effectiveRunnerId);

      insertSessionEvent(forkId, 'lifecycle', JSON.stringify({ action: 'forked', parentSessionId: parentSession.id }), req.tenantId).catch((err) => console.error(`Failed to persist lifecycle event: ${err}`));
      telemetry.emit({ sessionId: forkId, agentName: agent.name, type: 'lifecycle', data: { status: 'paused', action: 'forked', parentSessionId: parentSession.id } });

      return reply.status(201).send({ session: { ...forkedSession, runnerId: effectiveRunnerId } });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('capacity reached') || msg.includes('No runners available')) {
        return reply.status(503).send({ error: msg, statusCode: 503 });
      }
      return reply.status(500).send({ error: `Failed to fork session: ${msg}`, statusCode: 500 });
    }
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
        422: { $ref: 'ApiError#' },
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

    // Resumable statuses: 'paused', 'stopped', 'error', 'starting'
    const agentRecord = await getAgent(session.agentName, req.tenantId);
    if (!agentRecord) {
      return reply.status(404).send({ error: `Agent "${session.agentName}" not found`, statusCode: 404 });
    }

    // Validate agent directory exists — auto-restore from cloud if missing
    if (!existsSync(agentRecord.path)) {
      const restored = await restoreAgentFromCloud(agentRecord.name, agentRecord.path, req.tenantId);
      if (!restored) {
        return reply.status(422).send({ error: `Agent directory not found at "${agentRecord.path}". The agent "${session.agentName}" may need to be re-deployed.`, statusCode: 422 });
      }
      console.log(`[sessions] Restored agent "${session.agentName}" from cloud storage`);
    }

    // Fast path: try the same runner if sandbox is still alive
    try {
      const oldBackend = await coordinator.getBackendForRunnerAsync(session.runnerId);
      if (oldBackend.isSandboxAlive(session.sandboxId)) {
        oldBackend.recordWarmHit();
        logResume('warm', session.id, session.agentName);
        await updateSessionStatus(session.id, 'active');
        insertSessionEvent(session.id, 'lifecycle', JSON.stringify({ action: 'resumed', path: 'warm' }), req.tenantId).catch((err) => console.error(`Failed to persist lifecycle event: ${err}`));
        telemetry.emit({ sessionId: session.id, agentName: session.agentName, type: 'lifecycle', data: { status: 'active', action: 'resumed', path: 'warm' } });
        return reply.send({ session: { ...session, status: 'active' } });
      }
    } catch { /* runner gone — cold path */ }

    // Cold path: pick any healthy runner
    try {
      const oldWorkspaceDir = join(dataDir, 'sandboxes', session.id, 'workspace');
      const workspaceExists = existsSync(oldWorkspaceDir);
      let resumeSource: 'local' | 'cloud' | 'fresh' = 'fresh';

      if (!workspaceExists) {
        if (hasPersistedState(dataDir, session.id, session.tenantId)) {
          restoreSessionState(dataDir, session.id, oldWorkspaceDir, session.tenantId);
          resumeSource = 'local';
        } else {
          // Fall back to cloud storage
          const restored = await restoreStateFromCloud(dataDir, session.id, session.tenantId);
          if (restored) {
            restoreSessionState(dataDir, session.id, oldWorkspaceDir, session.tenantId);
            resumeSource = 'cloud';
          }
        }
      } else {
        resumeSource = 'local';
      }

      const workspaceAvailable = existsSync(oldWorkspaceDir);
      const { backend, runnerId } = await coordinator.selectBackend();

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

      // Track resume source
      switch (resumeSource) {
        case 'local': backend.recordColdLocalHit(); break;
        case 'cloud': backend.recordColdCloudHit(); break;
        case 'fresh': backend.recordColdFreshHit(); break;
      }
      logResume('cold', session.id, session.agentName, resumeSource);

      const effectiveRunnerId = runnerId === '__local__' ? null : runnerId;
      await updateSessionSandbox(session.id, handle.sandboxId);
      await updateSessionRunner(session.id, effectiveRunnerId);
      await updateSessionStatus(session.id, 'active');
      insertSessionEvent(session.id, 'lifecycle', JSON.stringify({ action: 'resumed', path: 'cold', source: resumeSource }), req.tenantId).catch((err) => console.error(`Failed to persist lifecycle event: ${err}`));
      telemetry.emit({ sessionId: session.id, agentName: session.agentName, type: 'lifecycle', data: { status: 'active', action: 'resumed', path: 'cold', source: resumeSource } });

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
      const backend = await coordinator.getBackendForRunnerAsync(session.runnerId);
      backend.persistState(session.sandboxId, session.id, session.agentName);
      await backend.destroySandbox(session.sandboxId);
    } catch { /* runner may be gone */ }

    await updateSessionStatus(session.id, 'ended');
    insertSessionEvent(session.id, 'lifecycle', JSON.stringify({ action: 'ended' }), req.tenantId).catch((err) => console.error(`Failed to persist lifecycle event: ${err}`));
    telemetry.emit({ sessionId: session.id, agentName: session.agentName, type: 'lifecycle', data: { status: 'ended' } });
    return reply.send({ session: { ...session, status: 'ended' } });
  });
}
