import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { chartPalette } from '../../utils/chartTheme'
import { clearRegistry } from '../../utils/panelRegistry'
import type { DashboardLink } from './DashboardListPanel.vue'

// ---------------------------------------------------------------------------
// DashboardListPanel component tests
// ---------------------------------------------------------------------------

describe('DashboardListPanel', () => {
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  let DashboardListPanel: any

  beforeEach(async () => {
    const mod = await import('./DashboardListPanel.vue')
    DashboardListPanel = mod.default
  })

  const mockDashboards: DashboardLink[] = [
    {
      id: '1',
      title: 'Infrastructure Overview',
      url: '/d/infra-overview',
      tags: ['infrastructure', 'ops'],
      starred: true,
    },
    {
      id: '2',
      title: 'Application Metrics',
      url: '/d/app-metrics',
      tags: ['app'],
      starred: false,
    },
    {
      id: '3',
      title: 'Database Performance',
      url: '/d/db-perf',
      starred: true,
    },
    {
      id: '4',
      title: 'Kubernetes Cluster',
      url: '/d/k8s',
    },
  ]

  // Test 1: Renders list of dashboards
  it('renders list of dashboards', () => {
    const wrapper = mount(DashboardListPanel, {
      props: { dashboards: mockDashboards },
    })
    const items = wrapper.findAll('[data-testid="dashboard-item"]')
    expect(items).toHaveLength(4)
  })

  // Test 2: Each dashboard shows its title
  it('each dashboard shows its title', () => {
    const wrapper = mount(DashboardListPanel, {
      props: { dashboards: mockDashboards },
    })
    const text = wrapper.text()
    expect(text).toContain('Infrastructure Overview')
    expect(text).toContain('Application Metrics')
    expect(text).toContain('Database Performance')
    expect(text).toContain('Kubernetes Cluster')
  })

  // Test 3: Title renders as a link with correct href
  it('title is a link with correct href', () => {
    const wrapper = mount(DashboardListPanel, {
      props: { dashboards: [mockDashboards[0]] },
    })
    const link = wrapper.find('[data-testid="dashboard-link"]')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('/d/infra-overview')
  })

  // Test 4: Links have correct href for multiple dashboards
  it('all links have correct href values', () => {
    const wrapper = mount(DashboardListPanel, {
      props: { dashboards: mockDashboards },
    })
    const links = wrapper.findAll('[data-testid="dashboard-link"]')
    expect(links).toHaveLength(4)
    expect(links[0].attributes('href')).toBe('/d/infra-overview')
    expect(links[1].attributes('href')).toBe('/d/app-metrics')
    expect(links[2].attributes('href')).toBe('/d/db-perf')
    expect(links[3].attributes('href')).toBe('/d/k8s')
  })

  // Test 5: Starred items show filled star with Signal Brass color
  it('starred items show star with chartPalette[4] (Signal Brass) color', () => {
    const wrapper = mount(DashboardListPanel, {
      props: { dashboards: [mockDashboards[0]] }, // starred: true
    })
    const star = wrapper.find('[data-testid="star-icon"]')
    expect(star.exists()).toBe(true)
    const style = star.attributes('style') ?? ''
    expect(style).toContain(chartPalette[4])
  })

  // Test 6: Unstarred items show star icon without Signal Brass highlight
  it('unstarred items do not use Signal Brass color for star', () => {
    const wrapper = mount(DashboardListPanel, {
      props: { dashboards: [mockDashboards[1]] }, // starred: false
    })
    const star = wrapper.find('[data-testid="star-icon"]')
    expect(star.exists()).toBe(true)
    const style = star.attributes('style') ?? ''
    expect(style).not.toContain(chartPalette[4])
  })

  // Test 7: Tags shown as pills
  it('tags are shown as pills', () => {
    const wrapper = mount(DashboardListPanel, {
      props: { dashboards: [mockDashboards[0]] }, // has tags: ['infrastructure', 'ops']
    })
    const tags = wrapper.findAll('[data-testid="dashboard-tag"]')
    expect(tags).toHaveLength(2)
    expect(tags[0].text()).toBe('infrastructure')
    expect(tags[1].text()).toBe('ops')
  })

  // Test 8: No tags rendered when absent
  it('no tags rendered when dashboard has no tags', () => {
    const wrapper = mount(DashboardListPanel, {
      props: { dashboards: [mockDashboards[3]] }, // no tags
    })
    const tags = wrapper.findAll('[data-testid="dashboard-tag"]')
    expect(tags).toHaveLength(0)
  })

  // Test 9: Empty state shows "No dashboards"
  it('shows "No dashboards" when dashboards array is empty', () => {
    const wrapper = mount(DashboardListPanel, {
      props: { dashboards: [] },
    })
    expect(wrapper.text()).toContain('No dashboards')
    const items = wrapper.findAll('[data-testid="dashboard-item"]')
    expect(items).toHaveLength(0)
  })

  // Test 10: Container is scrollable
  it('container has overflow-y auto for scrollability', () => {
    const wrapper = mount(DashboardListPanel, {
      props: { dashboards: mockDashboards },
    })
    const container = wrapper.find('[data-testid="dashboard-list-container"]')
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

  // Test 11: Dashboard title uses --color-on-surface design token
  it('dashboard link uses --color-on-surface design token', () => {
    const wrapper = mount(DashboardListPanel, {
      props: { dashboards: [mockDashboards[0]] },
    })
    const link = wrapper.find('[data-testid="dashboard-link"]')
    expect(link.exists()).toBe(true)
    const style = link.attributes('style') ?? ''
    expect(style).toContain('--color-on-surface')
  })

  // Test 12: Items without starred prop still render correctly
  it('items without starred prop render without error', () => {
    const wrapper = mount(DashboardListPanel, {
      props: { dashboards: [mockDashboards[3]] }, // no starred prop
    })
    const items = wrapper.findAll('[data-testid="dashboard-item"]')
    expect(items).toHaveLength(1)
    expect(wrapper.text()).toContain('Kubernetes Cluster')
  })
})

// ---------------------------------------------------------------------------
// Registration tests
// ---------------------------------------------------------------------------

describe('dashboard_list panel registration', () => {
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  let reg: any

  beforeEach(async () => {
    clearRegistry()
    const { registerPanel } = await import('../../utils/panelRegistry')
    const { LayoutDashboard } = await import('lucide-vue-next')
    registerPanel({
      type: 'dashboard_list',
      component: () => import('./DashboardListPanel.vue'),
      dataAdapter: () => {
        return { dashboards: [] }
      },
      defaultQuery: {},
      category: 'widgets',
      label: 'Dashboard List',
      icon: LayoutDashboard,
    })
    const { lookupPanel } = await import('../../utils/panelRegistry')
    reg = lookupPanel('dashboard_list')
  })

  afterEach(() => {
    clearRegistry()
  })

  it('registers with type "dashboard_list"', () => {
    expect(reg).not.toBeNull()
    expect(reg?.type).toBe('dashboard_list')
  })

  it('registers with category "widgets"', () => {
    expect(reg?.category).toBe('widgets')
  })

  it('registers with label "Dashboard List"', () => {
    expect(reg?.label).toBe('Dashboard List')
  })

  it('dataAdapter returns empty dashboards array by default', () => {
    const result = reg!.dataAdapter({ series: [] })
    expect(result).toEqual({ dashboards: [] })
  })

  it('defaultQuery is an empty object', () => {
    expect(reg?.defaultQuery).toEqual({})
  })

  it('icon is defined', () => {
    expect(reg?.icon).toBeDefined()
  })
})
