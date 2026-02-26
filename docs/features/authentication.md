# Authentication

*Added: 2026-02-18. Updated: 2026-02-25.*

## What

API key authentication for Ash server endpoints. On first start, the server auto-generates an API key and saves it for the CLI. All API requests must include a `Bearer` token. Auth is always on — no manual config needed.

## How It Works

Every request to `/api/*` must include:

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

## Auto-Generated Keys (Default)

On first start, if no API keys exist in the database and no `ASH_API_KEY` env var is set, the server:

1. Generates a key with the format `ash_<24 random bytes base64url>` (e.g. `ash_7kX9mQ2pL...`)
2. Hashes and stores it in the database
3. Writes the plaintext key to `{dataDir}/initial-api-key` (permissions `0600`)
4. Logs the key to stdout

The CLI (`ash start`) automatically picks up this bootstrap file, saves the key to `~/.ash/config.json`, and deletes the file. All subsequent CLI commands send the key automatically.

```
$ ash start
Starting Ash server...
Waiting for server to be ready...

API key auto-generated and saved to ~/.ash/config.json
  Key: ash_7kX9mQ2pL...

Ash server is running.
  URL:      http://localhost:4100
  Data dir: ~/.ash
```

On subsequent starts, the existing key is reused — no new key is generated.

### Key Format

Keys are prefixed with `ash_` for identifiability:
- GitHub secret scanning can detect leaked keys
- Easy to grep in logs
- 24 random bytes (base64url) = 192 bits of entropy

## Manual Override

You can still set a key explicitly via environment variable. This takes precedence over auto-generation:

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

If `ASH_API_KEY` is set, the server uses it directly (no auto-generation). The server logs which mode it starts in:

```
[info] API key authentication enabled
```

### TypeScript SDK

```typescript
import { AshClient } from '@ash-ai/sdk';

const client = new AshClient({
  serverUrl: 'http://your-server:4100',
  apiKey: 'your-secret-key',
});
```

### Python SDK

```python
from ash_sdk import AshClient

client = AshClient("http://your-server:4100", api_key="your-secret-key")
```

### CLI

The CLI reads the API key from `~/.ash/config.json` automatically (saved by `ash start`). You can also set it explicitly:

```bash
# Environment variable (highest precedence)
export ASH_API_KEY=your-secret-key
ash agent list

# Or save it to config when connecting to a remote server
ash connect http://your-server:4100 --api-key your-secret-key
```

Key precedence: `ASH_API_KEY` env var > `~/.ash/config.json` `api_key` field.

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

Key generation: `packages/server/src/auth.ts` (`generateApiKey()`). Auto-generation logic: `packages/server/src/server.ts` (after DB init). CLI bootstrap: `packages/cli/src/commands/start.ts`. Config: `packages/cli/src/config.ts`.

Auth hook: Fastify `onRequest` hook in `auth.ts`. Checks DB keys first (HMAC-SHA256 hash), falls back to `ASH_API_KEY` env var comparison.

### Test Coverage

**Unit tests** (`packages/server/src/__tests__/auth.test.ts`):
- Fastify inject: no header → 401, wrong key → 401, correct key → 200
- Public routes bypass auth
- Auth required when DB has keys (no ASH_API_KEY env)
- Auth not required when no keys exist anywhere (pre-generation state)
- `generateApiKey()` format and uniqueness
- `hashApiKey()` determinism and HMAC vs plain
- Real HTTP requests against a listening server

**Integration test** (`test/integration/auth.test.ts`):
- Launches a real Ash server with `ASH_API_KEY` set
- SDK `AshClient` without key → rejects
- SDK `AshClient` with wrong key → rejects
- SDK `AshClient` with correct key → succeeds
- Health check works without auth

## Known Limitations

- No per-user keys or RBAC (multi-tenant API keys are supported via the DB)
- No rate limiting on failed auth attempts
- Bootstrap file mechanism requires shared filesystem between server and CLI (works for Docker with mounted `~/.ash`, not for remote-only servers — use `ash connect --api-key` for those)
