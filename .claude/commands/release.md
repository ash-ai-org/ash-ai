Prepare a release for Ash packages.

Walk through the full release checklist:

1. **Check for pending changesets**: Run `pnpm changeset status` to see what's queued up.

2. **If no changesets exist**: Look at git log since the last release tag to find what changed. Run `git log --oneline $(git describe --tags --abbrev=0 2>/dev/null || echo HEAD~20)..HEAD` to see recent commits. Then create changeset files for any unreleased work (follow the same rules as the /changeset skill).

3. **Verify packages build**: Run `pnpm build` to make sure everything compiles.

4. **Verify tests pass**: Run `pnpm test` to make sure nothing is broken.

5. **Show the user a summary** of what will be released:
   - Which packages will be bumped and to what version
   - The changeset descriptions (these become the release notes)
   - Remind them that pushing to main will trigger the publish workflow which opens a "Version Packages" PR

6. **Remind them of the flow**:
   - Push to `main` → CI opens a "Version Packages" PR (bumps versions, generates CHANGELOGs)
   - Merge that PR → CI publishes to npm and creates GitHub Releases with release notes
   - Each changeset description becomes a CHANGELOG entry and GitHub Release note, with links back to the PR

Do NOT run `pnpm version-packages` or `pnpm release` locally — that's CI's job. This skill just makes sure everything is ready to go.
