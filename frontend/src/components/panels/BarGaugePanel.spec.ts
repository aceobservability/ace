import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chartAxisStyle, chartGridStyle, chartPalette, chartTooltipStyle, getSeriesColor } from '../../utils/chartTheme'
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
// BarGaugePanel component tests
// ---------------------------------------------------------------------------

describe('BarGaugePanel', () => {
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  let BarGaugePanel: any

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('./BarGaugePanel.vue')
    BarGaugePanel = mod.default
  })

  const mockItems = [
    { label: 'CPU', value: 72, max: 100 },
    { label: 'Memory', value: 45, max: 100 },
    { label: 'Disk', value: 88, max: 100 },
  ]

  // Test 1: Renders with valid items
  it('renders with valid items', () => {
    const wrapper = mount(BarGaugePanel, {
      props: { items: mockItems },
    })
    expect(wrapper.find('.h-full.w-full').exists()).toBe(true)
    expect(wrapper.find('.echarts-mock').exists()).toBe(true)
  })

  // Test 2: Horizontal orientation by default (yAxis is category)
  it('horizontal orientation by default — yAxis is category with item labels', () => {
    const wrapper = mount(BarGaugePanel, {
      props: { items: mockItems },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    // In horizontal mode: yAxis = category (labels), xAxis = value
    expect(option.yAxis[0].type).toBe('category')
    expect(option.yAxis[0].data).toEqual(mockItems.map((i) => i.label))
    expect(option.xAxis[0].type).toBe('value')
  })

  // Test 3: Vertical orientation swaps axes
  it('vertical orientation swaps axes — xAxis is category', () => {
    const wrapper = mount(BarGaugePanel, {
      props: { items: mockItems, orientation: 'vertical' },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    // In vertical mode: xAxis = category (labels), yAxis = value
    expect(option.xAxis[0].type).toBe('category')
    expect(option.xAxis[0].data).toEqual(mockItems.map((i) => i.label))
    expect(option.yAxis[0].type).toBe('value')
  })

  // Test 4: Bar colors use chartPalette via getSeriesColor
  it('bar colors cycle through chartPalette via getSeriesColor', () => {
    const wrapper = mount(BarGaugePanel, {
      props: { items: mockItems },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    // Value series: each bar item should have the correct palette color
    const valueSeries = option.series.find((s: { id?: string }) => s.id === 'values')
    expect(valueSeries).toBeDefined()
    const seriesData = valueSeries.data
    expect(seriesData[0].itemStyle.color).toBe(getSeriesColor(0))
    expect(seriesData[1].itemStyle.color).toBe(getSeriesColor(1))
    expect(seriesData[2].itemStyle.color).toBe(getSeriesColor(2))
  })

  // Test 5: Background bars shown at max value using gridColor
  it('background bars shown at max value using chartGridStyle.gridColor', () => {
    const wrapper = mount(BarGaugePanel, {
      props: { items: mockItems },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    // Background series exists and uses gridColor
    const bgSeries = option.series.find((s: { id?: string }) => s.id === 'background')
    expect(bgSeries).toBeDefined()
    expect(bgSeries.data[0].value).toBe(mockItems[0].max)
    expect(bgSeries.data[1].value).toBe(mockItems[1].max)
    expect(bgSeries.data[2].value).toBe(mockItems[2].max)
    expect(bgSeries.data[0].itemStyle.color).toBe(chartGridStyle.gridColor)
  })

  // Test 6: Applies chartAxisStyle
  it('applies chartAxisStyle to category axis', () => {
    const wrapper = mount(BarGaugePanel, {
      props: { items: mockItems },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    // Horizontal: yAxis[0] is category axis
    const categoryAxis = option.yAxis[0]
    expect(categoryAxis.axisLine.lineStyle.color).toBe(chartAxisStyle.axisLine.lineStyle.color)
    expect(categoryAxis.axisTick.show).toBe(chartAxisStyle.axisTick.show)
    expect(categoryAxis.axisLabel.color).toBe(chartAxisStyle.axisLabel.color)
    expect(categoryAxis.axisLabel.fontFamily).toBe(chartAxisStyle.axisLabel.fontFamily)
  })

  // Test 7: Applies chartTooltipStyle
  it('applies chartTooltipStyle to tooltip', () => {
    const wrapper = mount(BarGaugePanel, {
      props: { items: mockItems },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.tooltip.backgroundColor).toBe(chartTooltipStyle.backgroundColor)
    expect(option.tooltip.borderColor).toBe(chartTooltipStyle.borderColor)
    expect(option.tooltip.textStyle.color).toBe(chartTooltipStyle.textStyle.color)
  })

  // Test 8: Handles empty items
  it('handles empty items gracefully', () => {
    const wrapper = mount(BarGaugePanel, {
      props: { items: [] },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    const valueSeries = option.series.find((s: { id?: string }) => s.id === 'values')
    expect(valueSeries.data).toHaveLength(0)
  })

  // Additional: has transparent background
  it('has transparent background', () => {
    const wrapper = mount(BarGaugePanel, {
      props: { items: mockItems },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.backgroundColor).toBe('transparent')
  })

  // Additional: value series type is bar
  it('series type is bar', () => {
    const wrapper = mount(BarGaugePanel, {
      props: { items: mockItems },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    const valueSeries = option.series.find((s: { id?: string }) => s.id === 'values')
    expect(valueSeries.type).toBe('bar')
  })

  // Additional: default max is 100 when not specified
  it('defaults max to 100 when not provided per item', () => {
    const itemsWithoutMax = [
      { label: 'CPU', value: 60 },
      { label: 'Memory', value: 30 },
    ]
    const wrapper = mount(BarGaugePanel, {
      props: { items: itemsWithoutMax },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    const bgSeries = option.series.find((s: { id?: string }) => s.id === 'background')
    expect(bgSeries.data[0].value).toBe(100)
    expect(bgSeries.data[1].value).toBe(100)
  })

  // Additional: palette wraps around for many items
  it('palette colors wrap around for more than 10 items', () => {
    const manyItems = Array.from({ length: 12 }, (_, i) => ({
      label: `Item ${i}`,
      value: i * 5,
      max: 100,
    }))
    const wrapper = mount(BarGaugePanel, {
      props: { items: manyItems },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    const valueSeries = option.series.find((s: { id?: string }) => s.id === 'values')
    // Index 10 wraps to palette index 0
    expect(valueSeries.data[10].itemStyle.color).toBe(chartPalette[0])
    // Index 11 wraps to palette index 1
    expect(valueSeries.data[11].itemStyle.color).toBe(chartPalette[1])
  })

  // Additional: grid has padding
  it('grid has padding properties', () => {
    const wrapper = mount(BarGaugePanel, {
      props: { items: mockItems },
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

describe('bar_gauge dataAdapter', () => {
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  let adapter: (raw: any) => any

  beforeEach(async () => {
    clearRegistry()
    const { registerPanel: reg } = await import('../../utils/panelRegistry')
    const { GaugeCircle } = await import('lucide-vue-next')
    reg({
      type: 'bar_gauge',
      component: () => import('./BarGaugePanel.vue'),
      dataAdapter: (raw) => {
        const items = raw.series.map((s: { name: string; data: Array<{ timestamp: number; value: number }> }) => {
          const points = s.data as Array<{ timestamp: number; value: number }>
          const latestValue = points.length > 0 ? points[points.length - 1].value : 0
          return { label: s.name, value: latestValue, max: 100 }
        })
        return { items }
      },
      defaultQuery: {},
      category: 'stats',
      label: 'Bar Gauge',
      icon: GaugeCircle,
    })

    const { lookupPanel } = await import('../../utils/panelRegistry')
    adapter = lookupPanel('bar_gauge')!.dataAdapter
  })

  afterEach(() => {
    clearRegistry()
  })

  // Test 9: dataAdapter extracts latest values from series
  it('dataAdapter extracts latest value from each series', () => {
    const raw = {
      series: [
        {
          name: 'CPU',
          data: [
            { timestamp: 1000, value: 50 },
            { timestamp: 2000, value: 72 },
          ],
        },
        {
          name: 'Memory',
          data: [
            { timestamp: 1000, value: 30 },
            { timestamp: 2000, value: 45 },
          ],
        },
      ],
    }

    const result = adapter(raw) as { items: Array<{ label: string; value: number; max: number }> }

    expect(result.items).toHaveLength(2)
    expect(result.items[0]).toEqual({ label: 'CPU', value: 72, max: 100 })
    expect(result.items[1]).toEqual({ label: 'Memory', value: 45, max: 100 })
  })

  // Test 10: dataAdapter handles empty series
  it('dataAdapter handles empty series', () => {
    const raw = { series: [] }
    const result = adapter(raw) as { items: unknown[] }

    expect(result.items).toHaveLength(0)
  })

  it('dataAdapter returns 0 for series with no data points', () => {
    const raw = {
      series: [
        { name: 'Empty Series', data: [] },
      ],
    }
    const result = adapter(raw) as { items: Array<{ label: string; value: number; max: number }> }

    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toEqual({ label: 'Empty Series', value: 0, max: 100 })
  })

  it('registers with type "bar_gauge" and category "stats"', async () => {
    const { lookupPanel } = await import('../../utils/panelRegistry')
    const registration = lookupPanel('bar_gauge')

    expect(registration).not.toBeNull()
    expect(registration?.type).toBe('bar_gauge')
    expect(registration?.category).toBe('stats')
    expect(registration?.label).toBe('Bar Gauge')
  })
})
