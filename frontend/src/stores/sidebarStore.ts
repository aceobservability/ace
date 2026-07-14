import { routeToSection, type SidebarSectionId } from '@/lib/navigation'
import { create } from 'zustand'

const PINNED_KEY = 'ace-sidebar-pinned'

function readPinned(): boolean {
  try {
    return localStorage.getItem(PINNED_KEY) === 'true'
  } catch {
    return false
  }
}

type SidebarState = {
  expandedSection: SidebarSectionId | null
  isPinned: boolean
  toggleSection: (sectionId: SidebarSectionId) => void
  closeSection: () => void
  togglePin: (currentPath: string) => void
  syncPinnedRoute: (currentPath: string) => void
  _reset: () => void
}

export const useSidebarStore = create<SidebarState>((set, get) => ({
  expandedSection: null,
  isPinned: readPinned(),

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

  togglePin(currentPath) {
    const { isPinned } = get()
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

  syncPinnedRoute(currentPath) {
    if (!get().isPinned) return
    const section = routeToSection(currentPath)
    if (section !== 'home') {
      set({ expandedSection: section })
    }
  },

  _reset() {
    try {
      localStorage.removeItem(PINNED_KEY)
    } catch {
      /* noop */
    }
    set({ expandedSection: null, isPinned: false })
  },
}))