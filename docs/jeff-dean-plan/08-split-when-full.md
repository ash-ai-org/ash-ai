# 08: Re-Split Server/Runner When One Machine Isn't Enough

## When To Do This

Not now. Do this when:

1. You have measured (step 06) that a single machine hits a resource ceiling
2. That ceiling is CPU/memory/process count, not a software bug
3. You actually need more than ~200-500 concurrent agent sessions

If you're not there, you're paying distributed systems tax for nothing. Stop reading and go back to steps 01-07.

## Still here? OK.

## What Changes

The consolidation in step 01 made the runner an in-process library. Now we split it back out — but this time with the correct primitives.

### Before (current, after step 01)

```
Client → ash-server (has runner in-process) → bridge
```

### After

```
Client → ash-server → gRPC → ash-runner-1 → bridge
                           → ash-runner-2 → bridge
                           → ash-runner-N → bridge
```

## Why gRPC, Not HTTP

The server→runner communication in the original implementation used HTTP/fetch. This was fine for same-machine but wrong for multi-machine:

1. **Streaming**: gRPC has bidirectional streaming built in. SSE over HTTP is client→server only. The bridge event stream is server→client, which means the original design proxied SSE from runner to server to client — two SSE streams per connection.

2. **Backpressure**: gRPC/HTTP2 has flow control per stream. HTTP/1.1 SSE does not.

3. **Multiplexing**: One gRPC connection between server and runner handles all sandboxes on that runner. HTTP would be one connection per SSE stream.

4. **Health/heartbeat**: gRPC has built-in keepalive and health checking.

## Runner Registration

When a runner starts, it registers with the control plane:

```protobuf
service RunnerRegistry {
  rpc Register(RegisterRequest) returns (RegisterResponse);
  rpc Heartbeat(stream HeartbeatRequest) returns (stream HeartbeatResponse);
}

message RegisterRequest {
  string runner_id = 1;
  string host = 2;
  int32 port = 3;
  int32 max_sandboxes = 4;
}
```

The heartbeat is a bidirectional stream. Runner sends capacity updates every 10 seconds. Server sends assignment commands.

## Session Routing

The session router (currently in-process lookups) becomes a routing table:

```sql
-- In the SQLite database (or Redis if you need cross-server)
ALTER TABLE sessions ADD COLUMN runner_id TEXT;
```

```typescript
class SessionRouter {
  async createSession(agentName: string): Promise<Session> {
    // Pick a runner with capacity
    const runner = this.runnerCoordinator.selectRunner(agentName);
    if (!runner) throw new Error('No runners with capacity');

    // Tell the runner to create a sandbox
    const sandbox = await runner.grpcClient.createSandbox({ agentName, agentDir });

    // Record routing
    db.insertSession({ ...session, runnerId: runner.id });
    return session;
  }

  async routeMessage(sessionId: string, content: string): Promise<AsyncGenerator<BridgeEvent>> {
    const session = db.getSession(sessionId);
    const runner = this.runnerCoordinator.getRunner(session.runnerId);
    return runner.grpcClient.sendMessage(session.sandboxId, content);
  }
}
```

## Runner Selection Strategy

Simple least-loaded:

```typescript
selectRunner(agentName: string): RunnerConnection | null {
  return this.runners
    .filter(r => r.healthy && r.capacity.active < r.capacity.max)
    .sort((a, b) => a.capacity.active - b.capacity.active)
    [0] ?? null;
}
```

That's it. Don't build anything fancier until you measure a problem with this.

Advanced strategies for later (not now):
- Agent affinity (prefer runners that already have warm sandboxes for this agent)
- Region awareness (route to closest runner)
- Resource-weighted selection (account for memory/CPU, not just count)

## Session Migration

When a runner goes down, its sessions need to move. Two strategies:

### Strategy A: Let it fail, client retries with resume

The simplest approach. If a runner dies:
1. Server marks all its sessions as `paused`
2. Client gets a connection error
3. Client calls `POST /api/sessions/:id/resume`
4. Server picks a different runner, cold-restores from saved state

This works because step 07 (session resume) already handles cold restoration. No new code needed.

### Strategy B: Proactive migration (later, much later)

Server detects runner going down (missed heartbeat), proactively migrates sessions to healthy runners. This is a lot of complexity for marginal benefit over Strategy A.

**Use Strategy A.**

## What This Reuses

The runner package already has:
- `api.ts` — standalone HTTP API (swap to gRPC)
- `SandboxManager` — unchanged
- `SandboxPool` — unchanged
- `BridgeClient` — unchanged

The server already has:
- `SessionRouter` — add runner selection
- `AgentStore` — unchanged (agents replicated to runners on assignment)

The split boundary is exactly where it was in the original architecture. The work in steps 01-07 didn't delete the boundary — it just stopped crossing it over HTTP for no reason.

## Estimated Capacity Per Runner

From measuring (step 06), expect per runner (c5.2xlarge, 8 vCPU, 16GB RAM):

| Sandbox limit | Bottleneck | Concurrent sessions |
|---------------|------------|-------------------|
| 512MB each | Memory | ~30 |
| 256MB each | Memory | ~60 |
| 128MB each | Memory | ~120 |
| No memory limit | CPU (8 cores) | ~50-200 (depends on agent activity) |

The "1000 sandboxes per runner" number from the original plan is aspirational. Real number depends on what agents actually do. Measure it.

## What's Next

Step 08 scales the data plane (runners). If the single coordinator becomes the bottleneck — either for SSE fan-out or for redundancy — see [Step 09: Multi-Coordinator](./09-multi-coordinator.md). It requires CRDB and is ~100 lines of code changes.
