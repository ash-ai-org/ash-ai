# Getting Started

This guide walks you through installing Ash, deploying your first agent, and chatting with it.

## Prerequisites

- Node.js >= 20
- Docker
- An `ANTHROPIC_API_KEY` ([get one here](https://console.anthropic.com/))

## 1. Install the CLI

```bash
npm install -g @ash-ai/cli
```

Verify it works:

```bash
ash --help
```

## 2. Start the Server

```bash
export ANTHROPIC_API_KEY=sk-...
ash start
```

This pulls the Ash Docker image, starts the container, and waits for the server to be healthy:

```
Pulling ghcr.io/ash-ai/ash:latest...
Starting Ash server...
Waiting for server to be ready...
Ash server is running.
  URL:      http://localhost:4100
  Data dir: ~/.ash
```

Check that it's running:

```bash
ash status
```

### Options

| Flag | Description |
|------|-------------|
| `--port 5000` | Use a different port (default: 4100) |
| `--database-url "postgresql://..."` | Use Postgres/CockroachDB instead of SQLite |
| `--env KEY=VALUE` | Pass extra environment variables to the container |

## 3. Define an Agent

An agent is a folder with a `CLAUDE.md` file:

```
my-agent/
└── CLAUDE.md
```

The `CLAUDE.md` is the system prompt. Example:

```markdown
# My Agent

You are a helpful coding assistant. Answer questions about JavaScript and TypeScript.
Keep answers concise.
```

That's it. `CLAUDE.md` is the only required file.

## 4. Deploy the Agent

```bash
ash deploy ./my-agent --name my-agent
```

Verify it's registered:

```bash
ash agent list
```

## 5. Chat with Your Agent

### Option A: CLI

```bash
# Create a session
ash session create my-agent
# → Session created: {"id": "abc123...", "status": "active"}

# Send a message (replace SESSION_ID with the actual id)
ash session send SESSION_ID "What is a closure?"

# End the session when done
ash session end SESSION_ID
```

### Option B: TypeScript SDK

```bash
npm install @ash-ai/sdk
```

```typescript
import { AshClient } from '@ash-ai/sdk';

const client = new AshClient({ serverUrl: 'http://localhost:4100' });

// Create a session
const session = await client.createSession('my-agent');

// Send a message and stream the response
for await (const event of client.sendMessageStream(session.id, 'What is a closure?')) {
  if (event.type === 'message') {
    console.log(event.data);
  }
}

// Clean up
await client.endSession(session.id);
```

### Option C: Python SDK

```bash
pip install ash-ai
```

```python
from ash_ai import AshClient

client = AshClient(server_url="http://localhost:4100")

session = client.create_session("my-agent")

for event in client.send_message_stream(session.id, "What is a closure?"):
    if event.type == "message":
        print(event.data)

client.end_session(session.id)
```

### Option D: curl

```bash
# Create session
curl -s -X POST http://localhost:4100/api/sessions \
  -H 'Content-Type: application/json' \
  -d '{"agent":"my-agent"}'

# Send message (streams SSE)
curl -N -X POST http://localhost:4100/api/sessions/SESSION_ID/messages \
  -H 'Content-Type: application/json' \
  -d '{"content":"What is a closure?"}'

# End session
curl -s -X DELETE http://localhost:4100/api/sessions/SESSION_ID
```

## 6. Logs and Debugging

```bash
ash logs       # View server logs
ash logs -f    # Follow logs in real-time
```

## 7. Stop the Server

```bash
ash stop
```

## Production Deployment

By default Ash uses SQLite, which is fine for local development and single-machine
deployments. For production, use PostgreSQL or CockroachDB.

### Option A: Managed CockroachDB

1. Create a CockroachDB Serverless cluster at [cockroachlabs.cloud](https://cockroachlabs.cloud) (free tier available)
2. Create the `ash` database:
   ```bash
   cockroach sql --url "postgresql://..." -e "CREATE DATABASE ash"
   ```
3. Start Ash with the connection URL:
   ```bash
   ash start --database-url "postgresql://user:pass@host:26257/ash?sslmode=verify-full"
   ```

### Option B: Docker Compose (CockroachDB + Ash)

```bash
curl -O https://raw.githubusercontent.com/ash-ai/ash/main/docker-compose.prod.yml
export ANTHROPIC_API_KEY=sk-...
docker compose -f docker-compose.prod.yml up -d
```

### Option C: Bring Your Own Postgres

Any Postgres-compatible database works:

```bash
ash start --database-url "postgresql://localhost:5432/ash"
```

Ash auto-creates its tables on first startup. No migrations needed.

## Next Steps

- [Connecting to a Server](guides/connecting.md) — use the SDK, CLI, Python, or curl against any Ash server
- [CLI Reference](cli-reference.md) — all commands and flags
- [API Reference](api-reference.md) — REST endpoints, SSE format, SDK types
- [Architecture](architecture.md) — how the pieces fit together
- [Deploy to EC2](guides/ec2-deployment.md) — run your own server on AWS
- [Deploy to GCE](guides/gce-deployment.md) — run your own server on GCP
