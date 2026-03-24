import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chartAxisStyle, chartPalette, chartTooltipStyle, thresholdColors } from '../../utils/chartTheme'
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
  CustomChart: {},
}))

vi.mock('echarts/components', () => ({
  GridComponent: {},
  TooltipComponent: {},
  LegendComponent: {},
}))

// ---------------------------------------------------------------------------
// StateTimelinePanel component tests
// ---------------------------------------------------------------------------

describe('StateTimelinePanel', () => {
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  let StateTimelinePanel: any

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('./StateTimelinePanel.vue')
    StateTimelinePanel = mod.default
  })

  const mockSegments = [
    { entity: 'api-server', state: 'up', start: 1000, end: 2000 },
    { entity: 'api-server', state: 'down', start: 2000, end: 3000 },
    { entity: 'db-primary', state: 'degraded', start: 1000, end: 1500 },
    { entity: 'db-primary', state: 'up', start: 1500, end: 3000 },
  ]

  it('renders with valid state segments', () => {
    const wrapper = mount(StateTimelinePanel, {
      props: { segments: mockSegments },
    })
    expect(wrapper.find('.h-full.w-full').exists()).toBe(true)
    expect(wrapper.find('.echarts-mock').exists()).toBe(true)
  })

  it('series type is custom', () => {
    const wrapper = mount(StateTimelinePanel, {
      props: { segments: mockSegments },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.series).toHaveLength(1)
    expect(option.series[0].type).toBe('custom')
  })

  it('up state uses thresholdColors.good', () => {
    const wrapper = mount(StateTimelinePanel, {
      props: {
        segments: [{ entity: 'api-server', state: 'up', start: 1000, end: 2000 }],
      },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    const seg = option.series[0].data.find(
      (d: { state: string }) => d.state === 'up',
    )
    expect(seg).toBeDefined()
    expect(seg.color).toBe(thresholdColors.good)
  })

  it('down state uses thresholdColors.critical', () => {
    const wrapper = mount(StateTimelinePanel, {
      props: {
        segments: [{ entity: 'api-server', state: 'down', start: 1000, end: 2000 }],
      },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    const seg = option.series[0].data.find(
      (d: { state: string }) => d.state === 'down',
    )
    expect(seg).toBeDefined()
    expect(seg.color).toBe(thresholdColors.critical)
  })

  it('degraded state uses thresholdColors.warning', () => {
    const wrapper = mount(StateTimelinePanel, {
      props: {
        segments: [{ entity: 'db-primary', state: 'degraded', start: 1000, end: 2000 }],
      },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    const seg = option.series[0].data.find(
      (d: { state: string }) => d.state === 'degraded',
    )
    expect(seg).toBeDefined()
    expect(seg.color).toBe(thresholdColors.warning)
  })

  it('unknown state uses chartPalette[7] (Alloy Silver)', () => {
    const wrapper = mount(StateTimelinePanel, {
      props: {
        segments: [{ entity: 'svc', state: 'maintenance', start: 1000, end: 2000 }],
      },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    const seg = option.series[0].data.find(
      (d: { state: string }) => d.state === 'maintenance',
    )
    expect(seg).toBeDefined()
    expect(seg.color).toBe(chartPalette[7])
  })

  it('custom stateColors override default mapping', () => {
    const customColors = { up: '#123456', down: '#654321' }
    const wrapper = mount(StateTimelinePanel, {
      props: {
        segments: [
          { entity: 'svc', state: 'up', start: 1000, end: 2000 },
          { entity: 'svc', state: 'down', start: 2000, end: 3000 },
        ],
        stateColors: customColors,
      },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    const upSeg = option.series[0].data.find((d: { state: string }) => d.state === 'up')
    const downSeg = option.series[0].data.find((d: { state: string }) => d.state === 'down')
    expect(upSeg.color).toBe('#123456')
    expect(downSeg.color).toBe('#654321')
  })

  it('yAxis has entity names as categories', () => {
    const wrapper = mount(StateTimelinePanel, {
      props: { segments: mockSegments },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.yAxis.type).toBe('category')
    expect(option.yAxis.data).toContain('api-server')
    expect(option.yAxis.data).toContain('db-primary')
  })

  it('applies chartAxisStyle to axes', () => {
    const wrapper = mount(StateTimelinePanel, {
      props: { segments: mockSegments },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.xAxis.axisLine.lineStyle.color).toBe(chartAxisStyle.axisLine.lineStyle.color)
    expect(option.xAxis.axisTick.show).toBe(chartAxisStyle.axisTick.show)
    expect(option.xAxis.axisLabel.color).toBe(chartAxisStyle.axisLabel.color)
    expect(option.xAxis.axisLabel.fontFamily).toBe(chartAxisStyle.axisLabel.fontFamily)
    expect(option.yAxis.axisLabel.color).toBe(chartAxisStyle.axisLabel.color)
    expect(option.yAxis.axisLabel.fontFamily).toBe(chartAxisStyle.axisLabel.fontFamily)
  })

  it('applies chartTooltipStyle to tooltip', () => {
    const wrapper = mount(StateTimelinePanel, {
      props: { segments: mockSegments },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.tooltip.backgroundColor).toBe(chartTooltipStyle.backgroundColor)
    expect(option.tooltip.borderColor).toBe(chartTooltipStyle.borderColor)
    expect(option.tooltip.textStyle.color).toBe(chartTooltipStyle.textStyle.color)
  })

  it('handles empty segments gracefully', () => {
    const wrapper = mount(StateTimelinePanel, {
      props: { segments: [] },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.series[0].data).toHaveLength(0)
    expect(option.yAxis.data).toHaveLength(0)
  })

  it('has transparent background', () => {
    const wrapper = mount(StateTimelinePanel, {
      props: { segments: mockSegments },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.backgroundColor).toBe('transparent')
  })

  it('grid has padding properties', () => {
    const wrapper = mount(StateTimelinePanel, {
      props: { segments: mockSegments },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.grid).toBeDefined()
    expect(option.grid.left).toBeDefined()
    expect(option.grid.right).toBeDefined()
    expect(option.grid.top).toBeDefined()
    expect(option.grid.bottom).toBeDefined()
  })

  it('xAxis type is time', () => {
    const wrapper = mount(StateTimelinePanel, {
      props: { segments: mockSegments },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.xAxis.type).toBe('time')
  })

  it('series data includes entity, state, start, end, and color for each segment', () => {
    const segments = [{ entity: 'api-server', state: 'up', start: 1000, end: 2000 }]
    const wrapper = mount(StateTimelinePanel, {
      props: { segments },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.series[0].data).toHaveLength(1)
    const d = option.series[0].data[0]
    expect(d.entity).toBe('api-server')
    expect(d.state).toBe('up')
    expect(d.start).toBe(1000)
    expect(d.end).toBe(2000)
    expect(d.color).toBeDefined()
  })

  it('also handles healthy and ok aliases as thresholdColors.good', () => {
    const wrapper = mount(StateTimelinePanel, {
      props: {
        segments: [
          { entity: 'svc', state: 'healthy', start: 1000, end: 1500 },
          { entity: 'svc', state: 'ok', start: 1500, end: 2000 },
        ],
      },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    for (const seg of option.series[0].data) {
      expect(seg.color).toBe(thresholdColors.good)
    }
  })

  it('also handles error and critical aliases as thresholdColors.critical', () => {
    const wrapper = mount(StateTimelinePanel, {
      props: {
        segments: [
          { entity: 'svc', state: 'error', start: 1000, end: 1500 },
          { entity: 'svc', state: 'critical', start: 1500, end: 2000 },
        ],
      },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    for (const seg of option.series[0].data) {
      expect(seg.color).toBe(thresholdColors.critical)
    }
  })

  it('also handles warning alias as thresholdColors.warning', () => {
    const wrapper = mount(StateTimelinePanel, {
      props: {
        segments: [{ entity: 'svc', state: 'warning', start: 1000, end: 2000 }],
      },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.series[0].data[0].color).toBe(thresholdColors.warning)
  })
})

// ---------------------------------------------------------------------------
// Data adapter tests
// ---------------------------------------------------------------------------

describe('state_timeline dataAdapter', () => {
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  let adapter: (raw: any) => any

  beforeEach(async () => {
    clearRegistry()
    const { registerPanel: reg } = await import('../../utils/panelRegistry')
    const { GanttChart } = await import('lucide-vue-next')
    reg({
      type: 'state_timeline',
      component: () => import('./StateTimelinePanel.vue'),
      dataAdapter: (raw) => {
        const segments: Array<{ entity: string; state: string; start: number; end: number }> = []
        for (const series of raw.series) {
          const points = series.data as Array<{ timestamp: number; value: number }>
          if (points.length === 0) continue
          let currentState = points[0].value > 0 ? 'up' : 'down'
          let segStart = points[0].timestamp
          for (let i = 1; i < points.length; i++) {
            const newState = points[i].value > 0 ? 'up' : 'down'
            if (newState !== currentState) {
              segments.push({ entity: series.name, state: currentState, start: segStart, end: points[i].timestamp })
              currentState = newState
              segStart = points[i].timestamp
            }
          }
          segments.push({ entity: series.name, state: currentState, start: segStart, end: points[points.length - 1].timestamp })
        }
        return { segments }
      },
      defaultQuery: {},
      category: 'observability',
      label: 'State Timeline',
      icon: GanttChart,
    })

    const { lookupPanel } = await import('../../utils/panelRegistry')
    adapter = lookupPanel('state_timeline')!.dataAdapter
  })

  afterEach(() => {
    clearRegistry()
  })

  it('dataAdapter transforms value series into state segments', () => {
    const raw = {
      series: [
        {
          name: 'api-server',
          data: [
            { timestamp: 1000, value: 1 },
            { timestamp: 2000, value: 1 },
            { timestamp: 3000, value: 0 },
            { timestamp: 4000, value: 0 },
          ],
        },
      ],
    }

    const result = adapter(raw) as { segments: Array<{ entity: string; state: string; start: number; end: number }> }

    // Should produce: up from 1000-3000, down from 3000-4000
    expect(result.segments).toHaveLength(2)
    expect(result.segments[0]).toEqual({ entity: 'api-server', state: 'up', start: 1000, end: 3000 })
    expect(result.segments[1]).toEqual({ entity: 'api-server', state: 'down', start: 3000, end: 4000 })
  })

  it('dataAdapter handles single-point series (one segment)', () => {
    const raw = {
      series: [
        {
          name: 'db',
          data: [{ timestamp: 1000, value: 1 }],
        },
      ],
    }

    const result = adapter(raw) as { segments: Array<{ entity: string; state: string; start: number; end: number }> }

    expect(result.segments).toHaveLength(1)
    expect(result.segments[0]).toEqual({ entity: 'db', state: 'up', start: 1000, end: 1000 })
  })

  it('dataAdapter handles empty series', () => {
    const raw = { series: [] }
    const result = adapter(raw) as { segments: unknown[] }

    expect(result.segments).toHaveLength(0)
  })

  it('dataAdapter handles series with no data points', () => {
    const raw = {
      series: [{ name: 'empty-svc', data: [] }],
    }

    const result = adapter(raw) as { segments: unknown[] }

    expect(result.segments).toHaveLength(0)
  })

  it('dataAdapter handles multiple series', () => {
    const raw = {
      series: [
        {
          name: 'svc-a',
          data: [
            { timestamp: 1000, value: 1 },
            { timestamp: 2000, value: 1 },
          ],
        },
        {
          name: 'svc-b',
          data: [
            { timestamp: 1000, value: 0 },
            { timestamp: 2000, value: 0 },
          ],
        },
      ],
    }

    const result = adapter(raw) as { segments: Array<{ entity: string; state: string }> }

    expect(result.segments).toHaveLength(2)
    expect(result.segments[0].entity).toBe('svc-a')
    expect(result.segments[0].state).toBe('up')
    expect(result.segments[1].entity).toBe('svc-b')
    expect(result.segments[1].state).toBe('down')
  })

  it('registers with type "state_timeline" and category "observability"', async () => {
    const { lookupPanel } = await import('../../utils/panelRegistry')
    const registration = lookupPanel('state_timeline')

    expect(registration).not.toBeNull()
    expect(registration?.type).toBe('state_timeline')
    expect(registration?.category).toBe('observability')
    expect(registration?.label).toBe('State Timeline')
  })
})
