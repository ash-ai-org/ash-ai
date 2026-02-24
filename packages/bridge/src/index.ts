import net from 'node:net';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { exec as execCb } from 'node:child_process';
import { promisify } from 'node:util';
import { encode, decode, type BridgeCommand, type BridgeEvent, timingEnabled, startTimer, logTiming } from '@ash-ai/shared';
import { runQuery } from './sdk.js';

const execAsync = promisify(execCb);

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
      resumeSessionId: sdkSessionIds.get(sessionId),
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
      // Capture the SDK's session_id from result messages for future resume
      const msg = message as Record<string, unknown>;
      if (msg.session_id && typeof msg.session_id === 'string') {
        sdkSessionIds.set(sessionId, msg.session_id);
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
    case 'query': {
      const count = sessionQueryCount.get(cmd.sessionId) ?? 0;
      sessionQueryCount.set(cmd.sessionId, count + 1);
      const shouldResume = count > 0;
      return runAndStream(conn, cmd.prompt, cmd.sessionId, shouldResume, cmd.includePartialMessages);
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
