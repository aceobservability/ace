import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed } from 'vue'
import Panel from './Panel.vue'

const mockQueryDataSource = vi.hoisted(() => vi.fn())
const mockSearchDataSourceTraces = vi.hoisted(() => vi.fn())
const mockLookupPanel = vi.hoisted(() => vi.fn())
const mockIsRegisteredPanel = vi.hoisted(() => vi.fn())

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

vi.mock('../utils/panelRegistry', () => ({
  lookupPanel: mockLookupPanel,
  isRegisteredPanel: mockIsRegisteredPanel,
  registerPanel: vi.fn(),
}))

// Mock the side-effect import so it doesn't try to register real panels
vi.mock('./panels/index', () => ({}))

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
    // Default: not a registry panel
    mockIsRegisteredPanel.mockReturnValue(false)
    mockLookupPanel.mockReturnValue(null)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders panel title', () => {
    const wrapper = mount(Panel, {
      props: { panel: mockPanel },
    })
    expect(wrapper.find('h3').text()).toBe('Test Panel')
  })

  it('displays placeholder when no query configured', () => {
    const wrapper = mount(Panel, {
      props: { panel: mockPanel },
    })
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
    const deleteBtn = wrapper
      .findAll('button')
      .find((b) => b.attributes('title') === 'Delete panel')
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

  it('shows anomaly badge when anomaly prop is truthy', () => {
    const wrapper = mount(Panel, {
      props: { panel: mockPanel, anomaly: 'Spike detected in error rate' },
    })
    expect(wrapper.find('[data-testid="panel-anomaly-dot"]').exists()).toBe(true)
  })

  it('hides anomaly badge when anomaly prop is undefined', () => {
    const wrapper = mount(Panel, {
      props: { panel: mockPanel },
    })
    expect(wrapper.find('[data-testid="panel-anomaly-dot"]').exists()).toBe(false)
  })

  it('shows anomaly tooltip text on hover', () => {
    const wrapper = mount(Panel, {
      props: { panel: mockPanel, anomaly: 'Spike detected in error rate' },
    })
    const dot = wrapper.find('[data-testid="panel-anomaly-dot"]')
    expect(dot.attributes('title')).toBe('Spike detected in error rate')
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

  describe('registry-based panel rendering', () => {
    const mockDataAdapter = vi.fn()

    beforeEach(() => {
      // Reset registry mocks for each registry test
      mockIsRegisteredPanel.mockReturnValue(false)
      mockLookupPanel.mockReturnValue(null)
      mockDataAdapter.mockReset()
    })

    it('renders a registered panel type with adapted props', async () => {
      const registeredType = 'heatmap'
      mockIsRegisteredPanel.mockImplementation((type: string) => type === registeredType)
      mockDataAdapter.mockReturnValue({ buckets: [[1, 2, 3]], colorRange: ['#fff', '#000'] })
      mockLookupPanel.mockImplementation((type: string) => {
        if (type !== registeredType) return null
        return {
          type: registeredType,
          component: () =>
            Promise.resolve({
              name: 'MockHeatmap',
              props: ['buckets', 'colorRange'],
              template: '<div class="mock-registry-panel">Heatmap Mock</div>',
            }),
          dataAdapter: mockDataAdapter,
          defaultQuery: {},
          category: 'charts',
          label: 'Heatmap',
          icon: { template: '<span />' },
        }
      })

      mockChartSeries = [
        {
          name: 'heat',
          data: [{ timestamp: 1000, value: 42 }],
          labels: {},
        },
      ]

      const panelWithQuery = {
        ...mockPanel,
        type: registeredType,
        query: { promql: 'histogram_quantile(0.9, rate(http_duration_bucket[5m]))' },
      }

      const wrapper = mount(Panel, {
        props: { panel: panelWithQuery },
      })
      await flushPromises()

      expect(wrapper.find('.mock-registry-panel').exists()).toBe(true)
    })

    it('does NOT use registry for known panel types (line_chart)', async () => {
      // Even if registry returns something for line_chart, the built-in branch should win
      mockIsRegisteredPanel.mockReturnValue(true)
      mockLookupPanel.mockReturnValue({
        type: 'line_chart',
        component: () =>
          Promise.resolve({
            name: 'ShouldNotRender',
            template: '<div class="mock-registry-panel">Should Not Render</div>',
          }),
        dataAdapter: () => ({}),
        defaultQuery: {},
        category: 'charts',
        label: 'Line',
        icon: { template: '<span />' },
      })

      mockChartSeries = [
        {
          name: 'up',
          data: [{ timestamp: 1000, value: 1 }],
          labels: {},
        },
      ]

      const panelWithQuery = {
        ...mockPanel,
        type: 'line_chart',
        query: { promql: 'up' },
      }

      const wrapper = mount(Panel, {
        props: { panel: panelWithQuery },
      })
      await flushPromises()

      // The built-in LineChart should render, not the registry component
      expect(wrapper.find('.mock-line-chart').exists()).toBe(true)
      expect(wrapper.find('.mock-registry-panel').exists()).toBe(false)
    })

    it('shows "No data available" for unregistered unknown panel type', async () => {
      // unknown_type is not registered
      mockIsRegisteredPanel.mockReturnValue(false)
      mockLookupPanel.mockReturnValue(null)

      const panelWithQuery = {
        ...mockPanel,
        type: 'unknown_type',
        query: { promql: 'up' },
      }

      const wrapper = mount(Panel, {
        props: { panel: panelWithQuery },
      })
      await flushPromises()

      expect(wrapper.text()).toContain('No data')
      expect(wrapper.find('.mock-registry-panel').exists()).toBe(false)
    })

    it('calls dataAdapter with raw query result containing series, logs, and traces', async () => {
      const registeredType = 'custom_viz'
      mockIsRegisteredPanel.mockImplementation((type: string) => type === registeredType)
      mockDataAdapter.mockReturnValue({ items: [] })
      mockLookupPanel.mockImplementation((type: string) => {
        if (type !== registeredType) return null
        return {
          type: registeredType,
          component: () =>
            Promise.resolve({
              name: 'MockCustomViz',
              props: ['items'],
              template: '<div class="mock-registry-panel">Custom Viz</div>',
            }),
          dataAdapter: mockDataAdapter,
          defaultQuery: {},
          category: 'widgets',
          label: 'Custom',
          icon: { template: '<span />' },
        }
      })

      mockChartSeries = [
        {
          name: 'metric1',
          data: [{ timestamp: 1000, value: 5 }],
          labels: {},
        },
      ]

      const panelWithQuery = {
        ...mockPanel,
        type: registeredType,
        query: { promql: 'some_query' },
      }

      mount(Panel, {
        props: { panel: panelWithQuery },
      })
      await flushPromises()

      expect(mockDataAdapter).toHaveBeenCalledWith(
        expect.objectContaining({
          series: expect.arrayContaining([expect.objectContaining({ name: 'metric1' })]),
          logs: expect.any(Array),
          traces: expect.any(Array),
        }),
        expect.anything(), // panel.query passed as second arg
      )
    })

    it('hasQuery returns true for a registry panel with a datasource configured', async () => {
      const registeredType = 'scatter'
      mockIsRegisteredPanel.mockImplementation((type: string) => type === registeredType)
      mockLookupPanel.mockImplementation((type: string) => {
        if (type !== registeredType) return null
        return {
          type: registeredType,
          component: () =>
            Promise.resolve({
              name: 'MockScatter',
              template: '<div class="mock-registry-panel">Scatter</div>',
            }),
          dataAdapter: () => ({}),
          defaultQuery: {},
          category: 'charts',
          label: 'Scatter',
          icon: { template: '<span />' },
        }
      })

      const panelWithDatasource = {
        ...mockPanel,
        type: registeredType,
        query: { datasource_id: 'ds-1' },
      }

      const wrapper = mount(Panel, {
        props: { panel: panelWithDatasource },
      })
      await flushPromises()

      // Should NOT show "No query configured" — hasQuery should be true
      expect(wrapper.text()).not.toContain('No query configured')
    })
  })
})
