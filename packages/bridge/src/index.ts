import net from 'node:net';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { encode, decode, type BridgeCommand, type BridgeEvent, timingEnabled, startTimer, logTiming } from '@ash-ai/shared';
import { runQuery } from './sdk.js';

const socketPath = process.env.ASH_BRIDGE_SOCKET!;
const agentDir = process.env.ASH_AGENT_DIR!;
const workspaceDir = process.env.ASH_WORKSPACE_DIR!;

if (!socketPath || !agentDir || !workspaceDir) {
  console.error('Missing required env: ASH_BRIDGE_SOCKET, ASH_AGENT_DIR, ASH_WORKSPACE_DIR');
  process.exit(1);
}

// Load agent instructions
let claudeMd = '';
try {
  claudeMd = await readFile(join(agentDir, 'CLAUDE.md'), 'utf-8');
} catch {
  // No CLAUDE.md — that's fine, validator should have caught this earlier
}

let currentAbort: AbortController | null = null;

async function send(conn: net.Socket, event: BridgeEvent): Promise<void> {
  const canWrite = conn.write(encode(event));
  if (!canWrite) {
    await new Promise<void>((resolve) => conn.once('drain', resolve));
  }
}

async function runAndStream(conn: net.Socket, prompt: string, sessionId: string, resume: boolean, includePartialMessages?: boolean): Promise<void> {
  currentAbort = new AbortController();

  const timing = timingEnabled();
  const elapsed = timing ? startTimer() : null;
  let eventCount = 0;
  let sdkFirstTokenMs = 0;
  const cmdParseMs = elapsed?.() ?? 0;

  try {
    for await (const message of runQuery({
      prompt,
      sessionId,
      workspaceDir,
      claudeMd,
      resume,
      signal: currentAbort.signal,
      includePartialMessages,
    })) {
      eventCount++;
      if (eventCount === 1 && elapsed) {
        sdkFirstTokenMs = elapsed();
      }
      await send(conn, { ev: 'message', data: message });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await send(conn, { ev: 'error', error: msg });
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
    case 'query':
      return runAndStream(conn, cmd.prompt, cmd.sessionId, false, cmd.includePartialMessages);

    case 'resume':
      return runAndStream(conn, '', cmd.sessionId, true);

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

// Unix socket server
const server = net.createServer((conn) => {
  // Fire-and-forget for ready — connection just opened, buffer is empty
  conn.write(encode({ ev: 'ready' } satisfies BridgeEvent));

  let buffer = '';
  conn.on('data', (chunk) => {
    buffer += chunk.toString();
    let newline: number;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (line.trim()) {
        const cmd = decode(line) as BridgeCommand;
        handleCommand(conn, cmd).catch(async (err) => {
          await send(conn, { ev: 'error', error: String(err) });
        });
      }
    }
  });

  conn.on('error', () => {
    currentAbort?.abort();
  });
});

server.listen(socketPath, () => {
  // Bridge is ready — server will detect via 'ready' event on connect
});

// Graceful shutdown
process.on('SIGTERM', () => {
  currentAbort?.abort();
  server.close();
  process.exit(0);
});
