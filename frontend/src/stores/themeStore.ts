import { create } from 'zustand'

export type ThemeMode = 'dark' | 'light'

const THEME_KEY = 'ace-theme'

function readStoredMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    return stored === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

function applyMode(mode: ThemeMode): void {
  document.documentElement.classList.toggle('dark', mode === 'dark')
}

function persistMode(mode: ThemeMode): void {
  localStorage.setItem(THEME_KEY, mode)
}

type ThemeState = {
  mode: ThemeMode
  isDark: boolean
  initialize: () => void
  setMode: (mode: ThemeMode) => void
  toggle: () => void
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: readStoredMode(),
  isDark: readStoredMode() === 'dark',

  initialize() {
    const mode = readStoredMode()
    applyMode(mode)
    set({ mode, isDark: mode === 'dark' })
  },

  setMode(mode) {
    persistMode(mode)
    applyMode(mode)
    set({ mode, isDark: mode === 'dark' })
  },

  toggle() {
    const next: ThemeMode = get().mode === 'dark' ? 'light' : 'dark'
    get().setMode(next)
  },
}))