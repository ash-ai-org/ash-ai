#!/usr/bin/env bash
# List all publishable packages with current versions and last release tags.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

printf "%-25s %-10s %-20s\n" "PACKAGE" "VERSION" "LAST TAG"
printf "%-25s %-10s %-20s\n" "-------" "-------" "--------"

for pkg_json in "$ROOT"/packages/*/package.json; do
  dir="$(dirname "$pkg_json")"
  dir_name="$(basename "$dir")"
  name=$(node -p "require('$pkg_json').name")
  version=$(node -p "require('$pkg_json').version")
  private=$(node -p "require('$pkg_json').private || false")

  if [ "$private" = "true" ]; then
    continue
  fi

  last_tag=$(git tag --list "${dir_name}-v*" --sort=-version:refname 2>/dev/null | head -1)
  last_tag="${last_tag:-<none>}"

  printf "%-25s %-10s %-20s\n" "$name" "$version" "$last_tag"
done
