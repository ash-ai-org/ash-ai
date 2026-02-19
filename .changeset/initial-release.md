---
"@ash-ai/shared": patch
"@ash-ai/sandbox": patch
"@ash-ai/bridge": patch
"@ash-ai/server": patch
"@ash-ai/runner": patch
"@ash-ai/cli": patch
"@ash-ai/sdk": patch
---

Initial public release of Ash — a self-hostable platform for deploying and orchestrating hosted AI agents.

- `@ash-ai/server` — Fastify REST API + SSE streaming server for session routing, agent registry, and sandbox orchestration
- `@ash-ai/cli` — CLI for deploying agents, managing sessions, and controlling Ash servers
- `@ash-ai/sdk` — TypeScript client SDK for programmatic interaction with Ash servers
- `@ash-ai/sandbox` — Sandbox management: process isolation, pooling, bridge client, resource limits, and state persistence
- `@ash-ai/bridge` — Bridge process that runs inside each sandbox and connects to the Claude Agent SDK
- `@ash-ai/runner` — Worker node for multi-machine deployments, manages sandboxes on remote hosts
- `@ash-ai/shared` — Shared types, protocol definitions, and constants
