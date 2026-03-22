# Design System — Ace "Kinetic"

## Product Context
- **What this is:** A Grafana-like monitoring dashboard for metrics, logs, traces, alerts, and AI insights
- **Who it's for:** DevOps/SRE teams and engineers who spend hours in dashboards daily
- **Space/industry:** Observability & monitoring (peers: Grafana, Datadog, Honeycomb, New Relic, SigNoz)
- **Project type:** Web application (dashboard / data-dense tool)

## Aesthetic Direction
- **Direction:** Industrial/Utilitarian with warmth — "Kinetic"
- **Decoration level:** Intentional — subtle surface differentiation through elevation, thin 1px borders only where semantically meaningful (table rows, input fields). No gratuitous gradients.
- **Mood:** A modern mission control center. Not cold and sterile like the competition — warm, precise, and alive. Color is earned, not scattered. Every colored element means something.
- **Competitive positioning:** Most monitoring tools converge on cold blue-black + purple/blue primary. Ace uses warm neutrals and an amber primary — instantly recognizable, reduces eye fatigue for long sessions.

## Typography
- **Display/Hero:** Satoshi (600, 700) — geometric, modern, distinctive without being distracting. Gives Ace a face that 99% of monitoring tools lack.
- **Body/UI:** DM Sans (400, 500) — clean readability, supports tabular-nums for data alignment
- **UI/Labels:** DM Sans 500 — same as body, weight distinguishes
- **Data/Tables:** DM Sans (tabular-nums) for metrics, JetBrains Mono for raw values
- **Code:** JetBrains Mono (400, 600) — ligatures for code, tabular figures for metrics
- **Loading:**
  - Satoshi: `https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700&display=swap`
  - DM Sans: Google Fonts `family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400`
  - JetBrains Mono: Google Fonts `family=JetBrains+Mono:ital,wght@0,400;0,600;1,400`
- **Scale:**
  - Display: 48px / font-display / 700 / -0.04em
  - H1: 28px / font-display / 700 / -0.03em
  - H2: 20px / font-display / 600 / -0.02em
  - H3: 16px / font-display / 600 / -0.01em
  - Body: 14px / font-body / 400
  - Caption: 12px / font-body / 400
  - Mono: 13px / font-mono / 400
  - Micro: 11px / font-mono / 600 (labels, section headers)

## Color

### Approach: Restrained
A warm palette where neutrals do the heavy lifting. Color is rare and meaningful — when it appears, it signals something. This makes alerts and status indicators pop because they aren't competing with a colorful UI.

### Dark Theme (primary)
- **Primary:** `#E5A00D` (amber/gold) — active nav, links, focus states, brand accent
- **Primary dim:** `#B8800A` — hover states, gradient endpoints
- **Primary muted:** `rgba(229,160,13,0.12)` — subtle backgrounds
- **Secondary:** `#34D399` (emerald) — healthy, success, uptime
- **Secondary dim:** `#2AB880`
- **Tertiary:** `#F97316` (warm orange) — warning, caution, degraded
- **Error:** `#EF4444` — critical alerts, destructive actions
- **Info:** `#60A5FA` (muted blue) — informational, non-urgent

### Surfaces (dark)
| Token | Hex | Usage |
|-------|-----|-------|
| surface | `#0C0D0F` | Page canvas |
| surface-card | `#141518` | Cards, panels, sidebar |
| surface-elevated | `#1C1E22` | Hover, active states |
| surface-bright | `#252830` | Modals, command bar, dropdowns |
| surface-hover | `#2E3138` | Interactive hover on elevated |

### Text (dark)
| Token | Hex | Usage |
|-------|-----|-------|
| text-primary | `#F5F5F4` | Primary content (warm white) |
| text-secondary | `#A8A8A4` | Secondary text, descriptions |
| text-tertiary | `#6B6B68` | Placeholders, disabled labels |
| text-disabled | `#4A4A48` | Fully disabled states |

### Borders (dark)
- **border:** `rgba(255,255,255,0.06)` — subtle dividers
- **border-strong:** `rgba(255,255,255,0.12)` — input borders, table rows

### Light Theme
- **Primary:** `#C28A00` — slightly deeper amber for contrast on white
- **Surfaces:** `#F8F8F6` canvas, `#FFFFFF` cards, `#F0F0EE` elevated
- **Text:** `#1A1A19` primary, `#57574F` secondary, `#8C8C85` tertiary
- **Semantic colors:** Desaturated ~10-15% from dark theme equivalents
- **Strategy:** Reduce saturation, darken accents for WCAG contrast on light backgrounds

## Spacing
- **Base unit:** 4px
- **Density:** Comfortable — data-dense but breathable
- **Scale:** 2xs(2px) xs(4px) sm(8px) md(16px) lg(24px) xl(32px) 2xl(48px) 3xl(64px)

## Layout
- **Approach:** Grid-disciplined
- **Grid:** 12 columns, 16px gutter
- **Breakpoints:** sm(640px) md(768px) lg(1024px) xl(1280px) 2xl(1536px)
- **Max content width:** 1536px
- **Sidebar:** 200px collapsed, fixed
- **Border radius:** sm(4px) md(8px) lg(12px) full(9999px) — sharp, not bubbly

## Motion
- **Approach:** Intentional — micro-transitions on state changes, no scroll-driven choreography
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out)
- **Duration:** micro(50-100ms) short(150-250ms) medium(250-400ms) long(400-700ms)
- **Principles:**
  - State changes (hover, focus, active): 150ms ease-out
  - Data update pulses: 250ms ease-out
  - Modal/dropdown enter: 200ms ease-out
  - Modal/dropdown exit: 150ms ease-in
  - No decorative animation — this is a work tool

## Selection Color
- Background: `var(--primary)` / `#E5A00D`
- Text: `#0C0D0F`

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-22 | Initial "Kinetic" design system | Competitive research showed monitoring tools converge on cold dark + purple/blue. Warm amber primary + restrained color philosophy creates instant brand recognition and reduces eye fatigue. |
| 2026-03-22 | Satoshi for display typography | 99% of monitoring tools use Inter, Roboto, or system fonts. Satoshi is geometric and modern — gives Ace a distinctive face without sacrificing readability. |
| 2026-03-22 | Restrained color philosophy | Most dashboards splash color everywhere. Treating color as scarce makes status indicators and alerts command attention. |
