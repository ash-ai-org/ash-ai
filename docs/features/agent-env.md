# Agent-Level Default Environment Variables

## What

Agents can define default environment variables that are automatically injected into every session's sandbox. This eliminates the need to pass the same env vars on every `createSession` call.

## Why

Many agents need consistent environment variables across all sessions — API endpoints, feature flags, configuration values. Without agent-level env, every session creation call must redundantly specify the same `extraEnv`. This feature moves that configuration to the agent definition where it belongs.

## How

### Merge Order

Environment variables are merged with this priority (lowest to highest):

```
agent.env  →  credential env  →  session extraEnv  →  ASH_PERMISSION_MODE
```

On conflict, higher-priority values win. For example, if `agent.env` sets `FOO=bar` and session `extraEnv` sets `FOO=baz`, the sandbox gets `FOO=baz`.

### API

#### Deploy with env (POST `/api/agents`)

```bash
curl -X POST http://localhost:4100/api/agents \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "my-agent",
    "path": "/path/to/agent",
    "env": {
      "API_ENDPOINT": "https://api.example.com",
      "LOG_LEVEL": "debug"
    }
  }'
```

#### Update env (PATCH `/api/agents/:name`)

```bash
curl -X PATCH http://localhost:4100/api/agents/my-agent \
  -H 'Content-Type: application/json' \
  -d '{
    "env": {
      "API_ENDPOINT": "https://api-v2.example.com"
    }
  }'
```

Pass an empty object `{}` to clear all env vars.

#### SDK

```typescript
// Deploy with env
await client.deployAgent('my-agent', '/path/to/agent', {
  env: { API_ENDPOINT: 'https://api.example.com' },
});

// Update env
await client.updateAgent('my-agent', {
  env: { API_ENDPOINT: 'https://api-v2.example.com' },
});

// Session-level extraEnv overrides agent env on conflict
await client.createSession('my-agent', {
  extraEnv: { LOG_LEVEL: 'warn' },  // overrides agent's LOG_LEVEL if set
});
```

#### CLI

```bash
# Deploy with env
ash deploy ./my-agent -e API_ENDPOINT=https://api.example.com -e LOG_LEVEL=debug

# Session with env override
ash session create my-agent -e LOG_LEVEL=warn
```

### Security Considerations

- Env values are stored as **plain text** in the database. Use the credentials API for secrets (API keys, tokens).
- Agent env is visible in the agent API response. Do not store sensitive values here.
- The env merge is deterministic: agent < credential < session < permission mode.

## Known Limitations

- Env values are not encrypted. Use `POST /api/credentials` for sensitive keys.
- Updating agent env does not affect already-running sessions — only new sessions pick up changes.
