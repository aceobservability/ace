import { create } from 'zustand'

export type ShortcutEntry = {
  keys: string
  label: string
  category: string
}

type RegisteredShortcut = ShortcutEntry & {
  id: number
  callback: () => void
}

let nextId = 0
let internalShortcuts: RegisteredShortcut[] = []

type ShortcutState = {
  showHelp: boolean
  shortcuts: ShortcutEntry[]
  register: (shortcut: string, callback: () => void, label: string, category: string) => () => void
  toggleHelp: () => void
  setShowHelp: (show: boolean) => void
  _reset: () => void
}

function syncShortcutsList(set: (partial: Partial<ShortcutState>) => void): void {
  set({
    shortcuts: internalShortcuts.map(({ keys, label, category }) => ({
      keys,
      label,
      category,
    })),
  })
}

function parseShortcut(shortcut: string): {
  key: string
  meta: boolean
  shift: boolean
  alt: boolean
} {
  const parts = shortcut.split('+')
  let meta = false
  let shift = false
  let alt = false
  let key = ''

  for (const part of parts) {
    const lower = part.toLowerCase()
    if (lower === 'cmd' || lower === 'ctrl') {
      meta = true
    } else if (lower === 'shift') {
      shift = true
    } else if (lower === 'alt') {
      alt = true
    } else {
      key = part.toLowerCase()
    }
  }

  return { key, meta, shift, alt }
}

function matchesEvent(shortcut: string, event: KeyboardEvent): boolean {
  const parsed = parseShortcut(shortcut)
  const eventKey = event.key.toLowerCase()
  const eventMeta = event.metaKey || event.ctrlKey

  return (
    eventKey === parsed.key &&
    eventMeta === parsed.meta &&
    event.shiftKey === parsed.shift &&
    event.altKey === parsed.alt
  )
}

function registerHelpShortcut(): void {
  useKeyboardShortcutsStore.getState().register(
    'Cmd+/',
    () => {
      const { showHelp } = useKeyboardShortcutsStore.getState()
      useKeyboardShortcutsStore.setState({ showHelp: !showHelp })
    },
    'Toggle shortcuts help',
    'General',
  )
}

export const useKeyboardShortcutsStore = create<ShortcutState>((set, get) => ({
  showHelp: false,
  shortcuts: [],

  register(shortcut, callback, label, category) {
    const id = nextId++
    const entry: RegisteredShortcut = { id, keys: shortcut, callback, label, category }
    internalShortcuts = [...internalShortcuts, entry]
    syncShortcutsList(set)
    return () => {
      internalShortcuts = internalShortcuts.filter(s => s.id !== id)
      syncShortcutsList(set)
    }
  },

  toggleHelp() {
    set({ showHelp: !get().showHelp })
  },

  setShowHelp(show) {
    set({ showHelp: show })
  },

  _reset() {
    internalShortcuts = []
    nextId = 0
    set({ showHelp: false, shortcuts: [] })
    registerHelpShortcut()
  },
}))

registerHelpShortcut()

window.addEventListener('keydown', e => {
  for (const shortcut of internalShortcuts) {
    if (matchesEvent(shortcut.keys, e)) {
      e.preventDefault()
      shortcut.callback()
      return
    }
  }
})