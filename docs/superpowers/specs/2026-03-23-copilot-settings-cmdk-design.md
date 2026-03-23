# Copilot Device Flow in Settings + Cmd+K Integration

## Summary

Replace the admin-only GitHub OAuth App configuration form in Settings > AI Configuration with a per-user GitHub device flow connection panel. Integrate Copilot as an AI chat option within the existing Cmd+K modal, alongside dashboard search.

## Background

The Kinetic Observability Redesign (PR #125) deleted `CopilotPanel.vue` — the right-side chat sidebar that handled GitHub device flow authentication and AI-assisted query writing. The backend endpoints, composables, and supporting components still exist:

- `useCopilot` composable — device flow, connection check, chat (streaming + tool-calling)
- `getVictoriaMetricsTools()` — tool definitions for metric exploration and dashboard generation
- `useCopilotToolExecutor(datasourceId)` — executes tool calls (`get_metrics`, `get_labels`, `get_label_values`)
- `DashboardSpecPreview` component — renders a grid preview of a generated dashboard spec with save functionality
- All backend endpoints registered and functional

The device flow uses GitHub's hardcoded public Copilot client ID (`Iv1.b507a08c87ecfe98`), so no admin-configured OAuth credentials are needed. The current `GitHubAppSettings` admin form is unnecessary.

### Key implementation detail: `useCopilot` is not shared state

Each call to `useCopilot()` creates independent `ref()` instances. The Settings panel and Cmd+K modal would have separate state. To solve this, refactor `useCopilot` to use module-level refs (like `useCommandContext` already does) so connection status is shared across all consumers.

## Change 1: Settings > AI Configuration

### What changes

Replace `GitHubAppSettings.vue` with a new `CopilotConnectionPanel.vue` component. Delete `GitHubAppSettings`.

### Behavior

The panel is visible to **all users** (not admin-gated). It uses the `useCopilot` composable for all API calls.

**States:**

| State | UI |
|---|---|
| Loading | Spinner, "Checking connection..." |
| Not connected | Description text explaining Copilot. "Connect GitHub Copilot" button. |
| Device flow active | User code displayed large + copyable. "Open GitHub" button (opens `verificationUri` in new tab). Cancel button. Spinner indicating polling. |
| Connected + has Copilot | GitHub username shown. "Copilot Active" badge (primary color). Disconnect button. |
| Connected + no subscription | GitHub username shown. Warning text: "No active Copilot subscription detected." Disconnect button. |
| Error | Error message with retry option. |

**Lifecycle:**
1. `onMounted` calls `checkConnection()`
2. "Connect" button calls `connect(orgId)` which starts device flow and polls (note: `orgId` param is accepted but unused by the backend — device flow is per-user)
3. On success, shows connected state
4. "Disconnect" calls `disconnect()`

### Integration point

In `UnifiedSettingsView.vue`, replace:
```vue
<GitHubAppSettings v-if="orgId" :org-id="orgId" :is-admin="isAdmin ?? false" />
```
with:
```vue
<CopilotConnectionPanel v-if="orgId" :org-id="orgId" />
```

The `isAdmin` computed remains in `UnifiedSettingsView` (used by other sections) — only the prop on the AI section component is removed.

## Change 2: Cmd+K Modal

### What changes

Expand `CmdKModal.vue` from a stub input into a functional command palette with search and AI chat.

### Modes

**1. Search mode (default)**

When the user types, show filtered results:
- Dashboards from `listDashboards(orgId)` (requires `orgId` from `useOrganization().currentOrgId`), filtered client-side by title/description match
- Results shown as a scrollable list with keyboard navigation (arrow keys + Enter)
- Selecting a dashboard navigates to `/app/dashboards/{id}`
- If copilot is connected (checked via shared `useCopilot().isConnected`), show an "Ask Copilot: {query}" option at the bottom of results

**2. AI chat mode**

Activated when:
- User selects the "Ask Copilot" option from search results
- Query is clearly a question (heuristic: starts with question word or ends with `?`)

UI within the modal:
- Chat message list (user + assistant messages) with markdown rendering (use existing `renderMarkdown` from `utils/markdown`)
- Input textarea at bottom for follow-up messages
- "Back to search" button to return to search mode, clearing chat history
- Model selector (optional — call `fetchModels()` on chat mode entry, render dropdown from `models` ref)

**Chat uses `sendChatRequest()` with tool-calling loop:**

The modal implements a multi-turn tool execution loop:
1. Call `sendChatRequest(datasourceType, datasourceName, messages, tools)` with tools from `getVictoriaMetricsTools()`
2. Check returned `toolCalls` array
3. For each tool call:
   - If `generate_dashboard`: parse `function.arguments` as JSON, validate as `DashboardSpec` via `validateDashboardSpec()`, inject `datasource_id` into all panels, render `DashboardSpecPreview` inline. Exit loop.
   - Otherwise: call `useCopilotToolExecutor(datasourceId).executeTool(toolCall)`, append result as `{ role: 'tool', tool_call_id, content }` message
4. Call `sendChatRequest()` again with updated message history
5. Repeat until no tool calls remain or `generate_dashboard` is hit (max 10 iterations)

Show tool call status inline (tool name + running/complete/error indicator) — this is new UI, not from existing code.

**3. Not connected state**

If copilot is not connected and user tries to activate AI chat:
- Show inline message: "Connect your GitHub Copilot subscription in Settings to use AI features"
- Link to `/app/settings/ai`

### Data flow

```
User types in Cmd+K
  |
  +--> Filter dashboards (client-side, from listDashboards(orgId))
  |
  +--> Show "Ask Copilot: {query}" option (if isConnected)
         |
         +--> User selects --> Enter chat mode
               |
               +--> sendChatRequest() with tools from getVictoriaMetricsTools()
               |     |
               |     +--> Returns { content, toolCalls }
               |
               +--> Tool call loop:
               |     - get_metrics/get_labels/get_label_values: executeTool() -> append result -> repeat
               |     - generate_dashboard: parse spec -> DashboardSpecPreview -> stop loop
               |
               +--> Display assistant content with renderMarkdown()
```

### Context awareness

The existing `useCommandContext` composable provides view context (current dashboard, datasource). Pass this as the context pill (already rendered) and include datasource info in the chat request so the AI knows what the user is looking at.

### Chat history lifecycle

Chat history is cleared when:
- User clicks "Back to search"
- Modal is closed (Escape or scrim click)

Chat history persists within an open chat session (supports multi-turn).

## Accepted Expansions (from SELECTIVE EXPANSION review)

- Model selector dropdown in Cmd+K chat mode (from `useCopilot.models`)
- Extend tool support to Prometheus datasources (rename `getVictoriaMetricsTools` → `getMetricsTools`, accept both types)
- Persist chat history across modal opens (module-level refs for messages)

## Files to change

### Create

| File | Purpose |
|---|---|
| `frontend/src/components/CopilotConnectionPanel.vue` | Device flow connect/disconnect UI for settings |
| `frontend/src/components/CopilotConnectionPanel.spec.ts` | Tests for connection panel |
| `frontend/src/components/CmdKSearchResults.vue` | Dashboard search results with keyboard navigation |
| `frontend/src/components/CmdKSearchResults.spec.ts` | Tests for search results |
| `frontend/src/components/CmdKChatView.vue` | AI chat with tool calling loop + DashboardSpecPreview |
| `frontend/src/components/CmdKChatView.spec.ts` | Tests for chat view |

### Modify

| File | Change |
|---|---|
| `frontend/src/composables/useCopilot.ts` | Refactor to shared module-level refs so connection state is shared across consumers |
| `frontend/src/composables/useCopilotTools.ts` | Rename `getVictoriaMetricsTools` → `getMetricsTools`, accept prometheus type |
| `frontend/src/composables/useCopilotTools.spec.ts` | Update tests for renamed function |
| `frontend/src/views/UnifiedSettingsView.vue` | Swap `GitHubAppSettings` import/usage for `CopilotConnectionPanel`, remove `isAdmin` prop on AI section |
| `frontend/src/components/CmdKModal.vue` | Orchestrate mode switching between search and chat subcomponents |
| `frontend/src/components/CmdKModal.spec.ts` | Extend existing tests with mode switching, not-connected state |

### Delete

| File | Reason |
|---|---|
| `frontend/src/components/GitHubAppSettings.vue` | Replaced by CopilotConnectionPanel; admin OAuth config no longer needed |

## No backend changes

All backend endpoints exist and work:
- `POST /api/auth/github/device` — start device flow
- `POST /api/auth/github/device/poll` — poll for completion
- `GET /api/auth/github/connection` — check connection status
- `DELETE /api/auth/github/connection` — disconnect
- `GET /api/copilot/models` — list models
- `POST /api/copilot/chat` — JSON response with tool calls, or SSE streaming without tools

## Testing

- **CopilotConnectionPanel**: test all states (loading, not connected, device flow active, connected with/without subscription, error), connect/disconnect actions
- **CmdKModal**: test search filtering, keyboard navigation, AI chat mode activation, not-connected state, tool call loop, DashboardSpecPreview rendering on `generate_dashboard`
- **useCopilot refactor**: verify shared state works — connection in one consumer reflects in another

<!-- /autoplan restore point: /home/janhoon/.gstack/projects/aceobservability-ace/master-autoplan-restore-20260323-210434.md -->

<!-- AUTONOMOUS DECISION LOG -->
## Decision Audit Trail

| # | Phase | Decision | Principle | Rationale | Rejected |
|---|-------|----------|-----------|-----------|----------|
| 1 | CEO-0F | Mode: SELECTIVE EXPANSION | P3 (pragmatic) | Feature enhancement on existing system, not greenfield | EXPANSION, HOLD, REDUCTION |
| 2 | CEO-0C-bis | Approach C: Split CmdKModal into subcomponents | P5 (explicit), P1 (complete) | Better testability, same scope as A but cleaner structure | A (monolithic modal), B (restore sidebar) |
| 3 | CEO-cherry | Add model selector to Cmd+K | P2 (boil lakes) | In blast radius, 10 lines of UI, <1h CC effort | Skip |
| 4 | CEO-cherry | Extend tools to Prometheus datasources | P2 (boil lakes) | In blast radius (same composable), S effort, P1 in TODOS | Skip, Defer |
| 5 | CEO-cherry | Persist chat history across modal opens | P1 (completeness) | Module-level refs, better UX for accidental Escape | Skip |
| 6 | CEO-cherry | Defer template gallery | P3 (pragmatic) | Outside blast radius, new UI surface | Add now |
| 7 | CEO-cherry | Defer iterative spec refinement | P3 (pragmatic) | Significant complexity, outside blast radius | Add now |
| 8 | CEO-S2 | Add error handling for JSON parse in generate_dashboard | P1 (completeness) | Parse can throw on malformed LLM output | Skip |
| 9 | CEO-S2 | Add error handling for listDashboards failure | P1 (completeness) | Network errors should show empty, not crash | Skip |
| 10 | CEO-S4 | Add empty state for search results | P1 (completeness) | "No results" is a real state users will hit | Skip |
| 11 | CEO-S4 | Disable input during streaming | P1 (completeness) | Prevents double-send during active response | Skip |
| 12 | Design | All 7 dimensions pass | P1 (completeness) | States, flows, DESIGN.md alignment all covered | N/A |
| 13 | Design | Add focus trap in chat mode | P1 (completeness) | Tab should cycle within modal, not escape | Skip |
| 14 | Design | Defer mobile Cmd+K | P3 (pragmatic) | Cmd+K is keyboard-triggered, desktop-focused | Add now |
| 15 | Design | Add mode transition animation | P5 (explicit) | Crossfade between search/chat, 3 lines CSS | Skip |
| 16 | Eng-0 | Accept 9-file scope (subcomponents) | P5 (explicit) | Slightly over 8-file threshold but justified by testability | Reduce scope |
| 17 | Eng-S3 | 25 test gaps identified — all new code | P1 (completeness) | No regressions, all gaps from new components | Defer tests |
| 18 | Eng-FM | Fix 2 critical gaps (JSON parse + listDashboards error) | P1 (completeness) | Silent failures prevented | Ignore |

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR | 5 proposals, 3 accepted, 2 deferred |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | -- | -- |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 2 issues (critical gaps), 0 unresolved |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR | score: 8/10, 3 decisions |

- **UNRESOLVED:** 0
- **VERDICT:** CEO + ENG + DESIGN CLEARED -- ready to implement
