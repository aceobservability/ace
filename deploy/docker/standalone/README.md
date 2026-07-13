# Standalone Docker deployment

Run Ace on a single host (e.g. a low-power VM) without cloning the repo or building images. The stack uses the published **combined image** (`ace-standalone`) plus external Postgres and Valkey.

See [CONTEXT.md](../../../CONTEXT.md) and [ADR-0001](../../../docs/adr/0001-standalone-image-and-runtime-api-proxy.md) for vocabulary and design rationale.

## Prerequisites

- Docker Engine with Compose v2
- A copy of this directory (`docker-compose.yml` + `.env.example`)

## Quick start

```bash
cp .env.example .env
# Edit .env and set JWT_SECRET (required). Example:
#   openssl rand -base64 48
docker compose up -d
```

Open http://localhost:8080 — the SPA and API share the same origin (`/api` is proxied inside the container).

`docker compose up` fails immediately if `JWT_SECRET` is unset (no insecure default).

## First admin user

Migrations run automatically on startup. Create the first user via the registration UI or API:

```bash
curl -fsS -X POST http://localhost:8080/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"ChangeMe123!","name":"Admin"}'
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | *(required)* | Encryption key for secrets at rest; must be set in `.env` |
| `ACE_PORT` | `8080` | Host port for the web UI |
| `ACE_STANDALONE_IMAGE` | `ghcr.io/aceobservability/ace-standalone:latest` | Image tag to run — **pin a release tag** (e.g. `v0.1.0`) in production; `:latest` upgrades on `docker compose pull` |
| `POSTGRES_*` | `ace` / `ace` / `ace` | Postgres credentials — **change `POSTGRES_PASSWORD`** before exposing this host beyond localhost |

Persistent data lives in named volumes: `postgres_data`, `valkey_data`, and `ace_data` (JWT signing keys under `/data`).

## Smoke test

From the repo root (builds the image locally instead of pulling from GHCR):

```bash
./deploy/docker/standalone/smoke.sh
```
