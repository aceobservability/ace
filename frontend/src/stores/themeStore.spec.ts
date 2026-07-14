import { beforeEach, describe, expect, it } from 'vitest'
import { useThemeStore } from '@/stores/themeStore'

describe('useThemeStore', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
    useThemeStore.setState({ mode: 'dark', isDark: true })
  })

  it('persists light mode preference', () => {
    useThemeStore.getState().setMode('light')
    expect(localStorage.getItem('ace-theme')).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(useThemeStore.getState().isDark).toBe(false)
  })

  it('toggles between dark and light', () => {
    useThemeStore.getState().toggle()
    expect(useThemeStore.getState().mode).toBe('light')
    useThemeStore.getState().toggle()
    expect(useThemeStore.getState().mode).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })
})