#!/usr/bin/env bash
# Black-box smoke test for the standalone compose stack.
# Brings up postgres + valkey + ace and asserts GET / (SPA) and GET /api/health
# (200 via the in-container nginx proxy).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
COMPOSE_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="$COMPOSE_DIR/docker-compose.yml"
IMAGE_TAG="${ACE_STANDALONE_IMAGE:-ace-standalone:smoke}"
PORT="${ACE_PORT:-18080}"
JWT_SECRET="${JWT_SECRET:-smoke-test-secret-$(openssl rand -hex 16)}"
SKIP_BUILD="${SKIP_BUILD:-0}"

cleanup() {
  docker compose -f "$COMPOSE_FILE" --env-file "$COMPOSE_DIR/.env.smoke" down -v --remove-orphans 2>/dev/null || true
  rm -f "$COMPOSE_DIR/.env.smoke"
}
trap cleanup EXIT

printf 'JWT_SECRET=%s\nACE_PORT=%s\nACE_STANDALONE_IMAGE=%s\n' \
  "$JWT_SECRET" "$PORT" "$IMAGE_TAG" >"$COMPOSE_DIR/.env.smoke"

if [ "$SKIP_BUILD" != 1 ]; then
  echo "Building standalone image: $IMAGE_TAG"
  docker build -f "$ROOT/deploy/docker/Dockerfile" -t "$IMAGE_TAG" "$ROOT"
fi

echo "Starting standalone stack on port $PORT"
docker compose -f "$COMPOSE_FILE" --env-file "$COMPOSE_DIR/.env.smoke" up -d

base="http://127.0.0.1:${PORT}"
echo "Waiting for ace to become ready"
for i in $(seq 1 60); do
  if curl -fsS "$base/api/health" >/dev/null 2>&1; then
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "Timed out waiting for $base/api/health" >&2
    docker compose -f "$COMPOSE_FILE" --env-file "$COMPOSE_DIR/.env.smoke" logs ace >&2 || true
    exit 1
  fi
  sleep 2
done

echo "Checking SPA at GET /"
html="$(curl -fsS "$base/")"
echo "$html" | grep -qi '<html'

echo "Checking API at GET /api/health"
health="$(curl -fsS "$base/api/health")"
echo "$health" | grep -q '"status":"ok"'

echo "Standalone smoke test passed"