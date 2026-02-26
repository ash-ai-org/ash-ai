---
sidebar_position: 6
title: Authentication
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Authentication

Ash uses Bearer token authentication to protect API endpoints. All requests to `/api/*` routes require a valid API key. Authentication is always enabled — the server auto-generates an API key on first start if one is not provided.

## Auto-Generated API Key

When you run `ash start` for the first time, the server automatically generates a secure API key (prefixed `ash_`) and:

1. Stores the hashed key in the database.
2. Writes the plaintext key to `~/.ash/initial-api-key`.
3. Logs the key to stdout.

The CLI automatically picks up this key and saves it to `~/.ash/config.json`. No manual configuration is needed for local development.

## Manual Configuration

To use a specific API key instead of the auto-generated one, set the `ASH_API_KEY` environment variable:

```bash
export ASH_API_KEY="your-key-here"
```

Or pass it when starting the server:

```bash
ash start -e ASH_API_KEY=your-key-here
```

When `ASH_API_KEY` is set, the server uses it directly instead of auto-generating one.

## Sending Authenticated Requests

<Tabs groupId="sdk-language">
<TabItem value="typescript" label="TypeScript">

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

</TabItem>
<TabItem value="python" label="Python">

```python
from ash_sdk import AshClient

client = AshClient(
    "http://localhost:4100",
    api_key="your-generated-key-here",
)

agents = client.list_agents()
```

</TabItem>
<TabItem value="cli" label="CLI">

Set the `ASH_API_KEY` environment variable:

```bash
export ASH_API_KEY="your-generated-key-here"
ash agent list
```

Or pass it inline:

```bash
ASH_API_KEY="your-generated-key-here" ash agent list
```

</TabItem>
<TabItem value="curl" label="curl">

Include the `Authorization` header with the `Bearer` scheme:

```bash
curl $ASH_SERVER_URL/api/agents \
  -H "Authorization: Bearer your-generated-key-here"
```

</TabItem>
</Tabs>

## Public Endpoints

The following endpoints do not require authentication, even when `ASH_API_KEY` is set:

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Server health check |
| `GET /metrics` | Prometheus metrics |
| `GET /docs/*` | API documentation (Swagger UI) |

## Error Responses

### 401 -- Missing Authorization Header

Returned when the request has no `Authorization` header:

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

## Auth Resolution Order

When a request arrives, the server resolves authentication in the following order:

1. **Public endpoints** (`/health`, `/docs/*`) -- skip auth entirely.
2. **Internal endpoints** (`/api/internal/*`) -- authenticated via `ASH_INTERNAL_SECRET` (used for runner registration).
3. **Bearer token present** -- validate against `ASH_API_KEY` or the database API keys table. Accept if matched.
4. **No match** -- reject with 401.
