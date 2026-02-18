# 02: Replace In-Memory Maps With SQLite

## Current State

Three pieces of state are stored in JavaScript `Map` objects:

1. **`SessionRouter.sessions`** — Map of session ID → Session object
2. **`AgentStore`** — disk files, but metadata in `_meta.json` per agent (fine)
3. **`SandboxManager.sandboxes`** — Map of sandbox ID → ManagedSandbox

If the process crashes or restarts:
- All session routing is lost. Active sessions become orphans.
- Sandbox processes may still be running but nothing tracks them.
- Clients get "session not found" on every subsequent request.

This isn't a "nice to have persistence" problem. It's a correctness bug. The system cannot survive a restart.

## Target State

One SQLite database at `data/ash.db` with three tables. Process can restart and recover.

## Schema

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  agent_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'creating',  -- creating | active | paused | ended
  sandbox_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_active_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sandboxes (
  id TEXT PRIMARY KEY,
  agent_name TEXT NOT NULL,
  session_id TEXT,
  state TEXT NOT NULL DEFAULT 'active',  -- warm | active | cooling | destroyed
  pid INTEGER,
  socket_path TEXT,
  workspace_dir TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE agents (
  name TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 1,
  dir_path TEXT NOT NULL,
  has_install_script INTEGER NOT NULL DEFAULT 0,
  config_json TEXT,  -- JSON blob of AgentConfig
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_sessions_agent ON sessions(agent_name);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sandboxes_state ON sandboxes(state);
CREATE INDEX idx_sandboxes_session ON sandboxes(session_id);
```

## Implementation

### Use `better-sqlite3`

Synchronous API. No async overhead. WAL mode for concurrent reads. Single dependency.

```typescript
import Database from 'better-sqlite3';

const db = new Database('data/ash.db', { wal: true });
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');  // Safe with WAL, faster than FULL
```

### New file: `packages/server/src/db.ts`

```typescript
export class AshDatabase {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.migrate();
  }

  private migrate() {
    this.db.exec(SCHEMA_SQL);
  }

  // Sessions
  insertSession(session: Session): void
  getSession(id: string): Session | null
  updateSessionStatus(id: string, status: SessionStatus): void
  listSessions(filter?: { agentName?: string; status?: SessionStatus }): Session[]

  // Sandboxes
  insertSandbox(sandbox: SandboxInfo): void
  getSandbox(id: string): SandboxInfo | null
  updateSandboxState(id: string, state: SandboxState): void
  getOrphanedSandboxes(): SandboxInfo[]  // state != 'destroyed' but PID not running

  // Agents
  upsertAgent(agent: Agent): void
  getAgent(name: string): Agent | null
  listAgents(): Agent[]
  deleteAgent(name: string): boolean

  close(): void
}
```

### Startup Recovery

On server start:

```typescript
async function recoverState(db: AshDatabase, manager: SandboxManager) {
  // 1. Find sandboxes that claim to be active but whose PID is dead
  const orphans = db.getOrphanedSandboxes();
  for (const orphan of orphans) {
    if (!isProcessAlive(orphan.pid)) {
      db.updateSandboxState(orphan.id, 'destroyed');
      // Clean up workspace dir
      await rm(orphan.workspaceDir, { recursive: true, force: true }).catch(() => {});
    } else {
      // PID is alive — try to reconnect
      try {
        await manager.reconnectSandbox(orphan);
      } catch {
        // Can't reconnect, kill it
        process.kill(orphan.pid, 'SIGKILL');
        db.updateSandboxState(orphan.id, 'destroyed');
      }
    }
  }

  // 2. Mark sessions with dead sandboxes as 'paused' (resumable)
  // not 'ended' — the session state may still be on disk
}

function isProcessAlive(pid: number | null): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);  // Signal 0 = check existence
    return true;
  } catch {
    return false;
  }
}
```

## What Changes

| Component | Before | After |
|-----------|--------|-------|
| SessionRouter | `Map<string, Session>` | `db.getSession(id)` |
| SandboxManager | `Map<string, ManagedSandbox>` | DB for persistence, Map for live bridge clients only |
| AgentStore | `_meta.json` files | DB for metadata, disk for agent files |
| Server restart | Everything lost | Sessions recoverable, orphaned sandboxes cleaned up |

## What Doesn't Change

- The `BridgeClient` connections are still in-memory (they're live sockets, can't persist)
- The sandbox processes are still child processes
- The agent files are still on disk

## Dependency

Add to server's `package.json`:

```json
"better-sqlite3": "^11.0.0"
```

One dependency. ~2MB. No native compilation issues on Linux/macOS (prebuilt binaries).
