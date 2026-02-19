Add a changeset for the current work.

Look at the staged and unstaged git changes (run `git diff` and `git diff --cached`) to understand what packages were modified and what the changes do.

Then create a changeset file at `.changeset/<short-descriptive-name>.md` with this format:

```
---
"@ash-ai/package-name": patch
---

Summary line describing the change.

- Bullet point with specific detail about what changed and why
- Another bullet point if multiple things changed
```

## Writing good descriptions

The description becomes the CHANGELOG entry and GitHub Release notes. Write it for someone reading a changelog — they want to know what changed and why it matters, not implementation details.

**Single-change example:**
```
Fix session timeout when bridge disconnects during long-running agent tasks.
```

**Multi-change example (features, larger PRs):**
```
Add agent environment variable configuration.

- `@ash-ai/server` — New `PUT /agents/:name/env` endpoint for setting agent-level env vars
- `@ash-ai/cli` — `ash agent env set` and `ash agent env list` commands
- `@ash-ai/shared` — `AgentEnvConfig` type definition
```

**What to avoid:**
- Implementation details ("refactored the switch statement in bridge-client.ts")
- Vague descriptions ("various improvements")
- Repeating the bump type ("this is a patch fix that...")

## Rules

- Only include packages that actually changed (check `packages/*/` paths in the diff)
- Bump type: `patch` for bug fixes and small changes, `minor` for new features or enhancements, `major` for breaking changes
- The filename should be a short kebab-case name describing the change (e.g. `fix-session-timeout.md`, `add-agent-logs.md`)
- If multiple packages changed together for the same feature, put them all in one changeset with per-package bullet points
- If changes are unrelated across packages, create separate changeset files
- Internal-only packages that changed (`@ash-ai/shared`, `@ash-ai/sandbox`, `@ash-ai/bridge`) should still get changesets — `updateInternalDependencies` in the config will handle cascading bumps to dependents

After creating the changeset, run `pnpm changeset status` to confirm it was picked up.
