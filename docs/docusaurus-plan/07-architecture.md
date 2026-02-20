# 07 - Architecture Section

Deep technical documentation for users who want to understand internals, contribute, or debug production issues.

## Pages

### 1. System Overview (`/docs/architecture/overview`)

**Content:**
- Architecture diagram:
  ```
  CLI/SDK  ──HTTP──>  ash-server  ──in-process──>  SandboxPool ──> SandboxManager  ──unix socket──>  Bridge  ──>  Claude SDK
                      (Fastify)                     (@ash-ai/sandbox)                                 (in sandbox)
  ```
- Component responsibilities (one sentence each)
- Message hot path: client -> Fastify -> session lookup -> bridge command -> SDK query -> SSE response
- Target overhead: 1-3ms Ash overhead on top of SDK latency
- Deployment modes: standalone (single machine) vs coordinator (multi-machine)
- Data flow: request in, SSE out, state persisted to SQLite/Postgres

**Source:** `docs/architecture.md`

---

### 2. Sandbox Isolation (`/docs/architecture/sandbox-isolation`)

**Content:**
- Security model: agent code is untrusted
- Environment allowlist: only `PATH`, `HOME`, `LANG`, `TERM`, `ANTHROPIC_API_KEY`, `ASH_DEBUG_TIMING`
- Injected variables: `ASH_BRIDGE_SOCKET`, `ASH_AGENT_DIR`, `ASH_WORKSPACE_DIR`, `ASH_SANDBOX_ID`, `ASH_SESSION_ID`
- Everything else blocked (AWS keys, SSH keys, host secrets)
- Linux isolation: bubblewrap (bwrap) for filesystem/PID/network namespace
- macOS: restricted environment (no bwrap, development only)
- Resource limits (Linux cgroups v2): memory, CPU, process count, disk
- Default limits: configurable via `ASH_MAX_SANDBOXES`, per-sandbox limits

**Source:** `docs/jeff-dean-plan/04b-sandbox-isolation.md`, `docs/jeff-dean-plan/04-resource-limits.md`, `packages/shared/src/constants.ts`

---

### 3. Bridge Protocol (`/docs/architecture/bridge-protocol`)

**Content:**
- Transport: Unix domain socket, newline-delimited JSON
- Why Unix socket over HTTP: lower overhead, no port conflicts, natural 1:1 mapping
- Commands (server -> bridge):
  - `query`: start a conversation turn (`{ cmd: 'query', prompt, sessionId, includePartialMessages? }`)
  - `resume`: resume a previous session (`{ cmd: 'resume', sessionId }`)
  - `interrupt`: abort current query (`{ cmd: 'interrupt' }`)
  - `shutdown`: graceful exit (`{ cmd: 'shutdown' }`)
- Events (bridge -> server):
  - `ready`: bridge is listening, ready for commands
  - `message`: raw SDK Message object (passthrough, no translation)
  - `error`: error string
  - `done`: turn complete, includes sessionId
- Design decision: SDK types pass through unchanged (ADR 0001)
- Encoding: `encodeBridgeEvent()` / `decodeBridgeEvent()` from `@ash-ai/shared`

**Source:** `packages/shared/src/protocol.ts`, `docs/decisions/0001-sdk-passthrough-types.md`

---

### 4. Session Lifecycle (`/docs/architecture/session-lifecycle`)

**Content:**
- State machine diagram:
  ```
  [*] -> starting -> active -> paused -> active (resume)
                       |
                     error -> paused (resumable)
                       |
                     ended (terminal)
  ```
- State transitions and what triggers them
- Pause flow: persist workspace to disk -> mark sandbox as waiting -> update DB
- Resume flow:
  - Fast path: sandbox still alive -> mark as running -> send resume command
  - Cold path: allocate new sandbox -> restore workspace from snapshot -> send resume command
- Cloud persistence: S3/GCS snapshots for cross-machine resume
- Session data stored in SQLite/Postgres

**Source:** `docs/features/session-resume.md`, `docs/architecture.md`

---

### 5. Sandbox Pool (`/docs/architecture/sandbox-pool`)

**Content:**
- Pool state machine:
  ```
  cold -> warming -> warm -> waiting -> running
                                |
                              evict (LRU) -> cold -> deleted
  ```
- Capacity management: `ASH_MAX_SANDBOXES` limit, LRU eviction
- Idle sweep: `ASH_IDLE_TIMEOUT_MS` (default 30 min), periodic check
- DB-backed: pool state survives server restarts
- Pool stats: total, by state, available capacity
- Integration with SandboxManager for process lifecycle

**Source:** `docs/features/sandbox-pool.md`, `packages/sandbox/src/pool.ts`

---

### 6. SSE Backpressure (`/docs/architecture/sse-backpressure`)

**Content:**
- Problem: fast bridge output + slow client = unbounded memory
- Solution: respect backpressure at every boundary
  - Bridge -> server: Unix socket `write()` returns false -> pause reading from SDK
  - Server -> client: TCP `write()` returns false -> wait for `drain` event
- Dead client timeout: 30s for stuck `write()` -> close connection
- Implementation: `writeSSE()` in session routes

**Source:** `docs/features/sse-backpressure.md`

---

### 7. Design Decisions (`/docs/architecture/decisions`)

**Content:**
- Index page linking to individual ADRs
- Each ADR page:
  - Title, date, status
  - Context: what problem prompted the decision
  - Decision: what was chosen
  - Alternatives considered
  - Consequences

**Existing ADRs:**
- 0001: SDK Passthrough Types (use SDK types directly, don't translate)
- 0002: HTTP over gRPC for Runner (simplicity over performance at current scale)

**Source:** `docs/decisions/`

---

### 8. Database (`/docs/architecture/database`)

**Content:**
- Dual backend: SQLite (default, zero-config) or PostgreSQL/CockroachDB (production scale)
- `Db` interface: single API, factory switches implementation
- Schema: agents, sessions, sandboxes, api_keys tables
- Multi-tenant: optional `tenantId` column, defaults to 'default'
- WAL mode for SQLite concurrent reads
- Migration strategy: manual schema files (future: Prisma)

**Source:** `docs/features/database.md`, `docs/future_tasks/unify-db-backends.md`
