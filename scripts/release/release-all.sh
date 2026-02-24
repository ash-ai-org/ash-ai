#!/usr/bin/env bash
# Full release workflow: bump versions, commit, tag, push, create GitHub releases.
# Usage: ./scripts/release/release-all.sh [patch|minor|major]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BUMP="${1:-patch}"
SCRIPTS="$(dirname "$0")"

echo "=== Ash Release: $BUMP bump ==="
echo ""

# Step 1: Show current state
echo "--- Current package versions ---"
"$SCRIPTS/list-packages.sh"
echo ""

# Step 2: Bump versions
echo "--- Bumping versions ($BUMP) ---"
"$SCRIPTS/bump-versions.sh" "$BUMP"
echo ""

# Step 3: Stage and commit
echo "--- Committing version bumps ---"
pkgs=$(git diff --name-only packages/*/package.json packages/*/pyproject.toml packages/*/CHANGELOG.md 2>/dev/null | xargs)
if [ -z "$pkgs" ]; then
  echo "No changes to commit."
  exit 0
fi
git add packages/*/package.json packages/*/pyproject.toml packages/*/CHANGELOG.md 2>/dev/null
summary=$(git diff --cached --name-only packages/*/package.json | sed 's|packages/||;s|/package.json||' | xargs -I{} sh -c 'echo "@ash-ai/{} v$(node -p "require(\"packages/{}/package.json\").version")"' | paste -sd', ' -)
git commit -m "release: ${summary}"
echo ""

# Step 4: Tag
echo "--- Creating tags ---"
"$SCRIPTS/tag-packages.sh"
echo ""

# Step 5: Push (with confirmation)
read -rp "Push commit and tags to origin? [y/N] " confirm
if [[ "$confirm" =~ ^[Yy]$ ]]; then
  git push origin HEAD --follow-tags
  echo ""

  # Step 6: GitHub releases
  read -rp "Create GitHub releases? [y/N] " confirm_gh
  if [[ "$confirm_gh" =~ ^[Yy]$ ]]; then
    "$SCRIPTS/gh-releases.sh"
  fi
else
  echo "Skipped push. Run manually:"
  echo "  git push origin HEAD --follow-tags"
  echo "  ./scripts/release/gh-releases.sh"
fi

echo ""
echo "=== Release complete ==="
"$SCRIPTS/list-packages.sh"
