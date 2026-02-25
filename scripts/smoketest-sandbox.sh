#!/usr/bin/env bash
#
# smoketest-sandbox.sh — End-to-end smoketest with sandbox isolation.
#
# Starts the server, deploys an agent, creates two sessions,
# and verifies that one session CANNOT access the other's workspace.
#
# Usage:
#   ./scripts/smoketest-sandbox.sh              # build + start with ash, run tests, stop
#   ./scripts/smoketest-sandbox.sh --dev        # use ash-dev (built from source)
#   ./scripts/smoketest-sandbox.sh --no-server  # skip start/stop (server already running)
#
set -uo pipefail

# ── CLI selection ─────────────────────────────────────────────────────────────
# Default: "ash" (released CLI). Use --dev for "ash-dev" (built from source).
ASH_CMD="ash"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
AGENT_DIR="$PROJECT_DIR/examples/test-agent"
SERVER_URL="http://localhost:4100"
MANAGE_SERVER=true

for arg in "$@"; do
  case "$arg" in
    --dev) ASH_CMD="ash-dev" ;;
    --no-server) MANAGE_SERVER=false ;;
  esac
done

# ── Formatting ────────────────────────────────────────────────────────────────

BOLD="\033[1m"
RED="\033[31m"
GREEN="\033[32m"
YELLOW="\033[33m"
CYAN="\033[36m"
DIM="\033[2m"
RESET="\033[0m"

PASS=0
FAIL=0
TOTAL=0

pass() { PASS=$((PASS + 1)); TOTAL=$((TOTAL + 1)); echo -e "  ${GREEN}PASS${RESET} $1"; }
fail() { FAIL=$((FAIL + 1)); TOTAL=$((TOTAL + 1)); echo -e "  ${RED}FAIL${RESET} $1"; }
section() { echo -e "\n${BOLD}${CYAN}── $1 ──${RESET}"; }
info() { echo -e "  ${DIM}$1${RESET}"; }

cleanup() {
  section "Cleanup"

  # End sessions
  for SID in "$SESSION_A" "$SESSION_B"; do
    if [ -n "${SID:-}" ]; then
      curl -s -o /dev/null -X DELETE "$SERVER_URL/api/sessions/$SID" 2>/dev/null || true
      info "Ended session ${SID:0:8}"
    fi
  done

  # Delete agent
  curl -s -o /dev/null -X DELETE "$SERVER_URL/api/agents/smoke-agent" 2>/dev/null || true
  info "Deleted agent"

  # Stop server
  if [ "$MANAGE_SERVER" = true ]; then
    $ASH_CMD stop 2>/dev/null || true
    info "Stopped server ($ASH_CMD)"
  fi
}

SESSION_A=""
SESSION_B=""
trap cleanup EXIT

# ── Start server ──────────────────────────────────────────────────────────────

if [ "$MANAGE_SERVER" = true ]; then
  section "Starting server ($ASH_CMD)"

  if [ "$ASH_CMD" = "ash-dev" ]; then
    # Build Docker image for local dev
    info "Building Docker image (ash-dev)..."
    docker build -t ash-dev "$PROJECT_DIR" -q > /dev/null 2>&1
    info "Docker image built"
  fi

  # Stop any existing instance
  $ASH_CMD stop 2>/dev/null || true

  # Start
  if [ "$ASH_CMD" = "ash-dev" ]; then
    $ASH_CMD start --image ash-dev --no-pull 2>/dev/null &
  else
    $ASH_CMD start 2>/dev/null &
  fi
  START_PID=$!

  # Wait for health
  info "Waiting for server to be ready..."
  for i in $(seq 1 30); do
    if curl -s "$SERVER_URL/health" > /dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$SERVER_URL/health" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    pass "Server is healthy"
  else
    fail "Server not ready (HTTP $HTTP_CODE)"
    echo -e "\n${RED}Cannot continue without server. Aborting.${RESET}"
    exit 1
  fi
else
  section "Using existing server"
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$SERVER_URL/health" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    pass "Server is healthy"
  else
    fail "Server not reachable at $SERVER_URL"
    exit 1
  fi
fi

# ── Deploy agent ──────────────────────────────────────────────────────────────

section "Deploy agent"

DEPLOY_RESP=$(curl -s -X POST "$SERVER_URL/api/agents" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"smoke-agent\",\"path\":\"/mnt/agents/smoke-agent\"}" 2>/dev/null)

# If the agent dir doesn't exist inside Docker, deploy via CLI which copies it
$ASH_CMD deploy "$AGENT_DIR" -n smoke-agent > /dev/null 2>&1 || true

AGENT_CHECK=$(curl -s "$SERVER_URL/api/agents/smoke-agent" 2>/dev/null)
if echo "$AGENT_CHECK" | grep -q '"name":"smoke-agent"'; then
  pass "Agent 'smoke-agent' deployed"
else
  fail "Agent deployment failed: $AGENT_CHECK"
  exit 1
fi

# ── Create two sessions ──────────────────────────────────────────────────────

section "Create sessions"

RESP_A=$(curl -s -X POST "$SERVER_URL/api/sessions" \
  -H "Content-Type: application/json" \
  -d '{"agent":"smoke-agent"}')

SESSION_A=$(echo "$RESP_A" | python3 -c "import sys,json; print(json.load(sys.stdin)['session']['id'])" 2>/dev/null || echo "")

if [ -n "$SESSION_A" ]; then
  pass "Session A created: ${SESSION_A:0:8}..."
else
  fail "Session A creation failed: $RESP_A"
  exit 1
fi

RESP_B=$(curl -s -X POST "$SERVER_URL/api/sessions" \
  -H "Content-Type: application/json" \
  -d '{"agent":"smoke-agent"}')

SESSION_B=$(echo "$RESP_B" | python3 -c "import sys,json; print(json.load(sys.stdin)['session']['id'])" 2>/dev/null || echo "")

if [ -n "$SESSION_B" ]; then
  pass "Session B created: ${SESSION_B:0:8}..."
else
  fail "Session B creation failed: $RESP_B"
  exit 1
fi

# ── Helper: exec in session ───────────────────────────────────────────────────

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

exec_exit_code() {
  local SID="$1"
  local CMD="$2"
  exec_in "$SID" "$CMD" | python3 -c "import sys,json; print(json.load(sys.stdin).get('exitCode',-1))" 2>/dev/null
}

# ── Basic exec works ──────────────────────────────────────────────────────────

section "Basic sandbox functionality"

PWD_A=$(exec_stdout "$SESSION_A" "pwd")
PWD_B=$(exec_stdout "$SESSION_B" "pwd")

info "Session A workspace: $PWD_A"
info "Session B workspace: $PWD_B"

if [ -n "$PWD_A" ] && [ -n "$PWD_B" ] && [ "$PWD_A" != "$PWD_B" ]; then
  pass "Sessions have separate workspaces"
else
  fail "Workspaces not properly separated"
fi

# Write a secret file in session A
WRITE_OUT=$(exec_stdout "$SESSION_A" "echo TOP_SECRET_a1b2c3 > secret.txt && echo ok")
if echo "$WRITE_OUT" | grep -q "ok"; then
  pass "Session A: wrote secret.txt"
else
  fail "Session A: failed to write secret.txt"
fi

# Session A can read its own file
READ_A=$(exec_stdout "$SESSION_A" "cat secret.txt")
if echo "$READ_A" | grep -q "TOP_SECRET_a1b2c3"; then
  pass "Session A: can read its own secret.txt"
else
  fail "Session A: cannot read its own file"
fi

# Session B has its own empty workspace
FILES_B=$(exec_stdout "$SESSION_B" "ls -la")
if ! echo "$FILES_B" | grep -q "secret.txt"; then
  pass "Session B: does not have session A's files"
else
  fail "Session B: can see session A's secret.txt in listing"
fi

# ── Sandbox isolation tests ───────────────────────────────────────────────────

section "Sandbox filesystem isolation"

# Test 1: Session B cannot read Session A's secret via absolute path
READ_CROSS=$(exec_in "$SESSION_B" "cat ${PWD_A}/secret.txt 2>&1")
CROSS_EXIT=$(echo "$READ_CROSS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('exitCode',-1))" 2>/dev/null)
CROSS_OUT=$(echo "$READ_CROSS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('stdout',''))" 2>/dev/null)

if echo "$CROSS_OUT" | grep -q "TOP_SECRET_a1b2c3"; then
  fail "Session B read session A's secret via absolute path (ISOLATION BROKEN)"
else
  pass "Session B cannot read session A's workspace"
fi

# Test 2: Session B cannot list the sandboxes directory
SANDBOXES_DIR=$(echo "$PWD_A" | sed 's|/[^/]*/workspace$||')
LS_SANDBOXES=$(exec_stdout "$SESSION_B" "ls $SANDBOXES_DIR 2>&1")

if echo "$LS_SANDBOXES" | grep -q "$SESSION_A"; then
  fail "Session B can see session A's sandbox ID in parent dir (ISOLATION BROKEN)"
else
  pass "Session B cannot enumerate other sandboxes"
fi

# Test 3: Session B cannot traverse up to find siblings
LS_PARENT=$(exec_stdout "$SESSION_B" "ls ../../ 2>&1")
if echo "$LS_PARENT" | grep -q "$SESSION_A"; then
  fail "Session B found session A via relative traversal (ISOLATION BROKEN)"
else
  pass "Session B cannot traverse to other sandboxes"
fi

# Test 4: Session B cannot write into Session A's workspace
exec_in "$SESSION_B" "echo HACKED > ${PWD_A}/pwned.txt" > /dev/null 2>&1
VERIFY_WRITE=$(exec_stdout "$SESSION_A" "cat pwned.txt 2>&1")
if echo "$VERIFY_WRITE" | grep -q "HACKED"; then
  fail "Session B wrote into session A's workspace (ISOLATION BROKEN)"
else
  pass "Session B cannot write to session A's workspace"
fi

# Test 5: Each sandbox has isolated /tmp
exec_in "$SESSION_A" "echo tmp_secret > /tmp/marker_a.txt" > /dev/null 2>&1
TMP_CHECK=$(exec_stdout "$SESSION_B" "cat /tmp/marker_a.txt 2>&1")
if echo "$TMP_CHECK" | grep -q "tmp_secret"; then
  fail "Session B can read session A's /tmp files (ISOLATION BROKEN)"
else
  pass "Each sandbox has private /tmp"
fi

# Test 6: Host filesystem is read-only from sandbox
WRITE_HOST=$(exec_exit_code "$SESSION_A" "touch /usr/SHOULD_FAIL 2>&1")
if [ "$WRITE_HOST" != "0" ]; then
  pass "Host filesystem is read-only from sandbox"
else
  fail "Sandbox can write to host filesystem"
fi

# ── Session lifecycle ─────────────────────────────────────────────────────────

section "Session lifecycle"

# Pause
PAUSE_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$SERVER_URL/api/sessions/$SESSION_A/pause")
if [ "$PAUSE_CODE" = "200" ]; then
  pass "Session A paused"
else
  fail "Pause returned $PAUSE_CODE"
fi

# Resume
RESUME_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$SERVER_URL/api/sessions/$SESSION_A/resume")
if [ "$RESUME_CODE" = "200" ]; then
  pass "Session A resumed"
else
  fail "Resume returned $RESUME_CODE"
fi

# File still exists after resume
READ_AFTER=$(exec_stdout "$SESSION_A" "cat secret.txt")
if echo "$READ_AFTER" | grep -q "TOP_SECRET_a1b2c3"; then
  pass "Session A: secret.txt persists after pause/resume"
else
  fail "Session A: file lost after pause/resume"
fi

# List sessions
LIST_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$SERVER_URL/api/sessions")
if [ "$LIST_CODE" = "200" ]; then
  pass "Session list works"
else
  fail "Session list returned $LIST_CODE"
fi

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}══════════════════════════════════════════${RESET}"
if [ "$FAIL" -eq 0 ]; then
  echo -e "${BOLD}  ${GREEN}All $TOTAL tests passed${RESET}"
else
  echo -e "${BOLD}  ${GREEN}$PASS passed${RESET}, ${RED}$FAIL failed${RESET} (of $TOTAL)"
fi
echo -e "${BOLD}══════════════════════════════════════════${RESET}"
echo ""

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
