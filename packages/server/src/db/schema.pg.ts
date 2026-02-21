import { pgTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/pg-core';

export const runners = pgTable('runners', {
  id: text('id').primaryKey(),
  host: text('host').notNull(),
  port: integer('port').notNull(),
  maxSandboxes: integer('max_sandboxes').notNull().default(100),
  activeCount: integer('active_count').notNull().default(0),
  warmingCount: integer('warming_count').notNull().default(0),
  lastHeartbeatAt: text('last_heartbeat_at').notNull(),
  registeredAt: text('registered_at').notNull(),
}, (table) => [
  index('idx_runners_heartbeat').on(table.lastHeartbeatAt),
]);

export const agents = pgTable('agents', {
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

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().default('default'),
  agentName: text('agent_name').notNull(),
  sandboxId: text('sandbox_id').notNull(),
  status: text('status').notNull().default('starting'),
  runnerId: text('runner_id'),
  parentSessionId: text('parent_session_id'),
  createdAt: text('created_at').notNull(),
  lastActiveAt: text('last_active_at').notNull(),
}, (table) => [
  index('idx_sessions_tenant').on(table.tenantId),
  index('idx_sessions_runner').on(table.runnerId),
]);

export const sandboxes = pgTable('sandboxes', {
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

export const apiKeys = pgTable('api_keys', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  keyHash: text('key_hash').notNull().unique(),
  label: text('label').notNull().default(''),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_api_keys_tenant').on(table.tenantId),
  index('idx_api_keys_hash').on(table.keyHash),
]);

export const messages = pgTable('messages', {
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

export const sessionEvents = pgTable('session_events', {
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

export const credentials = pgTable('credentials', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().default('default'),
  type: text('type').notNull(),
  encryptedKey: text('encrypted_key').notNull(),
  iv: text('iv').notNull(),
  authTag: text('auth_tag').notNull(),
  label: text('label').notNull().default(''),
  active: integer('active').notNull().default(1),
  createdAt: text('created_at').notNull(),
  lastUsedAt: text('last_used_at'),
}, (table) => [
  index('idx_credentials_tenant').on(table.tenantId),
]);

export const usageEvents = pgTable('usage_events', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().default('default'),
  sessionId: text('session_id').notNull(),
  agentName: text('agent_name').notNull(),
  eventType: text('event_type').notNull(),
  value: real('value').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_usage_session').on(table.tenantId, table.sessionId),
  index('idx_usage_agent').on(table.tenantId, table.agentName),
  index('idx_usage_type').on(table.eventType),
]);

export const attachments = pgTable('attachments', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().default('default'),
  messageId: text('message_id').notNull(),
  sessionId: text('session_id').notNull(),
  filename: text('filename').notNull(),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(),
  storagePath: text('storage_path').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_attachments_session').on(table.tenantId, table.sessionId),
  index('idx_attachments_message').on(table.messageId),
]);

export const queueItems = pgTable('queue_items', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().default('default'),
  sessionId: text('session_id'),
  agentName: text('agent_name').notNull(),
  prompt: text('prompt').notNull(),
  status: text('status').notNull().default('pending'),
  priority: integer('priority').notNull().default(0),
  retryCount: integer('retry_count').notNull().default(0),
  maxRetries: integer('max_retries').notNull().default(3),
  error: text('error'),
  retryAfter: text('retry_after'),
  createdAt: text('created_at').notNull(),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
}, (table) => [
  index('idx_queue_tenant').on(table.tenantId),
  index('idx_queue_status').on(table.status, table.priority),
]);
