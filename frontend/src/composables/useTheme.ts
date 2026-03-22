import { ref } from 'vue'

const isDark = ref(true)

// Ensure document always has dark class (for any components that check for it)
document.documentElement.classList.add('dark')

export function useTheme() {
  /** No-op — dark is the only mode. Kept for backward compatibility. */
  function setMode(_mode?: string) {
    // intentionally empty
  }

  /** No-op — dark is the only mode. */
  function cycle() {
    // intentionally empty
  }

  return { mode: ref('dark'), isDark, setMode, cycle }
}
