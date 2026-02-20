---
sidebar_position: 7
title: Database
---

# Database

Ash supports two database backends behind a common interface: SQLite (default) for single-machine deployments and PostgreSQL/CockroachDB for multi-machine setups.

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `ASH_DATABASE_URL` | Not set (uses SQLite) | PostgreSQL or CockroachDB connection URL |

When `ASH_DATABASE_URL` is not set, Ash creates a SQLite database at `data/ash.db`. When set to a `postgresql://` or `postgres://` URL, Ash connects to the specified Postgres-compatible database.

## Backend Selection

The `initDb()` factory function selects the backend based on the URL:

```typescript
export async function initDb(opts: { dataDir: string; databaseUrl?: string }): Promise<Db> {
  if (opts.databaseUrl && /^postgres(ql)?:\/\//.test(opts.databaseUrl)) {
    const pgDb = new PgDb(opts.databaseUrl);
    await pgDb.init();
    return pgDb;
  } else {
    return new SqliteDb(opts.dataDir);
  }
}
```

## Common Interface

Both backends implement the same `Db` interface:

```typescript
interface Db {
  // Agents
  upsertAgent(name, path, tenantId?): Promise<Agent>;
  getAgent(name, tenantId?): Promise<Agent | null>;
  listAgents(tenantId?): Promise<Agent[]>;
  deleteAgent(name, tenantId?): Promise<boolean>;

  // Sessions
  insertSession(id, agentName, sandboxId, tenantId?): Promise<Session>;
  updateSessionStatus(id, status): Promise<void>;
  getSession(id): Promise<Session | null>;
  listSessions(tenantId?, agent?): Promise<Session[]>;
  touchSession(id): Promise<void>;
  // ... plus updateSessionSandbox, updateSessionRunner, listSessionsByRunner

  // Sandboxes
  insertSandbox(id, agentName, workspaceDir, sessionId?, tenantId?): Promise<void>;
  updateSandboxState(id, state): Promise<void>;
  getSandbox(id): Promise<SandboxRecord | null>;
  countSandboxes(): Promise<number>;
  getBestEvictionCandidate(): Promise<SandboxRecord | null>;
  getIdleSandboxes(olderThan): Promise<SandboxRecord[]>;
  markAllSandboxesCold(): Promise<number>;
  // ... plus updateSandboxSession, touchSandbox, deleteSandbox

  // Messages
  insertMessage(sessionId, role, content, tenantId?): Promise<Message>;
  listMessages(sessionId, tenantId?, opts?): Promise<Message[]>;

  // Session Events
  insertSessionEvent(sessionId, type, data, tenantId?): Promise<SessionEvent>;
  insertSessionEvents(events): Promise<SessionEvent[]>;
  listSessionEvents(sessionId, tenantId?, opts?): Promise<SessionEvent[]>;

  // API Keys
  getApiKeyByHash(keyHash): Promise<ApiKey | null>;
  insertApiKey(id, tenantId, keyHash, label): Promise<ApiKey>;

  // Lifecycle
  close(): Promise<void>;
}
```

## SQL Dialect Differences

| Feature | SQLite | Postgres |
|---------|--------|----------|
| Timestamps | `datetime('now')` | `now()::TEXT` |
| Upsert | `ON CONFLICT(...) DO UPDATE` | `ON CONFLICT(...) DO UPDATE` |
| Parameters | `?` positional | `$1`, `$2` numbered |
| Connection model | Single file, in-process | Connection pool (`pg.Pool`) |
| Journal mode | WAL | WAL (default in Postgres) |
| Column migration | `try/catch` (no `IF NOT EXISTS`) | `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` |
| Sequence assignment | `SELECT MAX(sequence)` in transaction | Atomic subquery in `INSERT ... RETURNING` |

## Connection Retry (Postgres)

The Postgres backend retries the initial connection with exponential backoff (1s, 2s, 4s, 8s, 16s -- five attempts total, ~31 seconds). This handles common startup races where the database container is not yet ready.

```
[db] Connection attempt 1 failed, retrying in 1000ms...
[db] Connection attempt 2 failed, retrying in 2000ms...
```

## Tables

### agents

```sql
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(tenant_id, name)
);
```

### sessions

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  agent_name TEXT NOT NULL,
  sandbox_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'starting',
  runner_id TEXT,
  created_at TEXT NOT NULL,
  last_active_at TEXT NOT NULL
);
```

### sandboxes

```sql
CREATE TABLE sandboxes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  session_id TEXT,
  agent_name TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'warming',
  workspace_dir TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL
);
```

### messages

```sql
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(tenant_id, session_id, sequence)
);
```

### session_events

```sql
CREATE TABLE session_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,
  data TEXT,
  sequence INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(tenant_id, session_id, sequence)
);
```

### api_keys

```sql
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
```

## Production Recommendation

For single-machine deployments, SQLite with WAL mode is sufficient and requires no external dependencies. For multi-machine deployments (coordinator + runners sharing state), use PostgreSQL or CockroachDB so all nodes share the same database.
