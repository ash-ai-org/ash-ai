# Cloud Chat

Chat with AI agents hosted on the [Ash Cloud Platform](https://ash-cloud-platform.vercel.app/).

Unlike the other examples (qa-bot, hosted-agent) which connect to a self-hosted Ash instance, this example connects to the cloud platform where agents are configured through the dashboard.

## Prerequisites

1. Sign up at [ash-cloud-platform.vercel.app](https://ash-cloud-platform.vercel.app/)
2. Create at least one agent in the dashboard
3. Create an API key in **Settings > API Keys** with scopes:
   - `agents:read` — list available agents
   - `sessions:write` — create sessions and send messages

## Setup

```bash
cd examples/cloud-chat
cp .env.example .env.local

# Edit .env.local with your API key
```

## Run

```bash
npm install
npm run dev
# Open http://localhost:3200
```

## How it works

```
Browser  ──HTTP──>  Next.js API routes  ──HTTP──>  Ash Cloud Platform
                    (keeps API key                  (manages agents,
                     server-side)                    sandboxes, streaming)
```

1. **Agent picker** — fetches available agents from `GET /api/agents`
2. **Session creation** — `POST /api/sessions` with `{ agentSlug }` (cloud platform field name)
3. **Message streaming** — `POST /api/sessions/:id/messages` returns SSE with granular events:
   - `text_delta` — incremental text tokens
   - `thinking_delta` — model thinking (extended thinking)
   - `tool_start` / `tool_end` — tool usage
   - `turn_complete` — response finished
   - `error` — something went wrong

## Key difference from self-hosted examples

| | Self-hosted (qa-bot) | Cloud (this example) |
|---|---|---|
| Agent setup | `deployAgent()` from local folder | Pre-configured in dashboard |
| Session creation body | `{ agent: "name" }` | `{ agentSlug: "slug" }` |
| SDK dependency | `@ash-ai/sdk` | Raw `fetch` (standalone) |
| Server URL | `http://localhost:4100` | `https://ash-cloud-platform.vercel.app` |
| API key source | `ash start` auto-generates | Dashboard > Settings > API Keys |
