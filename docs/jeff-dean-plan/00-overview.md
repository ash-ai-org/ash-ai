# Ash: What To Do Next

## The Problem With What We Have

We drew the right architecture diagram. Then we built all the boxes in the diagram before making any of them work well. The result is 6 packages, 32 files, three protocol boundaries on the hot path, and zero correctness guarantees if anything crashes.

## Principle

**Make it work on one machine first. Make it work correctly. Measure it. Then split it.**

The two-tier architecture (control plane + data plane) is the right end state. But shipping it as the starting point means we're paying coordination costs for a distributed system while running everything on localhost. Delete the indirection. Add it back when the single machine is full.

## The Plan

Do these in order. Each one is independently shippable.

| # | Doc | What | Why |
|---|-----|------|-----|
| 1 | [01-consolidate](./01-consolidate.md) | Merge server + runner into one process | Eliminate a network hop, halve the failure modes |
| 2 | [02-sqlite-state](./02-sqlite-state.md) | Replace in-memory Maps with SQLite | Survive restarts, enable resume |
| 3 | [03-bridge-handshake](./03-bridge-handshake.md) | Fix the bridge connect race | Correctness |
| 4 | [04-resource-limits](./04-resource-limits.md) | Add cgroup/ulimit to sandbox processes | Don't let one agent kill the host |
| 4b | [04b-sandbox-isolation](./04b-sandbox-isolation.md) | Actually isolate sandboxes (bwrap, env, network) | Don't let one agent see or touch anything it shouldn't |
| 5 | [05-backpressure](./05-backpressure.md) | Add flow control on SSE streams | Don't OOM at scale |
| 6 | [06-measure](./06-measure.md) | Instrument the hot path | Can't optimize blind |
| 7 | [07-session-resume](./07-session-resume.md) | Implement session resume (the whole point) | This is the product |
| 8 | [08-split-when-full](./08-split-when-full.md) | Re-split server/runner when one machine isn't enough | Scale |

Steps 1-6 are infrastructure. Step 4b is security — resource limits (04) and isolation (04b) are orthogonal concerns. Step 7 is the feature. Step 8 is when you need it, not before.

**Immediate action**: The `...process.env` leak in `manager.ts` line 55 is a 5-minute fix. Do it before anything else. See [04b-sandbox-isolation](./04b-sandbox-isolation.md).

## Testing

Every step above should be accompanied by tests that verify the change works and doesn't break what came before. The testing strategy is in [testing/00-strategy.md](./testing/00-strategy.md).

| Doc | What |
|-----|------|
| [testing/00-strategy.md](./testing/00-strategy.md) | Philosophy, pyramid, what to test and what not to |
| [testing/01-unit-shared.md](./testing/01-unit-shared.md) | Protocol encode/decode, stream reassembly |
| [testing/02-unit-bridge.md](./testing/02-unit-bridge.md) | Handler routing, SDK wrapper mock |
| [testing/03-unit-runner.md](./testing/03-unit-runner.md) | Bridge client, env isolation, pool capacity |
| [testing/04-unit-server.md](./testing/04-unit-server.md) | Agent store CRUD, validator, session state machine |
| [testing/05-unit-cli-sdk.md](./testing/05-unit-cli-sdk.md) | SSE parsing, output formatting, error types |
| [testing/06-integration.md](./testing/06-integration.md) | Full lifecycle: agent deploy, session create/message/end |
| [testing/07-isolation.md](./testing/07-isolation.md) | Env leaks, filesystem escape, network escape, cross-sandbox |
| [testing/08-load.md](./testing/08-load.md) | Message overhead, concurrent capacity, sandbox churn |

The rule: **no step is done until the tests for that step pass.** Write the tests first or alongside the implementation, not after. The tests are the specification.

## Non-Goals (For Now)

- S3 state sync (SQLite + WAL is enough for one machine)
- Multi-runner fleet (see step 8)
- Auth / API keys (single-tenant, single machine)
- Pre-warming pool (measure first, optimize second)
- Kubernetes / CloudFormation / Terraform
