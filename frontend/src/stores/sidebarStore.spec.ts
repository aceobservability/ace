import { beforeEach, describe, expect, it, vi } from 'vitest'
import { currentRouteSection, registerSidebarKeydownListener, useSidebarStore } from '@/stores/sidebarStore'

describe('sidebarStore', () => {
  const navigate = vi.fn()

  beforeEach(() => {
    useSidebarStore.getState()._reset()
    navigate.mockClear()
    useSidebarStore.getState().setNavigate(navigate)
    registerSidebarKeydownListener()
  })

  it('starts with no expanded section', () => {
    expect(useSidebarStore.getState().expandedSection).toBeNull()
  })

  it('expands and collapses sections', () => {
    const { toggleSection } = useSidebarStore.getState()
    toggleSection('explore')
    expect(useSidebarStore.getState().expandedSection).toBe('explore')
    toggleSection('explore')
    expect(useSidebarStore.getState().expandedSection).toBeNull()
  })

  it('Cmd+B pins the sidebar open', () => {
    useSidebarStore.getState().setCurrentPath('/app/explore/metrics')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', metaKey: true, bubbles: true }))
    expect(useSidebarStore.getState().isPinned).toBe(true)
    expect(useSidebarStore.getState().expandedSection).toBe('explore')
  })

  it('Cmd+2 navigates to dashboards and expands', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '2', metaKey: true, bubbles: true }))
    expect(navigate).toHaveBeenCalledWith('/app/dashboards')
    expect(useSidebarStore.getState().expandedSection).toBe('dashboards')
  })

  it('maps routes to sections', () => {
    expect(currentRouteSection('/app')).toBe('home')
    expect(currentRouteSection('/app/explore/metrics')).toBe('explore')
    expect(currentRouteSection('/app/settings/org/123/general')).toBe('settings')
  })
})