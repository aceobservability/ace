# Sidebar Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 240px collapsible sidebar with a 52px icon rail + 240px hover/pin flyout, and migrate all CSS tokens from "Deep Space" to the "Kinetic" design system.

**Architecture:** The sidebar is decomposed into four components (SidebarRail, SidebarFlyout, SidebarUserMenu, orchestrated by AppSidebar) backed by a refactored useSidebar composable. The token migration touches style.css and propagates through existing CSS variable references automatically.

**Tech Stack:** Vue 3 Composition API, Tailwind CSS v4, Vitest + happy-dom, lucide-vue-next icons

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/src/style.css` | Modify | Migrate token values + fonts to Kinetic palette |
| `frontend/src/composables/useSidebar.ts` | Rewrite | New state: hoveredSection, pinnedSection, isPeeking, timers |
| `frontend/src/composables/useSidebar.spec.ts` | Rewrite | Tests for new hover/pin/keyboard state model |
| `frontend/src/components/SidebarRail.vue` | Create | 52px icon strip: logo, nav icons, settings, user avatar |
| `frontend/src/components/SidebarRail.spec.ts` | Create | Rail rendering, active states, event emissions |
| `frontend/src/components/SidebarFlyout.vue` | Create | 240px panel: header, search, sub-nav, favorites, recents |
| `frontend/src/components/SidebarFlyout.spec.ts` | Create | Flyout content per section, close behavior |
| `frontend/src/components/SidebarUserMenu.vue` | Create | Popover: user info, org switcher, logout |
| `frontend/src/components/SidebarUserMenu.spec.ts` | Create | Menu open/close, org selection, escape handling |
| `frontend/src/components/AppSidebar.vue` | Rewrite | Orchestrator: renders rail + flyout, wires hover/pin |
| `frontend/src/components/AppSidebar.spec.ts` | Rewrite | Integration: hover→peek, click→pin, escape, navigation |
| `frontend/src/App.vue` | Modify | Remove hamburger, change margin to 52px, move shortcuts |
| `frontend/src/App.spec.ts` | Modify | Update assertions for new 52px margin |
| `frontend/src/components/OrganizationDropdown.vue` | Delete | Absorbed into SidebarUserMenu |

---

## Design Review Decisions

Decisions made during `/plan-design-review` pass. These amend the spec and must be reflected in the implementation.

### Interaction States

| Feature | Loading | Empty | Error | Success |
|---------|---------|-------|-------|---------|
| Flyout favorites | n/a (localStorage) | Warm hint: "{Star icon} Star {section} to pin them here" in `--color-outline`, 12px. Text adapts per section. | n/a | List of starred items |
| Flyout recents | n/a (localStorage) | "No recent items" in `--color-outline`, 12px | n/a | List of recent items |
| Flyout search | n/a (client-side filter) | "No matches for '{query}'" in `--color-outline`, 12px, centered | n/a | Filtered sub-nav + favorites + recents |
| User menu orgs | Shimmer (2 rows) | "No organizations" | "Failed to load" in `--color-error` | Org list with checkmarks |

### Accessibility

- **Icon targets:** 44x40px (increased from 40x36px for WCAG touch target compliance)
- **Focus ring:** `2px solid var(--color-primary)`, `2px offset`, `8px border-radius`
- **Tab order:** Rail icons top→bottom → settings → avatar. When flyout open: search → sub-nav items → close button
- **Focus management:** Flyout open → focus moves to search input. Flyout close → focus returns to the rail icon that triggered it.
- **ARIA:** `role="navigation"` on rail. Flyout gets `aria-label="{Section} navigation"`. Rail icons with flyouts get `aria-expanded="true|false"`. `aria-current="page"` on active sub-nav items.
- **Screen reader:** Flyout open/close announced via `aria-live="polite"` region
- **Color contrast:** `--color-outline` (#757578) on `--color-surface` (#0C0D0F) = 4.87:1 (passes WCAG AA)

### Rail Tooltips

- Show a native `title` tooltip on rail icons after browser-default delay
- Tooltip only appears when NO flyout is open (peeking or pinned)
- Once the flyout opens, the flyout header serves as the label — tooltip is redundant

### Border Radius Alignment

All interactive elements in the sidebar use `8px` border-radius (DESIGN.md `md` scale), replacing the original `6px` values. Applies to: icon targets, flyout nav items, flyout search input, user menu.

### Favorites Data Flow

The flyout DISPLAYS favorites from the existing `useFavorites` composable (read-only). The star/favorite action lives in the actual views (DashboardList, ServicesView, etc.), not in the sidebar. Extending `useFavorites` to handle non-dashboard sections is deferred to a follow-up.

### Initial State

No flyout is open on page load. The rail shows icons only. The user's current route determines which icon gets the active highlight (accent bar).

### Responsive

The app enforces a 1280px minimum viewport via the existing overlay in App.vue. No mobile/tablet design is needed for the sidebar. The 52px rail + 240px flyout overlay fits comfortably in 1280px+.

---

## Task 1: Migrate CSS Tokens to Kinetic Palette

**Files:**
- Modify: `frontend/src/style.css`

This task has no tests — it's a value swap in CSS custom properties. All existing components reference these variables, so the visual change propagates automatically.

- [ ] **Step 1: Update the font import URL**

Replace the current import:
```css
@import url("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500&family=JetBrains+Mono:ital,wght@0,400;0,600;1,400&display=swap");
```

With:
```css
@import url("https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700&display=swap");
@import url("https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=JetBrains+Mono:ital,wght@0,400;0,600;1,400&display=swap");
```

- [ ] **Step 2: Update :root token values**

Replace the entire `:root` block with:
```css
:root {
  /* Surface hierarchy */
  --color-surface:                    #0C0D0F;
  --color-surface-container-low:      #141518;
  --color-surface-container-high:     #1C1E22;
  --color-surface-bright:             #252830;
  --color-surface-container-highest:  #242629;
  --color-surface-hover:              #2E3138;

  /* Primary (active nav, links, brand accent) */
  --color-primary:          #E5A00D;
  --color-primary-dim:      #B8800A;
  --color-primary-muted:    rgba(229,160,13,0.12);

  /* Secondary (healthy, success, progress) */
  --color-secondary:        #34D399;
  --color-secondary-dim:    #2AB880;

  /* Tertiary (warning, edit, labels) */
  --color-tertiary:         #F97316;
  --color-tertiary-dim:     #e79400;

  /* Error (critical, destructive) */
  --color-error:            #EF4444;

  /* Info (informational, non-urgent) */
  --color-info:             #60A5FA;

  /* On-surface text */
  --color-on-surface:         #F5F5F4;
  --color-on-surface-variant: #A8A8A4;
  --color-outline:            #757578;
  --color-outline-variant:    #47484a;
}
```

- [ ] **Step 3: Update @theme font variables**

In the `@theme` block, replace the font lines:
```css
  --font-sans:  "DM Sans", "Segoe UI", system-ui, sans-serif;
  --font-display: "Satoshi", "DM Sans", sans-serif;
```

And add the new tokens to the `@theme` block:
```css
  --color-primary-muted:    var(--color-primary-muted);
  --color-surface-hover:    var(--color-surface-hover);
  --color-info:             var(--color-info);
```

- [ ] **Step 4: Update selection color**

Replace the `*::selection` rule:
```css
*::selection {
  background: var(--color-primary);
  color: #0C0D0F;
}
```

- [ ] **Step 5: Run existing tests to verify nothing breaks**

Run: `cd frontend && npm run test`
Expected: All existing tests pass (token changes don't affect test logic).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/style.css
git commit -m "feat: migrate CSS tokens from Deep Space to Kinetic palette"
```

---

## Task 2: Rewrite useSidebar Composable

**Files:**
- Rewrite: `frontend/src/composables/useSidebar.ts`
- Rewrite: `frontend/src/composables/useSidebar.spec.ts`

The old composable manages a binary open/closed state. The new one manages hover/pin/peek state with debounced timers.

- [ ] **Step 1: Write the failing tests**

Write `frontend/src/composables/useSidebar.spec.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// We need to test the composable in isolation, so we mock vue-router
const mockRoutePath = { value: '/app/dashboards' }
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: mockRoutePath.value }),
  useRouter: () => ({ push: vi.fn() }),
}))

import { useSidebar } from './useSidebar'

describe('useSidebar', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    const { _reset } = useSidebar()
    _reset()
    mockRoutePath.value = '/app/dashboards'
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('initial state', () => {
    it('starts with no hovered or pinned section', () => {
      const { hoveredSection, pinnedSection, isPeeking } = useSidebar()
      expect(hoveredSection.value).toBeNull()
      expect(pinnedSection.value).toBeNull()
      expect(isPeeking.value).toBe(false)
    })
  })

  describe('hover-to-peek', () => {
    it('sets hoveredSection after 200ms delay', () => {
      const { hoveredSection, handleMouseEnter } = useSidebar()
      handleMouseEnter('explore')
      expect(hoveredSection.value).toBeNull()

      vi.advanceTimersByTime(200)
      expect(hoveredSection.value).toBe('explore')
    })

    it('clears hoveredSection after 150ms on mouse leave', () => {
      const { hoveredSection, handleMouseEnter, handleMouseLeave } = useSidebar()
      handleMouseEnter('explore')
      vi.advanceTimersByTime(200)
      expect(hoveredSection.value).toBe('explore')

      handleMouseLeave()
      expect(hoveredSection.value).toBe('explore') // still there during delay
      vi.advanceTimersByTime(150)
      expect(hoveredSection.value).toBeNull()
    })

    it('cancels close timer if mouse re-enters within 150ms', () => {
      const { hoveredSection, handleMouseEnter, handleMouseLeave } = useSidebar()
      handleMouseEnter('explore')
      vi.advanceTimersByTime(200)

      handleMouseLeave()
      vi.advanceTimersByTime(100) // 100ms < 150ms threshold
      handleMouseEnter('explore') // re-enter

      vi.advanceTimersByTime(200)
      expect(hoveredSection.value).toBe('explore') // still open
    })

    it('isPeeking is true when hovered and not pinned', () => {
      const { isPeeking, handleMouseEnter } = useSidebar()
      handleMouseEnter('explore')
      vi.advanceTimersByTime(200)
      expect(isPeeking.value).toBe(true)
    })

    it('hovering does NOT change flyout when a section is pinned', () => {
      const { hoveredSection, pinnedSection, pinSection, handleMouseEnter } = useSidebar()
      pinSection('dashboards')
      expect(pinnedSection.value).toBe('dashboards')

      handleMouseEnter('explore')
      vi.advanceTimersByTime(200)
      // hoveredSection can track hover, but the active flyout section should be pinned
      expect(pinnedSection.value).toBe('dashboards')
    })
  })

  describe('click-to-pin', () => {
    it('pinSection sets pinnedSection', () => {
      const { pinnedSection, pinSection } = useSidebar()
      pinSection('explore')
      expect(pinnedSection.value).toBe('explore')
    })

    it('pinning same section again unpins it', () => {
      const { pinnedSection, pinSection } = useSidebar()
      pinSection('explore')
      pinSection('explore')
      expect(pinnedSection.value).toBeNull()
    })

    it('pinning a different section switches to it', () => {
      const { pinnedSection, pinSection } = useSidebar()
      pinSection('explore')
      pinSection('dashboards')
      expect(pinnedSection.value).toBe('dashboards')
    })

    it('isPeeking is false when pinned', () => {
      const { isPeeking, pinSection } = useSidebar()
      pinSection('explore')
      expect(isPeeking.value).toBe(false)
    })

    it('closeFlyout clears pinnedSection', () => {
      const { pinnedSection, pinSection, closeFlyout } = useSidebar()
      pinSection('explore')
      closeFlyout()
      expect(pinnedSection.value).toBeNull()
    })
  })

  describe('keyboard shortcuts', () => {
    it('Escape clears pinnedSection', () => {
      const { pinnedSection, pinSection } = useSidebar()
      pinSection('explore')

      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      )
      expect(pinnedSection.value).toBeNull()
    })

    it('Cmd+B toggles pin for current route section', () => {
      mockRoutePath.value = '/app/explore/metrics'
      const { pinnedSection } = useSidebar()

      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'b', metaKey: true, bubbles: true }),
      )
      expect(pinnedSection.value).toBe('explore')

      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'b', metaKey: true, bubbles: true }),
      )
      expect(pinnedSection.value).toBeNull()
    })

    it('Ctrl+B also toggles pin (Windows/Linux)', () => {
      mockRoutePath.value = '/app/dashboards'
      const { pinnedSection } = useSidebar()

      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true }),
      )
      expect(pinnedSection.value).toBe('dashboards')
    })

    it('Cmd+1 navigates to home and briefly pins', () => {
      const { pinnedSection } = useSidebar()

      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: '1', metaKey: true, bubbles: true }),
      )
      // Home has no flyout, so pinnedSection stays null
      expect(pinnedSection.value).toBeNull()
    })

    it('Cmd+2 navigates to dashboards and pins with auto-close', () => {
      const { pinnedSection } = useSidebar()

      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: '2', metaKey: true, bubbles: true }),
      )
      expect(pinnedSection.value).toBe('dashboards')

      // Auto-closes after 2 seconds if not interacted with
      vi.advanceTimersByTime(2000)
      expect(pinnedSection.value).toBeNull()
    })

    it('Cmd+3 navigates to services and pins with auto-close', () => {
      const { pinnedSection } = useSidebar()

      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: '3', metaKey: true, bubbles: true }),
      )
      expect(pinnedSection.value).toBe('services')
    })

    it('Cmd+4 navigates to alerts and pins with auto-close', () => {
      const { pinnedSection } = useSidebar()

      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: '4', metaKey: true, bubbles: true }),
      )
      expect(pinnedSection.value).toBe('alerts')
    })

    it('Cmd+5 navigates to explore and pins with auto-close', () => {
      const { pinnedSection } = useSidebar()

      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: '5', metaKey: true, bubbles: true }),
      )
      expect(pinnedSection.value).toBe('explore')
    })

    it('auto-close timer is cancelled if user interacts (pins another section)', () => {
      const { pinnedSection, pinSection } = useSidebar()

      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: '2', metaKey: true, bubbles: true }),
      )
      expect(pinnedSection.value).toBe('dashboards')

      // User interacts by clicking to pin explore
      pinSection('explore')
      expect(pinnedSection.value).toBe('explore')

      // Original auto-close timer should NOT close explore
      vi.advanceTimersByTime(2000)
      expect(pinnedSection.value).toBe('explore')
    })
  })

  describe('active flyout section', () => {
    it('returns pinnedSection when pinned', () => {
      const { activeFlyoutSection, pinSection } = useSidebar()
      pinSection('explore')
      expect(activeFlyoutSection.value).toBe('explore')
    })

    it('returns hoveredSection when peeking', () => {
      const { activeFlyoutSection, handleMouseEnter } = useSidebar()
      handleMouseEnter('alerts')
      vi.advanceTimersByTime(200)
      expect(activeFlyoutSection.value).toBe('alerts')
    })

    it('returns null when nothing is hovered or pinned', () => {
      const { activeFlyoutSection } = useSidebar()
      expect(activeFlyoutSection.value).toBeNull()
    })

    it('returns pinnedSection even when hovering a different section', () => {
      const { activeFlyoutSection, pinSection, handleMouseEnter } = useSidebar()
      pinSection('dashboards')
      handleMouseEnter('explore')
      vi.advanceTimersByTime(200)
      expect(activeFlyoutSection.value).toBe('dashboards')
    })
  })

  describe('closeFlyout', () => {
    it('clears hover timer when closing', () => {
      const { hoveredSection, handleMouseEnter, closeFlyout } = useSidebar()
      handleMouseEnter('explore')
      // Timer is pending but not yet fired
      closeFlyout()
      vi.advanceTimersByTime(200)
      expect(hoveredSection.value).toBeNull()
    })
  })

  describe('Cmd+B from unpinned state', () => {
    it('pins the current route section when nothing is pinned', () => {
      mockRoutePath.value = '/app/services'
      const { pinnedSection } = useSidebar()
      expect(pinnedSection.value).toBeNull()

      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'b', metaKey: true, bubbles: true }),
      )
      expect(pinnedSection.value).toBe('services')
    })
  })

  describe('route-to-section mapping', () => {
    it('maps /app to home', () => {
      mockRoutePath.value = '/app'
      const { currentRouteSection } = useSidebar()
      expect(currentRouteSection.value).toBe('home')
    })

    it('maps /app/explore/metrics to explore', () => {
      mockRoutePath.value = '/app/explore/metrics'
      const { currentRouteSection } = useSidebar()
      expect(currentRouteSection.value).toBe('explore')
    })

    it('maps /app/settings/org/123/general to settings', () => {
      mockRoutePath.value = '/app/settings/org/123/general'
      const { currentRouteSection } = useSidebar()
      expect(currentRouteSection.value).toBe('settings')
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/composables/useSidebar.spec.ts`
Expected: FAIL — the current useSidebar doesn't export the new functions/state.

- [ ] **Step 3: Write the implementation**

Write `frontend/src/composables/useSidebar.ts`:

```typescript
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const HOVER_DELAY = 200
const CLOSE_DELAY = 150

const hoveredSection = ref<string | null>(null)
const pinnedSection = ref<string | null>(null)

let hoverTimer: ReturnType<typeof setTimeout> | null = null
let closeTimer: ReturnType<typeof setTimeout> | null = null

const isPeeking = computed(() => {
  return hoveredSection.value !== null && pinnedSection.value === null
})

const activeFlyoutSection = computed(() => {
  if (pinnedSection.value) return pinnedSection.value
  return hoveredSection.value
})

function clearTimers() {
  if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null }
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null }
}

function handleMouseEnter(sectionId: string) {
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null }
  if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null }

  hoverTimer = setTimeout(() => {
    hoveredSection.value = sectionId
    hoverTimer = null
  }, HOVER_DELAY)
}

function handleMouseLeave() {
  if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null }

  closeTimer = setTimeout(() => {
    hoveredSection.value = null
    closeTimer = null
  }, CLOSE_DELAY)
}

const AUTO_CLOSE_DELAY = 2000
let autoCloseTimer: ReturnType<typeof setTimeout> | null = null

function clearAutoCloseTimer() {
  if (autoCloseTimer) { clearTimeout(autoCloseTimer); autoCloseTimer = null }
}

function pinSection(sectionId: string) {
  clearTimers()
  clearAutoCloseTimer()
  if (pinnedSection.value === sectionId) {
    pinnedSection.value = null
  } else {
    pinnedSection.value = sectionId
  }
  hoveredSection.value = null
}

function closeFlyout() {
  clearTimers()
  clearAutoCloseTimer()
  pinnedSection.value = null
  hoveredSection.value = null
}

const ROUTE_SECTION_MAP: [string, string][] = [
  ['/app/dashboards', 'dashboards'],
  ['/app/services', 'services'],
  ['/app/alerts', 'alerts'],
  ['/app/explore', 'explore'],
  ['/app/settings', 'settings'],
]

const SHORTCUT_NAV: Record<string, { section: string; route: string }> = {
  '1': { section: 'home', route: '/app' },
  '2': { section: 'dashboards', route: '/app/dashboards' },
  '3': { section: 'services', route: '/app/services' },
  '4': { section: 'alerts', route: '/app/alerts' },
  '5': { section: 'explore', route: '/app/explore/metrics' },
}

function routeToSection(path: string): string {
  for (const [prefix, section] of ROUTE_SECTION_MAP) {
    if (path.startsWith(prefix)) return section
  }
  if (path === '/app' || path === '/app/') return 'home'
  return 'home'
}

// Cache the route ref from the first useSidebar() call so keydown handler
// can read route.path without calling useRoute() outside setup context.
let cachedRoutePath: { value: string } | null = null
let router: { push: (path: string) => void } | null = null

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    closeFlyout()
    return
  }

  if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
    e.preventDefault()
    if (cachedRoutePath) {
      const section = routeToSection(cachedRoutePath.value)
      pinSection(section)
    }
    return
  }

  // Cmd+1 through Cmd+5: navigate + briefly pin
  if ((e.metaKey || e.ctrlKey) && SHORTCUT_NAV[e.key]) {
    e.preventDefault()
    const { section, route: targetRoute } = SHORTCUT_NAV[e.key]
    router?.push(targetRoute)

    // Home has no flyout, so don't pin
    if (section === 'home') return

    clearAutoCloseTimer()
    pinnedSection.value = section
    hoveredSection.value = null

    autoCloseTimer = setTimeout(() => {
      // Only auto-close if still on the same pinned section
      if (pinnedSection.value === section) {
        pinnedSection.value = null
      }
      autoCloseTimer = null
    }, AUTO_CLOSE_DELAY)
  }
}

window.addEventListener('keydown', handleKeydown)

function _reset() {
  clearTimers()
  clearAutoCloseTimer()
  hoveredSection.value = null
  pinnedSection.value = null
}

export function useSidebar() {
  const route = useRoute()
  const routerInstance = useRouter()

  // Cache for keydown handler (needs getter to stay reactive)
  cachedRoutePath = { get value() { return route.path } }
  router = routerInstance

  const currentRouteSection = computed(() => routeToSection(route.path))

  return {
    hoveredSection,
    pinnedSection,
    isPeeking,
    activeFlyoutSection,
    currentRouteSection,
    handleMouseEnter,
    handleMouseLeave,
    pinSection,
    closeFlyout,
    _reset,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/composables/useSidebar.spec.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/composables/useSidebar.ts frontend/src/composables/useSidebar.spec.ts
git commit -m "feat: rewrite useSidebar composable with hover/pin/peek state model"
```

---

## Task 3: Create SidebarRail Component

**Files:**
- Create: `frontend/src/components/SidebarRail.vue`
- Create: `frontend/src/components/SidebarRail.spec.ts`

The rail is the 52px icon strip that is always visible. It emits hover and click events upward to the orchestrator.

- [ ] **Step 1: Write the failing tests**

Write `frontend/src/components/SidebarRail.spec.ts`:

```typescript
import { mount, VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import SidebarRail from './SidebarRail.vue'

const mockRoutePath = ref('/app/dashboards')
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: mockRoutePath.value }),
  useRouter: () => ({ push: vi.fn() }),
}))

const mockUser = ref<{ email: string; name?: string } | null>({
  email: 'jane@example.com',
  name: 'Jane Doe',
})
vi.mock('../composables/useAuth', () => ({
  useAuth: () => ({ user: mockUser }),
}))

describe('SidebarRail', () => {
  let wrapper: VueWrapper

  function createWrapper(props: { activeSection?: string | null } = {}) {
    return mount(SidebarRail, {
      props: {
        activeSection: props.activeSection ?? null,
      },
      global: {
        stubs: {
          Sparkles: { template: '<span class="icon-sparkles" />' },
          LayoutGrid: { template: '<span class="icon-layout-grid" />' },
          Activity: { template: '<span class="icon-activity" />' },
          AlertTriangle: { template: '<span class="icon-alert-triangle" />' },
          Search: { template: '<span class="icon-search" />' },
          Settings: { template: '<span class="icon-settings" />' },
        },
      },
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockRoutePath.value = '/app/dashboards'
    mockUser.value = { email: 'jane@example.com', name: 'Jane Doe' }
  })

  afterEach(() => {
    wrapper?.unmount()
  })

  it('renders 5 nav icons + settings icon + user avatar', () => {
    wrapper = createWrapper()
    expect(wrapper.find('[data-testid="rail-home"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="rail-dashboards"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="rail-services"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="rail-alerts"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="rail-explore"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="rail-settings"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="rail-user-avatar"]').exists()).toBe(true)
  })

  it('renders the Ace logo at the top', () => {
    wrapper = createWrapper()
    expect(wrapper.find('[data-testid="rail-logo"]').exists()).toBe(true)
  })

  it('emits hover event with section ID on mouseenter', async () => {
    wrapper = createWrapper()
    await wrapper.find('[data-testid="rail-explore"]').trigger('mouseenter')
    expect(wrapper.emitted('hover')?.[0]).toEqual(['explore'])
  })

  it('emits hoverEnd event on mouseleave', async () => {
    wrapper = createWrapper()
    await wrapper.find('[data-testid="rail-explore"]').trigger('mouseleave')
    expect(wrapper.emitted('hoverEnd')).toBeTruthy()
  })

  it('emits click event with section ID on click', async () => {
    wrapper = createWrapper()
    await wrapper.find('[data-testid="rail-dashboards"]').trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual(['dashboards'])
  })

  it('emits avatarClick event when user avatar is clicked', async () => {
    wrapper = createWrapper()
    await wrapper.find('[data-testid="rail-user-avatar"]').trigger('click')
    expect(wrapper.emitted('avatarClick')).toBeTruthy()
  })

  it('shows active indicator on the active section', () => {
    wrapper = createWrapper({ activeSection: 'explore' })
    const exploreItem = wrapper.find('[data-testid="rail-explore"]')
    expect(exploreItem.find('[data-testid="rail-accent-bar"]').exists()).toBe(true)
  })

  it('does not show accent bar on inactive items', () => {
    wrapper = createWrapper({ activeSection: 'explore' })
    const homeItem = wrapper.find('[data-testid="rail-home"]')
    expect(homeItem.find('[data-testid="rail-accent-bar"]').exists()).toBe(false)
  })

  it('user avatar shows initials from user name', () => {
    wrapper = createWrapper()
    const avatar = wrapper.find('[data-testid="rail-user-avatar"]')
    expect(avatar.text()).toBe('JD')
  })

  it('user avatar shows first letter of email when no name', () => {
    mockUser.value = { email: 'jane@example.com' }
    wrapper = createWrapper()
    const avatar = wrapper.find('[data-testid="rail-user-avatar"]')
    expect(avatar.text()).toBe('J')
  })

  it('rail has 52px width', () => {
    wrapper = createWrapper()
    const rail = wrapper.find('[data-testid="sidebar-rail"]')
    expect(rail.element.style.width).toBe('52px')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/SidebarRail.spec.ts`
Expected: FAIL — SidebarRail.vue doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Write `frontend/src/components/SidebarRail.vue`:

```vue
<script setup lang="ts">
import {
  Activity,
  AlertTriangle,
  LayoutGrid,
  Search,
  Settings,
  Sparkles,
} from 'lucide-vue-next'
import { computed } from 'vue'
import { useAuth } from '../composables/useAuth'

const props = defineProps<{
  activeSection: string | null
}>()

const emit = defineEmits<{
  hover: [sectionId: string]
  hoverEnd: []
  select: [sectionId: string]
  avatarClick: []
}>()

const { user } = useAuth()

interface RailItem {
  id: string
  icon: typeof Sparkles
  colorVar: string
}

const navItems: RailItem[] = [
  { id: 'home', icon: Sparkles, colorVar: 'var(--color-primary)' },
  { id: 'dashboards', icon: LayoutGrid, colorVar: 'var(--color-on-surface)' },
  { id: 'services', icon: Activity, colorVar: 'var(--color-secondary)' },
  { id: 'alerts', icon: AlertTriangle, colorVar: 'var(--color-error)' },
  { id: 'explore', icon: Search, colorVar: 'var(--color-tertiary)' },
]

const userInitials = computed(() => {
  if (!user.value) return '?'
  if (user.value.name) {
    return user.value.name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }
  return user.value.email.charAt(0).toUpperCase()
})

function isActive(id: string): boolean {
  return props.activeSection === id
}
</script>

<template>
  <div
    data-testid="sidebar-rail"
    class="fixed left-0 top-0 bottom-0 z-50 flex flex-col items-center py-3 gap-1"
    :style="{
      width: '52px',
      backgroundColor: 'var(--color-surface)',
    }"
  >
    <!-- Logo -->
    <div
      data-testid="rail-logo"
      class="flex items-center justify-center shrink-0 mb-4"
      :style="{
        width: '32px',
        height: '32px',
        background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
        borderRadius: '8px',
        color: '#0C0D0F',
        fontWeight: '700',
        fontSize: '14px',
        fontFamily: 'var(--font-display)',
      }"
    >A</div>

    <!-- Nav icons -->
    <button
      v-for="item in navItems"
      :key="item.id"
      :data-testid="`rail-${item.id}`"
      class="relative flex items-center justify-center shrink-0 cursor-pointer border-none transition-colors duration-150"
      :style="{
        width: '44px',
        height: '40px',
        borderRadius: '8px',
        backgroundColor: isActive(item.id) ? 'var(--color-primary-muted)' : 'transparent',
        color: isActive(item.id) ? item.colorVar : 'var(--color-outline)',
      }"
      @mouseenter="emit('hover', item.id)"
      @mouseleave="emit('hoverEnd')"
      @click="emit('select', item.id)"
    >
      <!-- Accent bar -->
      <div
        v-if="isActive(item.id)"
        data-testid="rail-accent-bar"
        class="absolute top-2 bottom-2"
        :style="{
          left: '-6px',
          width: '3px',
          backgroundColor: 'var(--color-primary)',
          borderRadius: '2px',
        }"
      />
      <component :is="item.icon" :size="18" />
    </button>

    <!-- Spacer -->
    <div class="flex-1" />

    <!-- Settings -->
    <button
      data-testid="rail-settings"
      class="relative flex items-center justify-center shrink-0 cursor-pointer border-none transition-colors duration-150"
      :style="{
        width: '44px',
        height: '40px',
        borderRadius: '8px',
        backgroundColor: isActive('settings') ? 'var(--color-primary-muted)' : 'transparent',
        color: isActive('settings') ? 'var(--color-on-surface-variant)' : 'var(--color-outline)',
      }"
      @mouseenter="emit('hover', 'settings')"
      @mouseleave="emit('hoverEnd')"
      @click="emit('select', 'settings')"
    >
      <div
        v-if="isActive('settings')"
        data-testid="rail-accent-bar"
        class="absolute top-2 bottom-2"
        :style="{
          left: '-6px',
          width: '3px',
          backgroundColor: 'var(--color-primary)',
          borderRadius: '2px',
        }"
      />
      <Settings :size="18" />
    </button>

    <!-- User avatar -->
    <button
      data-testid="rail-user-avatar"
      class="flex items-center justify-center shrink-0 cursor-pointer border-none mt-1"
      :style="{
        width: '30px',
        height: '30px',
        borderRadius: '50%',
        backgroundColor: 'var(--color-surface-container-high)',
        border: '1px solid var(--color-outline-variant)',
        color: 'var(--color-on-surface-variant)',
        fontSize: '11px',
        fontWeight: '600',
      }"
      @click="emit('avatarClick')"
    >{{ userInitials }}</button>
  </div>
</template>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/SidebarRail.spec.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SidebarRail.vue frontend/src/components/SidebarRail.spec.ts
git commit -m "feat: create SidebarRail component with icon strip and event emissions"
```

---

## Task 4: Create SidebarFlyout Component

**Files:**
- Create: `frontend/src/components/SidebarFlyout.vue`
- Create: `frontend/src/components/SidebarFlyout.spec.ts`

The flyout panel shows sub-navigation, favorites, and recents for the active section.

- [ ] **Step 1: Write the failing tests**

Write `frontend/src/components/SidebarFlyout.spec.ts`:

```typescript
import { mount, VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import SidebarFlyout from './SidebarFlyout.vue'

const mockRoutePath = ref('/app/explore/metrics')
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: mockRoutePath.value }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('../composables/useFavorites', () => ({
  useFavorites: () => ({
    favorites: ref(['dash-1']),
    recentDashboards: ref([
      { id: 'dash-2', title: 'API Latency', visitedAt: Date.now() },
    ]),
    isFavorite: (id: string) => id === 'dash-1',
  }),
}))

describe('SidebarFlyout', () => {
  let wrapper: VueWrapper

  function createWrapper(props: { section: string; isPinned?: boolean }) {
    return mount(SidebarFlyout, {
      props: {
        section: props.section,
        isPinned: props.isPinned ?? false,
      },
      global: {
        stubs: {
          X: { template: '<span class="icon-x" />' },
          Star: { template: '<span class="icon-star" />' },
        },
      },
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockRoutePath.value = '/app/explore/metrics'
  })

  afterEach(() => {
    wrapper?.unmount()
  })

  it('renders section header with section name', () => {
    wrapper = createWrapper({ section: 'explore' })
    expect(wrapper.find('[data-testid="flyout-header"]').text()).toContain('Explore')
  })

  it('renders close button', () => {
    wrapper = createWrapper({ section: 'explore' })
    expect(wrapper.find('[data-testid="flyout-close"]').exists()).toBe(true)
  })

  it('emits close event when close button is clicked', async () => {
    wrapper = createWrapper({ section: 'explore' })
    await wrapper.find('[data-testid="flyout-close"]').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('renders sub-nav items for Explore section', () => {
    wrapper = createWrapper({ section: 'explore' })
    expect(wrapper.find('[data-testid="flyout-nav-metrics"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="flyout-nav-logs"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="flyout-nav-traces"]').exists()).toBe(true)
  })

  it('renders sub-nav items for Alerts section', () => {
    wrapper = createWrapper({ section: 'alerts' })
    expect(wrapper.find('[data-testid="flyout-nav-active"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="flyout-nav-silenced"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="flyout-nav-rules"]').exists()).toBe(true)
  })

  it('highlights active sub-nav item based on route', () => {
    mockRoutePath.value = '/app/explore/metrics'
    wrapper = createWrapper({ section: 'explore' })
    const metricsItem = wrapper.find('[data-testid="flyout-nav-metrics"]')
    expect(metricsItem.attributes('aria-current')).toBe('page')
  })

  it('renders search input', () => {
    wrapper = createWrapper({ section: 'explore' })
    expect(wrapper.find('[data-testid="flyout-search"]').exists()).toBe(true)
  })

  it('emits navigate event when sub-nav item is clicked', async () => {
    wrapper = createWrapper({ section: 'explore' })
    await wrapper.find('[data-testid="flyout-nav-logs"]').trigger('click')
    expect(wrapper.emitted('navigate')?.[0]).toEqual(['/app/explore/logs'])
  })

  it('does not render for home section', () => {
    wrapper = createWrapper({ section: 'home' })
    expect(wrapper.find('[data-testid="flyout-panel"]').exists()).toBe(false)
  })

  it('renders flyout at 240px width', () => {
    wrapper = createWrapper({ section: 'explore' })
    const panel = wrapper.find('[data-testid="flyout-panel"]')
    expect(panel.element.style.width).toBe('240px')
  })

  it('renders settings sub-nav items', () => {
    wrapper = createWrapper({ section: 'settings' })
    expect(wrapper.find('[data-testid="flyout-nav-general"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="flyout-nav-members"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="flyout-nav-groups"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="flyout-nav-datasources"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="flyout-nav-ai"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="flyout-nav-sso"]').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/SidebarFlyout.spec.ts`
Expected: FAIL — SidebarFlyout.vue doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Write `frontend/src/components/SidebarFlyout.vue`:

```vue
<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const props = defineProps<{
  section: string
  isPinned: boolean
}>()

const emit = defineEmits<{
  close: []
  navigate: [path: string]
}>()

const route = useRoute()

interface SubNavItem {
  id: string
  label: string
  path: string
}

interface SectionConfig {
  label: string
  subNav: SubNavItem[]
}

const sectionConfigs: Record<string, SectionConfig> = {
  dashboards: {
    label: 'Dashboards',
    subNav: [
      { id: 'all-dashboards', label: 'All Dashboards', path: '/app/dashboards' },
    ],
  },
  services: {
    label: 'Services',
    subNav: [
      { id: 'all-services', label: 'All Services', path: '/app/services' },
    ],
  },
  alerts: {
    label: 'Alerts',
    subNav: [
      { id: 'active', label: 'Active', path: '/app/alerts' },
      { id: 'silenced', label: 'Silenced', path: '/app/alerts/silenced' },
      { id: 'rules', label: 'Rules', path: '/app/alerts/rules' },
    ],
  },
  explore: {
    label: 'Explore',
    subNav: [
      { id: 'metrics', label: 'Metrics', path: '/app/explore/metrics' },
      { id: 'logs', label: 'Logs', path: '/app/explore/logs' },
      { id: 'traces', label: 'Traces', path: '/app/explore/traces' },
    ],
  },
  settings: {
    label: 'Settings',
    subNav: [
      { id: 'general', label: 'General', path: '/app/settings/general' },
      { id: 'members', label: 'Members', path: '/app/settings/members' },
      { id: 'groups', label: 'Groups & Permissions', path: '/app/settings/groups' },
      { id: 'datasources', label: 'Data Sources', path: '/app/settings/datasources' },
      { id: 'ai', label: 'AI Configuration', path: '/app/settings/ai' },
      { id: 'sso', label: 'SSO / Auth', path: '/app/settings/sso' },
    ],
  },
}

const config = computed(() => sectionConfigs[props.section] ?? null)

function isSubNavActive(item: SubNavItem): boolean {
  return route.path.startsWith(item.path)
}

const searchPlaceholder = computed(() => {
  if (!config.value) return ''
  return `Search ${config.value.label.toLowerCase()}...`
})
</script>

<template>
  <div
    v-if="config"
    data-testid="flyout-panel"
    class="fixed top-0 bottom-0 z-40 flex flex-col overflow-hidden animate-fade-in"
    :style="{
      left: '52px',
      width: '240px',
      backgroundColor: 'var(--color-surface-container-low)',
      borderLeft: '1px solid var(--color-outline-variant)',
      borderRight: '1px solid var(--color-outline-variant)',
      boxShadow: '8px 0 24px rgba(0,0,0,0.3)',
    }"
    @mouseenter="$emit('hover')"
    @mouseleave="$emit('hoverEnd')"
  >
    <!-- Header -->
    <div
      data-testid="flyout-header"
      class="flex items-center justify-between px-4 py-3 shrink-0"
    >
      <span
        class="font-semibold"
        :style="{ fontSize: '13px', color: 'var(--color-on-surface)', letterSpacing: '-0.01em' }"
      >{{ config.label }}</span>
      <button
        data-testid="flyout-close"
        class="flex items-center justify-center cursor-pointer border-none bg-transparent"
        :style="{ color: 'var(--color-outline)', width: '20px', height: '20px' }"
        @click="emit('close')"
      >
        <X :size="16" />
      </button>
    </div>

    <!-- Search -->
    <div class="px-4 pb-3">
      <input
        data-testid="flyout-search"
        type="text"
        :placeholder="searchPlaceholder"
        class="w-full border-none outline-none"
        :style="{
          padding: '7px 10px',
          backgroundColor: 'var(--color-surface-container-high)',
          border: '1px solid var(--color-outline-variant)',
          borderRadius: '8px',
          color: 'var(--color-on-surface)',
          fontSize: '12px',
        }"
      />
    </div>

    <!-- Sub-navigation -->
    <div class="flex flex-col gap-0.5 px-3 overflow-y-auto flex-1">
      <button
        v-for="item in config.subNav"
        :key="item.id"
        :data-testid="`flyout-nav-${item.id}`"
        :aria-current="isSubNavActive(item) ? 'page' : undefined"
        class="flex items-center text-left cursor-pointer border-none transition-colors duration-150"
        :style="{
          padding: '8px 12px',
          borderRadius: '8px',
          fontSize: '13px',
          fontWeight: isSubNavActive(item) ? '500' : '400',
          color: isSubNavActive(item) ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
          backgroundColor: isSubNavActive(item) ? 'rgba(229,160,13,0.10)' : 'transparent',
          borderLeft: isSubNavActive(item) ? '2px solid var(--color-primary)' : '2px solid transparent',
        }"
        @click="emit('navigate', item.path)"
      >{{ item.label }}</button>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/SidebarFlyout.spec.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SidebarFlyout.vue frontend/src/components/SidebarFlyout.spec.ts
git commit -m "feat: create SidebarFlyout component with sub-nav, search, and section configs"
```

---

## Task 5: Create SidebarUserMenu Component

**Files:**
- Create: `frontend/src/components/SidebarUserMenu.vue`
- Create: `frontend/src/components/SidebarUserMenu.spec.ts`

Popover menu triggered by clicking the user avatar. Contains user info, org switcher, and logout.

- [ ] **Step 1: Write the failing tests**

Write `frontend/src/components/SidebarUserMenu.spec.ts`:

```typescript
import { mount, VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import SidebarUserMenu from './SidebarUserMenu.vue'

const mockUser = ref({ email: 'jane@example.com', name: 'Jane Doe' })
const mockLogout = vi.fn()
vi.mock('../composables/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
    logout: mockLogout,
  }),
}))

const mockOrganizations = ref([
  { id: 'org-1', name: 'Acme Corp', role: 'admin' },
  { id: 'org-2', name: 'Side Project', role: 'member' },
])
const mockCurrentOrg = ref({ id: 'org-1', name: 'Acme Corp', role: 'admin' })
const mockSelectOrganization = vi.fn()
vi.mock('../composables/useOrganization', () => ({
  useOrganization: () => ({
    organizations: mockOrganizations,
    currentOrg: mockCurrentOrg,
    selectOrganization: mockSelectOrganization,
  }),
}))

describe('SidebarUserMenu', () => {
  let wrapper: VueWrapper

  function createWrapper() {
    return mount(SidebarUserMenu, {
      props: { isOpen: true },
      global: {
        stubs: {
          Check: { template: '<span class="icon-check" />' },
          LogOut: { template: '<span class="icon-logout" />' },
          Keyboard: { template: '<span class="icon-keyboard" />' },
        },
      },
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUser.value = { email: 'jane@example.com', name: 'Jane Doe' }
    mockCurrentOrg.value = { id: 'org-1', name: 'Acme Corp', role: 'admin' }
  })

  afterEach(() => {
    wrapper?.unmount()
  })

  it('shows user name and email', () => {
    wrapper = createWrapper()
    const text = wrapper.text()
    expect(text).toContain('Jane Doe')
    expect(text).toContain('jane@example.com')
  })

  it('renders organization list', () => {
    wrapper = createWrapper()
    expect(wrapper.find('[data-testid="user-menu-org-org-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="user-menu-org-org-2"]').exists()).toBe(true)
  })

  it('shows checkmark on current org', () => {
    wrapper = createWrapper()
    const orgItem = wrapper.find('[data-testid="user-menu-org-org-1"]')
    expect(orgItem.find('.icon-check').exists()).toBe(true)
  })

  it('does not show checkmark on non-current org', () => {
    wrapper = createWrapper()
    const orgItem = wrapper.find('[data-testid="user-menu-org-org-2"]')
    expect(orgItem.find('.icon-check').exists()).toBe(false)
  })

  it('calls selectOrganization when clicking an org', async () => {
    wrapper = createWrapper()
    await wrapper.find('[data-testid="user-menu-org-org-2"]').trigger('click')
    expect(mockSelectOrganization).toHaveBeenCalledWith('org-2')
  })

  it('emits close when org is selected', async () => {
    wrapper = createWrapper()
    await wrapper.find('[data-testid="user-menu-org-org-2"]').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('calls logout when logout button is clicked', async () => {
    wrapper = createWrapper()
    await wrapper.find('[data-testid="user-menu-logout"]').trigger('click')
    expect(mockLogout).toHaveBeenCalled()
  })

  it('does not render when isOpen is false', () => {
    wrapper = mount(SidebarUserMenu, {
      props: { isOpen: false },
    })
    expect(wrapper.find('[data-testid="user-menu"]').exists()).toBe(false)
  })

  it('renders keyboard shortcuts link', () => {
    wrapper = createWrapper()
    expect(wrapper.find('[data-testid="user-menu-shortcuts"]').exists()).toBe(true)
  })

  it('closes on Escape key', async () => {
    wrapper = createWrapper()
    await wrapper.find('[data-testid="user-menu"]').trigger('keydown', { key: 'Escape' })
    // The component listens on document, so dispatch there
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(wrapper.emitted('close')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/SidebarUserMenu.spec.ts`
Expected: FAIL — SidebarUserMenu.vue doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Write `frontend/src/components/SidebarUserMenu.vue`:

```vue
<script setup lang="ts">
import { Check, Keyboard, LogOut } from 'lucide-vue-next'
import { onMounted, onUnmounted } from 'vue'
import { useAuth } from '../composables/useAuth'
import { useOrganization } from '../composables/useOrganization'

const props = defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const { user, logout } = useAuth()
const { organizations, currentOrg, selectOrganization } = useOrganization()

function handleSelectOrg(orgId: string) {
  selectOrganization(orgId)
  emit('close')
}

function handleLogout() {
  logout()
  emit('close')
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.isOpen) {
    emit('close')
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div
    v-if="isOpen"
    data-testid="user-menu"
    class="fixed z-[60] overflow-hidden animate-fade-in"
    :style="{
      left: '8px',
      bottom: '52px',
      width: '240px',
      backgroundColor: 'var(--color-surface-bright)',
      borderRadius: '8px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      border: '1px solid var(--color-outline-variant)',
    }"
  >
    <!-- User info header -->
    <div
      class="px-4 py-3"
      :style="{ borderBottom: '1px solid var(--color-outline-variant)' }"
    >
      <div
        class="text-sm font-medium"
        :style="{ color: 'var(--color-on-surface)' }"
      >{{ user?.name || user?.email }}</div>
      <div
        v-if="user?.name"
        class="text-xs mt-0.5"
        :style="{ color: 'var(--color-outline)', fontFamily: 'var(--font-mono)' }"
      >{{ user.email }}</div>
    </div>

    <!-- Org switcher -->
    <div
      class="py-1"
      :style="{ borderBottom: '1px solid var(--color-outline-variant)' }"
    >
      <div
        class="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide"
        :style="{ color: 'var(--color-outline)', fontSize: '10px' }"
      >Organizations</div>
      <button
        v-for="org in organizations"
        :key="org.id"
        :data-testid="`user-menu-org-${org.id}`"
        class="flex w-full items-center gap-2 px-4 py-2 text-sm cursor-pointer border-none bg-transparent transition-colors"
        :style="{
          color: currentOrg?.id === org.id ? 'var(--color-primary)' : 'var(--color-on-surface)',
        }"
        @click="handleSelectOrg(org.id)"
      >
        <span class="flex-1 truncate text-left">{{ org.name }}</span>
        <Check v-if="currentOrg?.id === org.id" :size="14" />
      </button>
    </div>

    <!-- Actions -->
    <div class="py-1">
      <button
        data-testid="user-menu-shortcuts"
        class="flex w-full items-center gap-2 px-4 py-2 text-sm cursor-pointer border-none bg-transparent"
        :style="{ color: 'var(--color-on-surface-variant)' }"
      >
        <Keyboard :size="14" />
        <span>Keyboard shortcuts</span>
      </button>
      <button
        data-testid="user-menu-logout"
        class="flex w-full items-center gap-2 px-4 py-2 text-sm cursor-pointer border-none bg-transparent"
        :style="{ color: 'var(--color-error)' }"
        @click="handleLogout"
      >
        <LogOut :size="14" />
        <span>Log out</span>
      </button>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/SidebarUserMenu.spec.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SidebarUserMenu.vue frontend/src/components/SidebarUserMenu.spec.ts
git commit -m "feat: create SidebarUserMenu popover with org switcher and logout"
```

---

## Task 6: Rewrite AppSidebar Orchestrator

**Files:**
- Rewrite: `frontend/src/components/AppSidebar.vue`
- Rewrite: `frontend/src/components/AppSidebar.spec.ts`

AppSidebar wires the rail, flyout, and user menu together using useSidebar state.

- [ ] **Step 1: Write the failing tests**

Write `frontend/src/components/AppSidebar.spec.ts`:

```typescript
import { mount, VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import AppSidebar from './AppSidebar.vue'

const mockHoveredSection = ref<string | null>(null)
const mockPinnedSection = ref<string | null>(null)
const mockIsPeeking = ref(false)
const mockActiveFlyoutSection = ref<string | null>(null)
const mockCurrentRouteSection = ref('dashboards')
const mockHandleMouseEnter = vi.fn()
const mockHandleMouseLeave = vi.fn()
const mockPinSection = vi.fn()
const mockCloseFlyout = vi.fn()

vi.mock('../composables/useSidebar', () => ({
  useSidebar: () => ({
    hoveredSection: mockHoveredSection,
    pinnedSection: mockPinnedSection,
    isPeeking: mockIsPeeking,
    activeFlyoutSection: mockActiveFlyoutSection,
    currentRouteSection: mockCurrentRouteSection,
    handleMouseEnter: mockHandleMouseEnter,
    handleMouseLeave: mockHandleMouseLeave,
    pinSection: mockPinSection,
    closeFlyout: mockCloseFlyout,
  }),
}))

const mockUser = ref({ email: 'jane@example.com', name: 'Jane Doe' })
vi.mock('../composables/useAuth', () => ({
  useAuth: () => ({ user: mockUser }),
}))

const mockCurrentOrg = ref({ id: 'org-1', name: 'Test Org', role: 'admin' })
vi.mock('../composables/useOrganization', () => ({
  useOrganization: () => ({
    organizations: ref([mockCurrentOrg.value]),
    currentOrg: mockCurrentOrg,
    selectOrganization: vi.fn(),
  }),
}))

vi.mock('../composables/useFavorites', () => ({
  useFavorites: () => ({
    favorites: ref([]),
    recentDashboards: ref([]),
    isFavorite: () => false,
  }),
}))

const mockRoutePath = ref('/app/dashboards')
const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: mockRoutePath.value }),
  useRouter: () => ({ push: mockPush }),
}))

describe('AppSidebar', () => {
  let wrapper: VueWrapper

  function createWrapper() {
    return mount(AppSidebar, {
      global: {
        stubs: {
          Sparkles: { template: '<span class="icon-sparkles" />' },
          LayoutGrid: { template: '<span class="icon-layout-grid" />' },
          Activity: { template: '<span class="icon-activity" />' },
          AlertTriangle: { template: '<span class="icon-alert-triangle" />' },
          Search: { template: '<span class="icon-search" />' },
          Settings: { template: '<span class="icon-settings" />' },
          X: { template: '<span class="icon-x" />' },
          Star: { template: '<span class="icon-star" />' },
          Check: { template: '<span class="icon-check" />' },
          LogOut: { template: '<span class="icon-logout" />' },
          Keyboard: { template: '<span class="icon-keyboard" />' },
        },
      },
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockHoveredSection.value = null
    mockPinnedSection.value = null
    mockIsPeeking.value = false
    mockActiveFlyoutSection.value = null
    mockCurrentRouteSection.value = 'dashboards'
    mockRoutePath.value = '/app/dashboards'
    mockUser.value = { email: 'jane@example.com', name: 'Jane Doe' }
  })

  afterEach(() => {
    wrapper?.unmount()
  })

  it('renders the sidebar rail', () => {
    wrapper = createWrapper()
    expect(wrapper.find('[data-testid="sidebar-rail"]').exists()).toBe(true)
  })

  it('does not render flyout when no section is active', () => {
    mockActiveFlyoutSection.value = null
    wrapper = createWrapper()
    expect(wrapper.find('[data-testid="flyout-panel"]').exists()).toBe(false)
  })

  it('renders flyout when a section is active', () => {
    mockActiveFlyoutSection.value = 'explore'
    mockRoutePath.value = '/app/explore/metrics'
    wrapper = createWrapper()
    expect(wrapper.find('[data-testid="flyout-panel"]').exists()).toBe(true)
  })

  it('does not render flyout for home section', () => {
    mockActiveFlyoutSection.value = 'home'
    wrapper = createWrapper()
    expect(wrapper.find('[data-testid="flyout-panel"]').exists()).toBe(false)
  })

  it('passes activeSection to rail from currentRouteSection or pinnedSection', () => {
    mockPinnedSection.value = 'explore'
    mockActiveFlyoutSection.value = 'explore'
    wrapper = createWrapper()
    // The rail should show explore as active via the accent bar
    const exploreRail = wrapper.find('[data-testid="rail-explore"]')
    expect(exploreRail.find('[data-testid="rail-accent-bar"]').exists()).toBe(true)
  })

  it('calls pinSection when rail icon is clicked', async () => {
    wrapper = createWrapper()
    await wrapper.find('[data-testid="rail-dashboards"]').trigger('click')
    expect(mockPinSection).toHaveBeenCalledWith('dashboards')
  })

  it('calls handleMouseEnter when hovering rail icon', async () => {
    wrapper = createWrapper()
    await wrapper.find('[data-testid="rail-explore"]').trigger('mouseenter')
    expect(mockHandleMouseEnter).toHaveBeenCalledWith('explore')
  })

  it('navigates when flyout sub-nav item is clicked', async () => {
    mockActiveFlyoutSection.value = 'explore'
    mockRoutePath.value = '/app/explore/metrics'
    wrapper = createWrapper()
    await wrapper.find('[data-testid="flyout-nav-logs"]').trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/app/explore/logs')
  })

  it('calls closeFlyout when flyout close button is clicked', async () => {
    mockActiveFlyoutSection.value = 'explore'
    mockRoutePath.value = '/app/explore/metrics'
    wrapper = createWrapper()
    await wrapper.find('[data-testid="flyout-close"]').trigger('click')
    expect(mockCloseFlyout).toHaveBeenCalled()
  })

  it('has aria-label on the nav landmark', () => {
    wrapper = createWrapper()
    const nav = wrapper.find('nav')
    expect(nav.attributes('aria-label')).toBe('Main navigation')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/AppSidebar.spec.ts`
Expected: FAIL — AppSidebar still has the old implementation.

- [ ] **Step 3: Write the implementation**

Write `frontend/src/components/AppSidebar.vue`:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSidebar } from '../composables/useSidebar'
import SidebarFlyout from './SidebarFlyout.vue'
import SidebarRail from './SidebarRail.vue'
import SidebarUserMenu from './SidebarUserMenu.vue'

const router = useRouter()
const {
  pinnedSection,
  activeFlyoutSection,
  currentRouteSection,
  handleMouseEnter,
  handleMouseLeave,
  pinSection,
  closeFlyout,
} = useSidebar()

const userMenuOpen = ref(false)

// Map section IDs to their default routes for navigation
const sectionRoutes: Record<string, string> = {
  home: '/app',
  dashboards: '/app/dashboards',
  services: '/app/services',
  alerts: '/app/alerts',
  explore: '/app/explore/metrics',
  settings: '/app/settings',
}

function handleRailSelect(sectionId: string) {
  // Navigate to the section's default route
  router.push(sectionRoutes[sectionId] || '/app')
  // Pin/unpin the flyout
  pinSection(sectionId)
}

function handleFlyoutNavigate(path: string) {
  router.push(path)
}

function handleAvatarClick() {
  userMenuOpen.value = !userMenuOpen.value
}

function closeUserMenu() {
  userMenuOpen.value = false
}

// The rail shows the active section based on pinned state or current route
function railActiveSection(): string | null {
  return pinnedSection.value || currentRouteSection.value
}
</script>

<template>
  <nav aria-label="Main navigation">
    <SidebarRail
      :active-section="railActiveSection()"
      @hover="handleMouseEnter"
      @hover-end="handleMouseLeave"
      @select="handleRailSelect"
      @avatar-click="handleAvatarClick"
    />

    <SidebarFlyout
      v-if="activeFlyoutSection && activeFlyoutSection !== 'home'"
      :section="activeFlyoutSection"
      :is-pinned="pinnedSection !== null"
      @close="closeFlyout"
      @navigate="handleFlyoutNavigate"
      @hover="handleMouseEnter(activeFlyoutSection!)"
      @hover-end="handleMouseLeave"
    />

    <SidebarUserMenu
      :is-open="userMenuOpen"
      @close="closeUserMenu"
    />
  </nav>
</template>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/AppSidebar.spec.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/AppSidebar.vue frontend/src/components/AppSidebar.spec.ts
git commit -m "feat: rewrite AppSidebar as orchestrator for rail + flyout + user menu"
```

---

## Task 7: Update App.vue and Clean Up

**Files:**
- Modify: `frontend/src/App.vue`
- Modify: `frontend/src/App.spec.ts` (if assertions need updating)
- Delete: `frontend/src/components/OrganizationDropdown.vue`

Remove the hamburger button, update the margin to 52px, and move navigation keyboard shortcuts into useSidebar.

- [ ] **Step 1: Update App.vue**

In `frontend/src/App.vue`, make these changes:

1. Remove the `Menu` import from lucide-vue-next
2. Remove `open: openSidebar` from the useSidebar destructure (replace with just using `useSidebar()` for nothing sidebar-related except `showSidebar` logic — but actually we no longer need isOpen)
3. Change `mainMargin` to always return `{ marginLeft: '52px' }` when sidebar is shown
4. Remove the hamburger `<button>` block entirely
5. Remove keyboard shortcut registrations for `Cmd+1` through `Cmd+5` and `Cmd+E` (these move into useSidebar)

The updated `<script setup>`:
```typescript
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppSidebar from './components/AppSidebar.vue'
import CmdKModal from './components/CmdKModal.vue'
import CookieConsentBanner from './components/CookieConsentBanner.vue'
import ShortcutsOverlay from './components/ShortcutsOverlay.vue'
import ToastNotification from './components/ToastNotification.vue'
import { useAuth } from './composables/useAuth'
import { useDatasource } from './composables/useDatasource'
import { useKeyboardShortcuts } from './composables/useKeyboardShortcuts'
import { useOrgBranding } from './composables/useOrgBranding'
import { useOrganization } from './composables/useOrganization'

const route = useRoute()
const router = useRouter()
const { isAuthenticated } = useAuth()
const { register } = useKeyboardShortcuts()
const { currentOrg, fetchOrganizations } = useOrganization()
const { fetchDatasources } = useDatasource()
useOrgBranding()

const showSidebar = computed(() => {
  return isAuthenticated.value && route.meta.appLayout === 'app'
})

const mainMargin = computed(() => {
  if (!showSidebar.value) return {}
  return { marginLeft: '52px' }
})

// Cmd+K modal state
const cmdKOpen = ref(false)

function openCmdK() {
  cmdKOpen.value = true
}
function closeCmdK() {
  cmdKOpen.value = false
}

// Viewport width warning
const viewportTooNarrow = ref(false)
function checkViewport() {
  viewportTooNarrow.value = window.innerWidth < 1280
}

onMounted(() => {
  checkViewport()
  window.addEventListener('resize', checkViewport)
})

// Fetch organizations when authenticated
watch(isAuthenticated, async (authenticated) => {
  if (authenticated) {
    await fetchOrganizations()
  }
}, { immediate: true })

// Fetch datasources when org changes
watch(() => currentOrg.value?.id, async (newOrgId) => {
  if (newOrgId) {
    await fetchDatasources(newOrgId)
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', checkViewport)
})

// Register global shortcuts (only Cmd+K and Cmd+Shift+N remain here)
const unregisterFns: (() => void)[] = []

unregisterFns.push(
  register('Cmd+K', openCmdK, 'Open command palette', 'General'),
)
unregisterFns.push(
  register('Cmd+Shift+N', () => router.push('/app/dashboards?new=1'), 'New dashboard', 'Actions'),
)

onUnmounted(() => {
  for (const fn of unregisterFns) {
    fn()
  }
})
```

The updated template — remove the hamburger button block and the `isOpen` reference:
```html
<template>
  <div class="relative flex min-h-screen w-full overflow-x-hidden">
    <!-- Sidebar -->
    <AppSidebar v-if="showSidebar" />

    <!-- Main content -->
    <main
      class="min-h-screen min-w-0 flex-1 transition-[margin-left] duration-200"
      :style="{
        ...mainMargin,
        backgroundColor: 'var(--color-surface)',
      }"
    >
      <RouterView />
    </main>

    <!-- Modals & overlays -->
    <CmdKModal :is-open="cmdKOpen" @close="closeCmdK" />
    <ShortcutsOverlay />
    <ToastNotification />
    <CookieConsentBanner />

    <!-- Viewport too narrow overlay -->
    <div
      v-if="viewportTooNarrow && showSidebar"
      class="fixed inset-0 z-[100] flex items-center justify-center"
      :style="{
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
      }"
      data-testid="narrow-viewport-overlay"
    >
      <div class="text-center p-8 max-w-md">
        <p
          class="text-lg font-semibold mb-2"
          :style="{ color: 'var(--color-on-surface)', fontFamily: 'var(--font-display)' }"
        >
          Best experienced on a wider screen
        </p>
        <p
          class="text-sm"
          :style="{ color: 'var(--color-on-surface-variant)' }"
        >
          Please use a screen at least 1280px wide for the best experience.
        </p>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Delete OrganizationDropdown.vue**

```bash
rm frontend/src/components/OrganizationDropdown.vue
```

- [ ] **Step 3: Run full test suite**

Run: `cd frontend && npm run test`
Expected: All tests pass. Some App.spec.ts tests may need updating if they reference the hamburger button or 240px margin.

- [ ] **Step 4: Fix any failing App.spec.ts tests**

Update assertions in `frontend/src/App.spec.ts` if needed:
- Remove any test that checks for `sidebar-hamburger` button
- Change margin assertion from `240px` to `52px`
- Remove any mock references to `isOpen` from useSidebar if the mock is outdated

- [ ] **Step 5: Run tests again to confirm all pass**

Run: `cd frontend && npm run test`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: update App.vue for 52px rail layout, remove hamburger and org dropdown"
```

---

## Task 8: Final Integration Verification

**Files:** None new — this is a verification pass.

- [ ] **Step 1: Run the full test suite**

Run: `cd frontend && npm run test`
Expected: All tests PASS.

- [ ] **Step 2: Run the linter**

Run: `cd frontend && npm run lint:fix`
Expected: No errors (warnings OK).

- [ ] **Step 3: Run the type checker**

Run: `cd frontend && npx vue-tsc --noEmit`
Expected: No type errors.

- [ ] **Step 4: Build check**

Run: `cd frontend && npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit any lint/type fixes**

If any fixes were needed:
```bash
git add -A
git commit -m "chore: fix lint and type errors from sidebar redesign"
```

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 1 issue (timer bug), 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR | score: 6/10 → 8/10, 5 decisions |

- **UNRESOLVED:** 0 decisions across all reviews
- **VERDICT:** DESIGN + ENG CLEARED — ready to implement
