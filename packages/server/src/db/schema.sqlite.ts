import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().default('default'),
  name: text('name').notNull(),
  version: integer('version').notNull().default(1),
  path: text('path').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_agents_tenant_name').on(table.tenantId, table.name),
  index('idx_agents_tenant').on(table.tenantId),
]);

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().default('default'),
  agentName: text('agent_name').notNull(),
  sandboxId: text('sandbox_id').notNull(),
  status: text('status').notNull().default('starting'),
  runnerId: text('runner_id'),
  createdAt: text('created_at').notNull(),
  lastActiveAt: text('last_active_at').notNull(),
}, (table) => [
  index('idx_sessions_tenant').on(table.tenantId),
]);

export const sandboxes = sqliteTable('sandboxes', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().default('default'),
  sessionId: text('session_id'),
  agentName: text('agent_name').notNull(),
  state: text('state').notNull().default('warming'),
  workspaceDir: text('workspace_dir').notNull(),
  createdAt: text('created_at').notNull(),
  lastUsedAt: text('last_used_at').notNull(),
}, (table) => [
  index('idx_sandboxes_state').on(table.state),
  index('idx_sandboxes_session').on(table.sessionId),
  index('idx_sandboxes_last_used').on(table.lastUsedAt),
  index('idx_sandboxes_tenant').on(table.tenantId),
]);

export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  keyHash: text('key_hash').notNull().unique(),
  label: text('label').notNull().default(''),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_api_keys_tenant').on(table.tenantId),
  index('idx_api_keys_hash').on(table.keyHash),
]);

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().default('default'),
  sessionId: text('session_id').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  sequence: integer('sequence').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('idx_messages_unique_seq').on(table.tenantId, table.sessionId, table.sequence),
  index('idx_messages_session').on(table.tenantId, table.sessionId, table.sequence),
]);

export const sessionEvents = sqliteTable('session_events', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().default('default'),
  sessionId: text('session_id').notNull(),
  type: text('type').notNull(),
  data: text('data'),
  sequence: integer('sequence').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('idx_session_events_unique_seq').on(table.tenantId, table.sessionId, table.sequence),
  index('idx_session_events_session').on(table.tenantId, table.sessionId, table.sequence),
  index('idx_session_events_type').on(table.tenantId, table.sessionId, table.type),
]);
