---
title: "Cursor MCP"
---

# Connect Ace as a remote MCP in Cursor

Ace already hosts a remote [Model Context Protocol](https://modelcontextprotocol.io/) server on the same origin as the API. Cursor talks to it over Streamable HTTP (MCP spec 2025-03-26). You do not need a local MCP process, a marketplace plugin, or a second token type.

## Remote URL

The MCP endpoint is the Ace API host plus `/mcp`.

| Deployment | URL |
|------------|-----|
| Live example | `https://ace.janhoon.app/mcp` |
| Self-hosted | `https://<your-ace-origin>/mcp` |
| Local API (default) | `http://localhost:8080/mcp` |

`/mcp` is an API route on the Ace backend process. It is not the HTML SPA. Opening that path in a browser without a Bearer token returns **401**, not the Vue app.

## Authentication

Send the same Ace access JWT used by the REST API (`GET /api/auth/me`):

```
Authorization: Bearer <Ace access JWT>
```

There is no MCP-specific token, OAuth client id, or API-key table. If you sign in with SSO (Google, Microsoft, or Okta), you still put an Ace access JWT in this header — the same token the SPA uses after login.

Access tokens expire after about **15 minutes**. On **401**, refresh and update the header:

```bash
curl -sS -X POST https://ace.janhoon.app/api/auth/refresh \
  -H 'Content-Type: application/json' \
  -d '{"refresh_token":"<refresh_token>"}'
```

The JSON body includes a new `access_token`.

### Mint a token from password login

`POST /api/auth/login` returns `access_token`. Export it into the environment so a real JWT is never committed:

```bash
export ACE_ACCESS_TOKEN="$(
  curl -sS -X POST https://ace.janhoon.app/api/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"email":"<you@example.com>","password":"<your-password>"}' \
    | jq -r .access_token
)"
```

Replace the origin with your Ace host. Do not paste the JWT into `mcp.json`.

## Cursor `mcp.json`

Cursor remote MCP uses `url` plus `headers`. Put this in the project file `.cursor/mcp.json` or the global file `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "ace": {
      "url": "https://ace.janhoon.app/mcp",
      "headers": {
        "Authorization": "Bearer ${env:ACE_ACCESS_TOKEN}"
      }
    }
  }
}
```

`${env:ACE_ACCESS_TOKEN}` reads the environment variable Cursor was started with. For a self-hosted or local API, change `url` to `https://<your-ace-origin>/mcp` or `http://localhost:8080/mcp`.

No marketplace listing is required. Adding this config is enough.

## Enable the server in Cursor

1. Export `ACE_ACCESS_TOKEN` (see above), then start or restart Cursor so it sees the variable.
2. Open **Settings → Tools & MCP**.
3. Confirm the `ace` server is listed and enabled.

Cursor’s generic MCP UI and config locations are documented at [cursor.com/docs/mcp](https://cursor.com/docs/mcp). This page only covers Ace-specific URL, auth, and tools.

## Walkthrough: whoami → query → dashboard

Once the server is connected, a session can follow this path (the acceptance flow):

1. **`whoami`** — Confirm the signed-in user and organization memberships (same shape as `GET /api/auth/me`). No secrets or tokens are returned.
2. **`list_datasources`** — Get `id`, `name`, and `type` for datasources in an org (no URLs or auth config). Pass `org_id` if you belong to more than one organization.
3. **Query** — Use `get_metrics` to discover metric names, then **`run_query`** with `datasource_id` and a `query`/`expr` (PromQL/MetricsQL, LogQL, or TraceQL). Optional `signal` is `metrics`, `logs`, or `traces`.
4. **Create a dashboard** — **`create_dashboard`** with a `title` (admin or editor). Then **`upsert_panels`** with `dashboard_id` and panel specs (`title`, `type`, `query.expr`, `datasource_id`). Omit panel `id` to create; include `id` to update.

Related tools: `get_labels`, `get_label_values`, `get_trace_services`, `list_dashboards`, `get_dashboard`, `save_generated_dashboard`.

## Organization scoping

Tools that list org resources take an optional `org_id`:

- One membership: omit `org_id`; Ace uses that organization.
- Multiple memberships: pass `org_id` (from `whoami`). Otherwise the tool errors asking for it.

You cannot use an `org_id` you are not a member of.

## Tools on `/mcp`

| Tool | Role |
|------|------|
| `whoami` | Signed-in user and orgs |
| `list_datasources` | Datasource id / name / type |
| `get_metrics` | Metric name discovery |
| `get_labels` | Label names |
| `get_label_values` | Values for one label |
| `get_trace_services` | Tracing service names |
| `run_query` | Execute a metrics, logs, or traces query |
| `list_dashboards` | Dashboards in the org |
| `get_dashboard` | Dashboard plus panels |
| `create_dashboard` | Create a dashboard |
| `upsert_panels` | Create or update panels |
| `save_generated_dashboard` | Persist a generated dashboard spec |

Create/update dashboard tools require an admin or editor role, matching the HTTP API.

## Troubleshooting

| Symptom | What to check |
|---------|----------------|
| **401** on `/mcp` | Missing, expired, or invalid Bearer JWT. Refresh the access token (~15 minute lifetime) and restart Cursor or update the env var. Unauthenticated `/mcp` is always 401. |
| Browser shows 401 HTML/JSON, not the app | Expected. The SPA is not served at `/mcp`. |
| Tool asks for `org_id` | You belong to more than one organization. Pass `organization_id` from `whoami`. |
| Server not listed | Config is in `.cursor/mcp.json` or `~/.cursor/mcp.json`, Cursor was restarted after exporting `ACE_ACCESS_TOKEN`, and the server is enabled under Settings → Tools & MCP. |
