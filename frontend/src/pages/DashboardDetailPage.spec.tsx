import type { ReactNode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('echarts/core', async importOriginal => {
  const actual = await importOriginal<typeof import('echarts/core')>()
  return {
    ...actual,
    init: vi.fn(() => ({
      setOption: vi.fn(),
      resize: vi.fn(),
      dispose: vi.fn(),
      group: '',
    })),
    connect: vi.fn(),
    disconnect: vi.fn(),
  }
})

vi.mock('react-grid-layout/legacy', () => ({
  default: ({ children }: { children: ReactNode }) => (
    <div data-testid="dashboard-grid-mock">{children}</div>
  ),
}))

vi.mock('@/components/QueryBuilder', () => ({
  QueryBuilder: ({
    value,
    onChange,
  }: {
    value: string
    onChange: (value: string) => void
  }) => (
    <textarea
      data-testid="promql-query-input"
      value={value}
      onChange={event => onChange(event.target.value)}
    />
  ),
}))

vi.mock('@/components/MonacoQueryEditor', () => ({
  MonacoQueryEditor: () => <div data-testid="mock-monaco" />,
}))

vi.mock('@/hooks/useDatasources', () => ({
  useDatasources: () => ({
    data: [
      {
        id: 'ds-1',
        organization_id: 'org-1',
        name: 'Prometheus',
        type: 'prometheus',
        url: 'http://localhost:9090',
        is_default: true,
        auth_type: 'none',
        trace_id_field: 'trace_id',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ],
  }),
}))

import * as dashboardApi from '@/api/dashboards'
import * as datasourceApi from '@/api/datasources'
import * as panelApi from '@/api/panels'
import * as variableApi from '@/api/variables'
import * as promqlClient from '@/promql/client'
import { DashboardDetailPage } from '@/pages/DashboardDetailPage'
import { useFavoritesStore } from '@/stores/favoritesStore'
import { useTimeRangeStore } from '@/stores/timeRangeStore'
import { createTestQueryClient } from '@/test/renderWithProviders'

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

const mockDashboard = {
  id: 'test-dashboard-id',
  title: 'Test Dashboard',
  description: 'Test Description',
  created_at: '2026-02-02T00:00:00Z',
  updated_at: '2026-02-02T00:00:00Z',
}

const mockPanels = [
  {
    id: 'panel-1',
    dashboard_id: 'test-dashboard-id',
    title: 'CPU Usage',
    type: 'line_chart',
    grid_pos: { x: 0, y: 0, w: 6, h: 3 },
    query: { promql: 'up' },
    created_at: '2026-02-02T00:00:00Z',
    updated_at: '2026-02-02T00:00:00Z',
  },
  {
    id: 'panel-2',
    dashboard_id: 'test-dashboard-id',
    title: 'Memory',
    type: 'bar_chart',
    grid_pos: { x: 6, y: 0, w: 6, h: 3 },
    query: {
      datasource_id: 'ds-1',
      expr: 'memory_usage',
      signal: 'metrics',
    },
    created_at: '2026-02-02T00:00:00Z',
    updated_at: '2026-02-02T00:00:00Z',
  },
]

function renderDashboardDetail(dashboardId = 'test-dashboard-id') {
  const queryClient = createTestQueryClient()
  const router = createMemoryRouter(
    [
      {
        path: '/app/dashboards/:id',
        element: <DashboardDetailPage />,
      },
      {
        path: '/app/dashboards',
        element: <div>Dashboards list</div>,
      },
    ],
    { initialEntries: [`/app/dashboards/${dashboardId}`] },
  )

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('DashboardDetailPage', () => {
  beforeEach(() => {
    useFavoritesStore.getState()._reset()
    useTimeRangeStore.getState()._reset()

    vi.spyOn(dashboardApi, 'getDashboard').mockResolvedValue(mockDashboard)
    vi.spyOn(panelApi, 'listPanels').mockResolvedValue(mockPanels)
    vi.spyOn(variableApi, 'listVariables').mockResolvedValue([])
    vi.spyOn(datasourceApi, 'queryDataSource').mockResolvedValue({
      status: 'success',
      resultType: 'metrics',
      data: {
        resultType: 'matrix',
        result: [
          {
            metric: { __name__: 'memory_usage' },
            values: [
              [1_700_000_000, '42'],
              [1_700_000_015, '44'],
            ],
          },
        ],
      },
    })
    vi.spyOn(promqlClient, 'queryPrometheus').mockResolvedValue({
      status: 'success',
      data: {
        resultType: 'matrix',
        result: [
          {
            metric: { __name__: 'up' },
            values: [
              [1_700_000_000, '1'],
              [1_700_000_015, '1'],
            ],
          },
        ],
      },
    })
  })

  it('loads dashboard metadata and panels', async () => {
    renderDashboardDetail()

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-title').textContent).toContain('Test Dashboard')
    })

    expect(screen.getByTestId('dashboard-panel-panel-1')).toBeTruthy()
    expect(screen.getByTestId('dashboard-panel-panel-2')).toBeTruthy()
    expect(dashboardApi.getDashboard).toHaveBeenCalledWith('test-dashboard-id')
    expect(panelApi.listPanels).toHaveBeenCalledWith('test-dashboard-id')
  })

  it('fetches datasource-backed panel data', async () => {
    renderDashboardDetail()

    await waitFor(() => {
      expect(datasourceApi.queryDataSource).toHaveBeenCalledWith(
        'ds-1',
        expect.objectContaining({
          query: 'memory_usage',
          signal: 'metrics',
        }),
      )
    })
  })

  it('shows error state when dashboard cannot be loaded', async () => {
    vi.mocked(dashboardApi.getDashboard).mockRejectedValueOnce(new Error('Dashboard not found'))
    renderDashboardDetail()

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-error')).toBeTruthy()
    })
    expect(screen.getByText('Dashboard not found')).toBeTruthy()
  })

  it('navigates back to dashboards list', async () => {
    const user = userEvent.setup()
    renderDashboardDetail()

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-back-btn')).toBeTruthy()
    })

    await user.click(screen.getByTestId('dashboard-back-btn'))
    await waitFor(() => {
      expect(screen.getByText('Dashboards list')).toBeTruthy()
    })
  })

  it('opens create panel modal from Add Panel button', async () => {
    const user = userEvent.setup()
    renderDashboardDetail()

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-add-panel-btn')).toBeTruthy()
    })

    await user.click(screen.getByTestId('dashboard-add-panel-btn'))
    expect(screen.getByTestId('panel-edit-modal')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Add Panel' })).toBeTruthy()
  })

  it('opens edit panel modal from panel edit button', async () => {
    const user = userEvent.setup()
    renderDashboardDetail()

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-panel-panel-1')).toBeTruthy()
    })

    const editButtons = screen.getAllByTestId('panel-edit-btn')
    await user.click(editButtons[0]!)
    expect(screen.getByTestId('panel-edit-modal')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Edit Panel' })).toBeTruthy()
    expect((screen.getByTestId('panel-title-input') as HTMLInputElement).value).toBe('CPU Usage')
  })

  it('adds created panel to grid without reloading', async () => {
    const user = userEvent.setup()
    const createdPanel = {
      id: 'panel-new',
      dashboard_id: 'test-dashboard-id',
      title: 'New Panel',
      type: 'line_chart',
      grid_pos: { x: 0, y: 0, w: 6, h: 4 },
      created_at: '2026-02-02T00:00:00Z',
      updated_at: '2026-02-02T00:00:00Z',
    }
    vi.spyOn(panelApi, 'createPanel').mockResolvedValue(createdPanel)

    renderDashboardDetail()

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-add-panel-btn')).toBeTruthy()
    })

    await user.click(screen.getByTestId('dashboard-add-panel-btn'))
    await user.type(screen.getByTestId('panel-title-input'), 'New Panel')
    await user.click(screen.getByTestId('panel-edit-save-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-panel-panel-new')).toBeTruthy()
    })
    expect(screen.queryByTestId('panel-edit-modal')).toBeNull()
    expect(panelApi.createPanel).toHaveBeenCalledWith(
      'test-dashboard-id',
      expect.objectContaining({ title: 'New Panel', type: 'line_chart' }),
    )
    // Panel is inserted from the create response; no extra listPanels reload required.
    expect(screen.getByText('New Panel')).toBeTruthy()
  })
})