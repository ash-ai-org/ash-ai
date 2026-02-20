---
sidebar_position: 6
title: Authentication
---

# Authentication

Ash uses Bearer token authentication to protect API endpoints. All requests to `/api/*` routes require a valid API key when authentication is enabled.

## Generating an API Key

Generate a random key with `openssl`:

```bash
openssl rand -hex 32
```

This produces a 64-character hex string suitable for use as an API key.

## Configuring the Server

Set the `ASH_API_KEY` environment variable on the server:

```bash
export ASH_API_KEY="your-generated-key-here"
```

Or pass it when starting the server:

```bash
ASH_API_KEY="your-generated-key-here" ash start
```

When `ASH_API_KEY` is set, every request to `/api/*` must include a matching Bearer token. When it is **not** set, authentication is disabled and all requests are accepted (local development mode).

## Sending Authenticated Requests

### TypeScript SDK

Pass the API key when creating the client:

```typescript
import { AshClient } from '@ash-ai/sdk';

const client = new AshClient({
  serverUrl: 'http://localhost:4100',
  apiKey: 'your-generated-key-here',
});

// All subsequent calls include the Authorization header automatically
const agents = await client.listAgents();
```

### Python SDK

```python
from ash_sdk import AshClient

client = AshClient(
    "http://localhost:4100",
    api_key="your-generated-key-here",
)

agents = client.list_agents()
```

### CLI

Set the `ASH_API_KEY` environment variable:

```bash
export ASH_API_KEY="your-generated-key-here"
ash agent list
```

Or pass it inline:

```bash
ASH_API_KEY="your-generated-key-here" ash agent list
```

### curl

Include the `Authorization` header with the `Bearer` scheme:

```bash
curl http://localhost:4100/api/agents \
  -H "Authorization: Bearer your-generated-key-here"
```

## Public Endpoints

The following endpoints do not require authentication, even when `ASH_API_KEY` is set:

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Server health check |
| `GET /metrics` | Prometheus metrics |
| `GET /docs/*` | API documentation (Swagger UI) |

## Error Responses

### 401 -- Missing Authorization Header

Returned when `ASH_API_KEY` is set on the server but the request has no `Authorization` header:

```json
{
  "error": "Missing Authorization header",
  "statusCode": 401
}
```

### 401 -- Invalid API Key

Returned when the `Authorization` header is present but the key does not match:

```json
{
  "error": "Invalid API key",
  "statusCode": 401
}
```

### 401 -- Malformed Header

Returned when the `Authorization` header does not use the `Bearer <key>` format:

```json
{
  "error": "Invalid Authorization header format",
  "statusCode": 401
}
```

## Development Mode

When `ASH_API_KEY` is not set, the server starts in development mode:

- No authentication is required for any endpoint
- All requests are assigned to the `default` tenant
- The server logs: `ASH_API_KEY not set -- auth disabled (local dev mode)`

This is convenient for local development but should never be used in production. Always set `ASH_API_KEY` when deploying a server that is accessible over a network.

## Auth Resolution Order

When a request arrives, the server resolves authentication in the following order:

1. **Public endpoints** (`/health`, `/docs/*`) -- skip auth entirely.
2. **Internal endpoints** (`/api/internal/*`) -- skip auth (used for runner registration).
3. **Bearer token present** -- validate against the `ASH_API_KEY` value. Accept if they match.
4. **No header, no `ASH_API_KEY` set** -- accept (dev mode).
5. **No match** -- reject with 401.
