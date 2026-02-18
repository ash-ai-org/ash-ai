# Deploying Ash to EC2

Deploy the Ash server to an AWS EC2 instance. Once running, you can deploy agents, create sessions, and connect the example QA Bot UI from your local machine.

## Prerequisites

- **AWS CLI v2** installed and working ([install guide](https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html))
- **An EC2 key pair** in your target region ([create one](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/create-key-pairs.html))
- **Anthropic API key** for agent execution
- **Node.js >= 20** and **pnpm** (for building locally or running the QA Bot UI)

## Quick Start

```bash
# 1. Clone and set up
git clone https://github.com/ash-ai/ash.git
cd ash

# 2. Configure credentials
cp .env.example .env
# Edit .env — fill in the required values (see below)

# 3. Deploy to EC2
./scripts/deploy-ec2.sh

# 4. Run the smoke test
./scripts/smoke-test-ec2.sh

# 5. Connect the QA Bot UI to your EC2 server
ASH_SERVER_URL=http://<your-ec2-ip>:4100 pnpm --filter qa-bot dev
# Open http://localhost:3100

# 6. When done, tear down
./scripts/teardown-ec2.sh
```

## Configuration

Create a `.env` file from the example:

```bash
cp .env.example .env
```

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Anthropic API key for agent execution | `sk-ant-...` |
| `AWS_ACCESS_KEY_ID` | AWS access key with EC2 permissions | `AKIA...` |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | `wJal...` |
| `EC2_KEY_NAME` | Name of your EC2 key pair | `my-ash-key` |
| `EC2_KEY_PATH` | Path to the private key file | `~/.ssh/my-ash-key.pem` |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AWS_DEFAULT_REGION` | `us-east-1` | AWS region |
| `EC2_INSTANCE_TYPE` | `t3.large` | Instance type (2 vCPU, 8GB RAM) |
| `EC2_VOLUME_SIZE` | `30` | Root volume size in GB |
| `EC2_SECURITY_GROUP_ID` | (auto-created) | Use an existing security group |
| `EC2_SUBNET_ID` | (default VPC) | Deploy to a specific subnet |
| `ASH_PORT` | `4100` | Port the Ash API listens on |

### IAM Permissions Needed

Your AWS credentials need these permissions:

```json
{
  "Effect": "Allow",
  "Action": [
    "ec2:RunInstances",
    "ec2:DescribeInstances",
    "ec2:TerminateInstances",
    "ec2:CreateSecurityGroup",
    "ec2:AuthorizeSecurityGroupIngress",
    "ec2:DeleteSecurityGroup",
    "ec2:DescribeSecurityGroups",
    "ec2:DescribeImages"
  ],
  "Resource": "*"
}
```

## What the Deploy Script Does

`scripts/deploy-ec2.sh` automates the full deployment:

1. **Finds the latest Ubuntu 22.04 AMI** in your region
2. **Creates a security group** (if not provided) with ports 22 (SSH) and 4100 (Ash API) open
3. **Launches a `t3.large` instance** with a user-data script that installs Docker, Node.js 20, and pnpm
4. **Waits for the instance** to be SSH-ready and setup to complete (~2 minutes)
5. **Syncs the project** to the instance via rsync (excludes node_modules, .git, dist)
6. **Builds the Docker image** on the instance (~3-5 minutes)
7. **Starts the Ash container** with `--privileged` (for cgroup v2 sandbox resource limits) and your `ANTHROPIC_API_KEY`
8. **Deploys the `qa-bot` example agent** via the REST API
9. **Prints the connection URL** and next steps

State is saved to `.ec2-instance` so `teardown-ec2.sh` knows what to clean up.

## Connecting the QA Bot Example

The QA Bot is a Next.js app that uses the `@ash-ai/sdk` to talk to the Ash server. Point it at your EC2 instance:

```bash
# Install dependencies (first time only)
pnpm install

# Start the QA Bot UI, pointed at your EC2 server
ASH_SERVER_URL=http://<your-ec2-ip>:4100 pnpm --filter qa-bot dev
```

Open http://localhost:3100 in your browser. The QA Bot creates sessions and streams responses from the agent running on your EC2 instance.

## Using the SDK Directly

```typescript
import { AshClient } from '@ash-ai/sdk';

const client = new AshClient({
  serverUrl: 'http://<your-ec2-ip>:4100',
});

// Create a session with the deployed agent
const session = await client.createSession('qa-bot');

// Send a message and stream the response
for await (const event of client.sendMessageStream(session.id, 'What is Ash?')) {
  if (event.type === 'message') {
    console.log(event.data);
  }
}

// Clean up
await client.endSession(session.id);
```

## Deploying Your Own Agent

An agent is a folder with a `CLAUDE.md` file (the system prompt) and optional `.claude/settings.json`:

```
my-agent/
├── CLAUDE.md                # System prompt
└── .claude/
    └── settings.json        # Permission settings
```

### 1. Create the agent

```bash
mkdir my-agent
cat > my-agent/CLAUDE.md <<'EOF'
# My Agent

You are a helpful assistant that specializes in Python programming.
Always provide code examples and explain your reasoning.
EOF

mkdir -p my-agent/.claude
cat > my-agent/.claude/settings.json <<'EOF'
{
  "permissions": {
    "allow": ["Bash", "Read", "Glob", "Grep"]
  }
}
EOF
```

### 2. Deploy it to the running EC2 instance

Copy the agent files to the instance and register via API:

```bash
# Get the EC2 IP
source .ec2-instance
PUBLIC_IP=$(aws ec2 describe-instances \
  --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --output text)

# Copy agent to the instance
scp -i "$EC2_KEY_PATH" -r ./my-agent "ubuntu@$PUBLIC_IP:~/.ash/agents/my-agent"

# Register it with the server
curl -X POST "http://$PUBLIC_IP:4100/api/agents" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-agent","path":"agents/my-agent"}'
```

### 3. Create a session and send a message

```bash
# Create session
curl -X POST "http://$PUBLIC_IP:4100/api/sessions" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-agent"}'

# Send message (streams SSE response)
curl -N -X POST "http://$PUBLIC_IP:4100/api/sessions/<SESSION_ID>/messages" \
  -H "Content-Type: application/json" \
  -d '{"content":"Write a Python function to check if a number is prime"}'
```

## Running the E2E Benchmark on EC2

The `test/bench/sandbox-startup.ts` benchmark exercises the full lifecycle (session create, message streaming, pause, resume, cold resume after restart). To run it against your EC2 instance:

```bash
# SSH into the instance
ssh -i "$EC2_KEY_PATH" ubuntu@$PUBLIC_IP

# On EC2: run the benchmark natively (not in Docker-in-Docker)
cd ~/ash
ASH_TEST_DOCKER=0 npx tsx test/bench/sandbox-startup.ts --rounds 3
```

This measures:
- **New session cold start** latency + time to first token
- **Warm resume** (sandbox still alive) latency
- **Cold resume** (after server restart, sandbox dead) latency

## Running the Smoke Test

The smoke test verifies the deployed server works end-to-end:

```bash
# Auto-detects the EC2 IP from .ec2-instance
./scripts/smoke-test-ec2.sh

# Or pass the URL explicitly
./scripts/smoke-test-ec2.sh http://<your-ec2-ip>:4100
```

It tests: health check, agent registry, session create, message streaming (SSE), pause, resume, and session end.

## Monitoring

### Server logs

```bash
ssh -i "$EC2_KEY_PATH" ubuntu@$PUBLIC_IP 'docker logs -f ash-server'
```

### Container status

```bash
ssh -i "$EC2_KEY_PATH" ubuntu@$PUBLIC_IP 'docker ps'
```

### Health check

```bash
curl http://<your-ec2-ip>:4100/health
```

## Troubleshooting

### "Instance has no public IP"

Your VPC's default subnet may not auto-assign public IPs. Either:
- Set `EC2_SUBNET_ID` to a public subnet in your `.env`
- Or modify the subnet to auto-assign public IPs in the AWS Console

### "Server failed to become healthy"

SSH in and check the container logs:

```bash
ssh -i "$EC2_KEY_PATH" ubuntu@$PUBLIC_IP
docker logs ash-server
```

Common causes:
- Missing `ANTHROPIC_API_KEY`
- Port 4100 already in use (another container running)
- Docker build failure (check disk space — increase `EC2_VOLUME_SIZE`)

### "Connection refused" from local machine

Check that the security group allows inbound traffic on port 4100:

```bash
aws ec2 describe-security-groups --group-ids <sg-id> \
  --query 'SecurityGroups[0].IpPermissions'
```

### "Setup did not complete within 5 minutes"

SSH in and check the cloud-init logs:

```bash
ssh -i "$EC2_KEY_PATH" ubuntu@$PUBLIC_IP
cat /var/log/cloud-init-output.log
```

## Tearing Down

```bash
./scripts/teardown-ec2.sh
```

This terminates the EC2 instance and deletes the auto-created security group. The `.ec2-instance` state file is removed.

## Cost

| Resource | Approximate Cost |
|----------|-----------------|
| `t3.large` (2 vCPU, 4GB) | ~$0.083/hour (~$60/month) |
| 30 GB gp3 EBS | ~$2.40/month |
| Data transfer (first 100GB) | Free tier |

Remember to run `./scripts/teardown-ec2.sh` when you're done to avoid ongoing charges.
