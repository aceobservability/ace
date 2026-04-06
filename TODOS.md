# TODOS

## AI Providers

### Per-user rate limiting for org providers

**What:** Add configurable per-user request quotas (e.g., 100 requests/hour) for org-level AI providers.

**Why:** When an admin configures a shared API key, all org members share it with no limits. One user could burn through the org's entire API budget. Rate limiting protects against accidental or excessive usage.

**Pros:** Cost protection for shared API keys, fair usage across org members.
**Cons:** Adds complexity — needs a counter store (Redis or in-memory with TTL), admin UI for quota config, and user-facing quota exceeded messaging.

**Context:** For MVP, admins manage quotas externally (provider dashboard rate limits, billing alerts). This TODO tracks adding native rate limiting within Ace. Consider a simple in-memory sliding window counter per (user_id, provider_id) before reaching for Redis.

**Effort:** M
**Priority:** P2
**Depends on:** Multi-provider AI support

### Anthropic native API provider

**What:** Implement an AnthropicProvider that translates OpenAI-format messages to Anthropic's /v1/messages format.

**Why:** Enables direct Anthropic API keys without needing OpenRouter as a gateway. Anthropic's API uses different auth (`x-api-key` header), request schema (top-level `system` field instead of system message role), and streaming format (custom SSE event types like `content_block_delta`).

**Pros:** Direct Anthropic access without a middleman, potentially lower latency and cost.
**Cons:** Maintenance burden for one vendor's proprietary format. Message format translation adds complexity.

**Context:** OpenRouter already wraps Anthropic in an OpenAI-compatible API, so this is a convenience feature. The AIProvider interface makes it straightforward to add — implement ListModels and Chat with the Anthropic-specific request/response translation.

**Effort:** M
**Priority:** P3
**Depends on:** Multi-provider AI support

## Copilot

### Add iterative spec refinement

**What:** After generating a dashboard spec, let the user refine it via follow-up chat messages (add/remove/modify panels) without starting a new conversation.

**Why:** Currently the interception guard does `return` after the first `generate_dashboard` call. Follow-up messages start fresh with no memory of the generated spec. Iterative refinement ("add a panel for error rates", "change the chart to a bar chart") is the key differentiator for an AI-first dashboard tool.

**Context:** The `chatHistory` array in `handleSend` already preserves conversation context across turns. The spec could be serialized back into the chat as a `tool` result message so the AI knows what was generated. Alternatively, the current spec could be injected into the system prompt. The main complexity is deciding between modifying the existing spec vs. generating a new one, and handling the case where the user already saved the first spec.

**Effort:** M
**Priority:** P2
**Depends on:** Chat-to-dashboard MVP

### Optimize tool schema token usage

**What:** Only send the `generate_dashboard` tool definition after metric discovery rounds complete, reducing token overhead per request.

**Why:** The full tools array (~800 tokens of schema) is sent on every round trip to the GitHub Copilot API. During get_metrics/get_labels rounds where `generate_dashboard` won't be called, this wastes ~30% of the schema budget.

**Context:** The frontend could track which tools have been called in the current loop iteration and conditionally add `generate_dashboard` to the tools array after at least one metric discovery call completes. Risk: the AI might try to call `generate_dashboard` before discovery if the user's prompt is very specific. The optimization should only remove the tool from early rounds, not prevent the AI from calling it entirely.

**Effort:** S
**Priority:** P3
**Depends on:** Chat-to-dashboard MVP

### Spec sharing via URL

**What:** Serialize a DashboardSpec to a URL parameter so users can share generated specs without saving.

**Why:** The "send this to my teammate" moment. A shareable link containing the spec lets users collaborate on dashboard designs before committing them.

**Context:** Encode the spec as base64 in a URL query parameter (e.g., `/app/copilot?spec=base64...`). On load, the CopilotPanel renders the DashboardSpecPreview with the decoded spec. Keep URL length reasonable by limiting to 8 panels (the existing cap).

**Effort:** S
**Priority:** P3
**Depends on:** Chat-to-dashboard MVP

## Sidebar

### Extend useFavorites to non-dashboard sections

**What:** Extend the `useFavorites` composable to support favorites for Services, Explore queries, and Alerts — not just dashboards.

**Why:** The new sidebar flyout displays a Favorites section per nav section, but `useFavorites` currently only tracks dashboard IDs. Services, Explore, and Alerts flyouts will show the empty state hint ("Star items to pin them here") until this is implemented.

**Pros:** Favorites become useful across all sections, making the flyout a power-user productivity tool.

**Cons:** Requires defining what a "favorite" means for each section (service ID? query string? alert rule ID?) and extending the localStorage schema.

**Context:** The sidebar flyout is display-only — it reads from `useFavorites` but doesn't write. The star/favorite action must be added to each view (ServicesView, UnifiedExploreView, AlertsView) individually. DashboardList already has starring.

**Effort:** M
**Priority:** P2
**Depends on:** Sidebar redesign

## Dashboard

### Crosshair sync: extend to StateTimelinePanel

**What:** Add crosshair sync support to StateTimelinePanel so it participates in dashboard-wide tooltip synchronization.

**Why:** StateTimelinePanel has a time x-axis but uses `trigger: 'item'` with CustomChart rendering, so it can't join the ECharts `connect` group. Users with mixed dashboards (line charts + state timelines) would benefit from seeing the time cursor on all panels.

**Pros:** More complete time-inspection experience across all time-based panels.

**Cons:** Requires either changing tooltip trigger (may break existing behavior) or building manual event-based sync alongside the `connect` API.

**Context:** The crosshair sync composable (`useCrosshairSync.ts`) uses ECharts' `connect` API which only syncs axis-triggered tooltips. StateTimelinePanel would need either: (a) switching to `trigger: 'axis'` (risky for CustomChart), or (b) the composable broadcasting a timestamp that StateTimelinePanel listens to independently via `watch`.

**Effort:** S
**Priority:** P3
**Depends on:** Crosshair sync feature (line_chart, bar_chart, candlestick)

## Enterprise Auth

### Separate DB role for audit log writes

**What:** Create a dedicated PostgreSQL role with INSERT-only privileges on the `audit_log` table. Use a separate connection pool for audit writes.

**Why:** The current audit log immutability trigger (`BEFORE UPDATE OR DELETE ... RAISE EXCEPTION`) can be bypassed by the same DB role that runs DDL on startup. For real compliance audits (SOC 2, ISO 27001), the audit system should use a role that cannot ALTER or DROP the trigger.

**Pros:** True immutability guarantee. Auditors can verify the DB role cannot tamper with logs.

**Cons:** Requires managing two DB connection pools and a second PostgreSQL role in deployment.

**Context:** The immutability trigger is sufficient defense-in-depth for MVP. This hardens it for production compliance audits. Implementation: create a `ace_audit` role with `GRANT INSERT ON audit_log` only, initialize a second `pgxpool.Pool` with this role's credentials, pass it to the `audit` package.

**Effort:** S
**Priority:** P2
**Depends on:** Enterprise Auth Phase 1

### Trusted proxy model for IP logging

**What:** Configure a trusted proxy list so the audit log records real client IPs instead of ingress/load-balancer IPs or spoofed `X-Forwarded-For` headers.

**Why:** Without a trusted proxy model, the IP field in audit logs is unreliable. Behind a reverse proxy or load balancer, `r.RemoteAddr` is the proxy's IP, and `X-Forwarded-For` can be spoofed by untrusted clients. For compliance, the IP field needs to be trustworthy.

**Pros:** Audit log IP field becomes reliable for compliance and forensics.

**Cons:** Requires deployment-specific configuration (trusted proxy CIDR list).

**Context:** Standard Go pattern: accept a `TRUSTED_PROXIES` env var (comma-separated CIDRs). In the middleware, only read `X-Forwarded-For` if the request came from a trusted proxy. Otherwise use `r.RemoteAddr`. Libraries like `realip` exist but a simple implementation is ~20 lines.

**Effort:** S
**Priority:** P2
**Depends on:** Enterprise Auth Phase 1


## Dashboard

### Fix double-fetch on time range change in Panel.vue

**What:** Panel.vue has two watchers that both fire when the time range changes: the datasource watcher (line 360, watches `startRef`/`endRef`) and the time range watcher (line 442, watches `timeRange`). For datasource-based panels, both trigger `fetchDatasourceData()`, causing two identical API calls per time range change.

**Why:** Wastes bandwidth and backend resources. Every time range change (preset selection, custom range, brush-zoom, auto-refresh) fires two requests per datasource panel. With 10 panels on a dashboard, that's 20 requests instead of 10.

**Pros:** Reduces API calls by 50% for datasource panels. Simpler data flow.
**Cons:** Minimal risk. The fix is straightforward: consolidate the two watchers or add a debounce.

**Context:** The datasource watcher (line 360) watches `[datasourceId, queryExpr, ..., startRef, endRef]` and the time range watcher (line 442) watches `[timeRange, onRefresh]`. Since `startRef`/`endRef` are computed from `timeRange`, both fire simultaneously. Fix: remove `startRef`/`endRef` from the datasource watcher's dependencies and let the time range watcher handle all time-based refetches.

**Effort:** S
**Priority:** P2
**Depends on:** None

### Extend brush-to-zoom to registry-based time-axis panels

**What:** Add brush-to-zoom support to CandlestickPanel, StateTimelinePanel, StatusHistoryPanel, and HeatmapPanel — all ECharts panels with `type: 'time'` x-axis.

**Why:** Brush-to-zoom currently only works on LineChart and BarChart (the two built-in chart components). Registry-based panels use the same ECharts time axis but render via `panelRegistry.ts` with their own VChart instances. The `useBrushZoom` composable is designed for reuse, but each registry panel has a different template structure.

**Pros:** Consistent zoom behavior across all time-series panels.
**Cons:** Each registry panel needs individual wiring (different component structures). Some panels (HeatmapPanel, StatusHistoryPanel) use category/bucket x-axes that only loosely map to time.

**Context:** The `useBrushZoom` composable accepts a VChart ref and returns event handlers + overlay state. To adopt it, each registry panel needs: (1) expose a VChart ref, (2) add `@zr:mousedown` and `@zr:dblclick` event listeners, (3) add the overlay div, (4) emit `brush-zoom` and `reset-zoom` events. Panel.vue already wires these events for registry panels via `v-bind`/`v-on`, so the Panel.vue side may need no changes if registry panels emit the same events.

**Effort:** M
**Priority:** P3
**Depends on:** Brush-to-zoom on LineChart/BarChart

## Completed

### Extend chat-to-dashboard to Prometheus datasources

Renamed `getVictoriaMetricsTools()` to `getMetricsTools()`, removed datasource type gate, genericized tool descriptions. Both VictoriaMetrics and Prometheus datasources now get full tool support including dashboard generation.

**Completed:** v0.7.0 (2026-03-23)

### Update website with enterprise auth value prop

Added enterprise auth value prop section to the Ace website — RBAC, SSO, audit logging included free.

**Completed:** v0.12.0

### Copilot token caching

Implemented sync.Map-based token cache keyed by hashed GitHub token with TTL = expires_at minus 60s buffer. Eliminates redundant GitHub API round-trips for Copilot users.

**Completed:** v0.10.0

### Create DESIGN.md

Created the "Kinetic" design system — warm amber palette, Satoshi/DM Sans typography, restrained color philosophy. Documented in DESIGN.md at project root.
