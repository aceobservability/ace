# Ace Style Guide UI Refactor — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor the entire frontend UI from custom dark-theme CSS with amber accents to Tailwind CSS v4 with the Ace Style Guide aesthetic (dark sidebar, light content, emerald accents, Space Grotesk + IBM Plex Mono).

**Architecture:** Install Tailwind CSS v4, replace global style.css with Tailwind theme config, then convert every Vue component's scoped CSS to Tailwind utility classes while simultaneously updating colors (amber→emerald), fonts (IBM Plex Sans→Space Grotesk, JetBrains Mono→IBM Plex Mono), and simplifying routes (remove /app prefix). No business logic or composable changes.

**Tech Stack:** Vue 3, Tailwind CSS v4, PostCSS, Vite, Space Grotesk + IBM Plex Mono (Google Fonts)

---

## Phase 1: Foundation — Tailwind + Global Styles + Routes

### Task 1: Install Tailwind CSS v4 and configure Vite

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/src/tailwind.css`
- Modify: `frontend/src/style.css` (replace entirely)
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/index.html`
- Modify: `frontend/src/main.ts`

**Step 1: Install Tailwind CSS v4 and its Vite plugin**

```bash
cd frontend && pnpm add -D tailwindcss @tailwindcss/vite
```

**Step 2: Update vite.config.ts to add Tailwind plugin**

Add `tailwindcss()` to the plugins array in `vite.config.ts`, before the Vue plugin:

```ts
import tailwindcss from '@tailwindcss/vite'
// ... in plugins array:
tailwindcss(),
```

**Step 3: Replace style.css with Tailwind entry point**

Replace the entire contents of `frontend/src/style.css` with:

```css
@import "tailwindcss";

@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=Space+Grotesk:wght@400;500;600;700&display=swap');

@theme {
  --font-sans: 'Space Grotesk', 'Segoe UI', sans-serif;
  --font-mono: 'IBM Plex Mono', 'Cascadia Mono', monospace;
}

/* Base styles */
@layer base {
  * {
    box-sizing: border-box;
  }

  *::selection {
    background: oklch(92.4% .12 165);
    color: #0f172a;
  }

  html, body {
    margin: 0;
    min-width: 320px;
    min-height: 100vh;
  }

  body {
    font-family: var(--font-sans);
    line-height: 1.5;
    font-weight: 400;
    color: #475569;
    background-color: #f8fafc;
    font-synthesis: none;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  #app {
    width: 100%;
    min-height: 100vh;
    display: flex;
  }

  h1, h2, h3, h4, h5, h6 {
    color: #0f172a;
    font-weight: 600;
    margin: 0;
    letter-spacing: -0.02em;
    line-height: 1.25;
  }

  h1 { font-size: 1.875rem; font-weight: 700; }
  h2 { font-size: 1.5rem; font-weight: 700; }
  h3 { font-size: 1.25rem; font-weight: 600; }

  p { color: #475569; margin: 0; }

  code, pre, kbd {
    font-family: var(--font-mono);
  }

  a {
    font-weight: 500;
    color: #059669;
    text-decoration: none;
    transition: color 150ms cubic-bezier(.4, 0, .2, 1);
  }
  a:hover { color: #047857; }

  button {
    font-family: inherit;
    cursor: pointer;
  }

  /* Scrollbar — light theme */
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: #f1f5f9; }
  ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 9999px; }
  ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
}

/* Utility animations */
@layer utilities {
  .animate-fade-in {
    animation: fadeIn 0.25s ease-out;
  }
  .animate-slide-up {
    animation: slideUp 0.3s ease-out;
  }
  .animate-spin {
    animation: spin 1s linear infinite;
  }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
```

**Step 4: Update index.html to preconnect Google Fonts**

In `frontend/index.html` `<head>`, add before existing stylesheets:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
```

Remove any existing Google Fonts `<link>` tag for IBM Plex Sans / JetBrains Mono (the new CSS import handles it).

**Step 5: Verify the dev server starts and Tailwind is working**

```bash
cd frontend && pnpm dev
```

Open browser — the page will look broken (expected, since scoped CSS still references old vars). Just confirm no build errors.

**Step 6: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml frontend/src/style.css frontend/vite.config.ts frontend/index.html
git commit -m "feat: install Tailwind CSS v4 and replace global style.css with style guide theme"
```

---

### Task 2: Simplify routes — remove /app prefix

**Files:**
- Modify: `frontend/src/router/index.ts`

**Step 1: Update all route definitions**

In `frontend/src/router/index.ts`, update the routes array:

- Change all primary paths from `/app/dashboards` → `/dashboards`, `/app/alerts` → `/alerts`, etc.
- Change `appLayout` meta to just `layout: 'app'` (simpler naming)
- Keep `/app/*` paths as redirect aliases pointing to new paths
- Update default redirect from `/` → `/dashboards`
- Update the auth guard redirect from `/app/dashboards` → `/dashboards`

The new routes array should have:
- `/` redirects to `/dashboards`
- `/dashboards` (was `/app/dashboards`), with alias `/app/dashboards`
- `/dashboards/:id` (was `/app/dashboards/:id`), with alias `/app/dashboards/:id`
- `/dashboards/:id/settings/:section` with alias
- `/alerts` (was `/app/alerts`), with alias `/app/alerts`
- `/explore/metrics` (was `/app/explore/metrics`), with alias
- `/explore/logs`, `/explore/traces` with aliases
- `/datasources` with alias
- `/datasources/new`, `/datasources/:id/edit` with aliases
- `/settings/org/:id/:section` with alias
- `/settings/privacy` with alias
- `/app` redirects to `/dashboards`
- `/app/explore` redirects to `/explore/metrics`
- Various other redirect aliases for backwards compat

Also update the `meta.appLayout` check throughout — change to `meta.layout`.

**Step 2: Update App.vue to use new meta key**

In `frontend/src/App.vue`, change `route.meta.appLayout === 'app'` to `route.meta.layout === 'app'`.

**Step 3: Update Sidebar.vue nav paths**

In `frontend/src/components/Sidebar.vue`, update all `path:` values in `navItems` from `/app/dashboards` → `/dashboards`, etc. Update `settingsPath` computed, `privacySettingsPath`, and the `normalizeAppPath` function (simplify it since paths no longer have `/app` prefix). Update `isRouteMatch` to just do direct prefix matching.

**Step 4: Update any hardcoded /app/ paths in other components**

Search the codebase for `/app/` references in Vue files and update them:
- `DashboardList.vue` — any router.push calls
- `DashboardDetailView.vue` — any navigation
- `DashboardSettingsView.vue` — breadcrumb links
- `OrganizationDropdown.vue` — any navigation
- `DataSourceSettings.vue` — links to create/edit
- `Explore.vue`, `ExploreLogs.vue`, `ExploreTraces.vue` — cross-signal navigation
- `AlertsView.vue` — any navigation
- `LoginView.vue` — redirect handling

**Step 5: Verify navigation works**

```bash
cd frontend && pnpm dev
```

Test: Navigate to each major route, verify sidebar highlights correctly, verify old `/app/*` URLs redirect.

**Step 6: Commit**

```bash
git add frontend/src/router/index.ts frontend/src/App.vue frontend/src/components/Sidebar.vue
git add -u frontend/src/  # catch any other updated files
git commit -m "feat: simplify routes by removing /app prefix, keep aliases for backwards compat"
```

---

### Task 3: Restyle App.vue root layout

**Files:**
- Modify: `frontend/src/App.vue`

**Step 1: Convert App.vue to Tailwind**

Replace the entire `<template>` and remove `<style scoped>`:

```vue
<template>
  <div class="flex min-h-screen w-full" :class="{ 'block': !showSidebar }">
    <Sidebar v-if="showSidebar" ref="sidebarRef" />
    <main
      class="min-h-screen flex-1 bg-slate-50 transition-[margin-left] duration-200 ease-out"
      :style="showSidebar ? { marginLeft: sidebarWidth } : {}"
    >
      <RouterView />
    </main>
    <CookieConsentBanner />
  </div>
</template>
```

Remove the entire `<style scoped>` block — it's all handled by Tailwind classes now.

**Step 2: Commit**

```bash
git add frontend/src/App.vue
git commit -m "feat: convert App.vue layout to Tailwind with light bg-slate-50 content area"
```

---

## Phase 2: Navigation — Sidebar + Org Dropdown

### Task 4: Restyle Sidebar.vue

**Files:**
- Modify: `frontend/src/components/Sidebar.vue`

This is a major restyle — 314 lines of scoped CSS to replace with Tailwind classes.

**Step 1: Update the template with Tailwind classes**

The sidebar should use:
- Container: `fixed inset-y-0 left-0 z-50 flex w-16 flex-col bg-slate-950 border-r border-slate-800 transition-[width] duration-200` (expanded: `w-58`)
- Header: `flex h-16 items-center justify-between border-b border-slate-800 px-3`
- Logo icon: Emerald badge per style guide — `inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 font-mono text-xs font-bold text-white`
- Logo text: `font-mono text-xs uppercase tracking-[0.16em] text-slate-200`
- Nav items: `mx-2 flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-400 transition hover:bg-slate-800 hover:text-slate-200`
- Active nav: `bg-emerald-600/10 border-l-2 border-l-emerald-400 text-slate-100`
- Sub-nav items: `ml-7 flex h-8 items-center rounded-lg px-3 text-xs text-slate-500 transition hover:bg-slate-800 hover:text-slate-300`
- Active sub-nav: `bg-emerald-600/10 text-emerald-400`
- Bottom section: `border-t border-slate-800 pt-2`
- User email: `font-mono text-xs text-slate-500 truncate`
- Logout hover: `hover:bg-rose-500/10 hover:text-rose-400`
- Toggle button: `flex h-7 w-7 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-400 transition hover:border-slate-600 hover:text-slate-200`

**Step 2: Remove entire `<style scoped>` block**

Delete all 314 lines of CSS.

**Step 3: Update logo to match style guide branding**

Replace the Activity icon + text with:
```html
<span class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 font-mono text-xs font-bold text-white">A</span>
<span v-if="isVisuallyExpanded" class="font-mono text-xs uppercase tracking-[0.16em] text-slate-200">Ace</span>
```

**Step 4: Verify sidebar renders correctly**

```bash
cd frontend && pnpm dev
```

Check: sidebar visible, nav items clickable, active states show emerald, collapse/expand works.

**Step 5: Commit**

```bash
git add frontend/src/components/Sidebar.vue
git commit -m "feat: restyle Sidebar with Tailwind — dark slate-950 bg, emerald active states"
```

---

### Task 5: Restyle OrganizationDropdown.vue

**Files:**
- Modify: `frontend/src/components/OrganizationDropdown.vue` (187 CSS lines)

**Step 1: Convert to Tailwind classes**

- Trigger button: `mx-2 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 transition hover:border-slate-600 hover:bg-slate-800`
- Dropdown panel: `absolute left-full top-0 z-[60] ml-2 w-64 rounded-xl border border-slate-200 bg-white shadow-lg`
- Org items: `flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50`
- Active org: `bg-emerald-50 text-emerald-700`
- Role badge: `rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-500`
- Create button: `border-t border-slate-100 px-4 py-3 text-sm font-medium text-emerald-600 hover:bg-emerald-50`

**Step 2: Remove `<style scoped>` block**

**Step 3: Commit**

```bash
git add frontend/src/components/OrganizationDropdown.vue
git commit -m "feat: restyle OrganizationDropdown with Tailwind — light dropdown, emerald accent"
```

---

## Phase 3: Auth — Login Page

### Task 6: Restyle LoginView.vue

**Files:**
- Modify: `frontend/src/views/LoginView.vue` (256 CSS lines)

**Step 1: Convert to Tailwind**

Login page stays dark (it's a standalone page, not in the app layout):
- Page container: `flex min-h-screen items-center justify-center bg-slate-950 px-4`
- Card: `w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-8`
- Logo: Same emerald badge from sidebar, centered, larger
- Heading: `text-2xl font-bold text-slate-100 text-center`
- Subtitle: `text-sm text-slate-400 text-center mt-2`
- Form inputs: dark variant — `w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none`
- Labels: `text-sm font-medium text-slate-300`
- Primary button: `w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700`
- Toggle link: `text-sm text-emerald-400 hover:text-emerald-300`
- Error message: `rounded-lg bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-400`

**Step 2: Remove background gradient effects**

Remove any radial-gradient or backdrop-filter — flat slate-950 bg.

**Step 3: Remove `<style scoped>` block**

**Step 4: Commit**

```bash
git add frontend/src/views/LoginView.vue
git commit -m "feat: restyle LoginView with Tailwind — dark slate-950 bg, emerald primary button"
```

---

## Phase 4: Dashboard Pages

### Task 7: Restyle DashboardList.vue

**Files:**
- Modify: `frontend/src/components/DashboardList.vue` (975 CSS lines — largest component)

**Step 1: Convert to Tailwind**

This is the largest CSS conversion. Key patterns:
- Page header: `flex items-center justify-between py-6 px-8`
- Search input: `rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none`
- Folder tree sidebar: `w-64 border-r border-slate-200 bg-white rounded-xl p-4`
- Dashboard cards: `rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm cursor-pointer`
- Card title: `text-sm font-semibold text-slate-900`
- Card description: `text-xs text-slate-500 mt-1`
- Card actions (hover): `flex gap-1` with icon buttons
- Folder items: `flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50`
- Active folder: `bg-emerald-50 text-emerald-700 font-medium`
- Empty state: `flex flex-col items-center justify-center py-16 text-center`
- Grid: `grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3`

**Step 2: Remove entire `<style scoped>` block** (975 lines)

**Step 3: Commit**

```bash
git add frontend/src/components/DashboardList.vue
git commit -m "feat: restyle DashboardList with Tailwind — white cards, emerald folder accents"
```

---

### Task 8: Restyle DashboardDetailView.vue

**Files:**
- Modify: `frontend/src/views/DashboardDetailView.vue` (327 CSS lines)

**Step 1: Convert to Tailwind**

- Page header bar: `flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3`
- Dashboard title: `text-lg font-semibold text-slate-900`
- Time range picker area: styled separately (Task 14)
- Action buttons: emerald primary, slate secondary per style guide
- Grid container: keep `vue3-grid-layout-next` structure, wrap in `px-6 py-4`
- Panel wrapper: `rounded-xl border border-slate-200 bg-white overflow-hidden`
- Add panel button: `rounded-lg border-2 border-dashed border-slate-200 text-slate-400 hover:border-emerald-300 hover:text-emerald-500`

**Step 2: Remove `<style scoped>` and `<style>` blocks**

The non-scoped `<style>` block has grid layout global styles — keep these as a small `<style>` block or convert.

**Step 3: Commit**

```bash
git add frontend/src/views/DashboardDetailView.vue
git commit -m "feat: restyle DashboardDetailView with Tailwind — white panel cards, light grid area"
```

---

### Task 9: Restyle DashboardSettingsView.vue

**Files:**
- Modify: `frontend/src/views/DashboardSettingsView.vue` (338 CSS lines)

**Step 1: Convert to Tailwind**

- Page layout: `px-8 py-6`
- Tab bar: `flex gap-1 border-b border-slate-200 mb-6`
- Tab: `px-4 py-2.5 text-sm font-medium text-slate-500 transition hover:text-slate-700`
- Active tab: `text-emerald-600 border-b-2 border-emerald-600`
- Settings card: `rounded-xl border border-slate-200 bg-white p-6`
- Form layout: `grid gap-4`
- Labels: `text-sm font-medium text-slate-700`
- Inputs: light theme variant (white bg, slate border, emerald focus)
- YAML editor container: `rounded-xl border border-slate-200 overflow-hidden`
- Save button: emerald primary
- Permissions table: style guide table pattern

**Step 2: Remove `<style scoped>` block**

**Step 3: Commit**

```bash
git add frontend/src/views/DashboardSettingsView.vue
git commit -m "feat: restyle DashboardSettingsView with Tailwind — tabbed settings, white cards"
```

---

### Task 10: Restyle Panel.vue

**Files:**
- Modify: `frontend/src/components/Panel.vue` (147 CSS lines)

**Step 1: Convert to Tailwind**

- Panel container: `flex h-full flex-col rounded-xl border border-slate-200 bg-white overflow-hidden`
- Panel header: `flex items-center justify-between border-b border-slate-100 px-4 py-2`
- Panel title: `text-sm font-semibold text-slate-900 truncate`
- Panel body: `flex-1 p-2`
- Action buttons: `h-7 w-7 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600`

**Step 2: Remove `<style scoped>` block**

**Step 3: Commit**

```bash
git add frontend/src/components/Panel.vue
git commit -m "feat: restyle Panel with Tailwind — white card with slate border"
```

---

### Task 11: Restyle PanelEditModal.vue

**Files:**
- Modify: `frontend/src/components/PanelEditModal.vue` (348 CSS lines)

**Step 1: Convert to Tailwind**

- Modal overlay: `fixed inset-0 z-50 flex items-center justify-center bg-black/50`
- Modal dialog: `w-full max-w-4xl rounded-xl border border-slate-200 bg-white shadow-lg max-h-[90vh] overflow-y-auto`
- Header: `flex items-center justify-between border-b border-slate-100 px-6 py-4`
- Header title: `text-lg font-semibold text-slate-900`
- Body: `px-6 py-4`
- Footer: `flex justify-end gap-3 border-t border-slate-100 px-6 py-4`
- Type selector cards: `rounded-xl border border-slate-200 p-4 cursor-pointer transition hover:border-emerald-300`
- Selected type: `border-emerald-500 bg-emerald-50`
- Form sections: standard light input styling

**Step 2: Remove `<style scoped>` block**

**Step 3: Commit**

```bash
git add frontend/src/components/PanelEditModal.vue
git commit -m "feat: restyle PanelEditModal with Tailwind — white dialog, emerald selections"
```

---

### Task 12: Restyle dashboard modals (Create, Edit)

**Files:**
- Modify: `frontend/src/components/CreateDashboardModal.vue` (255 CSS lines)
- Modify: `frontend/src/components/EditDashboardModal.vue` (189 CSS lines)

**Step 1: Convert CreateDashboardModal to Tailwind**

Same modal pattern as Task 11:
- Overlay + dialog + header/body/footer structure
- Mode selector tabs: `flex gap-1 rounded-lg bg-slate-100 p-1`
- Mode tab: `rounded-md px-4 py-2 text-sm font-medium text-slate-600 transition`
- Active mode: `bg-white text-slate-900 shadow-sm`
- File upload area: `rounded-xl border-2 border-dashed border-slate-200 p-8 text-center hover:border-emerald-300`

**Step 2: Convert EditDashboardModal to Tailwind**

Same modal pattern, simpler form (just title + description + folder select).

**Step 3: Remove both `<style scoped>` blocks**

**Step 4: Commit**

```bash
git add frontend/src/components/CreateDashboardModal.vue frontend/src/components/EditDashboardModal.vue
git commit -m "feat: restyle Create/Edit dashboard modals with Tailwind"
```

---

### Task 13: Restyle FolderPermissionsModal.vue + DashboardPermissionsEditor.vue

**Files:**
- Modify: `frontend/src/components/FolderPermissionsModal.vue` (233 CSS lines)
- Modify: `frontend/src/components/DashboardPermissionsEditor.vue` (179 CSS lines)

**Step 1: Convert both permission components to Tailwind**

- Permission table: style guide table pattern (dark header, white rows, slate borders)
- Add permission row: `flex items-center gap-3 rounded-lg border border-slate-200 p-3`
- Permission select: light input styling
- Remove button: `text-rose-500 hover:text-rose-600`

**Step 2: Remove both `<style scoped>` blocks**

**Step 3: Commit**

```bash
git add frontend/src/components/FolderPermissionsModal.vue frontend/src/components/DashboardPermissionsEditor.vue
git commit -m "feat: restyle permission editors with Tailwind — light tables, emerald accents"
```

---

## Phase 5: Explore Pages

### Task 14: Restyle TimeRangePicker.vue

**Files:**
- Modify: `frontend/src/components/TimeRangePicker.vue` (294 CSS lines)

**Step 1: Convert to Tailwind**

- Container: `flex items-center gap-2`
- Preset buttons: `rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100`
- Active preset: `bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20`
- Custom range inputs: light date inputs
- Refresh dropdown: `rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600`
- Refresh active indicator: `text-emerald-600`

**Step 2: Remove `<style scoped>` block**

**Step 3: Commit**

```bash
git add frontend/src/components/TimeRangePicker.vue
git commit -m "feat: restyle TimeRangePicker with Tailwind — light presets, emerald active state"
```

---

### Task 15: Restyle Explore.vue (Metrics)

**Files:**
- Modify: `frontend/src/views/Explore.vue` (559 CSS lines)

**Step 1: Convert to Tailwind**

- Page layout: `px-8 py-6`
- Page header: `flex items-center justify-between mb-6`
- Datasource selector: `flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3`
- Health indicator: `h-2 w-2 rounded-full` + `bg-emerald-500` (healthy) / `bg-rose-500` (unhealthy)
- Query area card: `rounded-xl border border-slate-200 bg-white p-4`
- Query history dropdown: `rounded-xl border border-slate-200 bg-white shadow-lg`
- Run button: emerald primary (prominent)
- Chart area: `rounded-xl border border-slate-200 bg-white p-4 mt-4`
- Loading spinner: `animate-spin text-emerald-600`
- Error state: `rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-700`

**Step 2: Remove `<style scoped>` block**

**Step 3: Commit**

```bash
git add frontend/src/views/Explore.vue
git commit -m "feat: restyle Explore metrics view with Tailwind — white cards, emerald query button"
```

---

### Task 16: Restyle ExploreLogs.vue

**Files:**
- Modify: `frontend/src/views/ExploreLogs.vue` (680 CSS lines)

**Step 1: Convert to Tailwind**

Same page layout pattern as Explore.vue metrics:
- Signal tabs: `flex gap-1 rounded-lg bg-slate-100 p-1` with active `bg-white shadow-sm`
- Query builder area: `rounded-xl border border-slate-200 bg-white p-4`
- Log viewer area: delegated to LogViewer component
- Status bar: `flex items-center gap-3 text-xs text-slate-500`

**Step 2: Remove `<style scoped>` block**

**Step 3: Commit**

```bash
git add frontend/src/views/ExploreLogs.vue
git commit -m "feat: restyle ExploreLogs with Tailwind — signal tabs, white query card"
```

---

### Task 17: Restyle ExploreTraces.vue

**Files:**
- Modify: `frontend/src/views/ExploreTraces.vue` (617 CSS lines)

**Step 1: Convert to Tailwind**

Same explore page pattern:
- Service graph area: `rounded-xl border border-slate-200 bg-white p-4`
- Trace list / heatmap area: delegated to sub-components
- Trace detail panel: `rounded-xl border border-slate-200 bg-white`
- Filter bar: `flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3`
- Filter inputs: light variant
- Duration filter: range inputs with emerald accent

**Step 2: Remove `<style scoped>` block**

**Step 3: Commit**

```bash
git add frontend/src/views/ExploreTraces.vue
git commit -m "feat: restyle ExploreTraces with Tailwind — white panels, filter bar"
```

---

### Task 18: Restyle query builders and editors

**Files:**
- Modify: `frontend/src/components/QueryBuilder.vue` (444 CSS lines)
- Modify: `frontend/src/components/LogQLQueryBuilder.vue` (197 CSS lines)
- Modify: `frontend/src/components/QueryEditor.vue` (212 CSS lines)
- Modify: `frontend/src/components/MonacoQueryEditor.vue` (100 CSS lines)
- Modify: `frontend/src/components/ClickHouseSQLEditor.vue` (107 CSS lines)
- Modify: `frontend/src/components/ElasticsearchQueryEditor.vue` (70 CSS lines)
- Modify: `frontend/src/components/CloudWatchQueryEditor.vue` (70 CSS lines)

**Step 1: Convert QueryBuilder.vue to Tailwind**

- Container: `rounded-xl border border-slate-200 bg-white`
- Metric selector: `rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm`
- Label pills: `rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600`
- Active pills: `bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20`
- Operator buttons: `rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-mono text-slate-600 hover:bg-slate-50`
- Code editor toggle: `text-sm text-emerald-600 hover:text-emerald-700`

**Step 2: Convert LogQLQueryBuilder.vue**

Similar pattern — label selectors, filter inputs, code mode toggle.

**Step 3: Convert remaining editors**

QueryEditor, MonacoQueryEditor, ClickHouseSQLEditor, ElasticsearchQueryEditor, CloudWatchQueryEditor all follow similar patterns — signal type selector tabs + editor area.

- Signal tabs: `flex gap-1 rounded-lg bg-slate-100 p-1`
- Editor wrapper: `rounded-lg border border-slate-200 overflow-hidden` (Monaco handles its own styling)
- Column hints: `text-xs text-slate-500 font-mono`

**Step 4: Remove all `<style scoped>` blocks from all 7 files**

**Step 5: Commit**

```bash
git add frontend/src/components/QueryBuilder.vue frontend/src/components/LogQLQueryBuilder.vue frontend/src/components/QueryEditor.vue frontend/src/components/MonacoQueryEditor.vue frontend/src/components/ClickHouseSQLEditor.vue frontend/src/components/ElasticsearchQueryEditor.vue frontend/src/components/CloudWatchQueryEditor.vue
git commit -m "feat: restyle all query builders and editors with Tailwind"
```

---

## Phase 6: Alerts Page

### Task 19: Restyle AlertsView.vue

**Files:**
- Modify: `frontend/src/views/AlertsView.vue` (892 CSS lines — second largest)

**Step 1: Convert to Tailwind**

- Page layout: `px-8 py-6`
- Tab bar: `flex gap-1 border-b border-slate-200 mb-6`
- Tab: `px-4 py-2.5 text-sm font-medium text-slate-500 transition hover:text-slate-700`
- Active tab: `text-emerald-600 border-b-2 border-emerald-600`
- Datasource selector: same pattern as Explore
- Alert cards: `rounded-xl border bg-white p-4` with colored left border:
  - Firing: `border-l-4 border-l-rose-500`
  - Pending: `border-l-4 border-l-amber-500`
  - Inactive: `border-l-4 border-l-slate-300`
- Alert title: `text-sm font-semibold text-slate-900`
- Alert labels: `rounded-full bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-600`
- State badges: Use status badge pattern from design doc
- Silence form: `rounded-xl border border-slate-200 bg-white p-6`
- Matcher rows: `flex items-center gap-3`
- Rule group accordion: `rounded-xl border border-slate-200 bg-white overflow-hidden`
- Accordion header: `flex items-center justify-between px-4 py-3 hover:bg-slate-50 cursor-pointer`
- Receiver cards: `rounded-xl border border-slate-200 bg-white p-4`

**Step 2: Remove `<style scoped>` block** (892 lines)

**Step 3: Commit**

```bash
git add frontend/src/views/AlertsView.vue
git commit -m "feat: restyle AlertsView with Tailwind — tabbed layout, colored alert borders"
```

---

## Phase 7: Data Sources Pages

### Task 20: Restyle DataSourceSettings.vue (list page)

**Files:**
- Modify: `frontend/src/views/DataSourceSettings.vue` (369 CSS lines)

**Step 1: Convert to Tailwind**

- Page layout: `px-8 py-6`
- Header: standard page header with "Add Data Source" emerald button
- Datasource cards: `rounded-xl border border-slate-200 bg-white p-4 flex items-center justify-between`
- Type badge: `font-mono text-xs uppercase tracking-[0.07em] text-slate-500`
- Health dot: `h-2.5 w-2.5 rounded-full` with color variants
- Actions: icon buttons with slate colors
- Empty state: centered message with emerald CTA

**Step 2: Remove `<style scoped>` block**

**Step 3: Commit**

```bash
git add frontend/src/views/DataSourceSettings.vue
git commit -m "feat: restyle DataSourceSettings list with Tailwind — white cards, health indicators"
```

---

### Task 21: Restyle DataSourceCreateView.vue (create/edit form)

**Files:**
- Modify: `frontend/src/views/DataSourceCreateView.vue` (254 CSS lines)

**Step 1: Convert to Tailwind**

- Page layout: `px-8 py-6 max-w-3xl`
- Form card: `rounded-xl border border-slate-200 bg-white p-6`
- Type selector grid: `grid grid-cols-2 gap-3 md:grid-cols-3`
- Type card: `rounded-xl border border-slate-200 p-4 text-center cursor-pointer transition hover:border-emerald-300`
- Selected type: `border-emerald-500 bg-emerald-50`
- Form sections with headers: `text-sm font-semibold text-slate-900 mb-3`
- Auth section: `rounded-lg border border-slate-200 bg-slate-50 p-4`
- Test connection button: secondary style
- Test result: success/error badges
- Save button: emerald primary, full width

**Step 2: Remove `<style scoped>` block**

**Step 3: Commit**

```bash
git add frontend/src/views/DataSourceCreateView.vue
git commit -m "feat: restyle DataSourceCreateView form with Tailwind — type selector, white card"
```

---

## Phase 8: Settings Pages

### Task 22: Restyle OrganizationSettings.vue

**Files:**
- Modify: `frontend/src/views/OrganizationSettings.vue` (821 CSS lines)

**Step 1: Convert to Tailwind**

- Page layout: `px-8 py-6`
- Section tabs: same tab pattern (border-b, emerald active)
- General section: form card with org name, slug, avatar
- Members section:
  - Invite form: `flex items-center gap-3`
  - Members table: style guide table pattern
  - Role select: `rounded-lg border border-slate-200 text-sm`
  - Remove button: `text-rose-500 hover:text-rose-600`
- Groups section:
  - Group cards: `rounded-xl border border-slate-200 bg-white p-4`
  - Create group form: inline or modal
- Auth section:
  - SSO provider cards: `rounded-xl border border-slate-200 bg-white p-4`
  - Config form: standard light inputs

**Step 2: Remove `<style scoped>` block**

**Step 3: Commit**

```bash
git add frontend/src/views/OrganizationSettings.vue
git commit -m "feat: restyle OrganizationSettings with Tailwind — tabbed sections, member table"
```

---

### Task 23: Restyle PrivacySettingsView.vue

**Files:**
- Modify: `frontend/src/views/PrivacySettingsView.vue` (131 CSS lines)

**Step 1: Convert to Tailwind**

- Page layout: `px-8 py-6 max-w-2xl`
- Settings card: `rounded-xl border border-slate-200 bg-white p-6`
- Toggle rows: `flex items-center justify-between py-4 border-b border-slate-100 last:border-0`
- Toggle label: `text-sm font-medium text-slate-900`
- Toggle description: `text-xs text-slate-500 mt-1`
- Toggle switch: custom Tailwind toggle (emerald when active)
- Save button: emerald primary

**Step 2: Remove `<style scoped>` block**

**Step 3: Commit**

```bash
git add frontend/src/views/PrivacySettingsView.vue
git commit -m "feat: restyle PrivacySettingsView with Tailwind — white card, emerald toggles"
```

---

## Phase 9: Visualization Components

### Task 24: Restyle chart components

**Files:**
- Modify: `frontend/src/components/LineChart.vue` (11 CSS lines)
- Modify: `frontend/src/components/BarChart.vue` (11 CSS lines)
- Modify: `frontend/src/components/PieChart.vue` (11 CSS lines)
- Modify: `frontend/src/components/GaugeChart.vue` (11 CSS lines)
- Modify: `frontend/src/components/StatPanel.vue` (79 CSS lines)
- Modify: `frontend/src/components/TablePanel.vue` (66 CSS lines)

**Step 1: Convert chart wrappers**

LineChart, BarChart, PieChart, GaugeChart all have minimal CSS (just container sizing). Convert to:
- Container: `h-full w-full`

**Step 2: Update ECharts theme colors in chart components**

Each chart component likely sets colors in its ECharts options. Update:
- Primary series color: emerald-600 (`#059669`) instead of amber
- Secondary colors: slate palette variants
- Tooltip: white bg, slate border
- Grid lines: slate-200
- Axis labels: slate-500

**Step 3: Convert StatPanel.vue**

- Container: `flex h-full flex-col items-center justify-center p-4`
- Value: `text-3xl font-bold text-slate-900`
- Label: `text-sm text-slate-500 mt-1`
- Unit: `text-lg font-medium text-slate-400 ml-1`

**Step 4: Convert TablePanel.vue**

- Use style guide table pattern exactly
- Container: `rounded-xl border border-slate-200 bg-white overflow-x-auto`
- Header: `bg-slate-900 font-mono text-xs uppercase tracking-[0.07em] text-slate-300`
- Cells: `px-4 py-3 text-sm text-slate-600`
- Row borders: `border-b border-slate-100`

**Step 5: Remove all `<style scoped>` blocks**

**Step 6: Commit**

```bash
git add frontend/src/components/LineChart.vue frontend/src/components/BarChart.vue frontend/src/components/PieChart.vue frontend/src/components/GaugeChart.vue frontend/src/components/StatPanel.vue frontend/src/components/TablePanel.vue
git commit -m "feat: restyle chart and stat components with Tailwind — emerald palette, white cards"
```

---

## Phase 10: Trace & Log Components

### Task 25: Restyle LogViewer.vue

**Files:**
- Modify: `frontend/src/components/LogViewer.vue` (240 CSS lines)

**Step 1: Convert to Tailwind**

- Container: `rounded-xl border border-slate-200 bg-white overflow-hidden`
- Header row: `bg-slate-900 font-mono text-xs uppercase tracking-[0.07em] text-slate-300`
- Log rows: `border-b border-slate-100 px-4 py-2 text-xs font-mono`
- Level badges:
  - Error: `bg-rose-50 text-rose-700 ring-1 ring-rose-600/20 rounded-full px-2 py-0.5`
  - Warn: `bg-amber-50 text-amber-700 ring-1 ring-amber-600/20 rounded-full px-2 py-0.5`
  - Info: `bg-sky-50 text-sky-700 ring-1 ring-sky-600/20 rounded-full px-2 py-0.5`
  - Debug: `bg-slate-100 text-slate-600 rounded-full px-2 py-0.5`
- Label tags: `rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600`
- Expanded row details: `bg-slate-50 px-6 py-4 text-xs font-mono`

**Step 2: Remove `<style scoped>` block**

**Step 3: Commit**

```bash
git add frontend/src/components/LogViewer.vue
git commit -m "feat: restyle LogViewer with Tailwind — dark header, level badges, expandable rows"
```

---

### Task 26: Restyle trace components

**Files:**
- Modify: `frontend/src/components/TraceServiceGraph.vue` (143 CSS lines)
- Modify: `frontend/src/components/TraceTimeline.vue` (165 CSS lines)
- Modify: `frontend/src/components/TraceSpanDetailsPanel.vue` (234 CSS lines)
- Modify: `frontend/src/components/TraceHeatmapPanel.vue` (110 CSS lines)
- Modify: `frontend/src/components/TraceListPanel.vue` (74 CSS lines)

**Step 1: Convert TraceServiceGraph.vue**

- Container: `rounded-xl border border-slate-200 bg-white p-4`
- SVG nodes: emerald fill for services, rose for errors
- Zoom controls: `flex gap-1 rounded-lg bg-slate-100 p-1`
- Control buttons: `h-8 w-8 rounded-md text-slate-600 hover:bg-white hover:shadow-sm`

**Step 2: Convert TraceTimeline.vue**

- Container: `rounded-xl border border-slate-200 bg-white overflow-hidden`
- Service name column: `text-sm font-medium text-slate-900`
- Span bars: emerald for normal, rose for errors, amber for slow
- Duration labels: `text-xs font-mono text-slate-500`
- Selected span: `bg-emerald-50`

**Step 3: Convert TraceSpanDetailsPanel.vue**

- Panel: `rounded-xl border border-slate-200 bg-white`
- Header: `border-b border-slate-100 px-4 py-3`
- Tag rows: `flex items-center gap-2 px-4 py-2 border-b border-slate-50 text-sm`
- Tag key: `font-mono text-xs text-slate-500`
- Tag value: `text-sm text-slate-900`
- Navigation links: `text-emerald-600 hover:text-emerald-700 text-sm`

**Step 4: Convert TraceHeatmapPanel.vue and TraceListPanel.vue**

Similar card patterns with slate/emerald styling.

**Step 5: Remove all `<style scoped>` blocks**

**Step 6: Commit**

```bash
git add frontend/src/components/TraceServiceGraph.vue frontend/src/components/TraceTimeline.vue frontend/src/components/TraceSpanDetailsPanel.vue frontend/src/components/TraceHeatmapPanel.vue frontend/src/components/TraceListPanel.vue
git commit -m "feat: restyle trace components with Tailwind — service graph, timeline, span details"
```

---

## Phase 11: Remaining Components

### Task 27: Restyle CookieConsentBanner.vue

**Files:**
- Modify: `frontend/src/components/CookieConsentBanner.vue` (80 CSS lines)

**Step 1: Convert to Tailwind**

- Banner: `fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-slate-200 bg-white px-6 py-4 shadow-lg flex items-center gap-4 max-w-lg`
- Text: `text-sm text-slate-600`
- Privacy link: `text-emerald-600 hover:text-emerald-700 underline`
- Accept button: emerald primary small
- Decline button: `text-sm text-slate-500 hover:text-slate-700`

**Step 2: Remove `<style scoped>` block**

**Step 3: Commit**

```bash
git add frontend/src/components/CookieConsentBanner.vue
git commit -m "feat: restyle CookieConsentBanner with Tailwind — white card, emerald accept button"
```

---

### Task 28: Restyle CreateOrganizationModal.vue

**Files:**
- Modify: `frontend/src/components/CreateOrganizationModal.vue` (238 CSS lines)

**Step 1: Convert to Tailwind**

Standard modal pattern:
- Overlay: `fixed inset-0 z-50 flex items-center justify-center bg-black/50`
- Dialog: `w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-lg`
- Header/body/footer: standard light modal layout
- Slug preview: `rounded-lg bg-slate-50 px-3 py-2 font-mono text-sm text-slate-600`

**Step 2: Remove `<style scoped>` block**

**Step 3: Commit**

```bash
git add frontend/src/components/CreateOrganizationModal.vue
git commit -m "feat: restyle CreateOrganizationModal with Tailwind — white dialog"
```

---

## Phase 12: Final Verification

### Task 29: Full visual walkthrough and cleanup

**Step 1: Run the dev server**

```bash
cd frontend && pnpm dev
```

**Step 2: Visual walkthrough checklist**

Navigate every route and verify:
- [ ] `/login` — dark page, emerald button, centered card
- [ ] `/dashboards` — light content, white cards, folder tree, search
- [ ] `/dashboards/:id` — panel grid, time picker, action buttons
- [ ] `/dashboards/:id/settings/general` — tabbed settings, white form
- [ ] `/alerts` — tabs, alert cards with colored borders, silence management
- [ ] `/explore/metrics` — query builder, chart, datasource selector
- [ ] `/explore/logs` — log query builder, log viewer
- [ ] `/explore/traces` — service graph, trace list, span details
- [ ] `/datasources` — datasource list, health indicators
- [ ] `/datasources/new` — type selector, form, test connection
- [ ] `/settings/org/:id/general` — org settings tabs
- [ ] `/settings/privacy` — toggle switches
- [ ] Sidebar — emerald active states, expand/collapse, org dropdown
- [ ] Old `/app/*` URLs — redirect properly to new paths

**Step 3: Check for any remaining CSS custom property references**

```bash
cd frontend && grep -r "var(--" src/ --include="*.vue" --include="*.css"
```

Should return zero results (all converted to Tailwind).

**Step 4: Check for any remaining `<style scoped>` blocks with old styling**

```bash
cd frontend && grep -c "<style" src/**/*.vue
```

Only the DashboardDetailView.vue grid globals should remain (if kept).

**Step 5: Run type check and lint**

```bash
cd frontend && pnpm type-check && pnpm lint
```

**Step 6: Run tests**

```bash
cd frontend && pnpm test
```

**Step 7: Fix any issues found**

**Step 8: Final commit**

```bash
git add -u frontend/src/
git commit -m "chore: cleanup remaining style artifacts from UI refactor"
```

---

## Summary

| Phase | Tasks | Components | Estimated CSS Lines Removed |
|-------|-------|------------|---------------------------|
| 1. Foundation | 1-3 | style.css, router, App.vue | ~280 |
| 2. Navigation | 4-5 | Sidebar, OrgDropdown | ~500 |
| 3. Auth | 6 | LoginView | ~256 |
| 4. Dashboards | 7-13 | DashboardList, Detail, Settings, Panel, modals, permissions | ~2,850 |
| 5. Explore | 14-18 | TimeRange, Explore, Logs, Traces, query builders | ~2,550 |
| 6. Alerts | 19 | AlertsView | ~892 |
| 7. Data Sources | 20-21 | Settings, CreateView | ~623 |
| 8. Settings | 22-23 | OrgSettings, Privacy | ~952 |
| 9. Visualization | 24 | Charts, Stat, Table | ~200 |
| 10. Trace/Log | 25-26 | LogViewer, trace components | ~966 |
| 11. Remaining | 27-28 | Cookie, CreateOrg modal | ~318 |
| 12. Verification | 29 | Full walkthrough | ~0 |

**Total:** 29 tasks, 44 Vue files, ~10,400 lines of CSS replaced with Tailwind utilities.
