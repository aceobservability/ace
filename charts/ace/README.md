# ace

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

## Requirements

| Repository | Name | Version |
|------------|------|---------|
| https://charts.bitnami.com/bitnami | postgresql | 16.4.1 |
| https://victoriametrics.github.io/helm-charts/ | vlogs(victoria-logs-single) | 0.11.28 |
| https://victoriametrics.github.io/helm-charts/ | vmetrics(victoria-metrics-k8s-stack) | 0.45.0 |
| https://victoriametrics.github.io/helm-charts/ | vtraces(victoria-metrics-single) | 0.18.0 |

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| backend.affinity | object | `{}` |  |
| backend.autoscaling | object | `{"enabled":true,"maxReplicas":10,"minReplicas":2,"targetCPUUtilizationPercentage":70,"targetMemoryUtilizationPercentage":80}` | HPA configuration |
| backend.baseURL | string | `""` | Backend base URL (for SSO callbacks) |
| backend.existingSecret | string | `""` | Use an existing Secret instead of the chart-managed one. Must contain keys: database-password, jwt-secret, jwt-private-key, jwt-public-key |
| backend.extraEnv | object | `{}` | Extra environment variables as key-value pairs |
| backend.frontendURL | string | `""` | Frontend URL (for SSO redirects) |
| backend.image.pullPolicy | string | `"IfNotPresent"` |  |
| backend.image.repository | string | `"ghcr.io/aceobservability/ace-backend"` |  |
| backend.image.tag | string | `""` | Overrides the image tag (default: Chart.appVersion) |
| backend.jwt | object | `{"privateKey":"","publicKey":"","secret":""}` | JWT configuration (stored in Secret) |
| backend.jwt.privateKey | string | `""` | RSA/ECDSA private key PEM (optional, for asymmetric JWT) |
| backend.jwt.publicKey | string | `""` | RSA/ECDSA public key PEM (optional) |
| backend.jwt.secret | string | `""` | HMAC secret for JWT signing (set one of secret OR privateKey/publicKey) |
| backend.nodeSelector | object | `{}` |  |
| backend.otlp | object | `{"enabled":true,"endpoint":""}` | OpenTelemetry tracing configuration |
| backend.otlp.enabled | bool | `true` | Enable OTLP trace export from the backend |
| backend.otlp.endpoint | string | `""` | OTLP endpoint (auto-detected from VictoriaTraces subchart if empty) |
| backend.pdb | object | `{"enabled":true,"minAvailable":1}` | PodDisruptionBudget |
| backend.podAnnotations | object | `{}` | Pod annotations (e.g., Prometheus scrape config) |
| backend.podLabels | object | `{}` | Extra pod labels |
| backend.podSecurityContext.fsGroup | int | `65534` |  |
| backend.podSecurityContext.runAsNonRoot | bool | `true` |  |
| backend.podSecurityContext.runAsUser | int | `65534` |  |
| backend.posthog | object | `{"apiKey":"","enabled":false,"host":""}` | PostHog analytics (optional) |
| backend.prometheus | object | `{"url":""}` | Prometheus/VictoriaMetrics query endpoint |
| backend.prometheus.url | string | `""` | Override the metrics query URL (auto-detected from k8s-stack if empty) |
| backend.replicaCount | int | `2` | Number of replicas (ignored when autoscaling is enabled) |
| backend.resources.limits.cpu | string | `"500m"` |  |
| backend.resources.limits.memory | string | `"512Mi"` |  |
| backend.resources.requests.cpu | string | `"100m"` |  |
| backend.resources.requests.memory | string | `"128Mi"` |  |
| backend.securityContext.allowPrivilegeEscalation | bool | `false` |  |
| backend.securityContext.capabilities.drop[0] | string | `"ALL"` |  |
| backend.securityContext.readOnlyRootFilesystem | bool | `true` |  |
| backend.service.port | int | `8080` |  |
| backend.service.type | string | `"ClusterIP"` |  |
| backend.tolerations | list | `[]` |  |
| backend.valkey | object | `{"url":""}` | Valkey (Redis-compatible) for refresh tokens |
| backend.victoriaLogs | object | `{"url":""}` | VictoriaLogs query endpoint |
| backend.victoriaLogs.url | string | `""` | Override the logs query URL (auto-detected from vlogs subchart if empty) |
| externalDatabase.password | string | `nil` | Password (stored in Secret; referenced by DATABASE_URL) |
| externalDatabase.url | string | `""` | Full connection string (overrides all other fields) |
| frontend.affinity | object | `{}` |  |
| frontend.autoscaling.enabled | bool | `true` |  |
| frontend.autoscaling.maxReplicas | int | `6` |  |
| frontend.autoscaling.minReplicas | int | `2` |  |
| frontend.autoscaling.targetCPUUtilizationPercentage | int | `70` |  |
| frontend.autoscaling.targetMemoryUtilizationPercentage | int | `80` |  |
| frontend.image.pullPolicy | string | `"IfNotPresent"` |  |
| frontend.image.repository | string | `"ghcr.io/aceobservability/ace-frontend"` |  |
| frontend.image.tag | string | `""` |  |
| frontend.nginxConfigOverride | bool | `false` | Override the default nginx.conf from the container image |
| frontend.nodeSelector | object | `{}` |  |
| frontend.podAnnotations | object | `{}` |  |
| frontend.podLabels | object | `{}` |  |
| frontend.podSecurityContext.fsGroup | int | `101` |  |
| frontend.podSecurityContext.runAsNonRoot | bool | `true` |  |
| frontend.podSecurityContext.runAsUser | int | `101` |  |
| frontend.replicaCount | int | `2` |  |
| frontend.resources.limits.cpu | string | `"200m"` |  |
| frontend.resources.limits.memory | string | `"128Mi"` |  |
| frontend.resources.requests.cpu | string | `"50m"` |  |
| frontend.resources.requests.memory | string | `"64Mi"` |  |
| frontend.securityContext.allowPrivilegeEscalation | bool | `false` |  |
| frontend.securityContext.capabilities.drop[0] | string | `"ALL"` |  |
| frontend.securityContext.readOnlyRootFilesystem | bool | `false` |  |
| frontend.service.port | int | `80` |  |
| frontend.service.type | string | `"ClusterIP"` |  |
| frontend.tolerations | list | `[]` |  |
| fullnameOverride | string | `""` | Override the full release name |
| global.imagePullSecrets | list | `[]` | Image pull secrets for private registries |
| ingress.annotations."cert-manager.io/cluster-issuer" | string | `"letsencrypt-prod"` |  |
| ingress.className | string | `"nginx"` | Ingress class name (e.g., nginx, traefik) |
| ingress.enabled | bool | `false` |  |
| ingress.hosts[0].host | string | `"ace.example.com"` |  |
| ingress.tls[0].hosts[0] | string | `"ace.example.com"` |  |
| ingress.tls[0].secretName | string | `"ace-tls"` |  |
| nameOverride | string | `""` | Override the chart name |
| networkPolicy.enabled | bool | `false` | Enable NetworkPolicy resources |
| networkPolicy.ingressControllerLabels | object | `{"app.kubernetes.io/name":"ingress-nginx"}` | Labels to match the ingress controller pods (for ingress allowlisting) |
| postgresql.auth.database | string | `"ace"` |  |
| postgresql.auth.password | string | `nil` |  |
| postgresql.auth.username | string | `"ace"` |  |
| postgresql.enabled | bool | `true` |  |
| postgresql.primary.persistence.enabled | bool | `true` |  |
| postgresql.primary.persistence.size | string | `"10Gi"` |  |
| postgresql.primary.persistence.storageClass | string | `""` |  |
| postgresql.primary.resources.limits.cpu | string | `"1"` |  |
| postgresql.primary.resources.limits.memory | string | `"1Gi"` |  |
| postgresql.primary.resources.requests.cpu | string | `"100m"` |  |
| postgresql.primary.resources.requests.memory | string | `"256Mi"` |  |
| rbac.create | bool | `true` | Create ClusterRole/ClusterRoleBinding for metrics scraping |
| serviceAccount.annotations | object | `{}` | Annotations (e.g., for IRSA on EKS) |
| serviceAccount.automountServiceAccountToken | bool | `false` | Disable auto-mounting tokens unless needed |
| serviceAccount.create | bool | `true` | Create a dedicated ServiceAccount |
| serviceAccount.name | string | `""` | Override the ServiceAccount name |
| vector.enabled | bool | `true` | Deploy Vector as a DaemonSet to ship logs to VictoriaLogs |
| vector.image.pullPolicy | string | `"IfNotPresent"` |  |
| vector.image.repository | string | `"timberio/vector"` |  |
| vector.image.tag | string | `"0.43.1-alpine"` |  |
| vector.resources.limits.cpu | string | `"200m"` |  |
| vector.resources.limits.memory | string | `"256Mi"` |  |
| vector.resources.requests.cpu | string | `"50m"` |  |
| vector.resources.requests.memory | string | `"64Mi"` |  |
| vector.sink | object | `{"endpoint":"http://victoria-logs:9428/insert/elasticsearch/"}` | Sink endpoint (only used when victoria-logs-single is disabled) |
| victoria-logs-single.enabled | bool | `true` |  |
| victoria-logs-single.server.extraArgs | object | `{"retentionPeriod":"30d"}` | Log retention period |
| victoria-logs-single.server.persistentVolume.enabled | bool | `true` |  |
| victoria-logs-single.server.persistentVolume.size | string | `"50Gi"` |  |
| victoria-logs-single.server.persistentVolume.storageClass | string | `""` |  |
| victoria-logs-single.server.resources.limits.cpu | string | `"2"` |  |
| victoria-logs-single.server.resources.limits.memory | string | `"4Gi"` |  |
| victoria-logs-single.server.resources.requests.cpu | string | `"200m"` |  |
| victoria-logs-single.server.resources.requests.memory | string | `"512Mi"` |  |
| victoria-metrics-k8s-stack.alertmanager | object | `{"enabled":true,"spec":{"resources":{"limits":{"cpu":"100m","memory":"128Mi"},"requests":{"cpu":"50m","memory":"64Mi"}}}}` | Alertmanager for alert routing and notifications |
| victoria-metrics-k8s-stack.enabled | bool | `true` |  |
| victoria-metrics-k8s-stack.grafana | object | `{"enabled":false}` | Disable Grafana (Ace is the UI) |
| victoria-metrics-k8s-stack.kube-state-metrics | object | `{"enabled":true}` | kube-state-metrics for cluster state metrics |
| victoria-metrics-k8s-stack.prometheus | object | `{"enabled":false}` | Disable default Prometheus (we use VMSingle) |
| victoria-metrics-k8s-stack.prometheus-node-exporter | object | `{"enabled":true}` | node-exporter for node-level metrics |
| victoria-metrics-k8s-stack.vmagent | object | `{"enabled":true,"spec":{"resources":{"limits":{"cpu":"500m","memory":"512Mi"},"requests":{"cpu":"100m","memory":"256Mi"}},"scrapeInterval":"30s"}}` | VMAgent for scraping Kubernetes metrics |
| victoria-metrics-k8s-stack.vmalert | object | `{"enabled":true,"spec":{"resources":{"limits":{"cpu":"200m","memory":"256Mi"},"requests":{"cpu":"50m","memory":"128Mi"}}}}` | VMAlert for alerting rules evaluation |
| victoria-metrics-k8s-stack.vmsingle | object | `{"enabled":true,"spec":{"resources":{"limits":{"cpu":"2","memory":"4Gi"},"requests":{"cpu":"200m","memory":"512Mi"}},"retentionPeriod":"90d","storage":{"accessModes":["ReadWriteOnce"],"resources":{"requests":{"storage":"50Gi"}},"storageClassName":""}}}` | VMSingle for metrics storage |
| victoriatraces.enabled | bool | `true` |  |
| vtraces | object | `{"server":{"extraArgs":{"opentelemetry.enabled":"true"},"extraContainerPorts":[{"containerPort":4317,"name":"otlp-grpc","protocol":"TCP"},{"containerPort":4318,"name":"otlp-http","protocol":"TCP"}],"image":{"repository":"victoriametrics/victoria-traces","tag":"v1.8.0-victoriametrics"},"persistentVolume":{"enabled":true,"size":"30Gi","storageClass":""},"resources":{"limits":{"cpu":"2","memory":"4Gi"},"requests":{"cpu":"200m","memory":"512Mi"}}}}` | victoria-metrics-single subchart config (alias: vtraces) |

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
