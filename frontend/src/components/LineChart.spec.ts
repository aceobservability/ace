import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LineChart from './LineChart.vue'

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
  LineChart: {},
}))

vi.mock('echarts/components', () => ({
  TitleComponent: {},
  TooltipComponent: {},
  LegendComponent: {},
  GridComponent: {},
}))

describe('LineChart', () => {
  const mockSeries = [
    {
      name: 'up{instance="localhost:9090"}',
      data: [
        { timestamp: 1704067200, value: 1 },
        { timestamp: 1704067215, value: 0.8 },
        { timestamp: 1704067230, value: 0.9 },
      ],
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the chart container', () => {
    const wrapper = mount(LineChart, {
      props: { series: mockSeries },
    })
    expect(wrapper.find('.h-full.w-full').exists()).toBe(true)
  })

  it('passes series data to ECharts', () => {
    const wrapper = mount(LineChart, {
      props: { series: mockSeries },
    })
    const chart = wrapper.find('.echarts-mock')
    expect(chart.exists()).toBe(true)

    const optionStr = chart.attributes('data-option')
    const option = JSON.parse(optionStr || '{}')

    // Verify series data is transformed correctly
    expect(option.series).toHaveLength(1)
    expect(option.series[0].name).toBe('up{instance="localhost:9090"}')
    expect(option.series[0].type).toBe('line')
    expect(option.series[0].data).toHaveLength(3)
  })

  it('configures x-axis as time type', () => {
    const wrapper = mount(LineChart, {
      props: { series: mockSeries },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.xAxis.type).toBe('time')
  })

  it('configures y-axis as value type', () => {
    const wrapper = mount(LineChart, {
      props: { series: mockSeries },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.yAxis.type).toBe('value')
  })

  it('shows legend when multiple series', () => {
    const multiSeries = [
      { name: 'metric1', data: [{ timestamp: 1704067200, value: 1 }] },
      { name: 'metric2', data: [{ timestamp: 1704067200, value: 2 }] },
    ]

    const wrapper = mount(LineChart, {
      props: { series: multiSeries },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.legend.show).toBe(true)
  })

  it('hides legend when single series', () => {
    const wrapper = mount(LineChart, {
      props: { series: mockSeries },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.legend.show).toBe(false)
  })

  it('configures tooltip', () => {
    const wrapper = mount(LineChart, {
      props: { series: mockSeries },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.tooltip.trigger).toBe('axis')
  })

  it('applies custom height when provided', () => {
    const wrapper = mount(LineChart, {
      props: { series: mockSeries, height: 400 },
    })
    expect(wrapper.find('.h-full.w-full').attributes('style')).toContain('height: 400px')
  })

  it('applies default height when not provided', () => {
    const wrapper = mount(LineChart, {
      props: { series: mockSeries },
    })
    expect(wrapper.find('.h-full.w-full').attributes('style')).toContain('height: 100%')
  })

  it('includes title when provided', () => {
    const wrapper = mount(LineChart, {
      props: { series: mockSeries, title: 'My Chart' },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.title.text).toBe('My Chart')
  })

  it('transforms timestamp to milliseconds for ECharts', () => {
    const wrapper = mount(LineChart, {
      props: { series: mockSeries },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    // ECharts expects timestamps in milliseconds
    const firstDataPoint = option.series[0].data[0]
    expect(firstDataPoint[0]).toBe(1704067200 * 1000)
    expect(firstDataPoint[1]).toBe(1)
  })

  it('configures grid lines', () => {
    const wrapper = mount(LineChart, {
      props: { series: mockSeries },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.xAxis.splitLine.show).toBe(true)
    expect(option.yAxis.splitLine.show).toBe(true)
  })

  it('handles empty series array', () => {
    const wrapper = mount(LineChart, {
      props: { series: [] },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.series).toHaveLength(0)
  })

  describe('fill prop', () => {
    it('fill="area" (default) — series have areaStyle with gradient colorStops', () => {
      const wrapper = mount(LineChart, {
        props: { series: mockSeries, fill: 'area' },
      })
      const chart = wrapper.find('.echarts-mock')
      const option = JSON.parse(chart.attributes('data-option') || '{}')

      const s = option.series[0]
      expect(s.areaStyle).toBeDefined()
      expect(s.areaStyle.color.colorStops).toHaveLength(2)
      expect(s.areaStyle.color.colorStops[0].offset).toBe(0)
      expect(s.areaStyle.color.colorStops[1].offset).toBe(1)
      expect(s.stack).toBeUndefined()
    })

    it('no fill prop (default) — same as fill="area" (backwards compatible)', () => {
      const wrapper = mount(LineChart, {
        props: { series: mockSeries },
      })
      const chart = wrapper.find('.echarts-mock')
      const option = JSON.parse(chart.attributes('data-option') || '{}')

      const s = option.series[0]
      expect(s.areaStyle).toBeDefined()
      expect(s.areaStyle.color.colorStops).toHaveLength(2)
      expect(s.stack).toBeUndefined()
    })

    it('fill="none" — series have NO areaStyle', () => {
      const wrapper = mount(LineChart, {
        props: { series: mockSeries, fill: 'none' },
      })
      const chart = wrapper.find('.echarts-mock')
      const option = JSON.parse(chart.attributes('data-option') || '{}')

      const s = option.series[0]
      expect(s.areaStyle).toBeUndefined()
      expect(s.stack).toBeUndefined()
    })

    it('fill="stacked-area" — series have areaStyle AND stack: "total"', () => {
      const multiSeries = [
        { name: 'metric1', data: [{ timestamp: 1704067200, value: 1 }] },
        { name: 'metric2', data: [{ timestamp: 1704067200, value: 2 }] },
      ]
      const wrapper = mount(LineChart, {
        props: { series: multiSeries, fill: 'stacked-area' },
      })
      const chart = wrapper.find('.echarts-mock')
      const option = JSON.parse(chart.attributes('data-option') || '{}')

      for (const s of option.series) {
        expect(s.areaStyle).toBeDefined()
        expect(s.areaStyle.color.colorStops).toHaveLength(2)
        expect(s.stack).toBe('total')
      }
    })
  })
})
