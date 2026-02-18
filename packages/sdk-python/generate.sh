#!/usr/bin/env bash
set -euo pipefail

# Generate Python API client from OpenAPI spec.
#
# Prerequisites:
#   pip install openapi-python-client
#
# This script generates REST models/api from the OpenAPI spec,
# then copies them into ash_sdk/, preserving hand-written files.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SPEC="${SCRIPT_DIR}/../../packages/server/openapi.json"
OUT_DIR="${SCRIPT_DIR}/generated"

if [ ! -f "$SPEC" ]; then
  echo "Error: OpenAPI spec not found at $SPEC"
  echo "Run 'pnpm --filter @ash-ai/server openapi' first."
  exit 1
fi

# Clean previous generation
rm -rf "$OUT_DIR"

# Generate
echo "Generating Python client from $SPEC..."
openapi-python-client generate --path "$SPEC" --output-path "$OUT_DIR" --config <(echo '
project_name_override: ash-generated
package_name_override: ash_generated
')

echo "Generated client at $OUT_DIR"
echo ""
echo "To update ash_sdk/ models from generated code, manually copy relevant"
echo "dataclasses from $OUT_DIR/ash_generated/models/ into ash_sdk/models/."
echo ""
echo "The hand-written files (client.py, streaming.py) are NOT overwritten."
