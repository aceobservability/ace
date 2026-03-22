import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockRoutePath = { value: '/app/dashboards' }
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: mockRoutePath.value }),
  useRouter: () => ({ push: vi.fn() }),
}))

import { useSidebar } from './useSidebar'

describe('useSidebar', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    const { _reset } = useSidebar()
    _reset()
    mockRoutePath.value = '/app/dashboards'
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('initial state', () => {
    it('starts with no hovered or pinned section', () => {
      const { hoveredSection, pinnedSection, isPeeking } = useSidebar()
      expect(hoveredSection.value).toBeNull()
      expect(pinnedSection.value).toBeNull()
      expect(isPeeking.value).toBe(false)
    })
  })

  describe('hover-to-peek', () => {
    it('sets hoveredSection after 200ms delay', () => {
      const { hoveredSection, handleMouseEnter } = useSidebar()
      handleMouseEnter('explore')
      expect(hoveredSection.value).toBeNull()
      vi.advanceTimersByTime(200)
      expect(hoveredSection.value).toBe('explore')
    })

    it('clears hoveredSection after 150ms on mouse leave', () => {
      const { hoveredSection, handleMouseEnter, handleMouseLeave } = useSidebar()
      handleMouseEnter('explore')
      vi.advanceTimersByTime(200)
      expect(hoveredSection.value).toBe('explore')
      handleMouseLeave()
      expect(hoveredSection.value).toBe('explore')
      vi.advanceTimersByTime(150)
      expect(hoveredSection.value).toBeNull()
    })

    it('cancels close timer if mouse re-enters within 150ms', () => {
      const { hoveredSection, handleMouseEnter, handleMouseLeave } = useSidebar()
      handleMouseEnter('explore')
      vi.advanceTimersByTime(200)
      handleMouseLeave()
      vi.advanceTimersByTime(100)
      handleMouseEnter('explore')
      vi.advanceTimersByTime(200)
      expect(hoveredSection.value).toBe('explore')
    })

    it('isPeeking is true when hovered and not pinned', () => {
      const { isPeeking, handleMouseEnter } = useSidebar()
      handleMouseEnter('explore')
      vi.advanceTimersByTime(200)
      expect(isPeeking.value).toBe(true)
    })

    it('hovering does NOT change flyout when a section is pinned', () => {
      const { pinnedSection, pinSection, handleMouseEnter } = useSidebar()
      pinSection('dashboards')
      expect(pinnedSection.value).toBe('dashboards')
      handleMouseEnter('explore')
      vi.advanceTimersByTime(200)
      expect(pinnedSection.value).toBe('dashboards')
    })
  })

  describe('click-to-pin', () => {
    it('pinSection sets pinnedSection', () => {
      const { pinnedSection, pinSection } = useSidebar()
      pinSection('explore')
      expect(pinnedSection.value).toBe('explore')
    })

    it('pinning same section again unpins it', () => {
      const { pinnedSection, pinSection } = useSidebar()
      pinSection('explore')
      pinSection('explore')
      expect(pinnedSection.value).toBeNull()
    })

    it('pinning a different section switches to it', () => {
      const { pinnedSection, pinSection } = useSidebar()
      pinSection('explore')
      pinSection('dashboards')
      expect(pinnedSection.value).toBe('dashboards')
    })

    it('isPeeking is false when pinned', () => {
      const { isPeeking, pinSection } = useSidebar()
      pinSection('explore')
      expect(isPeeking.value).toBe(false)
    })

    it('closeFlyout clears pinnedSection', () => {
      const { pinnedSection, pinSection, closeFlyout } = useSidebar()
      pinSection('explore')
      closeFlyout()
      expect(pinnedSection.value).toBeNull()
    })
  })

  describe('keyboard shortcuts', () => {
    it('Escape clears pinnedSection', () => {
      const { pinnedSection, pinSection } = useSidebar()
      pinSection('explore')
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      expect(pinnedSection.value).toBeNull()
    })

    it('Cmd+B toggles pin for current route section', () => {
      mockRoutePath.value = '/app/explore/metrics'
      const { pinnedSection } = useSidebar()
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', metaKey: true, bubbles: true }))
      expect(pinnedSection.value).toBe('explore')
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', metaKey: true, bubbles: true }))
      expect(pinnedSection.value).toBeNull()
    })

    it('Ctrl+B also toggles pin (Windows/Linux)', () => {
      mockRoutePath.value = '/app/dashboards'
      const { pinnedSection } = useSidebar()
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true }))
      expect(pinnedSection.value).toBe('dashboards')
    })

    it('Cmd+1 navigates to home (no pin)', () => {
      const { pinnedSection } = useSidebar()
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', metaKey: true, bubbles: true }))
      expect(pinnedSection.value).toBeNull()
    })

    it('Cmd+2 navigates to dashboards and pins with auto-close', () => {
      const { pinnedSection } = useSidebar()
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '2', metaKey: true, bubbles: true }))
      expect(pinnedSection.value).toBe('dashboards')
      vi.advanceTimersByTime(2000)
      expect(pinnedSection.value).toBeNull()
    })

    it('Cmd+3 navigates to services and pins with auto-close', () => {
      const { pinnedSection } = useSidebar()
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '3', metaKey: true, bubbles: true }))
      expect(pinnedSection.value).toBe('services')
    })

    it('Cmd+4 navigates to alerts and pins with auto-close', () => {
      const { pinnedSection } = useSidebar()
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '4', metaKey: true, bubbles: true }))
      expect(pinnedSection.value).toBe('alerts')
    })

    it('Cmd+5 navigates to explore and pins with auto-close', () => {
      const { pinnedSection } = useSidebar()
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '5', metaKey: true, bubbles: true }))
      expect(pinnedSection.value).toBe('explore')
    })

    it('auto-close timer is cancelled if user interacts', () => {
      const { pinnedSection, pinSection } = useSidebar()
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '2', metaKey: true, bubbles: true }))
      expect(pinnedSection.value).toBe('dashboards')
      pinSection('explore')
      expect(pinnedSection.value).toBe('explore')
      vi.advanceTimersByTime(2000)
      expect(pinnedSection.value).toBe('explore')
    })
  })

  describe('active flyout section', () => {
    it('returns pinnedSection when pinned', () => {
      const { activeFlyoutSection, pinSection } = useSidebar()
      pinSection('explore')
      expect(activeFlyoutSection.value).toBe('explore')
    })

    it('returns hoveredSection when peeking', () => {
      const { activeFlyoutSection, handleMouseEnter } = useSidebar()
      handleMouseEnter('alerts')
      vi.advanceTimersByTime(200)
      expect(activeFlyoutSection.value).toBe('alerts')
    })

    it('returns null when nothing is hovered or pinned', () => {
      const { activeFlyoutSection } = useSidebar()
      expect(activeFlyoutSection.value).toBeNull()
    })

    it('returns pinnedSection even when hovering a different section', () => {
      const { activeFlyoutSection, pinSection, handleMouseEnter } = useSidebar()
      pinSection('dashboards')
      handleMouseEnter('explore')
      vi.advanceTimersByTime(200)
      expect(activeFlyoutSection.value).toBe('dashboards')
    })
  })

  describe('closeFlyout', () => {
    it('clears hover timer when closing', () => {
      const { hoveredSection, handleMouseEnter, closeFlyout } = useSidebar()
      handleMouseEnter('explore')
      closeFlyout()
      vi.advanceTimersByTime(200)
      expect(hoveredSection.value).toBeNull()
    })
  })

  describe('Cmd+B from unpinned state', () => {
    it('pins the current route section when nothing is pinned', () => {
      mockRoutePath.value = '/app/services'
      const { pinnedSection } = useSidebar()
      expect(pinnedSection.value).toBeNull()
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', metaKey: true, bubbles: true }))
      expect(pinnedSection.value).toBe('services')
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
