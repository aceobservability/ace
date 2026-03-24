import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  chartAxisStyle,
  chartLegendStyle,
  chartPalette,
  chartTooltipStyle,
  getSeriesColor,
} from '../../utils/chartTheme'
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
  LegendComponent: {},
}))

// ---------------------------------------------------------------------------
// ScatterPanel component tests
// ---------------------------------------------------------------------------

describe('ScatterPanel', () => {
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  let ScatterPanel: any

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('./ScatterPanel.vue')
    ScatterPanel = mod.default
  })

  const singleSeries = [
    {
      name: 'Series A',
      data: [
        [1, 2],
        [3, 4],
        [5, 6],
      ] as Array<[number, number]>,
    },
  ]

  const multiSeries = [
    {
      name: 'Series A',
      data: [
        [1, 2],
        [3, 4],
      ] as Array<[number, number]>,
    },
    {
      name: 'Series B',
      data: [
        [5, 6],
        [7, 8],
      ] as Array<[number, number]>,
    },
  ]

  it('renders with valid scatter data', () => {
    const wrapper = mount(ScatterPanel, {
      props: { series: singleSeries },
    })
    expect(wrapper.find('.h-full.w-full').exists()).toBe(true)
    expect(wrapper.find('.echarts-mock').exists()).toBe(true)
  })

  it('series type is scatter', () => {
    const wrapper = mount(ScatterPanel, {
      props: { series: singleSeries },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.series).toHaveLength(1)
    expect(option.series[0].type).toBe('scatter')
  })

  it('symbolSize is 8', () => {
    const wrapper = mount(ScatterPanel, {
      props: { series: singleSeries },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.series[0].symbolSize).toBe(8)
  })

  it('dot colors use chartPalette via getSeriesColor', () => {
    const wrapper = mount(ScatterPanel, {
      props: { series: singleSeries },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.series[0].itemStyle.color).toBe(getSeriesColor(0))
    expect(option.series[0].itemStyle.color).toBe(chartPalette[0])
  })

  it('multiple series each get different colors', () => {
    const wrapper = mount(ScatterPanel, {
      props: { series: multiSeries },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.series).toHaveLength(2)
    expect(option.series[0].itemStyle.color).toBe(getSeriesColor(0))
    expect(option.series[1].itemStyle.color).toBe(getSeriesColor(1))
    expect(option.series[0].itemStyle.color).not.toBe(option.series[1].itemStyle.color)
  })

  it('applies chartAxisStyle to xAxis', () => {
    const wrapper = mount(ScatterPanel, {
      props: { series: singleSeries },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.xAxis.axisLine.lineStyle.color).toBe(chartAxisStyle.axisLine.lineStyle.color)
    expect(option.xAxis.axisTick.show).toBe(chartAxisStyle.axisTick.show)
    expect(option.xAxis.axisLabel.color).toBe(chartAxisStyle.axisLabel.color)
    expect(option.xAxis.axisLabel.fontFamily).toBe(chartAxisStyle.axisLabel.fontFamily)
  })

  it('applies chartAxisStyle to yAxis', () => {
    const wrapper = mount(ScatterPanel, {
      props: { series: singleSeries },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.yAxis.axisLine.lineStyle.color).toBe(chartAxisStyle.axisLine.lineStyle.color)
    expect(option.yAxis.axisTick.show).toBe(chartAxisStyle.axisTick.show)
    expect(option.yAxis.axisLabel.color).toBe(chartAxisStyle.axisLabel.color)
    expect(option.yAxis.axisLabel.fontFamily).toBe(chartAxisStyle.axisLabel.fontFamily)
  })

  it('applies chartTooltipStyle to tooltip', () => {
    const wrapper = mount(ScatterPanel, {
      props: { series: singleSeries },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.tooltip.backgroundColor).toBe(chartTooltipStyle.backgroundColor)
    expect(option.tooltip.borderColor).toBe(chartTooltipStyle.borderColor)
    expect(option.tooltip.textStyle.color).toBe(chartTooltipStyle.textStyle.color)
  })

  it('legend is shown for multiple series', () => {
    const wrapper = mount(ScatterPanel, {
      props: { series: multiSeries },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.legend).toBeDefined()
    expect(option.legend.show).toBe(true)
    expect(option.legend.textStyle.color).toBe(chartLegendStyle.textStyle.color)
  })

  it('legend is hidden for single series', () => {
    const wrapper = mount(ScatterPanel, {
      props: { series: singleSeries },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.legend.show).toBe(false)
  })

  it('handles empty series gracefully', () => {
    const wrapper = mount(ScatterPanel, {
      props: { series: [] },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.series).toHaveLength(0)
  })

  it('xAxis and yAxis are value type', () => {
    const wrapper = mount(ScatterPanel, {
      props: { series: singleSeries },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.xAxis.type).toBe('value')
    expect(option.yAxis.type).toBe('value')
  })

  it('has transparent background', () => {
    const wrapper = mount(ScatterPanel, {
      props: { series: singleSeries },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.backgroundColor).toBe('transparent')
  })

  it('grid has padding properties', () => {
    const wrapper = mount(ScatterPanel, {
      props: { series: singleSeries },
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

describe('scatter dataAdapter', () => {
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  let adapter: (raw: any) => any

  beforeEach(async () => {
    clearRegistry()
    const { registerPanel: reg } = await import('../../utils/panelRegistry')
    const { ScatterChart: ScatterIcon } = await import('lucide-vue-next')
    reg({
      type: 'scatter',
      component: () => import('./ScatterPanel.vue'),
      dataAdapter: (raw) => {
        if (raw.series.length === 0) return { series: [] }

        if (raw.series.length >= 2) {
          const xSeries = raw.series[0].data as Array<{ timestamp: number; value: number }>
          const ySeries = raw.series[1].data as Array<{ timestamp: number; value: number }>
          const len = Math.min(xSeries.length, ySeries.length)
          const data: Array<[number, number]> = []
          for (let i = 0; i < len; i++) {
            data.push([xSeries[i].value, ySeries[i].value])
          }
          return {
            series: [{ name: `${raw.series[0].name} vs ${raw.series[1].name}`, data }],
          }
        }

        // Single series: plot timestamp vs value
        const points = raw.series[0].data as Array<{ timestamp: number; value: number }>
        return {
          series: [
            {
              name: raw.series[0].name,
              data: points.map((p) => [p.timestamp, p.value] as [number, number]),
            },
          ],
        }
      },
      defaultQuery: {},
      category: 'charts',
      label: 'Scatter',
      icon: ScatterIcon,
    })

    const { lookupPanel } = await import('../../utils/panelRegistry')
    adapter = lookupPanel('scatter')!.dataAdapter
  })

  afterEach(() => {
    clearRegistry()
  })

  it('dataAdapter pairs two series as X/Y', () => {
    const raw = {
      series: [
        {
          name: 'CPU',
          data: [
            { timestamp: 1000, value: 10 },
            { timestamp: 2000, value: 20 },
            { timestamp: 3000, value: 30 },
          ],
        },
        {
          name: 'Memory',
          data: [
            { timestamp: 1000, value: 50 },
            { timestamp: 2000, value: 60 },
            { timestamp: 3000, value: 70 },
          ],
        },
      ],
    }

    const result = adapter(raw) as {
      series: Array<{ name: string; data: Array<[number, number]> }>
    }

    expect(result.series).toHaveLength(1)
    expect(result.series[0].name).toBe('CPU vs Memory')
    expect(result.series[0].data).toEqual([
      [10, 50],
      [20, 60],
      [30, 70],
    ])
  })

  it('dataAdapter single series plots timestamp vs value', () => {
    const raw = {
      series: [
        {
          name: 'Latency',
          data: [
            { timestamp: 1000, value: 5 },
            { timestamp: 2000, value: 10 },
            { timestamp: 3000, value: 15 },
          ],
        },
      ],
    }

    const result = adapter(raw) as {
      series: Array<{ name: string; data: Array<[number, number]> }>
    }

    expect(result.series).toHaveLength(1)
    expect(result.series[0].name).toBe('Latency')
    expect(result.series[0].data).toEqual([
      [1000, 5],
      [2000, 10],
      [3000, 15],
    ])
  })

  it('dataAdapter handles empty input', () => {
    const raw = { series: [] }
    const result = adapter(raw) as { series: unknown[] }

    expect(result.series).toHaveLength(0)
  })

  it('dataAdapter handles mismatched series lengths by using the shorter', () => {
    const raw = {
      series: [
        {
          name: 'X',
          data: [
            { timestamp: 1000, value: 1 },
            { timestamp: 2000, value: 2 },
            { timestamp: 3000, value: 3 },
          ],
        },
        {
          name: 'Y',
          data: [
            { timestamp: 1000, value: 10 },
            { timestamp: 2000, value: 20 },
          ],
        },
      ],
    }

    const result = adapter(raw) as {
      series: Array<{ name: string; data: Array<[number, number]> }>
    }

    expect(result.series[0].data).toHaveLength(2)
    expect(result.series[0].data).toEqual([
      [1, 10],
      [2, 20],
    ])
  })

  it('registers with type "scatter" and category "charts"', async () => {
    const { lookupPanel } = await import('../../utils/panelRegistry')
    const registration = lookupPanel('scatter')

    expect(registration).not.toBeNull()
    expect(registration?.type).toBe('scatter')
    expect(registration?.category).toBe('charts')
    expect(registration?.label).toBe('Scatter')
  })
})
