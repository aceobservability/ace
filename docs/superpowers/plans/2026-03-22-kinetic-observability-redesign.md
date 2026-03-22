# Kinetic Observability Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the entire Ace frontend with a dark-only, high-density "flight deck" aesthetic — 8 views, Cmd+K AI modal, collapsible sidebar, Stitch design system, keyboard shortcuts, and inline AI surfaces.

**Architecture:** Big bang replacement of all frontend views and components. Backend API layer, composables (useAuth, useProm, useTimeRange, etc.), type definitions, and chart/grid/editor libraries are preserved and rethemed. New composables (useSidebar, useCommandContext, useKeyboardShortcuts) provide shared state. Cmd+K modal replaces CopilotPanel as the global AI interface.

**Tech Stack:** Vue 3.5 + Tailwind CSS 4.2 + ECharts 6 + Monaco Editor + vue3-grid-layout-next + Lucide Vue Next + Vitest + Vue Test Utils

**Spec:** `docs/superpowers/specs/2026-03-21-kinetic-observability-redesign-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|---|---|
| `src/composables/useSidebar.ts` | Sidebar open/close state, Cmd+B toggle, localStorage persistence |
| `src/composables/useCommandContext.ts` | Per-view AI context registration for Cmd+K |
| `src/composables/useKeyboardShortcuts.ts` | Global shortcut registry, Cmd+/ help overlay |
| `src/composables/useFavorites.ts` | Dashboard favorites + recents, localStorage |
| `src/components/AppSidebar.vue` | New 240px/0px collapsible sidebar |
| `src/components/CmdKModal.vue` | Cmd+K AI command + fuzzy search modal |
| `src/components/EmptyState.vue` | Reusable empty state (icon, title, desc, action) |
| `src/components/AiInsightCard.vue` | Glassmorphic AI insight card |
| `src/components/OnboardingBanner.vue` | 3-step onboarding checklist |
| `src/components/ShimmerLoader.vue` | Skeleton loading component |
| `src/components/StatusDot.vue` | 4px colored status dot |
| `src/components/ToastNotification.vue` | Top-right toast notifications |
| `src/components/ShortcutsOverlay.vue` | Cmd+/ keyboard shortcuts help |
| `src/components/RefreshIndicator.vue` | Auto-refresh toggle + freshness display |
| `src/views/HomeView.vue` | Home / Command Center landing page |
| `src/views/ServicesView.vue` | Services overview (scaffolded with mock data) |
| `src/views/DashboardGenView.vue` | AI dashboard generation flow |
| `src/views/UnifiedExploreView.vue` | Unified explore with tabs (metrics/logs/traces) |
| `src/views/MetricsExploreTab.vue` | Metrics tab content extracted from Explore.vue |
| `src/views/LogsExploreTab.vue` | Logs tab content extracted from ExploreLogs.vue |
| `src/views/TracesExploreTab.vue` | Traces tab content extracted from ExploreTraces.vue |
| `src/views/UnifiedSettingsView.vue` | Unified settings with vertical tabs |

### Modified Files

| File | Changes |
|---|---|
| `src/style.css` | Replace all tokens with Stitch design system, remove light mode, new fonts |
| `src/main.ts` | Update theme initialization for dark-only |
| `src/App.vue` | New shell: AppSidebar + CmdKModal + ToastNotification, remove CopilotPanel |
| `src/router/index.ts` | New routes (home, services, unified explore/settings, dashboard gen), redirects |
| `src/composables/useTheme.ts` | Simplify to dark-only (remove cycle, light mode) |
| `src/views/DashboardsView.vue` | Rewrite as card grid explorer with favorites |
| `src/views/DashboardDetailView.vue` | Retheme, add AI badges, refresh indicator |
| `src/views/AlertsView.vue` | Retheme as dense table with expandable rows, AI root cause cards |
| `src/views/LoginView.vue` | Retheme with new tokens |
| `src/views/DashboardSettingsView.vue` | Retheme with underline tabs, tonal forms |
| `src/components/Panel.vue` | Retheme, add anomaly badge slot |
| `src/components/TimeRangePicker.vue` | Retheme, add auto-refresh dropdown |
| `src/components/DashboardList.vue` | Rewrite as card grid with sparklines and favorites |
| `src/components/PanelEditModal.vue` | Retheme with glassmorphic modal treatment |

### Deleted Files

| File | Reason |
|---|---|
| `src/components/Sidebar.vue` | Replaced by AppSidebar.vue |
| `src/components/CopilotPanel.vue` | Replaced by CmdKModal.vue |
| `src/views/Explore.vue` | Extracted to MetricsExploreTab.vue, then deleted |
| `src/views/ExploreLogs.vue` | Extracted to LogsExploreTab.vue, then deleted |
| `src/views/ExploreTraces.vue` | Extracted to TracesExploreTab.vue, then deleted |
| `src/views/DataSourceSettings.vue` | Absorbed into UnifiedSettingsView.vue |
| `src/views/OrgBrandingSettings.vue` | Absorbed into UnifiedSettingsView.vue |
| `src/views/PrivacySettingsView.vue` | Absorbed into UnifiedSettingsView.vue |
| `src/views/UserSettingsView.vue` | Absorbed into UnifiedSettingsView.vue |
| `src/views/OrganizationSettings.vue` | Replaced by UnifiedSettingsView.vue |

### Preserved (rethemed only)

All files in: `src/api/`, `src/types/`, `src/promql/`, `src/logquery/`, `src/monaco/`, `src/analytics/`, `src/plugins/`, `src/utils/`, and composables (useAuth, useOrganization, useProm, useTimeRange, useQueryBuilder, useDatasource, useAlertManager, useVMAlert, useAnalytics, useOrgBranding, useQueryEditor, useCopilot, useCopilotTools).

---

## Tasks

### Task 1: Design System Foundation — style.css

**Files:**
- Modify: `frontend/src/style.css`
- Modify: `frontend/src/main.ts`
- Modify: `frontend/src/composables/useTheme.ts`

- [ ] **Step 1: Replace style.css with new design tokens**

Replace the entire `style.css` with:
- Remove Plus Jakarta Sans, add Space Grotesk (600-700) + Inter (400-500) + JetBrains Mono (400-600) from Google Fonts
- Remove `:root` light mode tokens entirely
- Replace `.dark` tokens with the Stitch surface hierarchy (`surface` #0d0e10, `surface-container-low` #121316, `surface-container-high` #1e2022, `surface-bright` #2b2c2f)
- Add all color tokens: `primary` #a3a6ff, `primary-dim` #6063ee, `secondary` #69f6b8, `secondary-dim` #58e7ab, `tertiary` #ffb148, `tertiary-dim` #e79400, `error` #ff6e84
- Add text tokens: `on-surface` #fdfbfe, `on-surface-variant` #ababad, `outline` #757578, `outline-variant` #47484a
- Update `@theme` block to export new tokens to Tailwind
- Remove `.dark` class toggling — tokens are root-level only
- Update base styles: body bg to `surface`, text to `on-surface`, font-family to Inter
- Update heading styles to Space Grotesk with -0.02em tracking
- Update scrollbar styles to match new surface tiers
- Keep animation keyframes (fadeIn, slideUp, spin, pulse-glow)
- Add shimmer animation for loading states
- Remove copilot prose overrides (will be in CmdKModal)

- [ ] **Step 2: Simplify useTheme.ts to dark-only**

Replace `useTheme.ts` (52 lines) with a minimal version:
- Remove `ThemeMode` type, `cycle()`, light mode logic
- Keep `isDark` as a constant `ref(true)`
- Keep `setMode()` as a no-op for backward compatibility
- Remove `matchMedia` listener
- Ensure `document.documentElement` always has `dark` class

- [ ] **Step 3: Update main.ts**

No structural changes needed — theme import order stays the same. The import of `useTheme` still initializes before CSS.

- [ ] **Step 4: Run existing tests to see what breaks**

Run: `cd frontend && pnpm test`

Expected: Many test failures due to CSS class changes. Note which tests fail — they'll be updated in later tasks.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/style.css frontend/src/composables/useTheme.ts frontend/src/main.ts
git commit -m "feat: replace design system with Stitch Kinetic tokens — dark-only, Space Grotesk + Inter + JetBrains Mono, indigo primary"
```

---

### Task 2: New Composables — useSidebar, useCommandContext, useKeyboardShortcuts, useFavorites

**Files:**
- Create: `frontend/src/composables/useSidebar.ts`
- Create: `frontend/src/composables/useCommandContext.ts`
- Create: `frontend/src/composables/useKeyboardShortcuts.ts`
- Create: `frontend/src/composables/useFavorites.ts`
- Test: `frontend/src/composables/useSidebar.spec.ts`
- Test: `frontend/src/composables/useCommandContext.spec.ts`
- Test: `frontend/src/composables/useKeyboardShortcuts.spec.ts`
- Test: `frontend/src/composables/useFavorites.spec.ts`

- [ ] **Step 1: Write tests for useSidebar**

Test: `isOpen` defaults to true on wide screens, `toggle()` flips state, state persists to localStorage key `ace-sidebar-open`, `Cmd+B` event triggers toggle.

- [ ] **Step 2: Implement useSidebar**

Composable exports: `isOpen: Ref<boolean>`, `toggle(): void`, `open(): void`, `close(): void`. Reads/writes `localStorage['ace-sidebar-open']`. Default: open on viewports >= 1440px, closed on < 1440px. Listens for `Cmd+B` / `Ctrl+B` keydown.

- [ ] **Step 3: Write tests for useCommandContext**

Test: `registerContext()` sets current context, `deregisterContext()` clears it, `currentContext` is reactive.

- [ ] **Step 4: Implement useCommandContext**

Composable exports: `currentContext: Ref<CommandContext | null>`, `registerContext(ctx: CommandContext): void`, `deregisterContext(): void`. `CommandContext` interface: `{ viewName: string, viewRoute: string, description: string, datasourceId?: string, dashboardId?: string }`.

- [ ] **Step 5: Write tests for useKeyboardShortcuts**

Test: registering a shortcut fires its callback on keydown, `Cmd+/` toggles `showHelp`, shortcuts are deregistered on cleanup.

- [ ] **Step 6: Implement useKeyboardShortcuts**

Composable exports: `register(shortcut: string, callback: () => void): () => void` (returns unregister fn), `showHelp: Ref<boolean>`, `shortcuts: Ref<ShortcutEntry[]>`. `ShortcutEntry`: `{ keys: string, label: string, category: string }`. Handles `Cmd` on Mac, `Ctrl` on Windows/Linux. Pre-registers `Cmd+/` for help overlay.

- [ ] **Step 7: Write tests for useFavorites**

Test: `toggleFavorite(id)` adds/removes from favorites, `isFavorite(id)` returns boolean, `recentDashboards` tracks last 10 visited, persists to localStorage.

- [ ] **Step 8: Implement useFavorites**

Composable exports: `favorites: Ref<string[]>`, `recentDashboards: Ref<RecentDashboard[]>`, `toggleFavorite(id: string): void`, `isFavorite(id: string): boolean`, `addRecent(dashboard: RecentDashboard): void`. `RecentDashboard`: `{ id: string, title: string, visitedAt: number }`. localStorage keys: `ace-favorites`, `ace-recents`.

- [ ] **Step 9: Run all composable tests**

Run: `cd frontend && pnpm test -- composables/`
Expected: All 4 new composable test files pass.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/composables/useSidebar.ts frontend/src/composables/useCommandContext.ts frontend/src/composables/useKeyboardShortcuts.ts frontend/src/composables/useFavorites.ts frontend/src/composables/useSidebar.spec.ts frontend/src/composables/useCommandContext.spec.ts frontend/src/composables/useKeyboardShortcuts.spec.ts frontend/src/composables/useFavorites.spec.ts
git commit -m "feat: add useSidebar, useCommandContext, useKeyboardShortcuts, useFavorites composables"
```

---

### Task 3: Reusable UI Components — EmptyState, StatusDot, ShimmerLoader, ToastNotification, AiInsightCard

**Files:**
- Create: `frontend/src/components/EmptyState.vue`
- Create: `frontend/src/components/StatusDot.vue`
- Create: `frontend/src/components/ShimmerLoader.vue`
- Create: `frontend/src/components/ToastNotification.vue`
- Create: `frontend/src/components/AiInsightCard.vue`
- Create: `frontend/src/components/RefreshIndicator.vue`
- Test: `frontend/src/components/EmptyState.spec.ts`
- Test: `frontend/src/components/StatusDot.spec.ts`
- Test: `frontend/src/components/AiInsightCard.spec.ts`
- Test: `frontend/src/components/RefreshIndicator.spec.ts`

- [ ] **Step 1: Write EmptyState test**

Test: renders icon, title, description, action button when provided. Emits action event on button click. Renders without action button when `actionLabel` not provided.

- [ ] **Step 2: Implement EmptyState**

Props: `icon: Component`, `title: string`, `description: string`, `actionLabel?: string`, `actionRoute?: string`, `secondaryActionLabel?: string`, `secondaryActionRoute?: string`. Uses `surface-container-low` card, centered content, icon in `outline` color, Space Grotesk title, Inter description, primary gradient button.

- [ ] **Step 3: Implement StatusDot**

Props: `status: 'healthy' | 'warning' | 'critical' | 'info'`, `pulse?: boolean`. Renders a 4px rounded dot: healthy = `secondary`, warning = `tertiary`, critical = `error`, info = `primary`. `pulse` adds slow animation for firing alerts.

- [ ] **Step 4: Implement ShimmerLoader**

Props: `width?: string`, `height?: string`, `rounded?: string`. Renders a `surface-container-low` block that pulses between `surface-container-low` and `surface-container-high`. Uses CSS animation.

- [ ] **Step 5: Implement ToastNotification**

Uses a global reactive array. Exports `useToast()`: `{ show(message, type): void, toasts: Ref<Toast[]> }`. Toast types: `success`, `error`, `info`. Renders top-right stack, auto-dismiss after 5s. `surface-bright` bg, colored left border by type.

- [ ] **Step 6: Write AiInsightCard test**

Test: renders with title, description, timestamp. Has glassmorphic styling (backdrop-blur class). Shows AI icon.

- [ ] **Step 7: Implement AiInsightCard**

Props: `title: string`, `description: string`, `timestamp: string`. Glassmorphic card: `surface-container-highest` at 80% opacity + `backdrop-blur(20px)`. Subtle `primary` glow at top. AI gradient icon. `primary` at 5% opacity background tint.

- [ ] **Step 8: Write RefreshIndicator test**

Test: shows "Last refreshed Xs ago", auto-refresh toggle changes interval, stale warning appears when data is old.

- [ ] **Step 9: Implement RefreshIndicator**

Props: `lastRefreshed: Date`, `autoRefreshInterval: number`, `onIntervalChange: (ms: number) => void`. Shows dropdown (15s/30s/1m/5m/Off), "Last refreshed" text updating every second, green pulsing dot when active, gray when paused, amber "Data may be stale" when > 2x interval.

- [ ] **Step 10: Run tests**

Run: `cd frontend && pnpm test -- components/EmptyState components/StatusDot components/AiInsightCard components/RefreshIndicator`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add frontend/src/components/EmptyState.vue frontend/src/components/StatusDot.vue frontend/src/components/ShimmerLoader.vue frontend/src/components/ToastNotification.vue frontend/src/components/AiInsightCard.vue frontend/src/components/RefreshIndicator.vue frontend/src/components/EmptyState.spec.ts frontend/src/components/StatusDot.spec.ts frontend/src/components/AiInsightCard.spec.ts frontend/src/components/RefreshIndicator.spec.ts
git commit -m "feat: add reusable UI components — EmptyState, StatusDot, ShimmerLoader, Toast, AiInsightCard, RefreshIndicator"
```

---

### Task 4: App Shell — AppSidebar + CmdKModal + ShortcutsOverlay

**Files:**
- Create: `frontend/src/components/AppSidebar.vue`
- Create: `frontend/src/components/CmdKModal.vue`
- Create: `frontend/src/components/OnboardingBanner.vue`
- Create: `frontend/src/components/ShortcutsOverlay.vue`
- Modify: `frontend/src/App.vue`
- Delete: `frontend/src/components/Sidebar.vue`
- Delete: `frontend/src/components/CopilotPanel.vue`
- Test: `frontend/src/components/AppSidebar.spec.ts` (new)
- Test: `frontend/src/components/CmdKModal.spec.ts` (new)

- [ ] **Step 1: Write AppSidebar test**

Test: renders nav items (Home, Dashboards, Services, Alerts, Explore with children, Settings), active item highlighted, `useSidebar().toggle()` collapses it, `aria-label="Main navigation"` present.

- [ ] **Step 2: Implement AppSidebar**

240px wide, `surface-container-low` bg, 200ms slide transition. Nav items: Home (Sparkles), Dashboards (LayoutGrid), Services (Activity), Alerts (AlertTriangle), Explore (Search) with Metrics/Logs/Traces children, tonal divider, Settings (Settings), user avatar at bottom. Active item: `surface-container-high` bg + `primary` text. Colored nav icons per spec (dashboards=indigo, services=emerald, alerts=coral, explore=amber). Uses `useSidebar()` for state. `<nav aria-label="Main navigation">`.

- [ ] **Step 3: Write CmdKModal test**

Test: opens on Cmd+K, closes on Escape, focus trapped inside, shows context pill, input accepts text, `aria-modal="true"` and `role="dialog"` present. Test dual mode: typing a dashboard name shows search results, typing a question shows AI mode.

- [ ] **Step 4: Implement CmdKModal**

`<dialog>` element, 640px wide, glassmorphic (`surface-container-highest` 80% + `backdrop-blur(20px)`), primary glow top border. Input at top (16px Inter), context pill from `useCommandContext()`. Dual mode: fuzzy search (matching dashboards/alerts/data sources by name) vs AI chat (delegates to `useCopilot()`). Scrim: `surface` at 60% opacity. Focus trap on open, restore on close. `aria-label="AI Command"`.

- [ ] **Step 5: Implement OnboardingBanner**

3-step checklist: "Connect a data source" → "Create your first dashboard" → "Set up alerts". Checks completion state from API (has datasources? has dashboards? has alert rules?). Dismissible via X, persists to `localStorage['ace-onboarding-dismissed']`. `surface-container-low` card, `secondary` checkmarks for completed steps, `primary` highlight for current step.

- [ ] **Step 6: Implement ShortcutsOverlay**

Modal listing all keyboard shortcuts from `useKeyboardShortcuts().shortcuts`. Grouped by category. Glassmorphic treatment (same as CmdKModal). Opens on `Cmd+/`.

- [ ] **Step 7: Rewrite App.vue**

Replace current layout:
- Remove Sidebar template ref pattern, use `useSidebar()` composable
- Remove CopilotPanel and sparkles toggle button
- Add AppSidebar, CmdKModal, ShortcutsOverlay, ToastNotification
- Content area: `margin-left` based on `useSidebar().isOpen` (240px or 0px), 200ms transition
- Floating hamburger button (32px, ghost, `outline` at 50% opacity) when sidebar closed
- Register global shortcuts: `Cmd+1`-`Cmd+5` for nav, `Cmd+Shift+N` for new dashboard, `Cmd+E` for explore
- `<main>` landmark for content area
- Keep CookieConsentBanner
- Add `<div>` overlay for viewports < 1280px: "Best experienced on a wider screen" message, centered, `surface-container-low` card
- Add `@media (prefers-reduced-motion: reduce)` — disable all transition durations (set to 0ms) in a global CSS rule in style.css

- [ ] **Step 8: Delete old Sidebar.vue and CopilotPanel.vue**

Remove both files. Their tests will also need updating/removing.

- [ ] **Step 9: Run tests**

Run: `cd frontend && pnpm test -- components/AppSidebar components/CmdKModal App.spec`
Expected: New tests pass. App.spec.ts will need updating — fix any import errors.

- [ ] **Step 10: Commit**

```bash
git add -A frontend/src/components/AppSidebar.vue frontend/src/components/CmdKModal.vue frontend/src/components/OnboardingBanner.vue frontend/src/components/ShortcutsOverlay.vue frontend/src/App.vue
git rm frontend/src/components/Sidebar.vue frontend/src/components/CopilotPanel.vue
git commit -m "feat: new app shell — collapsible sidebar, Cmd+K modal, shortcuts overlay, onboarding banner"
```

---

### Task 5: Router Update

**Files:**
- Modify: `frontend/src/router/index.ts`

- [ ] **Step 1: Update router with new routes**

Changes:
- Default redirect: `/` → `/app` (Home, not /app/dashboards)
- `/app` → HomeView (new, no redirect)
- `/app/dashboards` → DashboardsView (updated)
- `/app/dashboards/:id` → DashboardDetailView (kept)
- `/app/dashboards/:id/settings/:section` → DashboardSettingsView (kept)
- `/app/dashboards/new/ai` → DashboardGenView (new)
- `/app/services` → ServicesView (new)
- `/app/alerts` → AlertsView (kept)
- `/app/explore/:type` → UnifiedExploreView (new, replaces 3 separate routes)
- `/app/explore/metrics` → redirect to `/app/explore/metrics` (compat)
- `/app/explore/logs` → redirect to `/app/explore/logs` (compat)
- `/app/explore/traces` → redirect to `/app/explore/traces` (compat)
- `/app/settings/:section` → UnifiedSettingsView (new, replaces org settings + datasource routes)
- `/app/settings/org/:id/:section` → redirect to `/app/settings/:section` (compat)
- `/app/datasources/new` → redirect to `/app/settings/datasources` (compat)
- `/app/datasources/:id/edit` → keep route, accessed from Settings
- `/login` → LoginView (kept)
- `/convert/grafana` → keep (low priority reskin)

All `/app/*` routes: `meta: { appLayout: 'app' }`

- [ ] **Step 2: Update SEO metadata for new routes**

Add title/description metadata for Home, Services, Dashboard Generation routes.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/router/index.ts
git commit -m "feat: update router — add Home, Services, DashboardGen, unified Explore/Settings routes with redirects"
```

---

### Task 6: Home / Command Center View

**Files:**
- Create: `frontend/src/views/HomeView.vue`
- Test: `frontend/src/views/HomeView.spec.ts` (new)

- [ ] **Step 1: Write HomeView test**

Test: renders AI command input, system health grid with service cards, recent AI insights section, onboarding banner for new users, favorited dashboards section when favorites exist.

- [ ] **Step 2: Implement HomeView**

Visual hierarchy (top to bottom):
1. AI Command Input: prominent centered input, Space Grotesk "Ask Ace anything" heading, glassmorphic container. Functionally opens CmdKModal with focus.
2. Onboarding Banner (conditional — new users only)
3. Pinned Dashboards row (from `useFavorites()`) — horizontal scroll of dashboard cards
4. Recently Viewed row (from `useFavorites()`)
5. System Health Grid: 4-6 cards from alerting datasources (status dot, service name, uptime %, key metric in JetBrains Mono). Uses `useDatasource()` + `useVMAlert()` for data. Falls back to empty state if no datasources.
6. Recent AI Insights: 2-3 AiInsightCard components (mocked data for now)
7. Register context via `useCommandContext()` on mount

Empty state: Sparkles icon + "Welcome to Ace" + "Connect your first data source to get started" + "Add Data Source" button.

- [ ] **Step 3: Run test**

Run: `cd frontend && pnpm test -- views/HomeView`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/views/HomeView.vue frontend/src/views/HomeView.spec.ts
git commit -m "feat: add Home/Command Center view — AI input, health grid, favorites, onboarding"
```

---

### Task 7: Dashboards Explorer View

**Files:**
- Modify: `frontend/src/views/DashboardsView.vue`
- Modify: `frontend/src/components/DashboardList.vue`
- Modify: `frontend/src/components/CreateDashboardModal.vue`

- [ ] **Step 1: Rewrite DashboardsView as card grid explorer**

Currently 7 lines (just imports DashboardList). Expand to own the view header: "Dashboards" title (Space Grotesk), subtitle with count, search input, "New Dashboard" button (primary gradient). Search filters by name.

- [ ] **Step 2: Rewrite DashboardList as card grid**

Replace folder tree/list with responsive card grid (3-col >= 1440px, 2-col < 1440px). Each card: `surface-container-low` bg, 8px radius, dashboard name (Space Grotesk), folder label (`on-surface-variant`), key metric in JetBrains Mono, mini sparkline (if data available), star icon for favorites (`useFavorites()`). Hover: `surface-container-high`. Folder hierarchy shown as filterable chips, not a tree.

- [ ] **Step 3: Update CreateDashboardModal**

Add choice: "Blank Dashboard" (outlined button) vs "Generate with AI" (primary gradient button). AI choice navigates to `/app/dashboards/new/ai`.

- [ ] **Step 4: Update existing tests**

Update `DashboardList.spec.ts` and `CreateDashboardModal.spec.ts` for new DOM structure.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/DashboardsView.vue frontend/src/components/DashboardList.vue frontend/src/components/CreateDashboardModal.vue frontend/src/components/DashboardList.spec.ts frontend/src/components/CreateDashboardModal.spec.ts
git commit -m "feat: rewrite Dashboards Explorer as card grid with favorites and AI generation option"
```

---

### Task 8: Dashboard Detail View — Retheme + AI Badges + Refresh

**Files:**
- Modify: `frontend/src/views/DashboardDetailView.vue`
- Modify: `frontend/src/components/Panel.vue`
- Modify: `frontend/src/components/PanelEditModal.vue`
- Modify: `frontend/src/components/TimeRangePicker.vue`

- [ ] **Step 1: Retheme DashboardDetailView**

Update all Tailwind classes to new tokens. Add RefreshIndicator next to TimeRangePicker. Add `useCommandContext()` registration on mount with dashboard name/id. Add `useFavorites().addRecent()` call on mount.

- [ ] **Step 2: Add AI anomaly badge to Panel**

Add optional slot/prop for anomaly badge: pulsing `primary-dim` dot in top-right corner of panel. Hover shows tooltip with AI explanation (mocked text). Only shown when `anomaly` prop is truthy.

- [ ] **Step 3: Retheme PanelEditModal**

Glassmorphic modal: `surface-bright` + `backdrop-blur(20px)`, 8px radius, shadow. Update form inputs to new token styles.

- [ ] **Step 4: Update TimeRangePicker**

Retheme with new tokens. Add auto-refresh dropdown next to preset chips. `surface-bright` dropdown bg.

- [ ] **Step 5: Update existing tests**

Update `DashboardDetailView.spec.ts`, `Panel.spec.ts`, `PanelEditModal.spec.ts`, `TimeRangePicker.spec.ts` for new DOM structure.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/views/DashboardDetailView.vue frontend/src/components/Panel.vue frontend/src/components/PanelEditModal.vue frontend/src/components/TimeRangePicker.vue
git commit -m "feat: retheme dashboard detail — AI anomaly badges, refresh indicator, glassmorphic modals"
```

---

### Task 9: Dashboard Generation View

**Files:**
- Create: `frontend/src/views/DashboardGenView.vue`

- [ ] **Step 1: Implement DashboardGenView**

Route: `/app/dashboards/new/ai`. Guided 4-step flow:
1. Describe: Rich text input + suggestions, Space Grotesk heading
2. Generate: AI processes (streaming indicator, uses `useCopilot()`)
3. Review: DashboardSpecPreview component (reuse existing), edit panels
4. Create: Generating animation, then redirect to new dashboard

Error handling: malformed spec shows "Couldn't generate a valid dashboard" with "Try Again" button.

Uses existing `DashboardSpecPreview.vue` for step 3. Uses `useCopilot().sendChatRequest()` with `generate_dashboard` tool.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/views/DashboardGenView.vue
git commit -m "feat: add AI dashboard generation view — 4-step guided flow"
```

---

### Task 10: Services Overview View (Scaffolded)

**Files:**
- Create: `frontend/src/views/ServicesView.vue`

- [ ] **Step 1: Implement ServicesView with mock data**

Route: `/app/services`. Mock data: 4-6 service cards with hardcoded names/metrics. Each card: StatusDot, service name (Space Grotesk), latency/error rate/throughput in JetBrains Mono. Card grid layout (3-col/2-col responsive). Click navigates to related dashboards (disabled for now). AI surface: health prediction chips (mocked). Empty state when no mock data flag is set.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/views/ServicesView.vue
git commit -m "feat: scaffold Services Overview view with mock data"
```

---

### Task 11: Alert & Incident Explorer — Retheme

**Files:**
- Modify: `frontend/src/views/AlertsView.vue`

- [ ] **Step 1: Retheme AlertsView as dense table**

Replace current tab-based layout with a single dense table. Columns: StatusDot (severity), name, source, status (firing/resolved/silenced as chips), duration, last triggered (JetBrains Mono). Expandable rows: click to show alert detail + history timeline. AI surface: AiInsightCard below firing alerts with mocked root cause suggestion. Register `useCommandContext()` on mount.

- [ ] **Step 2: Update AlertsView tests**

Update for new DOM structure, test expandable rows, test AI card renders for firing alerts.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/views/AlertsView.vue
git commit -m "feat: retheme Alert Explorer — dense table, expandable rows, AI root cause cards"
```

---

### Task 12: Unified Explore View

**Files:**
- Create: `frontend/src/views/UnifiedExploreView.vue`
- Create: `frontend/src/views/MetricsExploreTab.vue`
- Create: `frontend/src/views/LogsExploreTab.vue`
- Create: `frontend/src/views/TracesExploreTab.vue`
- Delete: `frontend/src/views/Explore.vue`
- Delete: `frontend/src/views/ExploreLogs.vue`
- Delete: `frontend/src/views/ExploreTraces.vue`

- [ ] **Step 1: Extract MetricsExploreTab from Explore.vue**

Create `MetricsExploreTab.vue` by extracting the template and script from `Explore.vue` (731 lines). This becomes a self-contained tab component that receives `datasourceId` as a prop and manages its own query/results state. Retheme all Tailwind classes.

- [ ] **Step 2: Extract LogsExploreTab from ExploreLogs.vue**

Create `LogsExploreTab.vue` by extracting from `ExploreLogs.vue` (1154 lines). Same pattern — self-contained, prop-driven, rethemed.

- [ ] **Step 3: Extract TracesExploreTab from ExploreTraces.vue**

Create `TracesExploreTab.vue` by extracting from `ExploreTraces.vue` (1100 lines). Same pattern.

- [ ] **Step 4: Implement UnifiedExploreView**

Route: `/app/explore/:type` where type is `metrics`, `logs`, or `traces`. Underline tab sub-nav at top (Arrow Left/Right to switch). Renders the appropriate tab component via dynamic `<component :is="...">`. Shared datasource selector above tabs. AI surface: "Translate to query" button next to Monaco editor. Register `useCommandContext()` on mount.

- [ ] **Step 5: Delete old explore views**

Remove Explore.vue, ExploreLogs.vue, ExploreTraces.vue.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/views/UnifiedExploreView.vue frontend/src/views/MetricsExploreTab.vue frontend/src/views/LogsExploreTab.vue frontend/src/views/TracesExploreTab.vue
git rm frontend/src/views/Explore.vue frontend/src/views/ExploreLogs.vue frontend/src/views/ExploreTraces.vue
git commit -m "feat: unified Explore view — tabs for metrics/logs/traces, extracted into tab sub-components"
```

---

### Task 13: Unified Settings View

**Files:**
- Create: `frontend/src/views/UnifiedSettingsView.vue`
- Delete: `frontend/src/views/OrganizationSettings.vue`
- Delete: `frontend/src/views/DataSourceSettings.vue`
- Delete: `frontend/src/views/OrgBrandingSettings.vue`
- Delete: `frontend/src/views/PrivacySettingsView.vue`
- Delete: `frontend/src/views/UserSettingsView.vue`

- [ ] **Step 1: Implement UnifiedSettingsView**

Route: `/app/settings/:section`. Vertical tab layout: left nav (200px) within content area, content on right. Sections:
- **General** — extract from OrganizationSettings.vue (existing)
- **Members** — extract from OrganizationSettings.vue (existing)
- **Groups & Permissions** — extract from OrganizationSettings.vue (existing)
- **Data Sources** — extract from OrganizationSettings.vue + DataSourceSettings.vue (existing)
- **AI Configuration** — new stub section (GitHub Copilot connection settings, model selection — extract from GitHubAppSettings.vue)
- **SSO / Auth** — new stub section (SSO provider config — references existing SSO API)

Retheme all forms with tonal styling, monospace config values. The existing OrganizationSettings.vue (1507 lines) already has most sections as internal tabs — the main restructuring is moving to a URL-driven `:section` param and adding the two new stubs.

- [ ] **Step 2: Delete old settings views**

Remove the 5 old settings views.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/views/UnifiedSettingsView.vue
git rm frontend/src/views/OrganizationSettings.vue frontend/src/views/DataSourceSettings.vue frontend/src/views/OrgBrandingSettings.vue frontend/src/views/PrivacySettingsView.vue frontend/src/views/UserSettingsView.vue
git commit -m "feat: unified Settings view — vertical tabs, data sources absorbed, all sections rethemed"
```

---

### Task 14: Retheme Remaining Views — Login, DashboardSettings, DataSourceCreate

**Files:**
- Modify: `frontend/src/views/LoginView.vue`
- Modify: `frontend/src/views/DashboardSettingsView.vue`
- Modify: `frontend/src/views/DataSourceCreateView.vue`

- [ ] **Step 1: Retheme LoginView**

Update all Tailwind classes to new tokens. Dark surface bg, Space Grotesk heading, primary gradient login button, `surface-container-low` form card.

- [ ] **Step 2: Retheme DashboardSettingsView**

Replace pill tabs with underline tabs. Update form styling to tonal. Update all color tokens.

- [ ] **Step 3: Retheme DataSourceCreateView**

Update all Tailwind classes. This view is accessed from Settings > Data Sources.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/views/LoginView.vue frontend/src/views/DashboardSettingsView.vue frontend/src/views/DataSourceCreateView.vue
git commit -m "feat: retheme Login, DashboardSettings, DataSourceCreate views"
```

---

### Task 15: Retheme Chart Components

**Files:**
- Modify: `frontend/src/components/LineChart.vue`
- Modify: `frontend/src/components/BarChart.vue`
- Modify: `frontend/src/components/PieChart.vue`
- Modify: `frontend/src/components/GaugeChart.vue`
- Modify: `frontend/src/components/StatPanel.vue`
- Modify: `frontend/src/components/TablePanel.vue`

- [ ] **Step 1: Update ECharts theme for all chart components**

Update ECharts color palette to use the 4-color accent system: `#a3a6ff` (primary), `#69f6b8` (secondary), `#ffb148` (tertiary), `#ff6e84` (error). Update background to transparent (inherits surface). Update axis/label colors to `#757578` (outline). Update grid lines to `#47484a` at 15% opacity. Sparkline strokes: 1.5px.

- [ ] **Step 2: Retheme StatPanel and TablePanel**

StatPanel: large JetBrains Mono metric, Inter label. TablePanel: no lines, padding separation, hover rows, monospace numbers.

- [ ] **Step 3: Update chart tests**

Run existing chart tests, fix any that break due to DOM changes.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/LineChart.vue frontend/src/components/BarChart.vue frontend/src/components/PieChart.vue frontend/src/components/GaugeChart.vue frontend/src/components/StatPanel.vue frontend/src/components/TablePanel.vue
git commit -m "feat: retheme all chart components — Stitch palette, transparent bg, monospace metrics"
```

---

### Task 16: Retheme Remaining Components

**Files:**
- Modify remaining components that use old tokens: LogViewer, QueryBuilder, MonacoQueryEditor, TraceTimeline, TraceSpanDetailsPanel, TraceServiceGraph, TraceHeatmapPanel, TraceListPanel, LogQLQueryBuilder, ClickHouseSQLEditor, CloudWatchQueryEditor, ElasticsearchQueryEditor, CookieConsentBanner, EditDashboardModal, DashboardPermissionsEditor, FolderPermissionsModal, OrganizationDropdown, DataSourceSettingsPanel, GitHubAppSettings, DashboardSpecPreview, CreateOrganizationModal

- [ ] **Step 1: Batch retheme all remaining components**

Search and replace old token patterns across all component files:
- `bg-surface-raised` → `bg-[var(--color-surface-container-low)]`
- `bg-surface-overlay` → `bg-[var(--color-surface-container-high)]`
- `text-text-primary` → `text-[var(--color-on-surface)]`
- `text-text-secondary` → `text-[var(--color-on-surface-variant)]`
- `text-text-muted` → `text-[var(--color-outline)]`
- `bg-accent` → updated to primary gradient or secondary solid
- `border-border` → remove (tonal layering) or ghost border where needed
- `text-accent` → `text-[var(--color-primary)]`
- Any remaining emerald/rose/amber direct references → new palette

- [ ] **Step 2: Update MonacoQueryEditor theme**

Update Monaco Editor theme to match Stitch palette: editor background `surface-container-low`, line numbers `outline`, selection `surface-container-high`.

- [ ] **Step 3: Commit**

```bash
git add -A frontend/src/components/
git commit -m "feat: retheme all remaining components — tonal layering, new palette, no borders"
```

---

### Task 17: Fix All Tests

**Files:**
- Modify: all `*.spec.ts` files in `frontend/src/`

- [ ] **Step 1: Run full test suite and collect failures**

Run: `cd frontend && pnpm test 2>&1 | head -200`

Catalog every failing test by category: import errors (deleted files), DOM assertions (changed classes/structure), snapshot mismatches.

- [ ] **Step 2: Fix import errors**

Tests importing deleted components (Sidebar, CopilotPanel, Explore views, old settings views) need to be updated to import replacements or be deleted.

- [ ] **Step 3: Fix DOM assertions**

Tests asserting old CSS classes, old text content, or old component structure need to be updated to match new tokens and structure.

- [ ] **Step 4: Run full test suite**

Run: `cd frontend && pnpm test`
Expected: ALL tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A frontend/src/
git commit -m "test: fix all tests for Kinetic redesign — update assertions, imports, DOM structure"
```

---

### Task 18: Type Check + Lint + Final Verification

**Files:**
- All frontend files

- [ ] **Step 1: Run TypeScript type check**

Run: `cd frontend && pnpm type-check`
Expected: 0 errors. Fix any type errors.

- [ ] **Step 2: Run linter**

Run: `cd frontend && pnpm lint`
Fix any linting issues.

- [ ] **Step 3: Run full test suite one final time**

Run: `cd frontend && pnpm test`
Expected: ALL tests pass.

- [ ] **Step 4: Run build**

Run: `cd frontend && pnpm build`
Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A frontend/
git commit -m "chore: fix type errors and lint issues from Kinetic redesign"
```

---

## Dependency Order

```
Task 1 (design tokens)
  └─→ Task 2 (composables)
        └─→ Task 3 (reusable components)
              └─→ Task 4 (app shell)
                    └─→ Task 5 (router)
                          ├─→ Task 6 (Home view)
                          ├─→ Task 7 (Dashboards Explorer)
                          ├─→ Task 8 (Dashboard Detail)
                          ├─→ Task 9 (Dashboard Gen)
                          ├─→ Task 10 (Services)
                          ├─→ Task 11 (Alerts)
                          ├─→ Task 12 (Explore)
                          ├─→ Task 13 (Settings)
                          └─→ Task 14 (Retheme remaining views)
                                └─→ Task 15 (Chart components)
                                      └─→ Task 16 (Remaining components)
                                            └─→ Task 17 (Fix tests)
                                                  └─→ Task 18 (Final verification)
```

Tasks 6-14 can be parallelized after Task 5 completes.
