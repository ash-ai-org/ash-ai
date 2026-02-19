# @ash-ai/server

The [Ash](https://github.com/ash-ai-org/ash-ai) agent orchestration server — Fastify REST API with SSE streaming, session management, agent registry, and sandbox orchestration.

## Installation

```bash
npm install @ash-ai/server
```

## What's included

- **REST API** — create sessions, send messages, manage agents
- **SSE streaming** — real-time message streaming with backpressure
- **Session management** — lifecycle, persistence (SQLite/Postgres), pause/resume
- **Agent registry** — deploy agent folders, manage configurations
- **Sandbox orchestration** — pool management, routing, resource limits

## Quick start

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npx @ash-ai/server
```

The server starts on port 4100 with Swagger UI at `/docs`.

## Documentation

See the [Ash README](https://github.com/ash-ai-org/ash-ai) for full documentation.

## License

[MIT](https://github.com/ash-ai-org/ash-ai/blob/main/LICENSE)
