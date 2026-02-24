import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import PanelEditModal from './PanelEditModal.vue'
import * as api from '../api/panels'

const mockFetchDatasources = vi.hoisted(() => vi.fn())

vi.mock('../api/panels')
vi.mock('../composables/useDatasource', async () => {
  const { ref } = await import('vue')

  return {
    useDatasource: () => ({
      datasources: ref([
        {
          id: 'ds-metrics-1',
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
          id: 'ds-trace-1',
          organization_id: 'org-1',
          name: 'Tempo Main',
          type: 'tempo',
          url: 'http://localhost:3200',
          is_default: false,
          auth_type: 'none',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'ds-clickhouse-1',
          organization_id: 'org-1',
          name: 'ClickHouse Main',
          type: 'clickhouse',
          url: 'http://localhost:8123',
          is_default: false,
          auth_type: 'none',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'ds-cloudwatch-1',
          organization_id: 'org-1',
          name: 'CloudWatch Main',
          type: 'cloudwatch',
          url: 'https://monitoring.us-east-1.amazonaws.com',
          is_default: false,
          auth_type: 'none',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'ds-elasticsearch-1',
          organization_id: 'org-1',
          name: 'Elasticsearch Main',
          type: 'elasticsearch',
          url: 'http://localhost:9200',
          is_default: false,
          auth_type: 'none',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ]),
      fetchDatasources: mockFetchDatasources,
    }),
  }
})

vi.mock('../composables/useOrganization', async () => {
  const { ref } = await import('vue')

  return {
    useOrganization: () => ({
      currentOrg: ref({ id: 'org-1' }),
    }),
  }
})

vi.mock('../composables/useProm', () => ({
  queryPrometheus: vi.fn(),
  fetchMetrics: vi.fn().mockResolvedValue([]),
  fetchLabels: vi.fn().mockResolvedValue([]),
  fetchLabelValues: vi.fn().mockResolvedValue([])
}))

// Mock MonacoQueryEditor component (Monaco doesn't work in test environment)
vi.mock('./MonacoQueryEditor.vue', () => ({
  default: {
    name: 'MonacoQueryEditor',
    template: '<div class="mock-monaco-editor"><textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"></textarea></div>',
    props: ['modelValue', 'disabled', 'height', 'placeholder'],
    emits: ['update:modelValue', 'submit']
  }
}))

vi.mock('./CloudWatchQueryEditor.vue', () => ({
  default: {
    name: 'CloudWatchQueryEditor',
    props: ['modelValue', 'signal', 'disabled'],
    emits: ['update:modelValue', 'update:signal'],
    template: `
      <div class="mock-cloudwatch-editor">
        <select id="cloudwatch-signal" :value="signal" @change="$emit('update:signal', $event.target.value)">
          <option value="metrics">metrics</option>
          <option value="logs">logs</option>
        </select>
        <textarea id="cloudwatch-query" :value="modelValue" @input="$emit('update:modelValue', $event.target.value)"></textarea>
      </div>
    `,
  },
}))

vi.mock('./ElasticsearchQueryEditor.vue', () => ({
  default: {
    name: 'ElasticsearchQueryEditor',
    props: ['modelValue', 'signal', 'disabled'],
    emits: ['update:modelValue', 'update:signal'],
    template: `
      <div class="mock-elasticsearch-editor">
        <select id="elasticsearch-signal" :value="signal" @change="$emit('update:signal', $event.target.value)">
          <option value="metrics">metrics</option>
          <option value="logs">logs</option>
        </select>
        <textarea id="elasticsearch-query" :value="modelValue" @input="$emit('update:modelValue', $event.target.value)"></textarea>
      </div>
    `,
  },
}))

describe('PanelEditModal', () => {
  const dashboardId = 'dashboard-123'

  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchDatasources.mockResolvedValue(undefined)
  })

  it('renders form fields', async () => {
    const wrapper = mount(PanelEditModal, {
      props: { dashboardId }
    })
    await flushPromises()
    expect(wrapper.find('input#title').exists()).toBe(true)
    expect(wrapper.find('select#type').exists()).toBe(true)
    // QueryBuilder component is now used
    expect(wrapper.findComponent({ name: 'QueryBuilder' }).exists()).toBe(true)
  })

  it('shows "Add Panel" title when creating new panel', () => {
    const wrapper = mount(PanelEditModal, {
      props: { dashboardId }
    })
    expect(wrapper.find('.modal-header h2').text()).toBe('Add Panel')
  })

  it('shows "Edit Panel" title when editing existing panel', () => {
    const wrapper = mount(PanelEditModal, {
      props: {
        dashboardId,
        panel: {
          id: '1',
          dashboard_id: dashboardId,
          title: 'Existing Panel',
          type: 'line_chart',
          grid_pos: { x: 0, y: 0, w: 6, h: 4 },
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z'
        }
      }
    })
    expect(wrapper.find('.modal-header h2').text()).toBe('Edit Panel')
  })

  it('emits close event when cancel is clicked', async () => {
    const wrapper = mount(PanelEditModal, {
      props: { dashboardId }
    })
    await wrapper.findAll('button').find(b => b.text() === 'Cancel')?.trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('shows error when title is empty', async () => {
    const wrapper = mount(PanelEditModal, {
      props: { dashboardId }
    })
    await wrapper.find('form').trigger('submit')
    expect(wrapper.text()).toContain('Title is required')
  })

  it('saves panel with PromQL query from QueryBuilder', async () => {
    vi.mocked(api.createPanel).mockResolvedValue({
      id: '123',
      dashboard_id: dashboardId,
      title: 'Panel with Query',
      type: 'line_chart',
      grid_pos: { x: 0, y: 0, w: 6, h: 4 },
      query: { promql: 'up' },
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    })

    const wrapper = mount(PanelEditModal, {
      props: { dashboardId }
    })
    await flushPromises()
    await wrapper.find('input#title').setValue('Panel with Query')

    // Simulate QueryBuilder emitting an update
    const queryBuilder = wrapper.findComponent({ name: 'QueryBuilder' })
    await queryBuilder.vm.$emit('update:modelValue', 'up')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(api.createPanel).toHaveBeenCalledWith(dashboardId, {
      title: 'Panel with Query',
      type: 'line_chart',
      grid_pos: { x: 0, y: 0, w: 6, h: 4 },
      query: { promql: 'up' }
    })
  })

  it('calls createPanel API on submit when creating', async () => {
    vi.mocked(api.createPanel).mockResolvedValue({
      id: '123',
      dashboard_id: dashboardId,
      title: 'New Panel',
      type: 'line_chart',
      grid_pos: { x: 0, y: 0, w: 6, h: 4 },
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    })

    const wrapper = mount(PanelEditModal, {
      props: { dashboardId }
    })
    await wrapper.find('input#title').setValue('New Panel')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(api.createPanel).toHaveBeenCalledWith(dashboardId, {
      title: 'New Panel',
      type: 'line_chart',
      grid_pos: { x: 0, y: 0, w: 6, h: 4 },
      query: undefined
    })
    expect(wrapper.emitted('saved')).toBeTruthy()
  })

  it('calls updatePanel API on submit when editing', async () => {
    const existingPanel = {
      id: '1',
      dashboard_id: dashboardId,
      title: 'Existing Panel',
      type: 'line_chart',
      grid_pos: { x: 0, y: 0, w: 6, h: 4 },
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    }

    vi.mocked(api.updatePanel).mockResolvedValue({
      ...existingPanel,
      title: 'Updated Panel'
    })

    const wrapper = mount(PanelEditModal, {
      props: { dashboardId, panel: existingPanel }
    })
    await wrapper.find('input#title').setValue('Updated Panel')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(api.updatePanel).toHaveBeenCalledWith('1', {
      title: 'Updated Panel',
      type: 'line_chart',
      query: undefined
    })
    expect(wrapper.emitted('saved')).toBeTruthy()
  })

  it('shows error on API failure', async () => {
    vi.mocked(api.createPanel).mockRejectedValue(new Error('Network error'))

    const wrapper = mount(PanelEditModal, {
      props: { dashboardId }
    })
    await wrapper.find('input#title').setValue('New Panel')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Failed to create panel')
  })

  it('renders trace panel type options', async () => {
    const wrapper = mount(PanelEditModal, {
      props: { dashboardId }
    })
    await flushPromises()

    const typeOptions = wrapper.findAll('select#type option').map((option) => option.text())
    expect(typeOptions).toContain('Trace List')
    expect(typeOptions).toContain('Trace Heatmap')
  })

  it('requires datasource for trace panels', async () => {
    const wrapper = mount(PanelEditModal, {
      props: { dashboardId }
    })
    await flushPromises()

    await wrapper.find('input#title').setValue('Trace Panel')
    await wrapper.find('select#type').setValue('trace_list')
    await wrapper.find('select#datasource').setValue('')
    await wrapper.find('form').trigger('submit')

    expect(wrapper.text()).toContain('Tracing datasource is required for trace panels')
  })

  it('saves trace panel config', async () => {
    vi.mocked(api.createPanel).mockResolvedValue({
      id: 'trace-panel-1',
      dashboard_id: dashboardId,
      title: 'Trace List Panel',
      type: 'trace_list',
      grid_pos: { x: 0, y: 0, w: 6, h: 4 },
      query: { datasource_id: 'ds-trace-1', expr: 'service=api', service: 'api', limit: 25 },
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    })

    const wrapper = mount(PanelEditModal, {
      props: { dashboardId }
    })
    await flushPromises()

    await wrapper.find('input#title').setValue('Trace List Panel')
    await wrapper.find('select#type').setValue('trace_list')
    await wrapper.find('select#datasource').setValue('ds-trace-1')

    const queryBuilder = wrapper.findComponent({ name: 'QueryBuilder' })
    await queryBuilder.vm.$emit('update:modelValue', 'service=api')

    await wrapper.find('#trace-service-filter').setValue('api')
    await wrapper.find('#trace-limit').setValue('25')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(api.createPanel).toHaveBeenCalledWith(dashboardId, {
      title: 'Trace List Panel',
      type: 'trace_list',
      grid_pos: { x: 0, y: 0, w: 6, h: 4 },
      query: {
        datasource_id: 'ds-trace-1',
        expr: 'service=api',
        service: 'api',
        limit: 25,
      }
    })
  })

  it('renders ClickHouse SQL editor and saves signal config', async () => {
    vi.mocked(api.createPanel).mockResolvedValue({
      id: 'panel-clickhouse-1',
      dashboard_id: dashboardId,
      title: 'ClickHouse Logs',
      type: 'logs',
      grid_pos: { x: 0, y: 0, w: 6, h: 4 },
      query: {
        datasource_id: 'ds-clickhouse-1',
        expr: 'SELECT timestamp, message FROM logs LIMIT 10',
        signal: 'logs',
      },
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    })

    const wrapper = mount(PanelEditModal, {
      props: { dashboardId },
    })
    await flushPromises()

    await wrapper.find('#title').setValue('ClickHouse Logs')
    await wrapper.find('#type').setValue('logs')
    await wrapper.find('#datasource').setValue('ds-clickhouse-1')

    expect(wrapper.findComponent({ name: 'ClickHouseSQLEditor' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'QueryBuilder' }).exists()).toBe(false)

    await wrapper.find('#clickhouse-signal').setValue('logs')
    await wrapper.find('#clickhouse-query').setValue('SELECT timestamp, message FROM logs LIMIT 10')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(api.createPanel).toHaveBeenCalledWith(dashboardId, {
      title: 'ClickHouse Logs',
      type: 'logs',
      grid_pos: { x: 0, y: 0, w: 6, h: 4 },
      query: {
        datasource_id: 'ds-clickhouse-1',
        expr: 'SELECT timestamp, message FROM logs LIMIT 10',
        signal: 'logs',
      },
    })
  })

  it('renders CloudWatch editor and saves cloudwatch signal config', async () => {
    vi.mocked(api.createPanel).mockResolvedValue({
      id: 'panel-cloudwatch-1',
      dashboard_id: dashboardId,
      title: 'CloudWatch Logs',
      type: 'logs',
      grid_pos: { x: 0, y: 0, w: 6, h: 4 },
      query: {
        datasource_id: 'ds-cloudwatch-1',
        expr: 'fields @timestamp, @message | limit 10',
        signal: 'logs',
      },
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    })

    const wrapper = mount(PanelEditModal, {
      props: { dashboardId },
    })
    await flushPromises()

    await wrapper.find('#title').setValue('CloudWatch Logs')
    await wrapper.find('#type').setValue('logs')
    await wrapper.find('#datasource').setValue('ds-cloudwatch-1')

    expect(wrapper.findComponent({ name: 'CloudWatchQueryEditor' }).exists()).toBe(true)

    await wrapper.find('#cloudwatch-signal').setValue('logs')
    await wrapper.find('#cloudwatch-query').setValue('fields @timestamp, @message | limit 10')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(api.createPanel).toHaveBeenCalledWith(dashboardId, {
      title: 'CloudWatch Logs',
      type: 'logs',
      grid_pos: { x: 0, y: 0, w: 6, h: 4 },
      query: {
        datasource_id: 'ds-cloudwatch-1',
        expr: 'fields @timestamp, @message | limit 10',
        signal: 'logs',
      },
    })
  })

  it('renders Elasticsearch editor and saves logs signal config', async () => {
    vi.mocked(api.createPanel).mockResolvedValue({
      id: 'panel-elasticsearch-1',
      dashboard_id: dashboardId,
      title: 'Elasticsearch Logs',
      type: 'logs',
      grid_pos: { x: 0, y: 0, w: 6, h: 4 },
      query: {
        datasource_id: 'ds-elasticsearch-1',
        expr: 'service.name:"api" AND level:error',
        signal: 'logs',
      },
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    })

    const wrapper = mount(PanelEditModal, {
      props: { dashboardId },
    })
    await flushPromises()

    await wrapper.find('#title').setValue('Elasticsearch Logs')
    await wrapper.find('#type').setValue('logs')
    await wrapper.find('#datasource').setValue('ds-elasticsearch-1')

    expect(wrapper.findComponent({ name: 'ElasticsearchQueryEditor' }).exists()).toBe(true)

    await wrapper.find('#elasticsearch-signal').setValue('logs')
    await wrapper.find('#elasticsearch-query').setValue('service.name:"api" AND level:error')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(api.createPanel).toHaveBeenCalledWith(dashboardId, {
      title: 'Elasticsearch Logs',
      type: 'logs',
      grid_pos: { x: 0, y: 0, w: 6, h: 4 },
      query: {
        datasource_id: 'ds-elasticsearch-1',
        expr: 'service.name:"api" AND level:error',
        signal: 'logs',
      },
    })
  })
})
