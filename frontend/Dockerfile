FROM oven/bun:1-alpine AS builder

WORKDIR /app

COPY frontend/package.json frontend/bun.lock ./
RUN bun install --frozen-lockfile

COPY frontend/ ./
RUN bun run build

FROM nginxinc/nginx-unprivileged:1.27-alpine

LABEL org.opencontainers.image.source=https://github.com/aceobservability/ace

COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
# Rendered into /etc/nginx/conf.d/api-proxy.inc by the entrypoint before nginx
# starts; executable so the entrypoint runs it rather than sourcing it.
COPY --chmod=0755 frontend/docker-entrypoint.d/30-render-api-proxy.sh /docker-entrypoint.d/30-render-api-proxy.sh
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
