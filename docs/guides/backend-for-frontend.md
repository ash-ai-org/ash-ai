# Building a Backend for Frontend (BFF)

*When your users interact with Ash through a browser, don't expose the Ash server directly. Put your own backend in between.*

## Why You Need a BFF

```
Browser  ──→  Your Backend (BFF)  ──→  Ash Server
                 (your auth,            (API key,
                  your users,            sandboxes,
                  your rules)            agents)
```

Three reasons:

1. **Secrets stay server-side.** Your `ASH_API_KEY` and `ASH_SERVER_URL` never reach the browser. If a user opens DevTools, they see requests to `/api/chat`, not `http://your-ash-server:4100/api/sessions/...`.

2. **You own the auth boundary.** Ash authenticates API clients with API keys — it doesn't know about your end users. Your BFF maps authenticated users to Ash sessions and enforces who can do what.

3. **You control the surface area.** Ash exposes ~30 endpoints. Your users probably need 4: create session, send message, list sessions, end session. The BFF is where you decide what's exposed.

## What the BFF Actually Does

The BFF is thin. Each route does three things: authenticate the user, call `AshClient`, return the result. Here's the complete surface for a chat app:

| Your Route | Ash SDK Call | Purpose |
|---|---|---|
| `POST /api/sessions` | `client.createSession(agent)` | Start a conversation |
| `POST /api/sessions/:id/messages` | `client.sendMessage(id, content)` | Send message, stream response |
| `GET /api/sessions` | `client.listSessions()` | List user's conversations |
| `DELETE /api/sessions/:id` | `client.endSession(id)` | End a conversation |

That's it. ~50 lines of actual logic.

## Example: Next.js App Router

This is the pattern used in `examples/qa-bot/`. The Ash SDK client is created once, server-side:

```typescript
// lib/ash.ts — runs on the server only
import { AshClient } from '@ash-ai/sdk';

const serverUrl = process.env.ASH_SERVER_URL || 'http://localhost:4100';
const apiKey = process.env.ASH_API_KEY || undefined;

export const ashClient = new AshClient({ serverUrl, apiKey });
```

### Create Session

```typescript
// app/api/sessions/route.ts
import { ashClient } from '@/lib/ash';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { agent } = await req.json();
  const session = await ashClient.createSession(agent);
  return NextResponse.json({ session });
}
```

### Send Message (SSE Passthrough)

The key route. Ash returns an SSE stream — your BFF pipes it straight through to the browser:

```typescript
// app/api/sessions/[id]/messages/route.ts
import { ashClient } from '@/lib/ash';
import { NextRequest } from 'next/server';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { content } = await req.json();

  const res = await ashClient.sendMessage(id, content, {
    includePartialMessages: true,
  });

  // Pipe the SSE stream through — no buffering, no parsing
  return new Response(res.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

### End Session

```typescript
// app/api/sessions/[id]/route.ts
import { ashClient } from '@/lib/ash';
import { NextRequest, NextResponse } from 'next/server';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await ashClient.endSession(id);
  return NextResponse.json({ session });
}
```

## Example: Express

Same pattern, different framework. ~40 lines total:

```typescript
import express from 'express';
import { AshClient } from '@ash-ai/sdk';

const app = express();
app.use(express.json());

const ash = new AshClient({
  serverUrl: process.env.ASH_SERVER_URL || 'http://localhost:4100',
  apiKey: process.env.ASH_API_KEY,
});

app.post('/api/sessions', async (req, res) => {
  const session = await ash.createSession(req.body.agent);
  res.json({ session });
});

app.post('/api/sessions/:id/messages', async (req, res) => {
  const sseResponse = await ash.sendMessage(req.params.id, req.body.content, {
    includePartialMessages: true,
  });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');

  // Pipe the SSE stream through
  const reader = sseResponse.body?.getReader();
  if (!reader) return res.status(502).json({ error: 'No response body' });

  const pump = async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  };
  pump().catch(() => res.end());
});

app.delete('/api/sessions/:id', async (req, res) => {
  const session = await ash.endSession(req.params.id);
  res.json({ session });
});

app.listen(3000);
```

## Adding User Auth

The examples above skip authentication for clarity. In production you'll want to:

1. **Authenticate the user** on every request (session cookie, JWT, etc.)
2. **Scope sessions to users** so Alice can't see Bob's conversations
3. **Enforce limits** (max sessions per user, rate limiting, etc.)

Ash doesn't have user-level auth — that's your BFF's job. A simple approach: store a mapping of `userId → sessionId[]` in your own database, and check it on every request.

```typescript
// Pseudocode — add your own auth middleware
app.post('/api/sessions/:id/messages', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const sessionId = req.params.id;

  // Verify this user owns this session
  if (!await db.userOwnsSession(userId, sessionId)) {
    return res.status(403).json({ error: 'Not your session' });
  }

  const sseResponse = await ash.sendMessage(sessionId, req.body.content);
  // ... pipe SSE stream
});
```

## What NOT to Do

**Don't parse and re-serialize the SSE stream.** The stream from Ash is already correctly formatted SSE. Pipe it through as raw bytes. Parsing it adds latency to every token.

**Don't expose Ash directly and "add auth later."** The moment your app is on the internet, someone will find the Ash URL in a network request. Start with the BFF from day one.

**Don't build a BFF that talks to Ash over the public internet without TLS.** If your BFF and Ash are on the same machine or VPC, plain HTTP is fine. If they're not, use HTTPS or a tunnel.

**Don't duplicate session state.** Ash already tracks sessions, messages, and state. Your BFF should store only the mapping between your users and Ash session IDs — not a copy of the conversation.

## Reference

- [`examples/qa-bot/`](../../examples/qa-bot/) — Full working Next.js example with BFF
- [Connecting to Ash](./connecting.md) — SDK setup, SSE format, session lifecycle
- [Authentication](../features/authentication.md) — Ash's API key auth
- [API Reference](../api-reference.md) — All Ash endpoints
