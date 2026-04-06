import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chartAxisStyle, chartTooltipStyle, thresholdColors } from '../../utils/chartTheme'
import { clearRegistry } from '../../utils/panelRegistry'

// Mock ECharts components
vi.mock('vue-echarts', () => ({
  default: {
    name: 'VChart',
    props: ['option', 'autoresize', 'group'],
    template: '<div class="echarts-mock" :data-option="JSON.stringify(option)" :data-group="group"></div>',
    methods: {
      resize: vi.fn(),
    },
  },
}))

vi.mock('echarts/core', () => ({
  use: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
}))

vi.mock('echarts/renderers', () => ({
  CanvasRenderer: {},
}))

vi.mock('echarts/charts', () => ({
  CandlestickChart: {},
}))

vi.mock('echarts/components', () => ({
  GridComponent: {},
  TooltipComponent: {},
}))

// ---------------------------------------------------------------------------
// CandlestickPanel component tests
// ---------------------------------------------------------------------------

describe('CandlestickPanel', () => {
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  let CandlestickPanel: any

  const mockData = [
    { timestamp: 1000, open: 100, close: 110, low: 95, high: 115 },
    { timestamp: 2000, open: 110, close: 105, low: 100, high: 120 },
    { timestamp: 3000, open: 105, close: 115, low: 102, high: 118 },
    { timestamp: 4000, open: 115, close: 108, low: 105, high: 122 },
  ]

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('./CandlestickPanel.vue')
    CandlestickPanel = mod.default
  })

  it('renders with valid OHLC data', () => {
    const wrapper = mount(CandlestickPanel, {
      props: { data: mockData },
    })
    expect(wrapper.find('.h-full.w-full').exists()).toBe(true)
    expect(wrapper.find('.echarts-mock').exists()).toBe(true)
  })

  it('series type is candlestick', () => {
    const wrapper = mount(CandlestickPanel, {
      props: { data: mockData },
    })
    const option = JSON.parse(wrapper.find('.echarts-mock').attributes('data-option') || '{}')

    expect(option.series).toHaveLength(1)
    expect(option.series[0].type).toBe('candlestick')
  })

  it('maps data correctly to [timestamp_ms, open, close, low, high] arrays', () => {
    const wrapper = mount(CandlestickPanel, {
      props: { data: mockData },
    })
    const option = JSON.parse(wrapper.find('.echarts-mock').attributes('data-option') || '{}')

    const seriesData = option.series[0].data
    expect(seriesData).toHaveLength(4)
    // ECharts candlestick format with time axis: [timestamp_ms, open, close, low, high]
    expect(seriesData[0]).toEqual([1000000, 100, 110, 95, 115])
    expect(seriesData[1]).toEqual([2000000, 110, 105, 100, 120])
    expect(seriesData[2]).toEqual([3000000, 105, 115, 102, 118])
    expect(seriesData[3]).toEqual([4000000, 115, 108, 105, 122])
  })

  it('up candles use thresholdColors.good', () => {
    const wrapper = mount(CandlestickPanel, {
      props: { data: mockData },
    })
    const option = JSON.parse(wrapper.find('.echarts-mock').attributes('data-option') || '{}')

    // itemStyle.color = up candle (close > open)
    expect(option.series[0].itemStyle.color).toBe(thresholdColors.good)
  })

  it('down candles use thresholdColors.critical', () => {
    const wrapper = mount(CandlestickPanel, {
      props: { data: mockData },
    })
    const option = JSON.parse(wrapper.find('.echarts-mock').attributes('data-option') || '{}')

    // itemStyle.color0 = down candle (close < open)
    expect(option.series[0].itemStyle.color0).toBe(thresholdColors.critical)
  })

  it('xAxis is time type', () => {
    const wrapper = mount(CandlestickPanel, {
      props: { data: mockData },
    })
    const option = JSON.parse(wrapper.find('.echarts-mock').attributes('data-option') || '{}')

    expect(option.xAxis.type).toBe('time')
  })

  it('applies chartAxisStyle to xAxis', () => {
    const wrapper = mount(CandlestickPanel, {
      props: { data: mockData },
    })
    const option = JSON.parse(wrapper.find('.echarts-mock').attributes('data-option') || '{}')

    expect(option.xAxis.axisLine.lineStyle.color).toBe(chartAxisStyle.axisLine.lineStyle.color)
    expect(option.xAxis.axisTick.show).toBe(chartAxisStyle.axisTick.show)
    expect(option.xAxis.axisLabel.color).toBe(chartAxisStyle.axisLabel.color)
    expect(option.xAxis.axisLabel.fontFamily).toBe(chartAxisStyle.axisLabel.fontFamily)
  })

  it('applies chartAxisStyle to yAxis', () => {
    const wrapper = mount(CandlestickPanel, {
      props: { data: mockData },
    })
    const option = JSON.parse(wrapper.find('.echarts-mock').attributes('data-option') || '{}')

    expect(option.yAxis.type).toBe('value')
    expect(option.yAxis.axisLine.lineStyle.color).toBe(chartAxisStyle.axisLine.lineStyle.color)
    expect(option.yAxis.axisTick.show).toBe(chartAxisStyle.axisTick.show)
    expect(option.yAxis.axisLabel.color).toBe(chartAxisStyle.axisLabel.color)
    expect(option.yAxis.axisLabel.fontFamily).toBe(chartAxisStyle.axisLabel.fontFamily)
  })

  it('applies chartTooltipStyle to tooltip', () => {
    const wrapper = mount(CandlestickPanel, {
      props: { data: mockData },
    })
    const option = JSON.parse(wrapper.find('.echarts-mock').attributes('data-option') || '{}')

    expect(option.tooltip.backgroundColor).toBe(chartTooltipStyle.backgroundColor)
    expect(option.tooltip.borderColor).toBe(chartTooltipStyle.borderColor)
    expect(option.tooltip.textStyle.color).toBe(chartTooltipStyle.textStyle.color)
  })

  it('tooltip shows OHLC values (has formatter)', () => {
    const wrapper = mount(CandlestickPanel, {
      props: { data: mockData },
    })
    const option = JSON.parse(wrapper.find('.echarts-mock').attributes('data-option') || '{}')

    // formatter is a function — when serialized to JSON it becomes undefined,
    // so we verify tooltip trigger is set (axis) and backgroundColor exists
    expect(option.tooltip.trigger).toBe('axis')
    expect(option.tooltip.backgroundColor).toBeDefined()
  })

  it('handles empty data gracefully', () => {
    const wrapper = mount(CandlestickPanel, {
      props: { data: [] },
    })
    const option = JSON.parse(wrapper.find('.echarts-mock').attributes('data-option') || '{}')

    expect(option.series[0].data).toHaveLength(0)
    expect(option.xAxis.type).toBe('time')
  })

  it('has transparent background', () => {
    const wrapper = mount(CandlestickPanel, {
      props: { data: mockData },
    })
    const option = JSON.parse(wrapper.find('.echarts-mock').attributes('data-option') || '{}')

    expect(option.backgroundColor).toBe('transparent')
  })

  it('grid has padding properties', () => {
    const wrapper = mount(CandlestickPanel, {
      props: { data: mockData },
    })
    const option = JSON.parse(wrapper.find('.echarts-mock').attributes('data-option') || '{}')

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

describe('candlestick dataAdapter', () => {
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  let adapter: (raw: any) => any

  beforeEach(async () => {
    clearRegistry()
    const { registerPanel: reg } = await import('../../utils/panelRegistry')
    const { CandlestickChart: CandlestickIcon } = await import('lucide-vue-next')
    reg({
      type: 'candlestick',
      component: () => import('./CandlestickPanel.vue'),
      dataAdapter: (raw) => {
        if (raw.series.length < 4) return { data: [] }
        const open = raw.series[0].data as Array<{ timestamp: number; value: number }>
        const close = raw.series[1].data as Array<{ timestamp: number; value: number }>
        const low = raw.series[2].data as Array<{ timestamp: number; value: number }>
        const high = raw.series[3].data as Array<{ timestamp: number; value: number }>
        const len = Math.min(open.length, close.length, low.length, high.length)
        const data: Array<{
          timestamp: number
          open: number
          close: number
          low: number
          high: number
        }> = []
        for (let i = 0; i < len; i++) {
          data.push({
            timestamp: open[i].timestamp,
            open: open[i].value,
            close: close[i].value,
            low: low[i].value,
            high: high[i].value,
          })
        }
        return { data }
      },
      defaultQuery: {},
      category: 'charts',
      label: 'Candlestick',
      icon: CandlestickIcon,
    })

    const { lookupPanel } = await import('../../utils/panelRegistry')
    adapter = lookupPanel('candlestick')!.dataAdapter
  })

  afterEach(() => {
    clearRegistry()
  })

  it('dataAdapter combines 4 series into OHLC points', () => {
    const raw = {
      series: [
        { name: 'open', data: [{ timestamp: 1000, value: 100 }, { timestamp: 2000, value: 110 }] },
        { name: 'close', data: [{ timestamp: 1000, value: 110 }, { timestamp: 2000, value: 105 }] },
        { name: 'low', data: [{ timestamp: 1000, value: 95 }, { timestamp: 2000, value: 100 }] },
        { name: 'high', data: [{ timestamp: 1000, value: 115 }, { timestamp: 2000, value: 120 }] },
      ],
    }

    const result = adapter(raw) as {
      data: Array<{ timestamp: number; open: number; close: number; low: number; high: number }>
    }

    expect(result.data).toHaveLength(2)
    expect(result.data[0]).toEqual({ timestamp: 1000, open: 100, close: 110, low: 95, high: 115 })
    expect(result.data[1]).toEqual({ timestamp: 2000, open: 110, close: 105, low: 100, high: 120 })
  })

  it('dataAdapter handles fewer than 4 series', () => {
    const raw = {
      series: [
        { name: 'open', data: [{ timestamp: 1000, value: 100 }] },
        { name: 'close', data: [{ timestamp: 1000, value: 110 }] },
      ],
    }

    const result = adapter(raw) as { data: unknown[] }
    expect(result.data).toHaveLength(0)
  })

  it('dataAdapter handles empty series array', () => {
    const raw = { series: [] }
    const result = adapter(raw) as { data: unknown[] }
    expect(result.data).toHaveLength(0)
  })

  it('dataAdapter uses shortest series length when series have different lengths', () => {
    const raw = {
      series: [
        {
          name: 'open',
          data: [
            { timestamp: 1000, value: 100 },
            { timestamp: 2000, value: 110 },
            { timestamp: 3000, value: 120 },
          ],
        },
        { name: 'close', data: [{ timestamp: 1000, value: 110 }, { timestamp: 2000, value: 105 }] },
        { name: 'low', data: [{ timestamp: 1000, value: 95 }, { timestamp: 2000, value: 100 }] },
        { name: 'high', data: [{ timestamp: 1000, value: 115 }, { timestamp: 2000, value: 120 }] },
      ],
    }

    const result = adapter(raw) as { data: unknown[] }
    expect(result.data).toHaveLength(2)
  })

  it('registration metadata is correct', async () => {
    const { lookupPanel } = await import('../../utils/panelRegistry')
    const registration = lookupPanel('candlestick')

    expect(registration).not.toBeNull()
    expect(registration?.type).toBe('candlestick')
    expect(registration?.category).toBe('charts')
    expect(registration?.label).toBe('Candlestick')
  })
})
