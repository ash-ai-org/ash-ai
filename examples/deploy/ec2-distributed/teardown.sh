#!/usr/bin/env bash
#
# teardown-ec2-distributed.sh — Terminate distributed Ash EC2 instances and clean up.
#
# Usage:
#   ./scripts/teardown-ec2-distributed.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

STATE_FILE="$PROJECT_DIR/.ec2-distributed"

if [ ! -f "$STATE_FILE" ]; then
  echo "No distributed state file found at $STATE_FILE"
  echo "Nothing to tear down."
  exit 0
fi

# Load .env for AWS credentials
if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  source "$PROJECT_DIR/.env"
  set +a
fi

# Load instance state
source "$STATE_FILE"

export AWS_DEFAULT_REGION="${REGION:-us-east-1}"

# ── Terminate runner first, then server ───────────────────────────────────

INSTANCE_IDS=""

if [ -n "${RUNNER_INSTANCE_ID:-}" ]; then
  echo "==> Terminating runner instance $RUNNER_INSTANCE_ID..."
  aws ec2 terminate-instances --instance-ids "$RUNNER_INSTANCE_ID" --output text
  INSTANCE_IDS="$RUNNER_INSTANCE_ID"
fi

if [ -n "${SERVER_INSTANCE_ID:-}" ]; then
  echo "==> Terminating server instance $SERVER_INSTANCE_ID..."
  aws ec2 terminate-instances --instance-ids "$SERVER_INSTANCE_ID" --output text
  INSTANCE_IDS="$INSTANCE_IDS $SERVER_INSTANCE_ID"
fi

if [ -n "$INSTANCE_IDS" ]; then
  echo "==> Waiting for instances to terminate..."
  aws ec2 wait instance-terminated --instance-ids $INSTANCE_IDS
  echo "  Instances terminated."
fi

# ── Clean up security group ───────────────────────────────────────────────

if [ -n "${SG_ID:-}" ]; then
  SG_NAME=$(aws ec2 describe-security-groups \
    --group-ids "$SG_ID" \
    --query 'SecurityGroups[0].GroupName' \
    --output text 2>/dev/null || echo "")

  if [ "$SG_NAME" = "ash-distributed-sg" ]; then
    echo "==> Deleting security group $SG_ID (ash-distributed-sg)..."
    # Wait a moment for ENI detachment
    sleep 5
    aws ec2 delete-security-group --group-id "$SG_ID" 2>/dev/null || \
      echo "  Warning: Could not delete security group. It may still have dependencies."
  fi
fi

rm -f "$STATE_FILE"

echo ""
echo "Distributed teardown complete."
