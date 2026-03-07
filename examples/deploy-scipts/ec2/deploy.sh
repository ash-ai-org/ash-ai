#!/usr/bin/env bash
#
# deploy-ec2.sh — Deploy Ash server to an EC2 instance.
#
# Provisions an Ubuntu instance, installs Docker, builds the Ash image,
# starts the server, and deploys the qa-bot example agent.
#
# Usage:
#   cp .env.example .env   # fill in credentials
#   ./scripts/deploy-ec2.sh
#
# Prerequisites:
#   - AWS CLI v2 installed and configured (or credentials in .env)
#   - An EC2 key pair created in your target region
#   - ANTHROPIC_API_KEY set (for agent execution)
#
# See docs/guides/ec2-deployment.md for the full walkthrough.

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
: "${AWS_ACCESS_KEY_ID:?Set AWS_ACCESS_KEY_ID in .env}"
: "${AWS_SECRET_ACCESS_KEY:?Set AWS_SECRET_ACCESS_KEY in .env}"
: "${EC2_KEY_NAME:?Set EC2_KEY_NAME in .env (your EC2 key pair name)}"
: "${EC2_KEY_PATH:?Set EC2_KEY_PATH in .env (path to private key, e.g. ~/.ssh/my-key.pem)}"

# ── Defaults ────────────────────────────────────────────────────────────────

AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-us-east-1}"
EC2_INSTANCE_TYPE="${EC2_INSTANCE_TYPE:-t3.large}"
EC2_VOLUME_SIZE="${EC2_VOLUME_SIZE:-30}"
ASH_PORT="${ASH_PORT:-4100}"
INSTANCE_NAME="ash-server"

export AWS_DEFAULT_REGION
export AWS_ACCESS_KEY_ID
export AWS_SECRET_ACCESS_KEY

# ── State file (tracks the instance we created) ────────────────────────────

STATE_FILE="$PROJECT_DIR/.ec2-instance"

if [ -f "$STATE_FILE" ]; then
  echo "Error: Instance state file exists at $STATE_FILE"
  echo "An instance may already be running. Run ./scripts/teardown-ec2.sh first."
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

# Ensure key permissions are correct
chmod 400 "$EC2_KEY_PATH"

echo "  Region:        $AWS_DEFAULT_REGION"
echo "  Instance type: $EC2_INSTANCE_TYPE"
echo "  Key pair:      $EC2_KEY_NAME"
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

# Support both EC2_SECURITY_GROUP_ID (singular) and EC2_SECURITY_GROUP_IDS (plural)
_SG="${EC2_SECURITY_GROUP_ID:-${EC2_SECURITY_GROUP_IDS:-}}"
if [ -n "$_SG" ]; then
  SG_ID="$_SG"
  echo "==> Using existing security group: $SG_ID"

  # Ensure port 4100 is open (idempotent)
  aws ec2 authorize-security-group-ingress \
    --group-id "$SG_ID" \
    --protocol tcp --port "$ASH_PORT" --cidr 0.0.0.0/0 2>/dev/null || true
else
  echo "==> Creating security group: ash-server-sg"

  SG_ID=$(aws ec2 create-security-group \
    --group-name "ash-server-sg" \
    --description "Ash server - SSH + API" \
    --query 'GroupId' \
    --output text 2>/dev/null || \
    aws ec2 describe-security-groups \
      --group-names "ash-server-sg" \
      --query 'SecurityGroups[0].GroupId' \
      --output text)

  # SSH access
  aws ec2 authorize-security-group-ingress \
    --group-id "$SG_ID" \
    --protocol tcp --port 22 --cidr 0.0.0.0/0 2>/dev/null || true

  # Ash API access
  aws ec2 authorize-security-group-ingress \
    --group-id "$SG_ID" \
    --protocol tcp --port "$ASH_PORT" --cidr 0.0.0.0/0 2>/dev/null || true

  echo "  Security group: $SG_ID (ports 22, $ASH_PORT open)"
fi

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

# ── Launch instance ─────────────────────────────────────────────────────────

echo "==> Launching EC2 instance..."

SUBNET_ARG=""
if [ -n "${EC2_SUBNET_ID:-}" ]; then
  SUBNET_ARG="--subnet-id $EC2_SUBNET_ID"
fi

INSTANCE_ID=$(aws ec2 run-instances \
  --image-id "$AMI_ID" \
  --instance-type "$EC2_INSTANCE_TYPE" \
  --key-name "$EC2_KEY_NAME" \
  --security-group-ids "$SG_ID" \
  $SUBNET_ARG \
  --block-device-mappings "DeviceName=/dev/sda1,Ebs={VolumeSize=$EC2_VOLUME_SIZE,VolumeType=gp3}" \
  --user-data "$USER_DATA" \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$INSTANCE_NAME}]" \
  --query 'Instances[0].InstanceId' \
  --output text)

echo "  Instance ID: $INSTANCE_ID"

# Save state for teardown
cat > "$STATE_FILE" <<EOF
INSTANCE_ID=$INSTANCE_ID
SG_ID=$SG_ID
REGION=$AWS_DEFAULT_REGION
EOF

# ── Wait for instance to be running ─────────────────────────────────────────

echo "==> Waiting for instance to enter 'running' state..."
aws ec2 wait instance-running --instance-ids "$INSTANCE_ID"

PUBLIC_IP=$(aws ec2 describe-instances \
  --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --output text)

if [ "$PUBLIC_IP" = "None" ] || [ -z "$PUBLIC_IP" ]; then
  echo "Error: Instance has no public IP. Ensure your VPC/subnet assigns public IPs."
  echo "You can also set EC2_SUBNET_ID to a public subnet."
  echo "Cleaning up..."
  "$SCRIPT_DIR/teardown-ec2.sh"
  exit 1
fi

echo "  Public IP: $PUBLIC_IP"

# ── Wait for SSH ────────────────────────────────────────────────────────────

echo "==> Waiting for SSH to be available (this takes 1-2 minutes)..."

SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=5 -o LogLevel=ERROR"
MAX_RETRIES=60
for i in $(seq 1 $MAX_RETRIES); do
  if ssh $SSH_OPTS -i "$EC2_KEY_PATH" "ubuntu@$PUBLIC_IP" "true" 2>/dev/null; then
    echo "  SSH is ready."
    break
  fi
  if [ "$i" -eq "$MAX_RETRIES" ]; then
    echo "Error: SSH not available after ${MAX_RETRIES} attempts."
    exit 1
  fi
  sleep 5
done

# ── Wait for user-data setup to complete ────────────────────────────────────

echo "==> Waiting for Docker installation to complete..."

for i in $(seq 1 60); do
  if ssh $SSH_OPTS -i "$EC2_KEY_PATH" "ubuntu@$PUBLIC_IP" \
    "test -f /home/ubuntu/.setup-complete" 2>/dev/null; then
    echo "  Setup complete."
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "Error: Setup did not complete within 5 minutes."
    echo "SSH in to check: ssh -i $EC2_KEY_PATH ubuntu@$PUBLIC_IP"
    exit 1
  fi
  sleep 5
done

# ── Sync project to EC2 ────────────────────────────────────────────────────

echo "==> Syncing project to EC2..."

rsync -az --progress \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '.next' \
  --exclude 'dist' \
  --exclude '.env' \
  -e "ssh $SSH_OPTS -i $EC2_KEY_PATH" \
  "$PROJECT_DIR/" "ubuntu@$PUBLIC_IP:~/ash/"

echo "  Project synced."

# ── Build and start on EC2 ──────────────────────────────────────────────────

echo "==> Building Docker image on EC2 (this takes 3-5 minutes)..."

ssh $SSH_OPTS -i "$EC2_KEY_PATH" "ubuntu@$PUBLIC_IP" bash <<REMOTE
set -e

cd ~/ash

# Build Docker image (self-contained: copies source, installs deps, builds inside)
docker build -t ash-dev .

# Stop any existing container
docker stop ash-server 2>/dev/null || true
docker rm ash-server 2>/dev/null || true

# Create data directory
mkdir -p ~/.ash/agents

# Start the container (--privileged enables cgroup v2 for sandbox resource limits)
docker run -d \
  --name ash-server \
  --init \
  --privileged \
  --cgroupns=host \
  -p ${ASH_PORT}:4100 \
  -v /home/ubuntu/.ash:/data \
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
    echo "Check logs: ssh -i $EC2_KEY_PATH ubuntu@$PUBLIC_IP 'docker logs ash-server'"
    exit 1
  fi
  sleep 2
done

# ── Deploy the qa-bot agent ────────────────────────────────────────────────

echo "==> Deploying qa-bot agent..."

ssh $SSH_OPTS -i "$EC2_KEY_PATH" "ubuntu@$PUBLIC_IP" bash <<'REMOTE'
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
echo "  Instance:    $INSTANCE_ID"
echo "  Public IP:   $PUBLIC_IP"
echo "  Region:      $AWS_DEFAULT_REGION"
echo ""
echo "  SSH:         ssh -i $EC2_KEY_PATH ubuntu@$PUBLIC_IP"
echo "  Logs:        ssh -i $EC2_KEY_PATH ubuntu@$PUBLIC_IP 'docker logs -f ash-server'"
echo ""
echo "  To connect the QA Bot UI locally:"
echo "    ASH_SERVER_URL=http://$PUBLIC_IP:$ASH_PORT pnpm --filter qa-bot dev"
echo ""
echo "  To use the SDK:"
echo "    const client = new AshClient({ serverUrl: 'http://$PUBLIC_IP:$ASH_PORT' });"
echo ""
echo "  To tear down:"
echo "    ./scripts/teardown-ec2.sh"
echo ""
