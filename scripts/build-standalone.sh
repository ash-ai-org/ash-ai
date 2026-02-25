#!/usr/bin/env bash
# Build standalone ash CLI binaries using bun compile.
# Produces self-contained executables with no Node.js dependency.
#
# Usage: ./scripts/build-standalone.sh
# Output: dist/bin/ash-{darwin-arm64,darwin-x64,linux-x64}
#
# Requires: bun >= 1.0 (https://bun.sh)

set -euo pipefail

if ! command -v bun >/dev/null 2>&1; then
  echo "Error: bun is required for standalone builds."
  echo "Install: curl -fsSL https://bun.sh/install | bash"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."
OUT="$ROOT/dist/bin"

mkdir -p "$OUT"

echo "Building packages..."
(cd "$ROOT" && pnpm build)

# The CLI entrypoint after TypeScript compilation
ENTRY="$ROOT/packages/cli/dist/index.js"

if [[ ! -f "$ENTRY" ]]; then
  echo "Error: CLI not built. Run 'pnpm build' first."
  exit 1
fi

TARGETS=("bun-darwin-arm64" "bun-darwin-x64" "bun-linux-x64")
NAMES=("ash-darwin-arm64" "ash-darwin-x64" "ash-linux-x64")

for i in "${!TARGETS[@]}"; do
  target="${TARGETS[$i]}"
  name="${NAMES[$i]}"
  echo "Compiling $name (${target})..."
  bun build "$ENTRY" --compile --target="$target" --outfile "$OUT/$name"
  echo "  -> $OUT/$name ($(du -h "$OUT/$name" | cut -f1))"
done

echo ""
echo "Standalone binaries:"
ls -lh "$OUT"/ash-*
