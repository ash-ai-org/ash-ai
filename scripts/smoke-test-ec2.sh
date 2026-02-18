#!/usr/bin/env bash
#
# smoke-test-ec2.sh — Verify the EC2 Ash deployment works end-to-end.
#
# Creates a session, sends a message, verifies streaming response,
# pauses, resumes, and cleans up. Uses the same API the SDK uses.
#
# Usage:
#   ./scripts/smoke-test-ec2.sh                    # reads IP from .ec2-instance
#   ./scripts/smoke-test-ec2.sh http://1.2.3.4:4100  # explicit URL

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Determine server URL
if [ -n "${1:-}" ]; then
  SERVER_URL="$1"
else
  # Load from .env for AWS creds + state file for IP
  if [ -f "$PROJECT_DIR/.env" ]; then
    set -a; source "$PROJECT_DIR/.env"; set +a
  fi

  STATE_FILE="$PROJECT_DIR/.ec2-instance"
  if [ ! -f "$STATE_FILE" ]; then
    echo "Usage: $0 [SERVER_URL]"
    echo "No .ec2-instance file found and no URL provided."
    exit 1
  fi

  source "$STATE_FILE"
  export AWS_DEFAULT_REGION="${REGION:-us-east-1}"

  PUBLIC_IP=$(aws ec2 describe-instances \
    --instance-ids "$INSTANCE_ID" \
    --query 'Reservations[0].Instances[0].PublicIpAddress' \
    --output text)

  SERVER_URL="http://$PUBLIC_IP:${ASH_PORT:-4100}"
fi

echo "==> Smoke test against $SERVER_URL"

PASS=0
FAIL=0

pass() { PASS=$((PASS + 1)); echo "  PASS: $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  FAIL: $1"; }

# ── Health check ────────────────────────────────────────────────────────────

echo ""
echo "--- Health Check ---"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$SERVER_URL/health")
if [ "$HTTP_CODE" = "200" ]; then
  pass "Health endpoint returns 200"
else
  fail "Health endpoint returned $HTTP_CODE"
fi

# ── List agents ─────────────────────────────────────────────────────────────

echo ""
echo "--- Agent Registry ---"
AGENTS=$(curl -s "$SERVER_URL/api/agents")
if echo "$AGENTS" | grep -q "qa-bot"; then
  pass "qa-bot agent is deployed"
else
  fail "qa-bot agent not found in registry: $AGENTS"
fi

# ── Create session ──────────────────────────────────────────────────────────

echo ""
echo "--- Session Lifecycle ---"
CREATE_RESP=$(curl -s -X POST "$SERVER_URL/api/sessions" \
  -H "Content-Type: application/json" \
  -d '{"agent":"qa-bot"}')

SESSION_ID=$(echo "$CREATE_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['session']['id'])" 2>/dev/null || echo "")

if [ -n "$SESSION_ID" ]; then
  pass "Session created: $SESSION_ID"
else
  fail "Failed to create session: $CREATE_RESP"
  echo ""
  echo "Results: $PASS passed, $FAIL failed"
  exit 1
fi

# ── Send message (SSE streaming) ────────────────────────────────────────────

echo ""
echo "--- Message Streaming ---"
RESPONSE=$(curl -s -N -X POST "$SERVER_URL/api/sessions/$SESSION_ID/messages" \
  -H "Content-Type: application/json" \
  -d '{"content":"Reply with exactly: hello smoke test"}' \
  --max-time 60)

if echo "$RESPONSE" | grep -q "event: message"; then
  pass "Received SSE message events"
else
  fail "No SSE message events in response"
fi

if echo "$RESPONSE" | grep -q "event: done"; then
  pass "Stream completed with done event"
else
  fail "No done event in stream"
fi

# ── Pause session ───────────────────────────────────────────────────────────

echo ""
echo "--- Pause/Resume ---"
PAUSE_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$SERVER_URL/api/sessions/$SESSION_ID/pause")
if [ "$PAUSE_CODE" = "200" ]; then
  pass "Session paused"
else
  fail "Pause returned $PAUSE_CODE"
fi

# ── Resume session ──────────────────────────────────────────────────────────

RESUME_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$SERVER_URL/api/sessions/$SESSION_ID/resume")
if [ "$RESUME_CODE" = "200" ]; then
  pass "Session resumed"
else
  fail "Resume returned $RESUME_CODE"
fi

# ── End session ─────────────────────────────────────────────────────────────

echo ""
echo "--- Cleanup ---"
END_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$SERVER_URL/api/sessions/$SESSION_ID")
if [ "$END_CODE" = "200" ]; then
  pass "Session ended"
else
  fail "End session returned $END_CODE"
fi

# ── Summary ─────────────────────────────────────────────────────────────────

echo ""
echo "=========================================="
echo "  Smoke test: $PASS passed, $FAIL failed"
echo "=========================================="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
