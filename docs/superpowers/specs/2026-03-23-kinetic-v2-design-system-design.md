# Kinetic v2 Design System Implementation

## Summary

Implement the Kinetic v2 design system updates across the Ace frontend. The design is defined in `DESIGN.md` (updated 2026-03-23). This spec covers the implementation plan: which files change, in what order, and how the work is structured into 5 atomic PRs.

## Motivation

A design audit revealed:
- SigNoz uses nearly identical amber/orange accent to Ace's `#E5A00D`
- 50+ hardcoded hex colors in chart components with no defined data visualization palette
- No shadow/overlay design tokens (ad-hoc rgba values scattered across components)
- Sidebar layout dimensions hardcoded instead of tokenized
- No formal motion token system

Kinetic v2 addresses all of these with: a shifted burnished brass primary (`#C9960F`), Space Grotesk display font, 10-color mineral data viz palette, shadow/overlay/stroke token layers, sidebar layout tokens, and a motion system with a signature data-pulse animation.

## Scope

- **16 files** across frontend/src
- **5 atomic PRs** in dependency order
- **No backend changes**
- **No new dependencies** (Space Grotesk is on Google Fonts, same CDN as DM Sans)

## Non-Goals

- Light theme full implementation (token values defined in DESIGN.md but CSS implementation deferred)
- TraceTimeline.vue / TraceServiceGraph.vue color cleanup (complex service color mapping, separate effort)
- Replacing CSS vars with Tailwind classes in components (existing hybrid approach is fine per CLAUDE.md)

---

## PR #1: Core Design Tokens

**Branch:** `kinetic-v2/core-tokens`

### Files Changed

| File | Changes |
|------|---------|
| `frontend/src/style.css` | Font imports, all `:root` tokens, `@theme` declarations, heading styles, selection color |
| `frontend/src/components/AiInsightCard.vue` | Hardcoded color values for card types |
| `frontend/src/views/HomeView.vue` | Radial gradient rgba values |
| `frontend/src/components/AiInsightCard.spec.ts` | Color assertion updates |

### Detailed Changes

**style.css — Font swap:**
- Remove: `@import url("https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700&display=swap")`
- Add: `@import url("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap")`
- Update `@theme` block: `--font-display: "Space Grotesk", "DM Sans", sans-serif;`

**style.css — Color tokens (`:root`):**

| Token | Old | New |
|-------|-----|-----|
| `--color-surface` | `#0C0D0F` | `#0B0D0F` |
| `--color-surface-container-low` | `#141518` | `#111417` |
| `--color-surface-container-high` | `#1C1E22` | `#171B1F` |
| `--color-surface-bright` | `#252830` | `#1E2429` |
| `--color-surface-container-highest` | `#242629` | `#1E2429` (alias surface-bright) |
| `--color-surface-hover` | `#2E3138` | `#283038` |
| `--color-primary` | `#E5A00D` | `#C9960F` |
| `--color-primary-dim` | `#B8800A` | `#A67D0B` |
| `--color-primary-muted` | `rgba(229,160,13,0.12)` | `rgba(201,150,15,0.12)` |
| `--color-secondary` | `#34D399` | `#4FAF78` |
| `--color-secondary-dim` | `#2AB880` | `#3D9062` |
| `--color-tertiary` | `#F97316` | `#D4A11E` |
| `--color-tertiary-dim` | `#e79400` | `#B8860B` |
| `--color-error` | `#EF4444` | `#D95C54` |
| `--color-info` | `#60A5FA` | `#4D8BBD` |
| `--color-on-surface` | `#F5F5F4` | `#F3F1EA` |
| `--color-on-surface-variant` | `#A8A8A4` | `#B8B2A7` |
| `--color-outline` | `#757578` | `#8A847A` |
| `--color-outline-variant` | `#47484a` | `#3A444E` |

**style.css — New tokens added to `:root`:**
```css
/* Stroke tokens */
--color-stroke-subtle: #2A3138;
--color-stroke-strong: #3A444E;

/* Shadows */
--shadow-sm: 0 1px 3px rgba(0,0,0,0.24), 0 1px 2px rgba(0,0,0,0.16);
--shadow-md: 0 4px 12px rgba(0,0,0,0.32), 0 2px 4px rgba(0,0,0,0.20);
--shadow-lg: 0 8px 24px rgba(0,0,0,0.40), 0 4px 8px rgba(0,0,0,0.24);
--shadow-xl: 0 16px 48px rgba(0,0,0,0.48), 0 8px 16px rgba(0,0,0,0.28);
--shadow-glow: 0 0 20px rgba(201,150,15,0.15);
--shadow-focus: 0 0 0 1px rgba(201,150,15,0.55), 0 0 0 4px rgba(201,150,15,0.16);

/* Overlays */
--overlay-scrim: rgba(8,10,12,0.72);
--overlay-hover: rgba(255,255,255,0.04);
--overlay-press: rgba(255,255,255,0.08);
--overlay-focus: rgba(201,150,15,0.16);
--selected-fill: rgba(201,150,15,0.14);
```

**style.css — `@theme` block:** Add new tokens to expose them as Tailwind utilities.

**style.css — Heading styles:** Update letter-spacing values per DESIGN.md type scale.

**style.css — Selection:** Update `::selection` text color from `#0C0D0F` to `#0B0D0F`.

**AiInsightCard.vue:**
- `#E5A00D` → `#C9960F` (anomaly card border)
- `rgba(229,160,13,0.05)` → `rgba(201,150,15,0.05)` (anomaly card bg)
- `#60A5FA` → `#4D8BBD` (optimization card border)
- `#F97316` → `#D4A11E` (forecast card border)
- Update corresponding rgba backgrounds

**HomeView.vue:**
- `rgba(229,160,13,0.10)` → `rgba(201,150,15,0.10)`
- `rgba(229,160,13,0.03)` → `rgba(201,150,15,0.03)`

**AiInsightCard.spec.ts:**
- Update all color assertions to match new values

### Verification
- `npm run build` passes
- `npm run test` passes
- Visual check: app loads, primary accent is brass, headings use Space Grotesk

---

## PR #2: Data Visualization System

**Branch:** `kinetic-v2/data-viz-palette`
**Depends on:** PR #1 (core tokens)

### Files Changed

| File | Changes |
|------|---------|
| `frontend/src/style.css` | Add `--color-viz-0` through `--color-viz-9` |
| `frontend/src/utils/chartTheme.ts` | **New file** — central chart theming module |
| `frontend/src/components/BarChart.vue` | Replace hardcoded colors with chartTheme imports |
| `frontend/src/components/LineChart.vue` | Same |
| `frontend/src/components/PieChart.vue` | Same |
| `frontend/src/components/GaugeChart.vue` | Same + fix #121316 bug |
| `frontend/src/components/StatPanel.vue` | Replace hardcoded #fdfbfe |
| `frontend/src/components/PieChart.spec.ts` | Update palette assertions |
| `frontend/src/components/GaugeChart.spec.ts` | Update #69f6b8 color assertions |
| `frontend/src/components/StatPanel.spec.ts` | Update #fdfbfe color assertion |

### New File: `frontend/src/utils/chartTheme.ts`

```typescript
export const chartPalette = [
  '#4D8BBD', // Steel Blue (viz-0, default series 1)
  '#C65D3A', // Rust Orange
  '#7A9E46', // Machine Olive
  '#8B6FB3', // Muted Violet
  '#D4A11E', // Signal Brass (emphasis/thresholds)
  '#3FA7A3', // Oxidized Teal
  '#CB6F8A', // Dusty Rose
  '#A7B0BA', // Alloy Silver
  '#6C7C94', // Slate Blue-Grey
  '#E07B39', // Heated Copper
] as const

export function getSeriesColor(index: number): string {
  return chartPalette[index % chartPalette.length]
}

export const chartColors = {
  grid: 'rgba(42,49,56,0.3)',       // stroke-subtle at 30%
  label: '#8A847A',                  // text-muted
  text: '#B8B2A7',                   // text-secondary
  tooltipBg: '#1E2429',             // surface-bright
  tooltipBorder: 'rgba(58,68,78,0.4)', // stroke-strong at 40%
  surface: '#111417',                // surface-card
  fontDisplay: 'Space Grotesk, DM Sans, sans-serif',
  fontBody: 'DM Sans, sans-serif',
  fontMono: 'JetBrains Mono, monospace',
} as const

export const thresholdColors = {
  good: '#4FAF78',
  warning: '#D4A11E',
  critical: '#D95C54',
} as const
```

### Chart Component Changes (BarChart, LineChart, PieChart, GaugeChart)

Each chart component:
1. Remove local color array declarations (`barColors`, `lineColors`, `pieColors`)
2. Remove local theme variable declarations (`gridColor`, `labelColor`, `textColor`, `tooltipBg`, `tooltipBorder`)
3. Add import: `import { chartPalette, getSeriesColor, chartColors } from '@/utils/chartTheme'`
4. Use `chartPalette` / `getSeriesColor(i)` for series colors
5. Use `chartColors.*` for grid/label/tooltip theming
6. Use `chartColors.fontDisplay` for title font-family

### GaugeChart.vue Specific
- Fix `#121316` → `chartColors.surface` (`#111417`)
- Replace `#69f6b8` default gauge color → `chartPalette[0]` (`#4D8BBD`)

### StatPanel.vue
- Replace `#fdfbfe` → `#F3F1EA` (text-primary from new tokens)

### Verification
- `npm run build` passes
- `npm run test` passes
- Visual check: charts render with new mineral palette, tooltips match surface hierarchy

---

## PR #3: Sidebar Layout Tokens

**Branch:** `kinetic-v2/sidebar-layout-tokens`
**Depends on:** PR #1 (uses shadow tokens)

### Files Changed

| File | Changes |
|------|---------|
| `frontend/src/style.css` | Add layout custom properties |
| `frontend/src/components/SidebarRail.vue` | Tokenize dimensions, update surface color |
| `frontend/src/components/SidebarFlyout.vue` | Tokenize dimensions, use shadow token |
| `frontend/src/components/SidebarFlyout.spec.ts` | Update width assertion (now resolves to CSS var) |

### style.css Additions

Add to `:root`:
```css
/* Layout tokens */
--sidebar-rail-width: 52px;
--sidebar-flyout-width: 240px;
--content-inset-left: 52px;
--control-height-sm: 28px;
--control-height-md: 36px;
--control-height-lg: 44px;
--panel-padding: 16px;
--dense-panel-padding: 12px;
--page-padding: 20px;
--section-gap: 24px;
```

Expose in `@theme` block.

### SidebarRail.vue
- `width: '52px'` → `width: 'var(--sidebar-rail-width)'`
- `#0C0D0F` in logo gradient → `#0B0D0F`

### SidebarFlyout.vue
- `left: '52px'` → `left: 'var(--sidebar-rail-width)'`
- `width: '240px'` → `width: 'var(--sidebar-flyout-width)'`
- `boxShadow: '8px 0 24px rgba(0,0,0,0.3)'` → `boxShadow: 'var(--shadow-lg)'`

### Verification
- `npm run build` passes
- Visual check: sidebar rail and flyout render identically (values unchanged, just tokenized)

---

## PR #4: Monaco/PromQL Theme

**Branch:** `kinetic-v2/monaco-theme`
**Depends on:** PR #1 (new token values), PR #2 (viz palette)

### Files Changed

| File | Changes |
|------|---------|
| `frontend/src/promql/language.ts` | Full Monaco color theme update |

### Color Mapping

| Monaco Token | Old | New | Design Token |
|-------------|-----|-----|-------------|
| editor.background | `#121316` | `#111417` | surface-card |
| comment | `#757578` | `#8A847A` | text-muted |
| string | `#ffb148` | `#D4A11E` | tertiary |
| string.invalid | `#ff6e84` | `#D95C54` | error |
| number | `#a3a6ff` | `#4D8BBD` | viz-0 |
| keyword | `#a3a6ff` | `#4D8BBD` | viz-0 |
| function | `#69f6b8` | `#4FAF78` | secondary |
| identifier | `#ababad` | `#B8B2A7` | text-secondary |
| label | `#58e7ab` | `#3D9062` | secondary-dim |
| editorCursor.foreground | `#a3a6ff` | `#C9960F` | primary |
| editorWidget.background | `#2b2c2f` | `#1E2429` | surface-bright |
| editorWidget.border | `#47484a` | `#3A444E` | stroke-strong |
| editorSuggestWidget highlight | `#a3a6ff` | `#C9960F` | primary |
| scrollbarSlider.* | various | mapped to stroke/text-muted | |
| input.background | `#1e2022` | `#171B1F` | surface-elevated |
| focusBorder | `#a3a6ff` | `#C9960F` | primary |

### Verification
- Visual check: PromQL editor colors align with Kinetic v2, cursor is brass

---

## PR #5: Motion System

**Branch:** `kinetic-v2/motion-system`
**Depends on:** PR #1 (primary color for glow)

### Files Changed

| File | Changes |
|------|---------|
| `frontend/src/style.css` | Motion tokens, new keyframes, utility classes |

### style.css Additions

**Motion tokens (`:root`):**
```css
--motion-fast: 120ms;
--motion-base: 180ms;
--motion-slow: 240ms;
--ease-standard: cubic-bezier(0.2, 0.8, 0.2, 1);
--ease-exit: cubic-bezier(0.4, 0, 1, 1);
```

**New keyframes:**
```css
@keyframes data-pulse {
  0%   { box-shadow: inset 0 0 0 1px rgba(201,150,15,0.4); }
  100% { box-shadow: inset 0 0 0 1px rgba(201,150,15,0); }
}

@keyframes stagger-enter {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

**New utility classes:**
```css
.animate-data-pulse {
  animation: data-pulse 300ms cubic-bezier(0.0, 0.0, 0.2, 1) forwards;
}
.animate-stagger-enter {
  animation: stagger-enter var(--motion-slow) var(--ease-standard) forwards;
}
```

### Verification
- `npm run build` passes
- Utility classes available in Tailwind (via `@layer utilities`)

---

## Dependency Graph

```
PR #1 (Core Tokens)
  ├── PR #2 (Data Viz) ──┐
  ├── PR #3 (Sidebar)     ├── PR #4 (Monaco) depends on #1 + #2
  └── PR #5 (Motion)     ─┘
```

PRs #2, #3, and #5 can be developed in parallel after PR #1 merges. PR #4 depends on both #1 and #2.

## Testing Strategy

Each PR runs:
1. `npm run build` — TypeScript + Vite build passes
2. `npm run test` — Vitest suite passes (with updated assertions)
3. `npm run lint:fix` — Biome linting clean
4. Visual verification of affected areas

No new test files are needed. Existing tests are updated to match new color values.

## Rollback Plan

Each PR is independently revertable. If a color causes accessibility issues or visual regression, revert that specific PR without affecting others.
