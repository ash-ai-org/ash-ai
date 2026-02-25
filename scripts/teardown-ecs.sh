#!/usr/bin/env bash
# Tear down an ECS Fargate deployment created by deploy-ecs.sh.
#
# Destroys all Terraform-managed resources: ECS service, task definition,
# NLB, target group, security group, IAM roles, and CloudWatch log group.
#
# Usage: ./scripts/teardown-ecs.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TF_DIR="$SCRIPT_DIR/../infra/ecs-fargate"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

info() { echo -e "${CYAN}==> $*${NC}"; }
ok()   { echo -e "${GREEN}==> $*${NC}"; }
fail() { echo -e "${RED}==> ERROR: $*${NC}" >&2; exit 1; }

if [[ ! -f "$TF_DIR/terraform.tfstate" ]]; then
  fail "No Terraform state found at $TF_DIR/terraform.tfstate. Nothing to tear down."
fi

info "Destroying ECS Fargate infrastructure..."
terraform -chdir="$TF_DIR" destroy -auto-approve -input=false -no-color 2>&1 | grep -E '(Destroy complete|Destroying|Destruction complete|Error)'

ok "All resources destroyed."
echo ""
echo "  Removed: ECS service, task definition, NLB, target group,"
echo "           security group, IAM roles, CloudWatch log group."
echo ""
