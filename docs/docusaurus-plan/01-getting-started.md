# 01 - Getting Started Section

## Pages

### 1. Introduction (`/docs/`)

**Purpose:** Answer "What is Ash?" and "Why should I care?" in 30 seconds.

**Content:**
- One-liner: Ash is a CLI, SDK, and self-hostable system for deploying and orchestrating AI agents.
- "Vercel for AI agents" positioning
- What you get: REST API, SSE streaming, sandbox isolation, session persistence, multi-tenant auth
- How it works (3-step visual):
  1. Define agent (folder with CLAUDE.md)
  2. `ash deploy`
  3. Interact via API/SDK/CLI
- Link to Quickstart

**Source material:** `README.md`, `docs/getting-started.md`

**Gaps to fill:**
- Hero graphic or diagram showing the developer experience
- Comparison table: Ash vs. running Claude SDK directly (what Ash adds)

---

### 2. Installation (`/docs/getting-started/installation`)

**Purpose:** Get `ash` CLI installed and ready.

**Content:**
- Prerequisites: Node.js 22+, Docker, Anthropic API key
- Install CLI: `npm install -g @ash-ai/cli`
- Verify: `ash --version`
- Set API key: `export ANTHROPIC_API_KEY=...`
- Start server: `ash start`
- Verify server: `ash health`

**Source material:** `docs/getting-started.md`, `README.md`

**Gaps to fill:**
- Platform-specific notes (macOS vs Linux)
- Troubleshooting: Docker not running, port conflicts, API key not set

---

### 3. Quickstart (`/docs/getting-started/quickstart`)

**Purpose:** Deploy first agent and get a response in under 5 minutes.

**Content:**
- Step 1: Create agent folder with CLAUDE.md
  ```
  mkdir my-agent && echo "You are a helpful assistant." > my-agent/CLAUDE.md
  ```
- Step 2: Deploy
  ```
  ash deploy ./my-agent --name my-agent
  ```
- Step 3: Create session and send message
  ```
  ash session create my-agent
  ash session send <id> "Hello, what can you do?"
  ```
- Step 4: Show the response streaming in terminal
- What just happened (brief explanation of the flow)
- Next steps: links to Guides, API Reference, SDK docs

**Source material:** `docs/getting-started.md`, `README.md`

**Gaps to fill:**
- Screenshot or terminal recording of the experience
- "What just happened" section explaining agent -> sandbox -> bridge -> SDK flow at a high level

---

### 4. Key Concepts (`/docs/getting-started/concepts`)

**Purpose:** Define the 5 core concepts a user needs to understand.

**Content:**

| Concept | What it is | Analogy |
|---------|-----------|---------|
| **Agent** | A folder containing a CLAUDE.md system prompt and optional config. Defines what the AI does. | Like a Dockerfile — a blueprint. |
| **Session** | A stateful conversation with a deployed agent. Has a lifecycle (active, paused, ended). | Like an SSH session — persistent, resumable. |
| **Sandbox** | An isolated process where the agent runs. Restricted env, resource limits. | Like a container — isolated from host. |
| **Bridge** | The process inside the sandbox that talks to Claude's SDK. | Like an adapter — translates between Ash protocol and SDK. |
| **Server** | The control plane that routes requests, manages sandboxes, persists state. | Like a reverse proxy — handles orchestration. |

- Lifecycle diagram: Agent -> Deploy -> Session -> Sandbox -> Bridge -> Claude SDK
- Link to Architecture section for deeper dive

**Source material:** `docs/architecture.md`, `CLAUDE.md`

**Gaps to fill:**
- Clean lifecycle diagram
- Relationship diagram showing how concepts connect
