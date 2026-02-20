import Database from 'better-sqlite3';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { Agent, Session, SessionStatus, SandboxRecord, SandboxState, ApiKey } from '@ash-ai/shared';
import type { Db } from './index.js';

export class SqliteDb implements Db {
  private db: Database.Database;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.db = new Database(join(dataDir, 'ash.db'));
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        name TEXT PRIMARY KEY,
        version INTEGER NOT NULL DEFAULT 1,
        path TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        agent_name TEXT NOT NULL,
        sandbox_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'starting',
        runner_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_active_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (agent_name) REFERENCES agents(name)
      );

      CREATE TABLE IF NOT EXISTS sandboxes (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        agent_name TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'warming',
        workspace_dir TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_used_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_sandboxes_state ON sandboxes(state);
      CREATE INDEX IF NOT EXISTS idx_sandboxes_session ON sandboxes(session_id);
      CREATE INDEX IF NOT EXISTS idx_sandboxes_last_used ON sandboxes(last_used_at);
    `);

    // Multi-tenancy migration: add tenant_id columns (idempotent via try/catch since SQLite lacks IF NOT EXISTS for columns)
    const migrations = [
      "ALTER TABLE agents ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default'",
      "ALTER TABLE sessions ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default'",
      "ALTER TABLE sandboxes ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default'",
    ];
    for (const sql of migrations) {
      try { this.db.exec(sql); } catch { /* column already exists */ }
    }

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_agents_tenant ON agents(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_tenant ON sessions(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_sandboxes_tenant ON sandboxes(tenant_id);

      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
    `);

    // Agent UUID migration: change PK from name to UUID id, add UNIQUE(tenant_id, name), drop FK from sessions
    const agentCols = this.db.prepare("PRAGMA table_info(agents)").all() as { name: string }[];
    const needsAgentIdMigration = !agentCols.some((c) => c.name === 'id');
    if (needsAgentIdMigration) {
      this.db.pragma('foreign_keys = OFF');
      this.db.transaction(() => {
        this.db.exec(`
          CREATE TABLE agents_new (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL DEFAULT 'default',
            name TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 1,
            path TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(tenant_id, name)
          )
        `);

        const oldRows = this.db.prepare('SELECT * FROM agents').all() as any[];
        const insert = this.db.prepare(
          'INSERT INTO agents_new (id, tenant_id, name, version, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        for (const row of oldRows) {
          insert.run(randomUUID(), row.tenant_id, row.name, row.version, row.path, row.created_at, row.updated_at);
        }

        this.db.exec('DROP TABLE agents');
        this.db.exec('ALTER TABLE agents_new RENAME TO agents');
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_agents_tenant ON agents(tenant_id)');

        // Recreate sessions without FK to agents(name)
        this.db.exec(`
          CREATE TABLE sessions_new (
            id TEXT PRIMARY KEY,
            tenant_id TEXT NOT NULL DEFAULT 'default',
            agent_name TEXT NOT NULL,
            sandbox_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'starting',
            runner_id TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            last_active_at TEXT NOT NULL DEFAULT (datetime('now'))
          )
        `);
        this.db.exec(`
          INSERT INTO sessions_new (id, tenant_id, agent_name, sandbox_id, status, runner_id, created_at, last_active_at)
          SELECT id, tenant_id, agent_name, sandbox_id, status, runner_id, created_at, last_active_at FROM sessions
        `);
        this.db.exec('DROP TABLE sessions');
        this.db.exec('ALTER TABLE sessions_new RENAME TO sessions');
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_tenant ON sessions(tenant_id)');
      })();
      this.db.pragma('foreign_keys = ON');
    }
  }

  // -- Agents -----------------------------------------------------------------

  async upsertAgent(name: string, path: string, tenantId: string = 'default'): Promise<Agent> {
    const existing = this.db.prepare('SELECT id, version FROM agents WHERE tenant_id = ? AND name = ?').get(tenantId, name) as { id: string; version: number } | undefined;
    const version = existing ? existing.version + 1 : 1;
    const id = existing?.id ?? randomUUID();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO agents (id, tenant_id, name, version, path, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tenant_id, name) DO UPDATE SET version = ?, path = ?, updated_at = ?
    `).run(id, tenantId, name, version, path, now, now, version, path, now);

    return { id, name, tenantId, version, path, createdAt: now, updatedAt: now };
  }

  async getAgent(name: string, tenantId: string = 'default'): Promise<Agent | null> {
    const row = this.db.prepare('SELECT * FROM agents WHERE tenant_id = ? AND name = ?').get(tenantId, name) as any;
    if (!row) return null;
    return { id: row.id, name: row.name, tenantId: row.tenant_id, version: row.version, path: row.path, createdAt: row.created_at, updatedAt: row.updated_at };
  }

  async listAgents(tenantId: string = 'default'): Promise<Agent[]> {
    const rows = this.db.prepare('SELECT * FROM agents WHERE tenant_id = ? ORDER BY name').all(tenantId) as any[];
    return rows.map((r) => ({ id: r.id, name: r.name, tenantId: r.tenant_id, version: r.version, path: r.path, createdAt: r.created_at, updatedAt: r.updated_at }));
  }

  async deleteAgent(name: string, tenantId: string = 'default'): Promise<boolean> {
    this.db.prepare('DELETE FROM sessions WHERE agent_name = ? AND tenant_id = ?').run(name, tenantId);
    const result = this.db.prepare('DELETE FROM agents WHERE name = ? AND tenant_id = ?').run(name, tenantId);
    return result.changes > 0;
  }

  // -- Sessions ---------------------------------------------------------------

  async insertSession(id: string, agentName: string, sandboxId: string, tenantId: string = 'default'): Promise<Session> {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO sessions (id, tenant_id, agent_name, sandbox_id, status, created_at, last_active_at)
      VALUES (?, ?, ?, ?, 'starting', ?, ?)
    `).run(id, tenantId, agentName, sandboxId, now, now);

    return { id, tenantId, agentName, sandboxId, status: 'starting', createdAt: now, lastActiveAt: now };
  }

  async updateSessionStatus(id: string, status: SessionStatus): Promise<void> {
    const now = new Date().toISOString();
    this.db.prepare('UPDATE sessions SET status = ?, last_active_at = ? WHERE id = ?').run(status, now, id);
  }

  async updateSessionSandbox(id: string, sandboxId: string): Promise<void> {
    const now = new Date().toISOString();
    this.db.prepare('UPDATE sessions SET sandbox_id = ?, last_active_at = ? WHERE id = ?').run(sandboxId, now, id);
  }

  async updateSessionRunner(id: string, runnerId: string | null): Promise<void> {
    const now = new Date().toISOString();
    this.db.prepare('UPDATE sessions SET runner_id = ?, last_active_at = ? WHERE id = ?').run(runnerId, now, id);
  }

  async getSession(id: string): Promise<Session | null> {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as any;
    if (!row) return null;
    return { id: row.id, tenantId: row.tenant_id, agentName: row.agent_name, sandboxId: row.sandbox_id, status: row.status, runnerId: row.runner_id ?? null, createdAt: row.created_at, lastActiveAt: row.last_active_at };
  }

  async listSessions(tenantId: string = 'default', agent?: string): Promise<Session[]> {
    const rows = agent
      ? this.db.prepare('SELECT * FROM sessions WHERE tenant_id = ? AND agent_name = ? ORDER BY created_at DESC').all(tenantId, agent) as any[]
      : this.db.prepare('SELECT * FROM sessions WHERE tenant_id = ? ORDER BY created_at DESC').all(tenantId) as any[];
    return rows.map((r) => ({ id: r.id, tenantId: r.tenant_id, agentName: r.agent_name, sandboxId: r.sandbox_id, status: r.status, runnerId: r.runner_id ?? null, createdAt: r.created_at, lastActiveAt: r.last_active_at }));
  }

  async listSessionsByRunner(runnerId: string): Promise<Session[]> {
    const rows = this.db.prepare('SELECT * FROM sessions WHERE runner_id = ? ORDER BY created_at DESC').all(runnerId) as any[];
    return rows.map((r) => ({ id: r.id, tenantId: r.tenant_id, agentName: r.agent_name, sandboxId: r.sandbox_id, status: r.status, runnerId: r.runner_id ?? null, createdAt: r.created_at, lastActiveAt: r.last_active_at }));
  }

  async touchSession(id: string): Promise<void> {
    const now = new Date().toISOString();
    this.db.prepare('UPDATE sessions SET last_active_at = ? WHERE id = ?').run(now, id);
  }

  // -- Sandboxes --------------------------------------------------------------

  async insertSandbox(id: string, agentName: string, workspaceDir: string, sessionId?: string, tenantId: string = 'default'): Promise<void> {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO sandboxes (id, tenant_id, agent_name, workspace_dir, session_id, state, created_at, last_used_at)
      VALUES (?, ?, ?, ?, ?, 'warming', ?, ?)
    `).run(id, tenantId, agentName, workspaceDir, sessionId ?? null, now, now);
  }

  async updateSandboxState(id: string, state: SandboxState): Promise<void> {
    this.db.prepare('UPDATE sandboxes SET state = ? WHERE id = ?').run(state, id);
  }

  async updateSandboxSession(id: string, sessionId: string | null): Promise<void> {
    this.db.prepare('UPDATE sandboxes SET session_id = ? WHERE id = ?').run(sessionId, id);
  }

  async touchSandbox(id: string): Promise<void> {
    const now = new Date().toISOString();
    this.db.prepare('UPDATE sandboxes SET last_used_at = ? WHERE id = ?').run(now, id);
  }

  async getSandbox(id: string): Promise<SandboxRecord | null> {
    const row = this.db.prepare('SELECT * FROM sandboxes WHERE id = ?').get(id) as any;
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
    const row = this.db.prepare('SELECT COUNT(*) as count FROM sandboxes').get() as { count: number };
    return row.count;
  }

  async getBestEvictionCandidate(): Promise<SandboxRecord | null> {
    const row = this.db.prepare(`
      SELECT * FROM sandboxes
      WHERE state IN ('cold', 'warm', 'waiting')
      ORDER BY
        CASE state WHEN 'cold' THEN 0 WHEN 'warm' THEN 1 WHEN 'waiting' THEN 2 END,
        last_used_at ASC
      LIMIT 1
    `).get() as any;
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
    const rows = this.db.prepare(
      "SELECT * FROM sandboxes WHERE state = 'waiting' AND last_used_at < ? ORDER BY last_used_at ASC"
    ).all(olderThan) as any[];
    return rows.map((row) => ({
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
    this.db.prepare('DELETE FROM sandboxes WHERE id = ?').run(id);
  }

  async markAllSandboxesCold(): Promise<number> {
    const result = this.db.prepare(
      "UPDATE sandboxes SET state = 'cold' WHERE state != 'cold'"
    ).run();
    return result.changes;
  }

  // -- API Keys --------------------------------------------------------------

  async getApiKeyByHash(keyHash: string): Promise<ApiKey | null> {
    const row = this.db.prepare('SELECT * FROM api_keys WHERE key_hash = ?').get(keyHash) as any;
    if (!row) return null;
    return { id: row.id, tenantId: row.tenant_id, keyHash: row.key_hash, label: row.label, createdAt: row.created_at };
  }

  async insertApiKey(id: string, tenantId: string, keyHash: string, label: string): Promise<ApiKey> {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO api_keys (id, tenant_id, key_hash, label, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, tenantId, keyHash, label, now);
    return { id, tenantId, keyHash, label, createdAt: now };
  }

  async listApiKeysByTenant(tenantId: string): Promise<ApiKey[]> {
    const rows = this.db.prepare('SELECT * FROM api_keys WHERE tenant_id = ? ORDER BY created_at DESC').all(tenantId) as any[];
    return rows.map((r) => ({ id: r.id, tenantId: r.tenant_id, keyHash: r.key_hash, label: r.label, createdAt: r.created_at }));
  }

  async deleteApiKey(id: string): Promise<boolean> {
    const result = this.db.prepare('DELETE FROM api_keys WHERE id = ?').run(id);
    return result.changes > 0;
  }

  // -- Lifecycle --------------------------------------------------------------

  async close(): Promise<void> {
    this.db.close();
  }
}
