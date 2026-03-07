#!/usr/bin/env bash
#
# deploy-ec2-distributed.sh — Deploy Ash in distributed mode (coordinator + runner)
# on two separate EC2 instances.
#
# Provisions two Ubuntu instances from the same ash-dev Docker image:
#   - Server: runs in ASH_MODE=coordinator with ASH_INTERNAL_SECRET
#   - Runner: CMD override to runner entrypoint, connects to server via private IP
#
# Usage:
#   cp .env.example .env   # fill in credentials
#   ./scripts/deploy-ec2-distributed.sh
#
# Prerequisites:
#   - AWS CLI v2 installed and configured (or credentials in .env)
#   - An EC2 key pair created in your target region
#   - ANTHROPIC_API_KEY set (for agent execution)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Load .env + .env.local ───────────────────────────────────────────────────

if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  source "$PROJECT_DIR/.env"
  set +a
fi

if [ -f "$PROJECT_DIR/.env.local" ]; then
  set -a
  source "$PROJECT_DIR/.env.local"
  set +a
fi

# ── Required variables ──────────────────────────────────────────────────────

: "${ANTHROPIC_API_KEY:?Set ANTHROPIC_API_KEY in .env}"
: "${AWS_ACCESS_KEY_ID:?Set AWS_ACCESS_KEY_ID in .env}"
: "${AWS_SECRET_ACCESS_KEY:?Set AWS_SECRET_ACCESS_KEY in .env}"
: "${EC2_KEY_NAME:?Set EC2_KEY_NAME in .env (your EC2 key pair name)}"
: "${EC2_KEY_PATH:?Set EC2_KEY_PATH in .env (path to private key, e.g. ~/.ssh/my-key.pem)}"

# ── Defaults ────────────────────────────────────────────────────────────────

AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-us-east-1}"
EC2_INSTANCE_TYPE="${EC2_INSTANCE_TYPE:-t3.large}"
EC2_VOLUME_SIZE="${EC2_VOLUME_SIZE:-30}"
ASH_PORT="${ASH_PORT:-4100}"
ASH_RUNNER_PORT="${ASH_RUNNER_PORT:-4200}"

# Auto-generate internal secret if not set
ASH_INTERNAL_SECRET="${ASH_INTERNAL_SECRET:-$(openssl rand -hex 32)}"

export AWS_DEFAULT_REGION
export AWS_ACCESS_KEY_ID
export AWS_SECRET_ACCESS_KEY

# ── State file (tracks instances we created) ────────────────────────────────

STATE_FILE="$PROJECT_DIR/.ec2-distributed"

if [ -f "$STATE_FILE" ]; then
  echo "Error: Distributed state file exists at $STATE_FILE"
  echo "Instances may already be running. Run ./scripts/teardown-ec2-distributed.sh first."
  exit 1
fi

# ── Preflight checks ───────────────────────────────────────────────────────

echo "==> Preflight checks"

if ! command -v aws &>/dev/null; then
  echo "Error: AWS CLI not found. Install it: https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html"
  exit 1
fi

if [ ! -f "$EC2_KEY_PATH" ]; then
  echo "Error: Key file not found at $EC2_KEY_PATH"
  exit 1
fi

chmod 400 "$EC2_KEY_PATH"

echo "  Region:        $AWS_DEFAULT_REGION"
echo "  Instance type: $EC2_INSTANCE_TYPE"
echo "  Key pair:      $EC2_KEY_NAME"
echo "  Mode:          distributed (coordinator + runner)"
echo ""

# ── Look up Ubuntu 22.04 AMI ───────────────────────────────────────────────

echo "==> Finding Ubuntu 22.04 AMI..."

AMI_ID=$(aws ec2 describe-images \
  --owners 099720109477 \
  --filters \
    "Name=name,Values=ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*" \
    "Name=state,Values=available" \
  --query 'Images | sort_by(@, &CreationDate) | [-1].ImageId' \
  --output text)

if [ "$AMI_ID" = "None" ] || [ -z "$AMI_ID" ]; then
  echo "Error: Could not find Ubuntu 22.04 AMI in $AWS_DEFAULT_REGION"
  exit 1
fi
echo "  AMI: $AMI_ID"

# ── Create security group ──────────────────────────────────────────────────

echo "==> Creating security group: ash-distributed-sg"

SG_ID=$(aws ec2 create-security-group \
  --group-name "ash-distributed-sg" \
  --description "Ash distributed - SSH + API public, runner internal" \
  --query 'GroupId' \
  --output text 2>/dev/null || \
  aws ec2 describe-security-groups \
    --group-names "ash-distributed-sg" \
    --query 'SecurityGroups[0].GroupId' \
    --output text)

# SSH access (public)
aws ec2 authorize-security-group-ingress \
  --group-id "$SG_ID" \
  --protocol tcp --port 22 --cidr 0.0.0.0/0 2>/dev/null || true

# Ash API access (public)
aws ec2 authorize-security-group-ingress \
  --group-id "$SG_ID" \
  --protocol tcp --port "$ASH_PORT" --cidr 0.0.0.0/0 2>/dev/null || true

# Runner port — internal only (SG self-reference)
aws ec2 authorize-security-group-ingress \
  --group-id "$SG_ID" \
  --protocol tcp --port "$ASH_RUNNER_PORT" \
  --source-group "$SG_ID" 2>/dev/null || true

echo "  Security group: $SG_ID (ports 22, $ASH_PORT public; $ASH_RUNNER_PORT internal)"

# ── User-data script (installs Docker on first boot) ───────────────────────

USER_DATA=$(cat <<'USERDATA'
#!/bin/bash
set -e

# Install Docker and utilities
apt-get update -y
apt-get install -y docker.io rsync jq
systemctl enable docker
systemctl start docker

# Allow ubuntu user to run Docker without sudo
usermod -aG docker ubuntu

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install pnpm
corepack enable pnpm

# Signal that setup is complete
touch /home/ubuntu/.setup-complete
USERDATA
)

# ── Launch instances ─────────────────────────────────────────────────────────

SUBNET_ARG=""
if [ -n "${EC2_SUBNET_ID:-}" ]; then
  SUBNET_ARG="--subnet-id $EC2_SUBNET_ID"
fi

echo "==> Launching server instance..."

SERVER_INSTANCE_ID=$(aws ec2 run-instances \
  --image-id "$AMI_ID" \
  --instance-type "$EC2_INSTANCE_TYPE" \
  --key-name "$EC2_KEY_NAME" \
  --security-group-ids "$SG_ID" \
  $SUBNET_ARG \
  --block-device-mappings "DeviceName=/dev/sda1,Ebs={VolumeSize=$EC2_VOLUME_SIZE,VolumeType=gp3}" \
  --user-data "$USER_DATA" \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=ash-server-distributed}]" \
  --query 'Instances[0].InstanceId' \
  --output text)

echo "  Server instance ID: $SERVER_INSTANCE_ID"

echo "==> Launching runner instance..."

RUNNER_INSTANCE_ID=$(aws ec2 run-instances \
  --image-id "$AMI_ID" \
  --instance-type "$EC2_INSTANCE_TYPE" \
  --key-name "$EC2_KEY_NAME" \
  --security-group-ids "$SG_ID" \
  $SUBNET_ARG \
  --block-device-mappings "DeviceName=/dev/sda1,Ebs={VolumeSize=$EC2_VOLUME_SIZE,VolumeType=gp3}" \
  --user-data "$USER_DATA" \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=ash-runner-distributed}]" \
  --query 'Instances[0].InstanceId' \
  --output text)

echo "  Runner instance ID: $RUNNER_INSTANCE_ID"

# Save state early for partial teardown
cat > "$STATE_FILE" <<EOF
SERVER_INSTANCE_ID=$SERVER_INSTANCE_ID
RUNNER_INSTANCE_ID=$RUNNER_INSTANCE_ID
SG_ID=$SG_ID
REGION=$AWS_DEFAULT_REGION
ASH_INTERNAL_SECRET=$ASH_INTERNAL_SECRET
EOF

# ── Wait for both instances to be running ──────────────────────────────────

echo "==> Waiting for instances to enter 'running' state..."
aws ec2 wait instance-running --instance-ids "$SERVER_INSTANCE_ID" "$RUNNER_INSTANCE_ID"

SERVER_PUBLIC_IP=$(aws ec2 describe-instances \
  --instance-ids "$SERVER_INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --output text)

SERVER_PRIVATE_IP=$(aws ec2 describe-instances \
  --instance-ids "$SERVER_INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].PrivateIpAddress' \
  --output text)

RUNNER_PUBLIC_IP=$(aws ec2 describe-instances \
  --instance-ids "$RUNNER_INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --output text)

RUNNER_PRIVATE_IP=$(aws ec2 describe-instances \
  --instance-ids "$RUNNER_INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].PrivateIpAddress' \
  --output text)

for VAR_NAME in SERVER_PUBLIC_IP SERVER_PRIVATE_IP RUNNER_PUBLIC_IP RUNNER_PRIVATE_IP; do
  VAL="${!VAR_NAME}"
  if [ "$VAL" = "None" ] || [ -z "$VAL" ]; then
    echo "Error: $VAR_NAME not available. Ensure your VPC/subnet assigns public IPs."
    echo "Cleaning up..."
    "$SCRIPT_DIR/teardown-ec2-distributed.sh"
    exit 1
  fi
done

# Update state file with IPs
cat >> "$STATE_FILE" <<EOF
SERVER_PUBLIC_IP=$SERVER_PUBLIC_IP
RUNNER_PUBLIC_IP=$RUNNER_PUBLIC_IP
EOF

echo "  Server: $SERVER_PUBLIC_IP (private: $SERVER_PRIVATE_IP)"
echo "  Runner: $RUNNER_PUBLIC_IP (private: $RUNNER_PRIVATE_IP)"

SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=5 -o LogLevel=ERROR"

# ── Wait for SSH on both instances ─────────────────────────────────────────

wait_ssh() {
  local IP="$1"
  local LABEL="$2"
  echo "==> Waiting for SSH on $LABEL ($IP)..."
  for i in $(seq 1 60); do
    if ssh $SSH_OPTS -i "$EC2_KEY_PATH" "ubuntu@$IP" "true" 2>/dev/null; then
      echo "  SSH ready on $LABEL."
      return 0
    fi
    if [ "$i" -eq 60 ]; then
      echo "Error: SSH not available on $LABEL after 60 attempts."
      exit 1
    fi
    sleep 5
  done
}

wait_ssh "$SERVER_PUBLIC_IP" "server"
wait_ssh "$RUNNER_PUBLIC_IP" "runner"

# ── Wait for user-data setup on both ───────────────────────────────────────

wait_setup() {
  local IP="$1"
  local LABEL="$2"
  echo "==> Waiting for setup on $LABEL ($IP)..."
  for i in $(seq 1 60); do
    if ssh $SSH_OPTS -i "$EC2_KEY_PATH" "ubuntu@$IP" \
      "test -f /home/ubuntu/.setup-complete" 2>/dev/null; then
      echo "  Setup complete on $LABEL."
      return 0
    fi
    if [ "$i" -eq 60 ]; then
      echo "Error: Setup did not complete on $LABEL within 5 minutes."
      echo "SSH in to check: ssh -i $EC2_KEY_PATH ubuntu@$IP"
      exit 1
    fi
    sleep 5
  done
}

wait_setup "$SERVER_PUBLIC_IP" "server"
wait_setup "$RUNNER_PUBLIC_IP" "runner"

# ── Sync project + build Docker image on both (in parallel) ────────────────

echo "==> Syncing project and building Docker image on both instances..."

build_on() {
  local IP="$1"
  local LABEL="$2"

  rsync -az --progress \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude '.next' \
    --exclude 'dist' \
    --exclude '.env' \
    -e "ssh $SSH_OPTS -i $EC2_KEY_PATH" \
    "$PROJECT_DIR/" "ubuntu@$IP:~/ash/"

  ssh $SSH_OPTS -i "$EC2_KEY_PATH" "ubuntu@$IP" bash <<REMOTE
set -e
cd ~/ash
docker build -t ash-dev .
mkdir -p ~/.ash/agents
REMOTE

  echo "  Docker image built on $LABEL."
}

build_on "$SERVER_PUBLIC_IP" "server" &
PID_SERVER_BUILD=$!

build_on "$RUNNER_PUBLIC_IP" "runner" &
PID_RUNNER_BUILD=$!

wait $PID_SERVER_BUILD
wait $PID_RUNNER_BUILD

echo "  Both instances ready."

# ── Start server container (coordinator mode) ─────────────────────────────

echo "==> Starting server container (ASH_MODE=coordinator)..."

ssh $SSH_OPTS -i "$EC2_KEY_PATH" "ubuntu@$SERVER_PUBLIC_IP" bash <<REMOTE
set -e

# Stop any existing container
docker stop ash-server 2>/dev/null || true
docker rm ash-server 2>/dev/null || true

docker run -d \
  --name ash-server \
  --init \
  --privileged \
  --cgroupns=host \
  -p ${ASH_PORT}:4100 \
  -v /home/ubuntu/.ash:/data \
  -e ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY} \
  -e ASH_MODE=coordinator \
  -e ASH_INTERNAL_SECRET=${ASH_INTERNAL_SECRET} \
  ash-dev

echo "Server container started."
REMOTE

# ── Wait for server to be healthy ──────────────────────────────────────────

echo "==> Waiting for server to be healthy..."

for i in $(seq 1 30); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://$SERVER_PUBLIC_IP:$ASH_PORT/health" 2>/dev/null || echo "000")
  if [ "$STATUS" = "200" ]; then
    echo "  Server is healthy!"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "Error: Server did not become healthy within 60 seconds."
    echo "Check logs: ssh -i $EC2_KEY_PATH ubuntu@$SERVER_PUBLIC_IP 'docker logs ash-server'"
    exit 1
  fi
  sleep 2
done

# ── Start runner container ─────────────────────────────────────────────────

echo "==> Starting runner container..."

ssh $SSH_OPTS -i "$EC2_KEY_PATH" "ubuntu@$RUNNER_PUBLIC_IP" bash <<REMOTE
set -e

# Stop any existing container
docker stop ash-runner 2>/dev/null || true
docker rm ash-runner 2>/dev/null || true

docker run -d \
  --name ash-runner \
  --init \
  --privileged \
  --cgroupns=host \
  -p ${ASH_RUNNER_PORT}:${ASH_RUNNER_PORT} \
  -v /home/ubuntu/.ash:/data \
  -e ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY} \
  -e ASH_RUNNER_ID=runner-ec2 \
  -e ASH_RUNNER_PORT=${ASH_RUNNER_PORT} \
  -e ASH_SERVER_URL=http://${SERVER_PRIVATE_IP}:${ASH_PORT} \
  -e ASH_RUNNER_ADVERTISE_HOST=${RUNNER_PRIVATE_IP} \
  -e ASH_INTERNAL_SECRET=${ASH_INTERNAL_SECRET} \
  ash-dev node packages/runner/dist/index.js

echo "Runner container started."
REMOTE

# ── Wait for runner to register ────────────────────────────────────────────

echo "==> Waiting for runner to register with server..."

for i in $(seq 1 30); do
  HEALTH=$(curl -s "http://$SERVER_PUBLIC_IP:$ASH_PORT/health" 2>/dev/null || echo "{}")
  RUNNERS=$(echo "$HEALTH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('remoteRunners', 0))" 2>/dev/null || echo "0")
  if [ "$RUNNERS" -ge 1 ]; then
    echo "  Runner registered! (remoteRunners=$RUNNERS)"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "Warning: Runner may not have registered yet (remoteRunners=$RUNNERS)."
    echo "Check logs: ssh -i $EC2_KEY_PATH ubuntu@$RUNNER_PUBLIC_IP 'docker logs ash-runner'"
  fi
  sleep 2
done

# ── Deploy the qa-bot agent ────────────────────────────────────────────────

echo "==> Deploying qa-bot agent..."

ssh $SSH_OPTS -i "$EC2_KEY_PATH" "ubuntu@$SERVER_PUBLIC_IP" bash <<'REMOTE'
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
echo "  Ash distributed deployment successful!"
echo "=========================================="
echo ""
echo "  Server URL:  http://$SERVER_PUBLIC_IP:$ASH_PORT"
echo "  Health:      http://$SERVER_PUBLIC_IP:$ASH_PORT/health"
echo ""
echo "  Server:      $SERVER_INSTANCE_ID ($SERVER_PUBLIC_IP)"
echo "  Runner:      $RUNNER_INSTANCE_ID ($RUNNER_PUBLIC_IP)"
echo "  Region:      $AWS_DEFAULT_REGION"
echo ""
echo "  SSH (server): ssh -i $EC2_KEY_PATH ubuntu@$SERVER_PUBLIC_IP"
echo "  SSH (runner): ssh -i $EC2_KEY_PATH ubuntu@$RUNNER_PUBLIC_IP"
echo ""
echo "  Server logs: ssh -i $EC2_KEY_PATH ubuntu@$SERVER_PUBLIC_IP 'docker logs -f ash-server'"
echo "  Runner logs: ssh -i $EC2_KEY_PATH ubuntu@$RUNNER_PUBLIC_IP 'docker logs -f ash-runner'"
echo ""
echo "  To smoke test:"
echo "    ./scripts/smoke-test-ec2-distributed.sh"
echo ""
echo "  To tear down:"
echo "    ./scripts/teardown-ec2-distributed.sh"
echo ""
