# Ace - Monitoring Dashboard

[![CodeQL](https://github.com/aceobservability/ace/actions/workflows/security.yml/badge.svg?branch=main)](https://github.com/aceobservability/ace/actions/workflows/security.yml)
[![Lint](https://github.com/aceobservability/ace/actions/workflows/lint.yml/badge.svg?branch=main)](https://github.com/aceobservability/ace/actions/workflows/lint.yml)
[![Security](https://github.com/aceobservability/ace/actions/workflows/security.yml/badge.svg?branch=main)](https://github.com/aceobservability/ace/actions/workflows/security.yml)

A Grafana-like monitoring dashboard built with Vue.js, Go, and Prometheus.

## Versioning and Releases

- **Versioning:** Semantic Versioning (`vMAJOR.MINOR.PATCH`) with Conventional Commits
- **Release planning:** `release-please` opens and updates release PRs from changes on `main`
- **Release output:** merge of the release PR creates a GitHub Release with generated notes and updates `CHANGELOG.md`
- **Auto-published assets:** backend binaries, frontend artifact tarball, image SBOMs, and checksums
- **Release guide:** see `RELEASE.md` for the maintainer workflow and versioning rules

## Container Images

Public multi-arch images are published to GHCR on every release:

- `ghcr.io/aceobservability/ace-backend`
- `ghcr.io/aceobservability/ace-frontend`

Example pulls:

```bash
docker pull ghcr.io/aceobservability/ace-backend:v0.1.0
docker pull ghcr.io/aceobservability/ace-frontend:v0.1.0
```

When building the frontend image yourself, set `VITE_API_URL` at build time:

```bash
docker build -f frontend/Dockerfile --build-arg VITE_API_URL=https://api.example.com -t dash-frontend:local .
```

Tag strategy:

- Release tags: `vX.Y.Z`, `X.Y.Z`
- Moving tags: `X.Y`, `X`, `latest`, `sha-<commit>`

## Tech Stack

- **Frontend:** Vue.js 3 (Composition API + TypeScript)
- **Backend:** Go API
- **Database:** PostgreSQL (metadata storage)
- **Data Source:** Prometheus

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

## Development

### Prerequisites

- Node.js 18+
- Go 1.25+
- Docker (for image builds and local security tooling)
- A local Kubernetes cluster (for example: kind, minikube, or Docker Desktop Kubernetes)
- `kubectl`, `helm`, and `tilt`

### Setup

1. Start your local Kubernetes cluster.

2. Start Tilt from the repo root:
   ```bash
   make tilt-up
   ```

   Tilt will run:
   - Core services enabled by default: `postgres`, `valkey`, `backend`, `frontend`
   - External test services disabled by default: `prometheus`, `loki`, `victoria-metrics`, `victoria-logs`, `tempo`

   Open the Tilt UI (shown in the `tilt up` output), then enable optional services from the UI when needed.
   You can also pre-enable them at startup, for example: `tilt up -- --enable=prometheus --enable=loki`.

3. Access local endpoints:
   - Postgres: localhost:5432
   - Valkey: localhost:6379
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:8080
   - Optional datasource ports (once enabled in Tilt):
     - Prometheus: http://localhost:9090
     - Loki: http://localhost:3100
     - VictoriaMetrics: http://localhost:8428
     - Victoria Logs: http://localhost:9428
     - Tempo: http://localhost:3200

4. Stop everything:
   ```bash
   make tilt-down
   ```

### Seed First Admin

Create the first admin user and organization:

```bash
make seed-admin
# defaults: EMAIL=admin@admin.com PASSWORD=Admin1234 ORG=default

# or override values
make seed-admin EMAIL=admin@example.com PASSWORD='AdminPass123' ORG='My Company' NAME='First Admin'
```

This also seeds five default datasources for the new organization:
Prometheus (`http://localhost:9090`), VictoriaMetrics (`http://localhost:8428`),
Loki (`http://localhost:3100`), Victoria Logs (`http://localhost:9428`), and
Tempo (`http://localhost:3200`).

If the admin user/org already exists, seed only the default datasources:

```bash
make seed-datasources
# default ORG=default

# or for another organization slug
make seed-datasources ORG=my-company
```

### Elasticsearch + Logstash (ELK) in Ace (without Kibana)

Ace can query Elasticsearch directly for both **logs** and **metrics-style** aggregations, so Kibana is optional for exploration dashboards.

If you run Elasticsearch locally, add an `Elasticsearch (ELK)` datasource in **Data Sources → Add Data Source**:

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

### Running Tests

Frontend:
```bash
cd frontend
npm run type-check
npm run test
```

Backend:
```bash
cd backend
go test ./...
```

### Code Coverage
Refresh locally:

```bash
# Backend
cd backend
go test ./... -coverprofile=coverage.out
go tool cover -func=coverage.out

# Frontend
cd ../frontend
npm run test:coverage
```

### Running Linting

From repo root:
```bash
make lint
```

Run backend lint only:
```bash
make backend-lint
```

Run frontend lint only:
```bash
make frontend-lint
```

Or run commands directly:

Backend:
```bash
cd backend
golangci-lint run ./...
```

Frontend:
```bash
cd frontend
npm run lint
npm run lint:dead-code
```

### Running Security Scans Locally

From repo root:

```bash
make security-local
```

This runs:

- `govulncheck` against `backend/` in a Go `1.25.7` Docker container
- `gitleaks` against the full repository via Docker

### API Endpoints

- `GET /api/health` - Health check endpoint

## Project Structure

```
dash/
├── frontend/           # Vue.js 3 application
│   ├── src/
│   └── package.json
├── backend/            # Go API
│   ├── cmd/api/        # Application entrypoint
│   ├── internal/       # Private application code
│   │   ├── handlers/   # HTTP handlers
│   │   ├── models/     # Data models
│   │   └── db/         # Database connection and migrations
│   └── pkg/            # Public packages
├── agent/              # Ralph agent for automated development
├── Tiltfile            # Local dev orchestration (Tilt + Helm)
├── deploy/charts/      # Helm charts for local infra services
└── README.md
```
