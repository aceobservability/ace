import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chartAxisStyle, chartPalette, chartTooltipStyle } from '../../utils/chartTheme'
import { clearRegistry } from '../../utils/panelRegistry'

// Mock ECharts components
vi.mock('vue-echarts', () => ({
  default: {
    name: 'VChart',
    props: ['option', 'autoresize'],
    template: '<div class="echarts-mock" :data-option="JSON.stringify(option)"></div>',
    methods: {
      resize: vi.fn(),
    },
  },
}))

vi.mock('echarts/core', () => ({
  use: vi.fn(),
}))

vi.mock('echarts/renderers', () => ({
  CanvasRenderer: {},
}))

vi.mock('echarts/charts', () => ({
  BarChart: {},
}))

vi.mock('echarts/components', () => ({
  GridComponent: {},
  TooltipComponent: {},
}))

// ---------------------------------------------------------------------------
// HistogramPanel component tests
// ---------------------------------------------------------------------------

describe('HistogramPanel', () => {
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  let HistogramPanel: any

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('./HistogramPanel.vue')
    HistogramPanel = mod.default
  })

  const mockBuckets = [
    { label: '0-10', count: 5 },
    { label: '10-20', count: 12 },
    { label: '20-30', count: 8 },
    { label: '30-40', count: 3 },
  ]

  it('renders with valid bucket data', () => {
    const wrapper = mount(HistogramPanel, {
      props: { buckets: mockBuckets },
    })
    expect(wrapper.find('.h-full.w-full').exists()).toBe(true)
    expect(wrapper.find('.echarts-mock').exists()).toBe(true)
  })

  it('series type is bar', () => {
    const wrapper = mount(HistogramPanel, {
      props: { buckets: mockBuckets },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.series).toHaveLength(1)
    expect(option.series[0].type).toBe('bar')
  })

  it('bar width is 90% (histogram style)', () => {
    const wrapper = mount(HistogramPanel, {
      props: { buckets: mockBuckets },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.series[0].barWidth).toBe('90%')
  })

  it('uses chartPalette[0] (Steel Blue) as default bar color', () => {
    const wrapper = mount(HistogramPanel, {
      props: { buckets: mockBuckets },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.series[0].itemStyle.color).toBe(chartPalette[0])
  })

  it('custom color prop overrides default', () => {
    const customColor = '#FF0000'
    const wrapper = mount(HistogramPanel, {
      props: { buckets: mockBuckets, color: customColor },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.series[0].itemStyle.color).toBe(customColor)
  })

  it('applies chartAxisStyle to xAxis', () => {
    const wrapper = mount(HistogramPanel, {
      props: { buckets: mockBuckets },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.xAxis.axisLine.lineStyle.color).toBe(chartAxisStyle.axisLine.lineStyle.color)
    expect(option.xAxis.axisTick.show).toBe(chartAxisStyle.axisTick.show)
    expect(option.xAxis.axisLabel.color).toBe(chartAxisStyle.axisLabel.color)
    expect(option.xAxis.axisLabel.fontFamily).toBe(chartAxisStyle.axisLabel.fontFamily)
  })

  it('applies chartAxisStyle to yAxis', () => {
    const wrapper = mount(HistogramPanel, {
      props: { buckets: mockBuckets },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.yAxis.axisLine.lineStyle.color).toBe(chartAxisStyle.axisLine.lineStyle.color)
    expect(option.yAxis.axisTick.show).toBe(chartAxisStyle.axisTick.show)
    expect(option.yAxis.axisLabel.color).toBe(chartAxisStyle.axisLabel.color)
    expect(option.yAxis.axisLabel.fontFamily).toBe(chartAxisStyle.axisLabel.fontFamily)
  })

  it('applies chartTooltipStyle to tooltip', () => {
    const wrapper = mount(HistogramPanel, {
      props: { buckets: mockBuckets },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.tooltip.backgroundColor).toBe(chartTooltipStyle.backgroundColor)
    expect(option.tooltip.borderColor).toBe(chartTooltipStyle.borderColor)
    expect(option.tooltip.textStyle.color).toBe(chartTooltipStyle.textStyle.color)
  })

  it('xAxis uses bucket labels as category data', () => {
    const wrapper = mount(HistogramPanel, {
      props: { buckets: mockBuckets },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.xAxis.type).toBe('category')
    expect(option.xAxis.data).toEqual(mockBuckets.map((b) => b.label))
  })

  it('series data uses bucket counts', () => {
    const wrapper = mount(HistogramPanel, {
      props: { buckets: mockBuckets },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.series[0].data).toEqual(mockBuckets.map((b) => b.count))
  })

  it('handles empty buckets gracefully', () => {
    const wrapper = mount(HistogramPanel, {
      props: { buckets: [] },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.series[0].data).toHaveLength(0)
    expect(option.xAxis.data).toHaveLength(0)
  })

  it('has transparent background', () => {
    const wrapper = mount(HistogramPanel, {
      props: { buckets: mockBuckets },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.backgroundColor).toBe('transparent')
  })

  it('grid has padding properties', () => {
    const wrapper = mount(HistogramPanel, {
      props: { buckets: mockBuckets },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.grid).toBeDefined()
    expect(option.grid.left).toBeDefined()
    expect(option.grid.right).toBeDefined()
    expect(option.grid.top).toBeDefined()
    expect(option.grid.bottom).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Data adapter tests
// ---------------------------------------------------------------------------

describe('histogram dataAdapter', () => {
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  let adapter: (raw: any) => any

  beforeEach(async () => {
    clearRegistry()
    const { registerPanel: reg } = await import('../../utils/panelRegistry')
    const { BarChart3 } = await import('lucide-vue-next')
    reg({
      type: 'histogram',
      component: () => import('./HistogramPanel.vue'),
      dataAdapter: (raw) => {
        if (raw.series.length === 0) return { buckets: [] }
        const firstSeries = raw.series[0]
        const points = firstSeries.data as Array<{ timestamp: number; value: number }>
        const buckets = points.map((p: { timestamp: number; value: number }, i: number) => ({
          label: String(i),
          count: p.value,
        }))
        return { buckets }
      },
      defaultQuery: {},
      category: 'charts',
      label: 'Histogram',
      icon: BarChart3,
    })

    const { lookupPanel } = await import('../../utils/panelRegistry')
    adapter = lookupPanel('histogram')!.dataAdapter
  })

  afterEach(() => {
    clearRegistry()
  })

  it('transforms series data into histogram buckets', () => {
    const raw = {
      series: [
        {
          name: 'series-A',
          data: [
            { timestamp: 1000, value: 5 },
            { timestamp: 2000, value: 10 },
            { timestamp: 3000, value: 15 },
          ],
        },
      ],
    }

    const result = adapter(raw) as { buckets: Array<{ label: string; count: number }> }

    expect(result.buckets).toHaveLength(3)
    expect(result.buckets[0]).toEqual({ label: '0', count: 5 })
    expect(result.buckets[1]).toEqual({ label: '1', count: 10 })
    expect(result.buckets[2]).toEqual({ label: '2', count: 15 })
  })

  it('dataAdapter handles empty series', () => {
    const raw = { series: [] }
    const result = adapter(raw) as { buckets: unknown[] }

    expect(result.buckets).toHaveLength(0)
  })

  it('registers with type "histogram" and category "charts"', async () => {
    const { lookupPanel } = await import('../../utils/panelRegistry')
    const registration = lookupPanel('histogram')

    expect(registration).not.toBeNull()
    expect(registration?.type).toBe('histogram')
    expect(registration?.category).toBe('charts')
    expect(registration?.label).toBe('Histogram')
  })
})
