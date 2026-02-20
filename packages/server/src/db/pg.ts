import pg from 'pg';
import { randomUUID } from 'node:crypto';
import type { Agent, Session, SessionStatus, SandboxRecord, SandboxState, ApiKey, Message, SessionEvent, SessionEventType } from '@ash-ai/shared';
import type { Db } from './index.js';

export class PgDb implements Db {
  private pool: pg.Pool;

  constructor(databaseUrl: string) {
    this.pool = new pg.Pool({ connectionString: databaseUrl });
  }

  async init(): Promise<void> {
    // Retry connection with exponential backoff (total ~31s: 1s, 2s, 4s, 8s, 16s)
    const maxRetries = 5;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await this.pool.query('SELECT 1');
        break;
      } catch (err) {
        if (attempt === maxRetries) {
          throw new Error(`Failed to connect to database after ${maxRetries + 1} attempts: ${(err as Error).message}`);
        }
        const delay = 1000 * Math.pow(2, attempt);
        console.log(`[db] Connection attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS agents (
        name TEXT PRIMARY KEY,
        version INTEGER NOT NULL DEFAULT 1,
        path TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (now()::TEXT),
        updated_at TEXT NOT NULL DEFAULT (now()::TEXT)
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        agent_name TEXT NOT NULL,
        sandbox_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'starting',
        runner_id TEXT,
        created_at TEXT NOT NULL DEFAULT (now()::TEXT),
        last_active_at TEXT NOT NULL DEFAULT (now()::TEXT),
        FOREIGN KEY (agent_name) REFERENCES agents(name)
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS sandboxes (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        agent_name TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'warming',
        workspace_dir TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (now()::TEXT),
        last_used_at TEXT NOT NULL DEFAULT (now()::TEXT)
      )
    `);

    // Indexes (CREATE INDEX IF NOT EXISTS is supported in Postgres)
    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_sandboxes_state ON sandboxes(state)');
    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_sandboxes_session ON sandboxes(session_id)');
    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_sandboxes_last_used ON sandboxes(last_used_at)');

    // Multi-tenancy migration: add tenant_id columns (idempotent via IF NOT EXISTS)
    await this.pool.query("ALTER TABLE agents ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default'");
    await this.pool.query("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default'");
    await this.pool.query("ALTER TABLE sandboxes ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default'");

    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_agents_tenant ON agents(tenant_id)');
    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_sessions_tenant ON sessions(tenant_id)');
    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_sandboxes_tenant ON sandboxes(tenant_id)');

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (now()::TEXT)
      )
    `);
    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id)');
    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash)');

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL DEFAULT 'default',
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (now()::TEXT),
        UNIQUE(tenant_id, session_id, sequence)
      )
    `);
    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(tenant_id, session_id, sequence)');

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS session_events (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL DEFAULT 'default',
        session_id TEXT NOT NULL,
        type TEXT NOT NULL,
        data TEXT,
        sequence INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (now()::TEXT),
        UNIQUE(tenant_id, session_id, sequence)
      )
    `);
    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_session_events_session ON session_events(tenant_id, session_id, sequence)');
    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_session_events_type ON session_events(tenant_id, session_id, type)');

    // Add UNIQUE constraints for existing tables (idempotent)
    try { await this.pool.query('ALTER TABLE messages ADD CONSTRAINT uq_messages_session_seq UNIQUE(tenant_id, session_id, sequence)'); } catch { /* already exists */ }
    try { await this.pool.query('ALTER TABLE session_events ADD CONSTRAINT uq_session_events_session_seq UNIQUE(tenant_id, session_id, sequence)'); } catch { /* already exists */ }

    // Agent UUID migration: change PK from name to UUID id, add UNIQUE(tenant_id, name), drop FK from sessions
    const agentCols = await this.pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'agents' AND column_name = 'id'"
    );
    if (agentCols.rows.length === 0) {
      await this.pool.query("ALTER TABLE agents ADD COLUMN id TEXT");
      await this.pool.query("UPDATE agents SET id = gen_random_uuid()::TEXT WHERE id IS NULL");
      await this.pool.query("ALTER TABLE agents ALTER COLUMN id SET NOT NULL");
      await this.pool.query("ALTER TABLE agents DROP CONSTRAINT agents_pkey");
      await this.pool.query("ALTER TABLE agents ADD PRIMARY KEY (id)");
      await this.pool.query("CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_tenant_name ON agents(tenant_id, name)");
      try { await this.pool.query("ALTER TABLE sessions DROP CONSTRAINT sessions_agent_name_fkey"); } catch { /* already dropped */ }
    }
  }

  // -- Agents -----------------------------------------------------------------

  async upsertAgent(name: string, path: string, tenantId: string = 'default'): Promise<Agent> {
    const existing = await this.pool.query('SELECT id, version FROM agents WHERE tenant_id = $1 AND name = $2', [tenantId, name]);
    const version = existing.rows.length > 0 ? existing.rows[0].version + 1 : 1;
    const id = existing.rows.length > 0 ? existing.rows[0].id : randomUUID();
    const now = new Date().toISOString();

    await this.pool.query(`
      INSERT INTO agents (id, tenant_id, name, version, path, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT(tenant_id, name) DO UPDATE SET version = $4, path = $5, updated_at = $7
    `, [id, tenantId, name, version, path, now, now]);

    return { id, name, tenantId, version, path, createdAt: now, updatedAt: now };
  }

  async getAgent(name: string, tenantId: string = 'default'): Promise<Agent | null> {
    const result = await this.pool.query('SELECT * FROM agents WHERE tenant_id = $1 AND name = $2', [tenantId, name]);
    const row = result.rows[0];
    if (!row) return null;
    return { id: row.id, name: row.name, tenantId: row.tenant_id, version: row.version, path: row.path, createdAt: row.created_at, updatedAt: row.updated_at };
  }

  async listAgents(tenantId: string = 'default'): Promise<Agent[]> {
    const result = await this.pool.query('SELECT * FROM agents WHERE tenant_id = $1 ORDER BY name', [tenantId]);
    return result.rows.map((r) => ({ id: r.id, name: r.name, tenantId: r.tenant_id, version: r.version, path: r.path, createdAt: r.created_at, updatedAt: r.updated_at }));
  }

  async deleteAgent(name: string, tenantId: string = 'default'): Promise<boolean> {
    await this.pool.query('DELETE FROM sessions WHERE agent_name = $1 AND tenant_id = $2', [name, tenantId]);
    const result = await this.pool.query('DELETE FROM agents WHERE name = $1 AND tenant_id = $2', [name, tenantId]);
    return (result.rowCount ?? 0) > 0;
  }

  // -- Sessions ---------------------------------------------------------------

  async insertSession(id: string, agentName: string, sandboxId: string, tenantId: string = 'default'): Promise<Session> {
    const now = new Date().toISOString();
    await this.pool.query(`
      INSERT INTO sessions (id, tenant_id, agent_name, sandbox_id, status, created_at, last_active_at)
      VALUES ($1, $2, $3, $4, 'starting', $5, $6)
    `, [id, tenantId, agentName, sandboxId, now, now]);

    return { id, tenantId, agentName, sandboxId, status: 'starting', createdAt: now, lastActiveAt: now };
  }

  async updateSessionStatus(id: string, status: SessionStatus): Promise<void> {
    const now = new Date().toISOString();
    await this.pool.query('UPDATE sessions SET status = $1, last_active_at = $2 WHERE id = $3', [status, now, id]);
  }

  async updateSessionSandbox(id: string, sandboxId: string): Promise<void> {
    const now = new Date().toISOString();
    await this.pool.query('UPDATE sessions SET sandbox_id = $1, last_active_at = $2 WHERE id = $3', [sandboxId, now, id]);
  }

  async updateSessionRunner(id: string, runnerId: string | null): Promise<void> {
    const now = new Date().toISOString();
    await this.pool.query('UPDATE sessions SET runner_id = $1, last_active_at = $2 WHERE id = $3', [runnerId, now, id]);
  }

  async getSession(id: string): Promise<Session | null> {
    const result = await this.pool.query('SELECT * FROM sessions WHERE id = $1', [id]);
    const row = result.rows[0];
    if (!row) return null;
    return { id: row.id, tenantId: row.tenant_id, agentName: row.agent_name, sandboxId: row.sandbox_id, status: row.status, runnerId: row.runner_id ?? null, createdAt: row.created_at, lastActiveAt: row.last_active_at };
  }

  async listSessions(tenantId: string = 'default', agent?: string): Promise<Session[]> {
    const result = agent
      ? await this.pool.query('SELECT * FROM sessions WHERE tenant_id = $1 AND agent_name = $2 ORDER BY created_at DESC', [tenantId, agent])
      : await this.pool.query('SELECT * FROM sessions WHERE tenant_id = $1 ORDER BY created_at DESC', [tenantId]);
    return result.rows.map((r) => ({ id: r.id, tenantId: r.tenant_id, agentName: r.agent_name, sandboxId: r.sandbox_id, status: r.status, runnerId: r.runner_id ?? null, createdAt: r.created_at, lastActiveAt: r.last_active_at }));
  }

  async listSessionsByRunner(runnerId: string): Promise<Session[]> {
    const result = await this.pool.query('SELECT * FROM sessions WHERE runner_id = $1 ORDER BY created_at DESC', [runnerId]);
    return result.rows.map((r) => ({ id: r.id, tenantId: r.tenant_id, agentName: r.agent_name, sandboxId: r.sandbox_id, status: r.status, runnerId: r.runner_id ?? null, createdAt: r.created_at, lastActiveAt: r.last_active_at }));
  }

  async touchSession(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.pool.query('UPDATE sessions SET last_active_at = $1 WHERE id = $2', [now, id]);
  }

  // -- Sandboxes --------------------------------------------------------------

  async insertSandbox(id: string, agentName: string, workspaceDir: string, sessionId?: string, tenantId: string = 'default'): Promise<void> {
    const now = new Date().toISOString();
    await this.pool.query(`
      INSERT INTO sandboxes (id, tenant_id, agent_name, workspace_dir, session_id, state, created_at, last_used_at)
      VALUES ($1, $2, $3, $4, $5, 'warming', $6, $7)
    `, [id, tenantId, agentName, workspaceDir, sessionId ?? null, now, now]);
  }

  async updateSandboxState(id: string, state: SandboxState): Promise<void> {
    await this.pool.query('UPDATE sandboxes SET state = $1 WHERE id = $2', [state, id]);
  }

  async updateSandboxSession(id: string, sessionId: string | null): Promise<void> {
    await this.pool.query('UPDATE sandboxes SET session_id = $1 WHERE id = $2', [sessionId, id]);
  }

  async touchSandbox(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.pool.query('UPDATE sandboxes SET last_used_at = $1 WHERE id = $2', [now, id]);
  }

  async getSandbox(id: string): Promise<SandboxRecord | null> {
    const result = await this.pool.query('SELECT * FROM sandboxes WHERE id = $1', [id]);
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      sessionId: row.session_id,
      agentName: row.agent_name,
      state: row.state,
      workspaceDir: row.workspace_dir,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
    };
  }

  async countSandboxes(): Promise<number> {
    const result = await this.pool.query('SELECT COUNT(*) as count FROM sandboxes');
    return parseInt(result.rows[0].count, 10);
  }

  async getBestEvictionCandidate(): Promise<SandboxRecord | null> {
    const result = await this.pool.query(`
      SELECT * FROM sandboxes
      WHERE state IN ('cold', 'warm', 'waiting')
      ORDER BY
        CASE state WHEN 'cold' THEN 0 WHEN 'warm' THEN 1 WHEN 'waiting' THEN 2 END,
        last_used_at ASC
      LIMIT 1
    `);
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      sessionId: row.session_id,
      agentName: row.agent_name,
      state: row.state,
      workspaceDir: row.workspace_dir,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
    };
  }

  async getIdleSandboxes(olderThan: string): Promise<SandboxRecord[]> {
    const result = await this.pool.query(
      "SELECT * FROM sandboxes WHERE state = 'waiting' AND last_used_at < $1 ORDER BY last_used_at ASC",
      [olderThan]
    );
    return result.rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      agentName: row.agent_name,
      state: row.state,
      workspaceDir: row.workspace_dir,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
    }));
  }

  async deleteSandbox(id: string): Promise<void> {
    await this.pool.query('DELETE FROM sandboxes WHERE id = $1', [id]);
  }

  async markAllSandboxesCold(): Promise<number> {
    const result = await this.pool.query(
      "UPDATE sandboxes SET state = 'cold' WHERE state != 'cold'"
    );
    return result.rowCount ?? 0;
  }

  // -- Messages --------------------------------------------------------------

  async insertMessage(sessionId: string, role: 'user' | 'assistant', content: string, tenantId: string = 'default'): Promise<Message> {
    const id = randomUUID();
    const now = new Date().toISOString();

    // Atomic sequence assignment — no TOCTOU race under concurrent writes
    const result = await this.pool.query(`
      INSERT INTO messages (id, tenant_id, session_id, role, content, sequence, created_at)
      VALUES ($1, $2, $3, $4, $5, COALESCE((SELECT MAX(sequence) FROM messages WHERE tenant_id = $2 AND session_id = $3), 0) + 1, $6)
      RETURNING sequence
    `, [id, tenantId, sessionId, role, content, now]);

    return { id, sessionId, tenantId, role, content, sequence: result.rows[0].sequence, createdAt: now };
  }

  async listMessages(sessionId: string, tenantId: string = 'default', opts?: { limit?: number; afterSequence?: number }): Promise<Message[]> {
    const limit = opts?.limit ?? 100;
    const afterSeq = opts?.afterSequence ?? 0;

    const result = await this.pool.query(
      'SELECT * FROM messages WHERE tenant_id = $1 AND session_id = $2 AND sequence > $3 ORDER BY sequence ASC LIMIT $4',
      [tenantId, sessionId, afterSeq, limit]
    );

    return result.rows.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      tenantId: r.tenant_id,
      role: r.role,
      content: r.content,
      sequence: r.sequence,
      createdAt: r.created_at,
    }));
  }

  // -- Session Events ---------------------------------------------------------

  async insertSessionEvent(sessionId: string, type: SessionEventType, data: string | null, tenantId: string = 'default'): Promise<SessionEvent> {
    const id = randomUUID();
    const now = new Date().toISOString();

    // Atomic sequence assignment — no TOCTOU race under concurrent writes
    const result = await this.pool.query(`
      INSERT INTO session_events (id, tenant_id, session_id, type, data, sequence, created_at)
      VALUES ($1, $2, $3, $4, $5, COALESCE((SELECT MAX(sequence) FROM session_events WHERE tenant_id = $2 AND session_id = $3), 0) + 1, $6)
      RETURNING sequence
    `, [id, tenantId, sessionId, type, data, now]);

    return { id, sessionId, tenantId, type, data, sequence: result.rows[0].sequence, createdAt: now };
  }

  async insertSessionEvents(events: Array<{ sessionId: string; type: SessionEventType; data: string | null; tenantId?: string }>): Promise<SessionEvent[]> {
    if (events.length === 0) return [];
    if (events.length === 1) return [await this.insertSessionEvent(events[0].sessionId, events[0].type, events[0].data, events[0].tenantId)];

    // All events in a single transaction with sequential sequence numbers
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const results: SessionEvent[] = [];
      for (const ev of events) {
        const id = randomUUID();
        const now = new Date().toISOString();
        const tenantId = ev.tenantId ?? 'default';
        const result = await client.query(`
          INSERT INTO session_events (id, tenant_id, session_id, type, data, sequence, created_at)
          VALUES ($1, $2, $3, $4, $5, COALESCE((SELECT MAX(sequence) FROM session_events WHERE tenant_id = $2 AND session_id = $3), 0) + 1, $6)
          RETURNING sequence
        `, [id, tenantId, ev.sessionId, ev.type, ev.data, now]);
        results.push({ id, sessionId: ev.sessionId, tenantId, type: ev.type, data: ev.data, sequence: result.rows[0].sequence, createdAt: now });
      }
      await client.query('COMMIT');
      return results;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async listSessionEvents(sessionId: string, tenantId: string = 'default', opts?: { limit?: number; afterSequence?: number; type?: SessionEventType }): Promise<SessionEvent[]> {
    const limit = opts?.limit ?? 200;
    const afterSeq = opts?.afterSequence ?? 0;

    let result;
    if (opts?.type) {
      result = await this.pool.query(
        'SELECT * FROM session_events WHERE tenant_id = $1 AND session_id = $2 AND sequence > $3 AND type = $4 ORDER BY sequence ASC LIMIT $5',
        [tenantId, sessionId, afterSeq, opts.type, limit]
      );
    } else {
      result = await this.pool.query(
        'SELECT * FROM session_events WHERE tenant_id = $1 AND session_id = $2 AND sequence > $3 ORDER BY sequence ASC LIMIT $4',
        [tenantId, sessionId, afterSeq, limit]
      );
    }

    return result.rows.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      tenantId: r.tenant_id,
      type: r.type,
      data: r.data,
      sequence: r.sequence,
      createdAt: r.created_at,
    }));
  }

  // -- API Keys --------------------------------------------------------------

  async getApiKeyByHash(keyHash: string): Promise<ApiKey | null> {
    const result = await this.pool.query('SELECT * FROM api_keys WHERE key_hash = $1', [keyHash]);
    const row = result.rows[0];
    if (!row) return null;
    return { id: row.id, tenantId: row.tenant_id, keyHash: row.key_hash, label: row.label, createdAt: row.created_at };
  }

  async insertApiKey(id: string, tenantId: string, keyHash: string, label: string): Promise<ApiKey> {
    const now = new Date().toISOString();
    await this.pool.query(`
      INSERT INTO api_keys (id, tenant_id, key_hash, label, created_at)
      VALUES ($1, $2, $3, $4, $5)
    `, [id, tenantId, keyHash, label, now]);
    return { id, tenantId, keyHash, label, createdAt: now };
  }

  async listApiKeysByTenant(tenantId: string): Promise<ApiKey[]> {
    const result = await this.pool.query('SELECT * FROM api_keys WHERE tenant_id = $1 ORDER BY created_at DESC', [tenantId]);
    return result.rows.map((r) => ({ id: r.id, tenantId: r.tenant_id, keyHash: r.key_hash, label: r.label, createdAt: r.created_at }));
  }

  async deleteApiKey(id: string): Promise<boolean> {
    const result = await this.pool.query('DELETE FROM api_keys WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  // -- Lifecycle --------------------------------------------------------------

  async close(): Promise<void> {
    await this.pool.end();
  }
}
