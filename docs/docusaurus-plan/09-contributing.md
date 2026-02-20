# 09 - Contributing Section

## Pages

### 1. Development Setup (`/docs/contributing/development-setup`)

**Content:**
- Prerequisites: Node.js 22+, pnpm 9+, Docker (for integration tests)
- Clone and install:
  ```bash
  git clone https://github.com/ash-ai-org/ash.git
  cd ash
  pnpm install
  pnpm build
  ```
- Run tests: `pnpm test`
- Run dev server: `pnpm --filter '@ash-ai/server' dev`
- Build order: `shared` first, then `sandbox`, then everything else
- Hot reload: `tsx watch` for server development

**Source:** `CONTRIBUTING.md`

---

### 2. Project Structure (`/docs/contributing/project-structure`)

**Content:**
- Package map with descriptions:
  ```
  @ash-ai/shared    → Types, protocol, constants (foundation, no deps)
  @ash-ai/sandbox   → SandboxManager, SandboxPool, BridgeClient
  @ash-ai/bridge    → Runs inside sandbox, talks to Claude SDK
  @ash-ai/server    → Fastify REST API, control plane
  @ash-ai/runner    → Worker node for multi-machine
  @ash-ai/sdk       → TypeScript client library
  @ash-ai/cli       → ash command-line tool
  ```
- Dependency graph (text diagram)
- Key files map: "If you want to change X, look at Y"
- Module system: ESM with NodeNext resolution

**Source:** `CLAUDE.md` project structure section

---

### 3. Testing Guide (`/docs/contributing/testing`)

**Content:**
- Test philosophy: "The test is the spec"
- Test pyramid:
  - **Unit tests** (~50): Protocol, state machines, env isolation
  - **Integration tests** (~15): Multi-component flows
  - **Isolation tests**: Sandbox security verification (Linux only)
  - **Load tests**: Concurrency, throughput
- Running tests:
  ```bash
  pnpm test                 # Unit tests (all packages)
  pnpm test:integration     # Integration tests
  pnpm test:isolation       # Sandbox isolation (requires bwrap)
  pnpm bench                # Benchmarks
  ```
- What to test: boundaries, failure modes, invariants
- What NOT to test: trivial wrappers, type re-exports, config loading
- Mocking: mock Claude SDK, not the OS. Real sockets, real files, real processes.

**Source:** `docs/jeff-dean-plan/testing/00-strategy.md`

---

### 4. Release Process (`/docs/contributing/releases`)

**Content:**
- Changesets: every PR that changes package behavior needs a changeset
- Creating: `pnpm changeset` or `/changeset` skill
- Changeset file format:
  ```markdown
  ---
  "@ash-ai/server": patch
  ---
  Fix session timeout when bridge disconnects.
  ```
- Bump types: `patch` (fixes), `minor` (features), `major` (breaking)
- CI flow:
  1. Merge to main -> CI opens "Version Packages" PR
  2. Merge Version PR -> CI publishes to npm, creates GitHub Release
- What doesn't need a changeset: docs-only, CI config, test-only changes

**Source:** `CLAUDE.md` changesets section, `.changeset/config.json`
