# Getting Started

This guide walks you through installing Ash, deploying your first agent, and chatting with it.

## Prerequisites

- Node.js >= 20
- Docker
- An `ANTHROPIC_API_KEY` ([get one here](https://console.anthropic.com/))

## 1. Install the CLI

```bash
# Option A: npm (requires Node.js >= 20)
npm install -g @ash-ai/cli

# Option B: one-liner installer (installs Node.js if needed)
curl -fsSL https://raw.githubusercontent.com/ash-ai-org/ash-ai/main/install.sh | bash
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

This pulls the Ash Docker image, starts the container, and waits for the server to be healthy. On first start, an API key is auto-generated:

```
Pulling ghcr.io/ash-ai/ash:latest...
Starting Ash server...
Waiting for server to be ready...

API key auto-generated and saved to ~/.ash/config.json
  Key: ash_7kX9mQ2pL...

Ash server is running.
  URL:      http://localhost:4100
  Data dir: ~/.ash
```

The key is saved automatically — all CLI commands will use it. On subsequent starts, the existing key is reused.

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
pip install ash-ai-sdk
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

### Option A: Docker Compose (Simplest)

The quickest way to self-host Ash on any server:

```bash
curl -O https://raw.githubusercontent.com/ash-ai-org/ash-ai/main/docker-compose.yml
export ANTHROPIC_API_KEY=sk-...
docker compose up -d
```

This starts Ash with SQLite (fine for single-machine deployments). Data persists in a Docker volume.

The server auto-generates an API key on first start. Check the server logs for the key, then connect your local CLI:

```bash
ash connect http://your-server:4100 --api-key ash_<key-from-server-logs>
ash deploy ./my-agent --name my-agent
```

### Option B: Managed CockroachDB

For production at scale, use PostgreSQL or CockroachDB instead of SQLite.

1. Create a CockroachDB Serverless cluster at [cockroachlabs.cloud](https://cockroachlabs.cloud) (free tier available)
2. Create the `ash` database:
   ```bash
   cockroach sql --url "postgresql://..." -e "CREATE DATABASE ash"
   ```
3. Start Ash with the connection URL:
   ```bash
   ash start --database-url "postgresql://user:pass@host:26257/ash?sslmode=verify-full"
   ```

### Option C: Docker Compose with CockroachDB

```bash
curl -O https://raw.githubusercontent.com/ash-ai-org/ash-ai/main/docker-compose.prod.yml
export ANTHROPIC_API_KEY=sk-...
docker compose -f docker-compose.prod.yml up -d
```

### Option D: Bring Your Own Postgres

Any Postgres-compatible database works:

```bash
ash start --database-url "postgresql://localhost:5432/ash"
```

Ash auto-creates its tables on first startup. No migrations needed.

### Option E: Kubernetes (Helm Chart)

Deploy Ash to any Kubernetes cluster with the official Helm chart. For K8s, you provide the API key explicitly (the auto-generation bootstrap file isn't accessible outside the container):

```bash
kubectl create secret generic ash-secrets \
  --from-literal=ANTHROPIC_API_KEY=sk-ant-... \
  --from-literal=ASH_API_KEY=$(openssl rand -hex 32)

helm install ash ./charts/ash \
  --set auth.existingSecret=ash-secrets
```

Then connect your CLI:

```bash
ash connect http://ash.your-cluster:4100 --api-key <the-key-you-generated>
```

See the full [Kubernetes Deployment Guide](guides/kubernetes-deployment.md) for production configuration, external database setup, and enterprise integration.

## Next Steps

- [Connecting to a Server](guides/connecting.md) — use the SDK, CLI, Python, or curl against any Ash server
- [CLI Reference](cli-reference.md) — all commands and flags
- [API Reference](api-reference.md) — REST endpoints, SSE format, SDK types
- [Architecture](architecture.md) — how the pieces fit together
- [Deploy to EC2](guides/ec2-deployment.md) — run your own server on AWS
- [Deploy to GCE](guides/gce-deployment.md) — run your own server on GCP
- [Deploy to Kubernetes](guides/kubernetes-deployment.md) — Helm chart for enterprise self-hosting
