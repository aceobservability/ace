import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import StatPanel from './StatPanel.vue'

// Mock ECharts components for sparkline
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
  GridComponent: {},
}))

describe('StatPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the stat panel container', () => {
    const wrapper = mount(StatPanel, {
      props: { value: 100 },
    })
    // Root div uses Tailwind classes for layout
    expect(wrapper.find('.flex.flex-col.items-center.justify-center').exists()).toBe(true)
  })

  it('displays the value', () => {
    const wrapper = mount(StatPanel, {
      props: { value: 75 },
    })
    expect(wrapper.find('.text-3xl').text()).toContain('75')
  })

  it('formats large values with K suffix', () => {
    const wrapper = mount(StatPanel, {
      props: { value: 1250, decimals: 2 },
    })
    expect(wrapper.find('.text-3xl').text()).toBe('1.25K')
  })

  it('formats larger values with M suffix', () => {
    const wrapper = mount(StatPanel, {
      props: { value: 1500000, decimals: 2 },
    })
    expect(wrapper.find('.text-3xl').text()).toBe('1.50M')
  })

  it('formats very large values with B suffix', () => {
    const wrapper = mount(StatPanel, {
      props: { value: 2500000000, decimals: 2 },
    })
    expect(wrapper.find('.text-3xl').text()).toBe('2.50B')
  })

  it('includes unit in formatted value', () => {
    const wrapper = mount(StatPanel, {
      props: { value: 75, unit: '%' },
    })
    expect(wrapper.find('.text-3xl').text()).toContain('%')
  })

  it('respects decimals setting', () => {
    const wrapper = mount(StatPanel, {
      props: { value: Math.PI, decimals: 1 },
    })
    expect(wrapper.find('.text-3xl').text()).toBe('3.1')
  })

  it('displays label when provided', () => {
    const wrapper = mount(StatPanel, {
      props: { value: 100, label: 'CPU Usage' },
    })
    expect(wrapper.text()).toContain('CPU Usage')
  })

  it('does not display label when not provided', () => {
    const wrapper = mount(StatPanel, {
      props: { value: 100 },
    })
    // Only the value and no label text should appear
    expect(wrapper.text().trim()).toBe('100.00')
  })

  it('shows upward trend when value is higher than previous', () => {
    const wrapper = mount(StatPanel, {
      props: { value: 100, previousValue: 80, showTrend: true },
    })
    expect(wrapper.html()).toContain('text-[var(--color-secondary)]')
  })

  it('shows downward trend when value is lower than previous', () => {
    const wrapper = mount(StatPanel, {
      props: { value: 60, previousValue: 80, showTrend: true },
    })
    expect(wrapper.html()).toContain('text-[var(--color-error)]')
  })

  it('does not show trend when showTrend is false', () => {
    const wrapper = mount(StatPanel, {
      props: { value: 100, previousValue: 80, showTrend: false },
    })
    expect(wrapper.html()).not.toContain('text-[var(--color-secondary)]')
    expect(wrapper.html()).not.toContain('text-[var(--color-error)]')
  })

  it('does not show trend when previousValue is not provided', () => {
    const wrapper = mount(StatPanel, {
      props: { value: 100, showTrend: true },
    })
    expect(wrapper.html()).not.toContain('text-[var(--color-secondary)]')
    expect(wrapper.html()).not.toContain('text-[var(--color-error)]')
  })

  it('displays trend percentage', () => {
    const wrapper = mount(StatPanel, {
      props: { value: 100, previousValue: 80, showTrend: true },
    })
    expect(wrapper.text()).toContain('+25.0%')
  })

  it('shows sparkline when data is provided', () => {
    const data = [
      { timestamp: 1000, value: 10 },
      { timestamp: 2000, value: 20 },
      { timestamp: 3000, value: 15 },
    ]
    const wrapper = mount(StatPanel, {
      props: { value: 15, data, showSparkline: true },
    })
    expect(wrapper.find('.pointer-events-none').exists()).toBe(true)
  })

  it('does not show sparkline when showSparkline is false', () => {
    const data = [
      { timestamp: 1000, value: 10 },
      { timestamp: 2000, value: 20 },
    ]
    const wrapper = mount(StatPanel, {
      props: { value: 20, data, showSparkline: false },
    })
    expect(wrapper.find('.pointer-events-none').exists()).toBe(false)
  })

  it('does not show sparkline when no data is provided', () => {
    const wrapper = mount(StatPanel, {
      props: { value: 100, showSparkline: true },
    })
    expect(wrapper.find('.pointer-events-none').exists()).toBe(false)
  })

  it('applies threshold color when value exceeds threshold', () => {
    const thresholds = [
      { value: 50, color: '#feca57' },
      { value: 80, color: '#ff6b6b' },
    ]
    const wrapper = mount(StatPanel, {
      props: { value: 90, thresholds },
    })
    const statValue = wrapper.find('.text-3xl')
    expect(statValue.attributes('style')).toContain('color: #ff6b6b')
  })

  it('uses default color when below all thresholds', () => {
    const thresholds = [
      { value: 50, color: '#feca57' },
      { value: 80, color: '#ff6b6b' },
    ]
    const wrapper = mount(StatPanel, {
      props: { value: 30, thresholds },
    })
    const statValue = wrapper.find('.text-3xl')
    expect(statValue.attributes('style')).toContain('color: #fdfbfe')
  })

  it('applies custom height when provided', () => {
    const wrapper = mount(StatPanel, {
      props: { value: 100, height: 200 },
    })
    expect(wrapper.element.getAttribute('style')).toContain('height: 200px')
  })

  it('applies default height when not provided', () => {
    const wrapper = mount(StatPanel, {
      props: { value: 100 },
    })
    expect(wrapper.element.getAttribute('style')).toContain('height: 100%')
  })

  it('handles zero value', () => {
    const wrapper = mount(StatPanel, {
      props: { value: 0 },
    })
    expect(wrapper.find('.text-3xl').text()).toBe('0.00')
  })

  it('handles negative values', () => {
    const wrapper = mount(StatPanel, {
      props: { value: -50 },
    })
    expect(wrapper.find('.text-3xl').text()).toContain('-50')
  })

  it('handles negative large values', () => {
    const wrapper = mount(StatPanel, {
      props: { value: -1500, decimals: 1 },
    })
    expect(wrapper.find('.text-3xl').text()).toBe('-1.5K')
  })
})
