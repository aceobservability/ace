import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import Explore from './Explore.vue'

const mockFetchDatasources = vi.hoisted(() => vi.fn())
const mockQueryDataSource = vi.hoisted(() => vi.fn())
const mockSetCustomRange = vi.hoisted(() => vi.fn())

vi.mock('../components/TimeRangePicker.vue', () => ({
  default: {
    name: 'TimeRangePicker',
    template: '<div class="mock-time-range-picker">TimeRangePicker Mock</div>'
  }
}))

vi.mock('../components/LineChart.vue', () => ({
  default: {
    name: 'LineChart',
    props: ['series', 'height'],
    template: '<div class="mock-line-chart">LineChart Mock</div>'
  }
}))

vi.mock('../components/QueryBuilder.vue', () => ({
  default: {
    name: 'QueryBuilder',
    props: ['modelValue', 'disabled'],
    emits: ['update:modelValue'],
    template: `
      <textarea
        id="promql-query-input"
        :value="modelValue"
        :disabled="disabled"
        @input="$emit('update:modelValue', $event.target.value)"
      ></textarea>
    `
  }
}))

vi.mock('../components/ClickHouseSQLEditor.vue', () => ({
  default: {
    name: 'ClickHouseSQLEditor',
    props: ['modelValue', 'signal', 'disabled'],
    emits: ['update:modelValue'],
    template: `
      <textarea
        id="clickhouse-query"
        class="clickhouse-query-input"
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
        class="cloudwatch-query-input"
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
        class="elasticsearch-query-input"
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

  const metricsDatasources = ref([
    {
      id: 'ds-1',
      organization_id: 'org-1',
      name: 'Prometheus Main',
      type: 'prometheus',
      url: 'http://localhost:9090',
      is_default: true,
      auth_type: 'none',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'ds-2',
      organization_id: 'org-1',
      name: 'ClickHouse Metrics',
      type: 'clickhouse',
      url: 'http://localhost:8123',
      is_default: false,
      auth_type: 'none',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'ds-3',
      organization_id: 'org-1',
      name: 'CloudWatch Metrics',
      type: 'cloudwatch',
      url: 'https://monitoring.us-east-1.amazonaws.com',
      is_default: false,
      auth_type: 'none',
      auth_config: { region: 'us-east-1' },
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'ds-4',
      organization_id: 'org-1',
      name: 'Elasticsearch Metrics',
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
      metricsDatasources,
      fetchDatasources: mockFetchDatasources,
    })
  }
})

vi.mock('../api/datasources', () => ({
  queryDataSource: mockQueryDataSource,
}))

vi.mock('../composables/useProm', () => ({
  transformToChartData: vi.fn(),
  fetchMetrics: vi.fn().mockResolvedValue([]),
  fetchLabels: vi.fn().mockResolvedValue([]),
  fetchLabelValues: vi.fn().mockResolvedValue([]),
}))

import { transformToChartData } from '../composables/useProm'

describe('Explore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    mockSetCustomRange.mockReset()
    mockFetchDatasources.mockResolvedValue(undefined)
    mockQueryDataSource.mockResolvedValue({
      status: 'success',
      resultType: 'metrics',
      data: {
        resultType: 'matrix',
        result: [],
      },
    })
  })

  it('renders metrics explore page and card selector', async () => {
    const wrapper = mount(Explore)
    await flushPromises()

    expect(wrapper.find('.explore-header h1').text()).toBe('Explore')
    expect(wrapper.find('.mode-badge').text()).toBe('Metrics')
    expect(wrapper.find('.active-datasource-panel').exists()).toBe(true)
    expect(wrapper.find('.active-datasource-name').text()).toContain('Prometheus Main')
    expect(wrapper.find('.active-datasource-logo').attributes('alt')).toContain('Prometheus logo')
    expect(wrapper.find('.source-health-badge').text()).toContain('Healthy')
    expect(wrapper.find('.datasource-selector').exists()).toBe(true)
    expect(wrapper.find('.mock-time-range-picker').exists()).toBe(true)

    await wrapper.find('.datasource-trigger').trigger('click')
    expect(wrapper.find('.datasource-dropdown').exists()).toBe(true)
    expect(wrapper.find('.datasource-option').text()).toContain('Prometheus Main')

    expect(mockFetchDatasources).toHaveBeenCalledWith('org-1')
  })

  it('disables Run Query button when query is empty', () => {
    const wrapper = mount(Explore)
    const runButton = wrapper.find('.btn-run')

    expect(runButton.attributes('disabled')).toBeDefined()
  })

  it('enables Run Query button when query is entered', async () => {
    const wrapper = mount(Explore)
    await wrapper.find('#promql-query-input').setValue('up')

    const runButton = wrapper.find('.btn-run')
    expect(runButton.attributes('disabled')).toBeUndefined()
  })

  it('executes metrics query with selected datasource', async () => {
    mockQueryDataSource.mockResolvedValue({
      status: 'success',
      resultType: 'metrics',
      data: {
        resultType: 'matrix',
        result: [
          {
            metric: { __name__: 'up' },
            values: [[1609459200, '1']]
          }
        ]
      },
    })

    vi.mocked(transformToChartData).mockReturnValue({
      series: [{
        name: 'up',
        data: [{ timestamp: 1609459200, value: 1 }],
        labels: { __name__: 'up' }
      }]
    })

    const wrapper = mount(Explore)
    await wrapper.find('#promql-query-input').setValue('up')

    await wrapper.find('.btn-run').trigger('click')
    await flushPromises()

    expect(mockQueryDataSource).toHaveBeenCalledWith(
      'ds-1',
      expect.objectContaining({
        query: 'up',
      })
    )
    expect(wrapper.find('.mock-line-chart').exists()).toBe(true)
    expect(wrapper.find('.result-count').text()).toContain('1 series')
  })

  it('shows error message when query response fails', async () => {
    mockQueryDataSource.mockResolvedValue({
      status: 'error',
      resultType: 'metrics',
      error: 'invalid query',
    })

    const wrapper = mount(Explore)
    await wrapper.find('#promql-query-input').setValue('invalid{')

    await wrapper.find('.btn-run').trigger('click')
    await flushPromises()

    expect(wrapper.find('.query-error').exists()).toBe(true)
    expect(wrapper.find('.query-error').text()).toContain('invalid query')
  })

  it('stores successful queries in session history', async () => {
    mockQueryDataSource.mockResolvedValue({
      status: 'success',
      resultType: 'metrics',
      data: {
        resultType: 'matrix',
        result: []
      },
    })

    vi.mocked(transformToChartData).mockReturnValue({ series: [] })

    const wrapper = mount(Explore)
    await wrapper.find('#promql-query-input').setValue('up')

    await wrapper.find('.btn-run').trigger('click')
    await flushPromises()

    const history = JSON.parse(sessionStorage.getItem('explore_query_history') || '[]')
    expect(history).toContain('up')
  })

  it('prefills service query and time range from trace-to-metrics context', async () => {
    localStorage.setItem('trace_metrics_navigation', JSON.stringify({
      serviceName: 'payments',
      startMs: 1_700_000_000_000,
      endMs: 1_700_000_300_000,
      createdAt: Date.now(),
    }))

    const wrapper = mount(Explore)
    await flushPromises()

    expect((wrapper.find('#promql-query-input').element as HTMLTextAreaElement).value).toContain(
      'service="payments"',
    )
    expect(mockSetCustomRange).toHaveBeenCalledWith(1_700_000_000_000, 1_700_000_300_000)
    expect(localStorage.getItem('trace_metrics_navigation')).toBeNull()
  })

  it('uses ClickHouse SQL editor and sends metrics signal for clickhouse datasource', async () => {
    mockQueryDataSource.mockResolvedValue({
      status: 'success',
      resultType: 'metrics',
      data: {
        resultType: 'matrix',
        result: [],
      },
    })
    vi.mocked(transformToChartData).mockReturnValue({ series: [] })

    const wrapper = mount(Explore)
    await flushPromises()

    await wrapper.find('.datasource-trigger').trigger('click')
    const options = wrapper.findAll('.datasource-option')
    await options[1].trigger('click')
    await flushPromises()

    expect(wrapper.findComponent({ name: 'ClickHouseSQLEditor' }).exists()).toBe(true)

    await wrapper.find('#clickhouse-query').setValue('SELECT timestamp, value, metric FROM metrics LIMIT 20')
    await wrapper.find('.btn-run').trigger('click')
    await flushPromises()

    expect(mockQueryDataSource).toHaveBeenLastCalledWith(
      'ds-2',
      expect.objectContaining({
        query: 'SELECT timestamp, value, metric FROM metrics LIMIT 20',
        signal: 'metrics',
      }),
    )
  })

  it('uses CloudWatch editor and sends metrics signal for cloudwatch datasource', async () => {
    mockQueryDataSource.mockResolvedValue({
      status: 'success',
      resultType: 'metrics',
      data: {
        resultType: 'matrix',
        result: [],
      },
    })
    vi.mocked(transformToChartData).mockReturnValue({ series: [] })

    const wrapper = mount(Explore)
    await flushPromises()

    await wrapper.find('.datasource-trigger').trigger('click')
    const options = wrapper.findAll('.datasource-option')
    await options[2].trigger('click')
    await flushPromises()

    expect(wrapper.findComponent({ name: 'CloudWatchQueryEditor' }).exists()).toBe(true)

    await wrapper.find('#cloudwatch-query').setValue('{"namespace":"AWS/EC2","metric_name":"CPUUtilization"}')
    await wrapper.find('.btn-run').trigger('click')
    await flushPromises()

    expect(mockQueryDataSource).toHaveBeenLastCalledWith(
      'ds-3',
      expect.objectContaining({
        signal: 'metrics',
      }),
    )
  })

  it('uses Elasticsearch editor and sends metrics signal for elasticsearch datasource', async () => {
    mockQueryDataSource.mockResolvedValue({
      status: 'success',
      resultType: 'metrics',
      data: {
        resultType: 'matrix',
        result: [],
      },
    })
    vi.mocked(transformToChartData).mockReturnValue({ series: [] })

    const wrapper = mount(Explore)
    await flushPromises()

    await wrapper.find('.datasource-trigger').trigger('click')
    const options = wrapper.findAll('.datasource-option')
    await options[3].trigger('click')
    await flushPromises()

    expect(wrapper.findComponent({ name: 'ElasticsearchQueryEditor' }).exists()).toBe(true)

    await wrapper.find('#elasticsearch-query').setValue('service.name:"api"')
    await wrapper.find('.btn-run').trigger('click')
    await flushPromises()

    expect(mockQueryDataSource).toHaveBeenLastCalledWith(
      'ds-4',
      expect.objectContaining({
        signal: 'metrics',
      }),
    )
  })
})
