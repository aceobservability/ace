import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ExploreTraces from './ExploreTraces.vue'

const mockFetchDatasources = vi.hoisted(() => vi.fn())
const mockSearchDataSourceTraces = vi.hoisted(() => vi.fn())
const mockFetchDataSourceTrace = vi.hoisted(() => vi.fn())
const mockFetchDataSourceTraceServices = vi.hoisted(() => vi.fn())
const mockFetchDataSourceTraceServiceGraph = vi.hoisted(() => vi.fn())
const mockQueryDataSource = vi.hoisted(() => vi.fn())
const mockRouterPush = vi.hoisted(() => vi.fn())

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: mockRouterPush,
  }),
}))

vi.mock('../components/TimeRangePicker.vue', () => ({
  default: {
    name: 'TimeRangePicker',
    template: '<div class="mock-time-range-picker">TimeRangePicker Mock</div>',
  },
}))

vi.mock('../components/TraceTimeline.vue', () => ({
  default: {
    name: 'TraceTimeline',
    props: ['trace', 'selectedSpanId'],
    template: `
      <div class="mock-trace-timeline">
        TraceTimeline Mock
        <button
          v-if="trace.spans.length > 0"
          class="mock-select-span"
          type="button"
          @click="$emit('select-span', trace.spans[0])"
        >
          Select span
        </button>
      </div>
    `,
  },
}))

vi.mock('../components/TraceServiceGraph.vue', () => ({
  default: {
    name: 'TraceServiceGraph',
    props: ['graph'],
    template: `
      <div class="mock-trace-service-graph">
        TraceServiceGraph Mock
        <button
          class="mock-select-service"
          type="button"
          @click="$emit('select-service', graph.nodes[0]?.serviceName || 'api')"
        >
          Select service
        </button>
      </div>
    `,
  },
}))

vi.mock('../components/ClickHouseSQLEditor.vue', () => ({
  default: {
    name: 'ClickHouseSQLEditor',
    props: ['modelValue', 'signal', 'disabled'],
    emits: ['update:modelValue'],
    template: `
      <textarea
        id="clickhouse-query"
        :value="modelValue"
        :disabled="disabled"
        @input="$emit('update:modelValue', $event.target.value)"
      ></textarea>
    `,
  },
}))

vi.mock('../components/TraceListPanel.vue', () => ({
  default: {
    name: 'TraceListPanel',
    props: ['traces'],
    template: '<div class="mock-trace-list-panel">{{ traces.length }} traces</div>',
  },
}))

vi.mock('../composables/useTimeRange', () => ({
  useTimeRange: () => ({
    timeRange: {
      value: {
        start: 1_700_000_000_000,
        end: 1_700_003_600_000,
      },
    },
  }),
}))

vi.mock('../composables/useOrganization', async () => {
  const { ref } = await import('vue')
  return {
    useOrganization: () => ({
      currentOrg: ref({ id: 'org-1', name: 'Test Org', role: 'admin' }),
    }),
  }
})

vi.mock('../composables/useDatasource', async () => {
  const { ref } = await import('vue')

  const tracingDatasources = ref([
    {
      id: 'ds-trace-1',
      organization_id: 'org-1',
      name: 'Tempo Main',
      type: 'tempo',
      url: 'http://localhost:3200',
      is_default: true,
      auth_type: 'none',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'ds-trace-2',
      organization_id: 'org-1',
      name: 'ClickHouse Traces',
      type: 'clickhouse',
      url: 'http://localhost:8123',
      is_default: false,
      auth_type: 'none',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ])

  return {
    useDatasource: () => ({
      tracingDatasources,
      fetchDatasources: mockFetchDatasources,
    }),
  }
})

vi.mock('../api/datasources', () => ({
  queryDataSource: mockQueryDataSource,
  searchDataSourceTraces: mockSearchDataSourceTraces,
  fetchDataSourceTrace: mockFetchDataSourceTrace,
  fetchDataSourceTraceServices: mockFetchDataSourceTraceServices,
  fetchDataSourceTraceServiceGraph: mockFetchDataSourceTraceServiceGraph,
}))

/** Find the datasource trigger button */
function findDatasourceTrigger(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('button').find((b) =>
    b.attributes('title')?.includes('datasource') || b.text().includes('Tempo Main') || b.text().includes('Active Source')
  )!
}

/** Find datasource dropdown options */
function findDatasourceOptions(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('.absolute button')
}

/** Find the Search button */
function findSearchButton(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('button').find((b) => b.text().includes('Search Traces') || b.text().includes('Searching') || b.text().includes('Run Query'))!
}

/** Find trace result rows (buttons in the results sidebar that contain trace IDs) */
function findTraceResultRows(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('button').filter((b) => b.find('code')?.exists() && b.find('.grid')?.exists())
}

/** Find error display */
function findError(wrapper: ReturnType<typeof mount>) {
  return wrapper.find('.text-rose-700')
}

/** Find service graph error */
function findServiceGraphError(wrapper: ReturnType<typeof mount>) {
  return wrapper.find('.text-rose-600')
}

describe('ExploreTraces', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockFetchDatasources.mockResolvedValue(undefined)
    mockFetchDataSourceTraceServices.mockResolvedValue(['api', 'worker'])
    mockSearchDataSourceTraces.mockResolvedValue([])
    mockFetchDataSourceTrace.mockResolvedValue({
      traceId: 'trace-1',
      spans: [],
      services: ['api'],
      startTimeUnixNano: 1_700_000_000_000_000_000,
      durationNano: 1_500_000,
    })
    mockFetchDataSourceTraceServiceGraph.mockResolvedValue({
      nodes: [
        {
          serviceName: 'api',
          requestCount: 2,
          errorCount: 0,
          errorRate: 0,
          averageDurationNano: 1_200_000,
        },
      ],
      edges: [],
      totalRequests: 2,
      totalErrorCount: 0,
    })
    mockQueryDataSource.mockResolvedValue({
      status: 'success',
      resultType: 'traces',
      data: {
        traces: [],
      },
    })
  })

  it('renders tracing explore page and datasource selector', async () => {
    const wrapper = mount(ExploreTraces)
    await flushPromises()

    expect(wrapper.find('h1').text()).toBe('Explore')
    expect(wrapper.text()).toContain('Tracing')
    expect(wrapper.text()).toContain('Tempo Main')
    expect(wrapper.find('.mock-time-range-picker').exists()).toBe(true)
    expect(mockFetchDatasources).toHaveBeenCalledWith('org-1')
    expect(mockFetchDataSourceTraceServices).toHaveBeenCalledWith('ds-trace-1')
  })

  it('searches traces and renders results', async () => {
    mockSearchDataSourceTraces.mockResolvedValue([
      {
        traceId: 'trace-abc',
        rootServiceName: 'api',
        rootOperationName: 'GET /health',
        startTimeUnixNano: 1_700_000_000_000_000_000,
        durationNano: 1_500_000,
        spanCount: 5,
        serviceCount: 2,
        errorSpanCount: 0,
      },
    ])

    const wrapper = mount(ExploreTraces)
    await wrapper.find('#trace-search-query').setValue('service=api')

    await findSearchButton(wrapper).trigger('click')
    await flushPromises()

    expect(mockSearchDataSourceTraces).toHaveBeenCalledWith(
      'ds-trace-1',
      expect.objectContaining({
        query: 'service=api',
        start: 1_700_000_000,
        end: 1_700_003_600,
        limit: 20,
      }),
    )
    const rows = findTraceResultRows(wrapper)
    expect(rows).toHaveLength(1)
    expect(rows[0].text()).toContain('trace-abc')
  })

  it('loads trace details and renders timeline after selecting a trace', async () => {
    mockSearchDataSourceTraces.mockResolvedValue([
      {
        traceId: 'trace-abc',
        rootServiceName: 'api',
        rootOperationName: 'GET /health',
        startTimeUnixNano: 1_700_000_000_000_000_000,
        durationNano: 1_500_000,
        spanCount: 5,
        serviceCount: 2,
        errorSpanCount: 0,
      },
    ])
    mockFetchDataSourceTrace.mockResolvedValue({
      traceId: 'trace-abc',
      spans: [
        {
          spanId: 'span-1',
          operationName: 'GET /health',
          serviceName: 'api',
          startTimeUnixNano: 1_700_000_000_000_000_000,
          durationNano: 1_500_000,
          tags: {
            'http.method': 'GET',
          },
          logs: [
            {
              timestampUnixNano: 1_700_000_000_000_100_000,
              fields: {
                event: 'request.received',
              },
            },
          ],
        },
      ],
      services: ['api'],
      startTimeUnixNano: 1_700_000_000_000_000_000,
      durationNano: 1_500_000,
    })

    const wrapper = mount(ExploreTraces)
    await findSearchButton(wrapper).trigger('click')
    await flushPromises()

    await findTraceResultRows(wrapper)[0].trigger('click')
    await flushPromises()

    expect(mockFetchDataSourceTrace).toHaveBeenCalledWith('ds-trace-1', 'trace-abc')
    expect(mockFetchDataSourceTraceServiceGraph).toHaveBeenCalledWith('ds-trace-1', 'trace-abc')
    expect(wrapper.find('.mock-trace-timeline').exists()).toBe(true)
    expect(wrapper.find('.mock-trace-service-graph').exists()).toBe(true)

    await wrapper.find('.mock-select-span').trigger('click')
    await flushPromises()

    // Span details panel should be rendered
    expect(wrapper.find('aside[aria-label="Span details panel"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Span details')
    expect(wrapper.text()).toContain('GET /health')
  })

  it('shows service graph fetch error without breaking trace view', async () => {
    mockSearchDataSourceTraces.mockResolvedValue([
      {
        traceId: 'trace-abc',
        rootServiceName: 'api',
        rootOperationName: 'GET /health',
        startTimeUnixNano: 1_700_000_000_000_000_000,
        durationNano: 1_500_000,
        spanCount: 5,
        serviceCount: 2,
        errorSpanCount: 0,
      },
    ])
    mockFetchDataSourceTraceServiceGraph.mockRejectedValue(new Error('graph fetch failed'))

    const wrapper = mount(ExploreTraces)
    await findSearchButton(wrapper).trigger('click')
    await flushPromises()

    await findTraceResultRows(wrapper)[0].trigger('click')
    await flushPromises()

    expect(findServiceGraphError(wrapper).exists()).toBe(true)
    expect(findServiceGraphError(wrapper).text()).toContain('graph fetch failed')
    expect(wrapper.find('.mock-trace-timeline').exists()).toBe(true)
  })

  it('filters traces when selecting a service from graph', async () => {
    mockSearchDataSourceTraces
      .mockResolvedValueOnce([
        {
          traceId: 'trace-abc',
          rootServiceName: 'api',
          rootOperationName: 'GET /health',
          startTimeUnixNano: 1_700_000_000_000_000_000,
          durationNano: 1_500_000,
          spanCount: 5,
          serviceCount: 2,
          errorSpanCount: 0,
        },
      ])
      .mockResolvedValue([])

    mockFetchDataSourceTraceServiceGraph.mockResolvedValue({
      nodes: [
        {
          serviceName: 'api',
          requestCount: 3,
          errorCount: 0,
          errorRate: 0,
          averageDurationNano: 1_000_000,
        },
      ],
      edges: [],
      totalRequests: 3,
      totalErrorCount: 0,
    })

    const wrapper = mount(ExploreTraces)
    await findSearchButton(wrapper).trigger('click')
    await flushPromises()

    await findTraceResultRows(wrapper)[0].trigger('click')
    await flushPromises()

    await wrapper.find('.mock-select-service').trigger('click')
    await flushPromises()

    expect(mockSearchDataSourceTraces).toHaveBeenLastCalledWith(
      'ds-trace-1',
      expect.objectContaining({ service: 'api' }),
    )
  })

  it('shows an error when trace search fails', async () => {
    mockSearchDataSourceTraces.mockRejectedValue(new Error('search failed'))

    const wrapper = mount(ExploreTraces)
    await findSearchButton(wrapper).trigger('click')
    await flushPromises()

    expect(findError(wrapper).exists()).toBe(true)
    expect(findError(wrapper).text()).toContain('search failed')
  })

  it('auto-loads trace from dashboard navigation context', async () => {
    localStorage.setItem('dashboard_trace_navigation', JSON.stringify({
      datasourceId: 'ds-trace-1',
      traceId: 'trace-from-dashboard',
      createdAt: Date.now(),
    }))

    const wrapper = mount(ExploreTraces)
    await flushPromises()

    expect(mockFetchDataSourceTrace).toHaveBeenCalledWith('ds-trace-1', 'trace-from-dashboard')
    expect(mockFetchDataSourceTraceServiceGraph).toHaveBeenCalledWith('ds-trace-1', 'trace-from-dashboard')
    expect((wrapper.get('#trace-id-input').element as HTMLInputElement).value).toBe('trace-from-dashboard')
    expect(localStorage.getItem('dashboard_trace_navigation')).toBeNull()
  })

  it('navigates to Explore Logs with selected span trace context', async () => {
    mockSearchDataSourceTraces.mockResolvedValue([
      {
        traceId: 'trace-abc',
        rootServiceName: 'api',
        rootOperationName: 'GET /health',
        startTimeUnixNano: 1_700_000_000_000_000_000,
        durationNano: 1_500_000,
        spanCount: 5,
        serviceCount: 2,
        errorSpanCount: 0,
      },
    ])
    mockFetchDataSourceTrace.mockResolvedValue({
      traceId: 'trace-abc',
      spans: [
        {
          spanId: 'span-1',
          operationName: 'GET /health',
          serviceName: 'api',
          startTimeUnixNano: 1_700_000_000_000_000_000,
          durationNano: 1_500_000,
        },
      ],
      services: ['api'],
      startTimeUnixNano: 1_700_000_000_000_000_000,
      durationNano: 1_500_000,
    })

    const wrapper = mount(ExploreTraces)
    await findSearchButton(wrapper).trigger('click')
    await flushPromises()

    await findTraceResultRows(wrapper)[0].trigger('click')
    await flushPromises()

    await wrapper.find('.mock-select-span').trigger('click')
    await flushPromises()

    const logsButton = wrapper
      .findAll('button')
      .find((button) => button.text() === 'View Logs')
    expect(logsButton).toBeTruthy()

    if (!logsButton) {
      throw new Error('Expected View Logs action button to be present')
    }

    await logsButton.trigger('click')

    expect(mockRouterPush).toHaveBeenCalledWith('/explore/logs')
    expect(JSON.parse(localStorage.getItem('trace_logs_navigation') || '{}')).toMatchObject({
      traceId: 'trace-abc',
      serviceName: 'api',
    })
  })

  it('navigates to Explore Metrics with selected span service context', async () => {
    mockSearchDataSourceTraces.mockResolvedValue([
      {
        traceId: 'trace-abc',
        rootServiceName: 'api',
        rootOperationName: 'GET /health',
        startTimeUnixNano: 1_700_000_000_000_000_000,
        durationNano: 1_500_000,
        spanCount: 5,
        serviceCount: 2,
        errorSpanCount: 0,
      },
    ])
    mockFetchDataSourceTrace.mockResolvedValue({
      traceId: 'trace-abc',
      spans: [
        {
          spanId: 'span-1',
          operationName: 'GET /health',
          serviceName: 'api',
          startTimeUnixNano: 1_700_000_000_000_000_000,
          durationNano: 1_500_000,
        },
      ],
      services: ['api'],
      startTimeUnixNano: 1_700_000_000_000_000_000,
      durationNano: 1_500_000,
    })

    const wrapper = mount(ExploreTraces)
    await findSearchButton(wrapper).trigger('click')
    await flushPromises()

    await findTraceResultRows(wrapper)[0].trigger('click')
    await flushPromises()

    await wrapper.find('.mock-select-span').trigger('click')
    await flushPromises()

    const metricsButton = wrapper
      .findAll('button')
      .find((button) => button.text() === 'View Service Metrics')
    expect(metricsButton).toBeTruthy()

    if (!metricsButton) {
      throw new Error('Expected View Service Metrics action button to be present')
    }

    await metricsButton.trigger('click')

    expect(mockRouterPush).toHaveBeenCalledWith('/explore/metrics')
    expect(JSON.parse(localStorage.getItem('trace_metrics_navigation') || '{}')).toMatchObject({
      serviceName: 'api',
    })
  })

  it('uses ClickHouse SQL editor and renders TraceListPanel for clickhouse datasource', async () => {
    mockQueryDataSource.mockResolvedValue({
      status: 'success',
      resultType: 'traces',
      data: {
        traces: [
          {
            spanId: 'span-1',
            operationName: 'GET /checkout',
            serviceName: 'api',
            startTimeUnixNano: 1_700_000_000_000_000_000,
            durationNano: 2_000_000,
            tags: { trace_id: 'trace-1' },
          },
          {
            spanId: 'span-2',
            parentSpanId: 'span-1',
            operationName: 'SELECT cart',
            serviceName: 'db',
            startTimeUnixNano: 1_700_000_000_001_000_000,
            durationNano: 500_000,
            tags: { trace_id: 'trace-1' },
          },
          {
            spanId: 'span-3',
            operationName: 'POST /payment',
            serviceName: 'payments',
            startTimeUnixNano: 1_700_000_100_000_000_000,
            durationNano: 1_500_000,
            tags: { trace_id: 'trace-2' },
          },
        ],
      },
    })

    const wrapper = mount(ExploreTraces)
    await flushPromises()

    await findDatasourceTrigger(wrapper).trigger('click')
    const options = findDatasourceOptions(wrapper)
    await options[1].trigger('click')
    await flushPromises()

    expect(wrapper.findComponent({ name: 'ClickHouseSQLEditor' }).exists()).toBe(true)

    await wrapper.find('#clickhouse-query').setValue('SELECT * FROM traces LIMIT 200')
    await findSearchButton(wrapper).trigger('click')
    await flushPromises()

    expect(mockQueryDataSource).toHaveBeenLastCalledWith(
      'ds-trace-2',
      expect.objectContaining({
        query: 'SELECT * FROM traces LIMIT 200',
        signal: 'traces',
      }),
    )
    expect(wrapper.find('.mock-trace-list-panel').text()).toContain('2 traces')
  })
})
