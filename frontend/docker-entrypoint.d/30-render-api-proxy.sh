#!/bin/sh
# Render the optional same-origin /api reverse proxy for the frontend-only image.
#
# When ACE_BACKEND_URL is set, emit a `location /api` block that forwards to that
# backend upstream and keeps streaming endpoints (SSE + chunked) working. When it
# is unset, write an empty file so the `include` in nginx.conf always resolves and
# the existing Kubernetes/ingress deployment — where the ingress owns /api — is
# unchanged. See docs/adr/0001-standalone-image-and-runtime-api-proxy.md.
set -eu

backend_url="${ACE_BACKEND_URL:-}"
out="${ACE_API_PROXY_CONF:-/etc/nginx/conf.d/api-proxy.inc}"

if [ -z "$backend_url" ]; then
  : >"$out"
  echo "ACE_BACKEND_URL unset: no /api proxy emitted (ingress is assumed to route /api)"
  exit 0
fi

cat >"$out" <<EOF
location /api {
  proxy_pass $backend_url;
  proxy_http_version 1.1;
  proxy_set_header Host \$host;
  proxy_set_header X-Real-IP \$remote_addr;
  proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto \$scheme;
  proxy_set_header Connection "";

  # Keep SSE and chunked responses streaming instead of buffering them.
  proxy_buffering off;
  proxy_read_timeout 1h;
}
EOF

echo "ACE_BACKEND_URL set: proxying /api to $backend_url"
