---
sidebar_position: 2
title: Deploying Agents
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Deploying Agents

Deploying an agent registers it with the Ash server so sessions can be created against it. The agent folder is copied to the server's data directory and validated.

## Deploy with the CLI

```bash
ash deploy ./path/to/agent --name my-agent
```

The `--name` flag sets the agent name. If omitted, the directory name is used.

### What happens during deploy

1. **Validation** -- Ash checks that the directory contains a `CLAUDE.md` file. If it does not, the deploy fails with an error.
2. **Copy** -- The agent files are copied to `~/.ash/agents/<name>/`. This ensures the server can access them even if the original directory moves.
3. **Registration** -- The server creates or updates the agent record in its database. Each deploy increments the agent's version number.

```
$ ash deploy ./research-assistant --name research-bot
Copied agent files to /Users/you/.ash/agents/research-bot
Deployed agent: {
  "id": "a1b2c3d4-...",
  "name": "research-bot",
  "version": 1,
  "path": "agents/research-bot",
  "createdAt": "2025-01-15T10:30:00.000Z",
  "updatedAt": "2025-01-15T10:30:00.000Z"
}
```

## Updating an Agent

Redeploy with the same name to update an agent. Ash overwrites the agent files and increments the version:

```bash
# Edit your agent's CLAUDE.md, then redeploy
ash deploy ./research-assistant --name research-bot
```

Existing sessions continue using the version they started with. New sessions pick up the updated agent.

## Listing Agents

<Tabs groupId="sdk-language">
<TabItem value="typescript" label="TypeScript">

```typescript
import { AshClient } from '@ash-ai/sdk';

const client = new AshClient({ serverUrl: 'http://localhost:4100' });
const agents = await client.listAgents();
console.log(agents);
```

</TabItem>
<TabItem value="python" label="Python">

```python
from ash_sdk import AshClient

client = AshClient("http://localhost:4100")
agents = client.list_agents()
print(agents)
```

</TabItem>
<TabItem value="cli" label="CLI">

```bash
ash agent list
```

</TabItem>
<TabItem value="curl" label="curl">

```bash
curl $ASH_SERVER_URL/api/agents
```

Response:

```json
{
  "agents": [
    {
      "id": "a1b2c3d4-...",
      "name": "research-bot",
      "version": 2,
      "path": "/data/agents/research-bot",
      "createdAt": "2025-01-15T10:30:00.000Z",
      "updatedAt": "2025-01-15T12:00:00.000Z"
    }
  ]
}
```

</TabItem>
</Tabs>

## Getting Agent Details

<Tabs groupId="sdk-language">
<TabItem value="typescript" label="TypeScript">

```typescript
const agent = await client.getAgent('research-bot');
```

</TabItem>
<TabItem value="python" label="Python">

```python
agent = client.get_agent("research-bot")
```

</TabItem>
<TabItem value="cli" label="CLI">

```bash
ash agent info research-bot
```

</TabItem>
<TabItem value="curl" label="curl">

```bash
curl $ASH_SERVER_URL/api/agents/research-bot
```

</TabItem>
</Tabs>

## Deleting an Agent

Deleting an agent removes its registration from the server. Existing sessions that were created from the agent continue to run, but no new sessions can be created.

<Tabs groupId="sdk-language">
<TabItem value="typescript" label="TypeScript">

```typescript
await client.deleteAgent('research-bot');
```

</TabItem>
<TabItem value="python" label="Python">

```python
client.delete_agent("research-bot")
```

</TabItem>
<TabItem value="cli" label="CLI">

```bash
ash agent delete research-bot
```

</TabItem>
<TabItem value="curl" label="curl">

```bash
curl -X DELETE $ASH_SERVER_URL/api/agents/research-bot
```

</TabItem>
</Tabs>

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/agents` | Deploy (create or update) an agent |
| `GET` | `/api/agents` | List all agents |
| `GET` | `/api/agents/:name` | Get agent details |
| `DELETE` | `/api/agents/:name` | Delete an agent |

### POST /api/agents

Request body:

```json
{
  "name": "research-bot",
  "path": "agents/research-bot"
}
```

The `path` field is resolved relative to the server's data directory. When deploying via the CLI, this is handled automatically.

Response (201):

```json
{
  "agent": {
    "id": "a1b2c3d4-...",
    "name": "research-bot",
    "version": 1,
    "path": "/data/agents/research-bot",
    "createdAt": "2025-01-15T10:30:00.000Z",
    "updatedAt": "2025-01-15T10:30:00.000Z"
  }
}
```

Error (400) -- missing CLAUDE.md:

```json
{
  "error": "Agent directory must contain CLAUDE.md",
  "statusCode": 400
}
```
