import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { computed } from 'vue'
import Panel from './Panel.vue'

const mockQueryDataSource = vi.hoisted(() => vi.fn())
const mockSearchDataSourceTraces = vi.hoisted(() => vi.fn())

// Mock state that can be controlled per test
let mockLoading = false
let mockError: string | null = null

interface MockChartSeries {
  name: string
  data: Array<{ timestamp: number; value: number }>
  labels: Record<string, string>
}

let mockChartSeries: MockChartSeries[] = []

// Mock the composables
vi.mock('../composables/useTimeRange', () => ({
  useTimeRange: () => ({
    timeRange: computed(() => ({ start: Date.now() - 3600000, end: Date.now() })),
    onRefresh: vi.fn(() => () => {}),
  }),
}))

vi.mock('../composables/useProm', () => ({
  useProm: () => ({
    chartData: computed(() => ({ series: mockChartSeries })),
    loading: computed(() => mockLoading),
    error: computed(() => mockError),
    fetch: vi.fn(),
  }),
}))

vi.mock('../api/datasources', () => ({
  queryDataSource: mockQueryDataSource,
  searchDataSourceTraces: mockSearchDataSourceTraces,
}))

// Mock LineChart component
vi.mock('./LineChart.vue', () => ({
  default: {
    name: 'LineChart',
    props: ['series'],
    template: '<div class="mock-line-chart">LineChart Mock</div>',
  },
}))

vi.mock('./TraceListPanel.vue', () => ({
  default: {
    name: 'TraceListPanel',
    props: ['traces'],
    template: `
      <div class="mock-trace-list-panel">
        <button
          v-if="traces.length > 0"
          class="mock-open-trace"
          type="button"
          @click="$emit('open-trace', traces[0].traceId)"
        >
          Open trace
        </button>
      </div>
    `,
  },
}))

vi.mock('./TraceHeatmapPanel.vue', () => ({
  default: {
    name: 'TraceHeatmapPanel',
    props: ['traces'],
    template: '<div class="mock-trace-heatmap-panel">TraceHeatmapPanel Mock</div>',
  },
}))

vi.mock('./LogViewer.vue', () => ({
  default: {
    name: 'LogViewer',
    props: ['logs'],
    template: '<div class="mock-log-viewer">{{ logs.length }} logs</div>',
  },
}))

describe('Panel', () => {
  const mockPanel = {
    id: '1',
    dashboard_id: 'dashboard-1',
    title: 'Test Panel',
    type: 'line_chart',
    grid_pos: { x: 0, y: 0, w: 6, h: 4 },
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  }

  beforeEach(() => {
    // Reset mock state before each test
    mockLoading = false
    mockError = null
    mockChartSeries = []
    mockQueryDataSource.mockResolvedValue({
      status: 'success',
      resultType: 'metrics',
      data: { resultType: 'matrix', result: [] },
    })
    mockSearchDataSourceTraces.mockResolvedValue([])
    vi.clearAllMocks()
  })

  it('renders panel title', () => {
    const wrapper = mount(Panel, {
      props: { panel: mockPanel },
    })
    expect(wrapper.find('.panel-title').text()).toBe('Test Panel')
  })

  it('displays placeholder when no query configured', () => {
    const wrapper = mount(Panel, {
      props: { panel: mockPanel },
    })
    expect(wrapper.find('.panel-state').exists()).toBe(true)
    expect(wrapper.text()).toContain('No query configured')
  })

  it('emits edit event when edit button is clicked', async () => {
    const wrapper = mount(Panel, {
      props: { panel: mockPanel },
    })
    // Find button by title attribute since we use icons now
    const editBtn = wrapper.findAll('button').find((b) => b.attributes('title') === 'Edit panel')
    expect(editBtn).toBeDefined()
    if (!editBtn) {
      throw new Error('Expected edit button to be present')
    }
    await editBtn.trigger('click')
    expect(wrapper.emitted('edit')).toBeTruthy()
    expect(wrapper.emitted('edit')?.[0]).toEqual([mockPanel])
  })

  it('emits delete event when delete button is clicked', async () => {
    const wrapper = mount(Panel, {
      props: { panel: mockPanel },
    })
    // Find button by title attribute since we use icons now
    const deleteBtn = wrapper.findAll('button').find((b) => b.attributes('title') === 'Delete panel')
    expect(deleteBtn).toBeDefined()
    if (!deleteBtn) {
      throw new Error('Expected delete button to be present')
    }
    await deleteBtn.trigger('click')
    expect(wrapper.emitted('delete')).toBeTruthy()
    expect(wrapper.emitted('delete')?.[0]).toEqual([mockPanel])
  })

  it('shows loading state when fetching data', async () => {
    mockLoading = true

    const panelWithQuery = {
      ...mockPanel,
      query: { promql: 'up' },
    }

    const wrapper = mount(Panel, {
      props: { panel: panelWithQuery },
    })

    expect(wrapper.find('.panel-state').exists()).toBe(true)
    expect(wrapper.text()).toContain('Loading')
  })

  it('shows error state when fetch fails', async () => {
    mockError = 'Query failed'

    const panelWithQuery = {
      ...mockPanel,
      query: { promql: 'up' },
    }

    const wrapper = mount(Panel, {
      props: { panel: panelWithQuery },
    })

    expect(wrapper.find('.panel-error').exists()).toBe(true)
    expect(wrapper.text()).toContain('Query failed')
  })

  it('renders LineChart when data is available', async () => {
    mockChartSeries = [
      {
        name: 'up',
        data: [{ timestamp: 1704067200, value: 1 }],
        labels: { __name__: 'up' },
      },
    ]

    const panelWithQuery = {
      ...mockPanel,
      query: { promql: 'up' },
    }

    const wrapper = mount(Panel, {
      props: { panel: panelWithQuery },
    })

    expect(wrapper.find('.chart-container').exists()).toBe(true)
    expect(wrapper.find('.mock-line-chart').exists()).toBe(true)
  })

  it('shows no data message when query returns empty results', async () => {
    mockChartSeries = []

    const panelWithQuery = {
      ...mockPanel,
      query: { promql: 'nonexistent_metric' },
    }

    const wrapper = mount(Panel, {
      props: { panel: panelWithQuery },
    })

    expect(wrapper.find('.panel-no-data').exists()).toBe(true)
    expect(wrapper.text()).toContain('No data')
  })

  it('renders trace list panel for trace_list type', async () => {
    mockSearchDataSourceTraces.mockResolvedValue([
      {
        traceId: 'trace-1',
        startTimeUnixNano: 1_700_000_000_000_000_000,
        durationNano: 1_500_000,
        spanCount: 5,
        serviceCount: 2,
        errorSpanCount: 0,
      },
    ])

    const tracePanel = {
      ...mockPanel,
      type: 'trace_list',
      query: { datasource_id: 'ds-trace-1', expr: 'service=api', limit: 20 },
    }

    const wrapper = mount(Panel, {
      props: { panel: tracePanel },
    })
    await flushPromises()

    expect(mockSearchDataSourceTraces).toHaveBeenCalledWith(
      'ds-trace-1',
      expect.objectContaining({
        query: 'service=api',
        limit: 20,
      }),
    )
    expect(wrapper.find('.mock-trace-list-panel').exists()).toBe(true)
  })

  it('emits open-trace event for trace list rows', async () => {
    mockSearchDataSourceTraces.mockResolvedValue([
      {
        traceId: 'trace-1',
        startTimeUnixNano: 1_700_000_000_000_000_000,
        durationNano: 1_500_000,
        spanCount: 5,
        serviceCount: 2,
        errorSpanCount: 0,
      },
    ])

    const tracePanel = {
      ...mockPanel,
      type: 'trace_list',
      query: { datasource_id: 'ds-trace-1' },
    }

    const wrapper = mount(Panel, {
      props: { panel: tracePanel },
    })
    await flushPromises()

    await wrapper.find('.mock-open-trace').trigger('click')

    expect(wrapper.emitted('open-trace')).toEqual([
      [{ datasourceId: 'ds-trace-1', traceId: 'trace-1' }],
    ])
  })

  it('renders trace heatmap panel for trace_heatmap type', async () => {
    mockSearchDataSourceTraces.mockResolvedValue([
      {
        traceId: 'trace-2',
        startTimeUnixNano: 1_700_000_000_000_000_000,
        durationNano: 2_000_000,
        spanCount: 6,
        serviceCount: 2,
        errorSpanCount: 1,
      },
    ])

    const tracePanel = {
      ...mockPanel,
      type: 'trace_heatmap',
      query: { datasource_id: 'ds-trace-1', service: 'api' },
    }

    const wrapper = mount(Panel, {
      props: { panel: tracePanel },
    })
    await flushPromises()

    expect(mockSearchDataSourceTraces).toHaveBeenCalledWith(
      'ds-trace-1',
      expect.objectContaining({ service: 'api' }),
    )
    expect(wrapper.find('.mock-trace-heatmap-panel').exists()).toBe(true)
  })

  it('queries clickhouse logs panels with logs signal', async () => {
    mockQueryDataSource.mockResolvedValue({
      status: 'success',
      resultType: 'logs',
      data: {
        logs: [
          {
            timestamp: '2026-02-01T00:00:00Z',
            line: 'request complete',
            level: 'info',
          },
        ],
      },
    })

    const logsPanel = {
      ...mockPanel,
      type: 'logs',
      query: {
        datasource_id: 'ds-clickhouse-1',
        expr: 'SELECT timestamp, message FROM logs LIMIT 10',
        signal: 'logs',
      },
    }

    const wrapper = mount(Panel, {
      props: { panel: logsPanel },
    })
    await flushPromises()

    expect(mockQueryDataSource).toHaveBeenCalledWith(
      'ds-clickhouse-1',
      expect.objectContaining({
        query: 'SELECT timestamp, message FROM logs LIMIT 10',
        signal: 'logs',
      }),
    )
    expect(wrapper.find('.mock-log-viewer').exists()).toBe(true)
    expect(wrapper.find('.mock-log-viewer').text()).toContain('1 logs')
  })

  it('queries clickhouse trace panels with traces signal and keeps trace navigation disabled', async () => {
    mockQueryDataSource.mockResolvedValue({
      status: 'success',
      resultType: 'traces',
      data: {
        traces: [
          {
            spanId: 'span-1',
            operationName: 'GET /api/orders',
            serviceName: 'api',
            startTimeUnixNano: 1_700_000_000_000_000_000,
            durationNano: 1_500_000,
            tags: { trace_id: 'trace-clickhouse-1' },
          },
        ],
      },
    })

    const tracePanel = {
      ...mockPanel,
      type: 'trace_list',
      query: {
        datasource_id: 'ds-clickhouse-1',
        expr: 'SELECT * FROM traces LIMIT 100',
        signal: 'traces',
      },
    }

    const wrapper = mount(Panel, {
      props: { panel: tracePanel },
    })
    await flushPromises()

    expect(mockQueryDataSource).toHaveBeenCalledWith(
      'ds-clickhouse-1',
      expect.objectContaining({
        query: 'SELECT * FROM traces LIMIT 100',
        signal: 'traces',
      }),
    )
    expect(wrapper.find('.mock-trace-list-panel').exists()).toBe(true)

    await wrapper.find('.mock-open-trace').trigger('click')
    expect(wrapper.emitted('open-trace')).toBeFalsy()
  })

  it('infers logs signal for datasource log panels when signal is omitted', async () => {
    mockQueryDataSource.mockResolvedValue({
      status: 'success',
      resultType: 'logs',
      data: {
        logs: [
          {
            timestamp: '2026-02-01T00:00:00Z',
            line: 'cloudwatch log line',
            level: 'info',
          },
        ],
      },
    })

    const logsPanel = {
      ...mockPanel,
      type: 'logs',
      query: {
        datasource_id: 'ds-cloudwatch-1',
        expr: 'fields @timestamp, @message | limit 10',
      },
    }

    const wrapper = mount(Panel, {
      props: { panel: logsPanel },
    })
    await flushPromises()

    expect(mockQueryDataSource).toHaveBeenCalledWith(
      'ds-cloudwatch-1',
      expect.objectContaining({
        signal: 'logs',
      }),
    )
    expect(wrapper.find('.mock-log-viewer').text()).toContain('1 logs')
  })
})
