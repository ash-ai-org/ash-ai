import { randomUUID } from 'node:crypto';
import { eq, and, sql, gt, lt, ne, asc, desc, inArray } from 'drizzle-orm';
import type { Agent, Session, SessionStatus, SandboxRecord, SandboxState, ApiKey, Message, SessionEvent, SessionEventType, RunnerRecord, Credential, QueueItem, QueueItemStatus, QueueStats, Attachment, UsageEvent, UsageEventType, UsageStats } from '@ash-ai/shared';
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


  // -- Runners ----------------------------------------------------------------

  async upsertRunner(id: string, host: string, port: number, maxSandboxes: number): Promise<RunnerRecord> {
    const { runners } = this.schema;
    const now = new Date().toISOString();

    await this.drizzle
      .insert(runners)
      .values({ id, host, port, maxSandboxes, activeCount: 0, warmingCount: 0, lastHeartbeatAt: now, registeredAt: now })
      .onConflictDoUpdate({
        target: runners.id,
        set: { host, port, maxSandboxes, lastHeartbeatAt: now },
      });

    return { id, host, port, maxSandboxes, activeCount: 0, warmingCount: 0, lastHeartbeatAt: now, registeredAt: now };
  }

  async heartbeatRunner(id: string, activeCount: number, warmingCount: number): Promise<void> {
    const { runners } = this.schema;
    const now = new Date().toISOString();
    await this.drizzle
      .update(runners)
      .set({ activeCount, warmingCount, lastHeartbeatAt: now })
      .where(eq(runners.id, id));
  }

  async getRunner(id: string): Promise<RunnerRecord | null> {
    const { runners } = this.schema;
    const rows = await this.drizzle
      .select()
      .from(runners)
      .where(eq(runners.id, id))
      .limit(1);
    if (rows.length === 0) return null;
    const r = rows[0];
    return { id: r.id, host: r.host, port: r.port, maxSandboxes: r.maxSandboxes, activeCount: r.activeCount, warmingCount: r.warmingCount, lastHeartbeatAt: r.lastHeartbeatAt, registeredAt: r.registeredAt };
  }

  async listHealthyRunners(cutoffIso: string): Promise<RunnerRecord[]> {
    const { runners } = this.schema;
    const rows = await this.drizzle
      .select()
      .from(runners)
      .where(gt(runners.lastHeartbeatAt, cutoffIso));
    return rows.map((r: any) => ({
      id: r.id, host: r.host, port: r.port, maxSandboxes: r.maxSandboxes,
      activeCount: r.activeCount, warmingCount: r.warmingCount,
      lastHeartbeatAt: r.lastHeartbeatAt, registeredAt: r.registeredAt,
    }));
  }

  async listDeadRunners(cutoffIso: string): Promise<RunnerRecord[]> {
    const { runners } = this.schema;
    const rows = await this.drizzle
      .select()
      .from(runners)
      .where(sql`${runners.lastHeartbeatAt} <= ${cutoffIso}`);
    return rows.map((r: any) => ({
      id: r.id, host: r.host, port: r.port, maxSandboxes: r.maxSandboxes,
      activeCount: r.activeCount, warmingCount: r.warmingCount,
      lastHeartbeatAt: r.lastHeartbeatAt, registeredAt: r.registeredAt,
    }));
  }

  async selectBestRunner(cutoffIso: string): Promise<RunnerRecord | null> {
    const { runners } = this.schema;
    const available = sql`${runners.maxSandboxes} - ${runners.activeCount} - ${runners.warmingCount}`;
    const rows = await this.drizzle
      .select()
      .from(runners)
      .where(and(
        gt(runners.lastHeartbeatAt, cutoffIso),
        gt(available, 0),  // Only runners with spare capacity
      ))
      .orderBy(desc(available))
      .limit(1);
    if (rows.length === 0) return null;
    const r = rows[0];
    return { id: r.id, host: r.host, port: r.port, maxSandboxes: r.maxSandboxes, activeCount: r.activeCount, warmingCount: r.warmingCount, lastHeartbeatAt: r.lastHeartbeatAt, registeredAt: r.registeredAt };
  }

  async deleteRunner(id: string): Promise<void> {
    const { runners } = this.schema;
    await this.drizzle
      .delete(runners)
      .where(eq(runners.id, id));
  }

  async listAllRunners(): Promise<RunnerRecord[]> {
    const { runners } = this.schema;
    const rows = await this.drizzle
      .select()
      .from(runners)
      .orderBy(desc(sql`${runners.maxSandboxes} - ${runners.activeCount} - ${runners.warmingCount}`));
    return rows.map((r: any) => ({
      id: r.id, host: r.host, port: r.port, maxSandboxes: r.maxSandboxes,
      activeCount: r.activeCount, warmingCount: r.warmingCount,
      lastHeartbeatAt: r.lastHeartbeatAt, registeredAt: r.registeredAt,
    }));
  }

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

  async insertSession(id: string, agentName: string, sandboxId: string, tenantId: string = 'default', parentSessionId?: string, model?: string): Promise<Session> {
    const { sessions } = this.schema;
    const now = new Date().toISOString();
    await this.drizzle
      .insert(sessions)
      .values({ id, tenantId, agentName, sandboxId, status: 'starting', parentSessionId: parentSessionId ?? null, model: model ?? null, createdAt: now, lastActiveAt: now });

    return { id, tenantId, agentName, sandboxId, status: 'starting', parentSessionId: parentSessionId ?? null, model: model ?? null, createdAt: now, lastActiveAt: now };
  }

  async insertForkedSession(id: string, parentSession: Session, sandboxId: string): Promise<Session> {
    const { sessions, messages } = this.schema;
    const now = new Date().toISOString();
    const tenantId = parentSession.tenantId ?? 'default';

    // 1. Create new session linked to parent
    await this.drizzle
      .insert(sessions)
      .values({ id, tenantId, agentName: parentSession.agentName, sandboxId, status: 'paused', parentSessionId: parentSession.id, model: parentSession.model ?? null, createdAt: now, lastActiveAt: now });

    // 2. Copy all messages from parent session with new IDs and session reference
    const parentMessages = await this.drizzle
      .select()
      .from(messages)
      .where(and(eq(messages.tenantId, tenantId), eq(messages.sessionId, parentSession.id)))
      .orderBy(asc(messages.sequence));

    if (parentMessages.length > 0) {
      const copied = parentMessages.map((m: any) => ({
        id: randomUUID(),
        tenantId,
        sessionId: id,
        role: m.role,
        content: m.content,
        sequence: m.sequence,
        createdAt: m.createdAt,
      }));
      await this.drizzle.insert(messages).values(copied);
    }

    return { id, tenantId, agentName: parentSession.agentName, sandboxId, status: 'paused' as SessionStatus, parentSessionId: parentSession.id, model: parentSession.model ?? null, createdAt: now, lastActiveAt: now };
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
    return { id: r.id, tenantId: r.tenantId, agentName: r.agentName, sandboxId: r.sandboxId, status: r.status as SessionStatus, runnerId: r.runnerId ?? null, parentSessionId: r.parentSessionId ?? null, model: r.model ?? null, createdAt: r.createdAt, lastActiveAt: r.lastActiveAt };
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
      status: r.status as SessionStatus, runnerId: r.runnerId ?? null, parentSessionId: r.parentSessionId ?? null, model: r.model ?? null, createdAt: r.createdAt, lastActiveAt: r.lastActiveAt,
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
      status: r.status as SessionStatus, runnerId: r.runnerId ?? null, parentSessionId: r.parentSessionId ?? null, model: r.model ?? null, createdAt: r.createdAt, lastActiveAt: r.lastActiveAt,
    }));
  }

  async bulkPauseSessionsByRunner(runnerId: string): Promise<number> {
    const { sessions } = this.schema;
    const now = new Date().toISOString();
    const result = await this.drizzle
      .update(sessions)
      .set({ status: 'paused', lastActiveAt: now })
      .where(and(
        eq(sessions.runnerId, runnerId),
        inArray(sessions.status, ['active', 'starting']),
      ));
    return result.changes ?? result.rowCount ?? 0;
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

  // -- Credentials ------------------------------------------------------------

  async insertCredential(id: string, tenantId: string, type: string, encryptedKey: string, iv: string, authTag: string, label: string, salt?: string | null): Promise<Credential> {
    const { credentials } = this.schema;
    const now = new Date().toISOString();
    await this.drizzle
      .insert(credentials)
      .values({ id, tenantId, type, encryptedKey, iv, authTag, salt: salt ?? null, label, active: 1, createdAt: now, lastUsedAt: null });
    return { id, tenantId, type: type as Credential['type'], label, active: true, createdAt: now, lastUsedAt: null };
  }

  async getCredential(id: string): Promise<{ id: string; tenantId: string; type: string; encryptedKey: string; iv: string; authTag: string; salt: string | null; label: string; active: boolean; createdAt: string; lastUsedAt: string | null } | null> {
    const { credentials } = this.schema;
    const rows = await this.drizzle
      .select()
      .from(credentials)
      .where(eq(credentials.id, id))
      .limit(1);
    if (rows.length === 0) return null;
    const r = rows[0] as any;
    return { id: r.id, tenantId: r.tenantId, type: r.type, encryptedKey: r.encryptedKey, iv: r.iv, authTag: r.authTag, salt: r.salt ?? null, label: r.label, active: r.active === 1, createdAt: r.createdAt, lastUsedAt: r.lastUsedAt };
  }

  async listCredentials(tenantId: string): Promise<Credential[]> {
    const { credentials } = this.schema;
    const rows = await this.drizzle
      .select()
      .from(credentials)
      .where(eq(credentials.tenantId, tenantId))
      .orderBy(desc(credentials.createdAt));
    return rows.map((r: any) => ({
      id: r.id, tenantId: r.tenantId, type: r.type as Credential['type'], label: r.label, active: r.active === 1, createdAt: r.createdAt, lastUsedAt: r.lastUsedAt,
    }));
  }

  async deleteCredential(id: string): Promise<boolean> {
    const { credentials } = this.schema;
    const result = await this.drizzle
      .delete(credentials)
      .where(eq(credentials.id, id));
    return (result.changes ?? result.rowCount ?? 0) > 0;
  }

  async touchCredentialUsed(id: string): Promise<void> {
    const { credentials } = this.schema;
    const now = new Date().toISOString();
    await this.drizzle
      .update(credentials)
      .set({ lastUsedAt: now })
      .where(eq(credentials.id, id));
  }

  // -- Queue ------------------------------------------------------------------

  async insertQueueItem(id: string, tenantId: string, agentName: string, prompt: string, sessionId?: string, priority?: number, maxRetries?: number): Promise<QueueItem> {
    const { queueItems } = this.schema;
    const now = new Date().toISOString();
    const item = { id, tenantId, sessionId: sessionId ?? null, agentName, prompt, status: 'pending', priority: priority ?? 0, retryCount: 0, maxRetries: maxRetries ?? 3, error: null, createdAt: now, startedAt: null, completedAt: null };
    await this.drizzle.insert(queueItems).values(item);
    return item as QueueItem;
  }

  async getQueueItem(id: string): Promise<QueueItem | null> {
    const { queueItems } = this.schema;
    const rows = await this.drizzle.select().from(queueItems).where(eq(queueItems.id, id)).limit(1);
    if (rows.length === 0) return null;
    return rows[0] as QueueItem;
  }

  async getNextPendingQueueItem(tenantId?: string): Promise<QueueItem | null> {
    const { queueItems } = this.schema;
    const now = new Date().toISOString();
    const conditions: any[] = [
      eq(queueItems.status, 'pending'),
      // Only return items that are eligible (no retryAfter or retryAfter has passed)
      sql`(${queueItems.retryAfter} IS NULL OR ${queueItems.retryAfter} <= ${now})`,
    ];
    if (tenantId) conditions.push(eq(queueItems.tenantId, tenantId));
    const rows = await this.drizzle.select().from(queueItems).where(and(...conditions)).orderBy(desc(queueItems.priority), asc(queueItems.createdAt)).limit(1);
    if (rows.length === 0) return null;
    return rows[0] as QueueItem;
  }

  /**
   * Atomically claim a queue item by setting status to 'processing'
   * only if it is still 'pending'. Returns true if the claim succeeded.
   */
  async claimQueueItem(id: string): Promise<boolean> {
    const { queueItems } = this.schema;
    const now = new Date().toISOString();
    const result = await this.drizzle
      .update(queueItems)
      .set({ status: 'processing', startedAt: now })
      .where(and(eq(queueItems.id, id), eq(queueItems.status, 'pending')));
    return (result.changes ?? result.rowCount ?? 0) > 0;
  }

  async updateQueueItemStatus(id: string, status: QueueItemStatus, error?: string): Promise<void> {
    const { queueItems } = this.schema;
    const now = new Date().toISOString();
    const set: Record<string, unknown> = { status };
    if (status === 'processing') set.startedAt = now;
    if (status === 'completed' || status === 'failed') set.completedAt = now;
    if (error !== undefined) set.error = error;
    await this.drizzle.update(queueItems).set(set).where(eq(queueItems.id, id));
  }

  async incrementQueueItemRetry(id: string, retryAfter?: string): Promise<void> {
    const { queueItems } = this.schema;
    const set: Record<string, unknown> = { retryCount: sql`${queueItems.retryCount} + 1` };
    if (retryAfter) set.retryAfter = retryAfter;
    await this.drizzle
      .update(queueItems)
      .set(set)
      .where(eq(queueItems.id, id));
  }

  async listQueueItems(tenantId: string, status?: QueueItemStatus, limit = 50): Promise<QueueItem[]> {
    const { queueItems } = this.schema;
    const conditions = [eq(queueItems.tenantId, tenantId)];
    if (status) conditions.push(eq(queueItems.status, status));
    const rows = await this.drizzle.select().from(queueItems).where(and(...conditions)).orderBy(desc(queueItems.createdAt)).limit(limit);
    return rows as QueueItem[];
  }

  async getQueueStats(tenantId: string): Promise<QueueStats> {
    const { queueItems } = this.schema;
    const rows = await this.drizzle
      .select({ status: queueItems.status, count: sql<number>`count(*)` })
      .from(queueItems)
      .where(eq(queueItems.tenantId, tenantId))
      .groupBy(queueItems.status);

    const stats: QueueStats = { pending: 0, processing: 0, completed: 0, failed: 0, cancelled: 0 };
    for (const r of rows) {
      const s = r.status as keyof QueueStats;
      if (s in stats) stats[s] = Number(r.count);
    }
    return stats;
  }

  // -- Attachments -------------------------------------------------------------

  async insertAttachment(id: string, tenantId: string, messageId: string, sessionId: string, filename: string, mimeType: string, size: number, storagePath: string): Promise<Attachment> {
    const { attachments } = this.schema;
    const now = new Date().toISOString();
    const row = { id, tenantId, messageId, sessionId, filename, mimeType, size, storagePath, createdAt: now };
    await this.drizzle.insert(attachments).values(row);
    return row as Attachment;
  }

  async getAttachment(id: string): Promise<Attachment | null> {
    const { attachments } = this.schema;
    const rows = await this.drizzle.select().from(attachments).where(eq(attachments.id, id)).limit(1);
    if (rows.length === 0) return null;
    return rows[0] as Attachment;
  }

  async listAttachmentsByMessage(messageId: string, tenantId?: string): Promise<Attachment[]> {
    const { attachments } = this.schema;
    const conditions = [eq(attachments.messageId, messageId)];
    if (tenantId) conditions.push(eq(attachments.tenantId, tenantId));
    const rows = await this.drizzle.select().from(attachments).where(and(...conditions)).orderBy(asc(attachments.createdAt));
    return rows as Attachment[];
  }

  async listAttachmentsBySession(sessionId: string, tenantId?: string): Promise<Attachment[]> {
    const { attachments } = this.schema;
    const conditions = [eq(attachments.sessionId, sessionId)];
    if (tenantId) conditions.push(eq(attachments.tenantId, tenantId));
    const rows = await this.drizzle.select().from(attachments).where(and(...conditions)).orderBy(asc(attachments.createdAt));
    return rows as Attachment[];
  }

  async deleteAttachment(id: string): Promise<boolean> {
    const { attachments } = this.schema;
    const result = await this.drizzle.delete(attachments).where(eq(attachments.id, id));
    return (result?.rowsAffected ?? result?.changes ?? 0) > 0;
  }

  // -- Usage ------------------------------------------------------------------

  async insertUsageEvent(id: string, tenantId: string, sessionId: string, agentName: string, eventType: UsageEventType, value: number): Promise<UsageEvent> {
    const { usageEvents } = this.schema;
    const now = new Date().toISOString();
    const row = { id, tenantId, sessionId, agentName, eventType, value, createdAt: now };
    await this.drizzle.insert(usageEvents).values(row);
    return row as UsageEvent;
  }

  async insertUsageEvents(events: Array<{ id: string; tenantId: string; sessionId: string; agentName: string; eventType: UsageEventType; value: number }>): Promise<void> {
    if (events.length === 0) return;
    const { usageEvents } = this.schema;
    const now = new Date().toISOString();
    await this.drizzle.insert(usageEvents).values(events.map(e => ({ ...e, createdAt: now })));
  }

  async listUsageEvents(tenantId: string, opts?: { sessionId?: string; agentName?: string; after?: string; before?: string; limit?: number }): Promise<UsageEvent[]> {
    const { usageEvents } = this.schema;
    const conditions: any[] = [eq(usageEvents.tenantId, tenantId)];
    if (opts?.sessionId) conditions.push(eq(usageEvents.sessionId, opts.sessionId));
    if (opts?.agentName) conditions.push(eq(usageEvents.agentName, opts.agentName));
    if (opts?.after) conditions.push(sql`${usageEvents.createdAt} >= ${opts.after}`);
    if (opts?.before) conditions.push(sql`${usageEvents.createdAt} <= ${opts.before}`);
    const limit = opts?.limit ?? 100;
    const rows = await this.drizzle.select().from(usageEvents).where(and(...conditions)).orderBy(desc(usageEvents.createdAt)).limit(limit);
    return rows as UsageEvent[];
  }

  async getUsageStats(tenantId: string, opts?: { sessionId?: string; agentName?: string; after?: string; before?: string }): Promise<UsageStats> {
    const { usageEvents } = this.schema;
    const conditions: any[] = [eq(usageEvents.tenantId, tenantId)];
    if (opts?.sessionId) conditions.push(eq(usageEvents.sessionId, opts.sessionId));
    if (opts?.agentName) conditions.push(eq(usageEvents.agentName, opts.agentName));
    if (opts?.after) conditions.push(sql`${usageEvents.createdAt} >= ${opts.after}`);
    if (opts?.before) conditions.push(sql`${usageEvents.createdAt} <= ${opts.before}`);

    const rows = await this.drizzle
      .select({ eventType: usageEvents.eventType, total: sql<number>`sum(${usageEvents.value})` })
      .from(usageEvents)
      .where(and(...conditions))
      .groupBy(usageEvents.eventType);

    const stats: UsageStats = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheCreationTokens: 0,
      totalCacheReadTokens: 0,
      totalToolCalls: 0,
      totalMessages: 0,
      totalComputeSeconds: 0,
    };

    const map: Record<string, keyof UsageStats> = {
      input_tokens: 'totalInputTokens',
      output_tokens: 'totalOutputTokens',
      cache_creation_tokens: 'totalCacheCreationTokens',
      cache_read_tokens: 'totalCacheReadTokens',
      tool_call: 'totalToolCalls',
      message: 'totalMessages',
      compute_seconds: 'totalComputeSeconds',
    };

    for (const r of rows) {
      const key = map[r.eventType];
      if (key) stats[key] = Number(r.total);
    }
    return stats;
  }

  // -- Lifecycle --------------------------------------------------------------

  async close(): Promise<void> {
    await this.closeFn();
  }
}
