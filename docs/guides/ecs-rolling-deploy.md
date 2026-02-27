# ECS Rolling Deploy

Zero-downtime deployment for the Ash runtime on ECS Fargate.

## How It Works

The ECS service uses a rolling deployment strategy:

1. ECS spins up a **new task** alongside the existing one (`maximum_percent = 200`)
2. The NLB health check waits for the new task to pass `/health`
3. Once healthy, ECS drains connections from the **old task**
4. The old task is stopped — zero downtime

A **deployment circuit breaker** is enabled: if the new task repeatedly fails health checks, ECS automatically rolls back to the previous task definition.

## Deploy Latest

Re-pull the `:latest` tag and force a new deployment:

```bash
make deploy-runtime
# or
./scripts/deploy-runtime.sh
```

This calls `aws ecs update-service --force-new-deployment`, which triggers a rolling replace even if the image tag hasn't changed (useful when `:latest` has been updated in the registry).

## Deploy a Pinned Version

Deploy a specific image tag:

```bash
make deploy-runtime TAG=0.0.12
# or
./scripts/deploy-runtime.sh 0.0.12
```

This creates a new ECS task definition revision pointing to `ghcr.io/ash-ai-org/ash:0.0.12`, then updates the service.

## Rollback

Deploy the previous version explicitly:

```bash
make deploy-runtime TAG=0.0.11
```

Or, if a deploy fails health checks, the circuit breaker auto-rolls back to the last working task definition. Check the AWS Console (ECS > Service > Deployments) or:

```bash
aws ecs describe-services --cluster ash --services ash-runtime \
  --query 'services[0].deployments'
```

## Monitoring a Deploy

The deploy script waits for the service to stabilize (`aws ecs wait services-stable`) and then verifies the `/health` endpoint. To monitor manually:

```bash
# Watch deployment status
aws ecs describe-services --cluster ash --services ash-runtime \
  --query 'services[0].{desired: desiredCount, running: runningCount, deployments: deployments[*].{status: status, running: runningCount, desired: desiredCount}}'

# Tail logs
aws logs tail /ash/runtime --follow --region us-east-1

# Health check
curl http://<nlb-dns>:4100/health
```

## Prerequisites

- AWS CLI v2 configured
- Terraform state from initial `deploy-ecs.sh`
- `jq` installed (for pinned version deploys)

## Configuration

The rolling deploy settings are in `infra/ecs-fargate/ecs.tf`:

| Setting | Value | Meaning |
|---------|-------|---------|
| `minimum_healthy_percent` | 100 | Never drop below desired_count during deploy |
| `maximum_percent` | 200 | Allow 2x tasks during deploy (1 old + 1 new) |
| Circuit breaker | enabled + rollback | Auto-rollback on repeated health check failures |
