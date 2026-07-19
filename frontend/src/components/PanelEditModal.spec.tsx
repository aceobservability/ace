import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as datasourceApi from '@/api/datasources'
import * as panelApi from '@/api/panels'
import { PanelEditModal } from '@/components/PanelEditModal'
import type { DataSource } from '@/types/datasource'
import type { Panel } from '@/types/panel'
import { createTestQueryClient } from '@/test/renderWithProviders'

const mockDatasources: DataSource[] = [
  {
    id: 'ds-metrics-1',
    organization_id: 'org-1',
    name: 'Prometheus Main',
    type: 'prometheus',
    url: 'http://localhost:9090',
    is_default: true,
    auth_type: 'none',
    trace_id_field: 'trace_id',
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
    trace_id_field: 'trace_id',
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
    trace_id_field: 'trace_id',
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
    trace_id_field: 'trace_id',
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
    trace_id_field: 'trace_id',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ds-loki-1',
    organization_id: 'org-1',
    name: 'Loki Main',
    type: 'loki',
    url: 'http://localhost:3100',
    is_default: false,
    auth_type: 'none',
    trace_id_field: 'trace_id',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ds-victorialogs-1',
    organization_id: 'org-1',
    name: 'VictoriaLogs Main',
    type: 'victorialogs',
    url: 'http://localhost:9428',
    is_default: false,
    auth_type: 'none',
    trace_id_field: 'trace_id',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
]

vi.mock('@/hooks/useOrganization', () => ({
  useOrganization: () => ({
    currentOrgId: 'org-1',
    currentOrg: {
      id: 'org-1',
      name: 'Acme',
      slug: 'acme',
      role: 'admin' as const,
      created_at: '2026-02-08T00:00:00Z',
      updated_at: '2026-02-08T00:00:00Z',
    },
  }),
}))

vi.mock('@/hooks/useDatasources', () => ({
  useDatasources: () => ({ data: mockDatasources }),
}))

vi.mock('@/components/QueryBuilder', () => ({
  QueryBuilder: ({
    value,
    onChange,
    disabled,
  }: {
    value: string
    onChange: (value: string) => void
    disabled?: boolean
  }) => (
    <div data-testid="mock-query-builder">
      <textarea
        id="promql-query"
        data-testid="promql-query-input"
        value={value}
        disabled={disabled}
        onChange={event => onChange(event.target.value)}
      />
    </div>
  ),
}))

vi.mock('@/components/LogQLQueryBuilder', () => ({
  LogQLQueryBuilder: ({
    value,
    onChange,
    queryLanguage,
    disabled,
  }: {
    value: string
    onChange: (value: string) => void
    queryLanguage?: string
    disabled?: boolean
  }) => (
    <div data-testid="mock-logql-builder" data-query-language={queryLanguage}>
      <textarea
        id="logql-query"
        data-testid="logql-query-input"
        value={value}
        disabled={disabled}
        onChange={event => onChange(event.target.value)}
      />
    </div>
  ),
}))

vi.mock('@/components/MonacoQueryEditor', () => ({
  MonacoQueryEditor: () => <div data-testid="mock-monaco" />,
}))

function renderModal(props: Partial<React.ComponentProps<typeof PanelEditModal>> = {}) {
  const onClose = props.onClose ?? vi.fn()
  const onSaved = props.onSaved ?? vi.fn()
  const queryClient = createTestQueryClient()

  render(
    <QueryClientProvider client={queryClient}>
      <PanelEditModal
        dashboardId={props.dashboardId ?? 'dashboard-123'}
        panel={props.panel}
        onClose={onClose}
        onSaved={onSaved}
      />
    </QueryClientProvider>,
  )

  return { onClose, onSaved }
}

describe('PanelEditModal', () => {
  const dashboardId = 'dashboard-123'

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(datasourceApi, 'fetchDataSourceLabels').mockResolvedValue(['job', 'service_name'])
  })

  it('renders form fields for create flow', () => {
    renderModal({ dashboardId })
    expect(screen.getByTestId('panel-edit-modal')).toBeTruthy()
    expect(screen.getByTestId('panel-title-input')).toBeTruthy()
    expect(screen.getByTestId('panel-type-select')).toBeTruthy()
    expect(screen.getByTestId('mock-query-builder')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Add Panel' })).toBeTruthy()
  })

  it('shows Edit Panel title when editing', () => {
    const panel: Panel = {
      id: '1',
      dashboard_id: dashboardId,
      title: 'Existing Panel',
      type: 'line_chart',
      grid_pos: { x: 0, y: 0, w: 6, h: 4 },
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }
    renderModal({ dashboardId, panel })
    expect(screen.getByRole('heading', { name: 'Edit Panel' })).toBeTruthy()
  })

  it('includes registry panel types with categories/status labels', () => {
    renderModal({ dashboardId })
    const typeSelect = screen.getByTestId('panel-type-select') as HTMLSelectElement
    const optionTexts = Array.from(typeSelect.options).map(option => option.text)
    expect(optionTexts).toContain('Heatmap')
    expect(optionTexts).toContain('Text')
    expect(optionTexts.some(text => text.includes('not supported'))).toBe(true)
    expect(optionTexts.some(text => text.includes('setup required'))).toBe(true)
  })

  it('emits close when cancel is clicked', async () => {
    const { onClose } = renderModal({ dashboardId })
    await userEvent.click(screen.getByTestId('panel-edit-cancel-btn'))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows error when title is empty', async () => {
    renderModal({ dashboardId })
    await userEvent.click(screen.getByTestId('panel-edit-save-btn'))
    expect(screen.getByText('Title is required')).toBeTruthy()
  })

  it('creates panel with PromQL query and default grid size', async () => {
    const created: Panel = {
      id: '123',
      dashboard_id: dashboardId,
      title: 'Panel with Query',
      type: 'line_chart',
      grid_pos: { x: 0, y: 0, w: 6, h: 4 },
      query: { promql: 'up' },
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }
    vi.spyOn(panelApi, 'createPanel').mockResolvedValue(created)

    const { onSaved } = renderModal({ dashboardId })
    await userEvent.type(screen.getByTestId('panel-title-input'), 'Panel with Query')
    fireEvent.change(screen.getByTestId('promql-query-input'), { target: { value: 'up' } })
    await userEvent.click(screen.getByTestId('panel-edit-save-btn'))

    await waitFor(() => {
      expect(panelApi.createPanel).toHaveBeenCalledWith(dashboardId, {
        title: 'Panel with Query',
        type: 'line_chart',
        grid_pos: { x: 0, y: 0, w: 6, h: 4 },
        query: { promql: 'up' },
      })
    })
    expect(onSaved).toHaveBeenCalledWith(created)
  })

  it('updates existing panel on save', async () => {
    const existing: Panel = {
      id: '1',
      dashboard_id: dashboardId,
      title: 'Existing Panel',
      type: 'line_chart',
      grid_pos: { x: 0, y: 0, w: 6, h: 4 },
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }
    const updated = { ...existing, title: 'Updated Panel' }
    vi.spyOn(panelApi, 'updatePanel').mockResolvedValue(updated)

    const { onSaved } = renderModal({ dashboardId, panel: existing })
    const titleInput = screen.getByTestId('panel-title-input')
    await userEvent.clear(titleInput)
    await userEvent.type(titleInput, 'Updated Panel')
    await userEvent.click(screen.getByTestId('panel-edit-save-btn'))

    await waitFor(() => {
      expect(panelApi.updatePanel).toHaveBeenCalledWith('1', {
        title: 'Updated Panel',
        type: 'line_chart',
        query: undefined,
      })
    })
    expect(onSaved).toHaveBeenCalledWith(updated)
  })

  it('shows error on API failure', async () => {
    vi.spyOn(panelApi, 'createPanel').mockRejectedValue(new Error('Network error'))
    renderModal({ dashboardId })
    await userEvent.type(screen.getByTestId('panel-title-input'), 'New Panel')
    await userEvent.click(screen.getByTestId('panel-edit-save-btn'))
    await waitFor(() => {
      expect(screen.getByText('Failed to create panel')).toBeTruthy()
    })
  })

  it('requires datasource for trace panels', async () => {
    renderModal({ dashboardId })
    await userEvent.type(screen.getByTestId('panel-title-input'), 'Trace Panel')
    fireEvent.change(screen.getByTestId('panel-type-select'), {
      target: { value: 'trace_list' },
    })
    // Clear auto-selected tracing datasource
    fireEvent.change(screen.getByTestId('panel-datasource-select'), {
      target: { value: '' },
    })
    await userEvent.click(screen.getByTestId('panel-edit-save-btn'))
    expect(screen.getByText('Tracing datasource is required for trace panels')).toBeTruthy()
  })

  it('saves trace panel config', async () => {
    const created: Panel = {
      id: 'trace-panel-1',
      dashboard_id: dashboardId,
      title: 'Trace List Panel',
      type: 'trace_list',
      grid_pos: { x: 0, y: 0, w: 6, h: 4 },
      query: { datasource_id: 'ds-trace-1', service: 'api', limit: 25 },
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }
    vi.spyOn(panelApi, 'createPanel').mockResolvedValue(created)

    renderModal({ dashboardId })
    await userEvent.type(screen.getByTestId('panel-title-input'), 'Trace List Panel')
    fireEvent.change(screen.getByTestId('panel-type-select'), {
      target: { value: 'trace_list' },
    })
    fireEvent.change(screen.getByTestId('panel-datasource-select'), {
      target: { value: 'ds-trace-1' },
    })
    expect(screen.queryByTestId('mock-query-builder')).toBeNull()
    fireEvent.change(screen.getByTestId('panel-trace-service-input'), {
      target: { value: 'api' },
    })
    fireEvent.change(screen.getByTestId('panel-trace-limit-input'), {
      target: { value: '25' },
    })
    await userEvent.click(screen.getByTestId('panel-edit-save-btn'))

    await waitFor(() => {
      expect(panelApi.createPanel).toHaveBeenCalledWith(dashboardId, {
        title: 'Trace List Panel',
        type: 'trace_list',
        grid_pos: { x: 0, y: 0, w: 6, h: 4 },
        query: {
          datasource_id: 'ds-trace-1',
          service: 'api',
          limit: 25,
        },
      })
    })
  })

  it('renders ClickHouse SQL editor and saves signal config', async () => {
    vi.spyOn(panelApi, 'createPanel').mockResolvedValue({
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

    renderModal({ dashboardId })
    await userEvent.type(screen.getByTestId('panel-title-input'), 'ClickHouse Logs')
    fireEvent.change(screen.getByTestId('panel-type-select'), { target: { value: 'logs' } })
    fireEvent.change(screen.getByTestId('panel-datasource-select'), {
      target: { value: 'ds-clickhouse-1' },
    })

    expect(screen.getByTestId('clickhouse-query-input')).toBeTruthy()
    expect(screen.queryByTestId('mock-query-builder')).toBeNull()

    fireEvent.change(screen.getByTestId('clickhouse-signal-select'), {
      target: { value: 'logs' },
    })
    fireEvent.change(screen.getByTestId('clickhouse-query-input'), {
      target: { value: 'SELECT timestamp, message FROM logs LIMIT 10' },
    })
    await userEvent.click(screen.getByTestId('panel-edit-save-btn'))

    await waitFor(() => {
      expect(panelApi.createPanel).toHaveBeenCalledWith(dashboardId, {
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
  })

  it('renders CloudWatch editor and saves signal config', async () => {
    vi.spyOn(panelApi, 'createPanel').mockResolvedValue({
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

    renderModal({ dashboardId })
    await userEvent.type(screen.getByTestId('panel-title-input'), 'CloudWatch Logs')
    fireEvent.change(screen.getByTestId('panel-type-select'), { target: { value: 'logs' } })
    fireEvent.change(screen.getByTestId('panel-datasource-select'), {
      target: { value: 'ds-cloudwatch-1' },
    })

    expect(screen.getByTestId('cloudwatch-query-input')).toBeTruthy()
    fireEvent.change(screen.getByTestId('cloudwatch-signal-select'), {
      target: { value: 'logs' },
    })
    fireEvent.change(screen.getByTestId('cloudwatch-query-input'), {
      target: { value: 'fields @timestamp, @message | limit 10' },
    })
    await userEvent.click(screen.getByTestId('panel-edit-save-btn'))

    await waitFor(() => {
      expect(panelApi.createPanel).toHaveBeenCalledWith(dashboardId, {
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
  })

  it('renders Elasticsearch editor and saves logs signal config', async () => {
    vi.spyOn(panelApi, 'createPanel').mockResolvedValue({
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

    renderModal({ dashboardId })
    await userEvent.type(screen.getByTestId('panel-title-input'), 'Elasticsearch Logs')
    fireEvent.change(screen.getByTestId('panel-type-select'), { target: { value: 'logs' } })
    fireEvent.change(screen.getByTestId('panel-datasource-select'), {
      target: { value: 'ds-elasticsearch-1' },
    })

    expect(screen.getByTestId('elasticsearch-query-input')).toBeTruthy()
    fireEvent.change(screen.getByTestId('elasticsearch-signal-select'), {
      target: { value: 'logs' },
    })
    fireEvent.change(screen.getByTestId('elasticsearch-query-input'), {
      target: { value: 'service.name:"api" AND level:error' },
    })
    await userEvent.click(screen.getByTestId('panel-edit-save-btn'))

    await waitFor(() => {
      expect(panelApi.createPanel).toHaveBeenCalledWith(dashboardId, {
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

  it('renders LogQLQueryBuilder for Loki logs datasource', async () => {
    vi.spyOn(panelApi, 'createPanel').mockResolvedValue({
      id: 'panel-loki-1',
      dashboard_id: dashboardId,
      title: 'Loki Logs',
      type: 'logs',
      grid_pos: { x: 0, y: 0, w: 6, h: 4 },
      query: { datasource_id: 'ds-loki-1', expr: '{job="api"} |= "error"' },
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    })

    renderModal({ dashboardId })
    await userEvent.type(screen.getByTestId('panel-title-input'), 'Loki Logs')
    fireEvent.change(screen.getByTestId('panel-type-select'), { target: { value: 'logs' } })
    fireEvent.change(screen.getByTestId('panel-datasource-select'), {
      target: { value: 'ds-loki-1' },
    })

    expect(screen.getByTestId('mock-logql-builder')).toBeTruthy()
    expect(screen.queryByTestId('mock-query-builder')).toBeNull()
    fireEvent.change(screen.getByTestId('logql-query-input'), {
      target: { value: '{job="api"} |= "error"' },
    })
    await userEvent.click(screen.getByTestId('panel-edit-save-btn'))

    await waitFor(() => {
      expect(panelApi.createPanel).toHaveBeenCalledWith(dashboardId, {
        title: 'Loki Logs',
        type: 'logs',
        grid_pos: { x: 0, y: 0, w: 6, h: 4 },
        query: {
          datasource_id: 'ds-loki-1',
          expr: '{job="api"} |= "error"',
        },
      })
    })
  })

  it('uses logsql mode for VictoriaLogs datasource', async () => {
    renderModal({ dashboardId })
    fireEvent.change(screen.getByTestId('panel-type-select'), { target: { value: 'logs' } })
    fireEvent.change(screen.getByTestId('panel-datasource-select'), {
      target: { value: 'ds-victorialogs-1' },
    })
    expect(screen.getByTestId('mock-logql-builder').getAttribute('data-query-language')).toBe(
      'logsql',
    )
  })

  it('fetches indexed labels for Loki logs datasource', async () => {
    renderModal({ dashboardId })
    fireEvent.change(screen.getByTestId('panel-type-select'), { target: { value: 'logs' } })
    fireEvent.change(screen.getByTestId('panel-datasource-select'), {
      target: { value: 'ds-loki-1' },
    })
    await waitFor(() => {
      expect(datasourceApi.fetchDataSourceLabels).toHaveBeenCalledWith('ds-loki-1')
    })
  })
})
