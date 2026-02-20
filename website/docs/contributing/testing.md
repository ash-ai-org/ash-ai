---
sidebar_position: 3
title: Testing Guide
---

# Testing Guide

## Philosophy

**The test is the spec.** If the behavior is not tested, it is not guaranteed. Tests encode what the system promises. When requirements change, change the test first, then change the code.

## Test Pyramid

| Layer | Count | Runner | Description |
|-------|-------|--------|-------------|
| **Unit** | ~50 | `pnpm test` | Protocol encode/decode, state machines, validators, helpers. Fast, no I/O. |
| **Integration** | ~15 | `pnpm test:integration` | Full lifecycle: start server, deploy agent, create session, send messages, verify responses. Uses real sockets, real files, real processes (mocked Claude SDK). |
| **Isolation** | Linux only | `pnpm test:isolation` | Sandbox security: verify env leaks are blocked, filesystem escapes fail, resource limits are enforced. Requires bubblewrap (bwrap). |
| **Load** | On demand | `pnpm bench` | Latency and throughput benchmarks. Pool operations, sandbox startup, message overhead. |

## Running Tests

```bash
# All unit tests across all packages
pnpm test

# Integration tests (starts real server processes)
pnpm test:integration

# Sandbox isolation tests (Linux with bwrap only)
pnpm test:isolation

# Benchmarks
pnpm bench

# Single package
pnpm --filter '@ash-ai/server' test
pnpm --filter '@ash-ai/shared' test
```

## What to Test

### Test boundaries

Protocol serialization (encode/decode round-trip), API request/response contracts, database queries, bridge command/event handling. These are the surfaces where bugs hide.

```typescript
// Good: tests the encode/decode contract
test('encode then decode round-trips a query command', () => {
  const cmd: QueryCommand = { cmd: 'query', prompt: 'hello', sessionId: 'abc' };
  const decoded = decode(encode(cmd));
  expect(decoded).toEqual(cmd);
});
```

### Test failure modes

What happens when the bridge crashes mid-stream? When the client disconnects? When the sandbox runs out of memory? When the database is unreachable? These are the scenarios that distinguish a demo from a system.

```typescript
// Good: tests crash recovery behavior
test('session transitions to error when sandbox crashes', async () => {
  const session = await createSession('test-agent');
  // Kill the sandbox process
  sandbox.process.kill('SIGKILL');
  // Verify session status
  const updated = await getSession(session.id);
  expect(updated.status).toBe('error');
});
```

### Test invariants

The sandbox environment never contains host secrets. An ended session rejects new messages. Eviction never touches a running sandbox. These are the properties that must always hold.

```typescript
// Good: tests a security invariant
test('sandbox env does not contain host secrets', () => {
  process.env.AWS_SECRET_ACCESS_KEY = 'supersecret';
  const env = buildSandboxEnv();
  expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
});
```

## What NOT to Test

- **Trivial wrappers**: If a function just calls another function and returns the result, testing it adds no value.
- **Type re-exports**: `export type { Session } from '@ash-ai/shared'` does not need a test.
- **Config loading**: Unless the loading logic has branching or defaults that matter, skip it.

## Mocking Strategy

**Mock the Claude SDK, not the OS.**

- Use real Unix sockets, real files, real child processes.
- Mock `@anthropic-ai/claude-code` to return predictable responses.
- Do not mock `fs`, `net`, `child_process`, or `http`. If the test needs these, use them for real.

The bridge package tests mock the SDK's `query()` function to yield controlled message sequences. Everything else (socket communication, process lifecycle, file I/O) uses real system calls.

```typescript
// Good: mock the SDK, use real sockets
const mockSdk = {
  async *query(prompt: string) {
    yield { type: 'assistant', message: { content: [{ type: 'text', text: 'Hello' }] } };
    yield { type: 'result', subtype: 'success' };
  },
};

// Bad: mock the filesystem
jest.mock('fs'); // Don't do this
```
