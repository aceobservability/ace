---
status: accepted
---

# Standalone image and runtime API proxy

To let operators run Ace on a single low-power host without building images or
cloning the repo (issue #255), we publish a second **combined image**
(`ghcr.io/aceobservability/ace-standalone`) that bundles the frontend and
backend behind one nginx, and we make the **frontend-only image** able to
forward `/api` to a backend whose address (`ACE_BACKEND_URL`) is supplied at run
time instead of baked in at build time. In both images nginx owns `/api` and
the only thing that varies is the upstream — the browser always talks
[same-origin](../../CONTEXT.md), so the build-time `VITE_API_URL` is removed and
`API_BASE` becomes a constant empty string.

## Considered options

- **Embed the SPA in the Go backend and drop nginx** — one process, no proxy.
  Rejected: the frontend-only image still needs a web server, so we'd maintain
  two static-serving implementations; nginx stays the single static server in
  both images.
- **supervisord for the two-process combined image** — rejected: pulls Python
  (~50 MB) into an Alpine image, against the low-power/small-image goal. We use
  **s6-overlay** for correct PID1, signal forwarding, and per-service
  crash-detection at a few hundred KB.
- **Bundle Postgres + Valkey into the standalone image** — rejected: stateful
  datastores in an app image is an anti-pattern (state in the container layer,
  tangled upgrades, image bloat). The image is app-only; the datastores are
  external, supplied by a published `docker-compose.yml`.
- **Browser calls the backend directly cross-origin** (the original issue's
  literal reading) — rejected in favour of an nginx same-origin proxy: no CORS
  dependency, and the backend need not be exposed to the browser at all.

## Consequences

- **Breaking:** `VITE_API_URL` is gone. Anyone building the frontend with it
  must switch to running with `ACE_BACKEND_URL` (or front the app with an
  ingress). Called out in the changelog.
- The `/api` proxy in the frontend-only image is **opt-in**: emitted only when
  `ACE_BACKEND_URL` is set, so the existing Kubernetes/ingress deployment —
  where the ingress routes `/api` — is unchanged.
- In the combined image the backend binds `127.0.0.1` (via a new
  `ACE_LISTEN_ADDR`, default `:8080`), reachable only through nginx.
- The proxy must keep streaming endpoints working (SSE + chunked):
  `proxy_buffering off`, HTTP/1.1, long read timeout.
- The backend's wildcard CORS is now redundant for our deployments; tightening
  it is a separate follow-up.
