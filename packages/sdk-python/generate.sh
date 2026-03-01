#!/usr/bin/env bash
set -euo pipefail

# Generate the Python SDK from the OpenAPI spec.
#
# Prerequisites:
#   pip install openapi-python-client==0.28.2
#
# The generated output replaces ash_sdk/ — except for hand-written modules
# listed in PRESERVE below, which are backed up and restored after generation.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SPEC="${SCRIPT_DIR}/../../packages/server/openapi.json"
CONFIG="${SCRIPT_DIR}/openapi-python-client-config.yml"
TMP_DIR=$(mktemp -d)
GEN_DIR="${TMP_DIR}/out"
BACKUP_DIR="${TMP_DIR}/preserved"

# Hand-written files that survive regeneration
PRESERVE=(
  "streaming.py"
  "ash_client.py"
)

trap 'rm -rf "$TMP_DIR"' EXIT

if [ ! -f "$SPEC" ]; then
  echo "Error: OpenAPI spec not found at $SPEC"
  echo "Run 'pnpm --filter @ash-ai/server openapi' first."
  exit 1
fi

if ! command -v openapi-python-client &>/dev/null; then
  echo "Error: openapi-python-client not found."
  echo "Install it: pip install openapi-python-client>=0.26.0"
  exit 1
fi

# Back up hand-written files
mkdir -p "$BACKUP_DIR"
for f in "${PRESERVE[@]}"; do
  src="${SCRIPT_DIR}/ash_sdk/${f}"
  if [ -f "$src" ]; then
    cp "$src" "${BACKUP_DIR}/${f}"
    echo "Preserved: ash_sdk/${f}"
  fi
done

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

# Restore hand-written files
for f in "${PRESERVE[@]}"; do
  src="${BACKUP_DIR}/${f}"
  if [ -f "$src" ]; then
    cp "$src" "${SCRIPT_DIR}/ash_sdk/${f}"
    echo "Restored:  ash_sdk/${f}"
  fi
done

# Append AshClient export to __init__.py
INIT="${SCRIPT_DIR}/ash_sdk/__init__.py"
cat >> "$INIT" << 'PYEOF'

# Hand-written high-level client (preserved across regeneration)
from .ash_client import AshClient

__all__ += ("AshClient",)  # type: ignore[assignment]
PYEOF
echo "Patched:   ash_sdk/__init__.py (added AshClient export)"

# Format if ruff is available
if command -v ruff &>/dev/null; then
  ruff check "${SCRIPT_DIR}/ash_sdk" --fix --select I --quiet 2>/dev/null || true
  ruff format "${SCRIPT_DIR}/ash_sdk" --quiet 2>/dev/null || true
fi

echo ""
echo "Done. Generated SDK at $SCRIPT_DIR/ash_sdk/"
echo "Run 'pytest tests/' to verify."
