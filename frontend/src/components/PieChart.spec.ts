import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PieChart from './PieChart.vue'

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
  PieChart: {},
}))

vi.mock('echarts/components', () => ({
  TitleComponent: {},
  TooltipComponent: {},
  LegendComponent: {},
}))

describe('PieChart', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the pie chart container', () => {
    const wrapper = mount(PieChart, {
      props: { data: [{ name: 'A', value: 50 }] },
    })
    expect(wrapper.find('.h-full.w-full').exists()).toBe(true)
  })

  it('passes data to ECharts', () => {
    const data = [
      { name: 'Series A', value: 50 },
      { name: 'Series B', value: 30 },
      { name: 'Series C', value: 20 },
    ]
    const wrapper = mount(PieChart, {
      props: { data },
    })
    const chart = wrapper.find('.echarts-mock')
    expect(chart.exists()).toBe(true)

    const optionStr = chart.attributes('data-option')
    const option = JSON.parse(optionStr || '{}')

    expect(option.series).toHaveLength(1)
    expect(option.series[0].type).toBe('pie')
    expect(option.series[0].data).toHaveLength(3)
    expect(option.series[0].data[0].name).toBe('Series A')
    expect(option.series[0].data[0].value).toBe(50)
  })

  it('renders as pie by default', () => {
    const wrapper = mount(PieChart, {
      props: { data: [{ name: 'A', value: 100 }] },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    // Pie has radius starting from 0
    expect(option.series[0].radius[0]).toBe(0)
  })

  it('renders as donut when displayAs is donut', () => {
    const wrapper = mount(PieChart, {
      props: { data: [{ name: 'A', value: 100 }], displayAs: 'donut' },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    // Donut has inner radius > 0
    expect(option.series[0].radius[0]).toBe('40%')
    expect(option.series[0].radius[1]).toBe('70%')
  })

  it('shows legend by default', () => {
    const wrapper = mount(PieChart, {
      props: { data: [{ name: 'A', value: 100 }] },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.legend.show).toBe(true)
  })

  it('hides legend when showLegend is false', () => {
    const wrapper = mount(PieChart, {
      props: { data: [{ name: 'A', value: 100 }], showLegend: false },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.legend.show).toBe(false)
  })

  it('shows labels by default', () => {
    const wrapper = mount(PieChart, {
      props: { data: [{ name: 'A', value: 100 }] },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.series[0].label.show).toBe(true)
    expect(option.series[0].labelLine.show).toBe(true)
  })

  it('hides labels when showLabels is false', () => {
    const wrapper = mount(PieChart, {
      props: { data: [{ name: 'A', value: 100 }], showLabels: false },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.series[0].label.show).toBe(false)
    expect(option.series[0].labelLine.show).toBe(false)
  })

  it('applies custom height when provided', () => {
    const wrapper = mount(PieChart, {
      props: { data: [{ name: 'A', value: 100 }], height: 400 },
    })
    expect(wrapper.find('.h-full.w-full').attributes('style')).toContain('height: 400px')
  })

  it('applies default height when not provided', () => {
    const wrapper = mount(PieChart, {
      props: { data: [{ name: 'A', value: 100 }] },
    })
    expect(wrapper.find('.h-full.w-full').attributes('style')).toContain('height: 100%')
  })

  it('includes title when provided', () => {
    const wrapper = mount(PieChart, {
      props: { data: [{ name: 'A', value: 100 }], title: 'Traffic Distribution' },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.title.text).toBe('Traffic Distribution')
  })

  it('handles empty data array', () => {
    const wrapper = mount(PieChart, {
      props: { data: [] },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.series[0].data).toHaveLength(0)
  })

  it('handles single data item', () => {
    const wrapper = mount(PieChart, {
      props: { data: [{ name: 'Only', value: 100 }] },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.series[0].data).toHaveLength(1)
    expect(option.series[0].data[0].value).toBe(100)
  })

  it('applies colors from palette', () => {
    const data = [
      { name: 'A', value: 40 },
      { name: 'B', value: 30 },
      { name: 'C', value: 30 },
    ]
    const wrapper = mount(PieChart, {
      props: { data },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    // Each data item should have a color from the Kinetic palette
    expect(option.series[0].data[0].itemStyle.color).toBe('#4D8BBD')
    expect(option.series[0].data[1].itemStyle.color).toBe('#C65D3A')
    expect(option.series[0].data[2].itemStyle.color).toBe('#7A9E46')
  })

  it('configures tooltip', () => {
    const wrapper = mount(PieChart, {
      props: { data: [{ name: 'A', value: 100 }] },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.tooltip.trigger).toBe('item')
  })

  it('handles many data items', () => {
    const data = Array.from({ length: 15 }, (_, i) => ({
      name: `Series ${i + 1}`,
      value: (i + 1) * 10,
    }))
    const wrapper = mount(PieChart, {
      props: { data },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.series[0].data).toHaveLength(15)
    // Colors should cycle through the palette
    expect(option.series[0].data[10].itemStyle.color).toBe('#4D8BBD') // Index 10 % 10 = 0
  })

  it('handles zero values correctly', () => {
    const data = [
      { name: 'A', value: 0 },
      { name: 'B', value: 50 },
      { name: 'C', value: 50 },
    ]
    const wrapper = mount(PieChart, {
      props: { data },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.series[0].data[0].value).toBe(0)
    expect(option.series[0].data[1].value).toBe(50)
  })
})
