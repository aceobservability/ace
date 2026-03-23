# Design System — Ace "Kinetic v2"

## Product Context
- **What this is:** A Grafana-like monitoring dashboard for metrics, logs, traces, alerts, and AI insights
- **Who it's for:** DevOps/SRE teams and engineers who spend hours in dashboards daily
- **Space/industry:** Observability & monitoring (peers: Grafana, Datadog, Honeycomb, New Relic, SigNoz)
- **Project type:** Web application (dashboard / data-dense tool)

## Aesthetic Direction
- **Direction:** Industrial/Utilitarian with warmth — "Kinetic"
- **Decoration level:** Intentional — subtle surface differentiation through elevation, thin 1px borders only where semantically meaningful (table rows, input fields). No gratuitous gradients.
- **Mood:** Precision instrumentation software. Not cold and sterile like the competition — warm, precise, and alive. Color is earned, not scattered. Every colored element means something. Feels like oxidized metal, warning paint, and illuminated controls.
- **Competitive positioning:** Grafana and SigNoz converge on orange/amber. Datadog is purple. Ace uses burnished brass — deeper, more mineral, instantly recognizable. The data-pulse animation makes dashboards feel alive in a way no competitor achieves.

## Typography
- **Display/Hero:** Space Grotesk (500, 600, 700) — mechanical, engineered, sharper than category norm. Gives Ace an industrial face.
- **Body/UI:** DM Sans (400, 500, 600) — clean readability, supports tabular-nums for data alignment
- **UI/Labels:** DM Sans 500 — same as body, weight distinguishes
- **Data/Tables:** DM Sans (tabular-nums) for metrics, JetBrains Mono for raw values
- **Code:** JetBrains Mono (400, 500, 600) — ligatures for code, tabular figures for metrics
- **Loading:**
  - Space Grotesk: Google Fonts `family=Space+Grotesk:wght@400;500;600;700`
  - DM Sans: Google Fonts `family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400`
  - JetBrains Mono: Google Fonts `family=JetBrains+Mono:ital,wght@0,400;0,500;0,600;1,400`
- **Scale:**

| Token | Size/Line | Family | Weight | Tracking | Usage |
|-------|-----------|--------|--------|----------|-------|
| 4xl | 36/44 | display | 700 | -0.04em | Hero stats, page titles |
| 3xl | 28/36 | display | 700 | -0.03em | H1, section headings |
| 2xl | 22/30 | display | 600 | -0.02em | H2, dashboard titles |
| xl | 18/26 | display | 600 | -0.02em | H3, panel group headers |
| lg | 16/24 | body | 500 | 0 | Navigation items, prominent labels |
| md | 14/20 | body | 400 | 0 | Body text, standard UI |
| sm | 13/18 | body | 400 | 0 | Secondary text, table cells, form labels |
| xs | 12/16 | body | 400 | 0 | Captions, timestamps, metadata |
| micro | 11/14 | mono | 600 | +0.06em | Panel labels, section headers (uppercase) |
| code | 13/18 | mono | 400 | 0 | Inline code, PromQL, log lines |
| axis | 10/14 | mono | 400 | 0 | Chart axis labels, tooltip timestamps |

- **Tracking rules:**
  - Display headings: `-0.02em` to `-0.04em` (tighter at larger sizes)
  - Body text: `0` (no adjustment)
  - All-caps labels (micro token): `+0.06em`
  - Numeric-heavy content: always use `font-variant-numeric: tabular-nums`

## Color

### Approach: Restrained
A warm palette where neutrals do the heavy lifting. Color is rare and meaningful — when it appears, it signals something. This makes alerts and status indicators pop because they aren't competing with a colorful UI.

### Dark Theme (primary)
- **Primary:** `#C9960F` (burnished brass) — active nav, links, focus states, brand accent
- **Primary dim:** `#A67D0B` — hover states, gradient endpoints
- **Primary muted:** `rgba(201,150,15,0.12)` — subtle backgrounds, selected states
- **Secondary:** `#4FAF78` (muted emerald) — healthy, success, uptime
- **Secondary dim:** `#3D9062`
- **Tertiary:** `#D4A11E` (signal gold) — warning, caution, degraded
- **Error:** `#D95C54` — critical alerts, destructive actions
- **Info:** `#4D8BBD` (steel blue) — informational, non-urgent

### Surfaces (dark)
| Token | Hex | Usage |
|-------|-----|-------|
| surface | `#0B0D0F` | Page canvas |
| surface-card | `#111417` | Cards, panels, sidebar rail |
| surface-elevated | `#171B1F` | Hover states, active surfaces |
| surface-bright | `#1E2429` | Modals, command bar, dropdowns |
| surface-hover | `#283038` | Interactive hover on elevated |

### Text (dark)
| Token | Hex | Usage |
|-------|-----|-------|
| text-primary | `#F3F1EA` | Primary content (warm white) |
| text-secondary | `#B8B2A7` | Secondary text, descriptions |
| text-muted | `#8A847A` | Placeholders, disabled labels, micro labels |
| text-disabled | `#4A4A48` | Fully disabled states |

### Borders (dark)
| Token | Value | Usage |
|-------|-------|-------|
| stroke-subtle | `#2A3138` | Subtle dividers, card borders |
| stroke-strong | `#3A444E` | Input borders, table rows, interactive borders |

### Shadows & Overlays
| Token | Value | Usage |
|-------|-------|-------|
| shadow-sm | `0 1px 3px rgba(0,0,0,0.24), 0 1px 2px rgba(0,0,0,0.16)` | Tooltips, dropdown menus |
| shadow-md | `0 4px 12px rgba(0,0,0,0.32), 0 2px 4px rgba(0,0,0,0.20)` | Cards on hover, popovers |
| shadow-lg | `0 8px 24px rgba(0,0,0,0.40), 0 4px 8px rgba(0,0,0,0.24)` | Flyout panel, command palette |
| shadow-xl | `0 16px 48px rgba(0,0,0,0.48), 0 8px 16px rgba(0,0,0,0.28)` | Modals |
| shadow-glow | `0 0 20px rgba(201,150,15,0.15)` | Brass-tinted glow for active/focus |
| shadow-focus | `0 0 0 1px rgba(201,150,15,0.55), 0 0 0 4px rgba(201,150,15,0.16)` | Focus ring |

| Token | Value | Usage |
|-------|-------|-------|
| overlay-scrim | `rgba(8,10,12,0.72)` | Modal backdrop |
| overlay-hover | `rgba(255,255,255,0.04)` | Universal hover overlay |
| overlay-press | `rgba(255,255,255,0.08)` | Active/pressed state |
| overlay-focus | `rgba(201,150,15,0.16)` | Focus ring background |
| selected-fill | `rgba(201,150,15,0.14)` | Selected row/item background |

### Light Theme
- **Primary:** `#A67D0B` — deeper brass for contrast on white
- **Surfaces:** `#F4F3F0` canvas, `#FFFFFF` cards, `#EEEDEA` elevated, `#E5E4E0` bright
- **Text:** `#1A1A19` primary, `#57574F` secondary, `#8C8C85` muted
- **Semantic colors:** Desaturated ~10-15% from dark theme equivalents
- **Error:** `#C4423A`, **Secondary:** `#3D9062`, **Info:** `#3A72A0`
- **Strategy:** Reduce saturation, darken accents for WCAG contrast on light backgrounds

### Data Visualization Palette
Brand and data colors are separate systems. Never use the brand brass as the default chart series color.

| Index | Name | Hex | Usage Intent |
|-------|------|-----|--------------|
| 0 | Steel Blue | `#4D8BBD` | Default series 1 |
| 1 | Rust Orange | `#C65D3A` | Series 2 |
| 2 | Machine Olive | `#7A9E46` | Series 3 |
| 3 | Muted Violet | `#8B6FB3` | Series 4 |
| 4 | Signal Brass | `#D4A11E` | Emphasis, thresholds, highlighted comparisons |
| 5 | Oxidized Teal | `#3FA7A3` | Series 6 |
| 6 | Dusty Rose | `#CB6F8A` | Series 7 |
| 7 | Alloy Silver | `#A7B0BA` | Supporting/secondary series |
| 8 | Slate Blue-Grey | `#6C7C94` | Supporting/secondary series |
| 9 | Heated Copper | `#E07B39` | Series 10 |

**Rules:**
- Series 1 always defaults to Steel Blue `#4D8BBD`, not the brand color
- Reserve Signal Brass `#D4A11E` for emphasis, thresholds, or highlighted comparisons
- Never place two warm-orange family colors adjacent in the assignment order
- Alloy Silver and Slate Blue-Grey are supporting series, not hero lines
- Implement as CSS custom properties `--color-viz-0` through `--color-viz-9`
- Export from a single `chartPalette` array in `frontend/src/utils/chartTheme.ts`

**Threshold colors:**
- Good: `#4FAF78` (same as success)
- Warning: `#D4A11E` (same as tertiary)
- Critical: `#D95C54` (same as error)

### Selection Color
- Background: `var(--primary)` / `#C9960F`
- Text: `#0B0D0F`

## Spacing
- **Base unit:** 4px
- **Density:** Comfortable — data-dense but breathable
- **Scale:** 2xs(2px) xs(4px) sm(8px) md(12px) lg(16px) xl(20px) 2xl(24px) 3xl(32px) 4xl(40px) 5xl(48px)
- **Discipline:** Only use values from the scale. No ad-hoc 14px, 18px, 22px values.

## Layout
- **Approach:** Grid-disciplined
- **Grid:** 12 columns, 16px gutter
- **Breakpoints:** sm(640px) md(768px) lg(1024px) xl(1280px) 2xl(1536px)
- **Max content width:** 1536px (dashboards: fluid, no max)
- **Border radius:** sm(4px) md(8px) lg(12px) full(9999px) — sharp, not bubbly

### Sidebar (icon rail + flyout)
| Token | Value | Usage |
|-------|-------|-------|
| sidebar-rail-width | `52px` | Icon rail, always visible |
| sidebar-flyout-width | `240px` | Flyout panel, overlays content |
| sidebar-total-width | `292px` | Rail + flyout when both open |
| content-inset-left | `52px` | Main content left margin (rail only — flyout overlays, does not push) |

### Control Heights
| Token | Value | Usage |
|-------|-------|-------|
| control-sm | `28px` | Small buttons, compact inputs, badges |
| control-md | `36px` | Standard buttons, inputs, selects |
| control-lg | `44px` | Large buttons, prominent CTAs |

### Panel Chrome
| Token | Value | Usage |
|-------|-------|-------|
| panel-padding | `16px` | Standard panel body padding |
| dense-panel-padding | `12px` | Compact panel body padding |
| page-padding | `20px` | Page-level horizontal padding |
| section-gap | `24px` | Gap between major sections |
| grid-gutter | `16px` | Dashboard grid gutter |

## Motion
- **Approach:** Functional + one signature move — motion explains system state, preserves orientation, and makes streaming updates feel intentional
- **Tokens:**

| Token | Value | Usage |
|-------|-------|-------|
| motion-fast | `120ms` | Micro-interactions, hover states |
| motion-base | `180ms` | Standard transitions, flyout expand |
| motion-slow | `240ms` | Larger transitions, panel entrance |
| ease-standard | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Most enter/move transitions |
| ease-exit | `cubic-bezier(0.4, 0, 1, 1)` | Exit transitions |

- **Patterns:**
  - State changes (hover, focus, active): `120ms ease-standard`
  - Shell: flyout expand `180ms ease-standard`, content stagger `20ms/item` (max 120ms)
  - Panel enter on dashboard load: fade + translateY(8px), `200ms ease-standard`, stagger `30ms/panel` (caps at 300ms)
  - Modal/dropdown enter: `180ms ease-standard`
  - Modal/dropdown exit: `120ms ease-exit`
  - Metric number updates: crossfade over `160ms`
  - Chart refresh: preserve axes, animate series transitions — never hard redraw

### Signature: Data Pulse
When data refreshes (auto-refresh fires, new metric arrives), the panel border briefly flashes in brass at 40% opacity, then fades in 300ms. Like a heartbeat monitor blip.

```css
@keyframes data-pulse {
  0%   { box-shadow: inset 0 0 0 1px rgba(201,150,15,0.4); }
  100% { box-shadow: inset 0 0 0 1px rgba(201,150,15,0); }
}
.animate-data-pulse {
  animation: data-pulse 300ms cubic-bezier(0.0, 0.0, 0.2, 1) forwards;
}
```

- **Principles:**
  - Live data changes must animate continuity, not novelty. If values update and the UI jumps, the product feels cheap.
  - Critical alerts pulse border/background once, then stop. Never use infinite breathing animations on dashboards.
  - Skeleton shimmer should be restrained and directional, not glossy.
  - No decorative animation — this is a work tool.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-22 | Initial "Kinetic" design system | Competitive research showed monitoring tools converge on cold dark + purple/blue. Warm amber primary + restrained color philosophy creates instant brand recognition and reduces eye fatigue. |
| 2026-03-22 | Satoshi for display typography | 99% of monitoring tools use Inter, Roboto, or system fonts. Satoshi is geometric and modern — gives Ace a distinctive face without sacrificing readability. |
| 2026-03-22 | Restrained color philosophy | Most dashboards splash color everywhere. Treating color as scarce makes status indicators and alerts command attention. |
| 2026-03-23 | Primary shifted to burnished brass #C9960F | SigNoz uses nearly identical amber/orange accent. Deepened to burnished brass — more mineral, more premium, separates from category. 3-voice design consultation (Codex + Claude subagent + primary). |
| 2026-03-23 | Space Grotesk replaces Satoshi for display | More mechanical and engineered feel that fits the industrial aesthetic tighter. Codex recommended, user confirmed. |
| 2026-03-23 | Surfaces deepened toward blue-black | Cooler surfaces create better contrast with the warm brass primary. Surfaces shift from warm-neutral to cool-neutral. |
| 2026-03-23 | Mineral/industrial data viz palette added | 50+ hardcoded chart colors found in audit. 10-color "mineral" palette (Steel Blue default, brand brass reserved for emphasis) replaces ad-hoc values. Separate brand from data. |
| 2026-03-23 | Shadow & overlay token layer added | No shadow tokens existed — shadows were ad-hoc rgba values across components. Brass-tinted focus glow ring is the indie move that makes Ace feel alive. |
| 2026-03-23 | Sidebar layout tokens formalized | Icon rail (52px) + flyout (240px) pattern shipped in PR #126 but had no design tokens. Now formalized with control heights and panel chrome tokens. |
| 2026-03-23 | Data-pulse signature animation | No competitor does live-data border flash. Single-frame brass border pulse on data refresh (300ms) makes dashboards feel alive. Zero perf cost (hardware-accelerated box-shadow). |
