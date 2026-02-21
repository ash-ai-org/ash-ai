import type { FastifyInstance } from 'fastify';

// -- Reusable JSON Schema components ------------------------------------------
// Each gets a $id so routes can reference via { $ref: 'SchemaName#' }.

const AgentSchema = {
  $id: 'Agent',
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    tenantId: { type: 'string' },
    version: { type: 'integer' },
    path: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'name', 'version', 'path', 'createdAt', 'updatedAt'],
} as const;

const SessionSchema = {
  $id: 'Session',
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    tenantId: { type: 'string' },
    agentName: { type: 'string' },
    sandboxId: { type: 'string' },
    status: { type: 'string', enum: ['starting', 'active', 'paused', 'stopped', 'ended', 'error'] },
    runnerId: { type: ['string', 'null'] },
    parentSessionId: { type: ['string', 'null'], format: 'uuid' },
    createdAt: { type: 'string', format: 'date-time' },
    lastActiveAt: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'agentName', 'sandboxId', 'status', 'createdAt', 'lastActiveAt'],
} as const;

const ApiErrorSchema = {
  $id: 'ApiError',
  type: 'object',
  properties: {
    error: { type: 'string' },
    statusCode: { type: 'integer' },
  },
  required: ['error', 'statusCode'],
} as const;

const MessageSchema = {
  $id: 'Message',
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    sessionId: { type: 'string', format: 'uuid' },
    tenantId: { type: 'string' },
    role: { type: 'string', enum: ['user', 'assistant'] },
    content: { type: 'string', description: 'JSON-encoded message content (SDK passthrough)' },
    sequence: { type: 'integer' },
    createdAt: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'sessionId', 'role', 'content', 'sequence', 'createdAt'],
} as const;

const SessionEventSchema = {
  $id: 'SessionEvent',
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    sessionId: { type: 'string', format: 'uuid' },
    tenantId: { type: 'string' },
    type: { type: 'string', enum: ['text', 'tool_start', 'tool_result', 'reasoning', 'error', 'turn_complete', 'lifecycle'] },
    data: { type: ['string', 'null'], description: 'JSON-encoded event payload' },
    sequence: { type: 'integer' },
    createdAt: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'sessionId', 'type', 'sequence', 'createdAt'],
} as const;

const PoolStatsSchema = {
  $id: 'PoolStats',
  type: 'object',
  properties: {
    total: { type: 'integer' },
    cold: { type: 'integer' },
    warming: { type: 'integer' },
    warm: { type: 'integer' },
    waiting: { type: 'integer' },
    running: { type: 'integer' },
    maxCapacity: { type: 'integer' },
    resumeWarmHits: { type: 'integer' },
    resumeColdHits: { type: 'integer' },
  },
  required: ['total', 'cold', 'warming', 'warm', 'waiting', 'running', 'maxCapacity', 'resumeWarmHits', 'resumeColdHits'],
} as const;

const HealthResponseSchema = {
  $id: 'HealthResponse',
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['ok'] },
    coordinatorId: { type: 'string', description: 'Unique coordinator ID (hostname-PID)' },
    activeSessions: { type: 'integer' },
    activeSandboxes: { type: 'integer' },
    remoteRunners: { type: 'integer', description: 'Number of registered remote runners' },
    uptime: { type: 'integer', description: 'Seconds since process start' },
    pool: { $ref: 'PoolStats#' },
  },
  required: ['status', 'activeSessions', 'activeSandboxes', 'uptime', 'pool'],
} as const;

const AttachmentSchema = {
  $id: 'Attachment',
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    tenantId: { type: 'string' },
    messageId: { type: 'string' },
    sessionId: { type: 'string', format: 'uuid' },
    filename: { type: 'string' },
    mimeType: { type: 'string' },
    size: { type: 'integer' },
    createdAt: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'sessionId', 'filename', 'mimeType', 'size', 'createdAt'],
} as const;

const QueueItemSchema = {
  $id: 'QueueItem',
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    tenantId: { type: 'string' },
    sessionId: { type: ['string', 'null'] },
    agentName: { type: 'string' },
    prompt: { type: 'string' },
    status: { type: 'string', enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'] },
    priority: { type: 'integer' },
    retryCount: { type: 'integer' },
    maxRetries: { type: 'integer' },
    error: { type: ['string', 'null'] },
    createdAt: { type: 'string', format: 'date-time' },
    startedAt: { type: ['string', 'null'] },
    completedAt: { type: ['string', 'null'] },
  },
  required: ['id', 'agentName', 'prompt', 'status', 'priority', 'retryCount', 'maxRetries', 'createdAt'],
} as const;

const CredentialSchema = {
  $id: 'Credential',
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    tenantId: { type: 'string' },
    type: { type: 'string' },
    label: { type: ['string', 'null'] },
    createdAt: { type: 'string', format: 'date-time' },
    lastUsedAt: { type: ['string', 'null'], format: 'date-time' },
  },
  required: ['id', 'type', 'createdAt'],
} as const;

const UsageEventSchema = {
  $id: 'UsageEvent',
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    tenantId: { type: 'string' },
    sessionId: { type: 'string', format: 'uuid' },
    agentName: { type: 'string' },
    eventType: { type: 'string' },
    value: { type: 'number' },
    createdAt: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'sessionId', 'agentName', 'eventType', 'value', 'createdAt'],
} as const;

const UsageStatsSchema = {
  $id: 'UsageStats',
  type: 'object',
  properties: {
    totalInputTokens: { type: 'number' },
    totalOutputTokens: { type: 'number' },
    totalCacheCreationTokens: { type: 'number' },
    totalCacheReadTokens: { type: 'number' },
    totalToolCalls: { type: 'number' },
    totalMessages: { type: 'number' },
    totalComputeSeconds: { type: 'number' },
  },
  required: ['totalInputTokens', 'totalOutputTokens', 'totalCacheCreationTokens', 'totalCacheReadTokens', 'totalToolCalls', 'totalMessages', 'totalComputeSeconds'],
} as const;

export function registerSchemas(app: FastifyInstance): void {
  app.addSchema(AgentSchema);
  app.addSchema(SessionSchema);
  app.addSchema(MessageSchema);
  app.addSchema(SessionEventSchema);
  app.addSchema(ApiErrorSchema);
  app.addSchema(PoolStatsSchema);
  app.addSchema(HealthResponseSchema);
  app.addSchema(QueueItemSchema);
  app.addSchema(AttachmentSchema);
  app.addSchema(CredentialSchema);
  app.addSchema(UsageEventSchema);
  app.addSchema(UsageStatsSchema);
}
