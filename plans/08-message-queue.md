# Plan 08: Message Queue

## Status: Done
## Priority: Medium
## Effort: Medium

## Problem

ash-ai has a message queue system (`QueueStorage`, `QueueProcessor`) for asynchronous/background message processing. This enables:
- Queuing messages when the agent is busy
- Retry with backoff on failures
- Priority-based processing
- Background tasks (webhooks, scheduled prompts)

Ash processes messages synchronously — send a message, stream the response, done.

## Reference: ash-ai (agent-sdk-harness-cloud) Implementation

- `harness/packages/ash-ai/src/queue/` — `QueueProcessor`, `QueueProcessorConfig`, `QueueProcessorCallbacks`
- `harness/packages/ash-ai/src/storage/` — `QueueStorage` interface, `MemoryQueueStorage`, `SQLiteQueueStorage`
- `harness/packages/ash-ai/src/types/index.ts` — `QueueItem`, `QueueItemStatus`, `CreateQueueItemOptions`, `QueueStats`
- `harness/packages/ash-ai/src/server/` — `createQueueRouter()`, queue API routes
- `harness/packages/ash-ai/src/server/server.ts` — `HarnessServerConfig.queue` config, queue processor integration

## Current ash-ai Behavior

```typescript
interface QueueItem {
  id: string
  sessionId: SessionId | null
  agentName: string
  prompt: string
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
  priority: number
  retryCount: number
  maxRetries: number
  // ...
}

class QueueProcessor {
  start(): void   // Begin polling for pending items
  stop(): void
}
```

## Approach

### Add queue as optional server feature

1. **New `queue_items` table**:
   ```sql
   CREATE TABLE queue_items (
     id TEXT PRIMARY KEY,
     tenant_id TEXT NOT NULL DEFAULT 'default',
     session_id TEXT,
     agent_name TEXT NOT NULL,
     prompt TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'pending',
     priority INTEGER DEFAULT 0,
     retry_count INTEGER DEFAULT 0,
     max_retries INTEGER DEFAULT 3,
     error TEXT,
     created_at TEXT NOT NULL,
     started_at TEXT,
     completed_at TEXT
   );
   ```

2. **Db methods**: `insertQueueItem`, `getNextPending`, `updateQueueItem`, `getQueueStats`

3. **QueueProcessor** in `@ash-ai/server`:
   - Polls for pending items on interval
   - Routes to appropriate session/agent
   - Handles retries with exponential backoff
   - Emits lifecycle events

4. **API endpoints**:
   - `POST /api/queue` — enqueue a message
   - `GET /api/queue` — list queue items
   - `GET /api/queue/:id` — get item status
   - `DELETE /api/queue/:id` — cancel item
   - `GET /api/queue/stats` — queue statistics

5. **Config**:
   ```typescript
   // Server config
   queue?: {
     enabled: boolean
     pollIntervalMs?: number    // default 1000
     maxRetries?: number        // default 3
     retryDelayMs?: number      // default 5000
   }
   ```

## Implementation Steps

1. Add queue_items table + Db methods
2. Implement QueueProcessor
3. Add API routes
4. Integrate with server startup (optional, config-driven)
5. Update SDK client with queue methods
6. Add tests

## Open Questions

- Should queue items target a session or an agent (create new session)?
- Do we need webhook callbacks on queue item completion?
- Should queue be in-process only, or support external queue backends (Redis, SQS)?
