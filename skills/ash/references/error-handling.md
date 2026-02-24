# Error Handling Reference

## Two Error Sources

Ash errors come from two places:

1. **Connection errors** — thrown exceptions (network failure, 404, auth failure)
2. **Stream errors** — `error` events within the SSE stream (agent crash, sandbox failure)

Always handle both:

### TypeScript

```typescript
try {
  for await (const event of client.sendMessageStream(sessionId, 'hello')) {
    if (event.type === 'error') {
      // Agent-level error (sandbox crash, SDK error)
      console.error('Stream error:', event.data.error);
    }
  }
} catch (err) {
  // Connection-level error (network failure, 404, 401)
  console.error('Connection error:', err.message);
}
```

### Python

```python
from ash_ai import AshApiError

try:
    for event in client.send_message_stream(session_id, "hello"):
        if event.type == "error":
            # Agent-level error
            print(f"Stream error: {event.data['error']}")
except AshApiError as e:
    # API error with status code
    print(f"API error ({e.status_code}): {e.message}")
except Exception as e:
    # Connection error
    print(f"Connection error: {e}")
```

## Common Errors and Fixes

### `Agent "X" not found`

**Cause:** The agent hasn't been deployed, or the name is wrong.

**Fix:** Deploy it first or check available agents:
```typescript
const agents = await client.listAgents();
console.log(agents.map(a => a.name));
```

### `Session not found`

**Cause:** Session ID is wrong, or the session was already ended.

**Fix:** Verify the session exists:
```typescript
const sessions = await client.listSessions();
```

### `Session is not active` (when sending a message)

**Cause:** The session is paused, ended, or in error state.

**Fix:** Resume the session first:
```typescript
await client.resumeSession(sessionId);
// Now send messages
```

### `401 Unauthorized`

**Cause:** The server has `ASH_API_KEY` set and your client doesn't provide a matching key.

**Fix:** Pass the API key:
```typescript
const client = new AshClient({
  serverUrl: 'http://localhost:4100',
  apiKey: 'your-api-key',
});
```

### `503 Service Unavailable` (on session create)

**Cause:** No sandbox capacity available (pool exhausted).

**Fix:** Wait and retry, or end unused sessions to free capacity.

### Connection refused / ECONNREFUSED

**Cause:** The Ash server isn't running.

**Fix:** Start the server:
```bash
ash start
# or
pnpm --filter '@ash-ai/server' dev
```

### Stream hangs / no events received

**Cause:** The agent is processing (tool calls can take time).

**Fix:** This is normal behavior. If you need to interrupt:
```typescript
await client.stopSession(sessionId);
```

## Error Handling Patterns

### Retry with Backoff

```typescript
async function sendWithRetry(client, sessionId, content, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const events = [];
      for await (const event of client.sendMessageStream(sessionId, content)) {
        events.push(event);
      }
      return events;
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}
```

### Session Recovery

```typescript
async function ensureActive(client, sessionId) {
  const session = await client.getSession(sessionId);
  if (session.status === 'paused' || session.status === 'error') {
    return client.resumeSession(sessionId);
  }
  if (session.status === 'ended') {
    throw new Error('Session has ended. Create a new one.');
  }
  return session;
}
```
