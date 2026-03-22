# Kinetic Observability Redesign

Full UI replacement for the Ace observability platform. Replaces the current design system, app shell, and all views with a dark-only, high-density "flight deck" aesthetic based on the Stitch "Dynamic Dashboard" design project.

## Decisions

- **Dark-only** — drop light mode entirely
- **Big bang replacement** — rewrite all views in one pass, no phased migration
- **8 views** — Home/Command Center as landing page + AI woven into all other views
- **Stitch design system adopted wholesale** — Space Grotesk, Inter, JetBrains Mono, indigo primary, deep-space palette

## Stitch Reference

Project: `projects/12720654262391415750` ("Dynamic Dashboard")

| Screen | Stitch ID | Purpose |
|---|---|---|
| Dashboards Explorer | `28d3a4d963624774aea7856eef7c8ae9` | Browse/search dashboards |
| Dynamic Dashboard | `0e7cbb03b7404696ace715096308624f` | Dashboard detail with panels |
| Ace Generating Dashboard | `00a813854f594975ba73b00417d151a3` | AI dashboard generation flow |
| High-Level Service Overview | `29dfc72af2a44a90897221cd02204def` | Service health at a glance |
| Operational Deep-Dive | `87636532ba19474887981661f67729b5` | Deep-dive dashboard variant |
| Alert & Incident Explorer | `b1dd2a1ab9da41cd8d5d8abae4eebec9` | Alert table with incidents |
| Data Source Management | `601c61606ea842ff855e732e01dd0c9d` | Data source config (moves to Settings) |
| AI Command Center | `87499a95afd34ef3b47e6ddb4ea02cf1` | Reference for AI interaction patterns |

---

## 1. Design System Foundation

### Typography

| Role | Font | Size | Weight | Tracking |
|---|---|---|---|---|
| Display / Headline | Space Grotesk | 2rem (32px) | 600-700 | -0.02em |
| Section heading | Space Grotesk | 1.125rem (18px) | 600 | -0.01em |
| Body / UI controls | Inter | 0.875rem (14px) | 400-500 | normal |
| Labels | Inter | 0.75rem (12px) | 500 | 0.04em uppercase |
| Metrics / Data | JetBrains Mono | varies | 400-600 | normal |

### Surface Hierarchy

Tonal layering replaces borders. Structure is defined by background color steps.

| Level | Token | Hex | Usage |
|---|---|---|---|
| L0 Base | `surface` | `#0d0e10` | Page canvas |
| L1 Module | `surface-container-low` | `#121316` | Cards, panel backgrounds |
| L2 Active | `surface-container-high` | `#1e2022` | Hover states, active rows, sidebar bg |
| L3 Overlay | `surface-bright` | `#2b2c2f` | AI modal, command bar, dropdowns |

### Color Tokens

**Three distinct accent colors** — each has its own role beyond status. The UI should feel colorful against the dark canvas, not monochromatic.

| Token | Hex | Role |
|---|---|---|
| `primary` | `#a3a6ff` | AI elements, active nav, links, primary buttons, focused inputs |
| `primary-dim` | `#6063ee` | Gradient endpoints, secondary AI, icon backgrounds |
| `secondary` | `#69f6b8` | Progress indicators, secondary actions, data visualization lines, success states, healthy status |
| `secondary-dim` | `#58e7ab` | Secondary hover/active states |
| `tertiary` | `#ffb148` | Labels, edit/pencil actions, highlights, tertiary actions, warning states |
| `tertiary-dim` | `#e79400` | Tertiary hover/active states |
| `error` | `#ff6e84` | Destructive actions (delete icons, remove buttons), critical alerts, firing indicators |
| `on-surface` | `#fdfbfe` | Primary text |
| `on-surface-variant` | `#ababad` | Secondary text |
| `outline` | `#757578` | Tertiary text, placeholders |
| `outline-variant` | `#47484a` at 15% opacity | Ghost borders (accessibility only) |

### Color Usage by Context

Each color carries meaning — use them consistently:

| Context | Color | Examples |
|---|---|---|
| AI / Intelligence | `primary` (indigo) | Cmd+K modal, AI badges, suggestions, active nav |
| Data / Health / Progress | `secondary` (emerald) | Sparkline strokes, uptime metrics, progress bars, healthy status dots |
| Editing / Attention | `tertiary` (amber) | Edit buttons, pencil icons, labels, warning badges, soft-breach metrics |
| Destruction / Critical | `error` (coral) | Delete icons, remove actions, critical alerts, firing indicators |
| Navigation icons | Mixed | Each nav section can use its accent — dashboards (indigo), services (emerald), alerts (coral), explore (amber) |
| Data visualization | All four | Chart lines/fills use the full palette to differentiate series |

### Design Rules

- **No-Line Rule:** No `1px solid` borders for layout structure. Tonal layering only.
- **No box-shadow on cards.** Use surface tier steps for depth.
- **Ghost borders** (`outline-variant` at 15% opacity) only where accessibility demands separation (dense table rows).
- **AI elements** use glassmorphism: `backdrop-blur(20px)` + semi-transparent `surface-container-highest`.
- **Primary CTAs:** Linear gradient from `primary` to `primary-dim` at 135deg.
- **Secondary CTAs:** Solid `secondary` fill or `secondary` text on transparent bg.
- **Tertiary CTAs:** Solid `tertiary` fill for edit/label actions.
- **Icon color variety:** Icons are not all the same color. Use `primary` for AI/nav, `secondary` for data/health, `tertiary` for edit/config, `error` for destructive. This creates the vibrant, multi-color icon palette visible in the Stitch design system reference.
- **Real-time numeric data** always in JetBrains Mono to prevent layout jitter.
- **Corner radius:** 8px for containers, 4px for buttons/inputs, 2px for chips/badges.
- **No pure `#000000`** — use `surface` (`#0d0e10`) for backgrounds.
- **No `#ffffff` for body text** — use `on-surface` (`#fdfbfe`) for primary, `on-surface-variant` (`#ababad`) for secondary.

---

## 2. App Shell

### Sidebar

- **Width:** 240px expanded, 0px collapsed (fully hidden, no icon rail)
- **Toggle:** `Cmd+B` keyboard shortcut. When collapsed: a floating 32px ghost hamburger icon in the top-left corner of the content area, overlaying content slightly. Semi-transparent by default (`outline` color at 50% opacity), opaque on hover. Disappears when sidebar opens.
- **Animation:** 200ms ease-out slide, content area expands to fill
- **Background:** `surface-container-low` (`#121316`)
- **Logo:** Ace mark (gradient indigo square) + "Ace" wordmark in Space Grotesk 600
- **Nav items:** 13px Inter, `on-surface-variant` text default
- **Active item:** `surface-container-high` background + `primary` text
- **Hover:** `surface-container-high` background
- **Bottom section:** Settings + user avatar/name, separated by tonal step (not a line)

### Navigation Structure

```
Home              (Sparkles icon) — default landing page
Dashboards        (LayoutGrid icon)
Services          (Activity icon)
Alerts            (AlertTriangle icon)
Explore           (Search icon)
  - Metrics       (sub-item, visible when Explore active)
  - Logs
  - Traces
──── (tonal divider) ────
Settings          (Settings icon)
[avatar] username
```

### Content Area

- No global header bar. Each view owns its own header.
- View title: Space Grotesk `headline-lg` (20px+)
- Subtitle: `on-surface-variant`
- Action buttons (search, create, filters) right-aligned in each view's header

---

## 3. AI Interaction

AI is omnipresent — no dedicated AI Command Center view. It surfaces via two mechanisms:

### Cmd+K Modal

- **Trigger:** `Cmd+K` from anywhere, `Esc` to dismiss
- **Appearance:** Centered overlay, 640px wide
- **Background:** `surface-container-highest` at 80% opacity + `backdrop-blur(20px)`
- **Top edge:** Subtle `primary` glow (2px gradient border-top)
- **Shadow:** `0px 24px 48px rgba(0,0,0,0.5)` — tinted, not pure black
- **Scrim:** `surface` at 60% opacity
- **Input:** Large, 16px Inter, full-width, no visible border
- **Context pill:** Small chip showing current view context ("On: API Gateway Dashboard")
- **Chat thread:** Recent conversation below input, scrollable
- **Response streaming:** Typewriter effect, Inter for text, JetBrains Mono for code/queries
- **Action buttons:** "Apply", "Create Dashboard", "Run Query" — primary gradient style
- **Keyboard:** `Enter` to send, `Cmd+Enter` for multi-line

### Inline AI Elements

| View | AI Surface |
|---|---|
| Dashboard Detail | Anomaly badges on panels (pulsing `primary-dim` dot), hover reveals AI explanation |
| Alerts | Root cause suggestion card below firing alerts, glassmorphic card |
| Explore | "Translate to query" button next to Monaco editor, AI query completions |
| Services | Health prediction chips ("likely to degrade"), confidence % in monospace |
| Dashboards Explorer | "Suggested dashboards" section based on connected data sources |

### AI Visual Language

- AI-generated content has subtle indigo tint: `primary` at 5-10% opacity background
- AI icon: small gradient square (matching logo mark) precedes AI-generated text
- Glass effect (`backdrop-blur`) signals "AI layer on top of data"
- No AI elements use solid backgrounds — always semi-transparent

---

## 4. Component System

### Buttons

| Variant | Style | When to use |
|---|---|---|
| Primary | Gradient fill (`primary` → `primary-dim` at 135deg), white text, 4px radius | Main CTAs: Create, Save, Confirm, AI actions |
| Secondary | Solid `secondary` fill, dark text | Data/health actions: Run Query, Connect, Enable |
| Tertiary | Solid `tertiary` fill, dark text | Edit/config actions: Edit, Rename, Configure |
| Outlined | 1px `outline-variant` border, `on-surface-variant` text | Neutral secondary actions: Cancel, Filter, Export |
| Inverted | White fill, dark text | High-contrast CTAs on colored backgrounds |
| Ghost | Transparent, `on-surface-variant` text, hover shows `surface-container-high` | Inline actions, menus, icon buttons |
| Danger | Solid `error` fill, white text | Destructive: Delete, Remove, Revoke |

Heights: 32px (compact, for dense data areas) / 36px (default).

### Data Grid / Tables

- No vertical lines, no horizontal lines
- Row separation: vertical padding (`0.5rem`) + hover background shift to `surface-container-high`
- Header row: `label-sm` uppercase Inter, `outline` color
- Status indicators: 4px rounded dots (green/amber/red) inline with text
- Expandable rows for detail panels
- All numeric values in JetBrains Mono

### Cards

- Background: `surface-container-low` on `surface` canvas
- No border, no shadow — tonal contrast is the container
- 8px radius, 16px padding
- Hover: shift to `surface-container-high`
- Headers: Space Grotesk 14px weight 500

### Chips & Badges

- Default: `surface-variant` bg, `label-sm` Inter, 2px radius
- Status chips use their accent color as background at ~15% opacity with full-color text:
  - Healthy: `secondary` tint bg + `secondary` text
  - Warning: `tertiary` tint bg + `tertiary` text
  - Critical: `error` tint bg + `error` text
  - Info/AI: `primary` tint bg + `primary` text
- Tag chips, data source type chips, severity badges
- Icon chips: small colored icon (using accent palette) + label

### Inputs

- Background: `surface-container-low`
- No border by default (tonal)
- Focus: ghost border `outline-variant` + `primary` ring (1px)
- Placeholder: `outline` color
- 4px radius, 36px height

### Modals

- Background: `surface-bright` with `backdrop-blur(20px)`
- Shadow: `0px 24px 48px rgba(0,0,0,0.5)`
- 8px radius
- Scrim: `surface` at 60% opacity

### Sparklines & Metrics

- Stroke: 1.5px, colored by status
- Fill: vertical gradient from status color at 20% opacity → 0% at baseline
- Hero stats: JetBrains Mono 18-24px
- Inline stats: JetBrains Mono 14px
- Labels: Inter uppercase 10-11px, `outline` color

### Time Range Picker

- Dropdown from top-right of dashboard views
- Quick presets (15m, 1h, 6h, 24h, 7d) as chips
- Custom range with date/time inputs
- Background: `surface-bright`, same modal treatment

---

## 5. Views

### 5.0 Home / Command Center

**Route:** `/app` (default landing page after login)
**New view — references Stitch "AI Command Center" screen**

The flight deck landing page. Aggregates the most important signals and puts the AI command front and center.

**Visual hierarchy (top to bottom):**
1. **AI Command Input** — prominent centered input ("Execute Prompt" / "Ask Ace anything"), Space Grotesk heading, glassmorphic container. This is the hero — the first thing you see. Functionally identical to Cmd+K but always visible on this page.
2. **System Health Grid** — 4-6 service cards showing status (healthy/degraded/unstable), uptime %, and key metric. Uses the multi-color palette: green dots for healthy, amber for degraded, coral for critical. JetBrains Mono for all numbers.
3. **Recent AI Insights** — 2-3 cards showing recent AI-generated discoveries/analyses: anomaly correlations, cost optimization findings, infrastructure topology changes. Each card has a timestamp, title, and 1-line summary. Glassmorphic AI styling (indigo tint, gradient icon).
4. **Quick Links** — subtle row of links to dashboards, alerts, and recent activity.

**AI surface:** The page IS the AI surface — the command input is the centerpiece.

**First-time user:** A dismissible onboarding progress banner appears below the AI command input:
- "Get started with Ace" heading, `surface-container-low` card
- Three steps with checkmarks: "Connect a data source" → "Create your first dashboard" → "Set up alerts"
- Completed steps show `secondary` checkmark, current step is highlighted with `primary`
- Each step links to the relevant view
- Dismiss with X button, stores dismissed state in localStorage
- Disappears automatically once all three steps are completed

### 5.1 Dashboards Explorer

**Route:** `/app/dashboards`
**Replaces:** `DashboardsView` + `DashboardList`

Card grid with live metric previews (sparklines, key stats per dashboard). Folder hierarchy for organization. Search with filters (folder, tag, data source).

**"New Dashboard" button** opens choice:
- Blank canvas (standard create flow)
- AI-generated (redirects to `/app/dashboards/new/ai`)

**AI surface:** "Suggested dashboards" section based on connected data sources.

### 5.2 Dynamic Dashboard (Detail)

**Route:** `/app/dashboards/:id`
**Replaces:** `DashboardDetailView`

Draggable grid of panels using `vue3-grid-layout-next`. Time range picker top-right. Edit mode toggle.

**Panel types:** stat, line, bar, pie, gauge, table, log viewer, trace timeline, heatmap.

**Panel edit modal** for query building (Monaco editor, data source selector).

**AI surface:** Anomaly badges on panels — pulsing `primary-dim` dot, hover reveals AI-generated explanation. AI-suggested correlations between metrics.

### 5.3 Dashboard Generation Flow

**Route:** `/app/dashboards/new/ai`
**Enhances:** Existing `chat-to-dashboard` feature (commit `96fb6fa`)

Guided AI dashboard creation:
1. Describe what you want to monitor (rich text input with suggestions)
2. AI generates spec — preview of proposed panels, data sources, layout
3. User reviews, adjusts, confirms
4. Dashboard materializes with generating animation

Also accessible via Cmd+K ("create a dashboard for API latency").

**Error handling:** If the AI returns a malformed or invalid spec, show an inline error in the preview step: "Couldn't generate a valid dashboard — try rephrasing your request" with a "Try Again" button. Do not silently fail or show a broken preview.

### 5.4 Services Overview

**Route:** `/app/services`
**New view — scaffold without backend wiring**

High-level service health at a glance. Service cards showing:
- Status (healthy / degraded / down) with color-coded dots
- Key metrics: latency, error rate, throughput — all JetBrains Mono
- Dependency map visualization

Click into a service to see its related dashboards and alerts.

**AI surface:** Health prediction chips ("likely to degrade"), confidence % in monospace.

### 5.5 Alert & Incident Explorer

**Route:** `/app/alerts`
**Replaces:** `AlertsView`

Dense filterable table. Columns: severity, name, source, status (firing/resolved/silenced), duration, last triggered.

Expandable rows for alert detail + history timeline. Incident grouping — related alerts clustered together. Silence/acknowledge actions.

**AI surface:** Root cause suggestion card below firing alerts — glassmorphic `surface-container-highest` card with AI explanation.

### 5.6 Explore (Metrics / Logs / Traces)

**Route:** `/app/explore/:type`
**Replaces:** `Explore`, `ExploreLogs`, `ExploreTraces`

Unified explore view with underline tab sub-nav (Metrics, Logs, Traces). Query builder with Monaco editor, data source selector, time range picker.

Results below: line charts for metrics, log stream for logs, trace waterfall + service graph for traces.

**AI surface:** "Translate to query" button next to Monaco editor. AI-suggested query completions. Anomaly highlighting in results.

### 5.7 Settings

**Route:** `/app/settings/:section`
**Replaces:** `OrganizationSettings` + `DataSourceSettings`

Vertical tab layout (left nav within content area). Sections:
- General (org name, branding)
- Members
- Groups & Permissions
- **Data Sources** (moved here from top-level nav)
- AI Configuration
- SSO / Auth

Dense forms, tonal section separators, monospace for config values.

---

## 5.8 Interaction States

Every view must handle these states. Engineers should not improvise — use these patterns:

### Loading States

All loading states use the shimmer animation (surface tier pulse). Never show a blank page.

| View | Loading Pattern |
|---|---|
| Home | Skeleton cards for health grid + insight cards, AI input active immediately |
| Dashboards Explorer | Skeleton card grid (3x2), search input active immediately |
| Dashboard Detail | Panel frames visible with shimmer fill, time range picker active |
| Services | Skeleton service cards with status dot placeholders |
| Alerts | Table header visible, rows shimmer (5 placeholder rows) |
| Explore | Monaco editor loads immediately, results area shows "Run a query to see results" |
| Settings | Tab nav visible, form fields shimmer |
| Dashboard Generation | Step indicator visible, AI input active |

### Empty States

Empty states are features, not errors. Each has: an icon, a message with warmth, and a primary action.

| View | Empty State |
|---|---|
| Home (no services) | Sparkles icon + "Welcome to Ace" + "Connect your first data source to get started" + primary button "Add Data Source" |
| Dashboards Explorer (no dashboards) | LayoutGrid icon + "No dashboards yet" + "Create your first dashboard or let AI build one for you" + two buttons: "Create Dashboard" (outlined) / "Generate with AI" (primary gradient) |
| Dashboard Detail (no panels) | Plus icon + "This dashboard is empty" + "Add a panel to start visualizing your data" + "Add Panel" button |
| Services (no services) | Activity icon + "No services discovered" + "Services will appear here once data sources are connected and sending metrics" |
| Alerts (no alerts) | CheckCircle icon in `secondary` + "All clear — no alerts" + "Your systems are healthy. Alert rules can be configured in your dashboards." |
| Alerts (no rules configured) | Bell icon + "No alert rules configured" + "Set up alerting in your dashboard panels or data source settings" |
| Explore (no results) | Search icon + "Run a query to explore your data" + "Select a data source and enter a query above" |
| Settings > Data Sources (none) | Database icon + "No data sources connected" + "Connect Prometheus, Loki, Tempo, or other sources to start monitoring" + "Add Data Source" button |

### Error States

Errors use `error` color sparingly — the message should be helpful, not alarming.

| Scope | Pattern |
|---|---|
| Full page error | Centered: AlertTriangle icon in `error`, "Something went wrong" heading, `on-surface-variant` description of what failed, "Retry" button (outlined) |
| Panel error | Within panel frame: small AlertTriangle icon + "Failed to load" in `on-surface-variant`, "Retry" ghost button. Panel frame stays visible. |
| Inline error | Red text below the input/field that caused it. 12px Inter, `error` color. |
| Network error | Toast notification (top-right): `surface-bright` bg, `error` left border, message + "Retry" link |
| Query error | In Explore results area: monospace error message from the data source, `error` text on `error` at 5% opacity bg |

### Partial / Degraded States

| Scenario | Pattern |
|---|---|
| Some panels fail, others succeed | Failed panels show inline error, successful panels render normally. No full-page error. |
| AI features unavailable | AI elements gracefully hide. Cmd+K still opens but shows "AI is currently unavailable" with retry. No broken UI. |
| Data source unreachable | Dashboard cards show last-known values with a stale data indicator (clock icon + "Last updated 5m ago" in `tertiary`) |

---

## 6. Transitions & Motion

| Element | Duration | Easing | Effect |
|---|---|---|---|
| Sidebar open/close | 200ms | ease-out | Slide |
| View transitions | 150ms | ease | Opacity 0→1 fade |
| Card hover | 100ms | ease | Background color shift |
| Cmd+K modal | 150ms | ease-out | scale(0.98→1) + opacity, backdrop fade |
| Panel loading | — | ease-in-out | Shimmer pulse on surface tiers |
| Sparkline draw | 300ms | ease-out | Stroke animation on mount |
| Alert firing dot | 2s | ease-in-out | Slow pulse on `error`, not distracting |

**Principles:**
- Motion is functional, not decorative — communicates state changes
- Nothing exceeds 300ms
- Respect `prefers-reduced-motion` — skip all non-essential animations

---

## 6.1 Responsive Behavior

**Minimum supported width:** 1280px. No mobile or tablet layouts.

| Viewport | Behavior |
|---|---|
| >= 1920px (ultrawide) | Sidebar expanded by default. Dashboard grids can use wider columns. Content max-width: none (fill available). |
| 1440px-1919px | Standard desktop. Sidebar expanded by default. |
| 1280px-1439px (laptop) | Sidebar auto-collapses on load (starts at 0px). Hamburger icon visible. Dashboard cards switch from 3-column to 2-column grid. |
| < 1280px | Not supported. Show a "Best experienced on a wider screen" message if detected. |

**Dashboard grid breakpoints:**
- >= 1440px: 3+ column card grid (Dashboards Explorer, Home health grid)
- 1280-1439px: 2-column card grid
- Dashboard detail panels: `vue3-grid-layout-next` handles its own responsive behavior

## 6.2 Accessibility

### Keyboard Navigation

| Pattern | Keys |
|---|---|
| Sidebar nav | `Tab` to enter sidebar, `Arrow Up/Down` to navigate items, `Enter` to select, `Escape` to return to content |
| Cmd+K modal | `Cmd+K` to open, `Escape` to close, `Tab` to cycle action buttons, focus trapped inside modal |
| Data tables | `Tab` to enter table, `Arrow Up/Down` to navigate rows, `Enter` to expand row, `Escape` to collapse |
| Explore tabs | `Tab` to reach tab bar, `Arrow Left/Right` to switch tabs |
| Dashboard panels | `Tab` to cycle panels in edit mode, `Enter` to open panel editor |
| Modals | Focus trapped, `Escape` to close, first focusable element auto-focused on open |
| Buttons | `Enter` or `Space` to activate |

### Focus Indicators

- Focus ring: 2px `primary` outline with 2px offset (visible on dark backgrounds)
- Ghost buttons: focus shows `surface-container-high` background + `primary` outline
- Inputs: focus border changes to `primary` (already specified)

### ARIA Landmarks

| Region | Landmark |
|---|---|
| Sidebar | `<nav aria-label="Main navigation">` |
| Content area | `<main>` |
| Cmd+K modal | `<dialog aria-label="AI Command">` with `aria-modal="true"` |
| View header | `<header>` within main |
| Alert table | `<table>` with `role="grid"` for keyboard nav |

### Screen Reader

- Route changes announce the new page title via a live region
- Loading states announce "Loading [view name]" via `aria-live="polite"`
- Error states announce the error message via `aria-live="assertive"`
- Status dots use `aria-label` ("Healthy", "Warning", "Critical")

### Contrast

- Primary text (`#fdfbfe`) on base surface (`#0d0e10`): contrast ratio ~19:1 (passes AAA)
- Secondary text (`#ababad`) on base surface: ~8:1 (passes AA)
- `primary` (`#a3a6ff`) on base surface: ~7:1 (passes AA)
- `secondary` (`#69f6b8`) on base surface: ~11:1 (passes AAA)
- `error` (`#ff6e84`) on base surface: ~6:1 (passes AA)
- All interactive elements: minimum 44px touch/click target height

---

## 6.3 Keyboard Shortcuts (CEO review expansion)

Unified shortcut system via `useKeyboardShortcuts()` composable. SRE power users live on keyboard.

| Shortcut | Action |
|---|---|
| `Cmd+K` | Open AI command modal |
| `Cmd+B` | Toggle sidebar |
| `Cmd+/` | Show keyboard shortcuts overlay |
| `Cmd+1` through `Cmd+5` | Jump to nav items (Home, Dashboards, Services, Alerts, Explore) |
| `Cmd+Shift+N` | New dashboard |
| `Cmd+E` | Jump to Explore |
| `Cmd+P` or typing in Cmd+K | Fuzzy search across dashboards, alerts, data sources, settings |
| `Escape` | Close any modal/overlay |

**Help overlay:** `Cmd+/` opens a centered modal listing all shortcuts, grouped by category. Same glassmorphic treatment as Cmd+K.

**Cmd+K dual mode:** Typing a search term (dashboard name, alert name) triggers fuzzy search. Typing a natural language question activates AI mode. Heuristic: if input looks like a name/keyword, search; if it looks like a sentence, AI. User can force mode with `/ai` or `/search` prefix.

## 6.4 Dashboard Favorites & Recents (CEO review expansion)

- **Favorite icon:** Star icon on each dashboard card in the Explorer. Click to pin/unpin.
- **Storage:** Favorites stored in localStorage per user (`ace-favorites`).
- **Home integration:** Favorited dashboards appear in a "Pinned Dashboards" row on the Home page, between the Health Grid and AI Insights.
- **Recent dashboards:** Track last 10 visited dashboards in-memory (sessionStorage). Show as "Recently Viewed" row on Home page below pinned.

## 6.5 Auto-Refresh & Freshness Indicator (CEO review expansion)

Dashboard detail views show real-time data freshness:

- **Auto-refresh toggle:** Dropdown in the dashboard header next to time range picker. Options: 15s, 30s, 1m, 5m, Off.
- **Freshness indicator:** "Last refreshed Xs ago" text in `on-surface-variant`, updates every second.
- **Status dot:** Green pulsing dot when auto-refreshing, gray static dot when paused.
- **Stale warning:** If data is older than 2x the refresh interval, indicator turns `tertiary` (amber) with "Data may be stale."

---

## 7. What Gets Deleted

The following current files/patterns are replaced entirely:

- **Light mode CSS** — all `:root` light tokens and `.dark` toggle logic in `style.css`
- **Plus Jakarta Sans font** — replaced by Space Grotesk + Inter
- **Emerald accent** (`#10b981`) — replaced by indigo (`#a3a6ff` / `#6063F1`)
- **Current sidebar** (`Sidebar.vue`) — icon rail pattern replaced by full collapsible sidebar
- **Current CopilotPanel** (`CopilotPanel.vue`) — floating panel replaced by Cmd+K modal + inline AI
- **Separate Explore views** (`Explore.vue`, `ExploreLogs.vue`, `ExploreTraces.vue`) — unified into single view with sub-nav tabs
- **Separate DataSourceSettings route** — absorbed into Settings
- **Border-based card/component styling** — replaced by tonal layering
- **`useTheme` composable** — no light/dark toggle needed (dark-only)
- **`OrgBrandingSettings.vue`** — absorbed into Settings > General section
- **`PrivacySettingsView.vue`** — absorbed into Settings
- **`UserSettingsView.vue`** — absorbed into Settings

## 8. What Gets Preserved

- **Backend API layer** — all `api/*.ts` files, no backend changes needed
- **Composables** — `useAuth`, `useOrganization`, `useProm`, `useTimeRange`, `useQueryBuilder`, `useDatasource`, `useAlertManager`, `useVMAlert`, `useAnalytics`, `useOrgBranding`
- **Copilot composables** — `useCopilot`, `useCopilotTools` — reused by the new Cmd+K modal (adapted from panel-scoped to global-scoped, context pill provides current view info instead of component props)
- **Chart library** — ECharts + Vue ECharts (rethemed, not replaced)
- **Grid layout** — `vue3-grid-layout-next` for dashboard panels
- **Monaco Editor** — for query editing (rethemed)
- **Type definitions** — all `types/*.ts` files
- **Router structure** — updated routes but same Vue Router setup
- **Test infrastructure** — Vitest + Vue Test Utils
- **Analytics** — PostHog integration

## 9. Views Not Listed Above

These existing views are reskinned but structurally unchanged:

- **`LoginView.vue`** — reskinned with new design tokens (dark surface, Space Grotesk headings, indigo primary buttons). Same auth flow, SSO support.
- **`DashboardSettingsView.vue`** (`/app/dashboards/:id/settings/:section`) — reskinned. Tabs for general, YAML, permissions remain. Underline tab style, tonal forms.
- **`DataSourceCreateView.vue`** (`/app/datasources/new` and `/app/datasources/:id/edit`) — reskinned. Accessed from Settings > Data Sources.
- **Grafana Converter** (`/convert/grafana`) — reskinned with new tokens, low priority.

## 10. Scoping Notes

- **Inline AI surfaces** (anomaly badges, health predictions, root cause suggestions) are scaffolded as UI components with mocked/placeholder data. They do not require new AI backend integration — they reuse the existing copilot composables where applicable.
- **Explore route migration**: Old routes (`/app/explore/metrics`, `/app/explore/logs`, `/app/explore/traces`) should redirect to new parameterized route (`/app/explore/:type`) to preserve bookmarks.
- **Services view** is scaffolded without backend wiring — mock data only.
