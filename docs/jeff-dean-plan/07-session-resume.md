# 07: Implement Session Resume

## Why This Is The Whole Point

Without resume, Ash is a more complicated way to run `claude --prompt "..."`. The value proposition is:

1. Start an agent session
2. Give it work
3. Come back later (hours, days)
4. Resume exactly where it left off — context, workspace, conversation history

Everything in steps 01-06 exists to make this work correctly.

## What Resume Needs

To resume a session, we need to restore:

1. **Conversation history** — the Claude Agent SDK's session state (`.claude/projects/<hash>/session.jsonl`)
2. **Workspace state** — files the agent created or modified
3. **Agent definition** — CLAUDE.md, settings, MCP configs (already in agent store, immutable)

Items 1 and 2 live inside the sandbox. When the sandbox is destroyed, they're gone — unless we save them.

## Two Resume Paths

### Fast Path: Sandbox Still Alive

If the session ended recently and the sandbox is in `cooling` state (or still `active` but idle), we can reattach:

```
Client: POST /api/sessions/:id/resume
Server: sandbox still alive? → yes → send resume command to bridge
Bridge: query({ resume: sessionId }) → picks up conversation where it left off
```

Latency: ~100ms. No state restoration needed.

### Cold Path: Sandbox Gone

The sandbox was recycled or the server restarted. We need to rebuild from saved state:

```
Client: POST /api/sessions/:id/resume
Server: sandbox alive? → no → check saved state
Server: allocate new sandbox → restore state → send resume command
Bridge: query({ resume: sessionId }) → loads restored session.jsonl → resumes
```

Latency: 2-10 seconds (sandbox creation + state restore).

## State Persistence

### What To Save

After each message exchange completes (the `done` event), persist:

```
data/sessions/<session-id>/
├── claude-state/           # Copy of .claude directory from sandbox
│   └── projects/<hash>/
│       └── session.jsonl   # Conversation history
├── workspace.tar.gz        # Snapshot of /workspace (optional, can be large)
└── metadata.json           # { agentName, sandboxId, lastMessageAt }
```

### When To Save

1. **After every `done` event** — sync the `.claude` state directory (small, fast)
2. **Workspace snapshot** — only on session pause/end (can be large, expensive)
3. **Periodic** — every 5 minutes while active, as a safety net

### How To Save (Single Machine)

For one machine, just copy files. No S3 needed.

```typescript
import { cp, mkdir } from 'node:fs/promises';

async function persistSessionState(sessionId: string, sandboxDir: string): Promise<void> {
  const stateDir = join('data/sessions', sessionId);
  await mkdir(stateDir, { recursive: true });

  // Copy .claude state (conversation history)
  const claudeDir = join(sandboxDir, 'workspace', '.claude');
  await cp(claudeDir, join(stateDir, 'claude-state'), {
    recursive: true,
    force: true,
  });

  // Write metadata
  await writeFile(join(stateDir, 'metadata.json'), JSON.stringify({
    agentName,
    lastActiveAt: new Date().toISOString(),
  }));
}
```

### How To Restore

```typescript
async function restoreSessionState(sessionId: string, sandboxWorkspaceDir: string): Promise<void> {
  const stateDir = join('data/sessions', sessionId);

  // Restore .claude state
  const claudeState = join(stateDir, 'claude-state');
  if (existsSync(claudeState)) {
    await cp(claudeState, join(sandboxWorkspaceDir, '.claude'), {
      recursive: true,
      force: true,
    });
  }

  // Restore workspace if snapshot exists
  const workspaceSnapshot = join(stateDir, 'workspace.tar.gz');
  if (existsSync(workspaceSnapshot)) {
    execSync(`tar xzf "${workspaceSnapshot}" -C "${sandboxWorkspaceDir}"`);
  }
}
```

## API

### Resume Endpoint

```
POST /api/sessions/:id/resume
```

Response: same as creating a new session (returns updated Session object).

```typescript
app.post('/api/sessions/:id/resume', async (request, reply) => {
  const session = db.getSession(request.params.id);
  if (!session) {
    return reply.status(404).send({ error: 'Session not found' });
  }
  if (session.status === 'active') {
    return reply.send({ session });  // Already active, nothing to do
  }
  if (session.status === 'ended') {
    return reply.status(410).send({ error: 'Session has ended and cannot be resumed' });
  }

  // Try fast path: sandbox still alive
  const existingSandbox = manager.getSandbox(session.sandboxId);
  if (existingSandbox && existingSandbox.info.state !== 'destroyed') {
    session.status = 'active';
    db.updateSessionStatus(session.id, 'active');
    return reply.send({ session });
  }

  // Cold path: create new sandbox and restore state
  const agent = db.getAgent(session.agentName);
  const sandbox = await manager.createSandbox({
    agentName: session.agentName,
    agentDir: agentStore.getAgentDir(session.agentName),
    sessionId: session.id,
  });

  await restoreSessionState(session.id, sandbox.workspaceDir);

  session.sandboxId = sandbox.id;
  session.status = 'active';
  db.updateSessionStatus(session.id, 'active');
  db.updateSessionSandbox(session.id, sandbox.id);

  return reply.send({ session });
});
```

### Bridge Resume Command

The bridge already supports this in the protocol (`BridgeResumeCommand`). The SDK wrapper needs to call `query()` with `resume: sessionId`:

```typescript
// In sdk-wrapper.ts
async function* runQuery(opts: QueryOptions): AsyncGenerator<BridgeEvent> {
  const q = query({
    prompt: opts.message,
    options: {
      resume: opts.resume ? opts.sessionId : undefined,
      cwd: opts.workspacePath,
      // ... other options
    },
  });

  for await (const event of q) {
    yield toBridgeEvent(event);
  }
}
```

## Session Lifecycle (Updated)

```
                  create          send message
                    │                 │
                    ▼                 ▼
  ┌──────────┐  ┌────────┐  ┌────────────┐
  │ creating │─▶│ active │◀─│  message    │──▶ active
  └──────────┘  └───┬────┘  │  exchange   │
                    │        └────────────┘
                    │
          idle timeout / explicit pause
                    │
                    ▼
              ┌──────────┐
              │  paused  │◀──── server restart (recovered from DB)
              └────┬─────┘
                   │
          resume (fast or cold path)
                   │
                   ▼
              ┌──────────┐
              │  active  │ (resumed)
              └────┬─────┘
                   │
          explicit end / TTL expiry
                   │
                   ▼
              ┌──────────┐
              │  ended   │ (state deleted after retention period)
              └──────────┘
```

## CLI Support

```bash
ash session resume <session-id>

# Equivalent to:
# POST /api/sessions/<session-id>/resume
# Then: GET /api/sessions/<session-id>/stream (reconnect SSE)
```

## Dependencies

- Step 02 (SQLite) — session state must survive restarts
- Step 03 (bridge handshake) — sandbox creation must be reliable
- Bridge SDK wrapper must support `resume` option
