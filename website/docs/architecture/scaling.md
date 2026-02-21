---
sidebar_position: 9
title: Scaling Architecture
---

# Scaling Architecture

Ash scales horizontally in two dimensions: the **data plane** (runners that host sandboxes) and the **control plane** (coordinators that route requests). Each dimension scales independently.

## Three Operating Modes

```mermaid
graph TB
    subgraph "Mode 1: Standalone"
        direction LR
        C1["Client"] -->|HTTP + SSE| S1["Ash Server<br/>:4100"]
        S1 --> P1["SandboxPool"]
        S1 --> DB1["SQLite"]
        P1 --> B1["Bridge 1"]
        P1 --> B2["Bridge 2"]
    end
```

```mermaid
graph TB
    subgraph "Mode 2: Coordinator + N Runners"
        direction LR
        C2["Client"] -->|HTTP + SSE| S2["Coordinator<br/>:4100"]
        S2 --> DB2["Postgres / CRDB"]
        S2 -->|HTTP| R1["Runner 1"]
        S2 -->|HTTP| R2["Runner 2"]
        S2 -->|HTTP| R3["Runner N"]
    end
```

```mermaid
graph TB
    subgraph "Mode 3: N Coordinators + N Runners"
        direction TB
        C3["Client"] -->|HTTPS| LB["Load Balancer"]
        LB --> S3a["Coordinator 1"]
        LB --> S3b["Coordinator 2"]
        LB --> S3c["Coordinator M"]
        S3a & S3b & S3c --> DB3["CRDB"]
        S3a & S3b & S3c -->|HTTP| R4["Runner 1"]
        S3a & S3b & S3c -->|HTTP| R5["Runner 2"]
        S3a & S3b & S3c -->|HTTP| R6["Runner N"]
    end
```

**Start with Mode 1. Move to Mode 2 when one machine isn't enough. Move to Mode 3 when one coordinator isn't enough or you need redundancy.**

## Session Routing

Every session is pinned to a runner. The coordinator selects the runner with the most available capacity at session creation time.

```mermaid
sequenceDiagram
    participant C as Client
    participant Co as Coordinator
    participant DB as Database
    participant R as Runner (selected)

    C->>Co: POST /api/sessions {agent: "my-agent"}
    Co->>DB: SELECT best runner (most capacity)
    DB-->>Co: runner-2 (70 available slots)
    Co->>R: POST /runner/sandboxes
    R-->>Co: {sandboxId, workspaceDir}
    Co->>DB: INSERT session (runner_id = "runner-2")
    Co-->>C: 201 {session}
```

Once assigned, all subsequent messages for that session route to the same runner:

```mermaid
sequenceDiagram
    participant C as Client
    participant Co as Coordinator
    participant DB as Database
    participant R as Runner (same)

    C->>Co: POST /api/sessions/:id/messages
    Co->>DB: SELECT session → runner_id = "runner-2"
    Co->>R: POST /runner/sandboxes/:id/cmd
    R-->>Co: SSE stream (bridge events)
    Co-->>C: SSE stream (proxied)
```

## Runner Registration and Heartbeat

Runners self-register with the control plane and send periodic heartbeats with pool statistics.

```mermaid
sequenceDiagram
    participant R as Runner
    participant Co as Coordinator
    participant DB as Database

    R->>Co: POST /api/internal/runners/register
    Co->>DB: UPSERT runners (id, host, port, max)
    Co-->>R: {ok: true}

    loop Every 10 seconds
        R->>Co: POST /api/internal/runners/heartbeat
        Note right of R: {runnerId, stats: {running: 12, warming: 3, ...}}
        Co->>DB: UPDATE runners SET active_count, warming_count, last_heartbeat_at
        Co-->>R: {ok: true}
    end
```

## Dead Runner Detection

The coordinator sweeps for dead runners every 30 seconds. If a runner misses its heartbeat window, all its sessions are paused.

```mermaid
sequenceDiagram
    participant Co as Coordinator
    participant DB as Database
    participant C as Client

    Note over Co: Liveness sweep (every 30s)
    Co->>DB: SELECT runners WHERE last_heartbeat_at < cutoff
    DB-->>Co: [runner-3 is stale]
    Co->>DB: UPDATE sessions SET status='paused' WHERE runner_id='runner-3'
    Co->>DB: DELETE FROM runners WHERE id='runner-3'
    Note over C: Client detects disconnect
    C->>Co: POST /api/sessions/:id/resume
    Co->>DB: SELECT best healthy runner
    Note over Co: Cold restore on new runner
    Co-->>C: 200 {session: {status: 'active'}}
```

## Multi-Coordinator (Mode 3)

In multi-coordinator mode, all coordinators share the same database (Postgres or CockroachDB). The runner registry and session state live in the database — coordinators hold no authoritative state in memory.

```mermaid
graph TB
    subgraph "Coordinator 1"
        Co1["Fastify :4100"]
        Cache1["Backend Cache<br/>(connection pool)"]
        Co1 --> Cache1
    end

    subgraph "Coordinator 2"
        Co2["Fastify :4100"]
        Cache2["Backend Cache<br/>(connection pool)"]
        Co2 --> Cache2
    end

    DB[("CRDB<br/>runners table<br/>sessions table")]

    Co1 --> DB
    Co2 --> DB
    Cache1 -->|HTTP| R1["Runner 1"]
    Cache1 -->|HTTP| R2["Runner 2"]
    Cache2 -->|HTTP| R1
    Cache2 -->|HTTP| R2

    R1 -->|Heartbeat| LB["Load Balancer"]
    R2 -->|Heartbeat| LB
    LB --> Co1
    LB --> Co2
```

**Key properties:**
- Any coordinator can route to any runner (DB is source of truth)
- Coordinators don't talk to each other
- Liveness sweep runs on all coordinators (idempotent)
- SSE reconnection handles coordinator failover (no session migration)

### Coordinator Failover

```mermaid
sequenceDiagram
    participant C as Client
    participant LB as Load Balancer
    participant Co1 as Coordinator 1
    participant Co2 as Coordinator 2
    participant DB as Database
    participant R as Runner

    C->>LB: SSE stream (session ABC)
    LB->>Co1: Forward
    Co1->>R: Proxy bridge events
    R-->>Co1: SSE events
    Co1-->>C: SSE events

    Note over Co1: Coordinator 1 dies
    C--xCo1: Connection lost

    Note over C: SSE auto-reconnects
    C->>LB: Reconnect
    LB->>Co2: Route to healthy coordinator
    Co2->>DB: SELECT session ABC → runner_id
    Co2->>R: Re-establish proxy
    R-->>Co2: SSE events resume
    Co2-->>C: SSE events resume
```

## Capacity Estimates

| Component | Per Instance | Limit | Bottleneck |
|-----------|-------------|-------|------------|
| Coordinator | ~10,000 SSE connections | Network/CPU | SSE proxy fan-out |
| Runner (8 vCPU, 16GB) | 30-120 sessions | Memory | Depends on sandbox memory limit |
| Database (CRDB) | ~5,000 queries/sec | Single-node CRDB | Session creation path only |

**Scaling math:**
- 3 coordinators = ~30,000 concurrent SSE streams
- 10 runners (256MB/sandbox) = ~600 concurrent sessions
- You'll run out of runner capacity before coordinator capacity

## Database Tables for Scaling

```mermaid
erDiagram
    runners {
        text id PK
        text host
        int port
        int max_sandboxes
        int active_count
        int warming_count
        text last_heartbeat_at
        text registered_at
    }

    sessions {
        text id PK
        text agent_name
        text sandbox_id
        text status
        text runner_id FK
        text created_at
        text last_active_at
    }

    runners ||--o{ sessions : "hosts"
```

## Environment Variables

### Coordinator

| Variable | Default | Description |
|----------|---------|-------------|
| `ASH_MODE` | `standalone` | Set to `coordinator` for multi-runner mode |
| `ASH_DATABASE_URL` | — | Postgres/CRDB connection string (required for multi-coordinator) |
| `ASH_PORT` | `4100` | HTTP listen port |

### Runner

| Variable | Default | Description |
|----------|---------|-------------|
| `ASH_RUNNER_ID` | `runner-{pid}` | Unique runner identifier |
| `ASH_RUNNER_PORT` | `4200` | HTTP listen port |
| `ASH_SERVER_URL` | — | Coordinator URL for registration |
| `ASH_RUNNER_ADVERTISE_HOST` | — | Host reachable from coordinator |
| `ASH_MAX_SANDBOXES` | `1000` | Maximum concurrent sandboxes |

## When to Scale

| Symptom | Action |
|---------|--------|
| CPU/memory maxed on single machine | Add runners (Mode 2) |
| Need high availability for control plane | Add coordinators (Mode 3) |
| SSE connections saturating coordinator | Add coordinators (Mode 3) |
| Session creation latency increasing | Add runners or increase `ASH_MAX_SANDBOXES` |
| All runners at capacity | Add more runner nodes |

:::tip Measure First
Don't scale until you have numbers. A single standalone Ash server handles dozens of concurrent sessions. Use `ASH_DEBUG_TIMING=1` and the `/metrics` endpoint to find the actual bottleneck before adding complexity.
:::
