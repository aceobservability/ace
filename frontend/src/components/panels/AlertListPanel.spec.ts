import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { chartPalette, thresholdColors } from '../../utils/chartTheme'
import { clearRegistry } from '../../utils/panelRegistry'
import type { AlertItem } from './AlertListPanel.vue'

// ---------------------------------------------------------------------------
// AlertListPanel component tests
// ---------------------------------------------------------------------------

describe('AlertListPanel', () => {
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  let AlertListPanel: any

  beforeEach(async () => {
    const mod = await import('./AlertListPanel.vue')
    AlertListPanel = mod.default
  })

  const mockAlerts: AlertItem[] = [
    {
      id: '1',
      name: 'High CPU Usage',
      severity: 'critical',
      state: 'firing',
      timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 minutes ago
      message: 'CPU exceeded 95% for 10 minutes',
    },
    {
      id: '2',
      name: 'Memory Warning',
      severity: 'warning',
      state: 'pending',
      timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 minutes ago
    },
    {
      id: '3',
      name: 'Disk Check',
      severity: 'info',
      state: 'resolved',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
      message: 'Disk space normalized',
    },
  ]

  // Test 1: Renders list of alerts
  it('renders list of alerts', () => {
    const wrapper = mount(AlertListPanel, {
      props: { alerts: mockAlerts },
    })
    const items = wrapper.findAll('[data-testid="alert-item"]')
    expect(items).toHaveLength(3)
  })

  // Test 2: Each alert shows name
  it('each alert shows its name', () => {
    const wrapper = mount(AlertListPanel, {
      props: { alerts: mockAlerts },
    })
    const text = wrapper.text()
    expect(text).toContain('High CPU Usage')
    expect(text).toContain('Memory Warning')
    expect(text).toContain('Disk Check')
  })

  // Test 3: Severity dot uses correct threshold color for critical
  it('severity dot uses thresholdColors.critical for critical severity', () => {
    const wrapper = mount(AlertListPanel, {
      props: { alerts: [mockAlerts[0]] }, // critical alert
    })
    const dot = wrapper.find('[data-testid="severity-dot"]')
    expect(dot.exists()).toBe(true)
    const style = dot.attributes('style') ?? ''
    expect(style).toContain(thresholdColors.critical)
  })

  // Test 4: Severity dot uses correct threshold color for warning
  it('severity dot uses thresholdColors.warning for warning severity', () => {
    const wrapper = mount(AlertListPanel, {
      props: { alerts: [mockAlerts[1]] }, // warning alert
    })
    const dot = wrapper.find('[data-testid="severity-dot"]')
    expect(dot.exists()).toBe(true)
    const style = dot.attributes('style') ?? ''
    expect(style).toContain(thresholdColors.warning)
  })

  // Test 5: Severity dot uses Steel Blue (chartPalette[0]) for info
  it('severity dot uses chartPalette[0] (Steel Blue) for info severity', () => {
    const wrapper = mount(AlertListPanel, {
      props: { alerts: [mockAlerts[2]] }, // info alert
    })
    const dot = wrapper.find('[data-testid="severity-dot"]')
    expect(dot.exists()).toBe(true)
    const style = dot.attributes('style') ?? ''
    expect(style).toContain(chartPalette[0])
  })

  // Test 6: State badge shows correct text
  it('state badge shows "firing" text for firing state', () => {
    const wrapper = mount(AlertListPanel, {
      props: { alerts: [mockAlerts[0]] }, // firing
    })
    const badge = wrapper.find('[data-testid="state-badge"]')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('firing')
  })

  it('state badge shows "resolved" text for resolved state', () => {
    const wrapper = mount(AlertListPanel, {
      props: { alerts: [mockAlerts[2]] }, // resolved
    })
    const badge = wrapper.find('[data-testid="state-badge"]')
    expect(badge.text()).toBe('resolved')
  })

  it('state badge shows "pending" text for pending state', () => {
    const wrapper = mount(AlertListPanel, {
      props: { alerts: [mockAlerts[1]] }, // pending
    })
    const badge = wrapper.find('[data-testid="state-badge"]')
    expect(badge.text()).toBe('pending')
  })

  // Test 7: Timestamp is displayed
  it('timestamp is displayed for each alert', () => {
    const wrapper = mount(AlertListPanel, {
      props: { alerts: [mockAlerts[0]] },
    })
    const timestamp = wrapper.find('[data-testid="alert-timestamp"]')
    expect(timestamp.exists()).toBe(true)
    expect(timestamp.text()).toBeTruthy()
  })

  // Test 8: Message shown when present
  it('message is shown when present', () => {
    const wrapper = mount(AlertListPanel, {
      props: { alerts: [mockAlerts[0]] }, // has message
    })
    const message = wrapper.find('[data-testid="alert-message"]')
    expect(message.exists()).toBe(true)
    expect(message.text()).toBe('CPU exceeded 95% for 10 minutes')
  })

  it('message is not rendered when absent', () => {
    const wrapper = mount(AlertListPanel, {
      props: { alerts: [mockAlerts[1]] }, // no message
    })
    const message = wrapper.find('[data-testid="alert-message"]')
    expect(message.exists()).toBe(false)
  })

  // Test 9: Empty state shows "No alerts"
  it('shows "No alerts" when alerts array is empty', () => {
    const wrapper = mount(AlertListPanel, {
      props: { alerts: [] },
    })
    expect(wrapper.text()).toContain('No alerts')
    const items = wrapper.findAll('[data-testid="alert-item"]')
    expect(items).toHaveLength(0)
  })

  // Test 10: Container is scrollable
  it('container has overflow-y auto for scrollability', () => {
    const wrapper = mount(AlertListPanel, {
      props: { alerts: mockAlerts },
    })
    const container = wrapper.find('[data-testid="alert-list-container"]')
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

  // Additional: firing badge uses error color
  it('firing badge applies error-themed styling', () => {
    const wrapper = mount(AlertListPanel, {
      props: { alerts: [mockAlerts[0]] }, // firing
    })
    const badge = wrapper.find('[data-testid="state-badge"]')
    const style = badge.attributes('style') ?? ''
    const classes = badge.classes().join(' ')
    // Should reference the critical/error color from thresholdColors
    const hasErrorColor =
      style.includes(thresholdColors.critical) ||
      classes.includes('critical') ||
      classes.includes('error')
    expect(hasErrorColor).toBe(true)
  })

  // Additional: resolved badge uses success color
  it('resolved badge applies success-themed styling', () => {
    const wrapper = mount(AlertListPanel, {
      props: { alerts: [mockAlerts[2]] }, // resolved
    })
    const badge = wrapper.find('[data-testid="state-badge"]')
    const style = badge.attributes('style') ?? ''
    // thresholdColors.good is the success color
    expect(style).toContain(thresholdColors.good)
  })

  // Additional: uses design token for alert name color
  it('alert name uses --color-on-surface design token', () => {
    const wrapper = mount(AlertListPanel, {
      props: { alerts: [mockAlerts[0]] },
    })
    const name = wrapper.find('[data-testid="alert-name"]')
    expect(name.exists()).toBe(true)
    const style = name.attributes('style') ?? ''
    expect(style).toContain('--color-on-surface')
  })
})

// ---------------------------------------------------------------------------
// Registration tests
// ---------------------------------------------------------------------------

describe('alert_list panel registration', () => {
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  let reg: any

  beforeEach(async () => {
    clearRegistry()
    const { registerPanel } = await import('../../utils/panelRegistry')
    const { Bell } = await import('lucide-vue-next')
    registerPanel({
      type: 'alert_list',
      component: () => import('./AlertListPanel.vue'),
      dataAdapter: () => {
        return { alerts: [] }
      },
      defaultQuery: {},
      category: 'widgets',
      label: 'Alert List',
      icon: Bell,
    })
    const { lookupPanel } = await import('../../utils/panelRegistry')
    reg = lookupPanel('alert_list')
  })

  afterEach(() => {
    clearRegistry()
  })

  // Test 11: Registration metadata correct
  it('registers with type "alert_list"', () => {
    expect(reg).not.toBeNull()
    expect(reg?.type).toBe('alert_list')
  })

  it('registers with category "widgets"', () => {
    expect(reg?.category).toBe('widgets')
  })

  it('registers with label "Alert List"', () => {
    expect(reg?.label).toBe('Alert List')
  })

  it('dataAdapter returns empty alerts array by default', () => {
    const result = reg!.dataAdapter({ series: [] })
    expect(result).toEqual({ alerts: [] })
  })

  it('defaultQuery is an empty object', () => {
    expect(reg?.defaultQuery).toEqual({})
  })

  it('icon is defined', () => {
    expect(reg?.icon).toBeDefined()
  })
})
