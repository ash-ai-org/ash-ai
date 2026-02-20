# 04 - API Reference Section

## Approach

Ash already auto-generates an OpenAPI 3.0 spec and serves Swagger UI at `/docs`. The Docusaurus API Reference should:

1. **Hand-written overview page** with auth, errors, base URL, and patterns
2. **Auto-generated endpoint docs** from OpenAPI spec (via `docusaurus-openapi-docs` plugin)
3. **Hand-written SSE streaming page** (OpenAPI doesn't model SSE well)

## Pages

### 1. Overview (`/docs/api/overview`)

**Content:**
- Base URL: `http://localhost:4100/api` (configurable via `ASH_PORT`)
- Authentication: Bearer token in `Authorization` header
- Error format: `{ error: string }` with appropriate HTTP status codes
- Common status codes: 200, 201, 400, 401, 404, 409, 500
- Content-Type: `application/json` for requests, `text/event-stream` for SSE

**Source:** `docs/api-reference.md`

---

### 2. Agents (`/docs/api/agents`)

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `POST /api/agents` | Deploy or update an agent |
| `GET /api/agents` | List all agents |
| `GET /api/agents/:name` | Get agent by name |
| `DELETE /api/agents/:name` | Delete agent |

**Auto-generated from:** `packages/server/src/schemas.ts` + route schemas

---

### 3. Sessions (`/docs/api/sessions`)

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `POST /api/sessions` | Create new session |
| `GET /api/sessions` | List sessions |
| `GET /api/sessions/:id` | Get session |
| `POST /api/sessions/:id/pause` | Pause session |
| `POST /api/sessions/:id/resume` | Resume session |
| `DELETE /api/sessions/:id` | End session |

**Auto-generated from:** route schemas

---

### 4. Messages (`/docs/api/messages`)

**This page is hand-written** because SSE streaming doesn't map well to OpenAPI.

**Content:**
- `POST /api/sessions/:id/messages` - Send message, receive SSE stream
- Request body: `{ content: string, includePartialMessages?: boolean }`
- Response: `text/event-stream`
- SSE event format:
  ```
  event: message
  data: {"type":"assistant","content":[...]}

  event: done
  data: {"sessionId":"..."}

  event: error
  data: {"error":"..."}
  ```
- Message types (from Claude SDK): `AssistantMessage`, `ResultMessage`, `ToolUseBlock`, `ToolResultBlock`
- Extracting text content from messages
- Partial messages for streaming deltas
- Connection lifecycle: keep-alive, reconnection, timeout (30s dead client)

**Source:** `docs/api-reference.md`, `packages/server/src/routes/sessions.ts`

---

### 5. Files (`/docs/api/files`)

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `GET /api/sessions/:id/files` | List workspace files |
| `GET /api/sessions/:id/files/*` | Read file content |

**Auto-generated from:** route schemas

---

### 6. Health & Metrics (`/docs/api/health`)

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `GET /health` | Server status + pool stats |
| `GET /metrics` | Prometheus format metrics |

**Content (hand-written additions):**
- Health response schema (status, mode, pool stats)
- Prometheus metric names and labels
- Use in Kubernetes liveness/readiness probes

**Source:** `docs/features/metrics.md`

---

## OpenAPI Auto-Generation

### Plugin: `docusaurus-openapi-docs`

**Setup:**
```js
// docusaurus.config.js
plugins: [
  ['docusaurus-openapi-docs', {
    id: 'api',
    docsPluginId: 'classic',
    config: {
      ash: {
        specPath: 'static/openapi.json',
        outputDir: 'docs/api',
      }
    }
  }]
]
```

**Workflow:**
1. `pnpm openapi` generates `openapi.json` from running server
2. Copy to Docusaurus `static/openapi.json`
3. Plugin generates endpoint pages at build time
4. Hand-written pages (overview, messages, health details) supplement auto-generated ones

### Alternative: Direct Link

If auto-generation is too heavy initially, just link to the Swagger UI:
- "Interactive API docs available at `http://your-server:4100/docs`"
- Include the hand-written pages in Docusaurus for the parts OpenAPI can't cover (SSE)
