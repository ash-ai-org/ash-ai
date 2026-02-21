---
sidebar_position: 5
title: Multi-Machine Setup
---

# Multi-Machine Setup

:::info Advanced
Most deployments do not need multi-machine mode. A single machine running in standalone mode can handle dozens of concurrent sessions. Read this page only when you need more capacity than one machine provides.
:::

## When to Use

Use multi-machine mode when:
- You need more concurrent sessions than a single server can handle.
- You want to isolate sandbox execution from the control plane for reliability.
- You need to scale sandbox capacity independently of the API server.

## Architecture

```mermaid
graph TB
    Client[Client / SDK] -->|HTTP + SSE| Coordinator

    subgraph Control Plane
        Coordinator[Ash Server<br/>mode=coordinator<br/>port 4100]
        DB[(Database<br/>Postgres / CockroachDB)]
        Coordinator --> DB
    end

    subgraph Runner Node 1
        R1[Ash Runner<br/>port 4200]
        R1 --> S1[Sandbox Pool]
        S1 --> B1[Bridge 1]
        S1 --> B2[Bridge 2]
    end

    subgraph Runner Node 2
        R2[Ash Runner<br/>port 4200]
        R2 --> S2[Sandbox Pool]
        S2 --> B3[Bridge 3]
        S2 --> B4[Bridge 4]
    end

    Coordinator -->|HTTP| R1
    Coordinator -->|HTTP| R2
    R1 -->|Heartbeat| Coordinator
    R2 -->|Heartbeat| Coordinator
```

- **Coordinator** (the Ash server in `coordinator` mode): handles all client-facing HTTP traffic, manages the database, routes session creation to runners, and proxies messages to the correct runner.
- **Runners**: each runner manages a local `SandboxPool`, creates sandbox processes, and communicates with the bridge inside each sandbox over Unix sockets. Runners do not serve external traffic directly.

## Standalone Mode (Default)

In standalone mode (`ASH_MODE=standalone`), the server creates a local `SandboxPool` and handles everything in one process. This is the default and the right choice for single-machine deployments.

```
Client  -->  Ash Server (standalone)  -->  SandboxPool  -->  Bridge  -->  Claude SDK
```

No runners are needed. The server is both control plane and execution plane.

## Coordinator Mode

In coordinator mode (`ASH_MODE=coordinator`), the server does not create a local sandbox pool. Instead, it waits for runners to register and provides capacity through them.

### Starting the Coordinator

```bash
export ASH_MODE=coordinator
export ASH_DATABASE_URL="postgresql://ash:password@db-host:5432/ash"
export ASH_API_KEY=my-api-key
export ANTHROPIC_API_KEY=sk-ant-...

node packages/server/dist/index.js
# Or via Docker:
# ash start -e ASH_MODE=coordinator -e ASH_DATABASE_URL=...
```

The coordinator logs:

```
Ash server listening on 0.0.0.0:4100 (mode: coordinator)
```

At this point, the server accepts API requests but cannot create sessions until at least one runner registers.

### Starting a Runner

On each runner machine:

```bash
export ASH_RUNNER_ID=runner-1
export ASH_SERVER_URL=http://coordinator-host:4100
export ASH_RUNNER_PORT=4200
export ASH_RUNNER_ADVERTISE_HOST=10.0.1.5  # IP the coordinator can reach
export ASH_MAX_SANDBOXES=50
export ANTHROPIC_API_KEY=sk-ant-...

node packages/runner/dist/index.js
```

The runner:
1. Creates a `SandboxPool` with a lightweight in-memory database for sandbox tracking.
2. Starts a Fastify HTTP server on port 4200.
3. Sends a registration request to `ASH_SERVER_URL/api/internal/runners/register`.
4. Begins sending heartbeats every 10 seconds to `ASH_SERVER_URL/api/internal/runners/heartbeat`, including pool stats (running, warming, waiting counts).

The coordinator logs:

```
[coordinator] Runner runner-1 registered at 10.0.1.5:4200 (max 50)
```

## Session Routing

When a client creates a session, the coordinator selects a runner using **least-loaded routing**: it picks the runner with the most available capacity (max sandboxes minus running and warming sandboxes).

If no remote runners are healthy, the coordinator falls back to the local backend (if running in standalone mode). In pure coordinator mode with no healthy runners, session creation fails with an error.

Once a session is assigned to a runner, all subsequent messages for that session are routed to the same runner. The `runner_id` is stored in the session record in the database.

## Failure Handling

### Runner Dies

If a runner stops sending heartbeats for 30 seconds (`RUNNER_LIVENESS_TIMEOUT_MS`), the coordinator:

1. Marks all active sessions on that runner as `paused`.
2. Removes the runner from the routing table.
3. Logs a warning for each affected session.

Paused sessions can be resumed later. If `ASH_SNAPSHOT_URL` is configured, the runner persists workspace state to cloud storage before eviction, enabling resume on a different runner.

### Runner Comes Back

If a runner restarts with the same `ASH_RUNNER_ID`, it re-registers with the coordinator. The coordinator updates the connection info (host, port) and resumes routing new sessions to it.

Existing sessions that were paused when the runner died are **not** automatically resumed. The client must explicitly resume them via `POST /api/sessions/:id/resume`.

### No Runners Available

If all runners are dead or at capacity, session creation returns an HTTP 503 error:

```json
{
  "error": "No runners available and no local backend configured"
}
```

## Example: Two Runners with Docker Compose

```yaml
version: "3.8"

services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: ash
      POSTGRES_PASSWORD: ash
      POSTGRES_DB: ash
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ash"]
      interval: 5s
      timeout: 5s
      retries: 5

  coordinator:
    image: ghcr.io/ash-ai/ash:0.1.0
    init: true
    ports:
      - "4100:4100"
    environment:
      - ASH_MODE=coordinator
      - ASH_DATABASE_URL=postgresql://ash:ash@db:5432/ash
      - ASH_API_KEY=${ASH_API_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    depends_on:
      db:
        condition: service_healthy

  runner-1:
    image: ghcr.io/ash-ai/ash:0.1.0
    init: true
    privileged: true
    command: ["node", "packages/runner/dist/index.js"]
    volumes:
      - runner1-data:/data
    environment:
      - ASH_RUNNER_ID=runner-1
      - ASH_SERVER_URL=http://coordinator:4100
      - ASH_RUNNER_ADVERTISE_HOST=runner-1
      - ASH_MAX_SANDBOXES=50
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    depends_on:
      - coordinator

  runner-2:
    image: ghcr.io/ash-ai/ash:0.1.0
    init: true
    privileged: true
    command: ["node", "packages/runner/dist/index.js"]
    volumes:
      - runner2-data:/data
    environment:
      - ASH_RUNNER_ID=runner-2
      - ASH_SERVER_URL=http://coordinator:4100
      - ASH_RUNNER_ADVERTISE_HOST=runner-2
      - ASH_MAX_SANDBOXES=50
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    depends_on:
      - coordinator

volumes:
  pgdata:
  runner1-data:
  runner2-data:
```

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export ASH_API_KEY=my-production-key
docker compose up -d
```

## Multi-Coordinator (High Availability)

For production deployments that need control plane redundancy or handle more than ~10,000 concurrent SSE connections, you can run multiple coordinators behind a load balancer.

:::info Prerequisites
Multi-coordinator requires a shared database. All coordinators must point to the same Postgres or CockroachDB instance via `ASH_DATABASE_URL`. SQLite does not support multi-coordinator.
:::

### Architecture

```mermaid
graph TB
    Client["Client / SDK"] -->|HTTPS| LB["Load Balancer<br/>(nginx, ALB, etc.)"]

    subgraph Coordinators
        C1["Coordinator 1<br/>:4100"]
        C2["Coordinator 2<br/>:4100"]
    end

    LB --> C1
    LB --> C2
    C1 & C2 --> DB[("CockroachDB")]
    C1 & C2 -->|HTTP| R1["Runner 1"]
    C1 & C2 -->|HTTP| R2["Runner 2"]
```

Coordinators are stateless — all routing decisions come from the database. Any coordinator can route to any runner.

### Starting Multiple Coordinators

```bash
# Coordinator 1
ASH_MODE=coordinator \
ASH_DATABASE_URL="postgresql://ash:password@db-host:5432/ash" \
ASH_API_KEY=my-api-key \
ANTHROPIC_API_KEY=sk-ant-... \
ASH_PORT=4100 \
node packages/server/dist/index.js

# Coordinator 2 (same config, different host)
ASH_MODE=coordinator \
ASH_DATABASE_URL="postgresql://ash:password@db-host:5432/ash" \
ASH_API_KEY=my-api-key \
ANTHROPIC_API_KEY=sk-ant-... \
ASH_PORT=4100 \
node packages/server/dist/index.js
```

### Load Balancer Configuration

```nginx
upstream ash_coordinators {
    server coordinator-1:4100;
    server coordinator-2:4100;
}

server {
    listen 443 ssl;
    location / {
        proxy_pass http://ash_coordinators;
        proxy_http_version 1.1;
        proxy_set_header Connection '';    # Required for SSE
        proxy_buffering off;              # Required for SSE
        proxy_read_timeout 86400s;        # Long-lived SSE streams
    }
}
```

- **No sticky sessions needed.** Any coordinator can handle any request.
- **Health check:** `GET /health` on each coordinator.
- **SSE failover:** If a coordinator dies mid-stream, the client's SSE auto-reconnects through the load balancer to a different coordinator. The new coordinator looks up the session in the shared database and re-establishes the proxy to the runner. No session migration needed.

### Runners with Multi-Coordinator

Runners register with the load balancer URL (not a specific coordinator):

```bash
ASH_SERVER_URL=http://load-balancer:4100 \
ASH_RUNNER_ID=runner-1 \
node packages/runner/dist/index.js
```

Heartbeats go through the load balancer. Any coordinator that receives a heartbeat writes it to the shared database, where all other coordinators can see it.

### How It Works

The runner registry lives in the `runners` table in the shared database. All coordinators read and write to this table:

- **Registration:** Runner sends `POST /api/internal/runners/register` → coordinator upserts into `runners` table
- **Heartbeat:** Runner sends `POST /api/internal/runners/heartbeat` → coordinator updates `active_count`, `warming_count`, `last_heartbeat_at`
- **Selection:** On session creation, coordinator queries `SELECT ... FROM runners ORDER BY available_capacity DESC LIMIT 1`
- **Liveness sweep:** All coordinators run the sweep independently (every 30s). Operations are idempotent — multiple coordinators marking the same dead runner's sessions as paused is harmless.

For more details on the scaling architecture, see [Scaling Architecture](/docs/architecture/scaling).

## Limitations

- **Cross-runner resume requires cloud persistence.** Without `ASH_SNAPSHOT_URL`, a session paused on runner-1 cannot be resumed on runner-2 because the workspace state is local to runner-1's filesystem. Configure S3 or GCS snapshots for cross-runner resume.

- **No automatic session migration.** If a runner is overloaded, existing sessions are not moved to a less-loaded runner. Only new sessions benefit from load-based routing.

- **Runner state is in-memory.** Each runner uses an in-memory database for sandbox tracking (not SQLite). If a runner crashes, its sandbox tracking is lost. On restart, it re-registers with fresh state. The coordinator detects the gap via missed heartbeats and pauses affected sessions.
