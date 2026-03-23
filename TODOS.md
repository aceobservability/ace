# TODOS

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

### Pre-built dashboard templates

**What:** Ship 2-3 pre-built DashboardSpec templates (HTTP Overview, Node Exporter, Go Runtime) that the AI can reference or modify during generation.

**Why:** Turns one-shot generation into guided generation. Templates give the AI concrete examples to follow, improving spec quality. Also enables a "template gallery" UX where users browse common dashboards without needing to describe them.

**Context:** Templates could be JSON files in `frontend/src/utils/dashboardTemplates/` or embedded in the system prompt. The AI references them when the user's request matches a common pattern. Templates need maintenance as the DashboardSpec schema evolves.

**Effort:** S
**Priority:** P2
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

### Update website with enterprise auth value prop

**What:** Add a section to the Ace website (separate repo) highlighting enterprise auth included free — RBAC, SSO, audit logging, no paywall.

**Why:** The website is the front door for your target user. A principal platform engineer at a fintech googling "Grafana alternative RBAC" needs to land on a page that says "enterprise auth included free" within 5 seconds.

**Pros:** Captures interest from the exact target user. Low effort for high marketing impact.

**Cons:** Requires coordinating with the website repo. Content needs to match what's actually shipped.

**Context:** The website is in a separate repo in the aceobservability org. Update when Phase 1 ships (audit logging + Auditor role). Key messaging: "Enterprise auth without the enterprise paywall. RBAC, SSO, audit logging — all included in open-source Ace."

**Effort:** S
**Priority:** P1
**Depends on:** Enterprise Auth Phase 1

## Completed

### Extend chat-to-dashboard to Prometheus datasources

Renamed `getVictoriaMetricsTools()` to `getMetricsTools()`, removed datasource type gate, genericized tool descriptions. Both VictoriaMetrics and Prometheus datasources now get full tool support including dashboard generation.

**Completed:** v0.7.0 (2026-03-23)

### Create DESIGN.md

Created the "Kinetic" design system — warm amber palette, Satoshi/DM Sans typography, restrained color philosophy. Documented in DESIGN.md at project root.
