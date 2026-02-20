# 05 - CLI Reference Section

## Approach

One page per command group. Each page shows usage, flags, examples, and output.

## Pages

### 1. Overview (`/docs/cli/overview`)

**Content:**
- Install: `npm install -g @ash-ai/cli`
- Global flags: `--server-url`, `--api-key`
- Environment variables: `ASH_SERVER_URL`, `ASH_API_KEY`
- Help: `ash --help`, `ash <command> --help`

---

### 2. Server Lifecycle (`/docs/cli/lifecycle`)

**Commands:**

```
ash start [--port PORT] [--api-key KEY]
```
Start Ash server in Docker. Pulls image if needed, creates persistent volume at `~/.ash`.

```
ash stop
```
Stop the running Ash server container.

```
ash status
```
Check if server is running. Shows container status, port, uptime.

```
ash logs [--follow] [--tail N]
```
Show server logs. `--follow` for live streaming.

**Source:** `packages/cli/src/docker.ts`, `docs/cli-reference.md`

---

### 3. Agent Commands (`/docs/cli/agents`)

**Commands:**

```
ash deploy <path> --name <name>
```
Deploy an agent from a local folder. Folder must contain `CLAUDE.md`.

```
ash agent list
```
List all deployed agents.

```
ash agent get <name>
```
Get details for a specific agent.

```
ash agent delete <name>
```
Remove a deployed agent.

**Examples:**
```bash
# Deploy a minimal agent
mkdir my-agent
echo "You are a code reviewer." > my-agent/CLAUDE.md
ash deploy ./my-agent --name code-reviewer

# List agents
ash agent list
# NAME            DEPLOYED
# code-reviewer   2 minutes ago
```

**Source:** `packages/cli/src/commands/`, `docs/cli-reference.md`

---

### 4. Session Commands (`/docs/cli/sessions`)

**Commands:**

```
ash session create <agent>
```
Create a new session for the specified agent. Returns session ID.

```
ash session list [--agent <name>]
```
List all sessions, optionally filtered by agent.

```
ash session get <id>
```
Get session details (status, agent, timestamps).

```
ash session send <id> <message>
```
Send a message and stream the response to stdout.

```
ash session pause <id>
```
Pause a session, persisting workspace state.

```
ash session resume <id>
```
Resume a paused session.

```
ash session end <id>
```
End a session permanently.

**Examples:**
```bash
# Full lifecycle
SESSION=$(ash session create code-reviewer)
ash session send $SESSION "Review this function for bugs: ..."
ash session pause $SESSION
# ... later ...
ash session resume $SESSION
ash session send $SESSION "What about error handling?"
ash session end $SESSION
```

**Source:** `packages/cli/src/commands/`, `docs/cli-reference.md`

---

### 5. Health (`/docs/cli/health`)

**Commands:**

```
ash health
```
Check server health. Shows status, mode, pool statistics.

**Source:** `packages/cli/src/commands/`, `docs/cli-reference.md`

---

## Auto-Generation Opportunity

CLI help text could be auto-generated from Commander.js definitions in `packages/cli/`. A build script could:
1. Run `ash <command> --help` for each command
2. Parse output into markdown
3. Inject into Docusaurus pages

This keeps docs in sync with code. Worth doing if CLI changes frequently.
