---
slug: /
sidebar_position: 1
title: Introduction
---

# Ash

**Deploy Claude agents as production APIs -- with sessions, streaming, sandboxing, and persistence handled for you.**

Ash is an open-source CLI, SDK, and self-hostable system for deploying and orchestrating hosted AI agents. You define an agent as a folder, deploy it to a server, and get a full REST API with SSE streaming -- no infrastructure code required.

## The Problem

The Claude Agent SDK handles the AI. But production agents need infrastructure, and without Ash, you build all of it yourself:

| What you need | Without Ash |
|---|---|
| **Session persistence** | Build session lifecycle, state serialization, crash recovery from scratch |
| **Real-time streaming** | SSE with backpressure, reconnection, typed events, error boundaries |
| **Sandboxed execution** | Process isolation, resource limits, environment allowlists, pool management |
| **Session resume** | Pause/resume across restarts, cold recovery, cross-machine handoff |
| **REST API** | Server, routing, OpenAPI spec, auth, CORS -- before your agent does anything useful |
| **Credential management** | API key auth, scoped permissions, secrets storage |

Each of these is a genuinely hard engineering problem. You should not have to solve them to ship an agent.

## What You Get

| Feature | Description |
|---------|-------------|
| **Session persistence** | Sessions, messages, and sandbox state stored in SQLite or Postgres. Swap with zero code changes. |
| **Real-time streaming** | SSE streaming with typed events -- text deltas, tool calls, errors, done signals. Backpressure built in. |
| **Sandbox isolation** | Each session runs in an isolated process. Restricted env, resource limits (cgroups), filesystem isolation (bubblewrap). |
| **Session pause/resume** | Pause a session, resume it minutes or days later -- even on a different machine. Workspace state persisted to S3/GCS. |
| **REST API + OpenAPI** | Full API with Swagger UI at `/docs`. Auth, CORS, typed endpoints -- production-ready out of the box. |
| **Sandbox pool** | DB-backed pool with capacity limits, LRU eviction, idle sweep. Sandboxes reused across messages. |
| **Multi-runner** | Scale horizontally. Add runner nodes, the coordinator routes sessions to the least-loaded one. |
| **TypeScript + Python SDKs** | First-class clients for both languages. `npm install @ash-ai/sdk` or `pip install ash-ai`. |

## Quick Look

```bash
# Install and start the server
npm install -g @ash-ai/cli
export ANTHROPIC_API_KEY=sk-ant-...
ash start

# Define an agent (it's just a folder with a CLAUDE.md)
mkdir my-agent
cat > my-agent/CLAUDE.md << 'EOF'
You are a helpful coding assistant. Be concise and accurate.
When asked to write code, include working examples.
EOF

# Deploy and chat
ash deploy ./my-agent --name my-agent
ash chat my-agent "Write a prime number checker in Python"
```

Your agent folder becomes a full production API:

```
Your agent folder          What you get back
---                        ---
my-agent/                  POST /api/sessions            -> create session
├── CLAUDE.md              POST /api/sessions/:id/messages -> stream messages (SSE)
├── .claude/               GET  /api/sessions/:id        -> session status
│   ├── settings.json      POST /api/sessions/:id/pause  -> pause session
│   └── skills/            POST /api/sessions/:id/resume -> resume session
└── .mcp.json              DELETE /api/sessions/:id      -> end session
```

## Next Step

Follow the [Quickstart](getting-started/quickstart.md) to deploy your first agent in under five minutes.
