# Deployment Examples

Example scripts for deploying Ash to cloud providers. These are **reference implementations** — not the primary deployment method.

## Recommended: Docker Compose

The simplest way to self-host Ash:

```bash
curl -O https://raw.githubusercontent.com/ash-ai-org/ash-ai/main/docker-compose.yml
export ANTHROPIC_API_KEY=sk-...
docker compose up -d
```

## Cloud Provider Examples

| Directory | Description |
|-----------|-------------|
| `ec2/` | Single-node deployment to AWS EC2 |
| `gce/` | Single-node deployment to Google Compute Engine |
| `ec2-distributed/` | Multi-node (coordinator + runner) on AWS EC2 |

Each directory contains:
- `deploy.sh` — Provision and deploy
- `teardown.sh` — Clean up resources

The `smoke-test.sh` script (in this directory and `ec2-distributed/`) validates a running deployment.

## Prerequisites

All scripts read from a `.env` file in the repo root. Copy `.env.example` and fill in your credentials.

These scripts are intended for contributors and ops teams. End users should use `docker compose up` or `ash start` (local Docker).
