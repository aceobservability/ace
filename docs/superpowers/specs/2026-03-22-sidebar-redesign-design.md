# Sidebar Redesign — Icon Rail + Flyout

## Summary

Replace the current 240px collapsible sidebar with a 52px icon rail that is always visible, plus a 240px flyout panel that appears on hover (peek) or click (pin). Migrate all visual tokens from the "Deep Space" palette to the "Kinetic" design system defined in DESIGN.md.

## Motivation

The current sidebar is a binary show/hide — either it takes 240px of space or it's completely gone with only a hamburger button to bring it back. This wastes space when open and loses navigation affordance when closed. The icon rail pattern keeps navigation always accessible while reclaiming ~190px of content width. The flyout adds contextual features (search, favorites, recents) that the current flat nav list doesn't support.

Additionally, the CSS tokens in `style.css` still use the old "Deep Space" palette and need to be migrated to match the Kinetic design system.

## Structure & Layout

### Icon Rail (always visible)

| Property | Value |
|----------|-------|
| Width | 52px, fixed left, full viewport height |
| Background | `--color-surface` (#0C0D0F) |
| Border | None — sits flush with content |
| Z-index | 50 |

**Contents (top to bottom):**
1. **Ace logo mark** — 32x32px, amber gradient (`#E5A00D` → `#B8800A`), 6px border-radius
2. **16px spacer**
3. **Nav icons** — vertically stacked, 4px gap between items
4. **Flexible spacer** (pushes remaining items to bottom)
5. **Settings icon**
6. **4px spacer**
7. **User avatar** — 30px circle, initials, `--color-surface-container-high` background

**Nav icon targets:**
- Size: 44x40px, 8px border-radius
- Default: icon at 18px in `--color-outline` (#757578)
- Hover: `--color-surface-container-high` background
- Active: `rgba(229,160,13,0.12)` background fill + `--color-primary` icon color + 3px left accent bar (`--color-primary`, 2px border-radius)

**Nav items:**

| ID | Icon (Lucide) | Label | Route | Color when active | Has flyout |
|----|--------------|-------|-------|-------------------|------------|
| home | Sparkles | Home | /app | `--color-primary` | No (direct nav) |
| dashboards | LayoutGrid | Dashboards | /app/dashboards | `--color-on-surface` | Yes |
| services | Activity | Services | /app/services | `--color-secondary` | Yes |
| alerts | AlertTriangle | Alerts | /app/alerts | `--color-error` | Yes |
| explore | Search | Explore | /app/explore/metrics | `--color-tertiary` | Yes |

**Bottom rail items (not part of main nav loop, rendered separately):**

| ID | Icon (Lucide) | Label | Route | Color when active | Has flyout |
|----|--------------|-------|-------|-------------------|------------|
| settings | Settings | Settings | /app/settings | `--color-on-surface-variant` | Yes |

### Flyout Panel

| Property | Value |
|----------|-------|
| Width | 240px |
| Background | `--color-surface-container-low` (#141518) |
| Border | 1px `--color-outline-variant` on left and right |
| Shadow | `8px 0 24px rgba(0,0,0,0.3)` |
| Position | Fixed, immediately right of rail (left: 52px) |

**Contents (top to bottom):**
1. **Header** — section name (13px, weight 600) + close button (X icon)
2. **Search input** — `--color-surface-container-high` background, `--color-outline-variant` border, 8px border-radius, 12px placeholder text
3. **Sub-navigation** — list of child routes. Active child gets left 2px amber accent + `rgba(229,160,13,0.10)` background + `--color-primary` text
4. **Favorites section** — header (Micro type: 10px/600/uppercase), starred items with amber star icon
5. **Recents section** — header (Micro type), recent items in `--color-outline` at 12px

**Flyout content by section:**

- **Home** — no flyout (direct navigation only)
- **Dashboards** — sub-nav: "All Dashboards"; favorites: pinned dashboards; recents: recently viewed dashboards
- **Services** — sub-nav: "All Services"; favorites: pinned services; recents: recently viewed services
- **Alerts** — sub-nav: "Active", "Silenced", "Rules"; recents: recently triggered alerts
- **Explore** — sub-nav: "Metrics", "Logs", "Traces"; favorites: saved queries; recents: recent queries
- **Settings** — sub-nav: "General", "Members", "Groups & Permissions", "Data Sources", "AI Configuration", "SSO / Auth"; no favorites/recents

### Content Area

- `margin-left: 52px` always — the rail never hides
- No additional margin when flyout opens — flyout overlays content
- Remove the current 240px margin shift and hamburger button logic

## Interaction & Behavior

### Hover-to-Peek

1. User hovers a rail icon
2. After 200ms delay, flyout slides in with that section's content
3. Moving mouse into the flyout keeps it open
4. Moving mouse out of both rail icon and flyout starts a 150ms close timer
5. If mouse re-enters either element within 150ms, the timer cancels (prevents flicker)
6. Animation: 150ms ease-out, translateX from -8px to 0 + opacity 0→1

### Click-to-Pin

1. Clicking a rail icon pins the flyout open
2. The icon gets the active state (accent bar + background fill)
3. Close methods: click X in flyout header, click same rail icon again, press Escape
4. Pinned state persists across in-section navigation (navigating Metrics→Logs keeps Explore flyout pinned)
5. Navigating to a different section via the rail unpins the current and pins the new section
6. Pinned state is NOT persisted to localStorage — starts closed on page refresh

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+B` | Toggle pin for current section's flyout |
| `Cmd+1` through `Cmd+5` | Navigate to section + briefly pin flyout (auto-closes after 2s if not interacted with). These shortcuts move from `App.vue` into `useSidebar.ts` — the existing `register()` calls in App.vue are removed and replaced by `useSidebar` calling `router.push()` + `pinSection()` with a 2s auto-close timer internally. |
| `Escape` | Close any open flyout |

### User Avatar Popover

- Triggered by clicking the user avatar at the bottom of the rail
- Positioned above the avatar, aligned to the left edge of the rail
- Contents: user name/email (non-interactive header), org switcher (list of orgs with checkmark on current), divider, theme toggle, keyboard shortcuts link, logout button
- Closes on: click outside, Escape, selecting an action
- Animation: 200ms ease-out, fade + scale from 0.95

## Visual Design — Kinetic Token Migration

### CSS Variable Naming

CSS variable **names** stay as-is (e.g., `--color-surface-container-low`, `--color-surface-container-high`). Only the **values** change. This avoids a codebase-wide rename. The CLAUDE.md color mapping table already maps DESIGN.md token names to these CSS variable names.

### CSS Token Value Changes (style.css :root)

| Token | Old (Deep Space) | New (Kinetic) |
|-------|-----------------|---------------|
| `--color-primary` | `#a3a6ff` | `#E5A00D` |
| `--color-primary-dim` | `#6063ee` | `#B8800A` |
| `--color-secondary` | `#69f6b8` | `#34D399` |
| `--color-secondary-dim` | `#58e7ab` | `#2AB880` |
| `--color-tertiary` | `#ffb148` | `#F97316` |
| `--color-tertiary-dim` | `#e79400` | `#e79400` (unchanged — keep for hover states on tertiary elements) |
| `--color-error` | `#ff6e84` | `#EF4444` |
| `--color-surface` | `#0d0e10` | `#0C0D0F` |
| `--color-surface-container-low` | `#121316` | `#141518` |
| `--color-surface-container-high` | `#1e2022` | `#1C1E22` |
| `--color-surface-bright` | `#2b2c2f` | `#252830` |
| `--color-surface-container-highest` | `#242629` | `#242629` (unchanged — keep for glassmorphic overlays) |
| `--color-on-surface` | `#fdfbfe` | `#F5F5F4` |
| `--color-on-surface-variant` | `#ababad` | `#A8A8A4` |
| `--color-outline` | `#757578` | `#757578` (unchanged) |
| `--color-outline-variant` | `#47484a` | `#47484a` (unchanged) |

### Font Changes

| Role | CSS Variable | Old | New |
|------|-------------|-----|-----|
| Display | `--font-display` | `"Space Grotesk", "Inter", sans-serif` | `"Satoshi", "Inter", sans-serif` |
| Body/UI | `--font-sans` | `"Inter", "Segoe UI", system-ui, sans-serif` | `"DM Sans", "Segoe UI", system-ui, sans-serif` |
| Code | `--font-mono` | `"JetBrains Mono", "Cascadia Mono", monospace` | unchanged |

The `@import url(...)` in style.css must also be updated to load Satoshi (fontshare) and DM Sans (Google Fonts) instead of Space Grotesk and Inter. See DESIGN.md Typography section for exact URLs.

### New Tokens to Add

| Token | Value | Usage |
|-------|-------|-------|
| `--color-primary-muted` | `rgba(229,160,13,0.12)` | Active icon backgrounds, subtle highlights |
| `--color-surface-hover` | `#2E3138` | Interactive hover on elevated surfaces |
| `--color-info` | `#60A5FA` | Informational states |

### Selection Color Update

```css
*::selection {
  background: var(--color-primary);
  color: #0C0D0F;
}
```

## Component Architecture

### New/Modified Files

| File | Action | Purpose |
|------|--------|---------|
| `AppSidebar.vue` | Rewrite | Orchestrator: renders rail, manages flyout state |
| `SidebarRail.vue` | New | 52px icon strip with logo, nav icons, settings, avatar |
| `SidebarFlyout.vue` | New | 240px panel with header, search, sub-nav, favorites, recents |
| `SidebarUserMenu.vue` | New | Popover menu from user avatar |
| `useSidebar.ts` | Refactor | New state model: hoveredSection, pinnedSection, isPeeking |
| `App.vue` | Modify | Remove hamburger button, change margin from 240px to 52px |
| `style.css` | Modify | Migrate all tokens to Kinetic palette, update fonts |

### State Model (useSidebar.ts)

```typescript
interface SidebarState {
  hoveredSection: string | null   // which rail icon is hovered
  pinnedSection: string | null    // which section's flyout is pinned open
  isPeeking: boolean              // true when flyout is open via hover (not pinned)
}
```

Key behaviors:
- `hoveredSection` is set on mouseenter with 200ms debounce, cleared on mouseleave with 150ms delay
- `pinnedSection` is set on click, cleared on close/escape/re-click
- `isPeeking` is true when `hoveredSection` is set and `pinnedSection` is null (or different section)
- When `pinnedSection` is set, hovering other icons does NOT open their flyouts (pin takes priority)
- `Cmd+B` toggles `pinnedSection` for the section matching the current route

### Removed

- Hamburger button in `App.vue`
- `sidebarTransform` computed property in `AppSidebar.vue`
- `mainMargin` 240px logic in `App.vue`
- Binary `isOpen` state in `useSidebar.ts`
- `OrganizationDropdown.vue` — delete the file. Its functionality (org list, selection, create org) is absorbed into `SidebarUserMenu.vue`. No other views import it.

## Testing Plan

### useSidebar.ts — Unit Tests
- Hover sets `hoveredSection` after 200ms delay
- Mouse leave clears `hoveredSection` after 150ms delay
- Re-entering within 150ms cancels the clear timer
- Click sets `pinnedSection`
- Click same section again clears `pinnedSection`
- Escape clears `pinnedSection`
- `Cmd+B` toggles `pinnedSection` for current route's section
- Pin persists when navigating within the same section
- Pin clears on page refresh (not in localStorage)
- Hovering other icons while pinned does not change flyout

### SidebarRail.vue — Component Tests
- Renders all 5 nav icons + settings + user avatar
- Active icon matches current route (test each route)
- Emits `hover` event with section ID on mouseenter
- Emits `click` event with section ID on click
- Active icon has amber accent bar and highlight background
- Logo renders at top
- User avatar shows initials

### SidebarFlyout.vue — Component Tests
- Renders correct sub-nav items for each section
- Active sub-nav item matches current route
- Search input renders and is focusable
- Favorites section renders when items exist, hidden when empty
- Recents section renders when items exist, hidden when empty
- Close button emits `close` event
- Section header shows correct section name

### SidebarUserMenu.vue — Component Tests
- Opens on avatar click
- Shows user name and email
- Renders org list with checkmark on current org
- Selecting an org calls `selectOrganization`
- Closes on click outside
- Closes on Escape
- Logout button calls logout handler

### AppSidebar.vue — Integration Tests
- Hovering rail icon opens flyout after delay
- Clicking rail icon pins flyout
- Clicking X closes pinned flyout
- Escape closes flyout
- Navigating between sub-items keeps flyout open
- Content area has 52px left margin
- Flyout overlays content (no margin shift)
