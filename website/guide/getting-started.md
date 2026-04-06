---
title: "Getting Started"
---

# Ace Observability Platform

[![Lint](https://github.com/aceobservability/ace/actions/workflows/lint.yml/badge.svg?branch=main)](https://github.com/aceobservability/ace/actions/workflows/lint.yml)
[![Security](https://github.com/aceobservability/ace/actions/workflows/security.yml/badge.svg?branch=main)](https://github.com/aceobservability/ace/actions/workflows/security.yml)
[![Artifact Hub](https://img.shields.io/endpoint?url=https://artifacthub.io/badge/repository/ace-observability)](https://artifacthub.io/packages/search?repo=ace-observability)

A unified observability platform for metrics, logs, and traces. Built with Vue.js, Go, and the VictoriaMetrics ecosystem. Enterprise auth (RBAC, SSO, audit logging) included free.

## Features

- **Multi-datasource support** — VictoriaMetrics, Prometheus, Loki, VictoriaLogs, Tempo, VictoriaTraces, ClickHouse, Elasticsearch, CloudWatch
- **Visual query builder** — Builder/Code mode toggle with metric search, label filters, aggregation, and live query preview (MetricsQL/PromQL compatible)
- **AI-powered query assist** — inline AI suggestions with tool-calling for metric discovery. Configurable AI providers or GitHub Copilot integration
- **Export to dashboard** — save any Explore query directly as a dashboard panel
- **Grafana dashboard import** — connect to Grafana, browse dashboards, and import with fidelity report
- **AI chat-to-dashboard** — describe what you want in natural language, get a complete dashboard
- **16+ panel types** — line, stat, gauge, bar gauge, bar chart, pie, table, heatmap, histogram, scatter, candlestick, state timeline, status history, flame graph, node graph, canvas, logs, trace list, trace heatmap
- **Drag-and-drop layout** — 12-column grid with resize handles
- **Live log streaming** — real-time log tailing for Loki and VictoriaLogs
- **Log-to-trace correlation** — click a trace ID in logs to jump to the trace view
- **Enterprise auth** — RBAC (Admin/Editor/Viewer/Auditor), Google/Microsoft/Okta SSO, group-to-role mapping, audit logging
- **Dark/light mode** with the "Kinetic" design system (burnished brass palette, Space Grotesk typography)

## Tech Stack

- **Frontend:** Vue 3 (Composition API + TypeScript), Vite, Tailwind CSS v4, ECharts
- **Backend:** Go 1.25, net/http
- **Database:** PostgreSQL 16 (metadata), Valkey (cache)
- **Supported datasources:** VictoriaMetrics, Prometheus, Loki, VictoriaLogs, Tempo, VictoriaTraces, ClickHouse, Elasticsearch, CloudWatch

## Quick Start

### Option A: Tilt + Kubernetes (recommended for development)

Requires: Go 1.25+, Docker, a local k8s cluster (Colima, kind, or Docker Desktop), kubectl, helm, tilt

```bash
# Start local k8s cluster (Colima example)
colima start --kubernetes --cpu 4 --memory 8

# Start the full stack
tilt up -- victoria-metrics victoria-logs victoria-traces tempo loki prometheus \
  otel-collector telemetrygen elasticsearch clickhouse alertmanager vmalert grafana

# Seed admin user and datasources with k8s service URLs
make seed-tilt

# Seed demo dashboards
cd backend && go run ./cmd/seed-dashboards -org victoria

# Open the app
open http://localhost:5173
```

All datasource services are optional. Enable only what you need:

```bash
# Victoria stack only
tilt up -- victoria-metrics victoria-logs victoria-traces otel-collector telemetrygen

# LGTM stack only
tilt up -- prometheus loki tempo otel-collector telemetrygen

# Everything
tilt up -- victoria-metrics victoria-logs victoria-traces prometheus loki tempo \
  otel-collector telemetrygen elasticsearch clickhouse alertmanager vmalert grafana
```

The `otel-collector` config is generated dynamically from enabled services. Telemetrygen produces realistic web app telemetry (HTTP requests, database queries, distributed traces) via OpenTelemetry.

### Option B: Docker Compose

```bash
# Start infrastructure (pick a datasource profile)
make compose-up PROFILES=victoria

# Start telemetry generators
make telemetrygen PROFILES=victoria

# Start backend (hot reload with air)
make backend

# Start frontend (Vite dev server)
make frontend

# Seed admin user and datasources
make seed
```

Available profiles: `victoria`, `lgtm`, `elk`, `clickhouse`. Combine with commas: `PROFILES=victoria,lgtm`.

### Default Credentials

| Field | Value |
|-------|-------|
| Email | `admin@admin.com` |
| Password | `Admin1234` |

### Local Ports

| Service | Port |
|---------|------|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8080 |
| VictoriaMetrics | http://localhost:8428 |
| VictoriaLogs | http://localhost:9428 |
| VictoriaTraces | http://localhost:10428 |
| Prometheus | http://localhost:9090 |
| Loki | http://localhost:3100 |
| Tempo | http://localhost:3200 |
| Elasticsearch | http://localhost:9200 |
| ClickHouse | http://localhost:8123 |
| AlertManager | http://localhost:9093 |
| VMAlert | http://localhost:8880 |
| Grafana | http://localhost:3000 |
| Tilt Dashboard | http://localhost:10350 |

## Seeded Organizations

The seed command creates four organizations, each with datasources for its stack:

| Organization | Datasources |
|-------------|-------------|
| **Victoria** | VictoriaMetrics, VictoriaLogs, VictoriaTraces, VMAlert, AlertManager |
| **LGTM** | Prometheus, Loki, Tempo |
| **Elastic** | Elasticsearch |
| **ClickHouse** | ClickHouse |

## Demo Dashboards

Six pre-built dashboards are available for the Victoria organization:

1. **HTTP Service Overview** — request rate, error rate, latency percentiles (P50/P95/P99), status code breakdown
2. **Application Performance** — avg request duration, latency trends, resource usage
3. **Database Health** — connection pool stats, query duration, PostgreSQL vs Redis breakdown
4. **Infrastructure Overview** — service uptime, CPU utilization, scrape health, memory trends
5. **Log Intelligence** — service-filtered log views (API gateway, orders, payments), error analysis, slow query detection
6. **Trace Explorer** — latency heatmap, recent distributed traces

Seed them with:

```bash
cd backend && go run ./cmd/seed-dashboards -org victoria
```

## Container Images

Published to GHCR on every release (multi-arch: amd64 + arm64):

```bash
docker pull ghcr.io/aceobservability/ace-backend:latest
docker pull ghcr.io/aceobservability/ace-frontend:latest
```

Tags: `vX.Y.Z`, `X.Y.Z`, `X.Y`, `latest`, `sha-<commit>`

## Development

### Running Tests

```bash
# Frontend (Vitest + happy-dom)
cd frontend && bun run test

# Backend (Go testing)
cd backend && go test ./...
```

### Linting

```bash
make lint          # all linters
make backend-lint  # golangci-lint
make frontend-lint # Biome
```

### Building

```bash
# Frontend
cd frontend && bun run build

# Backend
cd backend && go build ./cmd/api
```

## Project Structure

```
ace/
├── frontend/               # Vue 3 application
│   ├── src/
│   │   ├── components/     # UI components (QueryBuilder, LogViewer, panels/)
│   │   ├── composables/    # Shared state (useDatasource, useOrganization, useAIProvider, useToast)
│   │   ├── views/          # Page views (MetricsExploreTab, LogsExploreTab, TracesExploreTab)
│   │   └── utils/          # Chart theme, dashboard helpers
│   └── package.json
├── backend/                # Go API
│   ├── cmd/
│   │   ├── api/            # Main API server
│   │   ├── seed/           # Admin user + org + datasource seeder
│   │   ├── seed-dashboards/# Demo dashboard seeder
│   │   └── seed-correlated/# Telemetry generator (realistic web app traces/logs/metrics)
│   └── internal/
│       ├── handlers/       # HTTP handlers (datasource proxy, AI chat, dashboards, auth, SSO)
│       ├── datasource/     # Datasource clients (Prometheus, VictoriaMetrics, Loki, Tempo, ClickHouse, ES)
│       ├── models/         # Data models
│       ├── db/             # Database connection, migrations
│       ├── auth/           # JWT, password hashing, middleware
│       ├── authz/          # RBAC authorization
│       └── audit/          # Append-only audit logging
├── deploy/
│   ├── charts/ace/              # Production Helm chart
│   ├── charts/ace-local-infra/  # Local dev Helm chart (all datasource services)
│   └── docker/                  # Docker Compose configs per stack
├── Tiltfile                # Local dev orchestration
├── Makefile                # Common commands
├── DESIGN.md               # Kinetic v2 design system
└── RELEASE.md              # Release process
```

## Versioning and Releases

- Semantic Versioning (`vMAJOR.MINOR.PATCH`) with Conventional Commits
- `release-please` opens release PRs from changes on `main`
- Merge creates a GitHub Release with notes + CHANGELOG update
- Auto-published: backend binaries, frontend tarball, container images, SBOMs, checksums
- See `RELEASE.md` for maintainer workflow
