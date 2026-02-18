# CLAUDE.md

## Terminology

In this codebase, "agent" refers to **Ash's deployed agents** — the AI agents that users deploy and orchestrate via Ash. It does NOT refer to you (the coding agent working on this repo). When this file says "the agent runs inside a sandbox," it means an Ash-deployed agent, not you.

## What Is Ash

Ash is a CLI, SDK, and self-hostable system for deploying and orchestrating hosted AI agents. Developers define agents as folders (CLAUDE.md + config), deploy them to a server, and interact via REST API + SSE streaming. Agents run inside isolated sandboxes.

## Deep-Dive Documentation

For detailed architecture, feature docs, design decisions, and the implementation plan, read `docs/INDEX.md`. It is the table of contents for all project documentation. Start there before exploring the codebase.

## Principles

These govern every decision. When in doubt, re-read these.

### 1. Make It Work, Then Make It Right, Then Make It Fast

Do not optimize what you haven't measured. Do not distribute what runs fine on one machine. Do not abstract what isn't repeated. The correct order is:

1. Get the feature working end-to-end (ugly is fine)
2. Make it correct (handle failures, survive restarts, isolate properly)
3. Measure it (instrument, benchmark, find the actual bottleneck)
4. Only then optimize (and verify the optimization with the same measurements)

If you skip to step 4 you will build something fast and wrong.

### 2. Delete Indirection Until It Hurts

Every layer of indirection — every proxy, every abstraction, every service boundary — has a cost: latency, failure modes, debugging difficulty. That cost must be justified by a concrete, present-tense need, not a hypothetical future one.

If the server and runner are on the same machine, they should be in the same process. If a function is called once, it doesn't need a class. If a pattern isn't repeated three times, it doesn't need a utility. Add the abstraction when the duplication is painful, not when it's theoretically possible.

### 3. Correctness Is Not a Feature, It's a Prerequisite

A system that loses state on restart is not a system — it's a demo. A sandbox that leaks host environment variables is not a sandbox — it's a liability. Correctness means:

- Sessions survive process restarts (persistent state)
- Sandboxes cannot read, write, or signal anything outside their boundaries
- Failure modes are explicit and recoverable, not silent and corrupting
- Every state transition is tested

Ship correct code that does less, not broken code that does more.

### 4. Measure Before and After

Never commit an optimization without before/after numbers. Never claim a feature works without a test that exercises it. The questions that matter:

- What is the p99 latency from message-in to first-token-out?
- What is Ash's overhead on top of the SDK itself?
- How many concurrent sessions before degradation?
- Where is time actually spent?

Numbers in `docs/` or it didn't happen.

### 5. The Test Is the Spec

If the behavior isn't tested, it isn't guaranteed. Tests encode what the system promises. When requirements change, change the test first, then change the code. Specifically:

- Test boundaries (protocol serialization, API contracts, state transitions)
- Test failure modes (crash mid-stream, disconnect, timeout, corrupt input)
- Test invariants (sandbox env never contains host secrets, ended session rejects messages)
- Don't test glue (trivial wrappers, type re-exports, config loading)

### 6. Security Is a Constraint, Not a Phase

Every sandbox process runs with a restricted environment from day one. Not "we'll add isolation later." The allowlist approach: sandbox env contains only explicitly permitted variables. Everything else is denied by default. The threat model is simple: the agent inside the sandbox is untrusted code running arbitrary shell commands. Design accordingly.

### 7. Ship Incrementally

Every change should be independently shippable and independently revertable. Don't batch six things into one PR. Don't leave the system in a half-migrated state. Each step in the plan stands alone — it improves something, it has tests, it doesn't require the next step to be useful.

### 8. Ash Is a Thin Wrapper — Use the SDK's Types

Ash orchestrates the Claude Code SDK (`@anthropic-ai/claude-code`). It does not reinvent it. The SDK already defines good types (`Message`, `AssistantMessage`, `ResultMessage`, `ToolUseBlock`, etc.), a streaming interface (`query()` / `Session`), and options (`Options`, `PermissionMode`, etc.). Ash should pass these through, not translate them.

Concretely:

- **Bridge events should be SDK messages.** The bridge process yields `Message` objects from the SDK. Send them over the Unix socket as-is (newline-delimited JSON). Don't invent `BridgeAssistantMessageEvent` / `BridgeToolUseEvent` when the SDK already has `AssistantMessage` / `ToolUseBlock`.
- **SSE events should be SDK messages.** The server's SSE stream to the client should carry `Message` objects (plus a thin envelope for `done`/`error`). Don't invent `SSEEventType` with custom names.
- **Options should be SDK options.** When the CLI or SDK creates a session, the options map to `@anthropic-ai/claude-code`'s `Options` type. Don't redefine `permissionMode`, `model`, etc. in custom types.
- **Add, don't translate.** Ash adds orchestration concerns: session routing, sandbox lifecycle, agent registry. Types for those things (Session, Agent, SandboxInfo, PoolStatus) are ours. Types for the conversation itself belong to the SDK.

The test: if you're writing a `switch` statement that converts SDK type A to Ash type B, you're doing it wrong. Just use type A.

## Project Structure

```
ash/
├── packages/
│   ├── shared/          # Types, protocol, constants (no dependencies)
│   ├── sandbox/         # Sandbox management library: SandboxManager, SandboxPool,
│   │                    #   BridgeClient, resource limits, state persistence
│   │                    #   Used by both server and runner — NOT a standalone process
│   ├── bridge/          # Runs inside each sandbox, talks to Claude Agent SDK
│   ├── server/          # Control plane: REST API, agent registry, session routing, SQLite
│   ├── runner/          # Worker node for multi-machine split (step 08)
│   │                    #   Manages sandboxes on a remote host, registers with server
│   ├── cli/             # ash CLI tool (deploy, session, start/stop, agent commands)
│   ├── sdk/             # @ash-ai/sdk TypeScript client
│   └── sdk-python/      # Python SDK (auto-generated from OpenAPI)
├── docs/
│   └── jeff-dean-plan/  # Architecture docs and implementation plan
│       └── testing/     # Testing strategy and test specs
├── examples/
│   ├── qa-bot/          # Next.js QA bot example
│   ├── hosted-agent/    # Example agent definition
│   └── python-bot/      # Python SDK example
├── package.json         # Root workspace config
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Commands

```bash
pnpm install             # Install all dependencies
pnpm build               # Build all packages
pnpm test                # Run unit tests
pnpm test:integration    # Run integration tests (starts real processes)
pnpm test:isolation      # Run sandbox isolation tests (requires bwrap on Linux)
pnpm bench               # Run performance benchmarks

# Development
pnpm --filter '@ash-ai/server' dev    # Start server with tsx

# Specific package
pnpm --filter '@ash-ai/shared' build
pnpm --filter '@ash-ai/server' test
```

## Architecture

```
CLI/SDK  ──HTTP──>  ash-server (port 4100)  ──in-process──>  SandboxPool ──> SandboxManager  ──unix socket──>  Bridge  ──>  Claude Agent SDK
                    (Fastify REST + SSE)                     (@ash-ai/sandbox)                                 (in sandbox)
```

The server is the single entry point. Sandbox management (`SandboxManager`, `SandboxPool`, `BridgeClient`, resource limits, state persistence) lives in the `@ash-ai/sandbox` package — a shared library used by both the server and the runner. The only process boundary that matters is the sandbox boundary: the bridge runs in an isolated child process, communicating over a Unix socket using newline-delimited JSON.

## Documentation Requirements

**This is mandatory. Code without documentation is unfinished work.**

### When You Implement Something, Document It

Every significant change must be accompanied by documentation in the `docs/` directory. This is not optional. The documentation is part of the deliverable.

#### What to document

1. **Design decisions** — When you choose approach A over approach B, write down why. Put it in a markdown file in `docs/decisions/` with the format `NNNN-short-title.md`. Future you will not remember why you chose connection pooling over per-request sockets. Example:

   ```
   docs/decisions/
   ├── 0001-unix-socket-over-http-for-bridge.md
   ├── 0002-sqlite-over-postgres.md
   └── 0003-bwrap-over-docker-for-sandboxes.md
   ```

2. **Architecture and features** — When you build a feature, document how it works in `docs/features/`. Not API docs (those come from the code). How the pieces connect. What the failure modes are. What's not implemented yet. Example:

   ```
   docs/features/
   ├── agent-deployment.md       # How agents get from folder to running sandbox
   ├── session-lifecycle.md      # State machine: creating → active → paused → ended
   ├── bridge-protocol.md        # Wire format, message types, flow control
   └── sandbox-isolation.md      # What's isolated, what's not, how to verify
   ```

3. **Runbooks** — When something can go wrong, write down how to diagnose and fix it in `docs/runbooks/`. Example:

   ```
   docs/runbooks/
   ├── orphaned-sandboxes.md     # How to find and clean up sandbox processes
   ├── bridge-connect-failure.md # What to check when bridge won't start
   └── session-state-recovery.md # How to recover after a server crash
   ```

4. **Performance baselines** — When you measure something, record the numbers in `docs/benchmarks/`. Include the date, the hardware, and the exact command. Example:

   ```
   docs/benchmarks/
   └── 2025-01-15-message-overhead.md
       # Machine: M2 MacBook Pro, 16GB RAM
       # Command: tsx test/bench/message-overhead.ts
       # Results: p50=1.8ms, p95=3.2ms, p99=7.1ms
   ```

#### Format

Every doc should have:
- A title that says what it is
- A date or version reference
- The "what" (what does this thing do)
- The "why" (why this approach and not another)
- The "how" (enough detail to understand without reading every line of code)
- Known limitations or open questions

Keep it short. One page is better than five. A diagram is better than three paragraphs. Code snippets are better than prose descriptions of code.

#### When to update docs

- When you change behavior that's documented, update the doc in the same PR
- When you discover the doc is wrong, fix it immediately
- When you answer the same question twice, write a doc so you don't answer it a third time

### Doc Index

Maintain `docs/INDEX.md` as a table of contents. If a doc isn't in the index, it might as well not exist.

## Current Plan

The implementation plan is at `docs/jeff-dean-plan/00-overview.md`. It has 8 steps, done in order:

1. Consolidate server + runner into one process
2. Replace in-memory Maps with SQLite
3. Fix bridge connect race condition
4. Add resource limits (cgroups/ulimit)
4b. Actually isolate sandboxes (bwrap, env, network)
5. Add backpressure to SSE streams
6. Instrument the hot path
7. Implement session resume
8. Re-split to multi-machine when needed

The testing strategy is at `docs/jeff-dean-plan/testing/00-strategy.md`.

## Key Technical Details

- **Monorepo**: pnpm workspaces, TypeScript with NodeNext modules
- **HTTP framework**: Fastify
- **Sandbox isolation**: bubblewrap (bwrap) on Linux, restricted env on macOS
- **Host-sandbox communication**: Unix socket, newline-delimited JSON
- **Client-server streaming**: Server-Sent Events (SSE)
- **State persistence**: SQLite with WAL mode (after step 02)
- **Agent SDK**: @anthropic-ai/claude-code (peer dependency, mocked in tests)

## Anti-Patterns

- **Don't spread `...process.env` into sandbox processes.** Use an explicit allowlist. See `04b-sandbox-isolation.md`.
- **Don't add a network hop that could be a function call.** If two things are in the same process, call the function.
- **Don't mock the OS in tests.** Use real sockets, real files, real processes. Mock the Claude API, not the operating system.
- **Don't add config for things with one valid value.** If every deployment uses the same setting, hardcode it.
- **Don't build Phase N infrastructure while Phase N-1 doesn't work.** Pre-warming pool before sandbox creation is reliable. Multi-runner before single-runner is correct. S3 sync before local persistence.
- **Don't write code without updating docs.** The docs are the product as much as the code is.
- **Don't translate SDK types into custom types.** If the SDK has a `Message` type, use `Message`. Don't create `BridgeAssistantMessageEvent` that contains the same data with different field names. The bridge should yield SDK messages directly. The SSE stream should carry SDK messages directly. Our custom types are for Ash-specific concepts (Session, Agent, Sandbox, Pool) — not for conversations.
