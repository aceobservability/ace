# Kinetic v2 Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Kinetic v2 design system across the Ace frontend — new primary color, display font, data viz palette, shadow/overlay tokens, sidebar layout tokens, and motion system.

**Architecture:** 5 atomic PRs in dependency order. PR #1 updates the core CSS tokens. PRs #2, #3, #5 can run in parallel after #1. PR #4 depends on #1 + #2. Each PR is independently revertable.

**Tech Stack:** Vue 3 + TypeScript, Tailwind CSS v4, ECharts (via vue-echarts), Monaco Editor, Vitest

**Spec:** `docs/superpowers/specs/2026-03-23-kinetic-v2-design-system-design.md`
**Design System:** `DESIGN.md`

---

## File Structure

| File | Responsibility | PR |
|------|---------------|-----|
| `frontend/src/style.css` | All CSS custom properties, font imports, animations | #1, #2, #3, #5 |
| `frontend/src/utils/chartTheme.ts` | **New** — central chart color/theme module | #2 |
| `frontend/src/components/AiInsightCard.vue` | Insight card type colors | #1 |
| `frontend/src/components/AiInsightCard.spec.ts` | Insight card color assertions | #1 |
| `frontend/src/views/HomeView.vue` | Hero gradient colors | #1 |
| `frontend/src/components/BarChart.vue` | Bar chart series + theme colors | #2 |
| `frontend/src/components/LineChart.vue` | Line chart series + theme colors | #2 |
| `frontend/src/components/PieChart.vue` | Pie chart series + theme colors | #2 |
| `frontend/src/components/GaugeChart.vue` | Gauge chart series + theme colors | #2 |
| `frontend/src/components/StatPanel.vue` | Stat panel default text color | #2 |
| `frontend/src/components/PieChart.spec.ts` | Pie chart palette assertions | #2 |
| `frontend/src/components/GaugeChart.spec.ts` | Gauge chart color assertions | #2 |
| `frontend/src/components/StatPanel.spec.ts` | Stat panel color assertion | #2 |
| `frontend/src/components/SidebarRail.vue` | Rail width + logo color | #3 |
| `frontend/src/components/SidebarFlyout.vue` | Flyout dimensions + shadow | #3 |
| `frontend/src/components/SidebarFlyout.spec.ts` | Flyout width assertion | #3 |
| `frontend/src/promql/language.ts` | Monaco editor color theme | #4 |

---

## Task 1: Update core CSS tokens in style.css (PR #1)

**Files:**
- Modify: `frontend/src/style.css:1-72`

- [ ] **Step 1: Replace Satoshi font import with Space Grotesk**

In `frontend/src/style.css`, replace line 4:
```css
/* OLD: */ @import url("https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700&display=swap");
/* NEW: */ @import url("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap");
```

- [ ] **Step 2: Update all `:root` color tokens**

In `frontend/src/style.css`, replace the entire `:root` block (lines 8-41) with:
```css
:root {
  /* Surface hierarchy */
  --color-surface:                    #0B0D0F;
  --color-surface-container-low:      #111417;
  --color-surface-container-high:     #171B1F;
  --color-surface-bright:             #1E2429;
  --color-surface-container-highest:  #1E2429;
  --color-surface-hover:              #283038;

  /* Primary (active nav, links, brand accent) */
  --color-primary:          #C9960F;
  --color-primary-dim:      #A67D0B;
  --color-primary-muted:    rgba(201,150,15,0.12);

  /* Secondary (healthy, success, progress) */
  --color-secondary:        #4FAF78;
  --color-secondary-dim:    #3D9062;

  /* Tertiary (warning, edit, labels) */
  --color-tertiary:         #D4A11E;
  --color-tertiary-dim:     #B8860B;

  /* Error (critical, destructive) */
  --color-error:            #D95C54;

  /* Info (informational, non-urgent) */
  --color-info:             #4D8BBD;

  /* On-surface text */
  --color-on-surface:         #F3F1EA;
  --color-on-surface-variant: #B8B2A7;
  --color-outline:            #8A847A;
  --color-outline-variant:    #3A444E;

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
}
```

- [ ] **Step 3: Update `@theme` block — font-display + new tokens**

In `frontend/src/style.css`, update the `@theme` block (lines 43-72):
- Change `--font-display` from `"Satoshi", "DM Sans", sans-serif` to `"Space Grotesk", "DM Sans", sans-serif`
- Add entries for new tokens: `--color-stroke-subtle`, `--color-stroke-strong`, `--shadow-sm` through `--shadow-focus`, `--overlay-scrim` through `--selected-fill`

- [ ] **Step 4: Update heading letter-spacing per DESIGN.md type scale**

In `frontend/src/style.css`, update the heading rules (lines 123-140):
- `h1`: change `letter-spacing: -0.02em` to `letter-spacing: -0.03em` (3xl scale)
- `h2`: keep `letter-spacing: -0.02em` (2xl scale — already correct)
- `h3`: keep `letter-spacing: -0.02em` (xl scale — already correct)

- [ ] **Step 5: Update `::selection` color**

In `frontend/src/style.css` line 83, change:
```css
/* OLD: */ color: #0C0D0F;
/* NEW: */ color: #0B0D0F;
```

- [ ] **Step 6: Run build and tests**

Run: `cd frontend && npm run build && npm run test`
Expected: Build passes. Tests may fail on AiInsightCard color assertions — that's expected and fixed in Task 2.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/style.css
git commit -m "feat(design): update core Kinetic v2 tokens — primary, surfaces, shadows, overlays"
```

---

## Task 2: Update components with hardcoded old colors (PR #1)

**Files:**
- Modify: `frontend/src/components/AiInsightCard.vue:11-14`
- Modify: `frontend/src/views/HomeView.vue:91`
- Modify: `frontend/src/components/AiInsightCard.spec.ts:30,41,51`

- [ ] **Step 1: Update AiInsightCard.vue color map**

In `frontend/src/components/AiInsightCard.vue`, replace lines 11-14:
```typescript
const colorMap = {
  anomaly: { border: '#C9960F', bg: 'rgba(201,150,15,0.05)' },
  optimization: { border: '#4D8BBD', bg: 'rgba(77,139,189,0.05)' },
  forecast: { border: '#D4A11E', bg: 'rgba(212,161,30,0.05)' },
}
```

- [ ] **Step 2: Update HomeView.vue radial gradient**

In `frontend/src/views/HomeView.vue`, on line 91 replace:
```
rgba(229,160,13,0.10), rgba(229,160,13,0.03)
```
with:
```
rgba(201,150,15,0.10), rgba(201,150,15,0.03)
```

- [ ] **Step 3: Update AiInsightCard.spec.ts assertions**

In `frontend/src/components/AiInsightCard.spec.ts`:
- Line 30: `'#E5A00D'` → `'#C9960F'`
- Line 41: `'#60A5FA'` → `'#4D8BBD'`
- Line 51: `'#F97316'` → `'#D4A11E'`

- [ ] **Step 4: Run tests to verify**

Run: `cd frontend && npm run test`
Expected: All tests pass.

- [ ] **Step 5: Lint and commit**

```bash
cd frontend && npm run lint:fix
git add frontend/src/components/AiInsightCard.vue frontend/src/components/AiInsightCard.spec.ts frontend/src/views/HomeView.vue
git commit -m "feat(design): update hardcoded colors in AiInsightCard and HomeView for Kinetic v2"
```

---

## Task 3: Create chartTheme.ts utility (PR #2)

**Files:**
- Create: `frontend/src/utils/chartTheme.ts`

- [ ] **Step 1: Add viz palette CSS variables to style.css**

In `frontend/src/style.css`, add inside the `:root` block (after the overlay tokens):
```css
/* Data visualization palette */
--color-viz-0: #4D8BBD;
--color-viz-1: #C65D3A;
--color-viz-2: #7A9E46;
--color-viz-3: #8B6FB3;
--color-viz-4: #D4A11E;
--color-viz-5: #3FA7A3;
--color-viz-6: #CB6F8A;
--color-viz-7: #A7B0BA;
--color-viz-8: #6C7C94;
--color-viz-9: #E07B39;
```

Also add these to the `@theme` block so Tailwind can use them.

- [ ] **Step 2: Create the chartTheme.ts file**

Create `frontend/src/utils/chartTheme.ts`:
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
  grid: 'rgba(42,49,56,0.3)',
  label: '#8A847A',
  text: '#B8B2A7',
  tooltipBg: '#1E2429',
  tooltipBorder: 'rgba(58,68,78,0.4)',
  surface: '#111417',
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

- [ ] **Step 3: Verify build**

Run: `cd frontend && npm run build`
Expected: Build passes with no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/style.css frontend/src/utils/chartTheme.ts
git commit -m "feat(design): add data viz palette tokens and chartTheme utility"
```

---

## Task 4: Update BarChart to use chartTheme (PR #2)

**Files:**
- Modify: `frontend/src/components/BarChart.vue:54-70`

- [ ] **Step 1: Add chartTheme import**

In `frontend/src/components/BarChart.vue`, add after the existing imports (after line 12):
```typescript
import { chartPalette, chartColors } from '@/utils/chartTheme'
```

- [ ] **Step 2: Remove hardcoded color declarations**

Remove lines 54-70 (the `gridColor`, `labelColor`, `textColor`, `tooltipBg`, `tooltipBorder`, and `barColors` declarations).

- [ ] **Step 3: Update all references in the computed options**

Throughout the `chartOption` computed property, replace:
- `gridColor` → `chartColors.grid`
- `labelColor` → `chartColors.label`
- `textColor` → `chartColors.text`
- `tooltipBg` → `chartColors.tooltipBg`
- `tooltipBorder` → `chartColors.tooltipBorder`
- `barColors[i % barColors.length]` → `chartPalette[i % chartPalette.length]`
- Any `'Space Grotesk, Inter, sans-serif'` → `chartColors.fontDisplay`

- [ ] **Step 4: Verify build**

Run: `cd frontend && npm run build`
Expected: Build passes.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/BarChart.vue
git commit -m "refactor(charts): use chartTheme in BarChart"
```

---

## Task 5: Update LineChart to use chartTheme (PR #2)

**Files:**
- Modify: `frontend/src/components/LineChart.vue:54-70`

- [ ] **Step 1: Same pattern as BarChart**

Apply identical changes to `frontend/src/components/LineChart.vue`:
1. Add `import { chartPalette, chartColors } from '@/utils/chartTheme'`
2. Remove lines 54-70 (hardcoded color declarations)
3. Replace all references: `gridColor` → `chartColors.grid`, `lineColors` → `chartPalette`, etc.
4. Replace any `'Space Grotesk, Inter, sans-serif'` → `chartColors.fontDisplay`

- [ ] **Step 2: Verify build**

Run: `cd frontend && npm run build`
Expected: Build passes.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/LineChart.vue
git commit -m "refactor(charts): use chartTheme in LineChart"
```

---

## Task 6: Update PieChart to use chartTheme (PR #2)

**Files:**
- Modify: `frontend/src/components/PieChart.vue:43-62,86`
- Modify: `frontend/src/components/PieChart.spec.ts` (palette color assertions)

- [ ] **Step 1: Update PieChart.vue**

In `frontend/src/components/PieChart.vue`:
1. Add `import { chartPalette, chartColors } from '@/utils/chartTheme'`
2. Remove lines 43-62 (hardcoded `labelColor`, `textColor`, `tooltipBg`, `tooltipBorder`, `surfaceLow`, `pieColors`)
3. Replace all references:
   - `labelColor` → `chartColors.label`
   - `textColor` → `chartColors.text`
   - `tooltipBg` → `chartColors.tooltipBg`
   - `tooltipBorder` → `chartColors.tooltipBorder`
   - `surfaceLow` → `chartColors.surface`
   - `pieColors` → `chartPalette`
4. Line 86: Replace `'Space Grotesk, Inter, sans-serif'` → `chartColors.fontDisplay`

- [ ] **Step 2: Update PieChart.spec.ts palette assertions**

Find assertions that check for old palette colors (`#a3a6ff`, `#69f6b8`, `#ffb148`) and update them to the new palette (`#4D8BBD`, `#C65D3A`, `#7A9E46`).

- [ ] **Step 3: Run tests**

Run: `cd frontend && npm run test -- --reporter verbose PieChart`
Expected: All PieChart tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/PieChart.vue frontend/src/components/PieChart.spec.ts
git commit -m "refactor(charts): use chartTheme in PieChart"
```

---

## Task 7: Update GaugeChart and StatPanel to use chartTheme (PR #2)

**Files:**
- Modify: `frontend/src/components/GaugeChart.vue:42-49`
- Modify: `frontend/src/components/StatPanel.vue:70,74`
- Modify: `frontend/src/components/GaugeChart.spec.ts`
- Modify: `frontend/src/components/StatPanel.spec.ts`

- [ ] **Step 1: Update GaugeChart.vue**

In `frontend/src/components/GaugeChart.vue`:
1. Add `import { chartPalette, chartColors } from '@/utils/chartTheme'`
2. Remove lines 42-49 (hardcoded `labelColor`, `tooltipBg`, `tooltipBorder`, `textColor`, `onSurface`, `gridLineColor`, `defaultGaugeColor`)
3. Replace references:
   - `labelColor` → `chartColors.label`
   - `tooltipBg` → `chartColors.tooltipBg`
   - `tooltipBorder` → `chartColors.tooltipBorder`
   - `textColor` → `chartColors.text`
   - `onSurface` → `'#F3F1EA'`
   - `gridLineColor` → `chartColors.grid`
   - `defaultGaugeColor` → `chartPalette[0]` (Steel Blue `#4D8BBD`)

- [ ] **Step 2: Update StatPanel.vue**

In `frontend/src/components/StatPanel.vue`:
- Line 70: `'#fdfbfe'` → `'#F3F1EA'`
- Line 74: `'#fdfbfe'` → `'#F3F1EA'`

- [ ] **Step 3: Update test assertions**

In `frontend/src/components/GaugeChart.spec.ts`: Update any assertions for `#69f6b8` → `#4D8BBD`.
In `frontend/src/components/StatPanel.spec.ts`: Update any assertions for `#fdfbfe` → `#F3F1EA`.

- [ ] **Step 4: Run tests**

Run: `cd frontend && npm run test`
Expected: All tests pass.

- [ ] **Step 5: Lint and commit**

```bash
cd frontend && npm run lint:fix
git add frontend/src/components/GaugeChart.vue frontend/src/components/GaugeChart.spec.ts frontend/src/components/StatPanel.vue frontend/src/components/StatPanel.spec.ts
git commit -m "refactor(charts): use chartTheme in GaugeChart and StatPanel"
```

---

## Task 8: Add sidebar layout tokens (PR #3)

**Files:**
- Modify: `frontend/src/style.css` (`:root` and `@theme`)
- Modify: `frontend/src/components/SidebarRail.vue:63,76`
- Modify: `frontend/src/components/SidebarFlyout.vue:91,92,96`
- Modify: `frontend/src/components/SidebarFlyout.spec.ts`

- [ ] **Step 1: Add layout tokens to style.css**

In `frontend/src/style.css`, add to `:root`:
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

Add these to the `@theme` block as well.

- [ ] **Step 2: Tokenize SidebarRail.vue**

In `frontend/src/components/SidebarRail.vue`:
- Line 63: `width: '52px'` → `width: 'var(--sidebar-rail-width)'`
- Line 76: `color: '#0C0D0F'` → `color: '#0B0D0F'`

- [ ] **Step 3: Tokenize SidebarFlyout.vue**

In `frontend/src/components/SidebarFlyout.vue`:
- Line 91: `left: '52px'` → `left: 'var(--sidebar-rail-width)'`
- Line 92: `width: '240px'` → `width: 'var(--sidebar-flyout-width)'`
- Line 96: `boxShadow: '8px 0 24px rgba(0,0,0,0.3)'` → `boxShadow: 'var(--shadow-lg)'`

- [ ] **Step 4: Update SidebarFlyout.spec.ts**

Update the width assertion that checks for `'240px'` — it will now contain `'var(--sidebar-flyout-width)'`.

- [ ] **Step 5: Run build and tests**

Run: `cd frontend && npm run build && npm run test`
Expected: Build and tests pass.

- [ ] **Step 6: Commit**

```bash
cd frontend && npm run lint:fix
git add frontend/src/style.css frontend/src/components/SidebarRail.vue frontend/src/components/SidebarFlyout.vue frontend/src/components/SidebarFlyout.spec.ts
git commit -m "refactor(layout): tokenize sidebar rail and flyout dimensions"
```

---

## Task 9: Update Monaco/PromQL theme (PR #4)

**Files:**
- Modify: `frontend/src/promql/language.ts:380-428`

- [ ] **Step 1: Update token rules**

In `frontend/src/promql/language.ts`, replace the `rules` array (lines 385-397):
```typescript
rules: [
  { token: 'comment', foreground: '8A847A', fontStyle: 'italic' },
  { token: 'string', foreground: 'D4A11E' },
  { token: 'string.escape', foreground: 'D4A11E' },
  { token: 'string.invalid', foreground: 'D95C54' },
  { token: 'number', foreground: '4D8BBD' },
  { token: 'number.duration', foreground: '4D8BBD', fontStyle: 'bold' },
  { token: 'operator', foreground: 'F3F1EA' },
  { token: 'keyword', foreground: '4D8BBD', fontStyle: 'bold' },
  { token: 'function', foreground: '4FAF78' },
  { token: 'identifier', foreground: 'B8B2A7' },
  { token: 'label', foreground: '3D9062' },
],
```

- [ ] **Step 2: Update editor colors**

Replace the `colors` object (lines 398-426):
```typescript
colors: {
  'editor.background': '#111417',
  'editor.foreground': '#F3F1EA',
  'editor.lineHighlightBackground': '#171B1F',
  'editor.lineHighlightBorder': '#171B1F',
  'editorCursor.foreground': '#C9960F',
  'editor.selectionBackground': '#171B1F',
  'editor.selectionHighlightBackground': '#171B1F',
  'editorLineNumber.foreground': '#8A847A',
  'editorLineNumber.activeForeground': '#B8B2A7',
  'editorGutter.background': '#111417',
  'editorWidget.background': '#1E2429',
  'editorWidget.border': '#3A444E',
  'editorSuggestWidget.background': '#1E2429',
  'editorSuggestWidget.border': '#3A444E',
  'editorSuggestWidget.selectedBackground': '#171B1F',
  'editorSuggestWidget.highlightForeground': '#C9960F',
  'editorSuggestWidget.focusHighlightForeground': '#C9960F',
  'editorHoverWidget.background': '#1E2429',
  'editorHoverWidget.border': '#3A444E',
  'scrollbarSlider.background': '#3A444E',
  'scrollbarSlider.hoverBackground': '#8A847A',
  'scrollbarSlider.activeBackground': '#B8B2A7',
  'input.background': '#171B1F',
  'input.border': '#3A444E',
  'input.foreground': '#F3F1EA',
  'inputOption.activeBorder': '#C9960F',
  focusBorder: '#C9960F',
},
```

- [ ] **Step 3: Update the comment above the function**

Line 380: Change `Stitch Kinetic` to `Kinetic v2`.

- [ ] **Step 4: Run build**

Run: `cd frontend && npm run build`
Expected: Build passes.

- [ ] **Step 5: Commit**

```bash
cd frontend && npm run lint:fix
git add frontend/src/promql/language.ts
git commit -m "feat(design): update Monaco/PromQL theme to Kinetic v2 palette"
```

---

## Task 10: Add motion system (PR #5)

**Files:**
- Modify: `frontend/src/style.css` (`:root`, `@layer utilities`, new keyframes)

- [ ] **Step 1: Add motion tokens to `:root`**

In `frontend/src/style.css`, add to `:root`:
```css
/* Motion tokens */
--motion-fast: 120ms;
--motion-base: 180ms;
--motion-slow: 240ms;
--ease-standard: cubic-bezier(0.2, 0.8, 0.2, 1);
--ease-exit: cubic-bezier(0.4, 0, 1, 1);
```

- [ ] **Step 2: Add new keyframes**

In `frontend/src/style.css`, add after the existing `@keyframes shimmer` block (after line 246):
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

- [ ] **Step 3: Add utility classes**

In `frontend/src/style.css`, add to the `@layer utilities` block (after `.animate-shimmer`):
```css
.animate-data-pulse {
  animation: data-pulse 300ms cubic-bezier(0.0, 0.0, 0.2, 1) forwards;
}
.animate-stagger-enter {
  animation: stagger-enter var(--motion-slow) var(--ease-standard) forwards;
}
```

- [ ] **Step 4: Run build**

Run: `cd frontend && npm run build`
Expected: Build passes.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/style.css
git commit -m "feat(design): add Kinetic v2 motion tokens, data-pulse, and stagger-enter animations"
```

---

## Verification

After all tasks are complete:

- [ ] Run full test suite: `cd frontend && npm run test`
- [ ] Run full build: `cd frontend && npm run build`
- [ ] Run linter: `cd frontend && npm run lint:fix`
- [ ] Visual check: start dev server (`npm run dev`), verify primary is burnished brass, headings use Space Grotesk, charts use mineral palette
