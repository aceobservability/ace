import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as datasourcesApi from '@/api/datasources'
import { ServicesPage } from '@/pages/ServicesPage'
import { useFavoritesStore } from '@/stores/favoritesStore'
import { useOrgStore } from '@/stores/orgStore'
import { createTestQueryClient } from '@/test/renderWithProviders'
import type { DataSource } from '@/types/datasource'

vi.mock('@/analytics', () => ({
  identifyUser: vi.fn(),
  resetUserAnalytics: vi.fn(),
  trackEvent: vi.fn(),
}))

function makeDatasource(overrides: Partial<DataSource> = {}): DataSource {
  return {
    id: 'ds-1',
    organization_id: 'org-1',
    name: 'Tempo Prod',
    type: 'tempo',
    url: 'http://tempo:3200',
    is_default: true,
    auth_type: 'none',
    trace_id_field: 'trace_id',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function renderServices() {
  const queryClient = createTestQueryClient()
  const router = createMemoryRouter(
    [
      { path: '/app/services', element: <ServicesPage /> },
      { path: '/app/settings/datasources', element: <div>Datasources</div> },
      { path: '/app/explore/traces', element: <div>Traces</div> },
    ],
    { initialEntries: ['/app/services'] },
  )

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return router
}

describe('ServicesPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    useOrgStore.setState({ currentOrgId: 'org-1' })
    useFavoritesStore.setState({ favorites: [], recentDashboards: [] })
  })

  it('renders services discovered from tracing datasources', async () => {
    const tempo = makeDatasource({ id: 'tempo-1', name: 'Tempo Prod', type: 'tempo' })
    vi.spyOn(datasourcesApi, 'listDataSources').mockResolvedValue([tempo])
    vi.spyOn(datasourcesApi, 'fetchDataSourceTraceServices').mockResolvedValue([
      'checkout-api',
      'payments-worker',
    ])

    renderServices()

    await waitFor(() => {
      expect(screen.getAllByTestId('service-card')).toHaveLength(2)
    })

    expect(screen.getByText('checkout-api')).toBeTruthy()
    expect(screen.getByText('payments-worker')).toBeTruthy()
    expect(screen.getAllByText('Tempo Prod').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Inventory only').length).toBeGreaterThan(0)
    expect(screen.getByText(/not show sample health data/i)).toBeTruthy()
  })

  it('does not render previous hardcoded demo services as live data', async () => {
    const tempo = makeDatasource({ id: 'tempo-1' })
    vi.spyOn(datasourcesApi, 'listDataSources').mockResolvedValue([tempo])
    vi.spyOn(datasourcesApi, 'fetchDataSourceTraceServices').mockResolvedValue(['checkout-api'])

    renderServices()

    await waitFor(() => {
      expect(screen.getByText('checkout-api')).toBeTruthy()
    })

    expect(screen.queryByText('API Gateway')).toBeNull()
    expect(screen.queryByText('Payment Service')).toBeNull()
    expect(screen.queryByText('Analytics Pipeline')).toBeNull()
    expect(screen.queryAllByTestId('service-ai-chip')).toHaveLength(0)
  })

  it('shows an honest empty state when no datasources are configured', async () => {
    vi.spyOn(datasourcesApi, 'listDataSources').mockResolvedValue([])

    renderServices()

    await waitFor(() => {
      expect(screen.getByTestId('empty-state-title').textContent).toBe(
        'No service telemetry configured',
      )
    })

    expect(screen.getByTestId('empty-state-description').textContent).toContain(
      'will not show hardcoded sample services',
    )
    expect(screen.getByTestId('empty-state-action').textContent).toBe('Add Data Source')
  })

  it('asks for tracing datasource when only non-tracing datasources exist', async () => {
    const prometheus = makeDatasource({
      id: 'prom-1',
      name: 'Prometheus Prod',
      type: 'prometheus',
    })
    vi.spyOn(datasourcesApi, 'listDataSources').mockResolvedValue([prometheus])

    renderServices()

    await waitFor(() => {
      expect(screen.getByTestId('empty-state-title').textContent).toBe(
        'No tracing datasource configured',
      )
    })

    expect(screen.getByTestId('empty-state-description').textContent).toContain(
      'Tempo, VictoriaTraces, or ClickHouse',
    )
  })

  it('shows discovery error instead of falling back to sample services', async () => {
    const tempo = makeDatasource({ id: 'tempo-1' })
    vi.spyOn(datasourcesApi, 'listDataSources').mockResolvedValue([tempo])
    vi.spyOn(datasourcesApi, 'fetchDataSourceTraceServices').mockRejectedValue(
      new Error('trace endpoint unavailable'),
    )

    renderServices()

    await waitFor(() => {
      expect(screen.getByTestId('services-discovery-error')).toBeTruthy()
    })

    expect(screen.getByText(/Service discovery failed for 1 tracing datasource/)).toBeTruthy()
    expect(screen.queryAllByTestId('service-card')).toHaveLength(0)
  })
})
