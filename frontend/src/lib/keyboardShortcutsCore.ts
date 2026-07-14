export type ShortcutEntry = {
  keys: string
  label: string
  category: string
}

export type RegisteredShortcut = ShortcutEntry & {
  id: number
  callback: () => void
}

let nextId = 0

export function parseShortcut(shortcut: string): {
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

export function matchesShortcut(shortcut: string, event: KeyboardEvent): boolean {
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

export function createShortcutRegistry() {
  let shortcuts: RegisteredShortcut[] = []

  function list(): ShortcutEntry[] {
    return shortcuts.map(({ keys, label, category }) => ({ keys, label, category }))
  }

  function register(
    keys: string,
    callback: () => void,
    label: string,
    category: string,
  ): () => void {
    const id = nextId++
    const entry: RegisteredShortcut = { id, keys, callback, label, category }
    shortcuts = [...shortcuts, entry]
    return () => {
      shortcuts = shortcuts.filter(s => s.id !== id)
    }
  }

  function reset(): void {
    shortcuts = []
    nextId = 0
  }

  function dispatch(event: KeyboardEvent): boolean {
    for (const shortcut of shortcuts) {
      if (matchesShortcut(shortcut.keys, event)) {
        event.preventDefault()
        shortcut.callback()
        return true
      }
    }
    return false
  }

  return { list, register, reset, dispatch }
}