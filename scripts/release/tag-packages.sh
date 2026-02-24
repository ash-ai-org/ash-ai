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
  for pyproject in "$ROOT"/packages/*/pyproject.toml; do
    dir="$(dirname "$pyproject")"
    dir_name="$(basename "$dir")"
    [ -f "$dir/package.json" ] || DIRS+=("$dir_name")
  done
fi

TAGS=()

for dir_name in "${DIRS[@]}"; do
  pkg_json="$ROOT/packages/$dir_name/package.json"
  pyproject="$ROOT/packages/$dir_name/pyproject.toml"

  if [ -f "$pkg_json" ]; then
    name=$(node -p "require('$pkg_json').name")
    version=$(node -p "require('$pkg_json').version")
  elif [ -f "$pyproject" ]; then
    name=$(grep '^name' "$pyproject" | head -1 | sed 's/.*"\(.*\)".*/\1/')
    version=$(grep '^version' "$pyproject" | head -1 | sed 's/.*"\(.*\)".*/\1/')
  else
    echo "SKIP: $dir_name (no package.json or pyproject.toml)"
    continue
  fi

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
