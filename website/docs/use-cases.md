---
sidebar_position: 4
title: Use Cases
---

# Use Cases

Ash is a general-purpose platform for deploying AI agents. Here are common patterns for what you can build.

## Customer Support Agent

Deploy an agent that handles support tickets, looks up account data via MCP tools, and follows your company's support playbook.

```
support-agent/
  CLAUDE.md                  # Support playbook and escalation rules
  .mcp.json                  # Connect to CRM, knowledge base
  .claude/
    settings.json            # Allow: WebFetch, mcp__crm__*, mcp__kb__*
    skills/
      lookup-account.md      # /lookup-account workflow
      process-refund.md      # /process-refund workflow
```

**Why Ash:** Each support conversation is a persistent session. If the customer comes back later, resume the session with full context. The agent runs in an isolated sandbox, so it can't access other customers' data. MCP servers connect the agent to your CRM and knowledge base without exposing raw database access.

## Code Review Bot

Build a bot that reviews pull requests, clones repos into sandboxes, runs tests, and posts structured feedback.

```typescript
// Triggered by GitHub webhook
const session = await client.createSession('code-reviewer');

for await (const event of client.sendMessageStream(
  session.id,
  `Review this PR:\n${prDiff}\n\nClone the repo and run tests.`,
)) {
  // Stream review results back to your webhook handler
}

// Post the review to GitHub, then clean up
await client.endSession(session.id);
```

**Why Ash:** Sandbox isolation means the agent can clone repos and run `npm test` without affecting your host. Each review gets its own sandbox with its own filesystem. Streaming lets you show review progress in real time.

## Research Assistant with Memory

Deploy an agent that searches the web, synthesizes findings, and remembers context across sessions using an MCP memory server.

```
research-agent/
  CLAUDE.md                  # Research methodology and output format
  .mcp.json                  # fetch + memory MCP servers
  .claude/
    settings.json            # Allow: WebFetch, mcp__fetch__*, mcp__memory__*
    skills/
      search-and-summarize/
        SKILL.md             # /search-and-summarize workflow
      write-memo/
        SKILL.md             # /write-memo workflow
```

**Why Ash:** Sessions persist across restarts. Pause a research session, come back days later, and resume where you left off. The memory MCP server stores facts persistently inside the sandbox workspace, building knowledge over time.

## Multi-Tenant SaaS Integration

Build a SaaS feature where each of your customers gets their own AI assistant, with tenant-specific tools injected via per-session MCP servers.

```typescript
// For each customer request, inject their specific MCP tools
const session = await client.createSession('assistant', {
  mcpServers: {
    'customer-api': {
      command: 'npx',
      args: ['-y', '@your-org/customer-mcp', '--tenant', customerId],
      env: {
        CUSTOMER_TOKEN: customerToken,
      },
    },
  },
});
```

**Why Ash:** Per-session MCP servers let you inject tenant-specific tools at runtime without redeploying the agent. Each customer's session runs in its own sandbox with its own environment, so credentials never cross boundaries.

## Data Processing Pipeline

Run agents that ingest data, execute analysis in sandboxed environments, and stream results back to your application.

```typescript
const session = await client.createSession('data-analyst');

// Upload a CSV to the sandbox
await client.uploadFile(session.id, '/workspace/data.csv', csvBuffer);

// Ask the agent to analyze it
for await (const event of client.sendMessageStream(
  session.id,
  'Analyze data.csv. Calculate summary statistics, identify outliers, and produce a report.',
)) {
  if (event.type === 'message') {
    const text = extractTextFromEvent(event.data);
    if (text) process.stdout.write(text);
  }
}

// Download the generated report
const report = await client.downloadFile(session.id, '/workspace/report.md');
```

**Why Ash:** The agent can install Python packages, write scripts, and execute code inside the sandbox without affecting your host system. File upload/download APIs let you pass data in and pull results out. Streaming shows progress as the analysis runs.

## Background Automation Agent

Deploy a long-running agent that monitors systems, runs periodic checks, and takes action when needed.

```
monitor-agent/
  CLAUDE.md                  # Monitoring procedures and alert rules
  .claude/
    settings.json            # Allow: Bash(*), WebFetch, mcp__slack__*
  .mcp.json                  # Slack MCP server for alerts
```

```typescript
// Create a long-lived session
const session = await client.createSession('monitor-agent');

// Send periodic check instructions
setInterval(async () => {
  for await (const event of client.sendMessageStream(
    session.id,
    'Run your health checks and report any issues to Slack.',
  )) {
    // Log results
  }
}, 5 * 60 * 1000); // Every 5 minutes
```

**Why Ash:** The session persists indefinitely. The agent builds context over time -- it knows what it checked last, what's normal, and what's changed. Pause the session during maintenance windows and resume after.

## Patterns to Notice

Across all use cases, a few patterns repeat:

1. **Agent as folder** -- Define behavior in `CLAUDE.md`, not code. Change the prompt, redeploy, done.
2. **Session persistence** -- Long-lived, resumable conversations are the default, not a special case.
3. **Sandbox isolation** -- Agents run untrusted code safely. Clone repos, run scripts, install packages.
4. **MCP servers** -- Connect agents to your systems (CRM, databases, APIs) through a standard protocol.
5. **Streaming** -- Real-time responses via SSE. Show progress, not just final answers.

## Next Steps

- **[Quickstart](/getting-started/quickstart)** -- Deploy your first agent
- **[Defining an Agent](/guides/defining-an-agent)** -- Full guide to agent structure
- **[Managing Sessions](/guides/managing-sessions)** -- Session lifecycle and persistence
- **[Streaming Responses](/guides/streaming-responses)** -- SSE events and SDK helpers
