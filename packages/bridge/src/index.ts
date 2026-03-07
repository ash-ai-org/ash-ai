// OTEL must initialize before any HTTP modules are imported
import { initBridgeTracing, shutdownBridgeTracing, extractTraceContext, getBridgeTracer } from './tracing.js';
await initBridgeTracing();

import net from 'node:net';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { exec as execCb } from 'node:child_process';
import { promisify } from 'node:util';
import { encode, decode, type BridgeCommand, type BridgeEvent, timingEnabled, startTimer, logTiming } from '@ash-ai/shared';
import { runQuery } from './sdk.js';
import { context as otelContext, trace as otelTrace, SpanStatusCode, type Span } from '@opentelemetry/api';

const execAsync = promisify(execCb);

const socketPath = process.env.ASH_BRIDGE_SOCKET!;
const agentDir = process.env.ASH_AGENT_DIR!;
const workspaceDir = process.env.ASH_WORKSPACE_DIR!;

if (!socketPath || !agentDir || !workspaceDir) {
  console.error('Missing required env: ASH_BRIDGE_SOCKET, ASH_AGENT_DIR, ASH_WORKSPACE_DIR');
  process.exit(1);
}

// Load agent instructions — prefer workspace copy (supports per-session overrides),
// fall back to agent source directory.
let claudeMd = '';
try {
  claudeMd = await readFile(join(workspaceDir, 'CLAUDE.md'), 'utf-8');
} catch {
  try {
    claudeMd = await readFile(join(agentDir, 'CLAUDE.md'), 'utf-8');
  } catch {
    // No CLAUDE.md — that's fine, validator should have caught this earlier
  }
}

let currentAbort: AbortController | null = null;
// Track which sessions have had at least one query, so we resume on subsequent turns
const sessionQueryCount = new Map<string, number>();
// Map Ash session IDs to SDK session IDs (captured from result messages)
const sdkSessionIds = new Map<string, string>();

async function send(conn: net.Socket, event: BridgeEvent): Promise<void> {
  const canWrite = conn.write(encode(event));
  if (!canWrite) {
    await new Promise<void>((resolve) => conn.once('drain', resolve));
  }
}

async function runAndStream(conn: net.Socket, prompt: string, sessionId: string, resume: boolean, sdkOpts?: {
  includePartialMessages?: boolean;
  model?: string;
  maxTurns?: number;
  maxBudgetUsd?: number;
  effort?: 'low' | 'medium' | 'high' | 'max';
  thinking?: { type: string; budgetTokens?: number };
  outputFormat?: { type: string; schema: Record<string, unknown> };
  allowedTools?: string[];
  disallowedTools?: string[];
  betas?: string[];
  subagents?: Record<string, unknown>;
  initialAgent?: string;
  traceContext?: string;
}): Promise<void> {
  currentAbort = new AbortController();

  const timing = timingEnabled();
  const elapsed = timing ? startTimer() : null;
  let eventCount = 0;
  let sdkFirstTokenMs = 0;
  const cmdParseMs = elapsed?.() ?? 0;

  // Set up OTEL tracing — link to coordinator's trace via traceContext
  const tracer = getBridgeTracer();
  const parentCtx = extractTraceContext(sdkOpts?.traceContext);
  const querySpan = tracer.startSpan('ash.bridge.query', {
    attributes: {
      'ash.session.id': sessionId,
      ...(sdkOpts?.model && { 'ash.model': sdkOpts.model }),
    },
  }, parentCtx);
  const queryCtx = otelTrace.setSpan(parentCtx, querySpan);

  // Span state machine for streaming messages
  let turnSpan: Span | null = null;
  let blockSpan: Span | null = null;

  try {
    await otelContext.with(queryCtx, async () => {
    for await (const message of runQuery({
      prompt,
      sessionId,
      resumeSessionId: sdkSessionIds.get(sessionId),
      workspaceDir,
      claudeMd,
      resume,
      signal: currentAbort!.signal,
      ...sdkOpts,
    })) {
      eventCount++;
      if (eventCount === 1 && elapsed) {
        sdkFirstTokenMs = elapsed();
      }

      const msg = message as Record<string, unknown>;

      // Span instrumentation based on message type
      if (msg.type === 'stream_event') {
        const event = msg.event as Record<string, unknown> | undefined;
        const eventType = event?.type as string | undefined;

        if (eventType === 'message_start') {
          turnSpan = tracer.startSpan('ash.agent.turn', {}, queryCtx);
        } else if (eventType === 'content_block_start') {
          // Parent block spans to the turn span when available, otherwise query span
          const blockParent = turnSpan ? otelTrace.setSpan(queryCtx, turnSpan) : queryCtx;
          const block = event?.content_block as Record<string, unknown> | undefined;
          const blockType = block?.type as string;
          if (blockType === 'thinking') {
            blockSpan = tracer.startSpan('ash.agent.thinking', {}, blockParent);
          } else if (blockType === 'tool_use') {
            const toolName = block?.name as string | undefined;
            const toolId = block?.id as string | undefined;
            blockSpan = tracer.startSpan('ash.tool.use', {
              attributes: {
                ...(toolName && { 'ash.tool.name': toolName }),
                ...(toolId && { 'ash.tool.id': toolId }),
              },
            }, blockParent);
          } else if (blockType === 'text') {
            blockSpan = tracer.startSpan('ash.agent.text', {}, blockParent);
          }
        } else if (eventType === 'content_block_stop') {
          if (blockSpan) { blockSpan.end(); blockSpan = null; }
        } else if (eventType === 'message_stop') {
          if (turnSpan) { turnSpan.end(); turnSpan = null; }
        }
      } else if (msg.type === 'user') {
        // Tool result message — record as a span event on the query
        querySpan.addEvent('ash.tool.result');
      } else if (msg.type === 'result') {
        // Final result — record usage attributes
        if (typeof msg.cost_usd === 'number') querySpan.setAttribute('ash.cost_usd', msg.cost_usd);
        if (typeof msg.num_turns === 'number') querySpan.setAttribute('ash.num_turns', msg.num_turns);
        // Extract token counts from usage if available
        const usage = msg.usage as Record<string, unknown> | undefined;
        if (usage) {
          if (typeof usage.input_tokens === 'number') querySpan.setAttribute('ash.tokens.input', usage.input_tokens);
          if (typeof usage.output_tokens === 'number') querySpan.setAttribute('ash.tokens.output', usage.output_tokens);
        }
      }

      // Capture the SDK's session_id from result messages for future resume
      if (msg.session_id && typeof msg.session_id === 'string') {
        sdkSessionIds.set(sessionId, msg.session_id);
      }
      await send(conn, { ev: 'message', data: message });
    }
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    querySpan.setStatus({ code: SpanStatusCode.ERROR, message: errMsg });
    querySpan.recordException(err instanceof Error ? err : new Error(errMsg));
    await send(conn, { ev: 'error', error: errMsg });
  } finally {
    // Clean up any unclosed spans
    if (blockSpan) (blockSpan as Span).end();
    if (turnSpan) (turnSpan as Span).end();
    querySpan.end();
  }

  if (elapsed) {
    logTiming({
      type: 'timing',
      source: 'bridge',
      sessionId,
      cmdParseMs: Math.round(cmdParseMs * 100) / 100,
      sdkFirstTokenMs: Math.round(sdkFirstTokenMs * 100) / 100,
      totalMs: Math.round(elapsed() * 100) / 100,
      eventCount,
      timestamp: new Date().toISOString(),
    });
  }

  await send(conn, { ev: 'done', sessionId });
  currentAbort = null;
}

async function handleCommand(conn: net.Socket, cmd: BridgeCommand): Promise<void> {
  switch (cmd.cmd) {
    case 'query': {
      const count = sessionQueryCount.get(cmd.sessionId) ?? 0;
      sessionQueryCount.set(cmd.sessionId, count + 1);
      const shouldResume = count > 0;
      // Extract SDK-passthrough fields (everything except cmd, prompt, sessionId)
      const { cmd: _, prompt: __, sessionId: ___, ...sdkOpts } = cmd;
      return runAndStream(conn, cmd.prompt, cmd.sessionId, shouldResume, sdkOpts as typeof sdkOpts & { traceContext?: string });
    }

    case 'resume':
      return runAndStream(conn, '', cmd.sessionId, true);

    case 'exec': {
      const timeout = cmd.timeout ?? 30000;
      try {
        const { stdout, stderr } = await execAsync(cmd.command, {
          cwd: workspaceDir,
          timeout,
          maxBuffer: 10 * 1024 * 1024,
        });
        await send(conn, { ev: 'exec_result', exitCode: 0, stdout: stdout ?? '', stderr: stderr ?? '' });
      } catch (err: unknown) {
        const e = err as { code?: number; killed?: boolean; stdout?: string; stderr?: string };
        await send(conn, { ev: 'exec_result', exitCode: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' });
      }
      await send(conn, { ev: 'done', sessionId: '' });
      return;
    }

    case 'interrupt':
      currentAbort?.abort();
      currentAbort = null;
      break;

    case 'shutdown':
      currentAbort?.abort();
      server.close();
      process.exit(0);
  }
}

// Maximum buffer size to prevent memory exhaustion from a single giant message (10MB)
const MAX_BUFFER_SIZE = 10 * 1024 * 1024;

/**
 * Sanitize an error message for sending over the socket.
 * Strips file paths and other internal details to prevent information disclosure.
 * The full error is logged server-side for debugging.
 */
function sanitizeErrorMessage(msg: string): string {
  // Replace absolute file paths (Unix and Windows-style)
  return msg.replace(/(?:\/[\w.\-]+)+(?:\/[\w.\-]+)|(?:[A-Z]:\\[\w.\-\\]+)/g, '<path>');
}

// Unix socket server
const server = net.createServer((conn) => {
  // Fire-and-forget for ready — connection just opened, buffer is empty
  conn.write(encode({ ev: 'ready' } satisfies BridgeEvent));

  let buffer = '';
  conn.on('data', (chunk) => {
    buffer += chunk.toString();

    // Guard against memory exhaustion: reject connections that send
    // more data than MAX_BUFFER_SIZE without a newline delimiter.
    if (buffer.length > MAX_BUFFER_SIZE) {
      console.error(`[bridge] Buffer exceeded ${MAX_BUFFER_SIZE} bytes, destroying connection`);
      conn.destroy();
      return;
    }

    let newline: number;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (line.trim()) {
        const cmd = decode(line) as BridgeCommand;
        handleCommand(conn, cmd).catch(async (err) => {
          const fullMessage = String(err);
          console.error(`[bridge] handleCommand error: ${fullMessage}`);
          await send(conn, { ev: 'error', error: sanitizeErrorMessage(fullMessage) });
        });
      }
    }
  });

  conn.on('error', () => {
    currentAbort?.abort();
  });
});

server.listen(socketPath, () => {
  // Signal readiness to parent — eliminates polling in BridgeClient.connect()
  process.stdout.write('R');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  currentAbort?.abort();
  server.close();
  await shutdownBridgeTracing();
  process.exit(0);
});
