#!/usr/bin/env bash
# Wrapper around `changeset version` that also bumps the Python SDK
# when it has unreleased changes.
#
# Used by the Changesets GitHub Action (publish.yml) as the `version` command.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PYPROJECT="$ROOT/packages/sdk-python/pyproject.toml"

# 1. Run the normal changeset version (bumps npm packages)
pnpm changeset version

# 2. Check if packages/sdk-python/ has changes since the last PyPI release tag.
#    We compare against the last commit that touched pyproject.toml's version line,
#    which corresponds to the last time the Python SDK was released.
current_version=$(grep '^version' "$PYPROJECT" | head -1 | sed 's/.*"\(.*\)".*/\1/')

# Find the commit that last changed the version line in pyproject.toml
last_version_commit=$(git log -1 --format="%H" -S "version = \"$current_version\"" -- "$PYPROJECT" 2>/dev/null || echo "")

if [ -z "$last_version_commit" ]; then
  # No prior version commit found — check if sdk-python has any changes at all
  sdk_changes=$(git diff HEAD -- "$ROOT/packages/sdk-python/" 2>/dev/null | head -1)
else
  # Check if packages/sdk-python/ has changes since the last version bump
  sdk_changes=$(git log --oneline "$last_version_commit"..HEAD -- "$ROOT/packages/sdk-python/" 2>/dev/null | head -1)
fi

if [ -n "$sdk_changes" ]; then
  echo ""
  echo "Python SDK has unreleased changes — bumping pyproject.toml..."

  # Patch bump the version
  IFS='.' read -r major minor patch <<< "$current_version"
  new_version="$major.$minor.$((patch + 1))"

  sed -i "s/^version = \"$current_version\"/version = \"$new_version\"/" "$PYPROJECT"
  git add "$PYPROJECT"

  echo "  ash-ai-sdk: $current_version -> $new_version"
else
  echo ""
  echo "Python SDK has no unreleased changes — skipping version bump."
fi
