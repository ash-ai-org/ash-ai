import { randomUUID } from 'node:crypto';
import { eq, and, sql, gt, lt, ne, asc, desc, inArray } from 'drizzle-orm';
import type { Agent, Session, SessionStatus, SandboxRecord, SandboxState, ApiKey, Message, SessionEvent, SessionEventType } from '@ash-ai/shared';
import type { Db } from './index.js';

import type * as sqliteSchema from './schema.sqlite.js';
import type * as pgSchema from './schema.pg.js';

// The schema types are structurally identical — use a union.
type Schema = typeof sqliteSchema | typeof pgSchema;

/**
 * Unified Db implementation backed by Drizzle ORM.
 * Works with both SQLite (better-sqlite3) and PostgreSQL (pg) drivers.
 */
export class DrizzleDb implements Db {
  constructor(
    private drizzle: any, // DrizzleSQLiteDatabase | DrizzleNodePgDatabase
    private schema: Schema,
    private dialect: 'sqlite' | 'pg',
    private closeFn: () => Promise<void>,
  ) {}

  // -- Agents -----------------------------------------------------------------

  async upsertAgent(name: string, path: string, tenantId: string = 'default'): Promise<Agent> {
    const { agents } = this.schema;
    const now = new Date().toISOString();

    // Check for existing agent to get id and version
    const existing = await this.drizzle
      .select({ id: agents.id, version: agents.version })
      .from(agents)
      .where(and(eq(agents.tenantId, tenantId), eq(agents.name, name)))
      .limit(1);

    const version = existing.length > 0 ? existing[0].version + 1 : 1;
    const id = existing.length > 0 ? existing[0].id : randomUUID();

    await this.drizzle
      .insert(agents)
      .values({ id, tenantId, name, version, path, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: [agents.tenantId, agents.name],
        set: { version, path, updatedAt: now },
      });

    return { id, name, tenantId, version, path, createdAt: now, updatedAt: now };
  }

  async getAgent(name: string, tenantId: string = 'default'): Promise<Agent | null> {
    const { agents } = this.schema;
    const rows = await this.drizzle
      .select()
      .from(agents)
      .where(and(eq(agents.tenantId, tenantId), eq(agents.name, name)))
      .limit(1);
    if (rows.length === 0) return null;
    const r = rows[0];
    return { id: r.id, name: r.name, tenantId: r.tenantId, version: r.version, path: r.path, createdAt: r.createdAt, updatedAt: r.updatedAt };
  }

  async listAgents(tenantId: string = 'default'): Promise<Agent[]> {
    const { agents } = this.schema;
    const rows = await this.drizzle
      .select()
      .from(agents)
      .where(eq(agents.tenantId, tenantId))
      .orderBy(asc(agents.name));
    return rows.map((r: any) => ({ id: r.id, name: r.name, tenantId: r.tenantId, version: r.version, path: r.path, createdAt: r.createdAt, updatedAt: r.updatedAt }));
  }

  async deleteAgent(name: string, tenantId: string = 'default'): Promise<boolean> {
    const { agents, sessions } = this.schema;
    // Delete related sessions first
    await this.drizzle
      .delete(sessions)
      .where(and(eq(sessions.agentName, name), eq(sessions.tenantId, tenantId)));

    const result = await this.drizzle
      .delete(agents)
      .where(and(eq(agents.name, name), eq(agents.tenantId, tenantId)));

    // Drizzle returns { changes } for sqlite and { rowCount } for pg
    return (result.changes ?? result.rowCount ?? 0) > 0;
  }

  // -- Sessions ---------------------------------------------------------------

  async insertSession(id: string, agentName: string, sandboxId: string, tenantId: string = 'default'): Promise<Session> {
    const { sessions } = this.schema;
    const now = new Date().toISOString();
    await this.drizzle
      .insert(sessions)
      .values({ id, tenantId, agentName, sandboxId, status: 'starting', createdAt: now, lastActiveAt: now });

    return { id, tenantId, agentName, sandboxId, status: 'starting', createdAt: now, lastActiveAt: now };
  }

  async updateSessionStatus(id: string, status: SessionStatus): Promise<void> {
    const { sessions } = this.schema;
    const now = new Date().toISOString();
    await this.drizzle
      .update(sessions)
      .set({ status, lastActiveAt: now })
      .where(eq(sessions.id, id));
  }

  async updateSessionSandbox(id: string, sandboxId: string): Promise<void> {
    const { sessions } = this.schema;
    const now = new Date().toISOString();
    await this.drizzle
      .update(sessions)
      .set({ sandboxId, lastActiveAt: now })
      .where(eq(sessions.id, id));
  }

  async updateSessionRunner(id: string, runnerId: string | null): Promise<void> {
    const { sessions } = this.schema;
    const now = new Date().toISOString();
    await this.drizzle
      .update(sessions)
      .set({ runnerId, lastActiveAt: now })
      .where(eq(sessions.id, id));
  }

  async getSession(id: string): Promise<Session | null> {
    const { sessions } = this.schema;
    const rows = await this.drizzle
      .select()
      .from(sessions)
      .where(eq(sessions.id, id))
      .limit(1);
    if (rows.length === 0) return null;
    const r = rows[0];
    return { id: r.id, tenantId: r.tenantId, agentName: r.agentName, sandboxId: r.sandboxId, status: r.status as SessionStatus, runnerId: r.runnerId ?? null, createdAt: r.createdAt, lastActiveAt: r.lastActiveAt };
  }

  async listSessions(tenantId: string = 'default', agent?: string): Promise<Session[]> {
    const { sessions } = this.schema;
    const condition = agent
      ? and(eq(sessions.tenantId, tenantId), eq(sessions.agentName, agent))
      : eq(sessions.tenantId, tenantId);

    const rows = await this.drizzle
      .select()
      .from(sessions)
      .where(condition)
      .orderBy(desc(sessions.createdAt));

    return rows.map((r: any) => ({
      id: r.id, tenantId: r.tenantId, agentName: r.agentName, sandboxId: r.sandboxId,
      status: r.status as SessionStatus, runnerId: r.runnerId ?? null, createdAt: r.createdAt, lastActiveAt: r.lastActiveAt,
    }));
  }

  async listSessionsByRunner(runnerId: string): Promise<Session[]> {
    const { sessions } = this.schema;
    const rows = await this.drizzle
      .select()
      .from(sessions)
      .where(eq(sessions.runnerId, runnerId))
      .orderBy(desc(sessions.createdAt));

    return rows.map((r: any) => ({
      id: r.id, tenantId: r.tenantId, agentName: r.agentName, sandboxId: r.sandboxId,
      status: r.status as SessionStatus, runnerId: r.runnerId ?? null, createdAt: r.createdAt, lastActiveAt: r.lastActiveAt,
    }));
  }

  async touchSession(id: string): Promise<void> {
    const { sessions } = this.schema;
    const now = new Date().toISOString();
    await this.drizzle
      .update(sessions)
      .set({ lastActiveAt: now })
      .where(eq(sessions.id, id));
  }

  // -- Sandboxes --------------------------------------------------------------

  async insertSandbox(id: string, agentName: string, workspaceDir: string, sessionId?: string, tenantId: string = 'default'): Promise<void> {
    const { sandboxes } = this.schema;
    const now = new Date().toISOString();
    await this.drizzle
      .insert(sandboxes)
      .values({ id, tenantId, agentName, workspaceDir, sessionId: sessionId ?? null, state: 'warming', createdAt: now, lastUsedAt: now });
  }

  async updateSandboxState(id: string, state: SandboxState): Promise<void> {
    const { sandboxes } = this.schema;
    await this.drizzle
      .update(sandboxes)
      .set({ state })
      .where(eq(sandboxes.id, id));
  }

  async updateSandboxSession(id: string, sessionId: string | null): Promise<void> {
    const { sandboxes } = this.schema;
    await this.drizzle
      .update(sandboxes)
      .set({ sessionId })
      .where(eq(sandboxes.id, id));
  }

  async touchSandbox(id: string): Promise<void> {
    const { sandboxes } = this.schema;
    const now = new Date().toISOString();
    await this.drizzle
      .update(sandboxes)
      .set({ lastUsedAt: now })
      .where(eq(sandboxes.id, id));
  }

  async getSandbox(id: string): Promise<SandboxRecord | null> {
    const { sandboxes } = this.schema;
    const rows = await this.drizzle
      .select()
      .from(sandboxes)
      .where(eq(sandboxes.id, id))
      .limit(1);
    if (rows.length === 0) return null;
    const r = rows[0];
    return { id: r.id, sessionId: r.sessionId, agentName: r.agentName, state: r.state as SandboxState, workspaceDir: r.workspaceDir, createdAt: r.createdAt, lastUsedAt: r.lastUsedAt };
  }

  async countSandboxes(): Promise<number> {
    const { sandboxes } = this.schema;
    const rows = await this.drizzle
      .select({ count: sql<number>`count(*)` })
      .from(sandboxes);
    // SQLite returns number directly, PG returns string
    return typeof rows[0].count === 'string' ? parseInt(rows[0].count, 10) : rows[0].count;
  }

  async getBestEvictionCandidate(): Promise<SandboxRecord | null> {
    const { sandboxes } = this.schema;
    const rows = await this.drizzle
      .select()
      .from(sandboxes)
      .where(inArray(sandboxes.state, ['cold', 'warm', 'waiting']))
      .orderBy(
        sql`CASE ${sandboxes.state} WHEN 'cold' THEN 0 WHEN 'warm' THEN 1 WHEN 'waiting' THEN 2 END`,
        asc(sandboxes.lastUsedAt),
      )
      .limit(1);
    if (rows.length === 0) return null;
    const r = rows[0];
    return { id: r.id, sessionId: r.sessionId, agentName: r.agentName, state: r.state as SandboxState, workspaceDir: r.workspaceDir, createdAt: r.createdAt, lastUsedAt: r.lastUsedAt };
  }

  async getIdleSandboxes(olderThan: string): Promise<SandboxRecord[]> {
    const { sandboxes } = this.schema;
    const rows = await this.drizzle
      .select()
      .from(sandboxes)
      .where(and(eq(sandboxes.state, 'waiting'), lt(sandboxes.lastUsedAt, olderThan)))
      .orderBy(asc(sandboxes.lastUsedAt));
    return rows.map((r: any) => ({
      id: r.id, sessionId: r.sessionId, agentName: r.agentName,
      state: r.state as SandboxState, workspaceDir: r.workspaceDir, createdAt: r.createdAt, lastUsedAt: r.lastUsedAt,
    }));
  }

  async deleteSandbox(id: string): Promise<void> {
    const { sandboxes } = this.schema;
    await this.drizzle
      .delete(sandboxes)
      .where(eq(sandboxes.id, id));
  }

  async markAllSandboxesCold(): Promise<number> {
    const { sandboxes } = this.schema;
    const result = await this.drizzle
      .update(sandboxes)
      .set({ state: 'cold' })
      .where(ne(sandboxes.state, 'cold'));
    return result.changes ?? result.rowCount ?? 0;
  }

  // -- Messages ---------------------------------------------------------------

  async insertMessage(sessionId: string, role: 'user' | 'assistant', content: string, tenantId: string = 'default'): Promise<Message> {
    const { messages } = this.schema;
    const id = randomUUID();
    const now = new Date().toISOString();

    if (this.dialect === 'pg') {
      // PG: atomic subquery for sequence assignment (no TOCTOU race)
      const rows = await this.drizzle.execute(
        sql`INSERT INTO messages (id, tenant_id, session_id, role, content, sequence, created_at)
            VALUES (${id}, ${tenantId}, ${sessionId}, ${role}, ${content},
                    COALESCE((SELECT MAX(sequence) FROM messages WHERE tenant_id = ${tenantId} AND session_id = ${sessionId}), 0) + 1,
                    ${now})
            RETURNING sequence`
      );
      return { id, sessionId, tenantId, role, content, sequence: rows.rows[0].sequence, createdAt: now };
    }

    // SQLite: synchronous driver, no race condition risk
    const last = await this.drizzle
      .select({ maxSeq: sql<number | null>`MAX(${messages.sequence})` })
      .from(messages)
      .where(and(eq(messages.tenantId, tenantId), eq(messages.sessionId, sessionId)));
    const sequence = (last[0]?.maxSeq ?? 0) + 1;

    await this.drizzle
      .insert(messages)
      .values({ id, tenantId, sessionId, role, content, sequence, createdAt: now });

    return { id, sessionId, tenantId, role, content, sequence, createdAt: now };
  }

  async listMessages(sessionId: string, tenantId: string = 'default', opts?: { limit?: number; afterSequence?: number }): Promise<Message[]> {
    const { messages } = this.schema;
    const limit = opts?.limit ?? 100;
    const afterSeq = opts?.afterSequence ?? 0;

    const rows = await this.drizzle
      .select()
      .from(messages)
      .where(and(
        eq(messages.tenantId, tenantId),
        eq(messages.sessionId, sessionId),
        gt(messages.sequence, afterSeq),
      ))
      .orderBy(asc(messages.sequence))
      .limit(limit);

    return rows.map((r: any) => ({
      id: r.id, sessionId: r.sessionId, tenantId: r.tenantId,
      role: r.role, content: r.content, sequence: r.sequence, createdAt: r.createdAt,
    }));
  }

  // -- Session Events ---------------------------------------------------------

  async insertSessionEvent(sessionId: string, type: SessionEventType, data: string | null, tenantId: string = 'default'): Promise<SessionEvent> {
    const { sessionEvents } = this.schema;
    const id = randomUUID();
    const now = new Date().toISOString();

    if (this.dialect === 'pg') {
      const rows = await this.drizzle.execute(
        sql`INSERT INTO session_events (id, tenant_id, session_id, type, data, sequence, created_at)
            VALUES (${id}, ${tenantId}, ${sessionId}, ${type}, ${data},
                    COALESCE((SELECT MAX(sequence) FROM session_events WHERE tenant_id = ${tenantId} AND session_id = ${sessionId}), 0) + 1,
                    ${now})
            RETURNING sequence`
      );
      return { id, sessionId, tenantId, type, data, sequence: rows.rows[0].sequence, createdAt: now };
    }

    // SQLite
    const last = await this.drizzle
      .select({ maxSeq: sql<number | null>`MAX(${sessionEvents.sequence})` })
      .from(sessionEvents)
      .where(and(eq(sessionEvents.tenantId, tenantId), eq(sessionEvents.sessionId, sessionId)));
    const sequence = (last[0]?.maxSeq ?? 0) + 1;

    await this.drizzle
      .insert(sessionEvents)
      .values({ id, tenantId, sessionId, type, data, sequence, createdAt: now });

    return { id, sessionId, tenantId, type, data, sequence, createdAt: now };
  }

  async insertSessionEvents(events: Array<{ sessionId: string; type: SessionEventType; data: string | null; tenantId?: string }>): Promise<SessionEvent[]> {
    if (events.length === 0) return [];
    if (events.length === 1) return [await this.insertSessionEvent(events[0].sessionId, events[0].type, events[0].data, events[0].tenantId)];

    const { sessionEvents } = this.schema;
    const results: SessionEvent[] = [];

    if (this.dialect === 'pg') {
      // PG: use a transaction with raw SQL for atomic sequence assignment
      await this.drizzle.transaction(async (tx: any) => {
        for (const ev of events) {
          const id = randomUUID();
          const now = new Date().toISOString();
          const tenantId = ev.tenantId ?? 'default';
          const rows = await tx.execute(
            sql`INSERT INTO session_events (id, tenant_id, session_id, type, data, sequence, created_at)
                VALUES (${id}, ${tenantId}, ${ev.sessionId}, ${ev.type}, ${ev.data},
                        COALESCE((SELECT MAX(sequence) FROM session_events WHERE tenant_id = ${tenantId} AND session_id = ${ev.sessionId}), 0) + 1,
                        ${now})
                RETURNING sequence`
          );
          results.push({ id, sessionId: ev.sessionId, tenantId, type: ev.type, data: ev.data, sequence: rows.rows[0].sequence, createdAt: now });
        }
      });
      return results;
    }

    // SQLite: transaction with sequential sequence computation
    return this.drizzle.transaction((tx: any) => {
      const groups = new Map<string, number>();
      for (const ev of events) {
        const tenantId = ev.tenantId ?? 'default';
        const key = `${tenantId}:${ev.sessionId}`;
        if (!groups.has(key)) {
          const last = tx
            .select({ maxSeq: sql<number | null>`MAX(${sessionEvents.sequence})` })
            .from(sessionEvents)
            .where(and(eq(sessionEvents.tenantId, tenantId), eq(sessionEvents.sessionId, ev.sessionId)))
            .get();
          groups.set(key, last?.maxSeq ?? 0);
        }
        const sequence = groups.get(key)! + 1;
        groups.set(key, sequence);

        const id = randomUUID();
        const now = new Date().toISOString();
        tx.insert(sessionEvents)
          .values({ id, tenantId, sessionId: ev.sessionId, type: ev.type, data: ev.data, sequence, createdAt: now })
          .run();
        results.push({ id, sessionId: ev.sessionId, tenantId, type: ev.type, data: ev.data, sequence, createdAt: now });
      }
      return results;
    });
  }

  async listSessionEvents(sessionId: string, tenantId: string = 'default', opts?: { limit?: number; afterSequence?: number; type?: SessionEventType }): Promise<SessionEvent[]> {
    const { sessionEvents } = this.schema;
    const limit = opts?.limit ?? 200;
    const afterSeq = opts?.afterSequence ?? 0;

    const conditions = [
      eq(sessionEvents.tenantId, tenantId),
      eq(sessionEvents.sessionId, sessionId),
      gt(sessionEvents.sequence, afterSeq),
    ];
    if (opts?.type) {
      conditions.push(eq(sessionEvents.type, opts.type));
    }

    const rows = await this.drizzle
      .select()
      .from(sessionEvents)
      .where(and(...conditions))
      .orderBy(asc(sessionEvents.sequence))
      .limit(limit);

    return rows.map((r: any) => ({
      id: r.id, sessionId: r.sessionId, tenantId: r.tenantId,
      type: r.type, data: r.data, sequence: r.sequence, createdAt: r.createdAt,
    }));
  }

  // -- API Keys ---------------------------------------------------------------

  async getApiKeyByHash(keyHash: string): Promise<ApiKey | null> {
    const { apiKeys } = this.schema;
    const rows = await this.drizzle
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, keyHash))
      .limit(1);
    if (rows.length === 0) return null;
    const r = rows[0];
    return { id: r.id, tenantId: r.tenantId, keyHash: r.keyHash, label: r.label, createdAt: r.createdAt };
  }

  async insertApiKey(id: string, tenantId: string, keyHash: string, label: string): Promise<ApiKey> {
    const { apiKeys } = this.schema;
    const now = new Date().toISOString();
    await this.drizzle
      .insert(apiKeys)
      .values({ id, tenantId, keyHash, label, createdAt: now });
    return { id, tenantId, keyHash, label, createdAt: now };
  }

  async listApiKeysByTenant(tenantId: string): Promise<ApiKey[]> {
    const { apiKeys } = this.schema;
    const rows = await this.drizzle
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.tenantId, tenantId))
      .orderBy(desc(apiKeys.createdAt));
    return rows.map((r: any) => ({ id: r.id, tenantId: r.tenantId, keyHash: r.keyHash, label: r.label, createdAt: r.createdAt }));
  }

  async deleteApiKey(id: string): Promise<boolean> {
    const { apiKeys } = this.schema;
    const result = await this.drizzle
      .delete(apiKeys)
      .where(eq(apiKeys.id, id));
    return (result.changes ?? result.rowCount ?? 0) > 0;
  }

  // -- Lifecycle --------------------------------------------------------------

  async close(): Promise<void> {
    await this.closeFn();
  }
}
