# Kubernetes Deployment

Deploy Ash to any Kubernetes cluster using the official Helm chart.

## Prerequisites

- Kubernetes 1.25+
- Helm 3.x
- An Anthropic API key

## Quick Start

```bash
# Add your API key to a Kubernetes secret
kubectl create secret generic ash-secrets \
  --from-literal=ANTHROPIC_API_KEY=sk-ant-... \
  --from-literal=ASH_API_KEY=$(openssl rand -hex 32)

# Install the chart
helm install ash ./charts/ash \
  --set auth.existingSecret=ash-secrets
```

Ash is now running at `http://ash:4100` inside the cluster.

## Configuration

All configuration is in `values.yaml`. Override values with `--set` or `-f your-values.yaml`.

### Minimal Production Values

```yaml
# production.yaml
replicaCount: 1

auth:
  existingSecret: ash-secrets    # pre-created K8s secret with API keys

persistence:
  size: 50Gi

resources:
  requests:
    cpu: 1000m
    memory: 4Gi
  limits:
    cpu: 4000m
    memory: 16Gi

ingress:
  enabled: true
  className: nginx
  hosts:
    - host: ash.internal.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: ash-tls
      hosts:
        - ash.internal.example.com
```

```bash
helm install ash ./charts/ash -f production.yaml
```

### With External Database (CockroachDB/Postgres)

For multi-replica deployments, use an external database instead of SQLite:

```yaml
# production-ha.yaml
replicaCount: 3

ash:
  databaseUrl: "postgresql://ash@cockroachdb:26257/ash?sslmode=verify-full"

auth:
  existingSecret: ash-secrets

persistence:
  size: 20Gi          # less needed since state is in the database

autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10

podDisruptionBudget:
  enabled: true
  minAvailable: 1
```

### Enterprise Integration

The chart exposes standard integration points:

| Integration | How |
|-------------|-----|
| **Service mesh** (Consul, Istio) | `service.annotations` |
| **Service dashboard** | `service.labels`, `podLabels` |
| **Internal registry** | `image.repository` pointed at your ECR/GCR mirror |
| **Prometheus** | `metrics.serviceMonitor.enabled: true` |
| **Ingress controller** | `ingress.enabled: true` with your `className` |
| **Node placement** | `nodeSelector`, `tolerations`, `affinity` |
| **Secrets manager** | `auth.existingSecret` referencing an external-secrets-synced Secret |

Example with Consul service sync and internal registry:

```yaml
image:
  repository: 123456789.dkr.ecr.us-west-2.amazonaws.com/ash-ai/ash
  tag: "0.0.8"

service:
  annotations:
    consul.hashicorp.com/service-name: ash-agents
    consul.hashicorp.com/service-sync: "true"
  labels:
    my-dashboard/enabled: "true"
    my-dashboard/name: ash-agents

metrics:
  serviceMonitor:
    enabled: true
    additionalLabels:
      release: prometheus
```

## Image Mirroring

For air-gapped or policy-restricted clusters, mirror the image to your internal registry:

```bash
# Pull from GHCR
docker pull ghcr.io/ash-ai-org/ash:0.0.8

# Tag for your registry
docker tag ghcr.io/ash-ai-org/ash:0.0.8 \
  YOUR_REGISTRY/ash-ai/ash:0.0.8

# Push
docker push YOUR_REGISTRY/ash-ai/ash:0.0.8
```

Then set `image.repository` in your values.

## Security

### Privileged Mode

The Ash container runs privileged by default to enable cgroup v2 delegation for per-sandbox resource limits. If your cluster policy disallows privileged containers:

```yaml
securityContext:
  privileged: false
```

Ash will fall back to ulimit-based resource limits for sandboxes.

### API Key Authentication

Always set an API key in production. Three options:

1. **Existing secret** (recommended): Create the secret externally (e.g., via external-secrets-operator or sealed-secrets), reference it with `auth.existingSecret`.

2. **Inline** (development only): Set `auth.apiKey` and `auth.anthropicApiKey` directly in values. Not recommended for production since values files may be committed to source control.

3. **No auth** (local dev): Omit both. Ash will warn but run without authentication.

## Monitoring

### Health Checks

- **`GET /health`** — JSON status with active sessions, sandbox count, pool stats
- **`GET /metrics`** — Prometheus text format with `ash_up`, `ash_active_sessions`, `ash_pool_sandboxes`, resume counters

### ServiceMonitor

If you run prometheus-operator, enable the ServiceMonitor:

```yaml
metrics:
  serviceMonitor:
    enabled: true
    additionalLabels:
      release: prometheus    # match your Prometheus selector
```

### Helm Test

Verify the deployment:

```bash
helm test ash
```

This runs a pod that curls the `/health` endpoint.

## Persistence

By default, Ash uses embedded SQLite stored on a persistent volume at `/data`. This volume holds:

- SQLite database (session state, agent registry, message history)
- Sandbox working directories (agent code, session files)

Size the volume based on expected concurrent sessions and retention. 10Gi is fine for development; 50-100Gi for production.

## Upgrading

```bash
helm upgrade ash ./charts/ash -f production.yaml
```

The StatefulSet performs a rolling update. The `preStop` hook ensures graceful shutdown with a 3-second drain period. Active sessions will be paused and can be resumed on the new pod.

## Uninstalling

```bash
helm uninstall ash
```

Note: PersistentVolumeClaims created by the StatefulSet are **not** deleted automatically. To delete data:

```bash
kubectl delete pvc -l app.kubernetes.io/instance=ash
```
