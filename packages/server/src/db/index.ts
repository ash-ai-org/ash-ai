import type { Agent, Session, SessionStatus, SandboxRecord, SandboxState, ApiKey } from '@ash-ai/shared';

/**
 * Database interface for Ash persistence.
 *
 * Methods that create or query tenant-scoped data accept an optional `tenantId`
 * parameter (defaults to 'default'). This enables multi-tenant isolation at the
 * DB layer while remaining fully backward-compatible for single-tenant deployments.
 */
export interface Db {
  // Agents (tenant-scoped)
  upsertAgent(name: string, path: string, tenantId?: string): Promise<Agent>;
  getAgent(name: string, tenantId?: string): Promise<Agent | null>;
  listAgents(tenantId?: string): Promise<Agent[]>;
  deleteAgent(name: string, tenantId?: string): Promise<boolean>;
  // Sessions (tenant-scoped)
  insertSession(id: string, agentName: string, sandboxId: string, tenantId?: string): Promise<Session>;
  updateSessionStatus(id: string, status: SessionStatus): Promise<void>;
  updateSessionSandbox(id: string, sandboxId: string): Promise<void>;
  updateSessionRunner(id: string, runnerId: string | null): Promise<void>;
  getSession(id: string): Promise<Session | null>;
  listSessions(tenantId?: string, agent?: string): Promise<Session[]>;
  listSessionsByRunner(runnerId: string): Promise<Session[]>;
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
  deleteSandbox(id: string): Promise<void>;
  markAllSandboxesCold(): Promise<number>;
  // API Keys
  getApiKeyByHash(keyHash: string): Promise<ApiKey | null>;
  insertApiKey(id: string, tenantId: string, keyHash: string, label: string): Promise<ApiKey>;
  listApiKeysByTenant(tenantId: string): Promise<ApiKey[]>;
  deleteApiKey(id: string): Promise<boolean>;
  // Lifecycle
  close(): Promise<void>;
}

let db: Db;

function getDb(): Db {
  if (!db) throw new Error('Database not initialized — call initDb first');
  return db;
}

export async function initDb(opts: { dataDir: string; databaseUrl?: string }): Promise<Db> {
  if (opts.databaseUrl && /^postgres(ql)?:\/\//.test(opts.databaseUrl)) {
    const { PgDb } = await import('./pg.js');
    const pgDb = new PgDb(opts.databaseUrl);
    await pgDb.init();
    db = pgDb;
  } else {
    const { SqliteDb } = await import('./sqlite.js');
    db = new SqliteDb(opts.dataDir);
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

export async function insertSession(id: string, agentName: string, sandboxId: string, tenantId?: string): Promise<Session> {
  return getDb().insertSession(id, agentName, sandboxId, tenantId);
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

export async function deleteSandbox(id: string): Promise<void> {
  return getDb().deleteSandbox(id);
}

export async function markAllSandboxesCold(): Promise<number> {
  return getDb().markAllSandboxesCold();
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

export async function closeDb(): Promise<void> {
  return getDb().close();
}
