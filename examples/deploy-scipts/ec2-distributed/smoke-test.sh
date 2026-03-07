#!/usr/bin/env bash
#
# smoke-test-ec2-distributed.sh — Verify the distributed EC2 Ash deployment.
#
# Runs all standard smoke tests plus distributed-specific checks:
#   - Runner registration via /health
#   - Runner list via /api/internal/runners
#   - Session routing (runnerId != null / __local__)
#   - Sandbox isolation (routed through runner)
#
# Usage:
#   ./scripts/smoke-test-ec2-distributed.sh                       # reads from .ec2-distributed
#   ./scripts/smoke-test-ec2-distributed.sh http://1.2.3.4:4100   # explicit URL

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Determine server URL
if [ -n "${1:-}" ]; then
  SERVER_URL="$1"
else
  # Load env files
  if [ -f "$PROJECT_DIR/.env" ]; then
    set -a; source "$PROJECT_DIR/.env"; set +a
  fi
  if [ -f "$PROJECT_DIR/.env.local" ]; then
    set -a; source "$PROJECT_DIR/.env.local"; set +a
  fi

  export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-us-east-1}"

  # Try distributed state file first
  STATE_FILE="$PROJECT_DIR/.ec2-distributed"
  if [ -f "$STATE_FILE" ]; then
    source "$STATE_FILE"
    export AWS_DEFAULT_REGION="${REGION:-$AWS_DEFAULT_REGION}"
    SERVER_PUBLIC_IP="${SERVER_PUBLIC_IP:-}"

    # If no IP in state file, look it up
    if [ -z "$SERVER_PUBLIC_IP" ] && [ -n "${SERVER_INSTANCE_ID:-}" ]; then
      SERVER_PUBLIC_IP=$(aws ec2 describe-instances \
        --instance-ids "$SERVER_INSTANCE_ID" \
        --query 'Reservations[0].Instances[0].PublicIpAddress' \
        --output text)
    fi
  else
    # Discover running ash-server-distributed instance by Name tag
    SERVER_PUBLIC_IP=$(aws ec2 describe-instances \
      --filters "Name=tag:Name,Values=ash-server-distributed" "Name=instance-state-name,Values=running" \
      --query 'Reservations[0].Instances[0].PublicIpAddress' \
      --output text 2>/dev/null || echo "")
  fi

  if [ -z "${SERVER_PUBLIC_IP:-}" ] || [ "$SERVER_PUBLIC_IP" = "None" ]; then
    echo "Error: No running distributed Ash deployment found."
    echo ""
    echo "To deploy:"
    echo "  make ec2-deploy-distributed"
    echo ""
    echo "Or test against a running server directly:"
    echo "  $0 http://host:4100"
    exit 1
  fi

  SERVER_URL="http://$SERVER_PUBLIC_IP:${ASH_PORT:-4100}"
fi

echo "==> Distributed smoke test against $SERVER_URL"

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

# ── Runner registration ────────────────────────────────────────────────────

echo ""
echo "--- Runner Registration ---"
HEALTH_BODY=$(curl -s "$SERVER_URL/health")
REMOTE_RUNNERS=$(echo "$HEALTH_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('remoteRunners', 0))" 2>/dev/null || echo "0")

if [ "$REMOTE_RUNNERS" -ge 1 ]; then
  pass "Runner registered (remoteRunners=$REMOTE_RUNNERS)"
else
  fail "No remote runners registered (remoteRunners=$REMOTE_RUNNERS)"
fi

# ── Runner list (internal API) ─────────────────────────────────────────────

# Pass internal secret as header if available
AUTH_HEADER=""
if [ -n "${ASH_INTERNAL_SECRET:-}" ]; then
  AUTH_HEADER="-H \"Authorization: Bearer $ASH_INTERNAL_SECRET\""
fi

RUNNERS_RESP=$(eval curl -s "$SERVER_URL/api/internal/runners" $AUTH_HEADER 2>/dev/null || echo "{}")
RUNNER_COUNT=$(echo "$RUNNERS_RESP" | python3 -c "
import sys, json
data = json.load(sys.stdin)
runners = data.get('runners', data) if isinstance(data, dict) else data
print(len(runners) if isinstance(runners, list) else 0)
" 2>/dev/null || echo "0")

if [ "$RUNNER_COUNT" -ge 1 ]; then
  pass "Runner list shows $RUNNER_COUNT runner(s)"
else
  fail "Runner list empty or unavailable: $RUNNERS_RESP"
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

# ── Create session + verify routing ─────────────────────────────────────────

echo ""
echo "--- Session Lifecycle + Routing ---"
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

# Check session routing — runnerId should not be null or __local__
RUNNER_ID=$(echo "$CREATE_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['session'].get('runnerId', 'null'))" 2>/dev/null || echo "null")

if [ "$RUNNER_ID" != "null" ] && [ "$RUNNER_ID" != "__local__" ] && [ "$RUNNER_ID" != "None" ] && [ -n "$RUNNER_ID" ]; then
  pass "Session routed to remote runner: $RUNNER_ID"
else
  fail "Session not routed to remote runner (runnerId=$RUNNER_ID)"
fi

# ── Send message (SSE streaming) ────────────────────────────────────────────

echo ""
echo "--- Message Streaming ---"
RESPONSE=$(curl -s -N -X POST "$SERVER_URL/api/sessions/$SESSION_ID/messages" \
  -H "Content-Type: application/json" \
  -d '{"content":"Reply with exactly: hello smoke test"}' \
  --max-time 60)

if echo "$RESPONSE" | grep -qE "event: (text_delta|message|turn_complete)"; then
  pass "Received SSE stream events"
else
  fail "No SSE stream events in response"
fi

if echo "$RESPONSE" | grep -q "event: done"; then
  pass "Stream completed with done event"
else
  fail "No done event in stream"
fi

# ── Pause/Resume ───────────────────────────────────────────────────────────

echo ""
echo "--- Pause/Resume ---"
PAUSE_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$SERVER_URL/api/sessions/$SESSION_ID/pause")
if [ "$PAUSE_CODE" = "200" ]; then
  pass "Session paused"
else
  fail "Pause returned $PAUSE_CODE"
fi

RESUME_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$SERVER_URL/api/sessions/$SESSION_ID/resume")
if [ "$RESUME_CODE" = "200" ]; then
  pass "Session resumed"
else
  fail "Resume returned $RESUME_CODE"
fi

# ── Sandbox isolation ──────────────────────────────────────────────────────

echo ""
echo "--- Sandbox Isolation ---"

# Helper: exec command in a session
exec_in() {
  local SID="$1"
  local CMD="$2"
  local JSON_CMD
  JSON_CMD=$(python3 -c "import json,sys; print(json.dumps({'command': sys.argv[1]}))" "$CMD")
  curl -s -X POST "$SERVER_URL/api/sessions/$SID/exec" \
    -H "Content-Type: application/json" \
    -d "$JSON_CMD" 2>/dev/null
}

exec_stdout() {
  local SID="$1"
  local CMD="$2"
  exec_in "$SID" "$CMD" | python3 -c "import sys,json; print(json.load(sys.stdin).get('stdout',''))" 2>/dev/null
}

# Create a second session for cross-sandbox tests
CREATE_B=$(curl -s -X POST "$SERVER_URL/api/sessions" \
  -H "Content-Type: application/json" \
  -d '{"agent":"qa-bot"}')

SESSION_B=$(echo "$CREATE_B" | python3 -c "import sys,json; print(json.load(sys.stdin)['session']['id'])" 2>/dev/null || echo "")

if [ -n "$SESSION_B" ]; then
  pass "Second session created: $SESSION_B"
else
  fail "Failed to create second session: $CREATE_B"
fi

if [ -n "$SESSION_B" ]; then
  # Get workspace paths
  PWD_A=$(exec_stdout "$SESSION_ID" "pwd")
  PWD_B=$(exec_stdout "$SESSION_B" "pwd")

  if [ -n "$PWD_A" ] && [ -n "$PWD_B" ] && [ "$PWD_A" != "$PWD_B" ]; then
    pass "Sessions have separate workspaces"
  else
    fail "Workspaces not properly separated (A=$PWD_A, B=$PWD_B)"
  fi

  # Write a secret in session A
  exec_in "$SESSION_ID" "echo TOP_SECRET_smoke > secret.txt" > /dev/null 2>&1

  # Session A can read its own file
  READ_A=$(exec_stdout "$SESSION_ID" "cat secret.txt")
  if echo "$READ_A" | grep -q "TOP_SECRET_smoke"; then
    pass "Session A can read its own secret"
  else
    fail "Session A cannot read its own file"
  fi

  # Session B cannot read session A's secret via absolute path
  CROSS_RESP=$(exec_in "$SESSION_B" "cat ${PWD_A}/secret.txt 2>&1")
  CROSS_OUT=$(echo "$CROSS_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('stdout',''))" 2>/dev/null)
  if echo "$CROSS_OUT" | grep -q "TOP_SECRET_smoke"; then
    fail "Session B read session A's secret via absolute path (ISOLATION BROKEN)"
  else
    pass "Session B cannot read session A's workspace"
  fi

  # Session B cannot write to session A's workspace
  exec_in "$SESSION_B" "echo HACKED > ${PWD_A}/pwned.txt" > /dev/null 2>&1
  VERIFY=$(exec_stdout "$SESSION_ID" "cat pwned.txt 2>&1")
  if echo "$VERIFY" | grep -q "HACKED"; then
    fail "Session B wrote into session A's workspace (ISOLATION BROKEN)"
  else
    pass "Session B cannot write to session A's workspace"
  fi

  # Each sandbox has isolated /tmp
  exec_in "$SESSION_ID" "echo tmp_secret > /tmp/marker.txt" > /dev/null 2>&1
  TMP_CHECK=$(exec_stdout "$SESSION_B" "cat /tmp/marker.txt 2>&1")
  if echo "$TMP_CHECK" | grep -q "tmp_secret"; then
    fail "Session B can read session A's /tmp files (ISOLATION BROKEN)"
  else
    pass "Each sandbox has private /tmp"
  fi

  # Host filesystem is read-only
  WRITE_HOST=$(exec_in "$SESSION_ID" "touch /usr/SHOULD_FAIL 2>&1")
  WRITE_EXIT=$(echo "$WRITE_HOST" | python3 -c "import sys,json; print(json.load(sys.stdin).get('exitCode',-1))" 2>/dev/null)
  if [ "$WRITE_EXIT" != "0" ]; then
    pass "Host filesystem is read-only from sandbox"
  else
    fail "Sandbox can write to host filesystem"
  fi
fi

# ── End sessions ───────────────────────────────────────────────────────────

echo ""
echo "--- Cleanup ---"
END_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$SERVER_URL/api/sessions/$SESSION_ID")
if [ "$END_CODE" = "200" ]; then
  pass "Session A ended"
else
  fail "End session A returned $END_CODE"
fi

if [ -n "${SESSION_B:-}" ]; then
  END_B_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$SERVER_URL/api/sessions/$SESSION_B")
  if [ "$END_B_CODE" = "200" ]; then
    pass "Session B ended"
  else
    fail "End session B returned $END_B_CODE"
  fi
fi

# ── Summary ─────────────────────────────────────────────────────────────────

echo ""
echo "=========================================="
echo "  Distributed smoke test: $PASS passed, $FAIL failed"
echo "=========================================="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
