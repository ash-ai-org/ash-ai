---
sidebar_position: 5
title: OpenAPI & SDK Generation
---

# OpenAPI & SDK Generation

Ash auto-generates an OpenAPI specification from its Fastify route schemas and uses it to produce the Python SDK. This guide covers the full generation pipeline, how to update schemas when adding routes, and how to consume the generated spec.

## Architecture

```
Fastify route schemas  →  @fastify/swagger  →  OpenAPI JSON  →  openapi-python-client  →  Python SDK
(packages/server/)         (runtime plugin)      (openapi.json)    (code generator)          (packages/sdk-python/)
```

The OpenAPI spec is the **single source of truth** for the Python SDK. The TypeScript SDK (`@ash-ai/sdk`) is hand-written but shares types from `@ash-ai/shared`.

## Generating the OpenAPI Spec

```bash
# Generate OpenAPI spec from Fastify route schemas
make openapi
```

This command:

1. Starts the Ash server temporarily
2. Hits the `/docs/json` endpoint to extract the schema from Fastify's `@fastify/swagger` plugin
3. Writes the spec to `packages/server/openapi.json`
4. Copies it to `docs/openapi.json` (for the documentation site)

The spec includes all API endpoints, request/response schemas, authentication requirements, and SSE streaming details.

### Viewing the spec

You can inspect the generated spec in three ways:

```bash
# 1. Read the generated file directly
cat packages/server/openapi.json | jq .

# 2. View in Swagger UI (start the server first)
open http://localhost:4100/docs

# 3. Fetch from the running server
curl http://localhost:4100/docs/json | jq .
```

## Generating the Python SDK

```bash
# Generate Python SDK from OpenAPI spec (requires openapi-python-client)
make sdk-python
```

This uses [`openapi-python-client`](https://github.com/openapi-generators/openapi-python-client) to generate a typed Python client from the OpenAPI spec. Output goes to `packages/sdk-python/`.

### Prerequisites

```bash
# Install the Python SDK generator
pip install openapi-python-client
```

### What gets generated

The Python SDK includes:

- **Client class** with methods for every API endpoint
- **Typed models** for all request/response bodies
- **Async support** via `httpx`
- **Authentication** handling (Bearer token)

```python
from ash_ai import AshClient

client = AshClient(
    server_url="http://localhost:4100",
    api_key="your-api-key",
)

# Every endpoint has a typed method
agents = client.list_agents()
session = client.create_session("my-agent")
```

## Adding a New API Route

When you add a new route to the Ash server, follow these steps to keep the OpenAPI spec and Python SDK in sync:

### 1. Define the Fastify route with a JSON schema

Fastify's `@fastify/swagger` plugin extracts schemas from route definitions. Always include `schema` with `body`, `params`, `querystring`, and `response` as needed:

```typescript
// packages/server/src/routes/example.ts
import { FastifyInstance } from 'fastify';

export async function exampleRoutes(fastify: FastifyInstance) {
  fastify.post('/api/example', {
    schema: {
      tags: ['Example'],
      summary: 'Create an example resource',
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', description: 'Resource name' },
          config: {
            type: 'object',
            properties: {
              timeout: { type: 'number', default: 30000 },
            },
          },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            statusCode: { type: 'number' },
          },
        },
      },
    },
    handler: async (request, reply) => {
      // Implementation...
    },
  });
}
```

### 2. Regenerate the OpenAPI spec

```bash
make openapi
```

Verify the new endpoint appears:

```bash
cat packages/server/openapi.json | jq '.paths["/api/example"]'
```

### 3. Regenerate the Python SDK

```bash
make sdk-python
```

### 4. Verify

```bash
# Check that the new method exists in the Python SDK
grep -r "def create_example" packages/sdk-python/
```

## Consuming the OpenAPI Spec

### From Swagger UI

Every running Ash server includes Swagger UI at `/docs`:

```
http://localhost:4100/docs
```

The Swagger UI provides:
- Interactive request builders for every endpoint
- Request/response schema documentation
- "Try it out" buttons for testing endpoints directly

### From the JSON endpoint

```bash
# Download the raw OpenAPI spec
curl http://localhost:4100/docs/json -o openapi.json
```

### Generating clients for other languages

You can use any OpenAPI code generator with the spec:

```bash
# Generate a Go client
openapi-generator generate -i openapi.json -g go -o ./go-client

# Generate a Java client
openapi-generator generate -i openapi.json -g java -o ./java-client

# Generate a Rust client
openapi-generator generate -i openapi.json -g rust -o ./rust-client
```

## Troubleshooting

### Spec is empty or missing routes

Routes must be registered before the Swagger plugin extracts the schema. Ensure your routes are registered in the plugin registration order (check `packages/server/src/app.ts`).

### Python SDK has stale methods

The generator overwrites the entire `packages/sdk-python/` directory. If methods are stale, regenerate:

```bash
make openapi && make sdk-python
```

### Schema validation errors

If `openapi-python-client` reports validation errors, check that your Fastify route schemas use valid JSON Schema types. Common issues:

- Using TypeScript types instead of JSON Schema types (`string` not `String`)
- Missing `type` field on object schemas
- Using `$ref` without a matching definition
