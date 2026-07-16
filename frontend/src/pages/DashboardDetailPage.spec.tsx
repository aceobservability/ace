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
})