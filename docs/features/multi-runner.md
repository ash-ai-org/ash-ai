# Multi-Runner Architecture

*Added: 2026-02-18 (Step 08)*

## What

Ash supports two operating modes:

- **Standalone** (default): Server manages sandboxes locally via an in-process `SandboxPool`. Everything runs on one machine. Zero configuration needed.
- **Coordinator**: Server acts as a pure control plane. One or more **runner** processes handle sandbox lifecycle on separate hosts. The server routes sessions to the least-loaded runner.

## Why

Single-machine Ash handles dozens of concurrent sessions comfortably. When you need more capacity — hundreds of concurrent agents, or agents that need different hardware (GPU, high memory) — you add runner nodes rather than scaling up the control plane.

## How It Works

### Standalone Mode (Default)

```
Client → ash-server (port 4100) → LocalRunnerBackend → SandboxPool → Bridge processes
```

The server creates a `SandboxPool` and wraps it in a `LocalRunnerBackend`. A `RunnerCoordinator` always exists but in standalone mode it only has this one local backend. Session routes use the coordinator to select backends, but the coordinator always returns the local one.

### Coordinator Mode

```
Client → ash-server (port 4100) → RunnerCoordinator → Runner A (port 4200)
                                                     → Runner B (port 4201)
```

The server has no local `SandboxPool`. Runners register via `POST /api/internal/runners/register` and send periodic heartbeats. The coordinator picks the runner with the most available capacity for new sessions.

### Runner Process

Each runner:
1. Creates its own `SandboxPool` with an in-memory DB
2. Starts a Fastify server (default port 4200)
3. Registers with the central server via `ASH_SERVER_URL`
4. Sends heartbeats every 10 seconds with pool stats
5. Exposes HTTP endpoints for sandbox management

Runner endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/runner/sandboxes` | POST | Create a sandbox |
| `/runner/sandboxes/:id` | DELETE | Destroy a sandbox |
| `/runner/sandboxes/:id/cmd` | POST | Send command, returns SSE stream |
| `/runner/sandboxes/:id/persist` | POST | Persist sandbox state |
| `/runner/sandboxes/:id/mark` | POST | Mark running/waiting |
| `/runner/sandboxes/:id` | GET | Get sandbox info |
| `/runner/health` | GET | Runner status + pool stats |

### Session Routing

The `RunnerCoordinator` tracks registered runners and selects the best one:

1. **New session**: `coordinator.selectBackend()` picks the runner with the most available capacity (max sandboxes minus running minus warming). Falls back to local backend in standalone mode.
2. **Existing session**: `coordinator.getBackendForRunner(session.runnerId)` routes to the runner that owns the session.
3. **Resume**: Tries the original runner first (fast path). If it's dead, picks any healthy runner (cold path — requires shared filesystem or state persistence).

### Failure Handling

**Runner dies mid-session**: The coordinator's liveness sweep detects missed heartbeats after 30 seconds. All active sessions on the dead runner are marked `paused`. Clients can resume them — the coordinator will route to a different runner.

**Runner comes back**: It re-registers. New sessions can be routed to it. Old sessions are still marked paused — the client must explicitly resume.

**No runners available**: The server returns `503 Service Unavailable` with a descriptive error.

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ASH_MODE` | `standalone` | Server mode: `standalone` or `coordinator` |
| `ASH_RUNNER_ID` | hostname | Unique runner identifier |
| `ASH_RUNNER_PORT` | `4200` | Runner HTTP port |
| `ASH_SERVER_URL` | — | Control plane URL (runner registers here) |
| `ASH_RUNNER_ADVERTISE_HOST` | `localhost` | Host the runner advertises to the server |
| `ASH_MAX_SANDBOXES` | `100` | Max sandboxes per runner (or standalone server) |

### Starting a Runner

```bash
ASH_RUNNER_ID=runner-1 \
ASH_RUNNER_PORT=4200 \
ASH_SERVER_URL=http://server:4100 \
ASH_RUNNER_ADVERTISE_HOST=runner-1.internal \
node packages/runner/dist/index.js
```

### Starting the Server in Coordinator Mode

```bash
ASH_MODE=coordinator node packages/server/dist/index.js
```

## Architecture Details

### RunnerBackend Interface

Both `LocalRunnerBackend` and `RemoteRunnerBackend` implement this interface:

```typescript
interface RunnerBackend {
  createSandbox(opts: CreateSandboxRequest): Promise<SandboxHandle>;
  destroySandbox(sandboxId: string): Promise<void>;
  destroyAll(): Promise<void>;
  sendCommand(sandboxId: string, cmd: BridgeCommand): AsyncGenerator<BridgeEvent>;
  getSandbox(sandboxId: string): SandboxHandle | undefined;
  isSandboxAlive(sandboxId: string): boolean;
  markRunning(sandboxId: string): void;
  markWaiting(sandboxId: string): void;
  persistState(sandboxId: string, sessionId: string, agentName: string): boolean;
  getStats(): Promise<PoolStats>;
  readonly activeCount: number;
}
```

### Package Layout

```
packages/sandbox/   — SandboxPool, SandboxManager, BridgeClient, state persistence
packages/runner/    — Standalone runner process (imports @ash-ai/sandbox)
packages/server/    — Control plane + RunnerCoordinator (imports @ash-ai/sandbox)
```

### Database Schema

Sessions track which runner owns them:

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  agent_name TEXT NOT NULL,
  sandbox_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'starting',
  runner_id TEXT,  -- NULL for local, runner ID for remote
  created_at TEXT NOT NULL,
  last_active_at TEXT NOT NULL
);
```

## Limitations

- **Cross-runner resume requires cloud persistence or shared filesystem.** If runner A dies and you resume on runner B, workspace files must be reachable from B. Options: (1) Set `ASH_SNAPSHOT_URL` for cloud-backed persistence (S3/GCS) — no shared filesystem needed. (2) Use NFS, EFS, or similar shared filesystem. See `docs/features/session-resume.md` for details on cloud-backed persistence.
- **No automatic session migration**. If a runner is overloaded, existing sessions stay on it. Only new sessions get routed elsewhere.
- **In-memory runner state**. The runner uses an in-memory sandbox DB. If the runner process restarts, all its sandbox tracking is lost. Sessions on the server side are still in the server's database and can be resumed.
- **No authentication** on internal runner endpoints. Deploy runners on a private network.
