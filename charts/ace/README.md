# Ace Observability Platform — Helm Chart

Production-ready Helm chart for deploying the **Ace Observability Platform** to Kubernetes, including the full VictoriaMetrics stack for metrics, logs, and traces.

## Architecture

```
┌──────────────┐    ┌──────────────┐
│   Ingress    │───▶│   Frontend   │  (Vue 3 SPA / nginx)
│  (optional)  │    └──────────────┘
│              │    ┌──────────────┐    ┌────────────┐
│              │───▶│   Backend    │───▶│ PostgreSQL │
│              │    │   (Go API)   │    └────────────┘
└──────────────┘    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
     ┌────────────┐ ┌───────────┐ ┌───────────────┐
     │VictoriaMetrics│ │VictoriaLogs│ │VictoriaTraces │
     │  (metrics)    │ │  (logs)    │ │  (traces)     │
     └────────────┘ └───────────┘ └───────────────┘
              ▲            ▲
              │            │
     ┌────────────┐ ┌───────────┐
     │  VMAgent   │ │  Vector   │
     │ (scraper)  │ │(log ship) │
     └────────────┘ └───────────┘
```

## Prerequisites

- Kubernetes 1.28+
- Helm 3.14+
- PV provisioner (for persistent storage)
- (Optional) cert-manager for TLS
- (Optional) ingress controller (nginx, traefik, etc.)

## Quick Start

```bash
# Add the VictoriaMetrics Helm repo (required for subchart deps)
helm repo add vm https://victoriametrics.github.io/helm-charts/
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update

# Download subchart dependencies
helm dependency build charts/ace

# Install with dev settings
helm install ace charts/ace \
  -f charts/ace/values-dev.yaml \
  --set postgresql.auth.password=MyDevPassword123 \
  --set backend.jwt.secret=my-dev-jwt-secret \
  -n ace --create-namespace

# Install with production settings
helm install ace charts/ace \
  -f charts/ace/values-prod.yaml \
  --set postgresql.auth.password=STRONG_RANDOM_PASSWORD \
  --set backend.jwt.secret=STRONG_RANDOM_SECRET \
  --set ingress.hosts[0].host=ace.yourdomain.com \
  --set ingress.tls[0].hosts[0]=ace.yourdomain.com \
  -n ace --create-namespace
```

## Validation

```bash
# Lint the chart
helm lint charts/ace

# Render templates without installing
helm template ace charts/ace -f charts/ace/values-dev.yaml

# Dry-run install
helm install ace charts/ace --dry-run -f charts/ace/values-dev.yaml -n ace
```

## Components

### Ace Application

| Component | Description | Port |
|-----------|-------------|------|
| **Backend** | Go API server — auth, dashboards, datasource proxy, alerting | 8080 |
| **Frontend** | Vue 3 SPA served by nginx | 8080 |
| **PostgreSQL** | Bitnami subchart (togglable for external DB) | 5432 |

### VictoriaMetrics Stack (all independently togglable)

| Component | Chart | Description |
|-----------|-------|-------------|
| **Metrics** | `victoria-metrics-k8s-stack` | VMSingle + VMAgent + VMAlert + Alertmanager |
| **Logs** | `victoria-logs-single` | High-performance log storage |
| **Traces** | `victoria-metrics-single` (as vtraces) | VictoriaTraces with OTLP ingestion |
| **Log Shipper** | Vector (DaemonSet) | Ships container logs to VictoriaLogs |

## Values Reference

### Global

| Key | Description | Default |
|-----|-------------|---------|
| `nameOverride` | Override chart name | `""` |
| `fullnameOverride` | Override full release name | `""` |
| `global.imagePullSecrets` | Image pull secrets | `[]` |

### Service Account & RBAC

| Key | Description | Default |
|-----|-------------|---------|
| `serviceAccount.create` | Create ServiceAccount | `true` |
| `serviceAccount.annotations` | SA annotations (e.g., IRSA) | `{}` |
| `rbac.create` | Create ClusterRole for metrics scraping | `true` |

### Backend

| Key | Description | Default |
|-----|-------------|---------|
| `backend.replicaCount` | Replicas (when HPA disabled) | `2` |
| `backend.image.repository` | Backend image | `ghcr.io/aceobservability/ace-backend` |
| `backend.image.tag` | Image tag | `Chart.appVersion` |
| `backend.autoscaling.enabled` | Enable HPA | `true` |
| `backend.autoscaling.minReplicas` | HPA min | `2` |
| `backend.autoscaling.maxReplicas` | HPA max | `10` |
| `backend.pdb.enabled` | Enable PodDisruptionBudget | `true` |
| `backend.pdb.minAvailable` | Minimum available pods | `1` |
| `backend.jwt.secret` | JWT HMAC secret (stored in Secret) | `""` |
| `backend.jwt.privateKey` | JWT asymmetric private key PEM | `""` |
| `backend.jwt.publicKey` | JWT asymmetric public key PEM | `""` |
| `backend.existingSecret` | Use an existing K8s Secret | `""` |
| `backend.valkey.url` | Valkey/Redis URL for refresh tokens | `""` |
| `backend.otlp.enabled` | Enable OTLP trace export | `true` |
| `backend.otlp.endpoint` | OTLP endpoint (auto-detected) | `""` |
| `backend.prometheus.url` | Metrics query URL (auto-detected) | `""` |
| `backend.victoriaLogs.url` | Logs query URL (auto-detected) | `""` |
| `backend.baseURL` | Backend base URL (for SSO callbacks) | `""` |
| `backend.frontendURL` | Frontend URL (for SSO redirects) | `""` |
| `backend.posthog.enabled` | Enable PostHog analytics | `false` |
| `backend.resources` | Resource requests/limits | See values.yaml |

### Frontend

| Key | Description | Default |
|-----|-------------|---------|
| `frontend.replicaCount` | Replicas (when HPA disabled) | `2` |
| `frontend.image.repository` | Frontend image | `ghcr.io/aceobservability/ace-frontend` |
| `frontend.autoscaling.enabled` | Enable HPA | `true` |
| `frontend.nginxConfigOverride` | Use ConfigMap nginx.conf | `false` |
| `frontend.resources` | Resource requests/limits | See values.yaml |

### Ingress

| Key | Description | Default |
|-----|-------------|---------|
| `ingress.enabled` | Enable Ingress | `false` |
| `ingress.className` | Ingress class | `nginx` |
| `ingress.annotations` | Annotations (cert-manager, etc.) | See values.yaml |
| `ingress.hosts` | Host rules | `[{host: ace.example.com}]` |
| `ingress.tls` | TLS configuration | See values.yaml |

### PostgreSQL

| Key | Description | Default |
|-----|-------------|---------|
| `postgresql.enabled` | Deploy PostgreSQL subchart | `true` |
| `postgresql.auth.username` | DB username | `ace` |
| `postgresql.auth.password` | DB password (**set in production!**) | `""` |
| `postgresql.auth.database` | DB name | `ace` |
| `postgresql.primary.persistence.size` | PVC size | `10Gi` |
| `externalDatabase.url` | External DB connection string | `""` |

### VictoriaMetrics K8s Stack

| Key | Description | Default |
|-----|-------------|---------|
| `victoria-metrics-k8s-stack.enabled` | Deploy the full metrics stack | `true` |
| `vmsingle.spec.retentionPeriod` | Metrics retention | `90d` |
| `vmsingle.spec.storage.resources.requests.storage` | Metrics PVC size | `50Gi` |
| `vmagent.enabled` | Deploy VMAgent for scraping | `true` |
| `vmalert.enabled` | Deploy VMAlert for rule evaluation | `true` |
| `alertmanager.enabled` | Deploy Alertmanager | `true` |

### VictoriaLogs

| Key | Description | Default |
|-----|-------------|---------|
| `victoria-logs-single.enabled` | Deploy VictoriaLogs | `true` |
| `server.persistentVolume.size` | Logs PVC size | `50Gi` |
| `server.extraArgs.retentionPeriod` | Log retention | `30d` |

### VictoriaTraces

| Key | Description | Default |
|-----|-------------|---------|
| `victoriatraces.enabled` | Deploy VictoriaTraces | `true` |
| `vtraces.server.persistentVolume.size` | Traces PVC size | `30Gi` |

### Vector (Log Shipper)

| Key | Description | Default |
|-----|-------------|---------|
| `vector.enabled` | Deploy Vector DaemonSet | `true` |
| `vector.sink.endpoint` | Custom sink URL (when vlogs disabled) | See values.yaml |

### Network Policy

| Key | Description | Default |
|-----|-------------|---------|
| `networkPolicy.enabled` | Enable NetworkPolicy resources | `false` |
| `networkPolicy.ingressControllerLabels` | Labels for ingress controller pods | `{app.kubernetes.io/name: ingress-nginx}` |

## Toggling Components

Each major component is independently togglable:

```yaml
# Disable metrics stack
victoria-metrics-k8s-stack:
  enabled: false

# Disable logs
victoria-logs-single:
  enabled: false
vector:
  enabled: false  # No point shipping logs without a log store

# Disable traces
victoriatraces:
  enabled: false

# Disable alerting (within the k8s-stack)
victoria-metrics-k8s-stack:
  vmalert:
    enabled: false
  alertmanager:
    enabled: false

# Use external PostgreSQL
postgresql:
  enabled: false
externalDatabase:
  url: "postgres://user:pass@external-db:5432/ace?sslmode=require"
```

## OTLP Trace Ingestion

VictoriaTraces exposes OTLP endpoints for trace ingestion:

| Protocol | Port | Endpoint |
|----------|------|----------|
| gRPC | 4317 | `<release>-vtraces-victoria-metrics-single-server:4317` |
| HTTP | 4318 | `<release>-vtraces-victoria-metrics-single-server:4318/v1/traces` |

Configure your applications to send traces to these endpoints:

```yaml
# OpenTelemetry SDK configuration
env:
  - name: OTEL_EXPORTER_OTLP_ENDPOINT
    value: "http://ace-vtraces-victoria-metrics-single-server:4318"
  - name: OTEL_EXPORTER_OTLP_PROTOCOL
    value: "http/protobuf"
```

## Datasource Configuration

When the VictoriaMetrics stack is deployed alongside Ace, the backend is automatically configured with the correct datasource URLs:

| Datasource | Auto-configured URL |
|------------|-------------------|
| Metrics (VictoriaMetrics) | `http://<release>-vmetrics-...-vmsingle:8429` |
| Logs (VictoriaLogs) | `http://<release>-vlogs-...-server:9428` |
| Traces (VictoriaTraces) | `http://<release>-vtraces-...-server:4318` |

These can be overridden via `backend.prometheus.url`, `backend.victoriaLogs.url`, and `backend.otlp.endpoint`.

## Environment Value Files

| File | Purpose |
|------|---------|
| `values.yaml` | Production defaults (sane baselines) |
| `values-dev.yaml` | Development: 1 replica, small storage, 3-7d retention |
| `values-prod.yaml` | Production: HA replicas, large storage, 90-180d retention, TLS |

## Security Notes

- All sensitive values (DB password, JWT keys, API keys) are stored in Kubernetes Secrets
- Use `backend.existingSecret` to reference a pre-created Secret (e.g., from Vault or Sealed Secrets)
- Pod security contexts enforce non-root execution and drop all capabilities
- NetworkPolicy resources are available (enable with `networkPolicy.enabled: true`)
- RBAC is scoped to the minimum required permissions for metrics scraping

## Upgrading

```bash
# Update subchart dependencies
helm dependency update charts/ace

# Upgrade the release
helm upgrade ace charts/ace -f charts/ace/values-prod.yaml -n ace
```

## Uninstalling

```bash
helm uninstall ace -n ace

# PVCs are retained by default — delete manually if needed
kubectl delete pvc -l app.kubernetes.io/instance=ace -n ace
```
