// Polyfill localStorage for Node.js v22+ where a native but incomplete
// localStorage global exists and conflicts with happy-dom's implementation.
function createStoragePolyfill(): Storage {
  const store = new Map<string, string>()
  return {
    getItem(key: string) {
      return store.get(key) ?? null
    },
    setItem(key: string, value: string) {
      store.set(key, String(value))
    },
    removeItem(key: string) {
      store.delete(key)
    },
    clear() {
      store.clear()
    },
    get length() {
      return store.size
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null
    },
  } as Storage
}

if (
  typeof globalThis.localStorage === 'undefined' ||
  typeof globalThis.localStorage.getItem !== 'function'
) {
  globalThis.localStorage = createStoragePolyfill()
}

if (
  typeof globalThis.sessionStorage === 'undefined' ||
  typeof globalThis.sessionStorage.getItem !== 'function'
) {
  globalThis.sessionStorage = createStoragePolyfill()
}