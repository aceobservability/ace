import { create } from 'zustand'

const PINNED_KEY = 'ace-sidebar-pinned'

function readPinned(): boolean {
  try {
    return localStorage.getItem(PINNED_KEY) === 'true'
  } catch {
    return false
  }
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

export function routeToSection(path: string): string {
  for (const [prefix, section] of ROUTE_SECTION_MAP) {
    if (path.startsWith(prefix)) return section
  }
  if (path === '/app' || path === '/app/') return 'home'
  return 'home'
}

type NavigateFn = (path: string) => void

type SidebarState = {
  expandedSection: string | null
  isPinned: boolean
  currentPath: string
  navigate: NavigateFn | null
  toggleSection: (sectionId: string) => void
  closeSection: () => void
  togglePin: () => void
  setCurrentPath: (path: string) => void
  setNavigate: (fn: NavigateFn) => void
  handleKeydown: (e: KeyboardEvent) => void
  _reset: () => void
}

export const useSidebarStore = create<SidebarState>((set, get) => ({
  expandedSection: null,
  isPinned: readPinned(),
  currentPath: '/app',
  navigate: null,

  setCurrentPath(path) {
    const { isPinned } = get()
    set({ currentPath: path })
    if (isPinned) {
      const section = routeToSection(path)
      if (section !== 'home') {
        set({ expandedSection: section })
      }
    }
  },

  setNavigate(fn) {
    set({ navigate: fn })
  },

  toggleSection(sectionId) {
    const { expandedSection, isPinned } = get()
    if (isPinned) {
      set({ expandedSection: sectionId === 'home' ? null : sectionId })
      return
    }
    set({ expandedSection: expandedSection === sectionId ? null : sectionId })
  },

  closeSection() {
    if (get().isPinned) return
    set({ expandedSection: null })
  },

  togglePin() {
    const { isPinned, currentPath } = get()
    const next = !isPinned
    localStorage.setItem(PINNED_KEY, String(next))
    if (next) {
      const section = routeToSection(currentPath)
      set({
        isPinned: next,
        expandedSection: section !== 'home' ? section : get().expandedSection,
      })
    } else {
      set({ isPinned: next, expandedSection: null })
    }
  },

  handleKeydown(e) {
    const { isPinned, navigate, togglePin, closeSection } = get()

    if (e.key === 'Escape') {
      if (isPinned) {
        togglePin()
      } else {
        closeSection()
      }
      return
    }

    if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
      e.preventDefault()
      togglePin()
      return
    }

    if ((e.metaKey || e.ctrlKey) && SHORTCUT_NAV[e.key]) {
      e.preventDefault()
      const { section, route: targetRoute } = SHORTCUT_NAV[e.key]
      navigate?.(targetRoute)
      if (section !== 'home') {
        set({ expandedSection: section })
      }
    }
  },

  _reset() {
    try {
      localStorage.removeItem(PINNED_KEY)
    } catch {
      /* noop */
    }
    set({
      expandedSection: null,
      isPinned: false,
      currentPath: '/app',
      navigate: null,
    })
  },
}))

let listenerRegistered = false

export function registerSidebarKeydownListener(): void {
  if (listenerRegistered) return
  window.addEventListener('keydown', e => {
    useSidebarStore.getState().handleKeydown(e)
  })
  listenerRegistered = true
}

export function currentRouteSection(path: string): string {
  return routeToSection(path)
}