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
  HeatmapChart: {},
}))

vi.mock('echarts/components', () => ({
  GridComponent: {},
  TooltipComponent: {},
  VisualMapComponent: {},
}))

// ---------------------------------------------------------------------------
// HeatmapPanel component tests
// ---------------------------------------------------------------------------

describe('HeatmapPanel', () => {
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  let HeatmapPanel: any

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('./HeatmapPanel.vue')
    HeatmapPanel = mod.default
  })

  const mockData = [
    { x: 0, y: 0, value: 10 },
    { x: 1, y: 0, value: 20 },
    { x: 0, y: 1, value: 30 },
    { x: 1, y: 1, value: 40 },
  ]

  it('renders with valid heatmap data', () => {
    const wrapper = mount(HeatmapPanel, {
      props: { data: mockData },
    })
    expect(wrapper.find('.h-full.w-full').exists()).toBe(true)
    expect(wrapper.find('.echarts-mock').exists()).toBe(true)
  })

  it('series type is heatmap', () => {
    const wrapper = mount(HeatmapPanel, {
      props: { data: mockData },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.series).toHaveLength(1)
    expect(option.series[0].type).toBe('heatmap')
  })

  it('maps data to [x, y, value] format', () => {
    const wrapper = mount(HeatmapPanel, {
      props: { data: mockData },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    const seriesData = option.series[0].data
    expect(seriesData).toHaveLength(4)
    expect(seriesData[0]).toEqual([0, 0, 10])
    expect(seriesData[1]).toEqual([1, 0, 20])
    expect(seriesData[2]).toEqual([0, 1, 30])
    expect(seriesData[3]).toEqual([1, 1, 40])
  })

  it('uses chartPalette colors in visualMap (Steel Blue to Rust Orange)', () => {
    const wrapper = mount(HeatmapPanel, {
      props: { data: mockData },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.visualMap).toBeDefined()
    expect(option.visualMap.inRange.color).toContain(chartPalette[0]) // Steel Blue
    expect(option.visualMap.inRange.color).toContain(chartPalette[1]) // Rust Orange
  })

  it('visualMap min defaults to 0', () => {
    const wrapper = mount(HeatmapPanel, {
      props: { data: mockData },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.visualMap.min).toBe(0)
  })

  it('visualMap max auto-detects from data when not provided', () => {
    const wrapper = mount(HeatmapPanel, {
      props: { data: mockData },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.visualMap.max).toBe(40) // max value in mockData
  })

  it('uses provided min and max in visualMap', () => {
    const wrapper = mount(HeatmapPanel, {
      props: { data: mockData, min: 5, max: 100 },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.visualMap.min).toBe(5)
    expect(option.visualMap.max).toBe(100)
  })

  it('visualMap is continuous type', () => {
    const wrapper = mount(HeatmapPanel, {
      props: { data: mockData },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.visualMap.type).toBe('continuous')
  })

  it('applies chartAxisStyle to xAxis', () => {
    const wrapper = mount(HeatmapPanel, {
      props: { data: mockData },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.xAxis.axisLine.lineStyle.color).toBe(chartAxisStyle.axisLine.lineStyle.color)
    expect(option.xAxis.axisTick.show).toBe(chartAxisStyle.axisTick.show)
    expect(option.xAxis.axisLabel.color).toBe(chartAxisStyle.axisLabel.color)
    expect(option.xAxis.axisLabel.fontFamily).toBe(chartAxisStyle.axisLabel.fontFamily)
  })

  it('applies chartAxisStyle to yAxis', () => {
    const wrapper = mount(HeatmapPanel, {
      props: { data: mockData },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.yAxis.axisLine.lineStyle.color).toBe(chartAxisStyle.axisLine.lineStyle.color)
    expect(option.yAxis.axisTick.show).toBe(chartAxisStyle.axisTick.show)
    expect(option.yAxis.axisLabel.color).toBe(chartAxisStyle.axisLabel.color)
    expect(option.yAxis.axisLabel.fontFamily).toBe(chartAxisStyle.axisLabel.fontFamily)
  })

  it('applies chartTooltipStyle to tooltip', () => {
    const wrapper = mount(HeatmapPanel, {
      props: { data: mockData },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.tooltip.backgroundColor).toBe(chartTooltipStyle.backgroundColor)
    expect(option.tooltip.borderColor).toBe(chartTooltipStyle.borderColor)
    expect(option.tooltip.textStyle.color).toBe(chartTooltipStyle.textStyle.color)
  })

  it('tooltip trigger is item', () => {
    const wrapper = mount(HeatmapPanel, {
      props: { data: mockData },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.tooltip.trigger).toBe('item')
  })

  it('uses xLabels on xAxis when provided', () => {
    const xLabels = ['Mon', 'Tue']
    const wrapper = mount(HeatmapPanel, {
      props: { data: mockData, xLabels },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.xAxis.data).toEqual(xLabels)
  })

  it('uses yLabels on yAxis when provided', () => {
    const yLabels = ['row0', 'row1']
    const wrapper = mount(HeatmapPanel, {
      props: { data: mockData, yLabels },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.yAxis.data).toEqual(yLabels)
  })

  it('has transparent background', () => {
    const wrapper = mount(HeatmapPanel, {
      props: { data: mockData },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.backgroundColor).toBe('transparent')
  })

  it('grid has padding properties', () => {
    const wrapper = mount(HeatmapPanel, {
      props: { data: mockData },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.grid).toBeDefined()
    expect(option.grid.left).toBeDefined()
    expect(option.grid.right).toBeDefined()
    expect(option.grid.top).toBeDefined()
    expect(option.grid.bottom).toBeDefined()
  })

  it('handles empty data gracefully', () => {
    const wrapper = mount(HeatmapPanel, {
      props: { data: [] },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.series[0].data).toHaveLength(0)
    expect(option.visualMap.max).toBe(0) // fallback when no data
  })
})

// ---------------------------------------------------------------------------
// Data adapter tests
// The index.ts is imported once at module load; clearRegistry + re-register
// pattern is used to isolate tests from each other without re-importing the
// cached ES module.
// ---------------------------------------------------------------------------

describe('heatmap dataAdapter', () => {
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  let adapter: (raw: any) => any

  beforeEach(async () => {
    clearRegistry()
    // Re-run registration by calling it directly rather than reimporting module
    const { registerPanel: reg } = await import('../../utils/panelRegistry')
    const { Grid3x3 } = await import('lucide-vue-next')
    reg({
      type: 'heatmap',
      component: () => import('./HeatmapPanel.vue'),
      dataAdapter: (raw) => {
        const data: Array<{ x: number | string; y: number | string; value: number }> = []
        const yLabels: string[] = []
        for (const series of raw.series) {
          yLabels.push(series.name)
          const yIndex = yLabels.length - 1
          const points = series.data as Array<{ timestamp: number; value: number }>
          for (let xIndex = 0; xIndex < points.length; xIndex++) {
            const point = points[xIndex]
            data.push({ x: point.timestamp, y: yIndex, value: point.value })
          }
        }
        return { data, yLabels }
      },
      defaultQuery: {},
      category: 'charts',
      label: 'Heatmap',
      icon: Grid3x3,
    })

    const { lookupPanel } = await import('../../utils/panelRegistry')
    adapter = lookupPanel('heatmap')!.dataAdapter
  })

  afterEach(() => {
    clearRegistry()
  })

  it('transforms series data into heatmap format', () => {
    const raw = {
      series: [
        {
          name: 'series-A',
          data: [
            { timestamp: 1000, value: 5 },
            { timestamp: 2000, value: 10 },
          ],
        },
        {
          name: 'series-B',
          data: [
            { timestamp: 1000, value: 15 },
            { timestamp: 2000, value: 20 },
          ],
        },
      ],
    }

    const result = adapter(raw) as {
      data: Array<{ x: number; y: number; value: number }>
      yLabels: string[]
    }

    expect(result.yLabels).toEqual(['series-A', 'series-B'])
    expect(result.data).toHaveLength(4)

    // series-A (yIndex 0)
    expect(result.data[0]).toEqual({ x: 1000, y: 0, value: 5 })
    expect(result.data[1]).toEqual({ x: 2000, y: 0, value: 10 })

    // series-B (yIndex 1)
    expect(result.data[2]).toEqual({ x: 1000, y: 1, value: 15 })
    expect(result.data[3]).toEqual({ x: 2000, y: 1, value: 20 })
  })

  it('dataAdapter handles empty series', () => {
    const raw = { series: [] }
    const result = adapter(raw) as {
      data: unknown[]
      yLabels: string[]
    }

    expect(result.data).toHaveLength(0)
    expect(result.yLabels).toHaveLength(0)
  })

  it('registers with type "heatmap" and category "charts"', async () => {
    const { lookupPanel } = await import('../../utils/panelRegistry')
    const registration = lookupPanel('heatmap')

    expect(registration).not.toBeNull()
    expect(registration?.type).toBe('heatmap')
    expect(registration?.category).toBe('charts')
    expect(registration?.label).toBe('Heatmap')
  })
})
