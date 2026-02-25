#!/usr/bin/env bash
set -euo pipefail

# Generate the entire Python SDK from the OpenAPI spec.
#
# Prerequisites:
#   pip install openapi-python-client==0.28.2
#
# The generated output replaces ash_sdk/ entirely — no hand-written client code.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SPEC="${SCRIPT_DIR}/../../packages/server/openapi.json"
CONFIG="${SCRIPT_DIR}/openapi-python-client-config.yml"
TMP_DIR=$(mktemp -d)
GEN_DIR="${TMP_DIR}/out"

trap 'rm -rf "$TMP_DIR"' EXIT

if [ ! -f "$SPEC" ]; then
  echo "Error: OpenAPI spec not found at $SPEC"
  echo "Run 'pnpm --filter @ash-ai/server openapi' first."
  exit 1
fi

if ! command -v openapi-python-client &>/dev/null; then
  echo "Error: openapi-python-client not found."
  echo "Install it: pip install openapi-python-client==0.28.2"
  exit 1
fi

# Generate into temp directory using --meta none (skips pyproject.toml generation).
# With --meta none, the package contents are output directly into the output path.
echo "Generating Python SDK from $SPEC..."
openapi-python-client generate \
  --path "$SPEC" \
  --config "$CONFIG" \
  --output-path "$GEN_DIR" \
  --meta none

# Replace ash_sdk/ with the generated output
rm -rf "${SCRIPT_DIR}/ash_sdk"
mv "$GEN_DIR" "${SCRIPT_DIR}/ash_sdk"

# Format if ruff is available
if command -v ruff &>/dev/null; then
  ruff check "${SCRIPT_DIR}/ash_sdk" --fix --select I --quiet 2>/dev/null || true
  ruff format "${SCRIPT_DIR}/ash_sdk" --quiet 2>/dev/null || true
fi

echo ""
echo "Done. Generated SDK at $SCRIPT_DIR/ash_sdk/"
echo "Run 'pytest tests/' to verify."
