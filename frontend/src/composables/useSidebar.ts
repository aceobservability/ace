import { ref } from 'vue'

const STORAGE_KEY = 'ace-sidebar-open'
const WIDE_BREAKPOINT = 1440

function readDefault(): boolean {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored !== null) {
    return stored === 'true'
  }
  return typeof window !== 'undefined' && window.innerWidth >= WIDE_BREAKPOINT
}

const isOpen = ref(readDefault())

function persist(): void {
  localStorage.setItem(STORAGE_KEY, String(isOpen.value))
}

function handleKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
    e.preventDefault()
    toggle()
  }
}

// Listen for Cmd+B / Ctrl+B
window.addEventListener('keydown', handleKeydown)

function toggle(): void {
  isOpen.value = !isOpen.value
  persist()
}

function open(): void {
  isOpen.value = true
  persist()
}

function close(): void {
  isOpen.value = false
  persist()
}

/** Re-read default from localStorage / viewport. Exposed for testing. */
function _reinit(): void {
  isOpen.value = readDefault()
}

export function useSidebar() {
  return {
    isOpen,
    toggle,
    open,
    close,
    _reinit,
  }
}
