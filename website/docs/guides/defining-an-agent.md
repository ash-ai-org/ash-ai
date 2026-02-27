---
sidebar_position: 1
title: Defining an Agent
---

# Defining an Agent

An agent in Ash is a folder on disk. At minimum, it contains a single file: `CLAUDE.md`. This file defines the agent's identity, capabilities, and behavior. Ash reads this folder when you deploy, copies it into a sandbox, and uses it as the system prompt for every session.

## Minimal Agent

The simplest possible agent is a directory with one file:

```
my-agent/
  CLAUDE.md
```

The `CLAUDE.md` is the only required file. It contains the instructions the agent follows during every conversation.

```markdown title="my-agent/CLAUDE.md"
# Customer Support Agent

You are a customer support agent for Acme Corp. You help users troubleshoot
product issues, process returns, and answer billing questions.

## Behavior

- Be polite and professional
- Ask clarifying questions before making assumptions
- If you cannot resolve an issue, escalate by telling the user to email support@acme.com
```

Deploy it:

```bash
ash deploy ./my-agent --name customer-support
```

That is a working agent. It will respond to messages using the instructions in `CLAUDE.md`.

## Production Agent

A production agent adds configuration for permissions, MCP servers, and skills:

```
research-assistant/
  CLAUDE.md
  .claude/
    settings.json
    skills/
      search-and-summarize.md
      analyze-code.md
  .mcp.json
```

### CLAUDE.md

The system prompt defines identity, capabilities, and behavior rules:

```markdown title="research-assistant/CLAUDE.md"
# Research Assistant Agent

You are a research assistant powered by Ash. You help users research topics,
analyze code, and produce structured reports.

## Capabilities

You have access to:
- **Web fetching** via the `fetch` MCP server
- **Persistent memory** via the `memory` MCP server
- **Skills** -- invoke /search-and-summarize or /analyze-code for structured workflows

## Behavior

- Use your tools to find accurate information before answering
- Store important facts in memory so you can recall them later
- Be concise but thorough -- cite sources when you fetch web content

## Identity

When asked about yourself, say you are the Research Assistant powered by Ash.
```

### .claude/settings.json

Controls which tools the agent is allowed to use without asking for confirmation, and optionally sets the default model. This maps directly to the Claude Code SDK's permission system.

```json title="research-assistant/.claude/settings.json"
{
  "model": "claude-sonnet-4-5-20250929",
  "permissions": {
    "allow": [
      "Bash(npm install:*)",
      "Bash(node:*)",
      "Read",
      "Write",
      "Glob",
      "Grep",
      "WebFetch",
      "mcp__fetch__*",
      "mcp__memory__*"
    ]
  }
}
```

The `model` field sets the default model for the agent. This is the model the SDK uses unless overridden at the API level (see [Model Precedence](#model-precedence) below).

The `allow` list uses glob patterns. Each entry permits the agent to use that tool without human approval. Tools not listed will be blocked or require approval depending on the session's permission mode.

Common patterns:

| Pattern | Allows |
|---------|--------|
| `Read` | Reading any file |
| `Write` | Writing any file |
| `Bash(node:*)` | Running any command starting with `node` |
| `Bash(npm install:*)` | Running npm install commands |
| `mcp__fetch__*` | All tools from the `fetch` MCP server |
| `WebFetch` | The built-in web fetch tool |

### .mcp.json

Configures MCP (Model Context Protocol) servers available to the agent. Each server provides additional tools the agent can call.

```json title="research-assistant/.mcp.json"
{
  "mcpServers": {
    "fetch": {
      "command": "npx",
      "args": ["-y", "@anthropic-ai/mcp-fetch"]
    },
    "memory": {
      "command": "npx",
      "args": ["-y", "@anthropic-ai/mcp-memory"],
      "env": {
        "MEMORY_FILE": "./memory.json"
      }
    }
  }
}
```

MCP servers run as child processes inside the sandbox. The `env` field sets environment variables specific to that server. Paths are relative to the agent's workspace directory.

:::tip Per-Session MCP Servers

You can also inject MCP servers at session creation time using the `mcpServers` field on `POST /api/sessions`. Session-level entries are merged into the agent's `.mcp.json` (session overrides agent on key conflict). This enables the **sidecar pattern** — your host app exposes tenant-specific tools as MCP endpoints. See [Per-Session MCP Servers](../api/sessions.md#per-session-mcp-servers) for details.

:::

### .claude/skills/

Skills are markdown files that define reusable workflows the agent can invoke. Each file becomes a slash command.

```markdown title="research-assistant/.claude/skills/search-and-summarize.md"
# /search-and-summarize

Search the web for a given topic and produce a structured summary.

## Steps

1. Use the fetch tool to search for the topic
2. Read the top 3-5 results
3. Synthesize a summary with key findings
4. List all sources with URLs at the bottom

## Output Format

Return a markdown document with sections: Overview, Key Findings, Sources.
```

The filename (minus `.md`) becomes the skill name. The agent can invoke it when a user references `/search-and-summarize` in a message.

## Folder Structure Reference

```
agent-name/
  CLAUDE.md                  # Required. Agent system prompt.
  .claude/
    settings.json            # Optional. Tool permissions + default model.
    skills/
      skill-name.md          # Optional. Reusable workflows.
  .mcp.json                  # Optional. MCP server configuration.
  package.json               # Optional. Dependencies installed at sandbox start.
  setup.sh                   # Optional. Runs once when sandbox initializes.
```

If a `package.json` is present, Ash runs `npm install` inside the sandbox when the session starts. If a `setup.sh` is present, it runs after dependency installation.

## What Happens at Deploy

When you run `ash deploy ./my-agent --name my-agent`:

1. Ash validates that the directory contains `CLAUDE.md`
2. The agent files are copied to `~/.ash/agents/my-agent/`
3. The agent is registered with the server (name, path, version)
4. If an agent with that name already exists, its version is incremented

The agent folder becomes the working directory for every session sandbox. Files the agent creates during a session are written to the sandbox workspace, not back to the agent definition.

## Model Precedence

The model used for a conversation is resolved with the following precedence (highest to lowest):

1. **Per-message model** — passed in the `model` field of `POST /api/sessions/:id/messages`
2. **Session-level model** — set when creating the session via `POST /api/sessions`
3. **Agent record model** — set on the agent via the API
4. **Agent settings file** — the `model` field in `.claude/settings.json`
5. **SDK default** — the Claude Code SDK's built-in default model

This means you can deploy an agent with a default model in `.claude/settings.json`, override it for specific sessions, and override it again for individual messages — all without redeploying the agent. When a new model comes out, you can start using it immediately by passing it at the session or message level.
