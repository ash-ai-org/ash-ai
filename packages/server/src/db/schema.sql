-- Auto-generated schema. Do not edit manually.
-- Regenerate with: pnpm --filter '@ash-ai/server' run dump-schema
--
-- This file represents the canonical current state of the database.
-- It is reconstructed from PRAGMA introspection after running all migrations.

CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT datetime('now'),
  updated_at TEXT NOT NULL DEFAULT datetime('now'),
  UNIQUE(tenant_id, name)
);

CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT datetime('now')
);

CREATE TABLE sandboxes (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  agent_name TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'warming',
  workspace_dir TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT datetime('now'),
  last_used_at TEXT NOT NULL DEFAULT datetime('now'),
  tenant_id TEXT NOT NULL DEFAULT 'default'
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  agent_name TEXT NOT NULL,
  sandbox_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'starting',
  runner_id TEXT,
  created_at TEXT NOT NULL DEFAULT datetime('now'),
  last_active_at TEXT NOT NULL DEFAULT datetime('now')
);

CREATE INDEX idx_agents_tenant ON agents(tenant_id);

CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);

CREATE INDEX idx_api_keys_tenant ON api_keys(tenant_id);

CREATE INDEX idx_sandboxes_last_used ON sandboxes(last_used_at);

CREATE INDEX idx_sandboxes_session ON sandboxes(session_id);

CREATE INDEX idx_sandboxes_state ON sandboxes(state);

CREATE INDEX idx_sandboxes_tenant ON sandboxes(tenant_id);

CREATE INDEX idx_sessions_tenant ON sessions(tenant_id);
