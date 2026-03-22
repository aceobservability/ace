import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useKeyboardShortcuts } from './useKeyboardShortcuts'

describe('useKeyboardShortcuts', () => {
  beforeEach(() => {
    // Reset state between tests
    const { _reset } = useKeyboardShortcuts()
    _reset()
  })

  afterEach(() => {
    const { _reset } = useKeyboardShortcuts()
    _reset()
  })

  describe('register', () => {
    it('fires callback on matching keydown', () => {
      const { register } = useKeyboardShortcuts()
      const callback = vi.fn()

      register('Cmd+K', callback, 'Open command palette', 'General')

      // Simulate Cmd+K (metaKey on Mac)
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }),
      )

      expect(callback).toHaveBeenCalledTimes(1)
    })

    it('fires callback with Ctrl on non-Mac for Cmd shortcuts', () => {
      const { register } = useKeyboardShortcuts()
      const callback = vi.fn()

      register('Cmd+K', callback, 'Open command palette', 'General')

      // Simulate Ctrl+K (ctrlKey on Windows/Linux)
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }),
      )

      expect(callback).toHaveBeenCalledTimes(1)
    })

    it('does not fire callback for non-matching key', () => {
      const { register } = useKeyboardShortcuts()
      const callback = vi.fn()

      register('Cmd+K', callback, 'Open command palette', 'General')

      // Simulate Cmd+J (wrong key)
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'j', metaKey: true, bubbles: true }),
      )

      expect(callback).not.toHaveBeenCalled()
    })

    it('returns an unregister function', () => {
      const { register } = useKeyboardShortcuts()
      const callback = vi.fn()

      const unregister = register('Cmd+K', callback, 'Open command palette', 'General')

      // First press should work
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }),
      )
      expect(callback).toHaveBeenCalledTimes(1)

      // Unregister the shortcut
      unregister()

      // Second press should not fire callback
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }),
      )
      expect(callback).toHaveBeenCalledTimes(1)
    })
  })

  describe('shortcuts are deregistered on cleanup', () => {
    it('removes shortcut from shortcuts list on unregister', () => {
      const { register, shortcuts } = useKeyboardShortcuts()

      const unregister = register('Cmd+K', vi.fn(), 'Open command palette', 'General')
      expect(shortcuts.value.some((s) => s.keys === 'Cmd+K')).toBe(true)

      unregister()
      expect(shortcuts.value.some((s) => s.keys === 'Cmd+K')).toBe(false)
    })
  })

  describe('showHelp', () => {
    it('Cmd+/ toggles showHelp', () => {
      const { showHelp } = useKeyboardShortcuts()
      expect(showHelp.value).toBe(false)

      // Simulate Cmd+/
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: '/', metaKey: true, bubbles: true }),
      )
      expect(showHelp.value).toBe(true)

      // Toggle back
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: '/', metaKey: true, bubbles: true }),
      )
      expect(showHelp.value).toBe(false)
    })
  })

  describe('shortcuts list', () => {
    it('tracks registered shortcuts', () => {
      const { register, shortcuts } = useKeyboardShortcuts()

      register('Cmd+K', vi.fn(), 'Open command palette', 'General')
      register('Cmd+S', vi.fn(), 'Save dashboard', 'Dashboard')

      // Should include the two registered plus the pre-registered Cmd+/
      const keys = shortcuts.value.map((s) => s.keys)
      expect(keys).toContain('Cmd+K')
      expect(keys).toContain('Cmd+S')
      expect(keys).toContain('Cmd+/')
    })

    it('includes correct label and category', () => {
      const { register, shortcuts } = useKeyboardShortcuts()

      register('Cmd+K', vi.fn(), 'Open command palette', 'General')

      const entry = shortcuts.value.find((s) => s.keys === 'Cmd+K')
      expect(entry).toBeDefined()
      expect(entry?.label).toBe('Open command palette')
      expect(entry?.category).toBe('General')
    })
  })

  describe('Shift modifier', () => {
    it('handles Cmd+Shift+key shortcuts', () => {
      const { register } = useKeyboardShortcuts()
      const callback = vi.fn()

      register('Cmd+Shift+P', callback, 'Command palette', 'General')

      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'P', metaKey: true, shiftKey: true, bubbles: true }),
      )

      expect(callback).toHaveBeenCalledTimes(1)
    })
  })
})
