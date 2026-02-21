# Plan 10: Usage Tracking

## Status: Not Started
## Priority: Low
## Effort: Small

## Problem

ash-ai tracks usage metrics (tokens, cost, tool calls, compute time) per session and agent. This powers billing, analytics, and rate limiting in the cloud. Ash has no usage tracking.

## Reference: ash-ai (agent-sdk-harness-cloud) Implementation

- `harness/packages/ash-ai/src/usage/` — `UsageStorage` interface, `MemoryUsageStorage`, `UsageRecorder` class
- `harness/packages/ash-ai/src/types/index.ts` — `Session.totalTokens`, `Session.totalCost` fields
- `harness/packages/ash-ai/src/server/` — `createUsageRouter()`, usage API routes
- `harness/packages/ash-ai/src/server/server.ts` — `HarnessServerConfig.usageStorage`

## Current ash-ai Behavior

```typescript
interface UsageStorage {
  recordUsage(event: CreateUsageEventOptions): Promise<UsageEvent>
  listUsageEvents(options?): Promise<PaginatedResult<UsageEvent>>
  getUsageStats(options?): Promise<UsageStats>
}

class UsageRecorder {
  recordMessage(sessionId, agentName): Promise<void>
  recordToolCall(sessionId, agentName): Promise<void>
  recordTokens(sessionId, agentName, count): Promise<void>
  recordComputeTime(sessionId, agentName, seconds): Promise<void>
}
```

## Approach

### Extract usage from SDK messages

The Claude SDK messages contain token counts. We can extract and record them.

1. **New `usage_events` table**:
   ```sql
   CREATE TABLE usage_events (
     id TEXT PRIMARY KEY,
     tenant_id TEXT NOT NULL DEFAULT 'default',
     session_id TEXT NOT NULL,
     agent_name TEXT NOT NULL,
     event_type TEXT NOT NULL,    -- 'tokens' | 'tool_call' | 'message' | 'compute'
     value REAL NOT NULL,
     created_at TEXT NOT NULL
   );
   ```

2. **Usage extraction in message handler**:
   - After each message exchange, parse SDK response for `usage` field
   - Record input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens
   - Record tool call count
   - Record wall-clock compute time

3. **API endpoints**:
   - `GET /api/usage?sessionId=&agentName=&after=&before=` — query usage
   - `GET /api/usage/stats` — aggregated stats

4. **Session-level totals**:
   - Add `totalTokens` and `totalCost` fields to Session
   - Update on each message completion

## Implementation Steps

1. Add usage_events table + Db methods
2. Add usage extraction to message processing pipeline
3. Update session record with running totals
4. Add API endpoints
5. Update SDK client

## Open Questions

- Should cost calculation be server-side (requires pricing table) or client-side?
- Do we need per-model pricing tables?
- Should usage be real-time or batch-aggregated?
