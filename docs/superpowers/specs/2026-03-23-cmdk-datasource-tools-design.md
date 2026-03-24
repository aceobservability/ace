# Cmd+K Chat: Fix Datasource Tools & Add Full Metrics/Logs/Traces Tool Support

**Date:** 2026-03-23 (updated 2026-03-24 after eng review)
**Status:** Approved

## Problem

The Cmd+K chat panel fails to run tools (`get_metrics`, `get_labels`, `get_label_values`) with `{"error":"invalid datasource id"}`. Root causes:

1. **No view passes `datasourceId` in command context.** Every `registerContext()` call only sets `viewName`, `viewRoute`, and `description`. `CmdKModal.vue` falls back to `''`, which the backend rejects as an invalid UUID.
2. **No tool exists for datasource discovery.** When no context is available, the AI model has no way to find out which datasources exist.
3. **Tools are metrics-only.** `getMetricsTools()` is always used regardless of datasource type. Logs and traces datasources get metrics tools that don't work for them.
4. **Backend system prompt mismatch.** CmdKModal defaults to `datasourceType: 'victoriametrics'` when no context exists, causing the backend to inject a metrics-specific system prompt even when no datasource is selected.

## Solution

### A. Context Propagation (All Explore tabs to CmdK)

**Files changed:** `UnifiedExploreView.vue`, `MetricsExploreTab.vue`, `LogsExploreTab.vue`, `TracesExploreTab.vue`

- All three Explore tabs emit a `datasource-changed` event with `{ id, name, type }` on both auto-select (mount) and user selection.
- `UnifiedExploreView` listens to the event and calls `registerContext()` with `datasourceId`, `datasourceName`, and `datasourceType` included.
- Other views (Home, Settings, Alerts, Services, DashboardGen, DashboardDetail) remain unchanged — no datasource in context.

### B. `list_datasources` Tool

**Files changed:** `useCopilotTools.ts`, `CmdKChatView.vue`

New tool definition:
- **Name:** `list_datasources`
- **Description:** List all datasources available in the current organization. Use this to discover datasource IDs before querying metrics or labels.
- **Parameters:** none
- **Returns:** JSON array of `{ id, name, type }` objects

Executor changes:
- `useCopilotToolExecutor` signature changes from `(datasourceId: () => string)` to `(datasourceId: () => string, orgId: () => string)`.
- `CmdKChatView` passes `orgId` from `useOrganization().currentOrg.value?.id`.
- The `list_datasources` case calls `listDataSources(orgId)` from `api/datasources.ts` (already exists).

### C. Datasource ID Override in Discovery Tools

**Files changed:** `useCopilotTools.ts`

- `get_metrics`, `get_labels`, and `get_label_values` each gain an optional `datasource_id` string parameter: "Override the default datasource. Use an ID from list_datasources."
- Extract a `resolveDatasourceId(args, defaultId)` helper for DRY across the switch cases.
- This allows the model to select a datasource via `list_datasources` and pass it explicitly to subsequent tools.
- **Empty dsId guard:** If no context + no override, return helpful error instead of hitting backend.

### D. Frontend System Message for Tool Guidance

**Files changed:** `CmdKChatView.vue`

`buildChatRequestMessages()` prepends a system message before the conversation history:

- **With context:** "You have tools to explore datasource data. You are currently working with datasource '{datasourceName}' (type: {datasourceType}, id: {datasourceId}). You can use the data discovery tools directly."
- **Without context (empty datasourceId):** "You have tools to explore datasource data. No datasource is currently selected. Call list_datasources first to discover available datasources, then pass the datasource_id to other tools."

### E. Fix CmdKModal No-Context Defaults

**Files changed:** `CmdKModal.vue`

When no context exists, pass `datasourceType: ''` and `datasourceName: ''` instead of `'victoriametrics'`/`'default'`. This causes the backend to use the neutral `defaultSystemPrompt` instead of the metrics-specific one.

### F. Type-Aware Tool Sets

**Files changed:** `useCopilotTools.ts`, `CmdKChatView.vue`

Instead of always using `getMetricsTools()`, provide datasource-type-aware tool sets:

- **Metrics** (victoriametrics, prometheus): `get_metrics`, `get_labels`, `get_label_values`, `write_query`, `run_query`, `generate_dashboard`
- **Logs** (loki, victorialogs): `get_labels`, `get_label_values`, `write_query`, `run_query` (no `get_metrics` — logs don't have metric names)
- **Traces** (tempo, jaeger): `get_trace_services`, `get_labels`, `get_label_values`, `write_query`, `run_query` (trace service discovery tool)
- **No context**: All tools from all types + `list_datasources` (model picks appropriate ones after discovering datasource type)

New tool: `get_trace_services` — calls `fetchDataSourceTraceServices(dsId)` from `api/datasources.ts` (already exists).

### G. Type-Aware Query Navigation

**Files changed:** `useCopilotTools.ts`

`write_query` currently hardcodes navigation to `/app/explore/metrics`. Change to:
- If datasource type is logs (loki, victorialogs): navigate to `/app/explore/logs`
- If datasource type is traces: navigate to `/app/explore/traces`
- Default (metrics or unknown): navigate to `/app/explore/metrics`

The executor needs access to the datasource type — either from context or from the tool args.

### H. Fix generate_dashboard for Discovered Datasources

**Files changed:** `CmdKChatView.vue`

Currently `generate_dashboard` stamps `props.datasourceId` onto every panel (line 89). When the model discovers a datasource via `list_datasources`, this prop is empty.

Fix: Track the last `datasource_id` used in tool calls during the conversation. Use it for `generate_dashboard` panels when `props.datasourceId` is empty.

### I. Update Backend System Prompts

**Files changed:** `backend/internal/handlers/github_copilot.go`

Update system prompts for each datasource type to mention available tools:
- **loki/victorialogs:** Mention `get_labels`, `get_label_values`, `write_query`, `run_query`
- **prometheus:** Mention `get_metrics`, `get_labels`, `get_label_values`, `write_query`, `run_query`, `generate_dashboard`
- **victoriametrics:** Already mentions tools (keep as-is)

## Edge Cases & Error Handling

- **Empty `orgId`:** If `useOrganization().currentOrg.value?.id` is undefined when `list_datasources` is called (org not yet loaded), the executor returns `"Error: no organization selected"` without making an API call.
- **`list_datasources` API failure:** If `listDataSources(orgId)` throws, the existing `executeTool` catch handler in `CmdKChatView.vue` (line 109) catches it and returns `"Error: {message}"` to the model, which can relay the error to the user.
- **Empty `datasourceId` with no override:** If the context datasource is empty and the model calls discovery tools without passing `datasource_id`, the executor returns `"Error: no datasource selected. Call list_datasources first to get a datasource ID."` instead of hitting the backend with an invalid UUID.
- **Initial-turn race:** If Cmd+K opens before Explore tab auto-selects a datasource, the no-context fallback (`list_datasources`) handles it transparently.
- **Wrong tool for datasource type:** Type-aware tool sets (section F) prevent the model from being offered `get_metrics` for a logs datasource.

## Scope Boundaries

- Backend change is minimal: only system prompt text updates in `github_copilot.go`.
- No new API endpoints — all required endpoints already exist.
- All three Explore tabs wire up context propagation.
- `generate_dashboard` works from both context and discovered datasources.

## Data Flow

```
User opens Cmd+K on Explore (Metrics tab)
  -> MetricsExploreTab emits datasource-changed({ id, name, type })
  -> UnifiedExploreView calls registerContext({ ..., datasourceId, datasourceName, datasourceType })
  -> CmdKModal reads currentContext.datasourceId, datasourceType
  -> CmdKChatView receives props, selects metrics tool set
  -> Frontend prepends system message: "Working with datasource X (victoriametrics)..."
  -> Backend uses victoriametrics system prompt (mentions tools)
  -> Model calls get_metrics → executeTool uses props.datasourceId → backend returns metrics

User opens Cmd+K on Explore (Logs tab)
  -> LogsExploreTab emits datasource-changed({ id, name, type: 'loki' })
  -> CmdKChatView receives props, selects logs tool set (no get_metrics)
  -> Model calls get_labels → works against Loki

User opens Cmd+K on Home (no datasource context)
  -> CmdKModal passes datasourceType: '', datasourceName: ''
  -> Backend uses neutral defaultSystemPrompt
  -> Frontend prepends: "No datasource selected, call list_datasources..."
  -> CmdKChatView provides all tools (metrics + logs + traces + list_datasources)
  -> Model calls list_datasources → returns [{ id, name, type }, ...]
  -> Model calls get_metrics({ datasource_id: "<chosen-id>" }) → works
  -> Model calls generate_dashboard → uses tracked datasource_id from prior tool calls
```

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | issues_found | 7 findings, all addressed |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 2 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |

**CODEX:** Found 7 issues — generate_dashboard ID gap, backend prompt mismatch, metrics-only tools, traces exclusion, initial-turn race, overbuilt concern, test confidence. All resolved: scope expanded to logs+traces, backend prompts included, integration tests added.
**VERDICT:** ENG CLEARED — ready to implement.

## Test Requirements

### Unit Tests (16 paths)

**useCopilotTools.spec.ts:**
1. `list_datasources` tool definition exists with correct schema
2. `get_metrics`, `get_labels`, `get_label_values` each have optional `datasource_id` param
3. `get_trace_services` tool definition exists
4. `resolveDatasourceId` helper: returns override when provided
5. `resolveDatasourceId` helper: returns default when no override
6. `resolveDatasourceId` helper: returns error when both empty
7. `list_datasources` executor: happy path returns JSON
8. `list_datasources` executor: empty orgId returns error string
9. `get_metrics` executor: uses override datasource_id
10. `get_metrics` executor: falls back to context datasource_id
11. `get_trace_services` executor: happy path returns services

**CmdKChatView.spec.ts:**
12. `buildChatRequestMessages` with context: prepends system message with datasource info
13. `buildChatRequestMessages` without context: prepends system message instructing list_datasources
14. Metrics context → metrics tool set provided
15. Logs context → logs tool set provided (no get_metrics)
16. No context → all tools provided

### Integration Tests (3 paths)

**CmdKChatView.integration.spec.ts** (real executor, mocked HTTP):
17. Metrics context → get_metrics tool call → successful API response
18. Logs context → get_labels tool call → successful API response
19. No context → list_datasources → datasource_id override → get_metrics succeeds
