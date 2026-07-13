#!/usr/bin/env bash
# Black-box smoke test for the standalone compose stack.
# Brings up postgres + valkey + ace and asserts GET / (SPA) and GET /api/health
# (200 via the in-container nginx proxy).
#
# Local/CI: builds ace-standalone:smoke from deploy/docker/Dockerfile (default).
# Release: set ACE_STANDALONE_IMAGE to a ghcr.io/... ref to pull instead of build.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
COMPOSE_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="$COMPOSE_DIR/docker-compose.yml"
IMAGE_TAG="${ACE_STANDALONE_IMAGE:-ace-standalone:smoke}"
PORT="${ACE_PORT:-18080}"
JWT_SECRET="${JWT_SECRET:-smoke-test-secret-$(openssl rand -hex 16)}"

export JWT_SECRET ACE_PORT="$PORT" ACE_STANDALONE_IMAGE="$IMAGE_TAG"

compose() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

cleanup() {
  compose down -v --remove-orphans 2>/dev/null || true
}
trap cleanup EXIT

if [[ "$IMAGE_TAG" != ghcr.io/* ]]; then
  echo "Building standalone image: $IMAGE_TAG"
  docker build -f "$ROOT/deploy/docker/Dockerfile" -t "$IMAGE_TAG" "$ROOT"
fi

echo "Starting standalone stack on port $PORT"
compose up -d

base="http://127.0.0.1:${PORT}"
echo "Waiting for ace to become ready"
for i in $(seq 1 60); do
  if curl -fsS "$base/api/health" >/dev/null 2>&1; then
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "Timed out waiting for $base/api/health" >&2
    compose logs ace >&2 || true
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
