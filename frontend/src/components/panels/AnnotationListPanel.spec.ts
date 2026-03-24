import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { chartPalette, thresholdColors } from '../../utils/chartTheme'
import { clearRegistry } from '../../utils/panelRegistry'
import type { AnnotationItem } from './AnnotationListPanel.vue'

// ---------------------------------------------------------------------------
// AnnotationListPanel component tests
// ---------------------------------------------------------------------------

describe('AnnotationListPanel', () => {
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  let AnnotationListPanel: any

  beforeEach(async () => {
    const mod = await import('./AnnotationListPanel.vue')
    AnnotationListPanel = mod.default
  })

  const mockAnnotations: AnnotationItem[] = [
    {
      id: '1',
      title: 'Production Deploy v2.3.0',
      description: 'Deployed new authentication service',
      timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 minutes ago
      type: 'deploy',
      tags: ['production', 'auth'],
    },
    {
      id: '2',
      title: 'Database Incident',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
      type: 'incident',
    },
    {
      id: '3',
      title: 'Feature Flag Updated',
      description: 'Enabled dark mode for 50% of users',
      timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
      type: 'config_change',
      tags: ['feature-flags'],
    },
    {
      id: '4',
      title: 'Manual Note',
      timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
      type: 'other',
      tags: ['note'],
    },
  ]

  // Test 1: Renders list of annotations
  it('renders list of annotations', () => {
    const wrapper = mount(AnnotationListPanel, {
      props: { annotations: mockAnnotations },
    })
    const items = wrapper.findAll('[data-testid="annotation-item"]')
    expect(items).toHaveLength(4)
  })

  // Test 2: Each annotation shows its title
  it('each annotation shows its title', () => {
    const wrapper = mount(AnnotationListPanel, {
      props: { annotations: mockAnnotations },
    })
    const text = wrapper.text()
    expect(text).toContain('Production Deploy v2.3.0')
    expect(text).toContain('Database Incident')
    expect(text).toContain('Feature Flag Updated')
    expect(text).toContain('Manual Note')
  })

  // Test 3: Type dot uses chartPalette[0] (Steel Blue) for deploy
  it('type dot uses chartPalette[0] (Steel Blue) for deploy type', () => {
    const wrapper = mount(AnnotationListPanel, {
      props: { annotations: [mockAnnotations[0]] }, // deploy
    })
    const dot = wrapper.find('[data-testid="type-dot"]')
    expect(dot.exists()).toBe(true)
    const style = dot.attributes('style') ?? ''
    expect(style).toContain(chartPalette[0])
  })

  // Test 4: Type dot uses thresholdColors.critical for incident
  it('type dot uses thresholdColors.critical for incident type', () => {
    const wrapper = mount(AnnotationListPanel, {
      props: { annotations: [mockAnnotations[1]] }, // incident
    })
    const dot = wrapper.find('[data-testid="type-dot"]')
    expect(dot.exists()).toBe(true)
    const style = dot.attributes('style') ?? ''
    expect(style).toContain(thresholdColors.critical)
  })

  // Test 5: Type dot uses thresholdColors.warning for config_change
  it('type dot uses thresholdColors.warning for config_change type', () => {
    const wrapper = mount(AnnotationListPanel, {
      props: { annotations: [mockAnnotations[2]] }, // config_change
    })
    const dot = wrapper.find('[data-testid="type-dot"]')
    expect(dot.exists()).toBe(true)
    const style = dot.attributes('style') ?? ''
    expect(style).toContain(thresholdColors.warning)
  })

  // Test 6: Type dot uses chartPalette[7] (Alloy Silver) for other
  it('type dot uses chartPalette[7] (Alloy Silver) for other type', () => {
    const wrapper = mount(AnnotationListPanel, {
      props: { annotations: [mockAnnotations[3]] }, // other
    })
    const dot = wrapper.find('[data-testid="type-dot"]')
    expect(dot.exists()).toBe(true)
    const style = dot.attributes('style') ?? ''
    expect(style).toContain(chartPalette[7])
  })

  // Test 7: Tags shown as pills
  it('tags are shown as pills', () => {
    const wrapper = mount(AnnotationListPanel, {
      props: { annotations: [mockAnnotations[0]] }, // has tags: ['production', 'auth']
    })
    const tags = wrapper.findAll('[data-testid="annotation-tag"]')
    expect(tags).toHaveLength(2)
    expect(tags[0].text()).toBe('production')
    expect(tags[1].text()).toBe('auth')
  })

  // Test 8: No tags rendered when absent
  it('no tags rendered when annotation has no tags', () => {
    const wrapper = mount(AnnotationListPanel, {
      props: { annotations: [mockAnnotations[1]] }, // no tags
    })
    const tags = wrapper.findAll('[data-testid="annotation-tag"]')
    expect(tags).toHaveLength(0)
  })

  // Test 9: Empty state shows "No annotations"
  it('shows "No annotations" when annotations array is empty', () => {
    const wrapper = mount(AnnotationListPanel, {
      props: { annotations: [] },
    })
    expect(wrapper.text()).toContain('No annotations')
    const items = wrapper.findAll('[data-testid="annotation-item"]')
    expect(items).toHaveLength(0)
  })

  // Test 10: Timestamp is displayed
  it('timestamp is displayed for each annotation', () => {
    const wrapper = mount(AnnotationListPanel, {
      props: { annotations: [mockAnnotations[0]] },
    })
    const timestamp = wrapper.find('[data-testid="annotation-timestamp"]')
    expect(timestamp.exists()).toBe(true)
    expect(timestamp.text()).toBeTruthy()
  })

  // Test 11: Description shown when present
  it('description is shown when present', () => {
    const wrapper = mount(AnnotationListPanel, {
      props: { annotations: [mockAnnotations[0]] }, // has description
    })
    const desc = wrapper.find('[data-testid="annotation-description"]')
    expect(desc.exists()).toBe(true)
    expect(desc.text()).toBe('Deployed new authentication service')
  })

  // Test 12: Description not rendered when absent
  it('description is not rendered when absent', () => {
    const wrapper = mount(AnnotationListPanel, {
      props: { annotations: [mockAnnotations[1]] }, // no description
    })
    const desc = wrapper.find('[data-testid="annotation-description"]')
    expect(desc.exists()).toBe(false)
  })

  // Test 13: Container is scrollable
  it('container has overflow-y auto for scrollability', () => {
    const wrapper = mount(AnnotationListPanel, {
      props: { annotations: mockAnnotations },
    })
    const container = wrapper.find('[data-testid="annotation-list-container"]')
    expect(container.exists()).toBe(true)
    const style = container.attributes('style') ?? ''
    const classes = container.classes().join(' ')
    const hasOverflow =
      style.includes('overflow-y') ||
      style.includes('overflow: auto') ||
      classes.includes('overflow-y') ||
      classes.includes('overflow-auto')
    expect(hasOverflow).toBe(true)
  })

  // Test 14: Title uses --color-on-surface design token
  it('annotation title uses --color-on-surface design token', () => {
    const wrapper = mount(AnnotationListPanel, {
      props: { annotations: [mockAnnotations[0]] },
    })
    const title = wrapper.find('[data-testid="annotation-title"]')
    expect(title.exists()).toBe(true)
    const style = title.attributes('style') ?? ''
    expect(style).toContain('--color-on-surface')
  })
})

// ---------------------------------------------------------------------------
// Registration tests
// ---------------------------------------------------------------------------

describe('annotation_list panel registration', () => {
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  let reg: any

  beforeEach(async () => {
    clearRegistry()
    const { registerPanel } = await import('../../utils/panelRegistry')
    const { StickyNote } = await import('lucide-vue-next')
    registerPanel({
      type: 'annotation_list',
      component: () => import('./AnnotationListPanel.vue'),
      dataAdapter: () => {
        return { annotations: [] }
      },
      defaultQuery: {},
      category: 'widgets',
      label: 'Annotation List',
      icon: StickyNote,
    })
    const { lookupPanel } = await import('../../utils/panelRegistry')
    reg = lookupPanel('annotation_list')
  })

  afterEach(() => {
    clearRegistry()
  })

  it('registers with type "annotation_list"', () => {
    expect(reg).not.toBeNull()
    expect(reg?.type).toBe('annotation_list')
  })

  it('registers with category "widgets"', () => {
    expect(reg?.category).toBe('widgets')
  })

  it('registers with label "Annotation List"', () => {
    expect(reg?.label).toBe('Annotation List')
  })

  it('dataAdapter returns empty annotations array by default', () => {
    const result = reg!.dataAdapter({ series: [] })
    expect(result).toEqual({ annotations: [] })
  })

  it('defaultQuery is an empty object', () => {
    expect(reg?.defaultQuery).toEqual({})
  })

  it('icon is defined', () => {
    expect(reg?.icon).toBeDefined()
  })
})
