# Session Lifecycle Reference

## Session States

| State | Description |
|-------|-------------|
| `starting` | Sandbox is being created. Transitions to `active` or `error`. |
| `active` | Sandbox is running and accepting messages. |
| `paused` | Session is idle. Sandbox may still be alive. Can be resumed. |
| `ended` | Session is terminated permanently. Cannot be resumed. |
| `error` | Something went wrong (sandbox crash, etc.). Can be resumed. |

## State Transitions

```
starting --> active --> paused --> active (resume)
                   \           \-> ended
                    \-> error --> active (resume)
                             \-> ended
```

## Operations

### Create Session

**TypeScript:**
```typescript
const session = await client.createSession('my-agent');
// Optional: pass credential, extra env, startup script
const session = await client.createSession('my-agent', {
  credentialId: 'cred-id',
  extraEnv: { MY_VAR: 'value' },
  startupScript: 'npm install',
});
```

**Python:**
```python
session = client.create_session("my-agent")
```

**curl:**
```bash
curl -X POST http://localhost:4100/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"agent": "my-agent"}'
```

### Send Message

**TypeScript:**
```typescript
for await (const event of client.sendMessageStream(session.id, 'Hello')) {
  // Handle events
}
```

**Python:**
```python
for event in client.send_message_stream(session.id, "Hello"):
    # Handle events
```

### Pause Session

Marks session as idle. Sandbox may remain alive for fast resume.

**TypeScript:**
```typescript
const paused = await client.pauseSession(session.id);
// paused.status === 'paused'
```

**Python:**
```python
paused = client.pause_session(session.id)
```

### Resume Session

Two resume paths:
- **Warm resume:** Original sandbox is still alive. Instant, no state loss.
- **Cold resume:** Sandbox was reclaimed. New sandbox created, workspace restored from snapshot.

Conversation history is always preserved regardless of resume path.

**TypeScript:**
```typescript
const resumed = await client.resumeSession(session.id);
// resumed.status === 'active'
```

**Python:**
```python
resumed = client.resume_session(session.id)
```

### End Session

Permanently destroys the sandbox. Messages remain in the database.

**TypeScript:**
```typescript
const ended = await client.endSession(session.id);
// ended.status === 'ended'
```

**Python:**
```python
ended = client.end_session(session.id)
```

### List Sessions

**TypeScript:**
```typescript
const all = await client.listSessions();
const filtered = await client.listSessions('my-agent');
```

**Python:**
```python
sessions = client.list_sessions()
filtered = client.list_sessions(agent="my-agent")
```

### Get Session

**TypeScript:**
```typescript
const session = await client.getSession(sessionId);
```

**Python:**
```python
session = client.get_session(session_id)
```

### Stop Session (Interrupt)

Stop a session that's currently processing a message:

**TypeScript:**
```typescript
const stopped = await client.stopSession(session.id);
```

### Fork Session

Create a new session branching from an existing one:

**TypeScript:**
```typescript
const forked = await client.forkSession(session.id);
```

## REST API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/sessions` | Create a session |
| `GET` | `/api/sessions` | List sessions (`?agent=` filter) |
| `GET` | `/api/sessions/:id` | Get session details |
| `POST` | `/api/sessions/:id/messages` | Send message (SSE stream) |
| `POST` | `/api/sessions/:id/pause` | Pause session |
| `POST` | `/api/sessions/:id/resume` | Resume session |
| `POST` | `/api/sessions/:id/stop` | Stop/interrupt session |
| `POST` | `/api/sessions/:id/fork` | Fork session |
| `DELETE` | `/api/sessions/:id` | End session |
