import { type ComputedRef, type Ref, computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

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

function readPersistedExpanded(): boolean {
  try {
    const stored = localStorage.getItem('ace-sidebar-expanded')
    if (stored === 'true') return true
    if (stored === 'false') return false
    return true
  } catch {
    return true
  }
}

// Module-level singleton state
const isExpanded = ref<boolean>(readPersistedExpanded())
const expandedSections = ref<Set<string>>(new Set())

let cachedRoutePath: { value: string } | null = null
let router: { push: (path: string) => void } | null = null

function toggleSidebar() {
  isExpanded.value = !isExpanded.value
  try {
    localStorage.setItem('ace-sidebar-expanded', String(isExpanded.value))
  } catch {
    // Ignore localStorage write failures
  }
}

function toggleSection(sectionId: string) {
  if (expandedSections.value.has(sectionId)) {
    expandedSections.value.delete(sectionId)
  } else {
    expandedSections.value.add(sectionId)
  }
}

function expandSection(sectionId: string) {
  expandedSections.value.add(sectionId)
}

function handleKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
    e.preventDefault()
    toggleSidebar()
    return
  }

  if ((e.metaKey || e.ctrlKey) && SHORTCUT_NAV[e.key]) {
    e.preventDefault()
    const { section, route: targetRoute } = SHORTCUT_NAV[e.key]
    router?.push(targetRoute)

    if (section !== 'home') {
      expandSection(section)
    }
  }
}

let listenerRegistered = false

function _reset() {
  isExpanded.value = readPersistedExpanded()
  expandedSections.value = new Set()
  cachedRoutePath = null
  router = null
}

export function useSidebar(): {
  isExpanded: Ref<boolean>
  sidebarWidth: ComputedRef<string>
  expandedSections: Ref<Set<string>>
  currentRouteSection: ComputedRef<string>
  toggleSidebar: () => void
  toggleSection: (sectionId: string) => void
  expandSection: (sectionId: string) => void
  _reset: () => void
} {
  const route = useRoute()
  const routerInstance = useRouter()

  if (!cachedRoutePath) {
    cachedRoutePath = { get value() { return route.path } }
    router = routerInstance
  }

  if (!listenerRegistered) {
    window.addEventListener('keydown', handleKeydown)
    listenerRegistered = true
  }

  const sidebarWidth = computed(() => isExpanded.value ? '220px' : '64px')
  const currentRouteSection = computed(() => routeToSection(route.path))

  return {
    isExpanded,
    sidebarWidth,
    expandedSections,
    currentRouteSection,
    toggleSidebar,
    toggleSection,
    expandSection,
    _reset,
  }
}
