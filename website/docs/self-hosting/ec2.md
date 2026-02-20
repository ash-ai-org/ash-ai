---
sidebar_position: 2
title: Deploy to AWS EC2
---

# Deploy to AWS EC2

This guide walks through deploying Ash to an EC2 instance using the included deploy script. The script provisions an Ubuntu instance, installs Docker, builds the Ash image, starts the server, and deploys the example QA Bot agent.

## Prerequisites

- **AWS CLI v2** installed and configured ([install guide](https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html))
- **EC2 key pair** created in your target region ([create a key pair](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/create-key-pairs.html))
- **ANTHROPIC_API_KEY** for agent execution

## Quick Start

```bash
# Clone the repo
git clone https://github.com/ash-ai-org/ash.git
cd ash

# Create .env from the example
cp .env.example .env
# Edit .env with your credentials (see below)

# Deploy
./scripts/deploy-ec2.sh
```

The script takes 5--8 minutes. When it finishes, it prints the server URL, SSH command, and instructions for connecting the QA Bot UI.

## Configuration

Create a `.env` file in the project root with the following variables:

### Required

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key for agent execution |
| `AWS_ACCESS_KEY_ID` | AWS access key with EC2 permissions |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key |
| `EC2_KEY_NAME` | Name of your EC2 key pair (as shown in the AWS console) |
| `EC2_KEY_PATH` | Path to the private key file, e.g. `~/.ssh/my-key.pem` |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `AWS_DEFAULT_REGION` | `us-east-1` | AWS region to deploy in |
| `EC2_INSTANCE_TYPE` | `t3.large` | Instance type (2 vCPU, 8 GB RAM) |
| `EC2_VOLUME_SIZE` | `30` | Root volume size in GB |
| `EC2_SECURITY_GROUP_ID` | (created) | Use an existing security group instead of creating one |
| `EC2_SUBNET_ID` | (default VPC) | Deploy into a specific subnet |
| `ASH_PORT` | `4100` | Port to expose the API on |

Example `.env`:

```bash
ANTHROPIC_API_KEY=sk-ant-api03-...
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
EC2_KEY_NAME=my-key
EC2_KEY_PATH=~/.ssh/my-key.pem
AWS_DEFAULT_REGION=us-east-1
EC2_INSTANCE_TYPE=t3.large
```

## What the Deploy Script Does

1. **Finds the latest Ubuntu 22.04 AMI** in your region.
2. **Creates a security group** (`ash-server-sg`) with ports 22 (SSH) and 4100 (API) open. Skipped if you provide `EC2_SECURITY_GROUP_ID`.
3. **Launches a `t3.large` instance** with a 30 GB gp3 volume and a user-data script that installs Docker, Node.js 20, and pnpm.
4. **Waits for SSH** and the user-data script to complete (~2 minutes).
5. **Syncs the project** to the instance via rsync (excludes `node_modules`, `.git`, `dist`).
6. **Builds the Docker image** on the instance (`docker build -t ash-dev .`). This takes 3--5 minutes on a `t3.large`.
7. **Starts the container** with `--init`, `--privileged`, `--cgroupns=host`, and the volume mount.
8. **Waits for healthy** by polling `GET /health`.
9. **Deploys the qa-bot agent** by copying agent files and calling the API.

## Connecting the QA Bot Example

After deployment, the QA Bot agent is ready. To connect the example Next.js UI:

```bash
# From your local machine (not the EC2 instance)
ASH_SERVER_URL=http://<PUBLIC_IP>:4100 pnpm --filter qa-bot dev
```

This starts the QA Bot frontend locally, pointing at your remote Ash server.

## Deploying Your Own Agent

SSH into the instance and copy your agent folder to the data directory:

```bash
ssh -i ~/.ssh/my-key.pem ubuntu@<PUBLIC_IP>

# Copy your agent files
mkdir -p ~/.ash/agents/my-agent
# Place your CLAUDE.md, .claude/ settings, etc. in ~/.ash/agents/my-agent/

# Deploy via API
curl -X POST http://localhost:4100/api/agents \
  -H "Content-Type: application/json" \
  -d '{"name": "my-agent", "path": "agents/my-agent"}'
```

Alternatively, use the Ash CLI or SDK from your local machine:

```bash
export ASH_SERVER_URL=http://<PUBLIC_IP>:4100
ash deploy ./my-agent --name my-agent
```

## Monitoring

### Logs

```bash
# From your local machine
ssh -i ~/.ssh/my-key.pem ubuntu@<PUBLIC_IP> 'docker logs -f ash-server'
```

### Health Check

```bash
curl http://<PUBLIC_IP>:4100/health | jq .
```

Returns active session count, sandbox pool stats, and uptime.

### API Docs

Open `http://<PUBLIC_IP>:4100/docs` in a browser for the Swagger UI.

## Troubleshooting

### "Key file not found"

Verify `EC2_KEY_PATH` in your `.env` points to the correct `.pem` file. The script sets permissions to `400` automatically.

### "Instance has no public IP"

Your VPC or subnet does not auto-assign public IPs. Either:
- Set `EC2_SUBNET_ID` to a public subnet, or
- Enable "Auto-assign public IPv4 address" on your subnet in the AWS console.

### "Server did not become healthy within 60 seconds"

SSH in and check the Docker logs:

```bash
ssh -i ~/.ssh/my-key.pem ubuntu@<PUBLIC_IP>
docker logs ash-server
```

Common causes:
- Missing `ANTHROPIC_API_KEY` -- the server starts but agents cannot execute.
- Docker build failed -- check for network issues during `pnpm install`.

### "Setup did not complete within 5 minutes"

The user-data script (Docker + Node.js installation) is taking too long. SSH in and check:

```bash
ssh -i ~/.ssh/my-key.pem ubuntu@<PUBLIC_IP>
cat /var/log/cloud-init-output.log
```

## Tearing Down

```bash
./scripts/teardown-ec2.sh
```

This terminates the EC2 instance, waits for termination to complete, and deletes the security group if the script created it. The teardown script reads from the `.ec2-instance` state file that was created during deployment.

## Cost Estimate

| Resource | Spec | Hourly Cost (us-east-1) |
|----------|------|------------------------|
| EC2 `t3.large` | 2 vCPU, 8 GB RAM | ~$0.083 |
| EBS gp3 | 30 GB | ~$0.003 |
| **Total** | | **~$0.086/hour (~$62/month)** |

Data transfer costs are additional. Actual costs depend on region and usage patterns.
