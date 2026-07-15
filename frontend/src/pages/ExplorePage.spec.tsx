import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as dashboardsApi from '@/api/dashboards'
import * as datasourcesApi from '@/api/datasources'
import { ExplorePage } from '@/pages/ExplorePage'
import { useOrgStore } from '@/stores/orgStore'
import { useTimeRangeStore } from '@/stores/timeRangeStore'
import { createTestQueryClient } from '@/test/renderWithProviders'
import type { DataSource, DataSourceQueryResult } from '@/types/datasource'

vi.mock('@/analytics', () => ({
  identifyUser: vi.fn(),
  resetUserAnalytics: vi.fn(),
  trackEvent: vi.fn(),
}))

vi.mock('@/components/MonacoQueryEditor', () => ({
  MonacoQueryEditor: ({
    value,
    onChange,
    disabled,
  }: {
    value: string
    onChange: (value: string) => void
    disabled?: boolean
  }) => (
    <textarea
      data-testid="monaco-query-editor-mock"
      value={value}
      disabled={disabled}
      onChange={event => onChange(event.target.value)}
    />
  ),
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
    <input
      data-testid="query-builder-mock"
      value={value}
      disabled={disabled}
      onChange={event => onChange(event.target.value)}
    />
  ),
}))

vi.mock('@/components/LogQLQueryBuilder', () => ({
  LogQLQueryBuilder: ({
    value,
    onChange,
    disabled,
  }: {
    value: string
    onChange: (value: string) => void
    disabled?: boolean
  }) => (
    <input
      data-testid="logql-query-builder-mock"
      value={value}
      disabled={disabled}
      onChange={event => onChange(event.target.value)}
    />
  ),
}))

vi.mock('@/components/LogViewer', () => ({
  LogViewer: ({ logs }: { logs: Array<{ line: string }> }) => (
    <div data-testid="log-viewer-mock" data-log-count={logs.length}>
      {logs.map(log => (
        <div key={log.line} data-testid="log-viewer-row-mock">
          {log.line}
        </div>
      ))}
    </div>
  ),
}))

vi.mock('echarts/core', () => ({
  init: vi.fn(() => ({
    setOption: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
    group: undefined,
  })),
  use: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
}))

vi.mock('echarts/renderers', () => ({
  CanvasRenderer: {},
}))

vi.mock('echarts/charts', () => ({
  LineChart: {},
}))

vi.mock('echarts/components', () => ({
  TitleComponent: {},
  TooltipComponent: {},
  LegendComponent: {},
  GridComponent: {},
}))

const mockMetricsDatasource: DataSource = {
  id: 'ds-1',
  organization_id: 'org-1',
  name: 'Prometheus Prod',
  type: 'prometheus',
  url: 'http://prometheus:9090',
  is_default: true,
  auth_type: 'none',
  trace_id_field: 'trace_id',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const mockLogsDatasource: DataSource = {
  id: 'ds-logs-1',
  organization_id: 'org-1',
  name: 'Loki Prod',
  type: 'loki',
  url: 'http://loki:3100',
  is_default: true,
  auth_type: 'none',
  trace_id_field: 'trace_id',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const mockQueryResponse: DataSourceQueryResult = {
  status: 'success',
  resultType: 'metrics',
  data: {
    resultType: 'matrix',
    result: [
      {
        metric: { __name__: 'up', instance: 'localhost:9090' },
        values: [
          [1704067200, '1'],
          [1704067215, '0.8'],
          [1704067230, '0.9'],
        ],
      },
    ],
  },
}

function renderExplore(initialPath = '/app/explore/metrics') {
  const queryClient = createTestQueryClient()
  const router = createMemoryRouter(
    [
      { path: '/app/explore', element: <ExplorePage /> },
      { path: '/app/explore/:type', element: <ExplorePage /> },
    ],
    { initialEntries: [initialPath] },
  )

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return router
}

describe('ExplorePage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    useOrgStore.setState({ currentOrgId: 'org-1' })
    useTimeRangeStore.getState()._reset()

    vi.spyOn(dashboardsApi, 'listDashboards').mockResolvedValue([])
    vi.spyOn(datasourcesApi, 'listDataSources').mockResolvedValue([mockMetricsDatasource])
    vi.spyOn(datasourcesApi, 'fetchDataSourceMetricNames').mockResolvedValue(['up', 'http_requests_total'])
    vi.spyOn(datasourcesApi, 'fetchDataSourceLabels').mockResolvedValue(['instance', 'job'])
    vi.spyOn(datasourcesApi, 'fetchDataSourceLabelValues').mockResolvedValue(['localhost:9090'])
    vi.spyOn(datasourcesApi, 'queryDataSource').mockImplementation(async (_id, payload) => {
      if (payload.query === 'up') {
        return mockQueryResponse
      }
      return {
        status: 'success',
        resultType: 'metrics',
        data: { resultType: 'matrix', result: [] },
      }
    })
  })

  it('renders metrics explore tab at /app/explore/metrics', async () => {
    renderExplore()

    await waitFor(() => {
      expect(screen.getByTestId('explore-tab-nav')).toBeTruthy()
    })

    expect(screen.getByRole('heading', { name: 'Explore' })).toBeTruthy()
    expect(screen.getByTestId('explore-tab-metrics')).toBeTruthy()
    expect(screen.getByTestId('explore-datasource-btn')).toBeTruthy()
    expect(screen.getByTestId('time-range-picker-btn')).toBeTruthy()
  })

  it('renders traces explore tab at /app/explore/traces', async () => {
    const mockTracesDatasource: DataSource = {
      id: 'ds-traces-1',
      organization_id: 'org-1',
      name: 'Tempo Prod',
      type: 'tempo',
      url: 'http://tempo:3200',
      is_default: true,
      auth_type: 'none',
      trace_id_field: 'trace_id',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }

    vi.spyOn(datasourcesApi, 'listDataSources').mockResolvedValue([mockTracesDatasource])
    vi.spyOn(datasourcesApi, 'fetchDataSourceTraceServices').mockResolvedValue(['api', 'gateway'])

    renderExplore('/app/explore/traces')

    await waitFor(() => {
      expect(screen.getByTestId('explore-traces-datasource-btn')).toBeTruthy()
    })

    expect(screen.getByTestId('time-range-picker-btn')).toBeTruthy()
    expect(screen.getByTestId('explore-traces-search-btn')).toBeTruthy()
  })

  it('executes a trace search and renders timeline with mocked API', async () => {
    const mockTracesDatasource: DataSource = {
      id: 'ds-traces-1',
      organization_id: 'org-1',
      name: 'Tempo Prod',
      type: 'tempo',
      url: 'http://tempo:3200',
      is_default: true,
      auth_type: 'none',
      trace_id_field: 'trace_id',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }

    vi.spyOn(datasourcesApi, 'listDataSources').mockResolvedValue([mockTracesDatasource])
    vi.spyOn(datasourcesApi, 'fetchDataSourceTraceServices').mockResolvedValue(['api'])
    vi.spyOn(datasourcesApi, 'searchDataSourceTraces').mockResolvedValue([
      {
        traceId: 'trace-abc-123',
        rootServiceName: 'api',
        rootOperationName: 'GET /orders',
        startTimeUnixNano: 1_700_000_000_000_000_000,
        durationNano: 2_500_000,
        spanCount: 3,
        serviceCount: 2,
        errorSpanCount: 0,
      },
    ])
    vi.spyOn(datasourcesApi, 'fetchDataSourceTrace').mockResolvedValue({
      traceId: 'trace-abc-123',
      startTimeUnixNano: 1_700_000_000_000_000_000,
      durationNano: 2_500_000,
      services: ['api', 'gateway'],
      spans: [
        {
          spanId: 'span-root',
          operationName: 'GET /orders',
          serviceName: 'api',
          startTimeUnixNano: 1_700_000_000_000_000_000,
          durationNano: 2_500_000,
          status: 'ok',
        },
      ],
    })
    vi.spyOn(datasourcesApi, 'fetchDataSourceTraceServiceGraph').mockResolvedValue({
      nodes: [
        {
          serviceName: 'api',
          requestCount: 1,
          errorCount: 0,
          errorRate: 0,
          averageDurationNano: 2_500_000,
        },
      ],
      edges: [],
      totalRequests: 1,
      totalErrorCount: 0,
    })

    renderExplore('/app/explore/traces')

    await waitFor(() => {
      expect(screen.getByTestId('explore-traces-datasource-btn').textContent).toContain('Tempo Prod')
    })

    await waitFor(() => {
      expect(datasourcesApi.searchDataSourceTraces).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(screen.getByTestId('trace-search-results')).toBeTruthy()
    })

    expect(screen.getByText('trace-abc-123')).toBeTruthy()

    fireEvent.click(screen.getByText('trace-abc-123'))

    await waitFor(() => {
      expect(datasourcesApi.fetchDataSourceTrace).toHaveBeenCalledWith('ds-traces-1', 'trace-abc-123')
    })

    await waitFor(() => {
      expect(screen.getByTestId('trace-timeline')).toBeTruthy()
    })
  })

  it('renders logs explore tab at /app/explore/logs', async () => {
    vi.spyOn(datasourcesApi, 'listDataSources').mockResolvedValue([mockLogsDatasource])
    renderExplore('/app/explore/logs')

    await waitFor(() => {
      expect(screen.getByTestId('explore-logs-datasource-btn')).toBeTruthy()
    })

    expect(screen.getByTestId('time-range-picker-btn')).toBeTruthy()
    expect(screen.getByTestId('explore-logs-run-query-btn')).toBeTruthy()
  })

  it('executes a logs query and renders log rows with mocked API', async () => {
    vi.spyOn(datasourcesApi, 'listDataSources').mockResolvedValue([mockLogsDatasource])
    vi.spyOn(datasourcesApi, 'queryDataSource').mockImplementation(async (_id, payload) => {
      if (payload.query === '{job=~".+"}') {
        return {
          status: 'success',
          resultType: 'logs',
          data: {
            resultType: 'logs',
            logs: [
              {
                timestamp: '2026-01-01T12:00:00Z',
                line: 'error connecting to database',
                labels: { job: 'api' },
                level: 'error',
              },
            ],
          },
        } satisfies DataSourceQueryResult
      }
      return {
        status: 'success',
        resultType: 'logs',
        data: { resultType: 'logs', logs: [] },
      } satisfies DataSourceQueryResult
    })

    renderExplore('/app/explore/logs')

    await waitFor(() => {
      expect(screen.getByTestId('explore-logs-datasource-btn').textContent).toContain('Loki Prod')
    })

    const queryInput = await screen.findByTestId('logql-query-builder-mock')
    fireEvent.change(queryInput, { target: { value: '{job=~".+"}' } })

    fireEvent.click(screen.getByTestId('explore-logs-run-query-btn'))

    await waitFor(() => {
      expect(datasourcesApi.queryDataSource).toHaveBeenCalledWith(
        'ds-logs-1',
        expect.objectContaining({ query: '{job=~".+"}' }),
      )
    })

    await waitFor(() => {
      expect(screen.getByTestId('log-viewer-mock')).toBeTruthy()
    })

    expect(screen.getByTestId('log-viewer-mock').getAttribute('data-log-count')).toBe('1')
    expect(screen.getByText('error connecting to database')).toBeTruthy()
  })

  it('executes a query and renders chart results with mocked API', async () => {
    const user = userEvent.setup()
    renderExplore()

    await waitFor(() => {
      expect(screen.getByTestId('explore-datasource-btn').textContent).toContain('Prometheus Prod')
    })

    await waitFor(() => {
      expect(datasourcesApi.queryDataSource).toHaveBeenCalled()
    })

    vi.mocked(datasourcesApi.queryDataSource).mockClear()

    const queryInput = await screen.findByTestId('query-builder-mock')
    await user.clear(queryInput)
    await user.type(queryInput, 'up')

    await waitFor(() => {
      const runButton = screen.getByTestId('explore-run-query-btn')
      expect(runButton.hasAttribute('disabled')).toBe(false)
    })

    await user.click(screen.getByTestId('explore-run-query-btn'))

    await waitFor(() => {
      expect(datasourcesApi.queryDataSource).toHaveBeenCalledWith(
        'ds-1',
        expect.objectContaining({ query: 'up' }),
      )
    })

    await waitFor(() => {
      expect(screen.getByTestId('line-chart')).toBeTruthy()
    })

    expect(screen.getByTestId('line-chart').getAttribute('data-series-count')).toBe('1')
    expect(screen.getByText('1 series')).toBeTruthy()
  })

  it('opens export to dashboard modal', async () => {
    const user = userEvent.setup()
    renderExplore()

    await waitFor(() => {
      expect(screen.getByTestId('explore-datasource-btn').textContent).toContain('Prometheus Prod')
    })

    const queryInput = await screen.findByTestId('query-builder-mock')
    await user.type(queryInput, 'up')

    await waitFor(() => {
      const exportButton = screen.getByTestId('explore-export-btn')
      expect(exportButton.hasAttribute('disabled')).toBe(false)
    })

    await user.click(screen.getByTestId('explore-export-btn'))

    expect(screen.getByTestId('export-dashboard-modal')).toBeTruthy()
  })
})