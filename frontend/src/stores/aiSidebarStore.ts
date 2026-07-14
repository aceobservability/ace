import { create } from 'zustand'

const OPEN_KEY = 'ace-ai-sidebar-open'

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === 'true'
  } catch {
    return false
  }
}

type AiSidebarState = {
  isOpen: boolean
  toggle: () => void
  close: () => void
}

export const useAiSidebarStore = create<AiSidebarState>((set, get) => ({
  isOpen: readOpen(),

  toggle() {
    const next = !get().isOpen
    localStorage.setItem(OPEN_KEY, String(next))
    set({ isOpen: next })
  },

  close() {
    localStorage.setItem(OPEN_KEY, 'false')
    set({ isOpen: false })
  },
}))