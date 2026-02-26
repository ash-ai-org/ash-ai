---
sidebar_position: 1
title: CLI Overview
---

# CLI Overview

The `ash` CLI manages the Ash server lifecycle, deploys agents, and interacts with sessions from the terminal.

## Installation

```bash
npm install -g @ash-ai/cli
```

## Global Configuration

The CLI connects to an Ash server. Set the server URL via environment variable:

```bash
export ASH_SERVER_URL=http://localhost:4100   # default
```

The server always requires authentication. When you run `ash start`, the CLI automatically picks up the server's API key (auto-generated or explicit) and saves it to `~/.ash/config.json`. For remote servers, use `ash connect --api-key <key>` to save the key.

## Help

```bash
ash --help
```

```
Usage: ash [options] [command]

Agent orchestration CLI

Options:
  -V, --version   output the version number
  -h, --help      display help for command

Commands:
  start           Start the Ash server in a Docker container
  stop            Stop the Ash server container
  status          Show Ash server status
  logs            Show Ash server logs
  chat            Send a message to an agent (one-shot)
  deploy          Deploy an agent to the server
  session         Manage sessions
  agent           Manage agents
  health          Check server health
  help [command]  display help for command
```

## Command Groups

| Group | Description |
|-------|-------------|
| **Server Lifecycle** | `start`, `stop`, `status`, `logs` -- manage the Ash server Docker container |
| **Quick** | `chat` -- send a message to an agent, keep session alive for follow-ups (`--session <id>` to continue, `--end` to clean up) |
| **Agents** | `deploy`, `agent list`, `agent info`, `agent delete` -- deploy and manage agent definitions |
| **Sessions** | `session create`, `session send`, `session list`, `session pause`, `session resume`, `session end` -- interact with agent sessions |
| **Health** | `health` -- check server health and pool stats |
