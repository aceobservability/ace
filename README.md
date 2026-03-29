# Ace - Monitoring Dashboard

[![CodeQL](https://github.com/aceobservability/ace/actions/workflows/security.yml/badge.svg?branch=master)](https://github.com/aceobservability/ace/actions/workflows/security.yml)
[![Lint](https://github.com/aceobservability/ace/actions/workflows/lint.yml/badge.svg?branch=master)](https://github.com/aceobservability/ace/actions/workflows/lint.yml)
[![Security](https://github.com/aceobservability/ace/actions/workflows/security.yml/badge.svg?branch=master)](https://github.com/aceobservability/ace/actions/workflows/security.yml)

A Grafana-like monitoring dashboard built with Vue.js, Go, and Prometheus.

## Features

- **AI-powered chat-to-dashboard** — type a natural language prompt, get a complete dashboard with the right queries and panels
- **GitHub Copilot integration** — AI query assistant with tool-calling for metric discovery
- Dashboard CRUD operations with 12-column grid layout
- Multi-datasource support (VictoriaMetrics, Prometheus, ClickHouse, Elasticsearch, CloudWatch, Loki, Tempo)
- PromQL/MetricsQL query editor with syntax highlighting
- Line, bar, gauge, stat, pie, and table visualizations (ECharts)
- Time range picker with presets, custom ranges, and auto-refresh
- Drag-and-drop dashboard layout
- Dark/light mode with organization-level theming
- Log-to-trace correlation
- Alert management (VMAlert, Alertmanager)

## Tech Stack

- **Frontend:** Vue.js 3 (Composition API + TypeScript)
- **Backend:** Go API
- **Database:** PostgreSQL (metadata storage)
- **Cache:** Valkey (Redis-compatible)
- **Data Sources:** VictoriaMetrics, Prometheus, ClickHouse, Elasticsearch, Loki, Tempo

## Quick Start

### Prerequisites

| Tool | Version | Required for | Install |
|------|---------|-------------|---------|
| Go | 1.25+ | Backend | [go.dev](https://go.dev/dl/) or `mise install` |
| Node.js | 18+ | Frontend | [nodejs.org](https://nodejs.org/) |
| Docker | latest | Both paths | [docker.com](https://docs.docker.com/get-docker/) |

> **Tip:** This project includes a [`mise.toml`](mise.toml) that pins tool versions. If you use [mise](https://mise.jdx.dev/), run `mise install` to get the correct versions.

There are two ways to run the local dev environment. Pick whichever suits you:

| | Docker Compose | Tilt + Kubernetes |
|---|---|---|
| **Infra** | Docker only | Local k8s cluster (Colima, kind, or Docker Desktop) |
| **Backend** | Runs on host (`make backend`) | Built and deployed as a container |
| **Frontend** | Runs on host (`make frontend`) | Managed by Tilt |
| **Hot reload** | Backend via air, frontend via Vite | Backend rebuilds container, frontend via Vite |
| **Extra tools** | None | `kubectl`, `helm`, `tilt` |
| **Best for** | Quick start, lightweight | Full orchestration, closer to production |

---

### Option A: Docker Compose

The simplest way to get started. Docker Compose runs the infrastructure (postgres, valkey, datasource backends) and you run the backend and frontend on the host.

#### 1. Start infrastructure with a datasource stack

```bash
make compose-up PROFILES=victoria
```

This starts postgres, valkey, and the full Victoria stack (VictoriaMetrics, Victoria Logs, Victoria Traces, VMAlert, Alertmanager, OTel Collector).

Available profiles: `victoria`, `lgtm`, `elk`, `clickhouse`

#### 2. Start telemetry generators

```bash
make telemetrygen PROFILES=victoria
```

This starts continuous synthetic metrics, logs, and traces flowing through the OTel Collector into the Victoria stack. The platform is immediately demoable with real-looking data.

Each profile has a matching generator: `gen-victoria`, `gen-lgtm`, `gen-elk`, `gen-clickhouse`. The `make telemetrygen` command starts both the stack profile and its generators.

#### 3. Start backend and frontend

```bash
# Terminal 1 — backend (hot reload with air, or plain go run)
make backend

# Terminal 2 — frontend (Vite dev server)
make frontend
```

#### 4. Seed admin user and datasources

```bash
make seed
# defaults: EMAIL=admin@admin.com PASSWORD=Admin1234
```

This creates the admin user, four organizations, and configures datasources pointing to the local service ports. You can also generate correlated log-to-trace pairs:

```bash
make seed-correlated
```

#### 5. Open the app

- Frontend: http://localhost:5173
- Backend API: http://localhost:8080

You should see dashboards populated with live telemetry data from the generators.

#### Stop

```bash
make compose-down

# Or tear down and delete volumes
make compose-reset
```

---

### Option B: Tilt + Kubernetes

Tilt orchestrates everything in a local Kubernetes cluster — infrastructure, backend container builds, and the frontend dev server. This is closer to how Ace runs in production.

#### Additional prerequisites

| Tool | Install |
|------|---------|
| kubectl | [kubernetes.io](https://kubernetes.io/docs/tasks/tools/) |
| Helm | [helm.sh](https://helm.sh/docs/intro/install/) |
| Tilt | [tilt.dev](https://docs.tilt.dev/install.html) |
| Local k8s cluster | See below |

#### 1. Start a local Kubernetes cluster

**Colima (recommended on macOS):**
```bash
colima start --kubernetes --cpu 4 --memory 8
colima kubernetes reset   # one-time: ensures k3s starts cleanly
```

**kind:**
```bash
kind create cluster
```

**Docker Desktop:** Enable Kubernetes in Docker Desktop settings and restart.

#### 2. Start the dev environment

```bash
make tilt-up ENABLE="victoria-metrics victoria-logs"
```

This deploys to your local cluster:
- **postgres** — metadata database (localhost:5432)
- **valkey** — cache/session store (localhost:6379)
- **backend** — Go API (http://localhost:8080)
- **frontend** — Vite dev server with hot reload (http://localhost:5173)
- **victoria-metrics** — metrics storage (http://localhost:8428)
- **victoria-logs** — log storage (http://localhost:9428)

Open the Tilt UI (URL shown in terminal output) to monitor service health.

Enable any combination of datasource backends:

```bash
# Prometheus + Loki + Tempo
make tilt-up ENABLE="prometheus loki tempo"

# Everything
make tilt-up ENABLE="prometheus loki victoria-metrics victoria-logs tempo"
```

You can also enable/disable services from the Tilt UI after startup.

| Service | Port | Enable name |
|---------|------|-------------|
| Prometheus | http://localhost:9090 | `prometheus` |
| Loki | http://localhost:3100 | `loki` |
| VictoriaMetrics | http://localhost:8428 | `victoria-metrics` |
| Victoria Logs | http://localhost:9428 | `victoria-logs` |
| Tempo | http://localhost:3200 | `tempo` |

#### 3. Seed data for a demoable platform

```bash
# Create admin user + organizations + datasource configs
make seed

# Generate correlated log-to-trace pairs into Loki and Tempo
make seed-correlated
```

#### Stop

```bash
make tilt-down

# To also stop Colima:
colima stop
```

---

## Datasource Ports

Regardless of which path you choose, datasource services use the same local ports:

| Service | Port |
|---------|------|
| PostgreSQL | localhost:5432 |
| Valkey | localhost:6379 |
| Prometheus | http://localhost:9090 |
| Loki | http://localhost:3100 |
| VictoriaMetrics | http://localhost:8428 |
| Victoria Logs | http://localhost:9428 |
| Tempo | http://localhost:3200 |

## Testing

```bash
# All tests
make test

# Backend only
make backend-test

# Frontend only
make frontend-test
```

## Linting

```bash
# All linters
make lint

# Backend only (golangci-lint)
make backend-lint

# Frontend only (Biome + Knip)
make frontend-lint
```

## Security Scans

```bash
make security-local
```

Runs `govulncheck` against the backend and `gitleaks` against the repository (both via Docker).

## Full Quality Check

```bash
make check
```

Runs tests, linting, and security scans, then prints a summary table.

## API Endpoints

- `GET /api/health` — health check endpoint

## Elasticsearch (ELK) Datasource

Ace queries Elasticsearch directly for both **logs** and **metrics-style** aggregations, so Kibana is optional for exploration dashboards.

To use it locally:

1. Start the ELK profile: `make compose-up PROFILES=elk`
2. Add an Elasticsearch datasource in **Data Sources > Add Data Source**:
   - URL: `http://localhost:9200`
   - Auth: `none` (for local profile)
   - Default Index Pattern: `dash-logs-*`
   - Timestamp Field: `@timestamp` (optional)
   - Message Field: `message` (optional)
   - Level Field: `level` (optional)

Then use Explore/Dashboards:

- **Logs mode:** Lucene query string (example: `service.name:"backend" AND level:error`) or Elasticsearch JSON body.
- **Metrics mode:** JSON body with `aggs`, or plain query string and Ace will auto-build a date histogram timeseries.

Example metrics aggregation query:
```json
{
  "index": "dash-logs-*",
  "query": {
    "query_string": {
      "query": "service.name:backend"
    }
  },
  "aggs": {
    "timeseries": {
      "date_histogram": {
        "field": "@timestamp",
        "fixed_interval": "1m"
      }
    }
  }
}
```

## Code Coverage

```bash
# Backend
cd backend
go test ./... -coverprofile=coverage.out
go tool cover -func=coverage.out

# Frontend
cd frontend
npm run test:coverage
```

## Versioning and Releases

- **Versioning:** Semantic Versioning (`vMAJOR.MINOR.PATCH`) with Conventional Commits
- **Release planning:** `release-please` opens and updates release PRs from changes on `master`
- **Release output:** merge of the release PR creates a GitHub Release with generated notes and updates `CHANGELOG.md`
- **Auto-published assets:** backend binaries, frontend artifact tarball, image SBOMs, and checksums
- **Release guide:** see [RELEASE.md](RELEASE.md) for the maintainer workflow and versioning rules

## Container Images

Public multi-arch images are published to GHCR on every release:

- `ghcr.io/aceobservability/ace-backend`
- `ghcr.io/aceobservability/ace-frontend`

```bash
docker pull ghcr.io/aceobservability/ace-backend:latest
docker pull ghcr.io/aceobservability/ace-frontend:latest
```

When building the frontend image yourself, set `VITE_API_URL` at build time:

```bash
docker build -f frontend/Dockerfile --build-arg VITE_API_URL=https://api.example.com -t ace-frontend:local .
```

Tag strategy:

- Release tags: `vX.Y.Z`, `X.Y.Z`
- Moving tags: `X.Y`, `X`, `latest`, `sha-<commit>`

## Project Structure

```
ace/
├── frontend/           # Vue.js 3 application
│   ├── src/
│   └── package.json
├── backend/            # Go API
│   ├── cmd/api/        # Application entrypoint
│   ├── cmd/seed/       # Database seeder
│   ├── internal/       # Private application code
│   │   ├── handlers/   # HTTP handlers
│   │   ├── models/     # Data models
│   │   └── db/         # Database connection and migrations
│   └── pkg/            # Public packages
├── deploy/
│   ├── charts/         # Helm charts for local and production
│   └── docker/         # Docker Compose for local infra
├── agent/              # Ralph agent for automated development
├── Tiltfile            # Local dev orchestration (Tilt + Helm)
├── Makefile            # Developer workflow targets
└── mise.toml           # Tool version pinning
```
