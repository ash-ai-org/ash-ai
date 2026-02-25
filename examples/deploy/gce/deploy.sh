#!/usr/bin/env bash
#
# deploy-gce.sh — Deploy Ash server to a GCP Compute Engine instance.
#
# Provisions an Ubuntu VM, installs Docker, builds the Ash image,
# starts the server, and deploys the qa-bot example agent.
#
# Usage:
#   cp .env.example .env   # fill in credentials
#   ./scripts/deploy-gce.sh
#
# Prerequisites:
#   - gcloud CLI installed and authenticated (gcloud auth login)
#   - A GCP project with Compute Engine API enabled
#   - ANTHROPIC_API_KEY set (for agent execution)
#
# See docs/guides/gce-deployment.md for the full walkthrough.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Load .env ───────────────────────────────────────────────────────────────

if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  source "$PROJECT_DIR/.env"
  set +a
fi

# ── Required variables ──────────────────────────────────────────────────────

: "${ANTHROPIC_API_KEY:?Set ANTHROPIC_API_KEY in .env}"

# ── Defaults ────────────────────────────────────────────────────────────────

GCP_PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || echo "")}"
GCP_ZONE="${GCP_ZONE:-us-east1-b}"
GCP_MACHINE_TYPE="${GCP_MACHINE_TYPE:-e2-standard-2}"
GCP_DISK_SIZE="${GCP_DISK_SIZE:-30}"
ASH_PORT="${ASH_PORT:-4100}"
INSTANCE_NAME="ash-server"
FIREWALL_RULE_NAME="allow-ash-api"

if [ -z "$GCP_PROJECT_ID" ]; then
  echo "Error: GCP_PROJECT_ID not set in .env and no default project configured."
  echo "Run: gcloud config set project YOUR_PROJECT_ID"
  exit 1
fi

# ── State file (tracks the instance we created) ────────────────────────────

STATE_FILE="$PROJECT_DIR/.gce-instance"

if [ -f "$STATE_FILE" ]; then
  echo "Error: Instance state file exists at $STATE_FILE"
  echo "An instance may already be running. Run ./scripts/teardown-gce.sh first."
  exit 1
fi

# ── Preflight checks ───────────────────────────────────────────────────────

echo "==> Preflight checks"

if ! command -v gcloud &>/dev/null; then
  echo "Error: gcloud CLI not found. Install it: https://cloud.google.com/sdk/docs/install"
  exit 1
fi

echo "  Project:      $GCP_PROJECT_ID"
echo "  Zone:         $GCP_ZONE"
echo "  Machine type: $GCP_MACHINE_TYPE"
echo "  Disk size:    ${GCP_DISK_SIZE}GB"
echo ""

# ── Create firewall rule ───────────────────────────────────────────────────

echo "==> Ensuring firewall rule for port $ASH_PORT..."

if ! gcloud compute firewall-rules describe "$FIREWALL_RULE_NAME" \
  --project="$GCP_PROJECT_ID" &>/dev/null; then
  gcloud compute firewall-rules create "$FIREWALL_RULE_NAME" \
    --project="$GCP_PROJECT_ID" \
    --direction=INGRESS \
    --action=ALLOW \
    --rules=tcp:"$ASH_PORT" \
    --source-ranges=0.0.0.0/0 \
    --target-tags=ash-server \
    --description="Allow Ash API traffic on port $ASH_PORT" \
    --quiet
  echo "  Created firewall rule: $FIREWALL_RULE_NAME"
else
  echo "  Firewall rule already exists: $FIREWALL_RULE_NAME"
fi

# ── Startup script (installs Docker on first boot) ─────────────────────────

STARTUP_SCRIPT_FILE=$(mktemp /tmp/ash-gce-startup-XXXXXX.sh)
cat > "$STARTUP_SCRIPT_FILE" <<'STARTUP'
#!/bin/bash
set -e

apt-get update -y
apt-get install -y docker.io rsync jq
systemctl enable docker
systemctl start docker

LOCALUSER=$(id -un 1000 2>/dev/null || echo "")
if [ -n "$LOCALUSER" ]; then
  usermod -aG docker "$LOCALUSER"
fi

curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

corepack enable pnpm

touch /tmp/.setup-complete
STARTUP

# ── Launch instance ─────────────────────────────────────────────────────────

echo "==> Launching Compute Engine instance..."

gcloud compute instances create "$INSTANCE_NAME" \
  --project="$GCP_PROJECT_ID" \
  --zone="$GCP_ZONE" \
  --machine-type="$GCP_MACHINE_TYPE" \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size="${GCP_DISK_SIZE}GB" \
  --boot-disk-type=pd-ssd \
  --tags=ash-server \
  --metadata-from-file=startup-script="$STARTUP_SCRIPT_FILE" \
  --quiet

rm -f "$STARTUP_SCRIPT_FILE"

echo "  Instance created: $INSTANCE_NAME"

# Get external IP
PUBLIC_IP=$(gcloud compute instances describe "$INSTANCE_NAME" \
  --project="$GCP_PROJECT_ID" \
  --zone="$GCP_ZONE" \
  --format='get(networkInterfaces[0].accessConfigs[0].natIP)')

if [ -z "$PUBLIC_IP" ] || [ "$PUBLIC_IP" = "None" ]; then
  echo "Error: Instance has no external IP."
  echo "Cleaning up..."
  gcloud compute instances delete "$INSTANCE_NAME" \
    --project="$GCP_PROJECT_ID" --zone="$GCP_ZONE" --quiet
  exit 1
fi

echo "  External IP: $PUBLIC_IP"

# Save state for teardown
cat > "$STATE_FILE" <<EOF
INSTANCE_NAME=$INSTANCE_NAME
GCP_PROJECT_ID=$GCP_PROJECT_ID
GCP_ZONE=$GCP_ZONE
FIREWALL_RULE_NAME=$FIREWALL_RULE_NAME
PUBLIC_IP=$PUBLIC_IP
EOF

# ── Wait for SSH ────────────────────────────────────────────────────────────

echo "==> Waiting for SSH to be available (this takes 1-2 minutes)..."

MAX_RETRIES=60
for i in $(seq 1 $MAX_RETRIES); do
  if gcloud compute ssh "$INSTANCE_NAME" \
    --project="$GCP_PROJECT_ID" \
    --zone="$GCP_ZONE" \
    --command="true" \
    --quiet \
    --ssh-flag="-o ConnectTimeout=5" \
    --ssh-flag="-o StrictHostKeyChecking=no" 2>/dev/null; then
    echo "  SSH is ready."
    break
  fi
  if [ "$i" -eq "$MAX_RETRIES" ]; then
    echo "Error: SSH not available after ${MAX_RETRIES} attempts."
    exit 1
  fi
  sleep 5
done

# ── Wait for startup script to complete ─────────────────────────────────────

echo "==> Waiting for Docker installation to complete..."

for i in $(seq 1 60); do
  if gcloud compute ssh "$INSTANCE_NAME" \
    --project="$GCP_PROJECT_ID" \
    --zone="$GCP_ZONE" \
    --command="test -f /tmp/.setup-complete" \
    --quiet \
    --ssh-flag="-o StrictHostKeyChecking=no" 2>/dev/null; then
    echo "  Setup complete."
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "Error: Setup did not complete within 5 minutes."
    echo "SSH in to check: gcloud compute ssh $INSTANCE_NAME --zone=$GCP_ZONE"
    exit 1
  fi
  sleep 5
done

# ── Sync project to GCE ────────────────────────────────────────────────────

echo "==> Syncing project to GCE..."

# Use gcloud compute scp for project transfer
# First, create a tarball excluding unnecessary files (faster than scp --recurse)
TARBALL="/tmp/ash-deploy-$$.tar.gz"
tar czf "$TARBALL" \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='.next' \
  --exclude='dist' \
  --exclude='.env' \
  -C "$PROJECT_DIR" .

gcloud compute scp "$TARBALL" "$INSTANCE_NAME":~/ash-deploy.tar.gz \
  --project="$GCP_PROJECT_ID" \
  --zone="$GCP_ZONE" \
  --quiet

rm -f "$TARBALL"

# Extract on remote
gcloud compute ssh "$INSTANCE_NAME" \
  --project="$GCP_PROJECT_ID" \
  --zone="$GCP_ZONE" \
  --quiet \
  --ssh-flag="-o StrictHostKeyChecking=no" \
  --command="mkdir -p ~/ash && tar xzf ~/ash-deploy.tar.gz -C ~/ash && rm ~/ash-deploy.tar.gz"

echo "  Project synced."

# ── Build and start on GCE ──────────────────────────────────────────────────

echo "==> Building Docker image on GCE (this takes 3-5 minutes)..."

gcloud compute ssh "$INSTANCE_NAME" \
  --project="$GCP_PROJECT_ID" \
  --zone="$GCP_ZONE" \
  --quiet \
  --ssh-flag="-o StrictHostKeyChecking=no" \
  --command="bash -s" <<REMOTE
set -e

cd ~/ash

# Build Docker image (self-contained: copies source, installs deps, builds inside)
sudo docker build -t ash-dev .

# Stop any existing container
sudo docker stop ash-server 2>/dev/null || true
sudo docker rm ash-server 2>/dev/null || true

# Create data directory
mkdir -p ~/.ash/agents

# Start the container (--privileged enables cgroup v2 for sandbox resource limits)
sudo docker run -d \
  --name ash-server \
  --init \
  --privileged \
  --cgroupns=host \
  -p ${ASH_PORT}:4100 \
  -v \$HOME/.ash:/data \
  -e ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY} \
  ash-dev

echo "Container started."
REMOTE

echo "  Docker image built and container started."

# ── Wait for Ash server to be healthy ───────────────────────────────────────

echo "==> Waiting for Ash server to be healthy..."

for i in $(seq 1 30); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://$PUBLIC_IP:$ASH_PORT/health" 2>/dev/null || echo "000")
  if [ "$STATUS" = "200" ]; then
    echo "  Server is healthy!"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "Error: Server did not become healthy within 60 seconds."
    echo "Check logs: gcloud compute ssh $INSTANCE_NAME --zone=$GCP_ZONE --command='docker logs ash-server'"
    exit 1
  fi
  sleep 2
done

# ── Deploy the qa-bot agent ────────────────────────────────────────────────

echo "==> Deploying qa-bot agent..."

gcloud compute ssh "$INSTANCE_NAME" \
  --project="$GCP_PROJECT_ID" \
  --zone="$GCP_ZONE" \
  --quiet \
  --ssh-flag="-o StrictHostKeyChecking=no" \
  --command="bash -s" <<'REMOTE'
set -e

# Copy agent files to the data dir (mounted into container at /data)
cp -r ~/ash/examples/qa-bot/agent ~/.ash/agents/qa-bot

# Deploy via API (the container sees /data/agents/qa-bot)
curl -s -X POST http://localhost:4100/api/agents \
  -H "Content-Type: application/json" \
  -d '{"name":"qa-bot","path":"agents/qa-bot"}' | jq .
REMOTE

echo ""
echo "=========================================="
echo "  Ash server deployed successfully!"
echo "=========================================="
echo ""
echo "  Server URL:  http://$PUBLIC_IP:$ASH_PORT"
echo "  Health:      http://$PUBLIC_IP:$ASH_PORT/health"
echo "  API docs:    http://$PUBLIC_IP:$ASH_PORT/docs"
echo ""
echo "  Instance:    $INSTANCE_NAME"
echo "  External IP: $PUBLIC_IP"
echo "  Zone:        $GCP_ZONE"
echo "  Project:     $GCP_PROJECT_ID"
echo ""
echo "  SSH:         gcloud compute ssh $INSTANCE_NAME --zone=$GCP_ZONE"
echo "  Logs:        gcloud compute ssh $INSTANCE_NAME --zone=$GCP_ZONE --command='docker logs -f ash-server'"
echo ""
echo "  To connect the QA Bot UI locally:"
echo "    ASH_SERVER_URL=http://$PUBLIC_IP:$ASH_PORT pnpm --filter qa-bot dev"
echo ""
echo "  To use the SDK:"
echo "    const client = new AshClient({ serverUrl: 'http://$PUBLIC_IP:$ASH_PORT' });"
echo ""
echo "  To tear down:"
echo "    ./scripts/teardown-gce.sh"
echo ""
