# Unified Seed System Design

## Problem

Three separate seed commands (`seed`, `seed-admin`, `seed-datasources`) with hardcoded Victoria-only datasources. Need to seed 4 organizations (victoria, elastic, clickhouse, lgtm) with stack-appropriate datasources.

## Solution

Replace all three with a single `cmd/seed/main.go` that seeds one admin user and 4 organizations with their respective datasources.

## Data

**Admin user:** `admin@admin.com` / `Admin1234` (configurable via flags), admin role in all orgs.

**Organizations and datasources:**

| Org (slug) | Datasource | Type | URL |
|---|---|---|---|
| victoria | VictoriaMetrics | victoriametrics | http://localhost:8428 |
| victoria | Victoria Logs | victorialogs | http://localhost:9428 |
| victoria | VictoriaTraces | victoriatraces | http://localhost:10428 |
| victoria | VMAlert | vmalert | http://localhost:8880 |
| elastic | Elasticsearch | elasticsearch | http://localhost:9200 |
| clickhouse | ClickHouse | clickhouse | http://localhost:8123 |
| lgtm | Mimir | prometheus | http://localhost:9009 |
| lgtm | Loki | loki | http://localhost:3100 |
| lgtm | Tempo | tempo | http://localhost:3200 |

## Behavior

- Connects to PostgreSQL, runs migrations
- Creates admin user if not exists (by email)
- For each org: creates if slug doesn't exist, adds admin membership, inserts datasources (skips if type already exists for that org)
- Single transaction, idempotent
- Uses localhost URLs (backend runs on host, not in Docker)

## Files Changed

- **Replace:** `backend/cmd/seed/main.go` — new unified seed
- **Delete:** `backend/cmd/seed-admin/`, `backend/cmd/seed-datasources/`
- **Update:** `Makefile` — single `seed` target replacing `seed-admin` and `seed-datasources`
