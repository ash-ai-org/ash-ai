# OpenAPI Spec Generation

**Date**: 2025-02
**Status**: Implemented

## What

The Ash server automatically generates an OpenAPI 3.0 spec from its route definitions. This spec powers:

1. **Swagger UI** at `/docs` — interactive API explorer
2. **Static spec** at `packages/server/openapi.json` and `docs/openapi.json`
3. **SDK generation** — the Python SDK models are derived from this spec

## How

### Route-Level JSON Schema

Every Fastify route has a `schema` property defining its request body, params, query, and response shapes. These reference reusable schemas registered via `addSchema()`:

```typescript
// packages/server/src/schemas.ts
app.addSchema({ $id: 'Agent', type: 'object', properties: { ... } });
app.addSchema({ $id: 'Session', ... });
app.addSchema({ $id: 'ApiError', ... });
app.addSchema({ $id: 'HealthResponse', ... });
```

Routes reference these via `{ $ref: 'Agent#' }`.

### Swagger Plugin

`@fastify/swagger` reads the route schemas and produces an OpenAPI 3.0 spec. `@fastify/swagger-ui` serves the interactive docs:

```
GET /docs       → Swagger UI
GET /docs/json  → OpenAPI JSON spec
```

### Build-Time Export

```bash
pnpm --filter '@ash-ai/server' openapi
```

Runs `packages/server/scripts/export-openapi.ts`:
1. Creates a minimal Fastify instance (no DB, no sandbox manager)
2. Registers swagger + schemas + routes (handlers are never called)
3. Calls `app.ready()` and writes `app.swagger()` to JSON
4. Outputs to `packages/server/openapi.json` and `docs/openapi.json`

## Why This Approach

- **Single source of truth**: Route schemas serve double duty — they validate requests at runtime AND generate the spec.
- **No schema drift**: If a route changes its input/output, the spec updates automatically.
- **Fastify-native**: Uses `@fastify/swagger` which reads Fastify's built-in schema system, not a separate annotation layer.

## Operations

The spec includes 12 operations across 3 tags:

| Tag | Method | Path | Description |
|-----|--------|------|-------------|
| health | GET | `/health` | Server health |
| agents | POST | `/api/agents` | Deploy agent |
| agents | GET | `/api/agents` | List agents |
| agents | GET | `/api/agents/{name}` | Get agent |
| agents | DELETE | `/api/agents/{name}` | Delete agent |
| sessions | POST | `/api/sessions` | Create session |
| sessions | GET | `/api/sessions` | List sessions |
| sessions | GET | `/api/sessions/{id}` | Get session |
| sessions | POST | `/api/sessions/{id}/messages` | Send message (SSE) |
| sessions | POST | `/api/sessions/{id}/pause` | Pause session |
| sessions | POST | `/api/sessions/{id}/resume` | Resume session |
| sessions | DELETE | `/api/sessions/{id}` | End session |

## Regenerating

```bash
# Regenerate after route changes
make openapi

# Or directly
pnpm --filter '@ash-ai/server' openapi
```

## [Python SDK](https://pypi.org/project/ash-ai-sdk/)

The Python SDK at `packages/sdk-python/` ([PyPI](https://pypi.org/project/ash-ai-sdk/)) has hand-written models and a streaming SSE parser. The `generate.sh` script can optionally regenerate models from the OpenAPI spec using `openapi-python-client`.

## Known Limitations

- The SSE streaming endpoint (`POST /api/sessions/{id}/messages`) is described as returning a string, since OpenAPI 3.0 has limited support for SSE. The actual response is `text/event-stream`.
- Schema names in the generated spec use Fastify's internal `def-N` naming, but include `title` fields with human-readable names (Agent, Session, etc.).
