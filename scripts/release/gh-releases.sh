#!/usr/bin/env bash
# Create GitHub releases for all packages at their current version.
# Reads CHANGELOG.md for release notes. Skips if release already exists.
# Usage: ./scripts/gh-releases.sh [package-dir...]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

if ! command -v gh &>/dev/null; then
  echo "Error: gh CLI not installed. Install from https://cli.github.com"
  exit 1
fi

# Determine which packages to release
if [ $# -gt 0 ]; then
  DIRS=("$@")
else
  DIRS=()
  for pkg_json in "$ROOT"/packages/*/package.json; do
    dir="$(dirname "$pkg_json")"
    private=$(node -p "require('$pkg_json').private || false")
    if [ "$private" != "true" ]; then
      DIRS+=("$(basename "$dir")")
    fi
  done
fi

for dir_name in "${DIRS[@]}"; do
  pkg_json="$ROOT/packages/$dir_name/package.json"
  if [ ! -f "$pkg_json" ]; then
    echo "SKIP: $dir_name (no package.json)"
    continue
  fi

  name=$(node -p "require('$pkg_json').name")
  version=$(node -p "require('$pkg_json').version")
  tag="${dir_name}-v${version}"
  changelog="$ROOT/packages/$dir_name/CHANGELOG.md"

  # Check tag exists
  if ! git rev-parse "$tag" >/dev/null 2>&1; then
    echo "SKIP: $name — tag $tag does not exist (run tag-packages.sh first)"
    continue
  fi

  # Check release doesn't already exist
  if gh release view "$tag" >/dev/null 2>&1; then
    echo "SKIP: $name — release $tag already exists"
    continue
  fi

  # Extract release notes from CHANGELOG.md
  notes=""
  if [ -f "$changelog" ]; then
    # Extract the section between the current version header and the next version header
    notes=$(awk "/^## ${version//./\\.}/ {found=1; next} /^## [0-9]/ {if(found) exit} found {print}" "$changelog")
  fi

  if [ -z "$notes" ]; then
    notes="Release ${name} v${version}"
  fi

  # Append full changelog link
  prev_tag=$(git tag --list "${dir_name}-v*" --sort=-version:refname | grep -v "^${tag}$" | head -1)
  if [ -n "$prev_tag" ]; then
    notes="${notes}

**Full Changelog**: https://github.com/ash-ai-org/ash-ai/compare/${prev_tag}...${tag}"
  else
    notes="${notes}

**Full Changelog**: https://github.com/ash-ai-org/ash-ai/commits/${tag}"
  fi

  gh release create "$tag" --title "${name} v${version}" --notes "$notes"
  echo "CREATED: $name v$version — $(gh release view "$tag" --json url -q .url)"
done
