import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRoutePath = { value: '/app/dashboards' }
const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: mockRoutePath.value }),
  useRouter: () => ({ push: mockPush }),
}))

import { useSidebar } from './useSidebar'

describe('useSidebar', () => {
  beforeEach(() => {
    const { _reset } = useSidebar()
    _reset()
    mockRoutePath.value = '/app/dashboards'
    mockPush.mockClear()
  })

  describe('initial state', () => {
    it('starts with no expanded section', () => {
      const { expandedSection } = useSidebar()
      expect(expandedSection.value).toBeNull()
    })
  })

  describe('toggleSection', () => {
    it('expands a section', () => {
      const { expandedSection, toggleSection } = useSidebar()
      toggleSection('explore')
      expect(expandedSection.value).toBe('explore')
    })

    it('collapses when toggling the same section', () => {
      const { expandedSection, toggleSection } = useSidebar()
      toggleSection('explore')
      toggleSection('explore')
      expect(expandedSection.value).toBeNull()
    })

    it('switches to a different section', () => {
      const { expandedSection, toggleSection } = useSidebar()
      toggleSection('explore')
      toggleSection('dashboards')
      expect(expandedSection.value).toBe('dashboards')
    })
  })

  describe('closeSection', () => {
    it('clears expandedSection', () => {
      const { expandedSection, toggleSection, closeSection } = useSidebar()
      toggleSection('explore')
      closeSection()
      expect(expandedSection.value).toBeNull()
    })
  })

  describe('keyboard shortcuts', () => {
    it('Escape closes expanded section', () => {
      const { expandedSection, toggleSection } = useSidebar()
      toggleSection('explore')
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      expect(expandedSection.value).toBeNull()
    })

    it('Cmd+B pins the sidebar open', () => {
      mockRoutePath.value = '/app/explore/metrics'
      const { isPinned, expandedSection } = useSidebar()
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', metaKey: true, bubbles: true }))
      expect(isPinned.value).toBe(true)
      expect(expandedSection.value).toBe('explore')
    })

    it('Cmd+B again unpins and collapses', () => {
      mockRoutePath.value = '/app/explore/metrics'
      const { isPinned, expandedSection } = useSidebar()
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', metaKey: true, bubbles: true }))
      expect(isPinned.value).toBe(true)
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', metaKey: true, bubbles: true }))
      expect(isPinned.value).toBe(false)
      expect(expandedSection.value).toBeNull()
    })

    it('Ctrl+B also toggles pin (Windows/Linux)', () => {
      mockRoutePath.value = '/app/dashboards'
      const { isPinned } = useSidebar()
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true }))
      expect(isPinned.value).toBe(true)
    })

    it('Cmd+1 navigates to home without expanding', () => {
      const { expandedSection } = useSidebar()
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', metaKey: true, bubbles: true }))
      expect(mockPush).toHaveBeenCalledWith('/app')
      expect(expandedSection.value).toBeNull()
    })

    it('Cmd+2 navigates to dashboards and expands', () => {
      const { expandedSection } = useSidebar()
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '2', metaKey: true, bubbles: true }))
      expect(mockPush).toHaveBeenCalledWith('/app/dashboards')
      expect(expandedSection.value).toBe('dashboards')
    })

    it('Cmd+3 navigates to services and expands', () => {
      const { expandedSection } = useSidebar()
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '3', metaKey: true, bubbles: true }))
      expect(mockPush).toHaveBeenCalledWith('/app/services')
      expect(expandedSection.value).toBe('services')
    })

    it('Cmd+4 navigates to alerts and expands', () => {
      const { expandedSection } = useSidebar()
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '4', metaKey: true, bubbles: true }))
      expect(mockPush).toHaveBeenCalledWith('/app/alerts')
      expect(expandedSection.value).toBe('alerts')
    })

    it('Cmd+5 navigates to explore and expands', () => {
      const { expandedSection } = useSidebar()
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '5', metaKey: true, bubbles: true }))
      expect(mockPush).toHaveBeenCalledWith('/app/explore/metrics')
      expect(expandedSection.value).toBe('explore')
    })
  })

  describe('pin behavior', () => {
    it('togglePin pins the sidebar and expands current route section', () => {
      mockRoutePath.value = '/app/services'
      const { isPinned, expandedSection, togglePin } = useSidebar()
      togglePin()
      expect(isPinned.value).toBe(true)
      expect(expandedSection.value).toBe('services')
    })

    it('togglePin unpins and collapses', () => {
      mockRoutePath.value = '/app/services'
      const { isPinned, expandedSection, togglePin } = useSidebar()
      togglePin()
      togglePin()
      expect(isPinned.value).toBe(false)
      expect(expandedSection.value).toBeNull()
    })

    it('when pinned, toggleSection switches section instead of collapsing', () => {
      mockRoutePath.value = '/app/services'
      const { expandedSection, togglePin, toggleSection } = useSidebar()
      togglePin()
      expect(expandedSection.value).toBe('services')
      toggleSection('dashboards')
      expect(expandedSection.value).toBe('dashboards')
      // Toggling same section when pinned doesn't collapse
      toggleSection('dashboards')
      expect(expandedSection.value).toBe('dashboards')
    })

    it('closeSection does nothing when pinned', () => {
      mockRoutePath.value = '/app/services'
      const { isPinned, expandedSection, togglePin, closeSection } = useSidebar()
      togglePin()
      closeSection()
      expect(expandedSection.value).toBe('services')
      expect(isPinned.value).toBe(true)
    })

    it('Escape unpins when pinned', () => {
      mockRoutePath.value = '/app/services'
      const { isPinned, togglePin } = useSidebar()
      togglePin()
      expect(isPinned.value).toBe(true)
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      expect(isPinned.value).toBe(false)
    })
  })

  describe('route-to-section mapping', () => {
    it('maps /app to home', () => {
      mockRoutePath.value = '/app'
      const { currentRouteSection } = useSidebar()
      expect(currentRouteSection.value).toBe('home')
    })

    it('maps /app/explore/metrics to explore', () => {
      mockRoutePath.value = '/app/explore/metrics'
      const { currentRouteSection } = useSidebar()
      expect(currentRouteSection.value).toBe('explore')
    })

    it('maps /app/settings/org/123/general to settings', () => {
      mockRoutePath.value = '/app/settings/org/123/general'
      const { currentRouteSection } = useSidebar()
      expect(currentRouteSection.value).toBe('settings')
    })
  })
})
