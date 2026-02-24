# 0004: Open-Source vs. Cloud Boundary — Three Types of Complexity

**Date**: 2026-02-23
**Status**: Accepted

## Context

Ash is two things: an open-source project (`@ash-ai/*` packages) and a commercial hosted platform (Ash Cloud). As the surface area of both grows, we need a principled framework for deciding what belongs where. Without one, decisions get made ad hoc — by competitive pressure, revenue targets, or whoever is loudest in the room.

This document codifies the framework we use to draw the line.

## The Framework: Three Types of Complexity

Every capability Ash provides addresses one of three types of complexity. The type determines where it lives.

### 1. Application Complexity → Always Open Source

**What it is**: The work developers do to define, structure, and run their agents. The framework features that make Ash agents expressive, composable, and easy to maintain.

**Why it's OSS**: This is the core value proposition that drives adoption. Locking it down kills the ecosystem. Composability and transparency create a virtuous cycle — the community builds things we'd never anticipate, and the best ideas flow back into the framework.

**Examples**:
- Agent definition format (CLAUDE.md + folder convention)
- Session lifecycle (create → active → paused → ended)
- Bridge protocol (Unix socket, NDJSON, SDK message passthrough)
- Sandbox isolation (bwrap, cgroups, env allowlists, resource limits)
- SSE streaming with backpressure
- REST API + OpenAPI spec
- CLI (`ash deploy`, `ash session`, `ash start/stop`)
- TypeScript and Python SDKs
- Sandbox pool (DB-backed, LRU eviction, idle sweep)
- Session pause/resume (fast-path and cold-path recovery)
- Multi-runner architecture (coordinator mode, session routing)
- State persistence (SQLite and Postgres/CRDB)
- Prometheus metrics endpoint
- Authentication (API key auth)

**The test**: If a solo developer self-hosting Ash on a single machine needs it to build and run agents, it's application complexity. It stays open.

**Commitments**:
- The in-process framework, core abstractions, and public APIs will always be open source.
- Every capability exposed in the API is implemented against the same OpenAPI spec that users can build on. No hidden internal APIs.
- SDK types pass through untranslated (see [0001-sdk-passthrough-types.md](./0001-sdk-passthrough-types.md)). We add orchestration types, we don't translate conversation types.

### 2. Operational Complexity → Cloud (with OSS foundations)

**What it is**: The work to run agent infrastructure reliably at scale. Stateful distributed systems, centralized services, and capabilities that benefit from economies of scale.

**Why it's Cloud**: Most organizations don't want to manage the operational burden of a stateful agent orchestration platform. The core team has complete visibility into the hosted system, can redeploy at will, see results immediately, and iterate orders of magnitude faster than waiting for an open-source community to upgrade and report back. Centralized operation creates genuine economies of scale.

**Examples**:
- Managed compute (ECS provisioning, health monitoring, auto-scaling)
- Telemetry ingest pipeline (event collection, storage, retention)
- Observability dashboards (session timelines, event streams, tool call tracing)
- Eval framework (LLM judges, heuristic evaluators, scoring pipelines)
- Regression alerts (threshold-based, baseline comparison, multi-channel notification)
- File storage with TTL management
- Agent management UI (CRUD, versioning, deployment status)

**The test**: Does this capability involve complex product ontologies, lots of state, interconnected distributed components, or continuous operational feedback loops? Does a centralized team running it create genuine economies of scale over individual deployers? If yes, it belongs in Cloud.

**Important nuance**: Ash Cloud is architecturally composed of OSS Ash components. The server running inside a managed ECS instance is the same `@ash-ai/server`. Work to improve Cloud naturally accrues to those components. If we fix a bug in the sandbox pool because of Cloud telemetry, we ship that fix to OSS immediately. There is no version of Ash Cloud that runs a different server than what's published on npm.

**What's NOT subject to economies of scale stays open**: If we discover a Kubernetes deployment bug through Cloud operations, we fix it in OSS. The criterion is development speed and sustainability, not revenue extraction.

### 3. Enterprise Complexity → Cloud Only

**What it is**: The work to embed an agent platform within a larger organization. Collaboration, compliance, security, and governance features that matter at organizational scale.

**Why it's Cloud**: Organizations that need these capabilities want to pay for them. They want contracts, SLAs, legal guarantees, and the institutional relationship that outlives any individual stakeholder. These features also make the product ontology significantly more complex — a solo developer spinning up `ash start` for the first time shouldn't be confronted with RBAC hierarchies and audit log configuration.

**Examples**:
- Multi-tenancy (tenant isolation, data boundaries)
- Role-based access control (admin, member, viewer)
- API key scoping (ingest, read, admin permissions)
- Plan tiers (free, pro, team, enterprise)
- Audit logs
- SSO / federated identity
- Usage metering and billing
- SLAs and support contracts
- Compliance certifications (SOC 2, HIPAA)
- Complex networking (VPC peering, private endpoints)

**The test**: Does this feature exist to manage people, permissions, or organizational policy — rather than to run agents? Would exposing it in the OSS product add complexity that hurts the solo developer experience? If yes, it's enterprise complexity.

## Decision Criteria (Quick Reference)

When deciding where a new feature belongs, ask these questions in order:

1. **Does a self-hosting developer need this to build and run agents?** → OSS.
2. **Does this benefit from centralized operation and economies of scale?** → Cloud, built on OSS foundations.
3. **Does this manage organizational concerns (people, permissions, compliance)?** → Cloud only.

If the answer is ambiguous, default to OSS. It's easier to move something from open to proprietary later than to open-source something that was built as proprietary. (In practice, we almost never do the former — the community notices and it erodes trust.)

## What This Means in Practice

### We will NOT do

- **Hold back correctness to upsell.** If self-hosted Ash has a bug, we fix it. We don't create a "more correct" version for Cloud.
- **Gate application-level features behind Cloud.** New agent definition capabilities, protocol improvements, SDK features, isolation improvements — these go to OSS.
- **Create divergent codebases.** Cloud runs the same `@ash-ai/server` as self-hosted. Cloud-specific code lives in a separate deployment layer, not in forked packages.
- **Translate SDK types for commercial differentiation.** The thin-wrapper principle ([Principle #8](../../CLAUDE.md)) applies equally to OSS and Cloud.

### We WILL do

- **Build Cloud features on top of OSS APIs.** The telemetry ingest pipeline consumes the same event types that OSS users can instrument against. The eval framework scores sessions using the same session data model.
- **Ship OSS improvements discovered through Cloud operations.** Pool bug found via Cloud health monitoring? Shipped to OSS in the same release.
- **Keep the OSS experience excellent for solo developers.** `ash start` → deploy an agent → send messages. No Cloud account required, no feature degradation.
- **Price Cloud fairly.** The goal is maximum adoption, not maximum extraction. Small teams and large enterprises should both find Cloud worthwhile.

## The Agent-Specific Nuance

Dagster's "application complexity" line is clean because orchestration is plumbing — you're wiring together existing compute. Ash's line is trickier because the agent *is* the product. As we add multi-backend support, agent versioning, and richer configuration, the boundary between "framework feature that helps you structure code" and "platform feature that helps you manage agents" can blur.

The tiebreaker: **Does it change what the agent does, or how you operate the agent?**

- Agent definition format, system prompts, skills, MCP connections → what the agent does → OSS.
- Agent deployment dashboards, version history, A/B traffic splitting → how you operate agents at scale → Cloud.
- Multi-backend support (Claude, Gemini, OpenAI) → if it's a framework abstraction developers use in code, OSS. If it's a Cloud UI for switching backends without code changes, Cloud.

## Consequences

**Good**:
- Consistent decision-making framework that doesn't shift with competitive pressure
- Clear signal to the community about what they can depend on
- Cloud team can move fast on operational/enterprise features without OSS governance overhead
- OSS team can commit to stability without Cloud revenue concerns distorting priorities

**Bad**:
- Some gray areas will require judgment calls (e.g., basic usage metrics in OSS vs. full observability in Cloud)
- Competitors can build their own hosted Ash — this is by design, not a bug
- Enterprise features in Cloud need to be compelling enough that large orgs choose Cloud over self-hosting + building their own RBAC

**Mitigated by**: The economies of scale are real. Managing agent infrastructure, telemetry pipelines, and eval systems at scale is genuinely hard. The core team will always be better at operating their own software than customers are. That's the moat — not artificial feature gating.
