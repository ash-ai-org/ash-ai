import pg from 'pg';
import type { Agent, Session, SessionStatus, SandboxRecord, SandboxState } from '@ash-ai/shared';
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
  }

  // -- Agents -----------------------------------------------------------------

  async upsertAgent(name: string, path: string): Promise<Agent> {
    const existing = await this.pool.query('SELECT version FROM agents WHERE name = $1', [name]);
    const version = existing.rows.length > 0 ? existing.rows[0].version + 1 : 1;
    const now = new Date().toISOString();

    await this.pool.query(`
      INSERT INTO agents (name, version, path, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT(name) DO UPDATE SET version = $2, path = $3, updated_at = $5
    `, [name, version, path, now, now]);

    return { name, version, path, createdAt: now, updatedAt: now };
  }

  async getAgent(name: string): Promise<Agent | null> {
    const result = await this.pool.query('SELECT * FROM agents WHERE name = $1', [name]);
    const row = result.rows[0];
    if (!row) return null;
    return { name: row.name, version: row.version, path: row.path, createdAt: row.created_at, updatedAt: row.updated_at };
  }

  async listAgents(): Promise<Agent[]> {
    const result = await this.pool.query('SELECT * FROM agents ORDER BY name');
    return result.rows.map((r) => ({ name: r.name, version: r.version, path: r.path, createdAt: r.created_at, updatedAt: r.updated_at }));
  }

  async deleteAgent(name: string): Promise<boolean> {
    await this.pool.query('DELETE FROM sessions WHERE agent_name = $1', [name]);
    const result = await this.pool.query('DELETE FROM agents WHERE name = $1', [name]);
    return (result.rowCount ?? 0) > 0;
  }

  // -- Sessions ---------------------------------------------------------------

  async insertSession(id: string, agentName: string, sandboxId: string): Promise<Session> {
    const now = new Date().toISOString();
    await this.pool.query(`
      INSERT INTO sessions (id, agent_name, sandbox_id, status, created_at, last_active_at)
      VALUES ($1, $2, $3, 'starting', $4, $5)
    `, [id, agentName, sandboxId, now, now]);

    return { id, agentName, sandboxId, status: 'starting', createdAt: now, lastActiveAt: now };
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
    return { id: row.id, agentName: row.agent_name, sandboxId: row.sandbox_id, status: row.status, runnerId: row.runner_id ?? null, createdAt: row.created_at, lastActiveAt: row.last_active_at };
  }

  async listSessions(agent?: string): Promise<Session[]> {
    const result = agent
      ? await this.pool.query('SELECT * FROM sessions WHERE agent_name = $1 ORDER BY created_at DESC', [agent])
      : await this.pool.query('SELECT * FROM sessions ORDER BY created_at DESC');
    return result.rows.map((r) => ({ id: r.id, agentName: r.agent_name, sandboxId: r.sandbox_id, status: r.status, runnerId: r.runner_id ?? null, createdAt: r.created_at, lastActiveAt: r.last_active_at }));
  }

  async listSessionsByRunner(runnerId: string): Promise<Session[]> {
    const result = await this.pool.query('SELECT * FROM sessions WHERE runner_id = $1 ORDER BY created_at DESC', [runnerId]);
    return result.rows.map((r) => ({ id: r.id, agentName: r.agent_name, sandboxId: r.sandbox_id, status: r.status, runnerId: r.runner_id ?? null, createdAt: r.created_at, lastActiveAt: r.last_active_at }));
  }

  async touchSession(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.pool.query('UPDATE sessions SET last_active_at = $1 WHERE id = $2', [now, id]);
  }

  // -- Sandboxes --------------------------------------------------------------

  async insertSandbox(id: string, agentName: string, workspaceDir: string, sessionId?: string): Promise<void> {
    const now = new Date().toISOString();
    await this.pool.query(`
      INSERT INTO sandboxes (id, agent_name, workspace_dir, session_id, state, created_at, last_used_at)
      VALUES ($1, $2, $3, $4, 'warming', $5, $6)
    `, [id, agentName, workspaceDir, sessionId ?? null, now, now]);
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

  // -- Lifecycle --------------------------------------------------------------

  async close(): Promise<void> {
    await this.pool.end();
  }
}
