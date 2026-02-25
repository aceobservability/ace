# Full UI Refactor to Ace Style Guide

**Date:** 2026-02-25
**Scope:** Frontend-only visual refactor — all views, components, global styles, routes

---

## 1. Color & Theme System

Dark sidebar (slate-950) + light content area (slate-50, white cards).

**Sidebar palette:**
- Background: `#0f172a` (slate-950)
- Body text: `#94a3b8` (slate-400)
- Headings: `#f1f5f9` (slate-100)
- Border: slate-700 / slate-800
- Active state: emerald-600 left border + subtle emerald bg

**Content area palette:**
- Background: `#f8fafc` (slate-50)
- Body text: `#475569` (slate-600)
- Headings: `#0f172a` (slate-950)
- Muted: `#64748b` (slate-500)
- Card bg: `#ffffff`
- Card border: slate-200
- Row separator: slate-100

**Accent — Emerald (primary):**
- emerald-400: mono labels on dark bg
- emerald-500: sparkline accents
- emerald-600: buttons, icons, focus rings
- emerald-700: button hover
- emerald-50: highlighted rows

**Semantic colors (unchanged purpose):**
- Success: emerald-500
- Danger: rose-500 / rose-600
- Warning: amber-500

**Removed:**
- All amber accent usage (replaced by emerald)
- Background gradients/blur effects
- Semi-transparent surface layers
- Grid background pattern

## 2. Typography

**Fonts:**
- Body & headings: Space Grotesk (replacing IBM Plex Sans)
- Code/labels/brand: IBM Plex Mono (replacing JetBrains Mono)

**Scale:** text-xs (12px) through text-5xl (48px) per style guide.

**Weights:** normal (400), medium (500), semibold (600), bold (700).

**Tracking:**
- Headings: `letter-spacing: -0.02em`
- Mono labels: `tracking-[0.12em]` to `tracking-[0.17em]`, always uppercase
- Body: default 1.5 line-height, `leading-relaxed` for long-form

## 3. CSS Migration — Tailwind v4

**Install:** `@tailwindcss/vite` plugin + `tailwindcss` package.

**Replace style.css** with Tailwind entry point:
- `@import "tailwindcss"` base directive
- Custom theme tokens via `@theme` block
- Minimal global base styles (scrollbar, selection, headings)

**Convert all scoped CSS** in every `.vue` component to Tailwind utility classes.

**Remove:** All CSS custom properties (`--bg-primary`, etc.), all scoped `<style>` blocks.

## 4. Navigation — Sidebar Redesign

Keep collapsible sidebar pattern (64px collapsed / 232px expanded).

**Visual changes:**
- Flat `bg-slate-950` background (no gradient/blur)
- No decorative `::before` glow line
- Logo: emerald badge with monospace "A" + "Ace" text per style guide branding
- Nav items: `text-sm font-medium text-slate-400` default
- Active: `bg-emerald-600/10 border-l-2 border-emerald-400 text-slate-100`
- Hover: `bg-slate-800 text-slate-200`
- Sub-nav children: indented, smaller text, emerald dot for active
- Bottom section: Settings, Privacy, user email, Logout grouped with border-t separator
- Logout hover: rose tint (keep current pattern)

**Functional changes:** None — same expand/collapse/hover behavior.

## 5. Route Simplification

Remove `/app` prefix from all routes. Keep `/app/*` as redirect aliases.

| Old Path | New Path |
|----------|----------|
| `/app/dashboards` | `/dashboards` |
| `/app/dashboards/:id` | `/dashboards/:id` |
| `/app/dashboards/:id/settings/:section` | `/dashboards/:id/settings/:section` |
| `/app/alerts` | `/alerts` |
| `/app/explore/metrics` | `/explore/metrics` |
| `/app/explore/logs` | `/explore/logs` |
| `/app/explore/traces` | `/explore/traces` |
| `/app/datasources` | `/datasources` |
| `/app/datasources/new` | `/datasources/new` |
| `/app/datasources/:id/edit` | `/datasources/:id/edit` |
| `/app/settings/org/:id/:section` | `/settings/org/:id/:section` |
| `/app/settings/privacy` | `/settings/privacy` |

Default redirect: `/` → `/dashboards`

Auth guard logic unchanged — just path references updated.

## 6. Page Layout Pattern

Every authenticated page:

```
[Dark Sidebar 64/232px] | [Light Content min-h-screen bg-slate-50]
                          ├── Page Header (py-6 px-8)
                          │   ├── h1 (text-2xl font-bold text-slate-950)
                          │   ├── description (text-sm text-slate-500 mt-1)
                          │   └── actions (buttons, right-aligned)
                          └── Content (px-8 pb-8)
                              └── Cards / Tables / Forms
```

**Login page:** Full dark background (slate-950), centered white card, emerald primary button.

## 7. Component Restyling

### Buttons
- Primary: `rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700`
- Secondary: `rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400`
- Danger: `rounded-lg bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700`
- Small: `rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-700`

### Cards
- Feature/content: `rounded-xl border border-slate-200 bg-white`
- Inner padding: `p-4` (compact) or `p-6` (spacious)
- Full height grid: `grid h-full`

### Forms
- Inputs: `w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none`
- Labels: `text-sm font-medium text-slate-700`
- Selects: Same as inputs with chevron icon

### Tables
- Container: `rounded-xl border border-slate-200 bg-white overflow-hidden`
- Header: `bg-slate-900 font-mono text-xs uppercase tracking-[0.07em] text-slate-300`
- Cells: `px-4 py-3`
- Row separator: `border-b border-slate-100`
- Highlighted rows: `bg-emerald-50 text-slate-700`

### Modals
- Overlay: `bg-black/50`
- Dialog: `rounded-xl bg-white border border-slate-200 shadow-lg max-w-lg w-full`
- Header: `px-6 py-4 border-b border-slate-100`
- Body: `px-6 py-4`
- Footer: `px-6 py-4 border-t border-slate-100 flex justify-end gap-3`

### Status Badges
- Success: `bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20`
- Warning: `bg-amber-50 text-amber-700 ring-1 ring-amber-600/20`
- Error: `bg-rose-50 text-rose-700 ring-1 ring-rose-600/20`
- Info: `bg-sky-50 text-sky-700 ring-1 ring-sky-600/20`

### Alerts View Tabs
- Tab bar: `border-b border-slate-200`
- Inactive tab: `text-slate-500 hover:text-slate-700`
- Active tab: `text-emerald-600 border-b-2 border-emerald-600 font-semibold`

## 8. Unchanged

- Vue 3 + Composition API architecture
- All composables and business logic
- API layer
- Monaco editor, ECharts, vue3-grid-layout-next
- Lucide icons (recolored to emerald where accent needed)
- All app functionality
- Auth flow and guards
- SEO metadata logic

## 9. Scrollbar & Selection

**Scrollbar (light theme content area):**
- Track: `bg-slate-100`
- Thumb: `bg-slate-300 rounded-full`
- Thumb hover: `bg-slate-400`

**Selection:** `bg-emerald-100 text-emerald-900`
