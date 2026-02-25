import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ExploreLogs from './ExploreLogs.vue'

const mockFetchDatasources = vi.hoisted(() => vi.fn())
const mockQueryDataSource = vi.hoisted(() => vi.fn())
const mockFetchDataSourceLabels = vi.hoisted(() => vi.fn())
const mockStreamDataSourceLogs = vi.hoisted(() => vi.fn())
const mockSetCustomRange = vi.hoisted(() => vi.fn())

vi.mock('../components/TimeRangePicker.vue', () => ({
  default: {
    name: 'TimeRangePicker',
    template: '<div class="mock-time-range-picker">TimeRangePicker Mock</div>'
  }
}))

vi.mock('../components/LogViewer.vue', () => ({
  default: {
    name: 'LogViewer',
    props: ['logs', 'highlightedLogKeys'],
    template: '<div class="mock-log-viewer">{{ logs.length }} logs</div>'
  }
}))

vi.mock('../components/MonacoQueryEditor.vue', () => ({
  default: {
    name: 'MonacoQueryEditor',
    props: ['modelValue', 'disabled', 'height', 'placeholder', 'language', 'indexedLabels'],
    emits: ['update:modelValue', 'submit'],
    template: `
      <textarea
        class="query-input"
        :value="modelValue"
        :disabled="disabled"
        :placeholder="placeholder"
        @input="$emit('update:modelValue', $event.target.value)"
      ></textarea>
    `,
  },
}))

vi.mock('../components/LogQLQueryBuilder.vue', () => ({
  default: {
    name: 'LogQLQueryBuilder',
    props: ['modelValue', 'disabled', 'indexedLabels', 'datasourceId', 'editorHeight', 'placeholder', 'queryLanguage'],
    emits: ['update:modelValue', 'submit'],
    template: `
      <textarea
        class="query-input"
        :value="modelValue"
        :disabled="disabled"
        :placeholder="placeholder"
        @input="$emit('update:modelValue', $event.target.value)"
      ></textarea>
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
        class="query-input clickhouse-query-input"
        :value="modelValue"
        :disabled="disabled"
        @input="$emit('update:modelValue', $event.target.value)"
      ></textarea>
    `,
  },
}))

vi.mock('../components/CloudWatchQueryEditor.vue', () => ({
  default: {
    name: 'CloudWatchQueryEditor',
    props: ['modelValue', 'signal', 'disabled'],
    emits: ['update:modelValue'],
    template: `
      <textarea
        id="cloudwatch-query"
        class="query-input cloudwatch-query-input"
        :value="modelValue"
        :disabled="disabled"
        @input="$emit('update:modelValue', $event.target.value)"
      ></textarea>
    `,
  },
}))

vi.mock('../components/ElasticsearchQueryEditor.vue', () => ({
  default: {
    name: 'ElasticsearchQueryEditor',
    props: ['modelValue', 'signal', 'disabled'],
    emits: ['update:modelValue'],
    template: `
      <textarea
        id="elasticsearch-query"
        class="query-input elasticsearch-query-input"
        :value="modelValue"
        :disabled="disabled"
        @input="$emit('update:modelValue', $event.target.value)"
      ></textarea>
    `,
  },
}))

vi.mock('../composables/useTimeRange', () => ({
  useTimeRange: () => ({
    timeRange: { value: { start: Date.now() - 3600000, end: Date.now() } },
    onRefresh: vi.fn(() => () => {}),
    setCustomRange: mockSetCustomRange,
  })
}))

vi.mock('../composables/useOrganization', async () => {
  const { ref } = await import('vue')
  return {
    useOrganization: () => ({
      currentOrg: ref({ id: 'org-1', name: 'Test Org', role: 'admin' })
    })
  }
})

vi.mock('../composables/useDatasource', async () => {
  const { ref } = await import('vue')

  const logsDatasources = ref([
    {
      id: 'ds-1',
      organization_id: 'org-1',
      name: 'Loki Main',
      type: 'loki',
      url: 'http://localhost:3100',
      is_default: true,
      auth_type: 'none',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'ds-2',
      organization_id: 'org-1',
      name: 'Victoria Logs Main',
      type: 'victorialogs',
      url: 'http://localhost:9428',
      is_default: false,
      auth_type: 'none',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'ds-3',
      organization_id: 'org-1',
      name: 'ClickHouse Logs',
      type: 'clickhouse',
      url: 'http://localhost:8123',
      is_default: false,
      auth_type: 'none',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'ds-4',
      organization_id: 'org-1',
      name: 'CloudWatch Logs',
      type: 'cloudwatch',
      url: 'https://monitoring.us-east-1.amazonaws.com',
      is_default: false,
      auth_type: 'none',
      auth_config: { region: 'us-east-1', log_group: '/aws/lambda/test' },
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'ds-5',
      organization_id: 'org-1',
      name: 'Elasticsearch Logs',
      type: 'elasticsearch',
      url: 'http://localhost:9200',
      is_default: false,
      auth_type: 'none',
      auth_config: { index: 'logs-*' },
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ])

  return {
    useDatasource: () => ({
      logsDatasources,
      fetchDatasources: mockFetchDatasources,
    })
  }
})

vi.mock('../api/datasources', () => ({
  queryDataSource: mockQueryDataSource,
  fetchDataSourceLabels: mockFetchDataSourceLabels,
  streamDataSourceLogs: mockStreamDataSourceLogs,
}))

/** Find the datasource trigger button */
function findDatasourceTrigger(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('button').find((b) => b.attributes('title')?.includes('Active datasource'))!
}

/** Find datasource dropdown options */
function findDatasourceOptions(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('.absolute button')
}

/** Find the Run Query button */
function findRunButton(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('button').find((b) => b.text().includes('Run Query') || b.text().includes('Running'))!
}

/** Find the Live button */
function findLiveButton(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('button').find((b) => b.text().includes('Start Live') || b.text().includes('Stop Live'))!
}

/** Find error display (use rounded-xl to distinguish from the health badge which uses rounded-full) */
function findError(wrapper: ReturnType<typeof mount>) {
  return wrapper.find('.rounded-xl.text-rose-700')
}

describe('ExploreLogs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    mockSetCustomRange.mockReset()
    mockFetchDatasources.mockResolvedValue(undefined)
    mockFetchDataSourceLabels.mockResolvedValue(['service_name', 'container_id'])
    mockStreamDataSourceLogs.mockResolvedValue(undefined)
    mockQueryDataSource.mockResolvedValue({
      status: 'success',
      resultType: 'logs',
      data: {
        resultType: 'streams',
        logs: [],
      },
    })
  })

  it('renders logs explore page and card selector', async () => {
    const wrapper = mount(ExploreLogs)
    await flushPromises()

    expect(wrapper.find('h1').text()).toBe('Explore')
    expect(wrapper.text()).toContain('Logs')
    const trigger = findDatasourceTrigger(wrapper)
    expect(trigger).toBeDefined()
    expect(wrapper.text()).toContain('Loki Main')
    expect(wrapper.text()).toContain('Healthy')

    await trigger.trigger('click')
    const options = findDatasourceOptions(wrapper)
    expect(options.length).toBeGreaterThan(0)
    expect(options[0].text()).toContain('Loki Main')

    expect(wrapper.find('.mock-time-range-picker').exists()).toBe(true)
    expect(mockFetchDatasources).toHaveBeenCalledWith('org-1')
  })

  it('executes log query and renders results', async () => {
    mockQueryDataSource.mockResolvedValue({
      status: 'success',
      resultType: 'logs',
      data: {
        resultType: 'streams',
        logs: [
          {
            timestamp: '2026-01-01T00:00:00Z',
            line: 'hello world',
            level: 'info',
            labels: { job: 'api' },
          },
        ],
      },
    })

    const wrapper = mount(ExploreLogs)
    await wrapper.find('.query-input').setValue('{job=~".+"}')

    await findRunButton(wrapper).trigger('click')
    await flushPromises()

    expect(mockQueryDataSource).toHaveBeenCalledWith(
      'ds-1',
      expect.objectContaining({
        query: '{job=~".+"}',
        step: 15,
        limit: 1000,
      })
    )
    expect(wrapper.find('.mock-log-viewer').exists()).toBe(true)
    expect(wrapper.find('.mock-log-viewer').text()).toContain('1 logs')
  })

  it('passes logs to viewer in newest-first order', async () => {
    mockQueryDataSource.mockResolvedValue({
      status: 'success',
      resultType: 'logs',
      data: {
        resultType: 'streams',
        logs: [
          {
            timestamp: '2026-01-01T00:00:00Z',
            line: 'older',
            level: 'info',
            labels: {},
          },
          {
            timestamp: '2026-01-01T00:00:02Z',
            line: 'newest',
            level: 'info',
            labels: {},
          },
          {
            timestamp: '2026-01-01T00:00:01Z',
            line: 'middle',
            level: 'info',
            labels: {},
          },
        ],
      },
    })

    const wrapper = mount(ExploreLogs)
    await wrapper.find('.query-input').setValue('{job=~".+"}')

    await findRunButton(wrapper).trigger('click')
    await flushPromises()

    const viewerLogs = wrapper.findComponent({ name: 'LogViewer' }).props('logs') as Array<{ timestamp: string, line: string }>
    expect(viewerLogs.map(log => log.line)).toEqual(['newest', 'middle', 'older'])
  })

  it('shows an error message when query response fails', async () => {
    mockQueryDataSource.mockResolvedValue({
      status: 'error',
      resultType: 'logs',
      error: 'invalid log query',
    })

    const wrapper = mount(ExploreLogs)
    await wrapper.find('.query-input').setValue('{broken')

    await findRunButton(wrapper).trigger('click')
    await flushPromises()

    expect(findError(wrapper).exists()).toBe(true)
    expect(findError(wrapper).text()).toContain('invalid log query')
  })

  it('disables Run Query button when query is empty', () => {
    const wrapper = mount(ExploreLogs)
    const runButton = findRunButton(wrapper)

    expect(runButton.attributes('disabled')).toBeDefined()
  })

  it('stores successful queries in session history', async () => {
    mockQueryDataSource.mockResolvedValue({
      status: 'success',
      resultType: 'logs',
      data: {
        resultType: 'streams',
        logs: [],
      },
    })

    const wrapper = mount(ExploreLogs)
    await wrapper.find('.query-input').setValue('{app="api"}')

    await findRunButton(wrapper).trigger('click')
    await flushPromises()

    const history = JSON.parse(sessionStorage.getItem('explore_logs_query_history') || '[]')
    expect(history).toContain('{app="api"}')
  })

  it('switches editor language between LogQL and LogsQL by datasource type', async () => {
    const wrapper = mount(ExploreLogs)
    await flushPromises()

    expect(wrapper.findComponent({ name: 'LogQLQueryBuilder' }).props('queryLanguage')).toBe('logql')

    await findDatasourceTrigger(wrapper).trigger('click')
    const options = findDatasourceOptions(wrapper)
    await options[1].trigger('click')
    await flushPromises()

    expect(wrapper.findComponent({ name: 'LogQLQueryBuilder' }).props('queryLanguage')).toBe('logsql')
  })

  it('uses ClickHouse SQL editor and passes logs signal for clickhouse datasource', async () => {
    mockQueryDataSource.mockResolvedValue({
      status: 'success',
      resultType: 'logs',
      data: {
        resultType: 'streams',
        logs: [],
      },
    })

    const wrapper = mount(ExploreLogs)
    await flushPromises()

    await findDatasourceTrigger(wrapper).trigger('click')
    const options = findDatasourceOptions(wrapper)
    await options[2].trigger('click')
    await flushPromises()

    expect(wrapper.findComponent({ name: 'ClickHouseSQLEditor' }).exists()).toBe(true)
    expect(findLiveButton(wrapper).attributes('disabled')).toBeDefined()

    await wrapper.find('#clickhouse-query').setValue('SELECT timestamp, message FROM logs LIMIT 10')
    await findRunButton(wrapper).trigger('click')
    await flushPromises()

    expect(mockQueryDataSource).toHaveBeenLastCalledWith(
      'ds-3',
      expect.objectContaining({
        query: 'SELECT timestamp, message FROM logs LIMIT 10',
        signal: 'logs',
      }),
    )
  })

  it('passes indexed labels to the LogQL builder', async () => {
    const wrapper = mount(ExploreLogs)
    await flushPromises()

    const queryBuilder = wrapper.findComponent({ name: 'LogQLQueryBuilder' })
    expect(mockFetchDataSourceLabels).toHaveBeenCalledWith('ds-1')
    expect(queryBuilder.props('indexedLabels')).toEqual(['service_name', 'container_id'])
  })

  it('prefills query and time range from trace-to-logs context', async () => {
    localStorage.setItem('trace_logs_navigation', JSON.stringify({
      traceId: 'trace-abc-123',
      serviceName: 'checkout',
      startMs: 1_700_000_000_000,
      endMs: 1_700_000_300_000,
      createdAt: Date.now(),
    }))

    const wrapper = mount(ExploreLogs)
    await flushPromises()

    expect((wrapper.find('.query-input').element as HTMLTextAreaElement).value).toBe(
      '{service_name="checkout"} |= "trace-abc-123"',
    )
    expect(mockSetCustomRange).toHaveBeenCalledWith(1_700_000_000_000, 1_700_000_300_000)
    expect(localStorage.getItem('trace_logs_navigation')).toBeNull()
  })

  it('uses CloudWatch editor and passes logs signal for cloudwatch datasource', async () => {
    const wrapper = mount(ExploreLogs)
    await flushPromises()

    await findDatasourceTrigger(wrapper).trigger('click')
    const options = findDatasourceOptions(wrapper)
    await options[3].trigger('click')
    await flushPromises()

    expect(wrapper.findComponent({ name: 'CloudWatchQueryEditor' }).exists()).toBe(true)

    await wrapper.find('#cloudwatch-query').setValue('fields @timestamp, @message | limit 5')
    await findRunButton(wrapper).trigger('click')
    await flushPromises()

    expect(mockQueryDataSource).toHaveBeenLastCalledWith(
      'ds-4',
      expect.objectContaining({
        signal: 'logs',
      }),
    )
  })

  it('uses Elasticsearch editor and passes logs signal for elasticsearch datasource', async () => {
    const wrapper = mount(ExploreLogs)
    await flushPromises()

    await findDatasourceTrigger(wrapper).trigger('click')
    const options = findDatasourceOptions(wrapper)
    await options[4].trigger('click')
    await flushPromises()

    expect(wrapper.findComponent({ name: 'ElasticsearchQueryEditor' }).exists()).toBe(true)
    expect(findLiveButton(wrapper).attributes('disabled')).toBeDefined()

    await wrapper.find('#elasticsearch-query').setValue('service.name:"api" AND level:error')
    await findRunButton(wrapper).trigger('click')
    await flushPromises()

    expect(mockQueryDataSource).toHaveBeenLastCalledWith(
      'ds-5',
      expect.objectContaining({
        signal: 'logs',
      }),
    )
  })
})
