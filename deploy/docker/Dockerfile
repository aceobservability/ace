# ace-standalone: the combined image (see CONTEXT.md). A single app-only
# container that bundles the SPA and the backend behind one nginx, for simple
# single-host deployments (e.g. a low-power VM). Datastores (Postgres, Valkey)
# stay external. Two processes run under s6-overlay — nginx owns the public
# :8080 and proxies /api to the backend bound on loopback :9090.
# See docs/adr/0001-standalone-image-and-runtime-api-proxy.md.
#
# Build context is the repo root (matches backend/ and frontend/ Dockerfiles):
#   docker build -f deploy/docker/Dockerfile -t ace-standalone .

# ---- Frontend build (mirrors frontend/Dockerfile) ----
# Built on the build platform — the SPA is static, arch-independent output, so we
# compile it once instead of under QEMU for each target arch.
FROM --platform=$BUILDPLATFORM oven/bun:1-alpine AS frontend
WORKDIR /app
COPY frontend/package.json frontend/bun.lock ./
RUN bun install --frozen-lockfile
COPY frontend/ ./
RUN bun run build

# ---- Backend build (mirrors backend/Dockerfile; cross-compiled per target) ----
FROM --platform=$BUILDPLATFORM golang:1.25.11-alpine AS backend
ARG TARGETOS
ARG TARGETARCH
WORKDIR /src
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath -o /out/ace-api ./cmd/api

# ---- s6-overlay fetch (per target arch, checksum-verified) ----
# Runs on the build platform; the right arch tarball is selected explicitly from
# TARGETARCH, so there's no need to emulate the target to download it.
FROM --platform=$BUILDPLATFORM alpine:3.20 AS s6
ARG TARGETARCH
ARG S6_OVERLAY_VERSION=3.2.3.0
RUN apk add --no-cache curl xz
RUN set -eu; \
    case "$TARGETARCH" in \
      amd64) s6_arch=x86_64 ;; \
      arm64) s6_arch=aarch64 ;; \
      *) echo "unsupported TARGETARCH: $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    base="https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}"; \
    mkdir -p /s6-rootfs /tmp/s6; cd /tmp/s6; \
    for f in s6-overlay-noarch.tar.xz "s6-overlay-${s6_arch}.tar.xz"; do \
      curl -fsSL "${base}/${f}" -o "$f"; \
      curl -fsSL "${base}/${f}.sha256" -o "$f.sha256"; \
      sha256sum -c "$f.sha256"; \
      tar -C /s6-rootfs -Jxpf "$f"; \
    done

# ---- Final image: nginx + s6-overlay + backend + SPA ----
FROM nginx:1.27-alpine

LABEL org.opencontainers.image.source=https://github.com/aceobservability/ace

# s6-overlay runtime (/init, /command, /package, skeleton /etc/s6-overlay).
COPY --from=s6 /s6-rootfs/ /

# Backend binary and built SPA.
COPY --from=backend /out/ace-api /usr/local/bin/ace-api
COPY --from=frontend /app/dist /usr/share/nginx/html

# nginx config and the shared #266 proxy render script. We reuse frontend/nginx.conf
# verbatim — it serves the SPA and `include`s conf.d/api-proxy.inc — and bake that
# include at build time by running the same render script with the loopback upstream
# hardwired. This keeps the streaming proxy directives (proxy_buffering off, HTTP/1.1,
# long read timeout) defined in exactly one place.
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY frontend/docker-entrypoint.d/30-render-api-proxy.sh /usr/local/bin/render-api-proxy.sh
RUN ACE_BACKEND_URL=http://127.0.0.1:9090 \
    ACE_API_PROXY_CONF=/etc/nginx/conf.d/api-proxy.inc \
    sh /usr/local/bin/render-api-proxy.sh

# s6 service definitions (nginx + backend longruns, crash-detection finish scripts).
COPY deploy/docker/rootfs/ /
RUN chmod 0755 \
      /etc/s6-overlay/s6-rc.d/backend/run /etc/s6-overlay/s6-rc.d/backend/finish \
      /etc/s6-overlay/s6-rc.d/nginx/run /etc/s6-overlay/s6-rc.d/nginx/finish

# Writable data dir for the backend's persisted JWT signing keys (see DATA_DIR in
# backend/internal/auth/jwt.go). Owned by the unprivileged nginx user the backend
# drops to, and a natural volume mount point so keys survive restarts.
RUN install -d -o nginx -g nginx /data
ENV DATA_DIR=/data

# Stop the container if stage-2 init fails instead of limping along half-started.
ENV S6_BEHAVIOUR_IF_STAGE2_FAILS=2

# The nginx base sets STOPSIGNAL SIGQUIT (for a bare nginx master), but here PID1 is
# s6, which drives shutdown from SIGTERM — reset it so `docker stop` / Kubernetes
# termination reaches s6 instead of being ignored until the SIGKILL grace runs out.
STOPSIGNAL SIGTERM

# Privilege model: request-serving and application code runs unprivileged — the Go
# backend drops to the nginx user via s6-setuidgid, and nginx forks its workers as
# the nginx user (`user nginx;` in the base config). Only non-serving components run
# as root: the s6 supervision tree (PID1, required for correct SIGTERM-driven
# shutdown — rootless s6-overlay drops SIGTERM and hard-kills on `docker stop`) and
# the nginx master (nginx's standard model, so it can open the log streams).
EXPOSE 8080

ENTRYPOINT ["/init"]
