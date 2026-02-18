# Testing Strategy

## Philosophy

Test the things that, if broken, would be invisible until production. Don't test things the compiler already checks.

Concretely:
- **Test boundaries**: Protocol serialization, state machines, API contracts. These are where bugs hide because each side of the boundary has a different author's mental model.
- **Test failure modes**: What happens when the bridge crashes mid-stream? When the socket disconnects? When the database is corrupted? Happy path bugs get found by users in 5 minutes. Failure path bugs get found at 3am.
- **Test invariants**: A session that's `active` always has a live sandbox. A sandbox that's `destroyed` has no lingering process. The env passed to a sandbox never contains host secrets.
- **Don't test glue**: If a function just calls another function and returns its result, don't test it. If a type is just an interface, don't test it. If Fastify already validates the schema, don't re-test the validation.

## Test Pyramid

```
                    ╱╲
                   ╱  ╲
                  ╱ E2E╲         2-3 tests: deploy → session → message → response
                 ╱──────╲
                ╱Integration╲    ~15 tests: multi-component flows
               ╱────────────╲
              ╱  Unit Tests   ╲  ~50 tests: protocol, state machines, isolation
             ╱─────────────────╲
```

## What Lives Where

| Package | What to test | Type | Count |
|---------|-------------|------|-------|
| shared | Protocol encode/decode, edge cases | Unit | ~8 |
| bridge | Message handler routing, SDK wrapper mock, shutdown | Unit | ~10 |
| runner | Bridge client reconnect, sandbox lifecycle states, env isolation | Unit + Integration | ~12 |
| server | Agent store CRUD, session router state machine, API contracts | Unit + Integration | ~15 |
| cli | SSE parsing, tar creation, output formatting | Unit | ~6 |
| sdk | SSE parsing, error handling, client construction | Unit | ~5 |
| e2e | Full flow: deploy → create session → send → stream → end | Integration | ~3 |

Total: ~60 tests. If it takes more than 30 seconds to run all of them, something is wrong.

## Test Infrastructure

- **vitest** — already in devDependencies, fast, good TypeScript support
- **No mocking frameworks** — manual stubs and fakes. If you need sinon to test something, the code is too coupled.
- **Test fixtures** — real files on disk, real Unix sockets, real child processes. Mock the network and the SDK, not the operating system.
- **Parallel by default** — each test creates its own temp directory and socket path. No shared state.

## Doc Index

| Doc | What |
|-----|------|
| [01-unit-shared.md](./01-unit-shared.md) | Protocol and type tests |
| [02-unit-bridge.md](./02-unit-bridge.md) | Bridge handler and SDK wrapper tests |
| [03-unit-runner.md](./03-unit-runner.md) | Sandbox manager, bridge client, pool tests |
| [04-unit-server.md](./04-unit-server.md) | Agent store, session router, API tests |
| [05-unit-cli-sdk.md](./05-unit-cli-sdk.md) | CLI and SDK client tests |
| [06-integration.md](./06-integration.md) | Multi-component integration tests |
| [07-isolation.md](./07-isolation.md) | Sandbox isolation verification tests |
| [08-load.md](./08-load.md) | Load testing and performance benchmarks |

## Running Tests

```bash
# All tests
pnpm test

# Single package
pnpm --filter @anthropic-ai/ash-shared test

# Watch mode during development
pnpm --filter @anthropic-ai/ash-runner test -- --watch

# With coverage (when you need it, not always)
pnpm test -- --coverage
```
