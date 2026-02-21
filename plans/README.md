# Ash Cloud Migration Plans

These plans address the feature gaps between Ash and the current `ash-ai` harness used by `agent-sdk-harness-cloud`. The goal is to add missing capabilities to Ash so the cloud layer can replace `ash-ai` with Ash.

## Guiding Principles

- **Keep Ash standalone-capable.** No cloud-specific concepts (Supabase auth, multi-tenant API keys) leak into core Ash packages.
- **Additive, not rewrite.** Extend Ash's existing patterns rather than replacing them.
- **Adapter-friendly.** Where Ash's design differs from ash-ai (e.g. message format), prefer adding translation/adapter interfaces rather than changing Ash's core model.
- **Assist, don't obstruct.** Parsing/classification layers should never drop unknown data. Forward-compatibility over strict typing.
- **Platform does platform things.** Features like skill loading from GitHub, multi-tenant auth, etc. belong in the cloud platform, not in Ash. Ash provides primitives (deploy agent, file access), the platform composes them.
- **Incremental.** Each plan can be implemented independently. Order by priority.

## Plans (by priority)

| # | Plan | Priority | Effort |
|---|------|----------|--------|
| 1 | [Structured Message Content](./01-structured-messages.md) | **Critical** | Medium |
| 2 | [Granular Stream Events](./02-granular-stream-events.md) | **Critical** | Medium |
| 3 | [Session Lifecycle Alignment](./03-session-lifecycle.md) | **Critical** | Small |
| 4 | [Session Fork](./04-session-fork.md) | **High** | Medium |
| 5 | [Credential Management](./06-credentials.md) | **High** | Medium |
| 6 | [FileStore Interface](./07-cloud-file-store.md) | **Medium** | Small |
| 7 | [Message Queue](./08-message-queue.md) | **Medium** | Medium |
| 8 | [Attachments](./09-attachments.md) | **Medium** | Medium |
| 9 | [Usage Tracking](./10-usage-tracking.md) | **Low** | Small |
| 10 | [Workspace Bundles](./11-workspace-bundles.md) | **Low** | Medium |

## Not in Ash (platform concerns)

- **Skills system** — Loading skills from GitHub/local/URL is a platform feature. Ash provides agent deploy + sandbox file access; the platform fetches skills and writes them into the workspace.
- **Multi-tenant auth** — Supabase, API key management UI, tenant isolation. Cloud platform responsibility.
- **Sandbox file sync/watching** — Real-time file watchers are a cloud UX feature built on Ash's file access primitives.
