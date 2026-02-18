# Session Resume

**Date**: 2026-02-18
**Status**: Implemented (Step 07 of the plan)

## What

Users can pause a session, come back later, and resume with full conversation context preserved. Two resume paths:

- **Fast path**: Sandbox still alive, bridge process running. Resume is instant — just flip status back to `active`.
- **Cold path**: Sandbox gone (process exited, server restarted). Create a new sandbox in the same workspace directory, restoring `.claude` state so the SDK picks up the previous session.

## Why

Without resume, any sandbox crash, OOM kill, or intentional pause permanently loses the conversation. The user has to start over. Resume makes sessions durable across transient failures.

## How

### Stable Workspace Paths

The Claude Code SDK stores session state at `.claude/projects/<hash>/session.jsonl` where `<hash>` is derived from `cwd`. For cold-path resume to find the previous session, the new sandbox must have the **same workspace path** as the original.

**Solution**: Use `sessionId` as the sandbox directory name (instead of `randomUUID()`). Workspace paths become deterministic: `data/sandboxes/<sessionId>/workspace`. Since `SandboxManager.destroy()` does NOT delete the workspace directory, `.claude` state survives sandbox destruction.

### State Persistence

After every completed message turn (on `done` event), the server copies the **entire workspace** to `data/sessions/<sessionId>/workspace/`. This includes agent files, `.claude` session state, and any files the agent created during the session.

If the sandbox workspace directory is gone on cold-path resume (server restart, manual cleanup, etc.), the persisted workspace is restored in its entirety before spawning the new sandbox.

### API

#### `POST /api/sessions/:id/pause`

Pauses an active session. Persists the full workspace and keeps the sandbox alive (enabling fast-path resume later).

- **Precondition**: Session status must be `active`
- **Effect**: Status → `paused`, sandbox stays running
- **Response**: `{ session: Session }` with `status: "paused"`

#### `POST /api/sessions/:id/resume`

Resumes a paused, errored, or starting session.

- `active` → Returns session as-is (no-op)
- `ended` → 410 Gone (terminal state — create a new session)
- `paused` / `error` / `starting` → Attempts resume:
  1. **Fast path**: If sandbox process still alive, flip status to `active`
  2. **Cold path**: Create new sandbox with same ID. If old workspace exists, skip agent copy. If workspace gone, restore full persisted workspace (or create fresh from agent if no backup).
- **Response**: `{ session: Session }` with `status: "active"`

### Resume Flow

```
POST /sessions/:id/resume
  │
  ├─ status=ended → 410 Gone
  ├─ status=active → return as-is
  │
  └─ status=paused/error/starting
       │
       ├─ sandbox alive? → fast path: set active, return
       │
       └─ cold path:
            ├─ old workspace exists? → create sandbox with skipAgentCopy=true
            ├─ workspace gone + persisted state? → restore full workspace, then skipAgentCopy
            ├─ workspace gone + no state? → create sandbox normally (fresh agent copy)
            └─ update DB sandbox_id + status=active
```

### CLI

```bash
ash session pause <session-id>
ash session resume <session-id>
```

### SDK

```typescript
const client = new AshClient({ serverUrl: 'http://localhost:4100' });

// Pause
const paused = await client.pauseSession(sessionId);

// Resume (works after pause, error, or server restart)
const resumed = await client.resumeSession(sessionId);
```

## Key Decisions

1. **SessionId = sandbox dir name**: Stable workspace paths so SDK session hash matches across cold-path resume.
2. **Full workspace persisted after every `done`**: Includes agent files, `.claude` state, and any files the agent created.
3. **Sandbox stays alive on pause**: Enables fast-path resume. Idle cleanup is a future concern.
4. **`error` status is resumable**: Transient failures shouldn't permanently kill sessions.
5. **`ended` is terminal**: 410 Gone. User chose to end — create a new session.
6. **Best-effort persistence**: Log errors but don't fail the message response.

## Cloud-Backed Persistence

*Added: 2026-02-18*

Local-only persistence breaks down when the machine dies or when resuming on a different runner. Cloud object storage (S3, GCS) solves both problems.

### Design: Local-First, Cloud-Second

- **Persist**: Local `cpSync` (synchronous) → tar.gz + cloud upload (async, fire-and-forget)
- **Restore**: Check local → if missing, download from cloud → extract → use
- **Delete**: Local `rmSync` + cloud delete (async, fire-and-forget)

The local path is unchanged. Cloud sync is purely additive — an async background upload after each successful local persist. If the upload fails, nothing breaks.

### Configuration

Set `ASH_SNAPSHOT_URL` to enable cloud persistence:

```bash
# S3
ASH_SNAPSHOT_URL=s3://my-bucket/ash-snapshots/

# GCS
ASH_SNAPSHOT_URL=gs://my-bucket/ash-snapshots/
```

If not set, behavior is identical to before (local-only).

Optional: `ASH_S3_REGION` overrides the S3 region (default: `us-east-1`).

### Resume Flow with Cloud Fallback

```
POST /sessions/:id/resume (cold path)
  │
  ├─ old workspace dir exists? → use it
  ├─ local persisted state exists? → restore locally
  ├─ cloud snapshot exists? → download, extract, restore locally
  └─ none of the above → fresh agent copy
```

### Security

AWS/GCS credentials (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `GOOGLE_APPLICATION_CREDENTIALS`) are NOT in the `SANDBOX_ENV_ALLOWLIST`. They cannot leak into sandbox processes. `ASH_SNAPSHOT_URL` is also excluded.

### Dependencies

- `@aws-sdk/client-s3` — installed in server and runner packages
- `@google-cloud/storage` — optional peer dependency, install if using GCS

## Limitations

- Full workspace copy can be large if the agent creates many files. A more efficient delta/incremental approach is deferred.
- No idle sandbox cleanup yet — paused sessions keep their sandbox process alive indefinitely.
- Cold-path resume requires re-establishing the bridge connection (new process spawn), which takes a few seconds.
- Cloud upload is fire-and-forget. If the process crashes between local persist and cloud upload completing, the cloud copy may be stale.
