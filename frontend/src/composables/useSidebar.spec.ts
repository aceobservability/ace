import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSidebar } from './useSidebar'

describe('useSidebar', () => {
  beforeEach(() => {
    localStorage.clear()
    // Reset the singleton state by forcing a fresh read from localStorage
    const { close } = useSidebar()
    close()
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('isOpen', () => {
    it('defaults to true on wide screens (>= 1440px)', () => {
      // happy-dom defaults window.innerWidth to 1024, so we override
      Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true })
      localStorage.removeItem('ace-sidebar-open')

      // Re-initialize by calling the composable — it reads localStorage
      // Since no localStorage value is set, it should fall back to viewport check
      const { _reinit } = useSidebar()
      _reinit()
      const { isOpen } = useSidebar()

      expect(isOpen.value).toBe(true)
    })

    it('defaults to false on narrow screens (< 1440px)', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true })
      localStorage.removeItem('ace-sidebar-open')

      const { _reinit } = useSidebar()
      _reinit()
      const { isOpen } = useSidebar()

      expect(isOpen.value).toBe(false)
    })
  })

  describe('toggle', () => {
    it('flips state from open to closed', () => {
      const { isOpen, open, toggle } = useSidebar()
      open()
      expect(isOpen.value).toBe(true)

      toggle()
      expect(isOpen.value).toBe(false)
    })

    it('flips state from closed to open', () => {
      const { isOpen, close, toggle } = useSidebar()
      close()
      expect(isOpen.value).toBe(false)

      toggle()
      expect(isOpen.value).toBe(true)
    })
  })

  describe('open and close', () => {
    it('open() sets isOpen to true', () => {
      const { isOpen, close, open } = useSidebar()
      close()
      expect(isOpen.value).toBe(false)

      open()
      expect(isOpen.value).toBe(true)
    })

    it('close() sets isOpen to false', () => {
      const { isOpen, open, close } = useSidebar()
      open()
      expect(isOpen.value).toBe(true)

      close()
      expect(isOpen.value).toBe(false)
    })
  })

  describe('localStorage persistence', () => {
    it('persists state to localStorage key ace-sidebar-open', () => {
      const { open } = useSidebar()
      open()
      expect(localStorage.getItem('ace-sidebar-open')).toBe('true')
    })

    it('persists closed state to localStorage', () => {
      const { close } = useSidebar()
      close()
      expect(localStorage.getItem('ace-sidebar-open')).toBe('false')
    })

    it('reads persisted state from localStorage on init', () => {
      localStorage.setItem('ace-sidebar-open', 'true')
      const { _reinit } = useSidebar()
      _reinit()
      const { isOpen } = useSidebar()
      expect(isOpen.value).toBe(true)
    })
  })

  describe('Cmd+B keyboard shortcut', () => {
    it('Cmd+B event triggers toggle', () => {
      const { isOpen, open } = useSidebar()
      open()
      expect(isOpen.value).toBe(true)

      // Simulate Cmd+B (metaKey on Mac)
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'b', metaKey: true, bubbles: true }),
      )
      expect(isOpen.value).toBe(false)
    })

    it('Ctrl+B event triggers toggle', () => {
      const { isOpen, open } = useSidebar()
      open()
      expect(isOpen.value).toBe(true)

      // Simulate Ctrl+B (ctrlKey on Windows/Linux)
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true }),
      )
      expect(isOpen.value).toBe(false)
    })
  })
})
