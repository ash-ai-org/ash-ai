#!/usr/bin/env bash
# Bump version in all (or specified) packages.
# Usage: ./scripts/bump-versions.sh [patch|minor|major] [package-dir...]
# Examples:
#   ./scripts/bump-versions.sh patch              # bump all packages
#   ./scripts/bump-versions.sh minor server sdk   # bump only server and sdk
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BUMP="${1:-patch}"
shift 2>/dev/null || true

# Validate bump type
if [[ "$BUMP" != "patch" && "$BUMP" != "minor" && "$BUMP" != "major" ]]; then
  echo "Usage: $0 [patch|minor|major] [package-dir...]"
  exit 1
fi

bump_version() {
  local current="$1"
  local type="$2"
  local major minor patch
  IFS='.' read -r major minor patch <<< "$current"
  case "$type" in
    patch) echo "$major.$minor.$((patch + 1))" ;;
    minor) echo "$major.$((minor + 1)).0" ;;
    major) echo "$((major + 1)).0.0" ;;
  esac
}

# Determine which packages to bump
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
  # Include Python packages (pyproject.toml without package.json)
  for pyproject in "$ROOT"/packages/*/pyproject.toml; do
    dir="$(dirname "$pyproject")"
    dir_name="$(basename "$dir")"
    if [ ! -f "$dir/package.json" ]; then
      DIRS+=("$dir_name")
    fi
  done
fi

echo "Bumping $BUMP version for: ${DIRS[*]}"
echo ""

for dir_name in "${DIRS[@]}"; do
  pkg_json="$ROOT/packages/$dir_name/package.json"
  pyproject="$ROOT/packages/$dir_name/pyproject.toml"

  if [ -f "$pkg_json" ]; then
    name=$(node -p "require('$pkg_json').name")
    old_version=$(node -p "require('$pkg_json').version")
    new_version=$(bump_version "$old_version" "$BUMP")

    node -e "
      const fs = require('fs');
      const pkg = JSON.parse(fs.readFileSync('$pkg_json', 'utf8'));
      pkg.version = '$new_version';
      fs.writeFileSync('$pkg_json', JSON.stringify(pkg, null, 2) + '\n');
    "

    printf "  %-25s %s -> %s\n" "$name" "$old_version" "$new_version"
  elif [ -f "$pyproject" ]; then
    name=$(grep '^name' "$pyproject" | head -1 | sed 's/.*"\(.*\)".*/\1/')
    old_version=$(grep '^version' "$pyproject" | head -1 | sed 's/.*"\(.*\)".*/\1/')
    new_version=$(bump_version "$old_version" "$BUMP")

    sed -i.bak "s/^version = \"$old_version\"/version = \"$new_version\"/" "$pyproject"
    rm -f "$pyproject.bak"

    printf "  %-25s %s -> %s\n" "$name" "$old_version" "$new_version"
  else
    echo "SKIP: $dir_name (no package.json or pyproject.toml)"
    continue
  fi
done

echo ""
echo "Done. Run 'git diff packages/*/package.json' to review."
