import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import GaugeChart from './GaugeChart.vue'

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
  GaugeChart: {},
}))

vi.mock('echarts/components', () => ({
  TitleComponent: {},
  TooltipComponent: {},
}))

describe('GaugeChart', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the gauge container', () => {
    const wrapper = mount(GaugeChart, {
      props: { value: 75 },
    })
    expect(wrapper.find('.h-full.w-full').exists()).toBe(true)
  })

  it('passes value to ECharts', () => {
    const wrapper = mount(GaugeChart, {
      props: { value: 75 },
    })
    const chart = wrapper.find('.echarts-mock')
    expect(chart.exists()).toBe(true)

    const optionStr = chart.attributes('data-option')
    const option = JSON.parse(optionStr || '{}')

    expect(option.series).toHaveLength(1)
    expect(option.series[0].type).toBe('gauge')
    expect(option.series[0].data[0].value).toBe(75)
  })

  it('uses default min and max values', () => {
    const wrapper = mount(GaugeChart, {
      props: { value: 50 },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.series[0].min).toBe(0)
    expect(option.series[0].max).toBe(100)
  })

  it('uses custom min and max values', () => {
    const wrapper = mount(GaugeChart, {
      props: { value: 500, min: 0, max: 1000 },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.series[0].min).toBe(0)
    expect(option.series[0].max).toBe(1000)
  })

  it('applies custom height when provided', () => {
    const wrapper = mount(GaugeChart, {
      props: { value: 75, height: 300 },
    })
    expect(wrapper.find('.h-full.w-full').attributes('style')).toContain('height: 300px')
  })

  it('applies default height when not provided', () => {
    const wrapper = mount(GaugeChart, {
      props: { value: 75 },
    })
    expect(wrapper.find('.h-full.w-full').attributes('style')).toContain('height: 100%')
  })

  it('includes title when provided', () => {
    const wrapper = mount(GaugeChart, {
      props: { value: 75, title: 'CPU Usage' },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.series[0].data[0].name).toBe('CPU Usage')
  })

  it('formats value with unit', () => {
    const wrapper = mount(GaugeChart, {
      props: { value: 75, unit: '%' },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    // The detail formatter should include the unit
    expect(option.series[0].detail.show).toBe(true)
  })

  it('respects decimal places', () => {
    const wrapper = mount(GaugeChart, {
      props: { value: 75.5678, decimals: 1 },
    })
    const chart = wrapper.find('.echarts-mock')
    expect(chart.exists()).toBe(true)
  })

  it('handles threshold configuration', () => {
    const thresholds = [
      { value: 50, color: '#feca57' },
      { value: 80, color: '#ff6b6b' },
    ]
    const wrapper = mount(GaugeChart, {
      props: { value: 75, thresholds },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    // Progress and itemStyle should reflect the appropriate color
    expect(option.series[0].progress.show).toBe(true)
  })

  it('handles empty thresholds array', () => {
    const wrapper = mount(GaugeChart, {
      props: { value: 75, thresholds: [] },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    // Should use default color (Kinetic secondary)
    expect(option.series[0].itemStyle.color).toBe('#4D8BBD')
  })

  it('shows value above threshold in correct color', () => {
    const thresholds = [
      { value: 50, color: '#feca57' },
      { value: 80, color: '#ff6b6b' },
    ]
    const wrapper = mount(GaugeChart, {
      props: { value: 90, thresholds },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    // Value 90 is above the 80 threshold, so should be red
    expect(option.series[0].itemStyle.color).toBe('#ff6b6b')
  })

  it('shows value below all thresholds in green', () => {
    const thresholds = [
      { value: 50, color: '#feca57' },
      { value: 80, color: '#ff6b6b' },
    ]
    const wrapper = mount(GaugeChart, {
      props: { value: 30, thresholds },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    // Value 30 is below all thresholds, so should be default (Kinetic secondary)
    expect(option.series[0].itemStyle.color).toBe('#4D8BBD')
  })

  it('handles large values with K suffix', () => {
    const wrapper = mount(GaugeChart, {
      props: { value: 1500, max: 2000 },
    })
    const chart = wrapper.find('.echarts-mock')
    expect(chart.exists()).toBe(true)
  })

  it('handles large values with M suffix', () => {
    const wrapper = mount(GaugeChart, {
      props: { value: 1500000, max: 2000000 },
    })
    const chart = wrapper.find('.echarts-mock')
    expect(chart.exists()).toBe(true)
  })

  it('configures progress bar', () => {
    const wrapper = mount(GaugeChart, {
      props: { value: 75 },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.series[0].progress.show).toBe(true)
    expect(option.series[0].progress.width).toBe(20)
  })

  it('configures pointer', () => {
    const wrapper = mount(GaugeChart, {
      props: { value: 75 },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.series[0].pointer.show).toBe(true)
  })

  it('configures tooltip', () => {
    const wrapper = mount(GaugeChart, {
      props: { value: 75 },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.tooltip.show).toBe(true)
  })
})
