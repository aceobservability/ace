# TODOS

## Copilot

### Extend chat-to-dashboard to Prometheus datasources

**What:** Add tool definitions and system prompt for Prometheus datasource type so chat-to-dashboard works beyond VictoriaMetrics.

**Why:** Currently gated on `datasourceType === 'victoriametrics'` (CopilotPanel.vue:174). Prometheus users get streaming-only mode with no dashboard generation. The VictoriaMetrics tools (get_metrics, get_labels, get_label_values) use the same datasource API endpoints, so tool implementations may be reusable — the gate at line 174 just needs to accept both types.

**Context:** After chat-to-dashboard MVP ships, the simplest path is to rename `getVictoriaMetricsTools()` to `getMetricsTools()` and return it for both `victoriametrics` and `prometheus` datasource types. The system prompt in `github_copilot.go` already has a `"prometheus"` entry that needs the same dashboard generation instructions added to it.

**Effort:** S
**Priority:** P1
**Depends on:** Chat-to-dashboard MVP

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

## Design

### Create DESIGN.md

**What:** Document the app's design system — color tokens, spacing scale, typography, component patterns, icon library.

**Why:** The app has a consistent design language (semantic Tailwind tokens like `bg-surface-raised`, `text-text-primary`, `bg-accent`; Lucide icons; surface layering) but it's implicit in the code, not documented. New components risk visual drift without a reference. Run `/design-consultation` to generate it from the existing codebase patterns.

**Context:** Key tokens to document: `bg-surface-raised`, `bg-surface-overlay`, `bg-accent`, `text-text-primary`, `text-text-muted`, `text-text-secondary`, `border-border`, `text-accent`, `bg-accent-hover`. Error pattern: `text-rose-500 bg-rose-500/10`. Success pattern: `text-emerald-500` + Check icon. Primary buttons: `bg-accent text-white`. Surface z-order: raised > overlay > base.

**Effort:** S
**Priority:** P3
**Depends on:** None

## Completed
