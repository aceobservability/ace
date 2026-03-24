import { afterEach, describe, expect, it } from 'vitest'
import type { Component } from 'vue'
import {
  clearRegistry,
  getAllPanels,
  getPanelsByCategory,
  isRegisteredPanel,
  lookupPanel,
  type PanelRegistration,
  registerPanel,
} from './panelRegistry'

// ---------------------------------------------------------------------------
// Shared test fixture
// ---------------------------------------------------------------------------

const mockRegistration: PanelRegistration = {
  type: 'test_panel',
  component: () => Promise.resolve({ template: '<div>test</div>' } as unknown as Component),
  dataAdapter: (raw) => ({ data: raw.series }),
  defaultQuery: {},
  category: 'charts',
  label: 'Test Panel',
  icon: {} as unknown as Component,
}

afterEach(() => {
  clearRegistry()
})

// ---------------------------------------------------------------------------
// registerPanel
// ---------------------------------------------------------------------------

describe('registerPanel', () => {
  it('registers a panel successfully', () => {
    registerPanel(mockRegistration)
    expect(isRegisteredPanel('test_panel')).toBe(true)
  })

  it('throws on duplicate type registration', () => {
    registerPanel(mockRegistration)
    expect(() => registerPanel(mockRegistration)).toThrow(
      'Panel type "test_panel" is already registered',
    )
  })
})

// ---------------------------------------------------------------------------
// lookupPanel
// ---------------------------------------------------------------------------

describe('lookupPanel', () => {
  it('returns registration for known type', () => {
    registerPanel(mockRegistration)
    const result = lookupPanel('test_panel')
    expect(result).toEqual(mockRegistration)
  })

  it('returns null for unknown type', () => {
    expect(lookupPanel('nonexistent')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// getPanelsByCategory
// ---------------------------------------------------------------------------

describe('getPanelsByCategory', () => {
  it('returns panels in given category', () => {
    registerPanel(mockRegistration)
    registerPanel({
      ...mockRegistration,
      type: 'widget_panel',
      category: 'widgets',
      label: 'Widget Panel',
    })

    const charts = getPanelsByCategory('charts')
    expect(charts).toHaveLength(1)
    expect(charts[0].type).toBe('test_panel')
  })

  it('returns empty array for category with no panels', () => {
    registerPanel(mockRegistration) // 'charts' category
    expect(getPanelsByCategory('observability')).toEqual([])
  })

  it('returns panels sorted alphabetically by label', () => {
    registerPanel({ ...mockRegistration, type: 'z_panel', label: 'Zebra Chart' })
    registerPanel({ ...mockRegistration, type: 'a_panel', label: 'Alpha Chart' })
    registerPanel({ ...mockRegistration, type: 'm_panel', label: 'Middle Chart' })

    const charts = getPanelsByCategory('charts')
    expect(charts.map((p) => p.label)).toEqual(['Alpha Chart', 'Middle Chart', 'Zebra Chart'])
  })
})

// ---------------------------------------------------------------------------
// getAllPanels
// ---------------------------------------------------------------------------

describe('getAllPanels', () => {
  it('returns all registered panels sorted by label', () => {
    registerPanel({ ...mockRegistration, type: 'z_panel', label: 'Zebra Chart', category: 'stats' })
    registerPanel({
      ...mockRegistration,
      type: 'a_panel',
      label: 'Alpha Chart',
      category: 'widgets',
    })
    registerPanel({
      ...mockRegistration,
      type: 'm_panel',
      label: 'Middle Chart',
      category: 'charts',
    })

    const all = getAllPanels()
    expect(all).toHaveLength(3)
    expect(all.map((p) => p.label)).toEqual(['Alpha Chart', 'Middle Chart', 'Zebra Chart'])
  })

  it('returns empty array when registry is empty', () => {
    expect(getAllPanels()).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// isRegisteredPanel
// ---------------------------------------------------------------------------

describe('isRegisteredPanel', () => {
  it('returns true for registered type', () => {
    registerPanel(mockRegistration)
    expect(isRegisteredPanel('test_panel')).toBe(true)
  })

  it('returns false for unregistered type', () => {
    expect(isRegisteredPanel('missing_panel')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// clearRegistry
// ---------------------------------------------------------------------------

describe('clearRegistry', () => {
  it('removes all registrations', () => {
    registerPanel(mockRegistration)
    expect(getAllPanels()).toHaveLength(1)

    clearRegistry()
    expect(getAllPanels()).toHaveLength(0)
    expect(isRegisteredPanel('test_panel')).toBe(false)
  })
})
