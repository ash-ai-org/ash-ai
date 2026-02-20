#!/usr/bin/env bash
# Create git tags for all publishable packages at their current version.
# Usage: ./scripts/tag-packages.sh [package-dir...]
# Examples:
#   ./scripts/tag-packages.sh             # tag all packages
#   ./scripts/tag-packages.sh server sdk  # tag only server and sdk
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# Determine which packages to tag
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

TAGS=()

for dir_name in "${DIRS[@]}"; do
  pkg_json="$ROOT/packages/$dir_name/package.json"
  if [ ! -f "$pkg_json" ]; then
    echo "SKIP: $dir_name (no package.json)"
    continue
  fi

  name=$(node -p "require('$pkg_json').name")
  version=$(node -p "require('$pkg_json').version")
  tag="${dir_name}-v${version}"

  if git rev-parse "$tag" >/dev/null 2>&1; then
    echo "  SKIP: $tag (already exists)"
    continue
  fi

  git tag "$tag"
  TAGS+=("$tag")
  printf "  CREATED: %-20s (%s)\n" "$tag" "$name"
done

echo ""
if [ ${#TAGS[@]} -gt 0 ]; then
  echo "Tags created: ${TAGS[*]}"
  echo ""
  echo "Push with: git push origin ${TAGS[*]}"
else
  echo "No new tags created."
fi
