Add a changeset for the current work.

Look at the staged and unstaged git changes (run `git diff` and `git diff --cached`) to understand what packages were modified and what the changes do.

Then create a changeset file at `.changeset/<short-descriptive-name>.md` with this format:

```
---
"@ash-ai/package-name": patch
---

Short description of the change.
```

Rules:
- Only include packages that actually changed (check `packages/*/` paths in the diff)
- Bump type: `patch` for bug fixes and small changes, `minor` for new features or enhancements, `major` for breaking changes
- The filename should be a short kebab-case name describing the change (e.g. `fix-session-timeout.md`, `add-agent-logs.md`)
- The description should be one sentence, written from the user's perspective (what changed, not how)
- If multiple packages changed together for the same feature, put them all in one changeset
- If changes are unrelated across packages, create separate changeset files
- Internal-only packages that changed (`@ash-ai/shared`, `@ash-ai/sandbox`, `@ash-ai/bridge`) should still get changesets — `updateInternalDependencies` in the config will handle cascading bumps to dependents

After creating the changeset, run `pnpm changeset status` to confirm it was picked up.
