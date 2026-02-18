# Ash

Deploy and orchestrate hosted AI agents. Define an agent as a folder with a `CLAUDE.md`, deploy it to a server, and interact via REST API with streaming responses.

## Quick Start

```bash
# Install the CLI
npm install -g @ash-ai/cli

# Set your API key
export ANTHROPIC_API_KEY=sk-...

# Start the server (runs in Docker)
ash start

# Define an agent
mkdir my-agent
echo "You are a helpful assistant. Be concise." > my-agent/CLAUDE.md

# Deploy it
ash deploy ./my-agent --name my-agent

# Chat with it
ash session create my-agent
ash session send SESSION_ID "What is a closure in JavaScript?"

# Clean up
ash session end SESSION_ID
ash stop
```

## How It Works

1. **Define agents** as folders with a `CLAUDE.md` file (the system prompt)
2. **Deploy them** to the Ash server with `ash deploy`
3. **Create sessions** — each session spawns an isolated sandbox process
4. **Send messages** — responses stream back via SSE, token by token

## Install

```bash
npm install -g @ash-ai/cli
```

Requires Node.js >= 20 and Docker.

## Using the SDK

```bash
npm install @ash-ai/sdk
```

```typescript
import { AshClient } from '@ash-ai/sdk';

const client = new AshClient({ serverUrl: 'http://localhost:4100' });

const session = await client.createSession('my-agent');
for await (const event of client.sendMessageStream(session.id, 'Hello!')) {
  if (event.type === 'message') {
    console.log(event.data);
  }
}
await client.endSession(session.id);
```

## Documentation

| Doc | Description |
|-----|-------------|
| [Getting Started](docs/getting-started.md) | Full walkthrough: install, deploy, chat |
| [CLI Reference](docs/cli-reference.md) | All commands and flags |
| [API Reference](docs/api-reference.md) | REST endpoints, SSE format, error shapes |
| [Architecture](docs/architecture.md) | System design and internals |

See [docs/INDEX.md](docs/INDEX.md) for the complete documentation index.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, building from source, and running tests.

## License

MIT
