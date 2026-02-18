# Authentication

*Added: 2026-02-18*

## What

API key authentication for Ash server endpoints. When enabled, all API requests must include a `Bearer` token. When disabled (default for local dev), all requests pass through.

## How It Works

Set `ASH_API_KEY` on the server. Every request to `/api/*` must include:

```
Authorization: Bearer <key>
```

Requests without the header or with a wrong key get `401`.

### Public Endpoints (No Auth Required)

| Endpoint | Why |
|----------|-----|
| `GET /health` | Load balancer health checks, monitoring |
| `GET /metrics` | Prometheus scraping |
| `GET /docs/*` | Swagger UI and OpenAPI spec |

Everything under `/api/` is protected.

## Setup

### Generate a Key

```bash
openssl rand -hex 32
```

### Server

```bash
# Docker
docker run -d -p 4100:4100 \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -e ASH_API_KEY=your-secret-key \
  ghcr.io/ash-ai/ash:0.1.0

# CLI
ASH_API_KEY=your-secret-key ash start

# Direct
ASH_API_KEY=your-secret-key node packages/server/dist/index.js
```

If `ASH_API_KEY` is not set, auth is disabled and all requests pass through. The server logs which mode it starts in:

```
[info] API key authentication enabled
```
or
```
[info] ASH_API_KEY not set — auth disabled (local dev mode)
```

### TypeScript SDK

```typescript
import { AshClient } from '@ash-ai/sdk';

const client = new AshClient({
  serverUrl: 'http://your-server:4100',
  apiKey: 'your-secret-key',
});
```

Without the `apiKey`, all API calls throw with `"Missing Authorization header"`.

### Python SDK

```python
from ash_sdk import AshClient

client = AshClient("http://your-server:4100", api_key="your-secret-key")
```

### CLI

```bash
export ASH_SERVER_URL=http://your-server:4100
export ASH_API_KEY=your-secret-key
ash agent list
```

### curl

```bash
curl -H "Authorization: Bearer your-secret-key" \
  http://your-server:4100/api/agents
```

## Error Responses

Missing header:

```json
{ "error": "Missing Authorization header", "statusCode": 401 }
```

Wrong key:

```json
{ "error": "Invalid API key", "statusCode": 401 }
```

## Implementation

Single file: `packages/server/src/auth.ts`. Registers a Fastify `onRequest` hook that runs before every route handler. ~30 lines.

### Test Coverage

**Unit tests** (`packages/server/src/__tests__/auth.test.ts`):
- Fastify inject: no header → 401, wrong key → 401, correct key → 200
- Public routes bypass auth
- Auth disabled when no key set
- Real HTTP requests against a listening server

**Integration test** (`test/integration/auth.test.ts`):
- Launches a real Ash server with `ASH_API_KEY` set
- SDK `AshClient` without key → rejects
- SDK `AshClient` with wrong key → rejects
- SDK `AshClient` with correct key → succeeds
- Health check works without auth

## Known Limitations

- Single shared API key (no per-user keys or RBAC)
- Key is compared in constant time via string equality (no timing-safe compare yet)
- No key rotation without server restart
- No rate limiting on failed auth attempts
