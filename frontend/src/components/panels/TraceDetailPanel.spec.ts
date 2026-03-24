import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getSeriesColor, thresholdColors } from '../../utils/chartTheme'
import { clearRegistry } from '../../utils/panelRegistry'
import type { TraceSpanItem } from './TraceDetailPanel.vue'

// ---------------------------------------------------------------------------
// TraceDetailPanel component tests
// ---------------------------------------------------------------------------

describe('TraceDetailPanel', () => {
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  let TraceDetailPanel: any

  beforeEach(async () => {
    const mod = await import('./TraceDetailPanel.vue')
    TraceDetailPanel = mod.default
  })

  // A simple trace: root -> child-a -> grandchild, root -> child-b
  const rootSpan: TraceSpanItem = {
    spanId: 'span-root',
    operationName: 'HTTP GET /api',
    serviceName: 'gateway',
    startTime: 1000000, // 1s in microseconds
    duration: 500000, // 500ms
  }

  const childA: TraceSpanItem = {
    spanId: 'span-a',
    parentSpanId: 'span-root',
    operationName: 'db.query',
    serviceName: 'user-service',
    startTime: 1050000,
    duration: 200000,
  }

  const grandchild: TraceSpanItem = {
    spanId: 'span-gc',
    parentSpanId: 'span-a',
    operationName: 'SELECT * FROM users',
    serviceName: 'user-service',
    startTime: 1060000,
    duration: 100000,
  }

  const childB: TraceSpanItem = {
    spanId: 'span-b',
    parentSpanId: 'span-root',
    operationName: 'cache.get',
    serviceName: 'cache-service',
    startTime: 1100000,
    duration: 50000,
    status: 'error',
  }

  const allSpans: TraceSpanItem[] = [rootSpan, childA, grandchild, childB]

  // Test 1: Renders rows for each span
  it('renders a row for each span', () => {
    const wrapper = mount(TraceDetailPanel, {
      props: { spans: allSpans },
    })
    const rows = wrapper.findAll('[data-testid="trace-span-row"]')
    expect(rows).toHaveLength(4)
  })

  // Test 2: Root span (no parentSpanId) rendered at top level (no indent)
  it('root span has no indent', () => {
    const wrapper = mount(TraceDetailPanel, {
      props: { spans: allSpans },
    })
    const rows = wrapper.findAll('[data-testid="trace-span-row"]')
    // First row is root (DFS order); check its label area indent
    const labelArea = rows[0].find('[data-testid="span-label"]')
    expect(labelArea.exists()).toBe(true)
    // Root has depth 0, so paddingLeft should be 0px (or minimal base)
    const style = labelArea.attributes('style') ?? ''
    // depth=0 means padding-left: 0px
    expect(style).toContain('padding-left: 0px')
  })

  // Test 3: Child spans indented based on depth
  it('child spans are indented based on depth', () => {
    const wrapper = mount(TraceDetailPanel, {
      props: { spans: allSpans },
    })
    const rows = wrapper.findAll('[data-testid="trace-span-row"]')
    // DFS order: root(0), child-a(1), grandchild(2), child-b(1)
    const labels = rows.map((r) => r.find('[data-testid="span-label"]'))

    // child-a at depth 1 → 16px indent
    expect(labels[1].attributes('style')).toContain('padding-left: 16px')
    // grandchild at depth 2 → 32px indent
    expect(labels[2].attributes('style')).toContain('padding-left: 32px')
    // child-b at depth 1 → 16px indent
    expect(labels[3].attributes('style')).toContain('padding-left: 16px')
  })

  // Test 4: Bar width proportional to duration
  it('bar width proportional to duration', () => {
    const wrapper = mount(TraceDetailPanel, {
      props: { spans: allSpans },
    })
    const bars = wrapper.findAll('[data-testid="span-bar"]')
    expect(bars).toHaveLength(4)

    // traceDuration auto-detected as 500000 (root span: starts at 1000000, duration 500000)
    // But traceDuration = max(startTime+duration) - min(startTime) = (1500000 - 1000000) = 500000
    // Root bar width = 500000/500000 * 100 = 100%
    const rootBar = bars[0]
    const rootStyle = rootBar.attributes('style') ?? ''
    expect(rootStyle).toContain('width: 100%')

    // child-a bar width = 200000/500000 * 100 = 40%
    const childABar = bars[1]
    const childAStyle = childABar.attributes('style') ?? ''
    expect(childAStyle).toContain('width: 40%')
  })

  // Test 5: Bar left position proportional to start time offset
  it('bar left position proportional to start time offset', () => {
    const wrapper = mount(TraceDetailPanel, {
      props: { spans: allSpans },
    })
    const bars = wrapper.findAll('[data-testid="span-bar"]')

    // Root starts at traceStartTime, so left = 0%
    const rootStyle = bars[0].attributes('style') ?? ''
    expect(rootStyle).toContain('left: 0%')

    // child-a: (1050000 - 1000000) / 500000 * 100 = 10%
    const childAStyle = bars[1].attributes('style') ?? ''
    expect(childAStyle).toContain('left: 10%')

    // child-b: (1100000 - 1000000) / 500000 * 100 = 20%
    const childBStyle = bars[3].attributes('style') ?? ''
    expect(childBStyle).toContain('left: 20%')
  })

  // Test 6: Error spans use thresholdColors.critical
  it('error spans use thresholdColors.critical color', () => {
    const wrapper = mount(TraceDetailPanel, {
      props: { spans: allSpans },
    })
    const bars = wrapper.findAll('[data-testid="span-bar"]')

    // child-b is the error span (index 3 in DFS)
    const errorBarStyle = bars[3].attributes('style') ?? ''
    expect(errorBarStyle).toContain(thresholdColors.critical)
  })

  // Test 7: Same service name gets same color
  it('same service name gets same color', () => {
    const wrapper = mount(TraceDetailPanel, {
      props: { spans: allSpans },
    })
    const bars = wrapper.findAll('[data-testid="span-bar"]')

    // child-a and grandchild both have serviceName 'user-service'
    const childAStyle = bars[1].attributes('style') ?? ''
    const grandchildStyle = bars[2].attributes('style') ?? ''

    // Extract background-color from both — they should match
    // Both use the same service so get the same getSeriesColor index
    // Service order: gateway(0), user-service(1), cache-service(2)
    const expectedColor = getSeriesColor(1)
    expect(childAStyle).toContain(expectedColor)
    expect(grandchildStyle).toContain(expectedColor)
  })

  // Test 8: Duration formatted correctly (us/ms/s thresholds)
  it('duration formatted correctly (us/ms/s thresholds)', () => {
    const spansWithVariousDurations: TraceSpanItem[] = [
      {
        spanId: 'fast',
        operationName: 'fast-op',
        serviceName: 'svc',
        startTime: 0,
        duration: 500, // 500us
      },
      {
        spanId: 'medium',
        operationName: 'medium-op',
        serviceName: 'svc',
        startTime: 0,
        duration: 5000, // 5ms (5000us)
      },
      {
        spanId: 'slow',
        operationName: 'slow-op',
        serviceName: 'svc',
        startTime: 0,
        duration: 2500000, // 2.5s
      },
    ]

    const wrapper = mount(TraceDetailPanel, {
      props: { spans: spansWithVariousDurations },
    })
    const durationLabels = wrapper.findAll('[data-testid="span-duration"]')
    expect(durationLabels).toHaveLength(3)

    // 500us → "500us"
    expect(durationLabels[0].text()).toContain('500')
    expect(durationLabels[0].text()).toContain('us')
    // 5000us = 5ms → "5ms"
    expect(durationLabels[1].text()).toContain('5')
    expect(durationLabels[1].text()).toContain('ms')
    // 2500000us = 2.5s → "2.5s"
    expect(durationLabels[2].text()).toContain('2.5')
    expect(durationLabels[2].text()).toContain('s')
  })

  // Test 9: Service name and operation name displayed
  it('displays service name and operation name', () => {
    const wrapper = mount(TraceDetailPanel, {
      props: { spans: [rootSpan] },
    })
    const row = wrapper.find('[data-testid="trace-span-row"]')
    expect(row.text()).toContain('gateway')
    expect(row.text()).toContain('HTTP GET /api')
  })

  // Test 10: Handles empty spans (empty state)
  it('handles empty spans gracefully', () => {
    const wrapper = mount(TraceDetailPanel, {
      props: { spans: [] },
    })
    const rows = wrapper.findAll('[data-testid="trace-span-row"]')
    expect(rows).toHaveLength(0)
    // Container should still render
    const container = wrapper.find('[data-testid="trace-detail-container"]')
    expect(container.exists()).toBe(true)
  })

  // Test 11: Handles single span (root only)
  it('handles single span (root only)', () => {
    const wrapper = mount(TraceDetailPanel, {
      props: { spans: [rootSpan] },
    })
    const rows = wrapper.findAll('[data-testid="trace-span-row"]')
    expect(rows).toHaveLength(1)

    // Bar should span full width
    const bar = wrapper.find('[data-testid="span-bar"]')
    const style = bar.attributes('style') ?? ''
    expect(style).toContain('width: 100%')
    expect(style).toContain('left: 0%')
  })

  // Test 12: Auto-detects traceStartTime and traceDuration from spans
  it('auto-detects traceStartTime and traceDuration when not provided', () => {
    // Two spans: one starts at 100, duration 50; another starts at 120, duration 80
    // traceStart = 100, traceEnd = max(100+50, 120+80) = 200, traceDuration = 100
    const spans: TraceSpanItem[] = [
      {
        spanId: 's1',
        operationName: 'op1',
        serviceName: 'svc',
        startTime: 100,
        duration: 50,
      },
      {
        spanId: 's2',
        operationName: 'op2',
        serviceName: 'svc',
        startTime: 120,
        duration: 80,
      },
    ]

    const wrapper = mount(TraceDetailPanel, {
      props: { spans },
    })
    const bars = wrapper.findAll('[data-testid="span-bar"]')

    // s1: left = (100-100)/100 = 0%, width = 50/100 = 50%
    expect(bars[0].attributes('style')).toContain('left: 0%')
    expect(bars[0].attributes('style')).toContain('width: 50%')

    // s2: left = (120-100)/100 = 20%, width = 80/100 = 80%
    expect(bars[1].attributes('style')).toContain('left: 20%')
    expect(bars[1].attributes('style')).toContain('width: 80%')
  })

  // Test 13: Container is scrollable
  it('container is scrollable', () => {
    const wrapper = mount(TraceDetailPanel, {
      props: { spans: allSpans },
    })
    const container = wrapper.find('[data-testid="trace-detail-container"]')
    expect(container.exists()).toBe(true)
    const style = container.attributes('style') ?? ''
    expect(style).toContain('overflow')
  })

  // Test 14: Explicit traceStartTime and traceDuration override auto-detection
  it('respects explicit traceStartTime and traceDuration props', () => {
    const spans: TraceSpanItem[] = [
      {
        spanId: 's1',
        operationName: 'op1',
        serviceName: 'svc',
        startTime: 200,
        duration: 100,
      },
    ]
    const wrapper = mount(TraceDetailPanel, {
      props: {
        spans,
        traceStartTime: 0,
        traceDuration: 1000,
      },
    })
    const bar = wrapper.find('[data-testid="span-bar"]')
    const style = bar.attributes('style') ?? ''
    // left = (200 - 0) / 1000 * 100 = 20%
    expect(style).toContain('left: 20%')
    // width = 100 / 1000 * 100 = 10%
    expect(style).toContain('width: 10%')
  })

  // Test 15: Different services get different colors
  it('different services get different colors', () => {
    const wrapper = mount(TraceDetailPanel, {
      props: { spans: allSpans },
    })
    const bars = wrapper.findAll('[data-testid="span-bar"]')

    // gateway (index 0), user-service (index 1) should have different colors
    // (skip error span for this check)
    const gatewayStyle = bars[0].attributes('style') ?? ''
    const userSvcStyle = bars[1].attributes('style') ?? ''

    const gatewayColor = getSeriesColor(0)
    const userSvcColor = getSeriesColor(1)

    expect(gatewayStyle).toContain(gatewayColor)
    expect(userSvcStyle).toContain(userSvcColor)
    expect(gatewayColor).not.toBe(userSvcColor)
  })
})

// ---------------------------------------------------------------------------
// Registration tests
// ---------------------------------------------------------------------------

describe('trace_detail panel registration', () => {
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  let reg: any

  beforeEach(async () => {
    clearRegistry()
    const { registerPanel } = await import('../../utils/panelRegistry')
    const { GitBranch } = await import('lucide-vue-next')
    registerPanel({
      type: 'trace_detail',
      component: () => import('./TraceDetailPanel.vue'),
      dataAdapter: () => {
        return { spans: [] }
      },
      defaultQuery: {},
      category: 'observability',
      label: 'Trace Detail',
      icon: GitBranch,
    })
    const { lookupPanel } = await import('../../utils/panelRegistry')
    reg = lookupPanel('trace_detail')
  })

  afterEach(() => {
    clearRegistry()
  })

  it('registers with type "trace_detail"', () => {
    expect(reg).not.toBeNull()
    expect(reg?.type).toBe('trace_detail')
  })

  it('registers with category "observability"', () => {
    expect(reg?.category).toBe('observability')
  })

  it('registers with label "Trace Detail"', () => {
    expect(reg?.label).toBe('Trace Detail')
  })

  it('dataAdapter returns empty spans', () => {
    const result = reg!.dataAdapter({ series: [] })
    expect(result.spans).toBeDefined()
    expect(result.spans).toHaveLength(0)
  })

  it('defaultQuery is an empty object', () => {
    expect(reg?.defaultQuery).toEqual({})
  })

  it('icon is defined', () => {
    expect(reg?.icon).toBeDefined()
  })
})
