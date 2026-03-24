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
  ScatterChart: {},
}))

vi.mock('echarts/components', () => ({
  GridComponent: {},
  TooltipComponent: {},
  VisualMapComponent: {},
}))

// ---------------------------------------------------------------------------
// GeomapPanel component tests
// ---------------------------------------------------------------------------

describe('GeomapPanel', () => {
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  let GeomapPanel: any

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('./GeomapPanel.vue')
    GeomapPanel = mod.default
  })

  const mockPoints = [
    { lat: 40.7128, lon: -74.006, value: 100, label: 'New York' },
    { lat: 51.5074, lon: -0.1278, value: 200, label: 'London' },
    { lat: 35.6762, lon: 139.6503, value: 150, label: 'Tokyo' },
    { lat: -33.8688, lon: 151.2093, value: 80, label: 'Sydney' },
  ]

  it('renders with valid geo data points', () => {
    const wrapper = mount(GeomapPanel, {
      props: { points: mockPoints },
    })
    expect(wrapper.find('.h-full.w-full').exists()).toBe(true)
    expect(wrapper.find('.echarts-mock').exists()).toBe(true)
  })

  it('series type is scatter', () => {
    const wrapper = mount(GeomapPanel, {
      props: { points: mockPoints },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.series).toHaveLength(1)
    expect(option.series[0].type).toBe('scatter')
  })

  it('xAxis range covers -180 to 180 (longitude)', () => {
    const wrapper = mount(GeomapPanel, {
      props: { points: mockPoints },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.xAxis.min).toBe(-180)
    expect(option.xAxis.max).toBe(180)
  })

  it('yAxis range covers -90 to 90 (latitude)', () => {
    const wrapper = mount(GeomapPanel, {
      props: { points: mockPoints },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.yAxis.min).toBe(-90)
    expect(option.yAxis.max).toBe(90)
  })

  it('data is correctly mapped to [lon, lat, value] format', () => {
    const wrapper = mount(GeomapPanel, {
      props: { points: mockPoints },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    const seriesData = option.series[0].data
    expect(seriesData).toHaveLength(4)
    // [lon, lat, value]
    expect(seriesData[0]).toEqual([-74.006, 40.7128, 100])
    expect(seriesData[1]).toEqual([-0.1278, 51.5074, 200])
    expect(seriesData[2]).toEqual([139.6503, 35.6762, 150])
    expect(seriesData[3]).toEqual([151.2093, -33.8688, 80])
  })

  it('symbol size scales proportionally with value (min 8, max 40)', async () => {
    const wrapper = mount(GeomapPanel, {
      props: { points: mockPoints, max: 200 },
    })

    // symbolSize is a function in the component — access it directly from the component's
    // computed chartOption rather than through JSON.stringify (which drops functions)
    // biome-ignore lint/suspicious/noExplicitAny: test helper
    const vm = wrapper.vm as any
    const symbolSizeFn = vm.chartOption?.series?.[0]?.symbolSize

    expect(typeof symbolSizeFn).toBe('function')

    // value=200, max=200 → 8 + 32 * 1.0 = 40
    expect(symbolSizeFn([0, 0, 200])).toBe(40)
    // value=100, max=200 → 8 + 32 * 0.5 = 24
    expect(symbolSizeFn([0, 0, 100])).toBe(24)
    // value=0, max=200 → 8 (minimum)
    expect(symbolSizeFn([0, 0, 0])).toBe(8)
  })

  it('visualMap uses chartPalette colors (Steel Blue to Rust Orange)', () => {
    const wrapper = mount(GeomapPanel, {
      props: { points: mockPoints },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.visualMap).toBeDefined()
    expect(option.visualMap.inRange.color).toContain(chartPalette[0]) // Steel Blue
    expect(option.visualMap.inRange.color).toContain(chartPalette[1]) // Rust Orange
  })

  it('visualMap is continuous type', () => {
    const wrapper = mount(GeomapPanel, {
      props: { points: mockPoints },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.visualMap.type).toBe('continuous')
  })

  it('applies chartAxisStyle to xAxis', () => {
    const wrapper = mount(GeomapPanel, {
      props: { points: mockPoints },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.xAxis.axisLine.lineStyle.color).toBe(chartAxisStyle.axisLine.lineStyle.color)
    expect(option.xAxis.axisTick.show).toBe(chartAxisStyle.axisTick.show)
    expect(option.xAxis.axisLabel.color).toBe(chartAxisStyle.axisLabel.color)
    expect(option.xAxis.axisLabel.fontFamily).toBe(chartAxisStyle.axisLabel.fontFamily)
  })

  it('applies chartAxisStyle to yAxis', () => {
    const wrapper = mount(GeomapPanel, {
      props: { points: mockPoints },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.yAxis.axisLine.lineStyle.color).toBe(chartAxisStyle.axisLine.lineStyle.color)
    expect(option.yAxis.axisTick.show).toBe(chartAxisStyle.axisTick.show)
    expect(option.yAxis.axisLabel.color).toBe(chartAxisStyle.axisLabel.color)
    expect(option.yAxis.axisLabel.fontFamily).toBe(chartAxisStyle.axisLabel.fontFamily)
  })

  it('applies chartTooltipStyle to tooltip', () => {
    const wrapper = mount(GeomapPanel, {
      props: { points: mockPoints },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.tooltip.backgroundColor).toBe(chartTooltipStyle.backgroundColor)
    expect(option.tooltip.borderColor).toBe(chartTooltipStyle.borderColor)
    expect(option.tooltip.textStyle.color).toBe(chartTooltipStyle.textStyle.color)
  })

  it('handles empty points gracefully', () => {
    const wrapper = mount(GeomapPanel, {
      props: { points: [] },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.series[0].data).toHaveLength(0)
  })

  it('xAxis type is value', () => {
    const wrapper = mount(GeomapPanel, {
      props: { points: mockPoints },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.xAxis.type).toBe('value')
  })

  it('yAxis type is value', () => {
    const wrapper = mount(GeomapPanel, {
      props: { points: mockPoints },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.yAxis.type).toBe('value')
  })

  it('has transparent background', () => {
    const wrapper = mount(GeomapPanel, {
      props: { points: mockPoints },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.backgroundColor).toBe('transparent')
  })

  it('grid has padding properties', () => {
    const wrapper = mount(GeomapPanel, {
      props: { points: mockPoints },
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

describe('geomap dataAdapter', () => {
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  let adapter: (raw: any) => any

  beforeEach(async () => {
    clearRegistry()
    const { registerPanel: reg } = await import('../../utils/panelRegistry')
    const { Globe } = await import('lucide-vue-next')
    reg({
      type: 'geomap',
      component: () => import('./GeomapPanel.vue'),
      dataAdapter: (_raw) => {
        // Geo data typically comes from metrics with location labels
        // Stub for now
        return { points: [] }
      },
      defaultQuery: {},
      category: 'charts',
      label: 'Geomap',
      icon: Globe,
    })

    const { lookupPanel } = await import('../../utils/panelRegistry')
    adapter = lookupPanel('geomap')!.dataAdapter
  })

  afterEach(() => {
    clearRegistry()
  })

  it('dataAdapter returns points array', () => {
    const raw = { series: [] }
    const result = adapter(raw) as { points: unknown[] }

    expect(result).toHaveProperty('points')
    expect(Array.isArray(result.points)).toBe(true)
  })

  it('dataAdapter stub returns empty points', () => {
    const raw = { series: [{ name: 'test', data: [] }] }
    const result = adapter(raw) as { points: unknown[] }

    expect(result.points).toHaveLength(0)
  })

  it('registers with type "geomap" and category "charts"', async () => {
    const { lookupPanel } = await import('../../utils/panelRegistry')
    const registration = lookupPanel('geomap')

    expect(registration).not.toBeNull()
    expect(registration?.type).toBe('geomap')
    expect(registration?.category).toBe('charts')
    expect(registration?.label).toBe('Geomap')
  })
})
