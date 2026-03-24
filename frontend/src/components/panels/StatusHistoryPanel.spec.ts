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
  HeatmapChart: {},
}))

vi.mock('echarts/components', () => ({
  GridComponent: {},
  TooltipComponent: {},
  VisualMapComponent: {},
}))

// ---------------------------------------------------------------------------
// StatusHistoryPanel component tests
// ---------------------------------------------------------------------------

describe('StatusHistoryPanel', () => {
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  let StatusHistoryPanel: any

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('./StatusHistoryPanel.vue')
    StatusHistoryPanel = mod.default
  })

  const mockCells = [
    { entity: 'api-1', bucket: '10:00', state: 'up' },
    { entity: 'api-1', bucket: '10:05', state: 'degraded' },
    { entity: 'api-1', bucket: '10:10', state: 'down' },
    { entity: 'api-2', bucket: '10:00', state: 'up' },
    { entity: 'api-2', bucket: '10:05', state: 'up' },
    { entity: 'db-primary', bucket: '10:00', state: 'up' },
  ]

  it('renders with valid status cells', () => {
    const wrapper = mount(StatusHistoryPanel, {
      props: { cells: mockCells },
    })
    expect(wrapper.find('.h-full.w-full').exists()).toBe(true)
    expect(wrapper.find('.echarts-mock').exists()).toBe(true)
  })

  it('series type is heatmap', () => {
    const wrapper = mount(StatusHistoryPanel, {
      props: { cells: mockCells },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.series).toHaveLength(1)
    expect(option.series[0].type).toBe('heatmap')
  })

  it('up state maps to thresholdColors.good', () => {
    const wrapper = mount(StatusHistoryPanel, {
      props: { cells: [{ entity: 'api-1', bucket: '10:00', state: 'up' }] },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    const pieces = option.visualMap.pieces
    const upPiece = pieces.find((p: { value: number }) => p.value === 0)
    expect(upPiece).toBeDefined()
    expect(upPiece.color).toBe(thresholdColors.good)
  })

  it('down state maps to thresholdColors.critical', () => {
    const wrapper = mount(StatusHistoryPanel, {
      props: { cells: [{ entity: 'api-1', bucket: '10:00', state: 'down' }] },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    const pieces = option.visualMap.pieces
    const downPiece = pieces.find((p: { value: number }) => p.value === 2)
    expect(downPiece).toBeDefined()
    expect(downPiece.color).toBe(thresholdColors.critical)
  })

  it('degraded state maps to thresholdColors.warning', () => {
    const wrapper = mount(StatusHistoryPanel, {
      props: { cells: [{ entity: 'api-1', bucket: '10:00', state: 'degraded' }] },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    const pieces = option.visualMap.pieces
    const degradedPiece = pieces.find((p: { value: number }) => p.value === 1)
    expect(degradedPiece).toBeDefined()
    expect(degradedPiece.color).toBe(thresholdColors.warning)
  })

  it('unknown state maps to chartPalette[7] (Alloy Silver)', () => {
    const wrapper = mount(StatusHistoryPanel, {
      props: { cells: [{ entity: 'svc', bucket: '10:00', state: 'maintenance' }] },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    const pieces = option.visualMap.pieces
    const unknownPiece = pieces.find((p: { value: number }) => p.value === 3)
    expect(unknownPiece).toBeDefined()
    expect(unknownPiece.color).toBe(chartPalette[7])
  })

  it('custom stateColors prop overrides defaults', () => {
    const customColors = { up: '#aabbcc', down: '#112233' }
    const wrapper = mount(StatusHistoryPanel, {
      props: {
        cells: mockCells,
        stateColors: customColors,
      },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    const pieces = option.visualMap.pieces
    const upPiece = pieces.find((p: { value: number }) => p.value === 0)
    const downPiece = pieces.find((p: { value: number }) => p.value === 2)
    expect(upPiece.color).toBe('#aabbcc')
    expect(downPiece.color).toBe('#112233')
  })

  it('xAxis has bucket labels as categories', () => {
    const wrapper = mount(StatusHistoryPanel, {
      props: { cells: mockCells },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.xAxis.type).toBe('category')
    expect(option.xAxis.data).toContain('10:00')
    expect(option.xAxis.data).toContain('10:05')
    expect(option.xAxis.data).toContain('10:10')
  })

  it('yAxis has entity names as categories', () => {
    const wrapper = mount(StatusHistoryPanel, {
      props: { cells: mockCells },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.yAxis.type).toBe('category')
    expect(option.yAxis.data).toContain('api-1')
    expect(option.yAxis.data).toContain('api-2')
    expect(option.yAxis.data).toContain('db-primary')
  })

  it('applies chartAxisStyle to axes', () => {
    const wrapper = mount(StatusHistoryPanel, {
      props: { cells: mockCells },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.xAxis.axisLine.lineStyle.color).toBe(chartAxisStyle.axisLine.lineStyle.color)
    expect(option.xAxis.axisTick.show).toBe(chartAxisStyle.axisTick.show)
    expect(option.xAxis.axisLabel.color).toBe(chartAxisStyle.axisLabel.color)
    expect(option.xAxis.axisLabel.fontFamily).toBe(chartAxisStyle.axisLabel.fontFamily)
    expect(option.yAxis.axisLine.lineStyle.color).toBe(chartAxisStyle.axisLine.lineStyle.color)
    expect(option.yAxis.axisLabel.color).toBe(chartAxisStyle.axisLabel.color)
    expect(option.yAxis.axisLabel.fontFamily).toBe(chartAxisStyle.axisLabel.fontFamily)
  })

  it('applies chartTooltipStyle to tooltip', () => {
    const wrapper = mount(StatusHistoryPanel, {
      props: { cells: mockCells },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.tooltip.backgroundColor).toBe(chartTooltipStyle.backgroundColor)
    expect(option.tooltip.borderColor).toBe(chartTooltipStyle.borderColor)
    expect(option.tooltip.textStyle.color).toBe(chartTooltipStyle.textStyle.color)
  })

  it('handles empty cells gracefully', () => {
    const wrapper = mount(StatusHistoryPanel, {
      props: { cells: [] },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.series[0].data).toHaveLength(0)
    expect(option.xAxis.data).toHaveLength(0)
    expect(option.yAxis.data).toHaveLength(0)
  })

  it('visualMap is piecewise (not continuous)', () => {
    const wrapper = mount(StatusHistoryPanel, {
      props: { cells: mockCells },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.visualMap.type).toBe('piecewise')
  })

  it('series data is array of [bucketIndex, entityIndex, stateNumericValue]', () => {
    const cells = [
      { entity: 'api-1', bucket: '10:00', state: 'up' },
      { entity: 'api-2', bucket: '10:05', state: 'down' },
    ]
    const wrapper = mount(StatusHistoryPanel, {
      props: { cells },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    const data = option.series[0].data
    expect(data).toHaveLength(2)
    // Each item should be [bucketIndex, entityIndex, numericStateValue]
    for (const item of data) {
      expect(Array.isArray(item)).toBe(true)
      expect(item).toHaveLength(3)
    }
  })

  it('has transparent background', () => {
    const wrapper = mount(StatusHistoryPanel, {
      props: { cells: mockCells },
    })
    const chart = wrapper.find('.echarts-mock')
    const option = JSON.parse(chart.attributes('data-option') || '{}')

    expect(option.backgroundColor).toBe('transparent')
  })

  it('grid has padding properties', () => {
    const wrapper = mount(StatusHistoryPanel, {
      props: { cells: mockCells },
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

describe('status_history dataAdapter', () => {
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  let adapter: (raw: any) => any

  beforeEach(async () => {
    clearRegistry()
    const { registerPanel: reg } = await import('../../utils/panelRegistry')
    const { LayoutGrid } = await import('lucide-vue-next')
    reg({
      type: 'status_history',
      component: () => import('./StatusHistoryPanel.vue'),
      dataAdapter: (raw) => {
        const cells: Array<{ entity: string; bucket: string; state: string }> = []
        for (const series of raw.series) {
          const points = series.data as Array<{ timestamp: number; value: number }>
          for (const point of points) {
            const date = new Date(point.timestamp * 1000)
            const bucket = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
            const state = point.value > 0.5 ? 'up' : point.value > 0 ? 'degraded' : 'down'
            cells.push({ entity: series.name, bucket, state })
          }
        }
        return { cells }
      },
      defaultQuery: {},
      category: 'observability',
      label: 'Status History',
      icon: LayoutGrid,
    })

    const { lookupPanel } = await import('../../utils/panelRegistry')
    adapter = lookupPanel('status_history')!.dataAdapter
  })

  afterEach(() => {
    clearRegistry()
  })

  it('dataAdapter transforms value series into cells', () => {
    const raw = {
      series: [
        {
          name: 'api-server',
          data: [
            { timestamp: 1700000000, value: 1 },    // up
            { timestamp: 1700000300, value: 0.3 },  // degraded
            { timestamp: 1700000600, value: 0 },    // down
          ],
        },
      ],
    }

    const result = adapter(raw) as { cells: Array<{ entity: string; bucket: string; state: string }> }

    expect(result.cells).toHaveLength(3)
    expect(result.cells[0].entity).toBe('api-server')
    expect(result.cells[0].state).toBe('up')
    expect(result.cells[1].state).toBe('degraded')
    expect(result.cells[2].state).toBe('down')
  })

  it('dataAdapter produces bucket strings in HH:MM format', () => {
    const raw = {
      series: [
        {
          name: 'svc',
          data: [{ timestamp: 1700000000, value: 1 }],
        },
      ],
    }

    const result = adapter(raw) as { cells: Array<{ bucket: string }> }

    expect(result.cells[0].bucket).toMatch(/^\d{2}:\d{2}$/)
  })

  it('dataAdapter handles empty series', () => {
    const raw = { series: [] }
    const result = adapter(raw) as { cells: unknown[] }

    expect(result.cells).toHaveLength(0)
  })

  it('dataAdapter handles series with no data points', () => {
    const raw = {
      series: [{ name: 'empty-svc', data: [] }],
    }

    const result = adapter(raw) as { cells: unknown[] }

    expect(result.cells).toHaveLength(0)
  })

  it('dataAdapter handles multiple series', () => {
    const raw = {
      series: [
        {
          name: 'svc-a',
          data: [{ timestamp: 1700000000, value: 1 }],
        },
        {
          name: 'svc-b',
          data: [{ timestamp: 1700000000, value: 0 }],
        },
      ],
    }

    const result = adapter(raw) as { cells: Array<{ entity: string; state: string }> }

    expect(result.cells).toHaveLength(2)
    expect(result.cells[0].entity).toBe('svc-a')
    expect(result.cells[0].state).toBe('up')
    expect(result.cells[1].entity).toBe('svc-b')
    expect(result.cells[1].state).toBe('down')
  })

  it('registers with type "status_history" and category "observability"', async () => {
    const { lookupPanel } = await import('../../utils/panelRegistry')
    const registration = lookupPanel('status_history')

    expect(registration).not.toBeNull()
    expect(registration?.type).toBe('status_history')
    expect(registration?.category).toBe('observability')
    expect(registration?.label).toBe('Status History')
  })
})
