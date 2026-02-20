# 08 - Self-Hosting Section

## Pages

### 1. Docker (Default) (`/docs/self-hosting/docker`)

**Purpose:** The default way to run Ash. Most users start here.

**Content:**
- `ash start` manages Docker lifecycle automatically
- What it does: pulls image, creates persistent volume at `~/.ash`, starts container
- Configuration via environment variables (passed through `ash start`)
- Persistent data: SQLite database, workspace snapshots, agent definitions
- `ash stop` / `ash status` / `ash logs`
- Docker Compose example for production:
  ```yaml
  services:
    ash:
      image: ash-ai/server:latest
      ports:
        - "4100:4100"
      volumes:
        - ash-data:/data
      environment:
        - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
        - ASH_API_KEY=${ASH_API_KEY}
  ```
- Resource recommendations: 2+ CPU cores, 4GB+ RAM per concurrent session

**Source:** `docs/features/docker-lifecycle.md`

---

### 2. Deploy to AWS EC2 (`/docs/self-hosting/ec2`)

**Purpose:** Production deployment on EC2.

**Content:**
- Instance type recommendations (t3.large minimum, c5.xlarge for production)
- AMI: Ubuntu 22.04+ or Amazon Linux 2023
- Security group: inbound 4100 (or behind ALB)
- User data script for automated setup
- Systemd service file for auto-restart
- CloudWatch integration for logs/metrics
- ALB + TLS termination for HTTPS
- Environment variable management (SSM Parameter Store or .env file)

**Source:** `docs/guides/ec2-deployment.md`

---

### 3. Deploy to Google Cloud (`/docs/self-hosting/gce`)

**Purpose:** Production deployment on GCE.

**Content:**
- Machine type recommendations (e2-standard-2 minimum)
- Image: Ubuntu 22.04+
- Firewall rules
- Startup script for automated setup
- Systemd service file
- Cloud Logging integration
- Load balancer + managed SSL
- Secret Manager for API keys

**Source:** `docs/guides/gce-deployment.md`

---

### 4. Configuration Reference (`/docs/self-hosting/configuration`)

**Purpose:** Complete reference for all configuration options.

**Content:**

| Variable | Default | Description |
|----------|---------|-------------|
| `ASH_PORT` | `4100` | API server port |
| `ASH_HOST` | `0.0.0.0` | Bind address |
| `ASH_DATA_DIR` | `./data` | Persistent storage directory |
| `ASH_MODE` | `standalone` | `standalone` or `coordinator` |
| `ASH_DATABASE_URL` | (SQLite) | PostgreSQL connection string |
| `ASH_MAX_SANDBOXES` | `1000` | Maximum concurrent sandboxes |
| `ASH_IDLE_TIMEOUT_MS` | `1800000` | Idle sandbox timeout (30 min) |
| `ASH_API_KEY` | (none) | Single API key (simple auth) |
| `ASH_SNAPSHOT_URL` | (none) | S3/GCS URL for cloud persistence |
| `ASH_BRIDGE_ENTRY` | (bundled) | Path to bridge entry point |
| `ASH_DEBUG_TIMING` | `0` | Enable hot-path instrumentation |
| `ANTHROPIC_API_KEY` | (required) | Claude API key |

**Source:** Server source code, `packages/shared/src/constants.ts`

---

### 5. Multi-Machine Setup (`/docs/self-hosting/multi-machine`)

**Purpose:** Scale beyond one machine with coordinator + runner architecture.

**Content:**
- When to use: more concurrent sessions than one machine can handle
- Architecture:
  ```
  Clients -> Coordinator (ASH_MODE=coordinator)
                |
                ├── Runner 1 (ASH_RUNNER_PORT=4200)
                ├── Runner 2 (ASH_RUNNER_PORT=4200)
                └── Runner 3 (ASH_RUNNER_PORT=4200)
  ```
- Coordinator setup: `ASH_MODE=coordinator`, PostgreSQL database (required for shared state)
- Runner setup: `ASH_RUNNER_ID`, `ASH_SERVER_URL`, `ASH_RUNNER_ADVERTISE_HOST`
- Registration: runners auto-register with coordinator, send heartbeats
- Session routing: coordinator picks least-loaded runner
- Database: must use PostgreSQL (shared between coordinator and runners)
- Monitoring: per-runner health endpoints, coordinator aggregates pool stats

**Source:** `docs/features/multi-runner.md`, `packages/runner/`

**Note:** Mark this as "Advanced" — most users won't need it.
