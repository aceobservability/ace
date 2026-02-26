import { ref, watchEffect } from 'vue'

export type ThemeMode = 'dark' | 'light' | 'system'

const STORAGE_KEY = 'ace-theme'
const mode = ref<ThemeMode>((localStorage.getItem(STORAGE_KEY) as ThemeMode) || 'system')

function getEffectiveTheme(m: ThemeMode): 'dark' | 'light' {
  if (m === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return m
}

function applyTheme(m: ThemeMode) {
  const effective = getEffectiveTheme(m)
  if (effective === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

// Watch system preference changes when in 'system' mode
const mq = window.matchMedia('(prefers-color-scheme: dark)')
mq.addEventListener('change', () => {
  if (mode.value === 'system') applyTheme('system')
})

// Apply immediately on import (before Vue renders)
applyTheme(mode.value)

export function useTheme() {
  function setMode(newMode: ThemeMode) {
    mode.value = newMode
    localStorage.setItem(STORAGE_KEY, newMode)
    applyTheme(newMode)
  }

  function cycle() {
    const order: ThemeMode[] = ['dark', 'light', 'system']
    const next = order[(order.indexOf(mode.value) + 1) % order.length] ?? 'system'
    setMode(next)
  }

  const isDark = ref(getEffectiveTheme(mode.value) === 'dark')
  watchEffect(() => {
    isDark.value = getEffectiveTheme(mode.value) === 'dark'
  })

  return { mode, isDark, setMode, cycle }
}
