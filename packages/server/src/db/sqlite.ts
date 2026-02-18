import Database from 'better-sqlite3';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { Agent, Session, SessionStatus, SandboxRecord, SandboxState } from '@ash-ai/shared';
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
  }

  // -- Agents -----------------------------------------------------------------

  async upsertAgent(name: string, path: string): Promise<Agent> {
    const existing = this.db.prepare('SELECT version FROM agents WHERE name = ?').get(name) as { version: number } | undefined;
    const version = existing ? existing.version + 1 : 1;
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO agents (name, version, path, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET version = ?, path = ?, updated_at = ?
    `).run(name, version, path, now, now, version, path, now);

    return { name, version, path, createdAt: now, updatedAt: now };
  }

  async getAgent(name: string): Promise<Agent | null> {
    const row = this.db.prepare('SELECT * FROM agents WHERE name = ?').get(name) as any;
    if (!row) return null;
    return { name: row.name, version: row.version, path: row.path, createdAt: row.created_at, updatedAt: row.updated_at };
  }

  async listAgents(): Promise<Agent[]> {
    const rows = this.db.prepare('SELECT * FROM agents ORDER BY name').all() as any[];
    return rows.map((r) => ({ name: r.name, version: r.version, path: r.path, createdAt: r.created_at, updatedAt: r.updated_at }));
  }

  async deleteAgent(name: string): Promise<boolean> {
    this.db.prepare('DELETE FROM sessions WHERE agent_name = ?').run(name);
    const result = this.db.prepare('DELETE FROM agents WHERE name = ?').run(name);
    return result.changes > 0;
  }

  // -- Sessions ---------------------------------------------------------------

  async insertSession(id: string, agentName: string, sandboxId: string): Promise<Session> {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO sessions (id, agent_name, sandbox_id, status, created_at, last_active_at)
      VALUES (?, ?, ?, 'starting', ?, ?)
    `).run(id, agentName, sandboxId, now, now);

    return { id, agentName, sandboxId, status: 'starting', createdAt: now, lastActiveAt: now };
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
    return { id: row.id, agentName: row.agent_name, sandboxId: row.sandbox_id, status: row.status, runnerId: row.runner_id ?? null, createdAt: row.created_at, lastActiveAt: row.last_active_at };
  }

  async listSessions(agent?: string): Promise<Session[]> {
    const rows = agent
      ? this.db.prepare('SELECT * FROM sessions WHERE agent_name = ? ORDER BY created_at DESC').all(agent) as any[]
      : this.db.prepare('SELECT * FROM sessions ORDER BY created_at DESC').all() as any[];
    return rows.map((r) => ({ id: r.id, agentName: r.agent_name, sandboxId: r.sandbox_id, status: r.status, runnerId: r.runner_id ?? null, createdAt: r.created_at, lastActiveAt: r.last_active_at }));
  }

  async listSessionsByRunner(runnerId: string): Promise<Session[]> {
    const rows = this.db.prepare('SELECT * FROM sessions WHERE runner_id = ? ORDER BY created_at DESC').all(runnerId) as any[];
    return rows.map((r) => ({ id: r.id, agentName: r.agent_name, sandboxId: r.sandbox_id, status: r.status, runnerId: r.runner_id ?? null, createdAt: r.created_at, lastActiveAt: r.last_active_at }));
  }

  async touchSession(id: string): Promise<void> {
    const now = new Date().toISOString();
    this.db.prepare('UPDATE sessions SET last_active_at = ? WHERE id = ?').run(now, id);
  }

  // -- Sandboxes --------------------------------------------------------------

  async insertSandbox(id: string, agentName: string, workspaceDir: string, sessionId?: string): Promise<void> {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO sandboxes (id, agent_name, workspace_dir, session_id, state, created_at, last_used_at)
      VALUES (?, ?, ?, ?, 'warming', ?, ?)
    `).run(id, agentName, workspaceDir, sessionId ?? null, now, now);
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

  // -- Lifecycle --------------------------------------------------------------

  async close(): Promise<void> {
    this.db.close();
  }
}
