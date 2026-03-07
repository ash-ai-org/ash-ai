#!/usr/bin/env bash
#
# teardown-gce.sh — Delete the Ash GCE instance and clean up resources.
#
# Usage:
#   ./scripts/teardown-gce.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

STATE_FILE="$PROJECT_DIR/.gce-instance"

if [ ! -f "$STATE_FILE" ]; then
  echo "No instance state file found at $STATE_FILE"
  echo "Nothing to tear down."
  exit 0
fi

# Load instance state
source "$STATE_FILE"

echo "==> Deleting instance $INSTANCE_NAME in $GCP_ZONE..."

gcloud compute instances delete "$INSTANCE_NAME" \
  --project="$GCP_PROJECT_ID" \
  --zone="$GCP_ZONE" \
  --quiet

echo "  Instance deleted."

# Optionally delete firewall rule
if [ -n "${FIREWALL_RULE_NAME:-}" ]; then
  echo "==> Deleting firewall rule $FIREWALL_RULE_NAME..."
  gcloud compute firewall-rules delete "$FIREWALL_RULE_NAME" \
    --project="$GCP_PROJECT_ID" \
    --quiet 2>/dev/null || echo "  Warning: Could not delete firewall rule (may not exist)."
fi

rm -f "$STATE_FILE"

echo ""
echo "Teardown complete."
