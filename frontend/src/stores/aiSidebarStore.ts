import { create } from 'zustand'

const OPEN_KEY = 'ace-ai-sidebar-open'

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === 'true'
  } catch {
    return false
  }
}

export type AiSidebarContext = {
  message: string
  panelTitle?: string
}

type AiSidebarState = {
  isOpen: boolean
  pendingContext: AiSidebarContext | null
  open: (context?: AiSidebarContext) => void
  toggle: () => void
  close: () => void
  consumePendingContext: () => AiSidebarContext | null
}

export const useAiSidebarStore = create<AiSidebarState>((set, get) => ({
  isOpen: readOpen(),
  pendingContext: null,

  open(context) {
    localStorage.setItem(OPEN_KEY, 'true')
    set({
      isOpen: true,
      ...(context ? { pendingContext: context } : {}),
    })
  },

  toggle() {
    if (get().isOpen) {
      get().close()
      return
    }
    get().open()
  },

  close() {
    localStorage.setItem(OPEN_KEY, 'false')
    set({ isOpen: false })
  },

  consumePendingContext() {
    const ctx = get().pendingContext
    set({ pendingContext: null })
    return ctx
  },
}))
