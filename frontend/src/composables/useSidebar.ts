import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const HOVER_DELAY = 200
const CLOSE_DELAY = 150
const AUTO_CLOSE_DELAY = 2000

const hoveredSection = ref<string | null>(null)
const pinnedSection = ref<string | null>(null)

let hoverTimer: ReturnType<typeof setTimeout> | null = null
let closeTimer: ReturnType<typeof setTimeout> | null = null
let autoCloseTimer: ReturnType<typeof setTimeout> | null = null

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

function clearAutoCloseTimer() {
  if (autoCloseTimer) { clearTimeout(autoCloseTimer); autoCloseTimer = null }
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
  ['/app/audit-log', 'settings'],
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

  if ((e.metaKey || e.ctrlKey) && SHORTCUT_NAV[e.key]) {
    e.preventDefault()
    const { section, route: targetRoute } = SHORTCUT_NAV[e.key]
    router?.push(targetRoute)

    if (section === 'home') return

    clearAutoCloseTimer()
    pinnedSection.value = section
    hoveredSection.value = null

    autoCloseTimer = setTimeout(() => {
      if (pinnedSection.value === section) {
        pinnedSection.value = null
      }
      autoCloseTimer = null
    }, AUTO_CLOSE_DELAY)
  }
}

let listenerRegistered = false

function _reset() {
  clearTimers()
  clearAutoCloseTimer()
  hoveredSection.value = null
  pinnedSection.value = null
  cachedRoutePath = null
  router = null
}

export function useSidebar() {
  const route = useRoute()
  const routerInstance = useRouter()

  // Initialise router/route cache once — prevents silent overwrite from multiple callers
  if (!cachedRoutePath) {
    cachedRoutePath = { get value() { return route.path } }
    router = routerInstance
  }

  if (!listenerRegistered) {
    window.addEventListener('keydown', handleKeydown)
    listenerRegistered = true
  }

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
