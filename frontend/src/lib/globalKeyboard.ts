type KeydownHandler = (event: KeyboardEvent) => boolean | void

const handlers = new Set<KeydownHandler>()
let listenerAttached = false

function handleKeydown(event: KeyboardEvent): void {
  for (const handler of handlers) {
    if (handler(event) === true) return
  }
}

function ensureListener(): void {
  if (listenerAttached) return
  window.addEventListener('keydown', handleKeydown)
  listenerAttached = true
}

/** Register a keydown handler. Return true to stop further handlers. */
export function registerKeydownHandler(handler: KeydownHandler): () => void {
  ensureListener()
  handlers.add(handler)
  return () => {
    handlers.delete(handler)
  }
}

/** Test helper — detach all handlers and listener. */
export function resetGlobalKeyboard(): void {
  handlers.clear()
  if (listenerAttached) {
    window.removeEventListener('keydown', handleKeydown)
    listenerAttached = false
  }
}