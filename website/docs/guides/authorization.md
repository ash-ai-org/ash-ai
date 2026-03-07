---
sidebar_position: 7
title: Authorization & Access Control
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Authorization & Access Control

Ash provides tenant-level isolation through API keys and sandbox-level isolation through process namespacing. For role-based access control (RBAC) — where different users have access to different agent capabilities — you implement the authorization layer in your application and use Ash's per-session customization to enforce it.

This guide covers the built-in security boundaries and shows how to build RBAC on top of them.

## Built-in Security Boundaries

### Tenant Isolation via API Keys

Each API key maps to a tenant. Sessions created with a given API key are scoped to that tenant — they cannot see or modify sessions belonging to other tenants.

```typescript
import { AshClient } from '@ash-ai/sdk';

// Tenant A can only see their own sessions
const tenantA = new AshClient({
  serverUrl: 'http://localhost:4100',
  apiKey: 'ash_tenant_a_key',
});
const sessions = await tenantA.listSessions(); // Only tenant A's sessions

// Tenant B is completely isolated
const tenantB = new AshClient({
  serverUrl: 'http://localhost:4100',
  apiKey: 'ash_tenant_b_key',
});
const sessions = await tenantB.listSessions(); // Only tenant B's sessions
```

### Sandbox Isolation

Each session runs in a sandboxed process with:

- **Environment allowlist**: Only explicitly allowed variables (`ANTHROPIC_API_KEY`, `PATH`, etc.) are visible. Host secrets like `AWS_SECRET_ACCESS_KEY` or `DATABASE_URL` are never passed to the sandbox.
- **Filesystem isolation**: On Linux, `bubblewrap` (bwrap) provides a read-only root with a writable workspace directory. The agent cannot read files outside its workspace.
- **Resource limits**: Memory (default 2048 MB), CPU (1 core), disk (1024 MB), and max processes (64) are enforced via cgroups.
- **Process isolation**: Each sandbox is a separate process tree. One sandbox cannot interfere with another.

```typescript
// These resource limits are enforced per sandbox
const DEFAULT_SANDBOX_LIMITS = {
  memoryMb: 2048,
  cpuPercent: 100,
  diskMb: 1024,
  maxProcesses: 64,
};
```

See [Sandbox Isolation](../architecture/sandbox-isolation.md) for the full security model.

## Implementing Role-Based Access Control

Ash does not have a built-in RBAC system. Instead, you implement authorization in your application layer and use three Ash features to enforce it:

1. **Per-session MCP servers** — expose different tools to different roles
2. **Per-session system prompts** — restrict agent behavior based on role
3. **Agent selection** — route users to different agents based on role

### Pattern 1: MCP Sidecar for Role-Based Tools

The most powerful pattern. Your application exposes an MCP server that serves different tools based on the user's role. Each session connects to a role-scoped MCP endpoint.

<Tabs groupId="sdk-language">
<TabItem value="typescript" label="TypeScript">

```typescript
import { AshClient } from '@ash-ai/sdk';

const client = new AshClient({
  serverUrl: 'http://localhost:4100',
  apiKey: process.env.ASH_API_KEY,
});

// Your application determines the user's role
const user = await getAuthenticatedUser(request);
const role = user.role; // 'admin' | 'editor' | 'viewer'

// Create a session with role-scoped MCP tools
const session = await client.createSession('my-agent', {
  mcpServers: {
    'app-tools': {
      // Your MCP server checks the role and returns only allowed tools
      url: `http://your-app:8000/mcp?userId=${user.id}&role=${role}`,
    },
  },
  systemPrompt: buildSystemPrompt(role),
});

function buildSystemPrompt(role: string): string {
  switch (role) {
    case 'admin':
      return 'You have full access. You can read, write, delete, and manage users.';
    case 'editor':
      return 'You can read and write files. You cannot delete files or manage users.';
    case 'viewer':
      return 'You can only read files. Do not attempt to modify anything.';
    default:
      return 'You have read-only access.';
  }
}
```

</TabItem>
<TabItem value="python" label="Python">

```python
from ash_ai import AshClient

client = AshClient(
    server_url="http://localhost:4100",
    api_key=os.environ["ASH_API_KEY"],
)

# Your application determines the user's role
user = get_authenticated_user(request)
role = user.role  # "admin" | "editor" | "viewer"

# Create a session with role-scoped MCP tools
session = client.create_session("my-agent",
    mcp_servers={
        "app-tools": {
            # Your MCP server checks the role and returns only allowed tools
            "url": f"http://your-app:8000/mcp?userId={user.id}&role={role}",
        },
    },
    system_prompt=build_system_prompt(role),
)

def build_system_prompt(role: str) -> str:
    prompts = {
        "admin": "You have full access. You can read, write, delete, and manage users.",
        "editor": "You can read and write files. You cannot delete files or manage users.",
        "viewer": "You can only read files. Do not attempt to modify anything.",
    }
    return prompts.get(role, "You have read-only access.")
```

</TabItem>
</Tabs>

Your MCP server (running in your application, not inside the sandbox) implements the actual authorization logic:

```typescript
// Example MCP server handler in your application
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const server = new McpServer({ name: 'app-tools', version: '1.0.0' });

server.tool('delete-file', { path: z.string() }, async (params, extra) => {
  const { userId, role } = parseQueryParams(extra.requestUrl);

  // Enforce authorization — this runs in YOUR app, not in the sandbox
  if (role !== 'admin') {
    return { content: [{ type: 'text', text: 'Permission denied: admin role required' }] };
  }

  await deleteFile(params.path);
  return { content: [{ type: 'text', text: `Deleted ${params.path}` }] };
});
```

### Pattern 2: Agent-Per-Role

For simpler setups, deploy separate agents for each role. Each agent has different tools, system prompts, and permissions baked in.

<Tabs groupId="sdk-language">
<TabItem value="typescript" label="TypeScript">

```typescript
import { AshClient } from '@ash-ai/sdk';

const client = new AshClient({
  serverUrl: 'http://localhost:4100',
  apiKey: process.env.ASH_API_KEY,
});

// Deploy role-specific agents
await client.deployAgent('support-viewer', '/agents/support-viewer');
await client.deployAgent('support-editor', '/agents/support-editor');
await client.deployAgent('support-admin', '/agents/support-admin');

// Route user to the correct agent based on their role
const user = await getAuthenticatedUser(request);
const agentName = `support-${user.role}`;

const session = await client.createSession(agentName);
```

</TabItem>
<TabItem value="python" label="Python">

```python
from ash_ai import AshClient

client = AshClient(
    server_url="http://localhost:4100",
    api_key=os.environ["ASH_API_KEY"],
)

# Deploy role-specific agents
client.deploy_agent("support-viewer", "/agents/support-viewer")
client.deploy_agent("support-editor", "/agents/support-editor")
client.deploy_agent("support-admin", "/agents/support-admin")

# Route user to the correct agent based on their role
user = get_authenticated_user(request)
agent_name = f"support-{user.role}"

session = client.create_session(agent_name)
```

</TabItem>
</Tabs>

Each agent directory has its own `CLAUDE.md` and `.mcp.json` defining the permitted tools:

```
agents/
├── support-viewer/
│   ├── CLAUDE.md          # "You are a read-only support agent..."
│   └── .mcp.json          # Only read tools
├── support-editor/
│   ├── CLAUDE.md          # "You can read and write..."
│   └── .mcp.json          # Read + write tools
└── support-admin/
    ├── CLAUDE.md          # "You have full admin access..."
    └── .mcp.json          # All tools including delete and user management
```

### Pattern 3: Gateway Authorization

For production deployments, place an authorization gateway between your users and the Ash API. The gateway validates permissions before forwarding requests.

```typescript
// Express gateway that enforces authorization before proxying to Ash
import express from 'express';
import { AshClient } from '@ash-ai/sdk';

const app = express();
const client = new AshClient({
  serverUrl: 'http://ash-server:4100',
  apiKey: process.env.ASH_API_KEY,
});

// Middleware: authenticate user and check permissions
app.use('/api/sessions/:sessionId/messages', async (req, res, next) => {
  const user = await authenticateRequest(req);
  const session = await client.getSession(req.params.sessionId);

  // Verify the user owns this session
  if (session.metadata?.userId !== user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Check rate limits per role
  const limits = { viewer: 10, editor: 50, admin: 200 };
  const allowed = await checkRateLimit(user.id, limits[user.role]);
  if (!allowed) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  next();
});

// Proxy the request to Ash
app.post('/api/sessions/:sessionId/messages', async (req, res) => {
  const response = await client.sendMessage(req.params.sessionId, req.body.content);
  // Pipe the SSE stream back to the client
  response.body.pipeTo(new WritableStream({
    write(chunk) { res.write(chunk); },
    close() { res.end(); },
  }));
});
```

## Combining Patterns

In practice, you often combine multiple patterns:

```typescript
// 1. Gateway validates user authentication and rate limits
// 2. MCP sidecar exposes role-appropriate tools
// 3. System prompt reinforces the role boundaries

const session = await client.createSession('support-agent', {
  mcpServers: {
    'app-tools': {
      url: `http://gateway:8000/mcp?userId=${user.id}&role=${user.role}`,
    },
  },
  systemPrompt: `You are a ${user.role} support agent for ${user.orgName}. ${roleInstructions[user.role]}`,
});
```

The key insight is that **authorization enforcement happens in your application code** (gateway + MCP server), not inside the sandbox. The sandbox is an isolation boundary that prevents the agent from bypassing your authorization checks — the agent can only use the tools and data you explicitly provide through MCP.

## API Key Management

### Creating API Keys Programmatically

For multi-tenant deployments, API keys are stored in the database's `api_keys` table. Each key is associated with a `tenant_id`.

```bash
# Create a tenant-scoped API key via the REST API
curl -X POST http://localhost:4100/api/keys \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tenantId": "tenant_abc123"}'
```

### Key Rotation

To rotate an API key:

1. Create a new key for the same tenant
2. Update your application to use the new key
3. Delete the old key

```typescript
// Create new key
const newKey = await adminClient.createApiKey('tenant_abc123');

// Update application config to use newKey.key
// ...

// Delete old key (after confirming new key works)
await adminClient.deleteApiKey(oldKeyId);
```

## Security Checklist

- [ ] Use separate API keys per tenant (not a shared key)
- [ ] Implement authorization in your MCP server, not in system prompts alone (LLMs can be prompt-injected)
- [ ] Use the MCP sidecar pattern so tools run in your trusted application, not in the sandbox
- [ ] Set `ASH_INTERNAL_SECRET` for multi-machine deployments to protect internal runner endpoints
- [ ] Never pass host secrets to the sandbox — use MCP tools to proxy access to external services
- [ ] Monitor the `/metrics` endpoint for unusual session creation patterns
