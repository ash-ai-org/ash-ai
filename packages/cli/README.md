# @ash-ai/cli

CLI for deploying and managing [Ash](https://github.com/ash-ai-org/ash-ai) AI agents.

## Installation

```bash
npm install -g @ash-ai/cli
```

## Usage

```bash
# Start the Ash server
ash start

# Deploy an agent from a folder
ash deploy ./my-agent --name my-agent

# Create a session and send messages
ash session create my-agent
ash session send <SESSION_ID> "Hello!"

# List agents and sessions
ash agent list
ash session list
```

## What is an agent?

An agent is a folder. The only required file is `CLAUDE.md`:

```
my-agent/
├── CLAUDE.md              # System prompt (required)
├── .claude/
│   └── settings.json      # Permissions
└── .mcp.json              # MCP server connections
```

## Documentation

See the [Ash README](https://github.com/ash-ai-org/ash-ai) for full documentation.

## License

[MIT](https://github.com/ash-ai-org/ash-ai/blob/main/LICENSE)
