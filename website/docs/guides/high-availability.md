---
sidebar_position: 8
title: High Availability & Failover
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# High Availability & Failover

Ash sessions survive server restarts, sandbox crashes, and machine migrations. This guide shows how to write client code that handles these scenarios gracefully with code examples for session recovery, health monitoring, and distributed state management.

For the architecture behind these features, see [Scaling Architecture](../architecture/scaling.md) and [State Persistence](../architecture/state-persistence.md).

## Session Recovery After Failures

### Resuming After a Server Restart

When the Ash server restarts, all sandbox processes are destroyed but session metadata and workspace snapshots persist in the database and on disk. Call `resumeSession` to restore the session.

<Tabs groupId="sdk-language">
<TabItem value="typescript" label="TypeScript">

```typescript
import { AshClient } from '@ash-ai/sdk';

const client = new AshClient({
  serverUrl: 'http://localhost:4100',
  apiKey: process.env.ASH_API_KEY,
});

// Store the session ID in your application's database
const sessionId = getStoredSessionId(userId);

async function sendWithRecovery(sessionId: string, message: string) {
  try {
    // Try sending a message to the existing session
    const events = client.sendMessageStream(sessionId, message);
    for await (const event of events) {
      if (event.type === 'message') {
        console.log(event.data);
      }
    }
  } catch (err) {
    // Session's sandbox was destroyed (server restart, OOM, idle eviction)
    // Resume creates a new sandbox and restores the workspace
    console.log('Session interrupted, resuming...');
    const session = await client.resumeSession(sessionId);
    console.log(`Resumed session (status: ${session.status})`);

    // Retry the message on the restored session
    for await (const event of client.sendMessageStream(sessionId, message)) {
      if (event.type === 'message') {
        console.log(event.data);
      }
    }
  }
}
```

</TabItem>
<TabItem value="python" label="Python">

```python
from ash_ai import AshClient, AshApiError

client = AshClient(
    server_url="http://localhost:4100",
    api_key=os.environ["ASH_API_KEY"],
)

session_id = get_stored_session_id(user_id)

def send_with_recovery(session_id: str, message: str):
    try:
        for event in client.send_message_stream(session_id, message):
            if event.type == "message":
                print(event.data)
    except Exception:
        # Session's sandbox was destroyed — resume and retry
        print("Session interrupted, resuming...")
        session = client.resume_session(session_id)
        print(f"Resumed session (status: {session.status})")

        for event in client.send_message_stream(session_id, message):
            if event.type == "message":
                print(event.data)
```

</TabItem>
</Tabs>

### Resume Paths: Warm vs. Cold

When you call `resumeSession`, Ash takes the fastest available path:

| Path | When | Latency | What happens |
|------|------|---------|-------------|
| **Warm** | Sandbox process is still alive | Instant | Status flipped to `active`, no data copied |
| **Cold (local)** | Sandbox was evicted but local snapshot exists | ~1 second | New sandbox created, workspace restored from local disk |
| **Cold (cloud)** | Server restarted or session migrated to a different machine | ~5-10 seconds | New sandbox created, workspace downloaded from S3/GCS |
| **Cold (fresh)** | No snapshot exists | ~1 second | New sandbox created from agent definition, conversation history still preserved in database |

In all cases, the database retains the full conversation history. The agent's Claude session state (`.claude/` directory) is part of the workspace snapshot, so multi-turn context is preserved.

### Handling the `410 Gone` Response

Ended sessions cannot be resumed. If a session was explicitly ended (via `DELETE /api/sessions/:id`), resume returns 410:

<Tabs groupId="sdk-language">
<TabItem value="typescript" label="TypeScript">

```typescript
try {
  await client.resumeSession(sessionId);
} catch (err) {
  if (err.message.includes('410') || err.message.includes('ended')) {
    // Session was permanently ended — create a new one
    const newSession = await client.createSession('my-agent');
    console.log(`Old session ended. Created new session: ${newSession.id}`);
  } else {
    throw err;
  }
}
```

</TabItem>
<TabItem value="python" label="Python">

```python
from ash_ai import AshApiError

try:
    client.resume_session(session_id)
except AshApiError as e:
    if e.status_code == 410:
        # Session was permanently ended — create a new one
        new_session = client.create_session("my-agent")
        print(f"Old session ended. Created new session: {new_session.id}")
    else:
        raise
```

</TabItem>
</Tabs>

## Health Monitoring

### Polling the Health Endpoint

The `/health` endpoint returns server status, active session counts, and sandbox pool statistics. Use it to monitor capacity and detect issues.

<Tabs groupId="sdk-language">
<TabItem value="typescript" label="TypeScript">

```typescript
const health = await client.health();

console.log(`Status: ${health.status}`);                    // "ok"
console.log(`Active sessions: ${health.activeSessions}`);   // 12
console.log(`Active sandboxes: ${health.activeSandboxes}`); // 10
console.log(`Uptime: ${health.uptime}s`);                   // 3600

// Pool statistics
const pool = health.pool;
console.log(`Total sandboxes: ${pool.total}`);       // 15
console.log(`Running: ${pool.running}`);             // 8
console.log(`Warming: ${pool.warming}`);             // 2
console.log(`Cold: ${pool.cold}`);                   // 5
console.log(`Max capacity: ${pool.maxCapacity}`);    // 1000

// Check if capacity is getting low
const utilizationPercent = (pool.running / pool.maxCapacity) * 100;
if (utilizationPercent > 80) {
  console.warn(`High utilization: ${utilizationPercent.toFixed(1)}%`);
}
```

</TabItem>
<TabItem value="python" label="Python">

```python
health = client.health()

print(f"Status: {health['status']}")
print(f"Active sessions: {health['activeSessions']}")
print(f"Active sandboxes: {health['activeSandboxes']}")

pool = health["pool"]
utilization = (pool["running"] / pool["maxCapacity"]) * 100
if utilization > 80:
    print(f"Warning: high utilization ({utilization:.1f}%)")
```

</TabItem>
</Tabs>

### Prometheus Metrics

The `/metrics` endpoint exposes Prometheus-formatted metrics for production monitoring:

```promql
# Cold resume by workspace source (local, cloud, fresh)
ash_resume_cold_total{source="local"} 42
ash_resume_cold_total{source="cloud"} 8
ash_resume_cold_total{source="fresh"} 3

# Alert on high fresh-start rate (indicates state loss)
rate(ash_resume_cold_total{source="fresh"}[5m]) > 0.1

# Monitor sandbox utilization
ash_pool_running / ash_pool_max_capacity > 0.8
```

## Distributed Deployment

### Multi-Runner Setup

In multi-runner mode, a coordinator routes sessions to runners. Sessions are pinned to a runner at creation time but can be migrated to a different runner on resume.

```bash
# Start the coordinator
ASH_MODE=coordinator \
ASH_DATABASE_URL=postgres://user:pass@db:5432/ash \
ASH_INTERNAL_SECRET=shared-secret-123 \
ash start

# Start runner 1 (on a different machine)
ASH_RUNNER_ID=runner-1 \
ASH_SERVER_URL=http://coordinator:4100 \
ASH_INTERNAL_SECRET=shared-secret-123 \
ash start --runner

# Start runner 2 (on another machine)
ASH_RUNNER_ID=runner-2 \
ASH_SERVER_URL=http://coordinator:4100 \
ASH_INTERNAL_SECRET=shared-secret-123 \
ash start --runner
```

From the client's perspective, nothing changes. The coordinator handles routing transparently:

```typescript
// Client talks to the coordinator — same API as standalone mode
const client = new AshClient({
  serverUrl: 'http://coordinator:4100',
  apiKey: process.env.ASH_API_KEY,
});

// The coordinator routes this to the runner with most available capacity
const session = await client.createSession('my-agent');
```

### Session Migration Between Runners

When a runner dies, sessions are automatically marked as `paused`. The next `resumeSession` call routes the session to a healthy runner and restores the workspace from a snapshot.

<Tabs groupId="sdk-language">
<TabItem value="typescript" label="TypeScript">

```typescript
// Runner 1 dies while the session is active
// The coordinator's dead-runner sweep (every 30s) marks sessions as "paused"

// Client detects the disconnection and resumes
const session = await client.getSession(sessionId);
if (session.status === 'paused' || session.status === 'error') {
  // This routes to a healthy runner (e.g., runner-2)
  // Workspace is restored from local snapshot or cloud (S3/GCS)
  const resumed = await client.resumeSession(sessionId);
  console.log(`Session migrated to runner: ${resumed.runnerId}`);
}
```

</TabItem>
<TabItem value="python" label="Python">

```python
# Runner 1 dies — coordinator marks sessions as "paused"

session = client.get_session(session_id)
if session.status in ("paused", "error"):
    # Routes to a healthy runner, restores workspace from snapshot
    resumed = client.resume_session(session_id)
    print(f"Session migrated to runner: {resumed.runner_id}")
```

</TabItem>
</Tabs>

### Multi-Coordinator Setup

For control plane redundancy, run multiple coordinators behind a load balancer. All coordinators share the same database — they hold no authoritative state in memory.

```bash
# Load balancer distributes requests across coordinators
# Any coordinator can route to any runner

# Coordinator 1
ASH_MODE=coordinator \
ASH_DATABASE_URL=postgres://user:pass@db:5432/ash \
ASH_INTERNAL_SECRET=shared-secret-123 \
ASH_PORT=4100 \
ash start

# Coordinator 2 (same database, different machine)
ASH_MODE=coordinator \
ASH_DATABASE_URL=postgres://user:pass@db:5432/ash \
ASH_INTERNAL_SECRET=shared-secret-123 \
ASH_PORT=4100 \
ash start
```

SSE streams automatically recover when a coordinator fails:

```
Client → LB → Coordinator 1 → Runner  (SSE stream active)
              Coordinator 1 dies
Client → LB → Coordinator 2 → Runner  (SSE stream reconnects)
```

The client-side SSE reconnect flows through the load balancer to a healthy coordinator, which looks up the session's runner in the database and re-establishes the proxy.

## Cloud Persistence for Cross-Machine Resume

Enable cloud snapshots so sessions can resume on any machine, even after all local data is lost:

```bash
# Amazon S3
ASH_SNAPSHOT_URL=s3://my-bucket/ash-snapshots/

# Google Cloud Storage
ASH_SNAPSHOT_URL=gs://my-bucket/ash-snapshots/
```

With cloud persistence enabled, the restore chain is:

1. **Live workspace** (instant) — sandbox still has the files
2. **Local snapshot** (fast) — files on the same machine's disk
3. **Cloud snapshot** (slower) — downloaded from S3/GCS
4. **Fresh** (fallback) — no backup found, creates from agent definition

```typescript
// Monitor which restore path is being used
const health = await client.health();
console.log(`Local restores: ${health.pool.resumeColdLocalHits}`);
console.log(`Cloud restores: ${health.pool.resumeColdCloudHits}`);
console.log(`Fresh starts: ${health.pool.resumeColdFreshHits}`);

// High fresh-start count means snapshots aren't being created
// Check that ASH_SNAPSHOT_URL is set and credentials are correct
```

## Complete Resilient Client Example

This example combines all the patterns — retry with backoff, session recovery, and health monitoring:

<Tabs groupId="sdk-language">
<TabItem value="typescript" label="TypeScript">

```typescript
import { AshClient, extractTextFromEvent } from '@ash-ai/sdk';

const client = new AshClient({
  serverUrl: process.env.ASH_SERVER_URL || 'http://localhost:4100',
  apiKey: process.env.ASH_API_KEY,
});

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send a message with automatic retry and session recovery.
 * Handles server restarts, sandbox crashes, and runner failures.
 */
async function sendMessage(sessionId: string, content: string, maxRetries = 3): Promise<string> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      let fullText = '';

      for await (const event of client.sendMessageStream(sessionId, content)) {
        if (event.type === 'message') {
          const text = extractTextFromEvent(event.data);
          if (text) fullText += text;
        } else if (event.type === 'error') {
          throw new Error(`Agent error: ${event.data.error}`);
        }
      }

      return fullText;
    } catch (err) {
      lastError = err as Error;
      console.warn(`Attempt ${attempt + 1} failed: ${lastError.message}`);

      // Check if the session needs recovery
      try {
        const session = await client.getSession(sessionId);

        if (session.status === 'ended') {
          throw new Error('Session has ended and cannot be recovered');
        }

        if (session.status === 'paused' || session.status === 'error') {
          console.log(`Session status is "${session.status}", resuming...`);
          await client.resumeSession(sessionId);
          console.log('Session resumed successfully');
        }
      } catch (recoveryErr) {
        // Server might be temporarily unreachable
        console.warn(`Recovery check failed: ${(recoveryErr as Error).message}`);
      }

      // Exponential backoff: 1s, 2s, 4s
      await sleep(Math.pow(2, attempt) * 1000);
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

// Usage
const session = await client.createSession('my-agent');
const response = await sendMessage(session.id, 'Analyze this codebase');
console.log(response);
```

</TabItem>
<TabItem value="python" label="Python">

```python
import time
from ash_ai import AshClient, AshApiError

client = AshClient(
    server_url=os.environ.get("ASH_SERVER_URL", "http://localhost:4100"),
    api_key=os.environ["ASH_API_KEY"],
)

def send_message(session_id: str, content: str, max_retries: int = 3) -> str:
    """Send a message with automatic retry and session recovery."""
    last_error = None

    for attempt in range(max_retries):
        try:
            full_text = ""
            for event in client.send_message_stream(session_id, content):
                if event.type == "message":
                    data = event.data
                    if data.get("type") == "assistant":
                        for block in data.get("message", {}).get("content", []):
                            if block.get("type") == "text":
                                full_text += block["text"]
                elif event.type == "error":
                    raise Exception(f"Agent error: {event.data.get('error')}")
            return full_text

        except Exception as e:
            last_error = e
            print(f"Attempt {attempt + 1} failed: {e}")

            # Check if the session needs recovery
            try:
                session = client.get_session(session_id)
                if session.status == "ended":
                    raise Exception("Session has ended and cannot be recovered")
                if session.status in ("paused", "error"):
                    print(f"Session is '{session.status}', resuming...")
                    client.resume_session(session_id)
                    print("Session resumed successfully")
            except AshApiError:
                pass  # Server temporarily unreachable

            # Exponential backoff
            time.sleep(2 ** attempt)

    raise last_error or Exception("Max retries exceeded")

# Usage
session = client.create_session("my-agent")
response = send_message(session.id, "Analyze this codebase")
print(response)
```

</TabItem>
</Tabs>

## Capacity Planning

| Component | Per Instance | Typical Limit |
|-----------|-------------|---------------|
| Coordinator | ~10,000 concurrent SSE streams | CPU/network |
| Runner (8 vCPU, 16GB) | 30-120 concurrent sessions | Memory (depends on sandbox limit) |
| Database (Postgres/CRDB) | ~5,000 queries/sec | Session creation path |

**Rule of thumb:** 3 coordinators + 10 runners (256MB/sandbox) = ~30,000 concurrent streams, ~600 concurrent sessions. You'll run out of runner capacity before coordinator capacity.

Use `ASH_DEBUG_TIMING=1` and the `/metrics` endpoint to find actual bottlenecks before scaling.

## When to Scale

| Symptom | Action |
|---------|--------|
| CPU/memory maxed on single machine | Add runners (Mode 2) |
| Need HA for control plane | Add coordinators + load balancer (Mode 3) |
| Sessions taking long to create | Add runners or increase `ASH_MAX_SANDBOXES` |
| High `fresh` restore rate | Enable cloud snapshots (`ASH_SNAPSHOT_URL`) |
| SSE connections saturating coordinator | Add coordinators behind LB |
