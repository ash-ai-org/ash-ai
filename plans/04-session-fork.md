# Plan 04: Session Fork

## Status: Not Started
## Priority: High
## Effort: Medium

## Problem

The cloud layer supports forking a session — creating a new session that branches from an existing one's message history. This enables "what if" exploration: fork from a point, try a different approach, keep the original intact.

Ash has no fork concept.

## Reference: ash-ai (agent-sdk-harness-cloud) Implementation

- `harness/packages/ash-ai/src/session/` — `SessionManager.forkSession()` implementation
- `apps/web/src/app/api/v1/sessions/[sessionId]/fork/route.ts` — `POST` route that calls `SessionManager.forkSession()`
- `harness/packages/ash-ai/src/types/index.ts` — `Session.parentSessionId` field, `ResumeSessionOptions`

## Current ash-ai Behavior

```typescript
// SessionManager.forkSession(sessionId, options)
// 1. Creates a new session with parentSessionId set
// 2. Copies all messages from parent up to a certain point
// 3. New session gets its own sandbox
// 4. Resume sends continue from the forked state
```

The cloud exposes this as `POST /api/v1/sessions/:id/fork`.

## Approach

1. **Add `parentSessionId` to Session schema**
   ```sql
   ALTER TABLE sessions ADD COLUMN parent_session_id TEXT;
   ```

2. **Add `POST /api/sessions/:id/fork` endpoint**
   - Creates a new session linked to parent
   - Copies messages from parent session
   - Creates a new sandbox with the parent's persisted workspace state
   - Returns the new session (status: `starting` or `paused`)

3. **Add fork to SDK client**
   ```typescript
   async forkSession(sessionId: string): Promise<Session>
   ```

4. **Add `getSessionHistory()` to Db**
   - Follow `parentSessionId` chain to build fork tree
   - Useful for UI displaying session branches

## Implementation Steps

1. Add `parentSessionId` column to sessions table + migration
2. Add `insertForkedSession()` to Db (creates session + copies messages)
3. Add fork route to server
4. Handle workspace state: snapshot parent's workspace → restore into new sandbox
5. Update `Session` type in shared
6. Add `forkSession()` to SDK client
7. Add `getSessionHistory()` for traversing fork chains

## Open Questions

- Should fork copy all messages or allow specifying a cutoff point?
- Should the forked session's sandbox start warm (from parent's live state) or cold (from snapshot)?
- How to handle forks of forks? (tree vs linear history)
