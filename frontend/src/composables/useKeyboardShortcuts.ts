import { ref } from 'vue'

export interface ShortcutEntry {
  keys: string
  label: string
  category: string
}

interface RegisteredShortcut extends ShortcutEntry {
  id: number
  callback: () => void
}

let nextId = 0
const showHelp = ref(false)

// Use a plain array (not reactive) for internal handler lookup so that
// reference identity is preserved and unregister works reliably.
let internalShortcuts: RegisteredShortcut[] = []

// Reactive list exposed to consumers (without callbacks)
const shortcuts = ref<ShortcutEntry[]>([])

function syncShortcutsList(): void {
  shortcuts.value = internalShortcuts.map(({ keys, label, category }) => ({
    keys,
    label,
    category,
  }))
}

/**
 * Parse a shortcut string like "Cmd+Shift+K" into its parts.
 */
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

function handleKeydown(e: KeyboardEvent): void {
  for (const shortcut of internalShortcuts) {
    if (matchesEvent(shortcut.keys, e)) {
      e.preventDefault()
      shortcut.callback()
      return
    }
  }
}

// Global keydown listener (attached once at module load)
window.addEventListener('keydown', handleKeydown)

/**
 * Register a keyboard shortcut.
 * @returns An unregister function.
 */
function register(
  shortcut: string,
  callback: () => void,
  label: string,
  category: string,
): () => void {
  const id = nextId++
  const entry: RegisteredShortcut = { id, keys: shortcut, callback, label, category }
  internalShortcuts = [...internalShortcuts, entry]
  syncShortcutsList()

  return () => {
    internalShortcuts = internalShortcuts.filter((s) => s.id !== id)
    syncShortcutsList()
  }
}

// Pre-register Cmd+/ for help overlay toggle
function registerHelpShortcut(): void {
  register('Cmd+/', () => { showHelp.value = !showHelp.value }, 'Toggle shortcuts help', 'General')
}

registerHelpShortcut()

/** Reset all state. Exposed for testing. */
function _reset(): void {
  internalShortcuts = []
  showHelp.value = false
  registerHelpShortcut()
}

export function useKeyboardShortcuts() {
  return {
    register,
    showHelp,
    shortcuts,
    _reset,
  }
}
