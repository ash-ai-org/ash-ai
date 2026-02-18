#!/usr/bin/env bash
#
# teardown-ec2.sh — Terminate the Ash EC2 instance and clean up resources.
#
# Usage:
#   ./scripts/teardown-ec2.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

STATE_FILE="$PROJECT_DIR/.ec2-instance"

if [ ! -f "$STATE_FILE" ]; then
  echo "No instance state file found at $STATE_FILE"
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

echo "==> Terminating instance $INSTANCE_ID in $AWS_DEFAULT_REGION..."

aws ec2 terminate-instances --instance-ids "$INSTANCE_ID" --output text
echo "  Instance termination initiated."

echo "==> Waiting for instance to terminate..."
aws ec2 wait instance-terminated --instance-ids "$INSTANCE_ID"
echo "  Instance terminated."

# Clean up security group if we created it (named ash-server-sg)
if [ -n "${SG_ID:-}" ]; then
  SG_NAME=$(aws ec2 describe-security-groups \
    --group-ids "$SG_ID" \
    --query 'SecurityGroups[0].GroupName' \
    --output text 2>/dev/null || echo "")

  if [ "$SG_NAME" = "ash-server-sg" ]; then
    echo "==> Deleting security group $SG_ID (ash-server-sg)..."
    # Wait a moment for ENI detachment
    sleep 5
    aws ec2 delete-security-group --group-id "$SG_ID" 2>/dev/null || \
      echo "  Warning: Could not delete security group. It may still have dependencies."
  fi
fi

rm -f "$STATE_FILE"

echo ""
echo "Teardown complete."
