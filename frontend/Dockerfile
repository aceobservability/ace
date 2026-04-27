FROM oven/bun:1-alpine AS builder

# Optional build-time override. Empty default keeps production calls same-origin under /api.
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL

WORKDIR /app

COPY frontend/package.json frontend/bun.lock ./
RUN bun install --frozen-lockfile

COPY frontend/ ./
RUN bun run build

FROM nginxinc/nginx-unprivileged:1.27-alpine

LABEL org.opencontainers.image.source=https://github.com/aceobservability/ace

COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
