---
sidebar_position: 1
title: API Overview
---

# API Overview

The Ash REST API is the primary interface for deploying agents, managing sessions, and sending messages. All endpoints are served by the Ash server process.

## Base URL

```
http://localhost:4100
```

The port is configurable via the `ASH_PORT` environment variable (default: `4100`). The host is configurable via `ASH_HOST` (default: `0.0.0.0`).

## Authentication

API requests are authenticated using Bearer tokens in the `Authorization` header:

```
Authorization: Bearer <your-api-key>
```

Authentication behavior depends on server configuration:

| Configuration | Behavior |
|---|---|
| `ASH_API_KEY` set | Single-tenant mode. The Bearer token must match `ASH_API_KEY`. |
| `ASH_API_KEY` not set (auto-generated) | The server auto-generates a key on first start. The CLI picks it up automatically. |
| API keys in database | Multi-tenant mode. Bearer token is hashed and looked up in the `api_keys` table. Each key maps to a tenant. |

Public endpoints (`/health`, `/docs/*`, `/metrics`) do not require authentication.

## Content Types

| Direction | Content-Type |
|---|---|
| Request bodies | `application/json` |
| Most responses | `application/json` |
| Message streaming | `text/event-stream` (SSE) |
| Prometheus metrics | `text/plain; version=0.0.4; charset=utf-8` |

## Error Format

All error responses use a consistent JSON structure:

```json
{
  "error": "Human-readable error message",
  "statusCode": 400
}
```

## Common Status Codes

| Code | Meaning |
|---|---|
| `200` | Success |
| `201` | Resource created |
| `400` | Bad request (missing required fields, invalid state transition) |
| `401` | Unauthorized (missing or invalid API key) |
| `404` | Resource not found |
| `410` | Gone (session has ended and cannot be resumed) |
| `500` | Internal server error |
| `503` | Service unavailable (sandbox capacity reached, no runners available) |

## Interactive API Docs

The server ships with built-in Swagger UI and an OpenAPI specification.

| Resource | URL |
|---|---|
| Swagger UI | [http://localhost:4100/docs](http://localhost:4100/docs) |
| OpenAPI spec (JSON) | [http://localhost:4100/docs/json](http://localhost:4100/docs/json) |

The Swagger UI provides interactive request builders for every endpoint, making it useful for exploration and debugging.

## TypeScript Types

If you are using the TypeScript SDK, all request and response types are available as imports:

```typescript
import { AshClient } from '@ash-ai/sdk';
```

The shared type definitions used by both client and server are available from the `@ash-ai/shared` package:

```typescript
import type {
  Agent,
  Session,
  SessionStatus,
  PoolStats,
  HealthResponse,
  ApiError,
  FileEntry,
  ListFilesResponse,
  GetFileResponse,
  AshStreamEvent,
} from '@ash-ai/shared';
```
