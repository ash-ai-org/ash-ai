#!/usr/bin/env bash
# Zero-downtime deploy for the Ash ECS Fargate runtime service.
#
# Usage:
#   ./scripts/deploy-runtime.sh          # Re-pull :latest, force new deployment
#   ./scripts/deploy-runtime.sh 0.0.12   # Deploy a pinned image version
#
# Prerequisites:
#   - AWS CLI v2 configured (aws sts get-caller-identity)
#   - Existing ECS deployment (run deploy-ecs.sh first)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."
TF_DIR="$ROOT/infra/ecs-fargate"
VERSION="${1:-}"

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

# --- Check prerequisites ---
command -v aws >/dev/null 2>&1 || fail "AWS CLI not found."
command -v jq >/dev/null 2>&1 || fail "jq not found."
aws sts get-caller-identity >/dev/null 2>&1 || fail "AWS credentials not configured."
command -v terraform >/dev/null 2>&1 || fail "Terraform not found."

# --- Get cluster/service info from Terraform outputs ---
info "Reading deployment info from Terraform state..."

CLUSTER=$(terraform -chdir="$TF_DIR" output -raw ecs_cluster_name 2>/dev/null) || fail "Could not read ecs_cluster_name. Is the ECS stack deployed?"
SERVICE=$(terraform -chdir="$TF_DIR" output -raw ecs_service_name 2>/dev/null) || fail "Could not read ecs_service_name."
ASH_URL=$(terraform -chdir="$TF_DIR" output -raw ash_url 2>/dev/null) || fail "Could not read ash_url."

# Region — not a Terraform output, fall back to env var or default
REGION="${AWS_DEFAULT_REGION:-us-east-1}"

echo "  Cluster: $CLUSTER"
echo "  Service: $SERVICE"
echo "  Region:  $REGION"
echo ""

# --- Get current task definition for reference ---
CURRENT_TASK_DEF=$(aws ecs describe-services \
  --cluster "$CLUSTER" \
  --services "$SERVICE" \
  --region "$REGION" \
  --query 'services[0].taskDefinition' \
  --output text)
CURRENT_IMAGE=$(aws ecs describe-task-definition \
  --task-definition "$CURRENT_TASK_DEF" \
  --region "$REGION" \
  --query 'taskDefinition.containerDefinitions[0].image' \
  --output text)

info "Current image: $CURRENT_IMAGE"

if [[ -z "$VERSION" ]]; then
  # --- No version: force new deployment (re-pulls :latest) ---
  info "Forcing new deployment (re-pull current image)..."
  aws ecs update-service \
    --cluster "$CLUSTER" \
    --service "$SERVICE" \
    --region "$REGION" \
    --force-new-deployment \
    --query 'service.deployments[0].id' \
    --output text
else
  # --- Version specified: update task definition with new image ---
  NEW_IMAGE="ghcr.io/ash-ai-org/ash:${VERSION}"
  info "Deploying version: $NEW_IMAGE"

  # Get current task definition JSON
  TASK_DEF_JSON=$(aws ecs describe-task-definition \
    --task-definition "$CURRENT_TASK_DEF" \
    --region "$REGION" \
    --query 'taskDefinition')

  # Create new task definition with updated image
  NEW_TASK_DEF=$(echo "$TASK_DEF_JSON" | \
    jq --arg img "$NEW_IMAGE" '
      .containerDefinitions[0].image = $img |
      {
        family,
        taskRoleArn,
        executionRoleArn,
        networkMode,
        containerDefinitions,
        requiresCompatibilities,
        cpu,
        memory
      }
    ' | \
    aws ecs register-task-definition \
      --region "$REGION" \
      --cli-input-json file:///dev/stdin \
      --query 'taskDefinition.taskDefinitionArn' \
      --output text)

  info "New task definition: $NEW_TASK_DEF"

  # Update service to use new task definition
  aws ecs update-service \
    --cluster "$CLUSTER" \
    --service "$SERVICE" \
    --region "$REGION" \
    --task-definition "$NEW_TASK_DEF" \
    --query 'service.deployments[0].id' \
    --output text
fi

# --- Wait for deployment to stabilize ---
info "Waiting for deployment to stabilize (this may take a few minutes)..."
aws ecs wait services-stable \
  --cluster "$CLUSTER" \
  --services "$SERVICE" \
  --region "$REGION"

# --- Verify health ---
info "Verifying health endpoint..."
HEALTH_OK=false
for i in $(seq 1 6); do
  if curl -sf "$ASH_URL/health" >/dev/null 2>&1; then
    HEALTH_OK=true
    break
  fi
  sleep 5
done

if [[ "$HEALTH_OK" == "true" ]]; then
  ok "Health check passed!"
else
  warn "Health check did not pass. The service may still be starting."
  warn "  Try: curl $ASH_URL/health"
fi

# --- Print summary ---
NEW_TASK_DEF_AFTER=$(aws ecs describe-services \
  --cluster "$CLUSTER" \
  --services "$SERVICE" \
  --region "$REGION" \
  --query 'services[0].taskDefinition' \
  --output text)
NEW_IMAGE_AFTER=$(aws ecs describe-task-definition \
  --task-definition "$NEW_TASK_DEF_AFTER" \
  --region "$REGION" \
  --query 'taskDefinition.containerDefinitions[0].image' \
  --output text)
RUNNING_COUNT=$(aws ecs describe-services \
  --cluster "$CLUSTER" \
  --services "$SERVICE" \
  --region "$REGION" \
  --query 'services[0].runningCount' \
  --output text)

echo ""
echo "============================================"
ok "Deployment complete"
echo "============================================"
echo ""
echo "  Before: $CURRENT_IMAGE"
echo "  After:  $NEW_IMAGE_AFTER"
echo "  Running tasks: $RUNNING_COUNT"
echo ""
echo "  Health:  curl $ASH_URL/health"
echo "  Logs:    aws logs tail /${CLUSTER}/runtime --follow --region $REGION"
echo ""
