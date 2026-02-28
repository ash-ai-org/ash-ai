import { join, resolve, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Agent, Session, SessionStatus, SessionConfig, SandboxRecord, SandboxState, ApiKey, Message, SessionEvent, SessionEventType, RunnerRecord, Credential, QueueItem, QueueItemStatus, QueueStats, Attachment, UsageEvent, UsageEventType, UsageStats } from '@ash-ai/shared';

/** Resolve the package root from the current file — works from both src/ (tsx) and dist/ (compiled). */
function pkgRoot(): string {
  const thisFile = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url);
  return resolve(dirname(thisFile), '..', '..');
}

/**
 * Database interface for Ash persistence.
 *
 * Methods that create or query tenant-scoped data accept an optional `tenantId`
 * parameter (defaults to 'default'). This enables multi-tenant isolation at the
 * DB layer while remaining fully backward-compatible for single-tenant deployments.
 */
export interface Db {
  // Runners
  upsertRunner(id: string, host: string, port: number, maxSandboxes: number): Promise<RunnerRecord>;
  heartbeatRunner(id: string, activeCount: number, warmingCount: number): Promise<void>;
  getRunner(id: string): Promise<RunnerRecord | null>;
  listHealthyRunners(cutoffIso: string): Promise<RunnerRecord[]>;
  /** List runners whose last heartbeat is at or before the cutoff. */
  listDeadRunners(cutoffIso: string): Promise<RunnerRecord[]>;
  selectBestRunner(cutoffIso: string): Promise<RunnerRecord | null>;
  deleteRunner(id: string): Promise<void>;
  listAllRunners(): Promise<RunnerRecord[]>;
  // Agents (tenant-scoped)
  upsertAgent(name: string, path: string, tenantId?: string): Promise<Agent>;
  getAgent(name: string, tenantId?: string): Promise<Agent | null>;
  listAgents(tenantId?: string): Promise<Agent[]>;
  deleteAgent(name: string, tenantId?: string): Promise<boolean>;
  // Sessions (tenant-scoped)
  insertSession(id: string, agentName: string, sandboxId: string, tenantId?: string, parentSessionId?: string, model?: string, config?: SessionConfig | null): Promise<Session>;
  insertForkedSession(id: string, parentSession: Session, sandboxId: string): Promise<Session>;
  updateSessionStatus(id: string, status: SessionStatus): Promise<void>;
  updateSessionSandbox(id: string, sandboxId: string): Promise<void>;
  updateSessionRunner(id: string, runnerId: string | null): Promise<void>;
  getSession(id: string): Promise<Session | null>;
  listSessions(tenantId?: string, agent?: string): Promise<Session[]>;
  listSessionsByRunner(runnerId: string): Promise<Session[]>;
  /** Bulk-pause all active/starting sessions on a runner. Returns count of paused sessions. */
  bulkPauseSessionsByRunner(runnerId: string): Promise<number>;
  updateSessionConfig(id: string, model: string | null | undefined, config: SessionConfig | null): Promise<void>;
  touchSession(id: string): Promise<void>;
  // Sandboxes (insertSandbox is tenant-scoped)
  insertSandbox(id: string, agentName: string, workspaceDir: string, sessionId?: string, tenantId?: string): Promise<void>;
  updateSandboxState(id: string, state: SandboxState): Promise<void>;
  updateSandboxSession(id: string, sessionId: string | null): Promise<void>;
  touchSandbox(id: string): Promise<void>;
  getSandbox(id: string): Promise<SandboxRecord | null>;
  countSandboxes(): Promise<number>;
  getBestEvictionCandidate(): Promise<SandboxRecord | null>;
  getIdleSandboxes(olderThan: string): Promise<SandboxRecord[]>;
  getColdSandboxes(olderThan: string): Promise<SandboxRecord[]>;
  deleteSandbox(id: string): Promise<void>;
  markAllSandboxesCold(): Promise<number>;
  // Messages (tenant-scoped)
  insertMessage(sessionId: string, role: 'user' | 'assistant', content: string, tenantId?: string): Promise<Message>;
  listMessages(sessionId: string, tenantId?: string, opts?: { limit?: number; afterSequence?: number }): Promise<Message[]>;
  // Session Events (tenant-scoped)
  insertSessionEvent(sessionId: string, type: SessionEventType, data: string | null, tenantId?: string): Promise<SessionEvent>;
  insertSessionEvents(events: Array<{ sessionId: string; type: SessionEventType; data: string | null; tenantId?: string }>): Promise<SessionEvent[]>;
  listSessionEvents(sessionId: string, tenantId?: string, opts?: { limit?: number; afterSequence?: number; type?: SessionEventType }): Promise<SessionEvent[]>;
  // API Keys
  getApiKeyByHash(keyHash: string): Promise<ApiKey | null>;
  insertApiKey(id: string, tenantId: string, keyHash: string, label: string): Promise<ApiKey>;
  listApiKeysByTenant(tenantId: string): Promise<ApiKey[]>;
  deleteApiKey(id: string): Promise<boolean>;
  // Queue (tenant-scoped)
  insertQueueItem(id: string, tenantId: string, agentName: string, prompt: string, sessionId?: string, priority?: number, maxRetries?: number): Promise<QueueItem>;
  getQueueItem(id: string): Promise<QueueItem | null>;
  getNextPendingQueueItem(tenantId?: string): Promise<QueueItem | null>;
  claimQueueItem(id: string): Promise<boolean>;
  updateQueueItemStatus(id: string, status: QueueItemStatus, error?: string): Promise<void>;
  incrementQueueItemRetry(id: string, retryAfter?: string): Promise<void>;
  listQueueItems(tenantId: string, status?: QueueItemStatus, limit?: number): Promise<QueueItem[]>;
  getQueueStats(tenantId: string): Promise<QueueStats>;
  // Credentials (tenant-scoped)
  insertCredential(id: string, tenantId: string, type: string, encryptedKey: string, iv: string, authTag: string, label: string, salt?: string | null): Promise<Credential>;
  getCredential(id: string): Promise<{ id: string; tenantId: string; type: string; encryptedKey: string; iv: string; authTag: string; salt: string | null; label: string; active: boolean; createdAt: string; lastUsedAt: string | null } | null>;
  listCredentials(tenantId: string): Promise<Credential[]>;
  deleteCredential(id: string): Promise<boolean>;
  touchCredentialUsed(id: string): Promise<void>;
  // Attachments (tenant-scoped)
  insertAttachment(id: string, tenantId: string, messageId: string, sessionId: string, filename: string, mimeType: string, size: number, storagePath: string): Promise<Attachment>;
  getAttachment(id: string): Promise<Attachment | null>;
  listAttachmentsByMessage(messageId: string, tenantId?: string): Promise<Attachment[]>;
  listAttachmentsBySession(sessionId: string, tenantId?: string): Promise<Attachment[]>;
  deleteAttachment(id: string): Promise<boolean>;
  // Usage (tenant-scoped)
  insertUsageEvent(id: string, tenantId: string, sessionId: string, agentName: string, eventType: UsageEventType, value: number): Promise<UsageEvent>;
  insertUsageEvents(events: Array<{ id: string; tenantId: string; sessionId: string; agentName: string; eventType: UsageEventType; value: number }>): Promise<void>;
  listUsageEvents(tenantId: string, opts?: { sessionId?: string; agentName?: string; after?: string; before?: string; limit?: number }): Promise<UsageEvent[]>;
  getUsageStats(tenantId: string, opts?: { sessionId?: string; agentName?: string; after?: string; before?: string }): Promise<UsageStats>;
  // Lifecycle
  close(): Promise<void>;
}

let db: Db;

function getDb(): Db {
  if (!db) throw new Error('Database not initialized — call initDb first');
  return db;
}

export async function initDb(opts: { dataDir: string; databaseUrl?: string }): Promise<Db> {
  const { DrizzleDb } = await import('./drizzle-db.js');

  if (opts.databaseUrl && /^postgres(ql)?:\/\//.test(opts.databaseUrl)) {
    const pgMod = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const pgSchema = await import('./schema.pg.js');

    const pool = new pgMod.default.Pool({ connectionString: opts.databaseUrl });

    // Retry connection with exponential backoff (total ~31s: 1s, 2s, 4s, 8s, 16s)
    const maxRetries = 5;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await pool.query('SELECT 1');
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

    const d = drizzle(pool, { schema: pgSchema });
    await migrate(d, { migrationsFolder: resolve(pkgRoot(), 'drizzle', 'pg') });

    db = new DrizzleDb(d, pgSchema, 'pg', async () => { await pool.end(); });
  } else {
    const BetterSqlite3 = (await import('better-sqlite3')).default;
    const { drizzle } = await import('drizzle-orm/better-sqlite3');
    const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
    const sqliteSchema = await import('./schema.sqlite.js');

    mkdirSync(opts.dataDir, { recursive: true });
    const sqlite = new BetterSqlite3(join(opts.dataDir, 'ash.db'));
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');

    const d = drizzle(sqlite, { schema: sqliteSchema });
    migrate(d, { migrationsFolder: resolve(pkgRoot(), 'drizzle', 'sqlite') });

    db = new DrizzleDb(d, sqliteSchema, 'sqlite', async () => { sqlite.close(); });
  }
  return db;
}

// -- Async re-exports (preserve call-site compatibility) ----------------------
// Optional tenantId defaults to 'default' for single-tenant/dev mode.

export async function upsertAgent(name: string, path: string, tenantId?: string): Promise<Agent> {
  return getDb().upsertAgent(name, path, tenantId);
}

export async function getAgent(name: string, tenantId?: string): Promise<Agent | null> {
  return getDb().getAgent(name, tenantId);
}

export async function listAgents(tenantId?: string): Promise<Agent[]> {
  return getDb().listAgents(tenantId);
}

export async function deleteAgent(name: string, tenantId?: string): Promise<boolean> {
  return getDb().deleteAgent(name, tenantId);
}

export async function insertSession(id: string, agentName: string, sandboxId: string, tenantId?: string, parentSessionId?: string, model?: string, config?: SessionConfig | null): Promise<Session> {
  return getDb().insertSession(id, agentName, sandboxId, tenantId, parentSessionId, model, config);
}

export async function insertForkedSession(id: string, parentSession: Session, sandboxId: string): Promise<Session> {
  return getDb().insertForkedSession(id, parentSession, sandboxId);
}

export async function updateSessionStatus(id: string, status: SessionStatus): Promise<void> {
  return getDb().updateSessionStatus(id, status);
}

export async function updateSessionSandbox(id: string, sandboxId: string): Promise<void> {
  return getDb().updateSessionSandbox(id, sandboxId);
}

export async function updateSessionRunner(id: string, runnerId: string | null): Promise<void> {
  return getDb().updateSessionRunner(id, runnerId);
}

export async function getSession(id: string): Promise<Session | null> {
  return getDb().getSession(id);
}

export async function listSessions(tenantId?: string, agent?: string): Promise<Session[]> {
  return getDb().listSessions(tenantId, agent);
}

export async function listSessionsByRunner(runnerId: string): Promise<Session[]> {
  return getDb().listSessionsByRunner(runnerId);
}

export async function bulkPauseSessionsByRunner(runnerId: string): Promise<number> {
  return getDb().bulkPauseSessionsByRunner(runnerId);
}

export async function updateSessionConfig(id: string, model: string | null | undefined, config: SessionConfig | null): Promise<void> {
  return getDb().updateSessionConfig(id, model, config);
}

export async function touchSession(id: string): Promise<void> {
  return getDb().touchSession(id);
}

// -- Sandboxes ----------------------------------------------------------------

export async function insertSandbox(id: string, agentName: string, workspaceDir: string, sessionId?: string, tenantId?: string): Promise<void> {
  return getDb().insertSandbox(id, agentName, workspaceDir, sessionId, tenantId);
}

export async function updateSandboxState(id: string, state: SandboxState): Promise<void> {
  return getDb().updateSandboxState(id, state);
}

export async function updateSandboxSession(id: string, sessionId: string | null): Promise<void> {
  return getDb().updateSandboxSession(id, sessionId);
}

export async function touchSandbox(id: string): Promise<void> {
  return getDb().touchSandbox(id);
}

export async function getSandbox(id: string): Promise<SandboxRecord | null> {
  return getDb().getSandbox(id);
}

export async function countSandboxes(): Promise<number> {
  return getDb().countSandboxes();
}

export async function getBestEvictionCandidate(): Promise<SandboxRecord | null> {
  return getDb().getBestEvictionCandidate();
}

export async function getIdleSandboxes(olderThan: string): Promise<SandboxRecord[]> {
  return getDb().getIdleSandboxes(olderThan);
}

export async function getColdSandboxes(olderThan: string): Promise<SandboxRecord[]> {
  return getDb().getColdSandboxes(olderThan);
}

export async function deleteSandbox(id: string): Promise<void> {
  return getDb().deleteSandbox(id);
}

export async function markAllSandboxesCold(): Promise<number> {
  return getDb().markAllSandboxesCold();
}

// -- Messages -----------------------------------------------------------------

export async function insertMessage(sessionId: string, role: 'user' | 'assistant', content: string, tenantId?: string): Promise<Message> {
  return getDb().insertMessage(sessionId, role, content, tenantId);
}

export async function listMessages(sessionId: string, tenantId?: string, opts?: { limit?: number; afterSequence?: number }): Promise<Message[]> {
  return getDb().listMessages(sessionId, tenantId, opts);
}

// -- Session Events -----------------------------------------------------------

export async function insertSessionEvent(sessionId: string, type: SessionEventType, data: string | null, tenantId?: string): Promise<SessionEvent> {
  return getDb().insertSessionEvent(sessionId, type, data, tenantId);
}

export async function insertSessionEvents(events: Array<{ sessionId: string; type: SessionEventType; data: string | null; tenantId?: string }>): Promise<SessionEvent[]> {
  return getDb().insertSessionEvents(events);
}

export async function listSessionEvents(sessionId: string, tenantId?: string, opts?: { limit?: number; afterSequence?: number; type?: SessionEventType }): Promise<SessionEvent[]> {
  return getDb().listSessionEvents(sessionId, tenantId, opts);
}

// -- API Keys -----------------------------------------------------------------

export async function getApiKeyByHash(keyHash: string): Promise<ApiKey | null> {
  return getDb().getApiKeyByHash(keyHash);
}

export async function insertApiKey(id: string, tenantId: string, keyHash: string, label: string): Promise<ApiKey> {
  return getDb().insertApiKey(id, tenantId, keyHash, label);
}

export async function listApiKeysByTenant(tenantId: string): Promise<ApiKey[]> {
  return getDb().listApiKeysByTenant(tenantId);
}

export async function deleteApiKey(id: string): Promise<boolean> {
  return getDb().deleteApiKey(id);
}


// -- Runners ------------------------------------------------------------------

export async function upsertRunner(id: string, host: string, port: number, maxSandboxes: number): Promise<RunnerRecord> {
  return getDb().upsertRunner(id, host, port, maxSandboxes);
}

export async function heartbeatRunner(id: string, activeCount: number, warmingCount: number): Promise<void> {
  return getDb().heartbeatRunner(id, activeCount, warmingCount);
}

export async function getRunner(id: string): Promise<RunnerRecord | null> {
  return getDb().getRunner(id);
}

export async function listHealthyRunners(cutoffIso: string): Promise<RunnerRecord[]> {
  return getDb().listHealthyRunners(cutoffIso);
}

export async function listDeadRunners(cutoffIso: string): Promise<RunnerRecord[]> {
  return getDb().listDeadRunners(cutoffIso);
}

export async function selectBestRunner(cutoffIso: string): Promise<RunnerRecord | null> {
  return getDb().selectBestRunner(cutoffIso);
}

export async function deleteRunner(id: string): Promise<void> {
  return getDb().deleteRunner(id);
}

export async function listAllRunners(): Promise<RunnerRecord[]> {
  return getDb().listAllRunners();
}

// -- Queue --------------------------------------------------------------------

export async function insertQueueItem(id: string, tenantId: string, agentName: string, prompt: string, sessionId?: string, priority?: number, maxRetries?: number): Promise<QueueItem> {
  return getDb().insertQueueItem(id, tenantId, agentName, prompt, sessionId, priority, maxRetries);
}

export async function getQueueItem(id: string): Promise<QueueItem | null> {
  return getDb().getQueueItem(id);
}

export async function getNextPendingQueueItem(tenantId?: string): Promise<QueueItem | null> {
  return getDb().getNextPendingQueueItem(tenantId);
}

export async function updateQueueItemStatus(id: string, status: QueueItemStatus, error?: string): Promise<void> {
  return getDb().updateQueueItemStatus(id, status, error);
}

export async function claimQueueItem(id: string): Promise<boolean> {
  return getDb().claimQueueItem(id);
}

export async function incrementQueueItemRetry(id: string, retryAfter?: string): Promise<void> {
  return getDb().incrementQueueItemRetry(id, retryAfter);
}

export async function listQueueItems(tenantId: string, status?: QueueItemStatus, limit?: number): Promise<QueueItem[]> {
  return getDb().listQueueItems(tenantId, status, limit);
}

export async function getQueueStats(tenantId: string): Promise<QueueStats> {
  return getDb().getQueueStats(tenantId);
}

// -- Credentials --------------------------------------------------------------

export async function insertCredential(id: string, tenantId: string, type: string, encryptedKey: string, iv: string, authTag: string, label: string, salt?: string | null): Promise<Credential> {
  return getDb().insertCredential(id, tenantId, type, encryptedKey, iv, authTag, label, salt);
}

export async function getCredential(id: string) {
  return getDb().getCredential(id);
}

export async function listCredentials(tenantId: string): Promise<Credential[]> {
  return getDb().listCredentials(tenantId);
}

export async function deleteCredentialById(id: string): Promise<boolean> {
  return getDb().deleteCredential(id);
}

export async function touchCredentialUsed(id: string): Promise<void> {
  return getDb().touchCredentialUsed(id);
}

// -- Attachments --------------------------------------------------------------

export async function insertAttachment(id: string, tenantId: string, messageId: string, sessionId: string, filename: string, mimeType: string, size: number, storagePath: string): Promise<Attachment> {
  return getDb().insertAttachment(id, tenantId, messageId, sessionId, filename, mimeType, size, storagePath);
}

export async function getAttachment(id: string): Promise<Attachment | null> {
  return getDb().getAttachment(id);
}

export async function listAttachmentsByMessage(messageId: string, tenantId?: string): Promise<Attachment[]> {
  return getDb().listAttachmentsByMessage(messageId, tenantId);
}

export async function listAttachmentsBySession(sessionId: string, tenantId?: string): Promise<Attachment[]> {
  return getDb().listAttachmentsBySession(sessionId, tenantId);
}

export async function deleteAttachment(id: string): Promise<boolean> {
  return getDb().deleteAttachment(id);
}

// -- Usage --------------------------------------------------------------------

export async function insertUsageEvent(id: string, tenantId: string, sessionId: string, agentName: string, eventType: UsageEventType, value: number): Promise<UsageEvent> {
  return getDb().insertUsageEvent(id, tenantId, sessionId, agentName, eventType, value);
}

export async function insertUsageEvents(events: Array<{ id: string; tenantId: string; sessionId: string; agentName: string; eventType: UsageEventType; value: number }>): Promise<void> {
  return getDb().insertUsageEvents(events);
}

export async function listUsageEvents(tenantId: string, opts?: { sessionId?: string; agentName?: string; after?: string; before?: string; limit?: number }): Promise<UsageEvent[]> {
  return getDb().listUsageEvents(tenantId, opts);
}

export async function getUsageStats(tenantId: string, opts?: { sessionId?: string; agentName?: string; after?: string; before?: string }): Promise<UsageStats> {
  return getDb().getUsageStats(tenantId, opts);
}

export async function closeDb(): Promise<void> {
  return getDb().close();
}
