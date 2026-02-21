# Plan 03: Session Lifecycle Alignment

## Status: Done
## Priority: Critical
## Effort: Small

## Problem

Ash and ash-ai use different session statuses and lifecycle verbs:

| Ash | ash-ai | Cloud usage |
|-----|--------|-------------|
| `starting` | — | — |
| `active` | `ACTIVE` | Session is running |
| `paused` | `SUSPENDED` | Session idle, can resume |
| `ended` | `COMPLETED` | Session finished normally |
| `error` | `ERROR` | Session failed |
| — | `STOPPED` | User explicitly stopped |

Cloud API verbs:
- `POST /sessions/:id/stop` → sets `STOPPED`
- `POST /sessions/:id/fork` → creates branch (see plan 04)
- `DELETE /sessions/:id` → deletes session and data

Ash API verbs:
- `POST /sessions/:id/pause` → sets `paused`
- `POST /sessions/:id/resume` → sets `active` (warm or cold path)
- `DELETE /sessions/:id` → sets `ended`

## Reference: ash-ai (agent-sdk-harness-cloud) Implementation

Session status and lifecycle:
- `harness/packages/ash-ai/src/types/index.ts` — `SessionStatus` enum (`ACTIVE`, `COMPLETED`, `ERROR`, `SUSPENDED`, `STOPPED`), `Session` interface with `metadata` field
- `harness/packages/ash-ai/src/session/` — `SessionManager` class with `createSession`, `updateSession`, `forkSession`

Cloud routes that use lifecycle verbs:
- `apps/web/src/app/api/v1/sessions/[sessionId]/status/route.ts` — checks heartbeat status via `getHeartbeatStatus()`
- `apps/web/src/lib/services/agent-execution.ts` — manages session state transitions, uses `SessionManager`
- `apps/web/src/lib/services/project-context.ts` — uses `SessionManager` for session operations

## Approach

### Add missing statuses and verbs to Ash

1. **Add `stopped` status** to `SessionStatus` type:
   ```typescript
   type SessionStatus = 'starting' | 'active' | 'paused' | 'ended' | 'error' | 'stopped'
   ```

2. **Add `POST /sessions/:id/stop` endpoint**
   - Interrupts the bridge (sends `interrupt` command)
   - Sets status to `stopped`
   - Persists sandbox state for potential resume
   - Distinct from `pause` (which is automatic/idle) vs `stop` (explicit user action)

3. **Make `DELETE /sessions/:id` actually delete**
   - Currently sets status to `ended`
   - Change to: set `ended` + clean up sandbox + optionally delete DB records
   - Or add a separate `POST /sessions/:id/end` for the soft version

4. **Map statuses for cloud adapter**
   ```typescript
   const STATUS_MAP = {
     starting: 'ACTIVE',
     active: 'ACTIVE',
     paused: 'SUSPENDED',
     stopped: 'STOPPED',
     ended: 'COMPLETED',
     error: 'ERROR',
   }
   ```

## Implementation Steps

1. Add `stopped` to `SessionStatus` in `@ash-ai/shared`
2. Add `POST /sessions/:id/stop` route to server
3. Implement interrupt + state persistence in the stop handler
4. Update DB schema if needed (status column is text, so no migration required)
5. Export status mapping utility from shared
6. Update SDK client with `stopSession()` method

## Open Questions

- Should `pause` and `stop` share the same state persistence logic?
- Should `DELETE` do a hard delete (remove DB rows) or soft delete (set ended)?
- Do we need a `metadata` field on sessions? (ash-ai has one, Ash doesn't)
