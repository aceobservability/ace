// Polyfill localStorage for Node.js v22+ where a native but incomplete
// localStorage global exists and conflicts with happy-dom's implementation.
if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage.getItem !== 'function') {
  const store: Record<string, string> = {}
  globalThis.localStorage = {
    getItem(key: string) {
      return store[key] ?? null
    },
    setItem(key: string, value: string) {
      store[key] = String(value)
    },
    removeItem(key: string) {
      delete store[key]
    },
    clear() {
      for (const key of Object.keys(store)) {
        delete store[key]
      }
    },
    get length() {
      return Object.keys(store).length
    },
    key(index: number) {
      return Object.keys(store)[index] ?? null
    },
  } as Storage
}

if (typeof globalThis.sessionStorage === 'undefined' || typeof globalThis.sessionStorage.getItem !== 'function') {
  const store: Record<string, string> = {}
  globalThis.sessionStorage = {
    getItem(key: string) {
      return store[key] ?? null
    },
    setItem(key: string, value: string) {
      store[key] = String(value)
    },
    removeItem(key: string) {
      delete store[key]
    },
    clear() {
      for (const key of Object.keys(store)) {
        delete store[key]
      }
    },
    get length() {
      return Object.keys(store).length
    },
    key(index: number) {
      return Object.keys(store)[index] ?? null
    },
  } as Storage
}
