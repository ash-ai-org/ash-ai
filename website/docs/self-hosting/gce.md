---
sidebar_position: 3
title: Deploy to Google Cloud
---

# Deploy to Google Cloud

This guide walks through deploying Ash to a Google Compute Engine (GCE) instance using the included deploy script. The script provisions an Ubuntu VM, installs Docker, builds the Ash image, starts the server, and deploys the example QA Bot agent.

## Prerequisites

- **gcloud CLI** installed ([install guide](https://cloud.google.com/sdk/docs/install))
- **GCP project** with Compute Engine API enabled and billing configured
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
./scripts/deploy-gce.sh
```

The script takes 5--8 minutes. When it finishes, it prints the server URL, SSH command, and instructions for connecting the QA Bot UI.

## Configuration

Create a `.env` file in the project root with the following variables:

### Required

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key for agent execution |
| `GCP_PROJECT_ID` | Your GCP project ID. Falls back to `gcloud config get-value project` if not set. |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `GCP_ZONE` | `us-east1-b` | Compute Engine zone |
| `GCP_MACHINE_TYPE` | `e2-standard-2` | Machine type (2 vCPU, 8 GB RAM) |
| `GCP_DISK_SIZE` | `30` | Boot disk size in GB (SSD) |
| `ASH_PORT` | `4100` | Port to expose the API on |

Example `.env`:

```bash
ANTHROPIC_API_KEY=sk-ant-api03-...
GCP_PROJECT_ID=my-project-123
GCP_ZONE=us-east1-b
GCP_MACHINE_TYPE=e2-standard-2
```

## GCP Setup from Scratch

If you do not have a GCP project configured yet:

```bash
# 1. Install gcloud CLI
# macOS:
brew install --cask google-cloud-sdk
# Or download from https://cloud.google.com/sdk/docs/install

# 2. Authenticate
gcloud auth login

# 3. Create a project (or use an existing one)
gcloud projects create my-ash-project --name="Ash Server"

# 4. Set the project as default
gcloud config set project my-ash-project

# 5. Enable the Compute Engine API
gcloud services enable compute.googleapis.com

# 6. Enable billing (required for Compute Engine)
# Go to https://console.cloud.google.com/billing and link a billing account
# to your project
```

## What the Deploy Script Does

1. **Ensures a firewall rule** (`allow-ash-api`) exists for port 4100. Creates one if it does not exist.
2. **Creates a Compute Engine instance** (`ash-server`) with Ubuntu 22.04, SSD boot disk, and the `ash-server` network tag.
3. **Runs a startup script** that installs Docker, Node.js 20, pnpm, rsync, and jq.
4. **Waits for SSH** and the startup script to complete (~2 minutes).
5. **Syncs the project** to the instance by creating a tarball and using `gcloud compute scp`.
6. **Builds the Docker image** on the instance (`docker build -t ash-dev .`). This takes 3--5 minutes.
7. **Starts the container** with `--init`, `--privileged`, `--cgroupns=host`, and the volume mount.
8. **Waits for healthy** by polling `GET /health`.
9. **Deploys the qa-bot agent** by copying agent files and calling the API.

## Using the SDK

After deployment, connect from your application:

```typescript
import { AshClient } from "@ash-ai/sdk";

const client = new AshClient({
  serverUrl: "http://<EXTERNAL_IP>:4100",
});

// Create a session
const session = await client.createSession({ agentName: "qa-bot" });

// Send a message (SSE streaming)
const stream = client.sendMessage(session.id, {
  message: "What is the capital of France?",
});

for await (const event of stream) {
  if (event.type === "assistant") {
    process.stdout.write(event.content);
  }
}
```

## Monitoring

### Logs

```bash
gcloud compute ssh ash-server --zone=us-east1-b \
  --command='docker logs -f ash-server'
```

### Health Check

```bash
curl http://<EXTERNAL_IP>:4100/health | jq .
```

### API Docs

Open `http://<EXTERNAL_IP>:4100/docs` in a browser for the Swagger UI.

## Troubleshooting

### "gcloud: command not found"

Install the gcloud CLI:

```bash
# macOS
brew install --cask google-cloud-sdk

# Linux
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
gcloud init
```

### "Your current active account does not have permission"

Re-authenticate:

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

### "Compute Engine API has not been enabled"

```bash
gcloud services enable compute.googleapis.com
```

This can take a minute to propagate. Wait and retry.

### "Instance has no external IP"

The default network configuration includes an external IP. If you are using a custom VPC without external IPs, you need to either add an access config or use Cloud NAT + Identity-Aware Proxy for SSH.

### "Firewall rule blocks traffic"

Verify the rule exists and the instance has the correct network tag:

```bash
gcloud compute firewall-rules describe allow-ash-api
gcloud compute instances describe ash-server --zone=us-east1-b \
  --format='get(tags.items)'
```

## Tearing Down

```bash
./scripts/teardown-gce.sh
```

This deletes the Compute Engine instance and the `allow-ash-api` firewall rule. The teardown script reads from the `.gce-instance` state file created during deployment.

## Cost Estimate

| Resource | Spec | Hourly Cost (us-east1) |
|----------|------|------------------------|
| GCE `e2-standard-2` | 2 vCPU, 8 GB RAM | ~$0.067 |
| Boot disk (pd-ssd) | 30 GB | ~$0.005 |
| **Total** | | **~$0.072/hour (~$52/month)** |

Data transfer costs are additional. Actual costs depend on region and usage patterns.

## EC2 vs GCE Comparison

| | AWS EC2 | Google Cloud GCE |
|---|---------|-----------------|
| **Deploy command** | `./scripts/deploy-ec2.sh` | `./scripts/deploy-gce.sh` |
| **Default instance** | `t3.large` (2 vCPU, 8 GB) | `e2-standard-2` (2 vCPU, 8 GB) |
| **Default region** | `us-east-1` | `us-east1-b` |
| **SSH access** | `ssh -i key.pem ubuntu@IP` | `gcloud compute ssh ash-server` |
| **Auth method** | AWS access key + secret | `gcloud auth login` |
| **Required credentials** | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `EC2_KEY_NAME`, `EC2_KEY_PATH` | `GCP_PROJECT_ID` (+ gcloud auth) |
| **Estimated cost** | ~$0.086/hour | ~$0.072/hour |
| **Teardown** | `./scripts/teardown-ec2.sh` | `./scripts/teardown-gce.sh` |

Both scripts produce identical results: a running Ash server with the QA Bot agent deployed. Choose whichever cloud you already have an account with.
