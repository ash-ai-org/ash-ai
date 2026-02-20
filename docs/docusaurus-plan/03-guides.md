# 03 - Guides Section

Task-oriented how-to guides. Each answers "How do I do X?" with concrete steps and code.

## Pages

### 1. Defining an Agent (`/docs/guides/defining-an-agent`)

**Purpose:** How to create an agent folder with the right structure.

**Content:**
- Minimal agent: just a `CLAUDE.md` file
- Adding permissions: `.claude/settings.json` with `permissionMode`, `model`
- Adding skills: `.claude/skills/*.md` for reusable skill prompts
- Adding MCP servers: `.mcp.json` for external tool integrations
- Agent folder structure reference:
  ```
  my-agent/
  ├── CLAUDE.md                  # System prompt (required)
  ├── .claude/
  │   ├── settings.json          # Permissions, model config
  │   └── skills/
  │       └── search.md          # Custom skill
  └── .mcp.json                  # MCP server config
  ```
- Example agents for common use cases (code reviewer, QA bot, data analyst)

**Source:** `README.md`, `examples/hosted-agent/`

---

### 2. Deploying Agents (`/docs/guides/deploying-agents`)

**Purpose:** How to deploy and update agents.

**Content:**
- `ash deploy ./path --name agent-name`
- What happens: server validates CLAUDE.md exists, stores agent config
- Updating: redeploy with same name
- Listing: `ash agent list`
- Deleting: `ash agent delete <name>`
- SDK equivalent: `client.deployAgent(name, path)`
- API equivalent: `POST /api/agents`

**Source:** `docs/cli-reference.md`, `docs/api-reference.md`

---

### 3. Managing Sessions (`/docs/guides/managing-sessions`)

**Purpose:** Full session lifecycle management.

**Content:**
- Creating: `ash session create <agent>` or `POST /api/sessions`
- Sending messages: `ash session send <id> "message"` or `POST /api/sessions/:id/messages`
- Pausing: preserves state, frees sandbox resources
- Resuming: fast path (sandbox alive) vs cold path (restore from snapshot)
- Ending: cleanup, permanent
- Listing sessions: filter by agent, status
- Session status values and transitions

**Source:** `docs/getting-started.md`, `docs/features/session-resume.md`, `docs/api-reference.md`

---

### 4. Streaming Responses (`/docs/guides/streaming-responses`)

**Purpose:** How to consume SSE streams from Ash.

**Content:**
- SSE format overview (event types: message, error, done)
- Using the TypeScript SDK:
  ```typescript
  for await (const event of client.sendMessageStream(sessionId, "Hello")) {
    if (event.type === 'message') {
      const text = extractTextFromEvent(event);
      process.stdout.write(text);
    }
  }
  ```
- Using the Python SDK
- Using raw fetch + ReadableStream (browser)
- Using curl (for testing)
- Partial messages: `includePartialMessages` option for live typing
- Extracting display items: `extractDisplayItems()` helper

**Source:** `docs/api-reference.md`, `packages/sdk/src/index.ts`, `packages/sdk/src/sse.ts`

---

### 5. Working with Files (`/docs/guides/working-with-files`)

**Purpose:** How to read files from an agent's workspace.

**Content:**
- List files: `GET /api/sessions/:id/files`
- Read file: `GET /api/sessions/:id/files/:path`
- SDK methods: `client.getSessionFiles()`, `client.getSessionFile()`
- Use case: reviewing code the agent wrote, downloading artifacts
- Workspace isolation: agents can only see their own workspace

**Source:** `docs/api-reference.md`, `packages/sdk/src/index.ts`

---

### 6. Authentication (`/docs/guides/authentication`)

**Purpose:** How to secure your Ash server.

**Content:**
- Single API key: `ASH_API_KEY` env var (backward compatible, simple)
- Multi-tenant keys: `POST /api/keys` to create scoped keys
- Using keys: `Authorization: Bearer <key>` header
- Public endpoints (no auth required): `/health`, `/metrics`, `/docs/*`
- SDK: `new AshClient({ serverUrl, apiKey })`
- CLI: `--api-key` flag or `ASH_API_KEY` env
- Tenant scoping: each key belongs to a tenant, sees only its own data

**Source:** `docs/features/authentication.md`, `packages/server/src/auth.ts`

---

### 7. Monitoring (`/docs/guides/monitoring`)

**Purpose:** How to monitor Ash in production.

**Content:**
- Health endpoint: `GET /health` (server status, pool stats)
- Prometheus metrics: `GET /metrics`
- Key metrics: active sessions, sandbox pool size, message latency
- Debug timing: `ASH_DEBUG_TIMING=1` for hot-path instrumentation
- Structured log output: JSON lines to stderr
- Integration with Grafana/Prometheus stack

**Source:** `docs/features/metrics.md`, `docs/features/hot-path-timing.md`
