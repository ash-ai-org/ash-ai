#!/usr/bin/env bash
# Deploy Ash to AWS ECS Fargate behind a Network Load Balancer.
#
# Creates a production-ready setup with:
#   - ECS cluster + Fargate service (auto-restarts on crash)
#   - Network Load Balancer (stable DNS endpoint)
#   - API key authentication
#   - CloudWatch logging
#
# Usage: ./scripts/deploy-ecs.sh
#
# Prerequisites:
#   - AWS CLI v2 configured (aws sts get-caller-identity)
#   - Terraform >= 1.5 (brew install terraform)
#   - .env file with at least ANTHROPIC_API_KEY

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."
TF_DIR="$ROOT/infra/ecs-fargate"
ENV_FILE="$ROOT/.env"

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}==> $*${NC}"; }
ok()    { echo -e "${GREEN}==> $*${NC}"; }
warn()  { echo -e "${YELLOW}==> $*${NC}"; }
fail()  { echo -e "${RED}==> ERROR: $*${NC}" >&2; exit 1; }

# --- Load .env ---
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

# --- Check prerequisites ---
info "Checking prerequisites..."

command -v aws >/dev/null 2>&1 || fail "AWS CLI not found. Install: https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html"
command -v terraform >/dev/null 2>&1 || fail "Terraform not found. Install: brew install terraform"
aws sts get-caller-identity >/dev/null 2>&1 || fail "AWS credentials not configured. Run: aws configure"

[[ -n "${ANTHROPIC_API_KEY:-}" ]] || fail "ANTHROPIC_API_KEY not set. Add it to your .env file."

REGION="${AWS_DEFAULT_REGION:-us-east-1}"

# --- Generate secrets if not set ---
if [[ -z "${ASH_API_KEY:-}" ]]; then
  ASH_API_KEY=$(openssl rand -base64 32)
  warn "Generated ASH_API_KEY (save this -- you need it to authenticate)."
fi

if [[ -z "${ASH_INTERNAL_SECRET:-}" ]]; then
  ASH_INTERNAL_SECRET=$(openssl rand -base64 32)
fi

# --- Write terraform.tfvars ---
info "Configuring Terraform..."

cat > "$TF_DIR/terraform.tfvars" <<EOF
aws_region          = "${REGION}"
ash_api_key         = "${ASH_API_KEY}"
ash_internal_secret = "${ASH_INTERNAL_SECRET}"
anthropic_api_key   = "${ANTHROPIC_API_KEY}"
EOF

# Optional overrides
[[ -n "${ASH_ECS_CPU:-}" ]]           && echo "ecs_cpu           = \"${ASH_ECS_CPU}\"" >> "$TF_DIR/terraform.tfvars"
[[ -n "${ASH_ECS_MEMORY:-}" ]]        && echo "ecs_memory        = \"${ASH_ECS_MEMORY}\"" >> "$TF_DIR/terraform.tfvars"
[[ -n "${ASH_MAX_SANDBOXES:-}" ]]     && echo "ash_max_sandboxes = \"${ASH_MAX_SANDBOXES}\"" >> "$TF_DIR/terraform.tfvars"
[[ -n "${ASH_ECS_VPC_ID:-}" ]]        && echo "vpc_id            = \"${ASH_ECS_VPC_ID}\"" >> "$TF_DIR/terraform.tfvars"
[[ -n "${ASH_ECS_SUBNET_IDS:-}" ]]    && echo "subnet_ids        = [$(echo "$ASH_ECS_SUBNET_IDS" | sed 's/,/", "/g; s/^/"/; s/$/"/')]" >> "$TF_DIR/terraform.tfvars"

# --- Terraform init + apply ---
info "Initializing Terraform..."
terraform -chdir="$TF_DIR" init -input=false -no-color 2>&1 | tail -1

info "Applying infrastructure (this takes 2-3 minutes)..."
terraform -chdir="$TF_DIR" apply -auto-approve -input=false -no-color 2>&1 | grep -E '(Apply complete|Creating|Still creating|Creation complete|Error)'

# --- Get outputs ---
NLB_DNS=$(terraform -chdir="$TF_DIR" output -raw nlb_dns)
ASH_URL=$(terraform -chdir="$TF_DIR" output -raw ash_url)

# --- Wait for healthy ---
info "Waiting for Ash server to become healthy..."

MAX_WAIT=180
WAITED=0
while [[ $WAITED -lt $MAX_WAIT ]]; do
  if curl -sf "$ASH_URL/health" >/dev/null 2>&1; then
    break
  fi
  sleep 5
  WAITED=$((WAITED + 5))
  printf "."
done
echo ""

if [[ $WAITED -ge $MAX_WAIT ]]; then
  warn "Server did not become healthy within ${MAX_WAIT}s."
  warn "The NLB may still be provisioning. Try again in a minute:"
  echo "  curl $ASH_URL/health"
else
  ok "Server is healthy!"
fi

# --- Print results ---
echo ""
echo "============================================"
ok "Ash deployed to ECS Fargate"
echo "============================================"
echo ""
echo "  Server URL:  $ASH_URL"
echo "  NLB DNS:     $NLB_DNS"
echo "  API Key:     $ASH_API_KEY"
echo ""
echo "  Health check:"
echo "    curl $ASH_URL/health | jq ."
echo ""
echo "  List sessions:"
echo "    curl -H 'Authorization: Bearer $ASH_API_KEY' $ASH_URL/api/sessions | jq ."
echo ""
echo "  View logs:"
echo "    aws logs tail /ash/runtime --follow --region $REGION"
echo ""
echo "  Tear down:"
echo "    ./scripts/teardown-ecs.sh"
echo ""
