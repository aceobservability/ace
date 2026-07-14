import { beforeEach, describe, expect, it } from 'vitest'
import { resetGlobalKeyboard } from '@/lib/globalKeyboard'
import { routeToSection } from '@/lib/navigation'
import { useSidebarStore } from '@/stores/sidebarStore'

describe('sidebarStore', () => {
  beforeEach(() => {
    resetGlobalKeyboard()
    useSidebarStore.getState()._reset()
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

  it('togglePin pins and expands the current route section', () => {
    useSidebarStore.getState().togglePin('/app/explore/metrics')
    expect(useSidebarStore.getState().isPinned).toBe(true)
    expect(useSidebarStore.getState().expandedSection).toBe('explore')
  })

  it('syncPinnedRoute follows navigation while pinned', () => {
    useSidebarStore.getState().togglePin('/app/services')
    useSidebarStore.getState().syncPinnedRoute('/app/dashboards')
    expect(useSidebarStore.getState().expandedSection).toBe('dashboards')
  })

  it('maps routes to sections', () => {
    expect(routeToSection('/app')).toBe('home')
    expect(routeToSection('/app/explore/metrics')).toBe('explore')
    expect(routeToSection('/app/settings/org/123/general')).toBe('settings')
  })
})