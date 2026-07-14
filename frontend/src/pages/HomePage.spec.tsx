import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as datasourcesApi from '@/api/datasources'
import { HomePage } from '@/pages/HomePage'
import { useFavoritesStore } from '@/stores/favoritesStore'
import { useOrgStore } from '@/stores/orgStore'
import { createTestQueryClient } from '@/test/renderWithProviders'
import type { DataSource } from '@/types/datasource'

vi.mock('@/analytics', () => ({
  identifyUser: vi.fn(),
  resetUserAnalytics: vi.fn(),
  trackEvent: vi.fn(),
}))

const mockDatasource: DataSource = {
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

function renderHome(initialPath = '/app') {
  const queryClient = createTestQueryClient()
  const router = createMemoryRouter(
    [
      { path: '/app', element: <HomePage /> },
      { path: '/app/dashboards', element: <div>Dashboards</div> },
      { path: '/app/dashboards/:id', element: <div>Dashboard</div> },
      { path: '/app/explore/metrics', element: <div>Explore</div> },
      { path: '/app/alerts', element: <div>Alerts</div> },
      { path: '/app/settings', element: <div>Settings</div> },
      { path: '/app/settings/datasources', element: <div>Datasources</div> },
      { path: '/app/datasources/new', element: <div>New datasource</div> },
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

describe('HomePage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    useOrgStore.setState({ currentOrgId: 'org-1' })
    useFavoritesStore.setState({ favorites: [], recentDashboards: [] })
    vi.spyOn(datasourcesApi, 'listDataSources').mockResolvedValue([mockDatasource])
  })

  it('renders datasource summary cards with mocked datasource data', async () => {
    renderHome()

    await waitFor(() => {
      expect(screen.getByTestId('datasource-summary-grid')).toBeTruthy()
    })

    expect(screen.getByText('Configured Data Sources')).toBeTruthy()
    expect(screen.getByText('Prometheus Prod')).toBeTruthy()
    expect(screen.getByTestId('datasource-summary-note').textContent).toContain(
      'not inferring live service health',
    )

    const cards = screen.getAllByTestId('datasource-summary-card')
    expect(cards.length).toBeGreaterThanOrEqual(1)
    expect(cards[0]?.textContent).toContain('Metrics')
    expect(cards[0]?.textContent).toContain('Default source')
  })

  it('renders quick links to dashboards, explore, alerts, and settings', async () => {
    renderHome()

    await waitFor(() => {
      expect(screen.getByTestId('quick-links')).toBeTruthy()
    })

    const links = screen.getByTestId('quick-links').querySelectorAll('a')
    expect(links).toHaveLength(4)
    expect(links[0]?.getAttribute('href')).toBe('/app/dashboards')
    expect(links[1]?.getAttribute('href')).toBe('/app/explore/metrics')
    expect(links[2]?.getAttribute('href')).toBe('/app/alerts')
    expect(links[3]?.getAttribute('href')).toBe('/app/settings')
  })

  it('navigates via quick links', async () => {
    const user = userEvent.setup()
    const router = renderHome()

    await waitFor(() => {
      expect(screen.getByTestId('quick-links')).toBeTruthy()
    })

    await user.click(screen.getByRole('link', { name: 'Dashboards' }))
    expect(router.state.location.pathname).toBe('/app/dashboards')
  })

  it('renders AI command input and sample insights', async () => {
    renderHome()

    await waitFor(() => {
      expect(screen.getByTestId('ai-command-input')).toBeTruthy()
    })

    expect(screen.getByText('Ask Ace anything')).toBeTruthy()
    expect(screen.getByText('Sample AI Insights')).toBeTruthy()
    expect(screen.getByTestId('sample-ai-insights-note').textContent).toContain(
      'Illustrative examples only',
    )
    expect(screen.getAllByTestId('ai-insight-card').length).toBeGreaterThanOrEqual(1)
  })

  it('shows onboarding banner when not dismissed', async () => {
    renderHome()

    await waitFor(() => {
      expect(screen.getByTestId('onboarding-banner')).toBeTruthy()
    })
  })

  it('hides onboarding banner when dismissed', async () => {
    localStorage.setItem('ace-onboarding-dismissed', 'true')
    renderHome()

    await waitFor(() => {
      expect(screen.getByTestId('datasource-summary-grid')).toBeTruthy()
    })

    expect(screen.queryByTestId('onboarding-banner')).toBeNull()
  })

  it('shows pinned dashboards when favorites exist', async () => {
    useFavoritesStore.setState({
      favorites: [{ id: 'dash-1', title: 'Dashboard 1', type: 'dashboard' }],
      recentDashboards: [],
    })

    renderHome()

    await waitFor(() => {
      expect(screen.getByTestId('pinned-dashboards')).toBeTruthy()
    })

    expect(screen.getByText('Pinned Dashboards')).toBeTruthy()
    expect(screen.getByText('Dashboard 1')).toBeTruthy()
  })

  it('shows empty state when no datasources and wizard dismissed', async () => {
    localStorage.setItem('ace-setup-wizard-dismissed', 'true')
    vi.spyOn(datasourcesApi, 'listDataSources').mockResolvedValue([])

    renderHome()

    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeTruthy()
    })

    expect(screen.getByTestId('empty-state-title').textContent).toBe('Welcome to Ace')
    expect(screen.getByTestId('empty-state-action').textContent).toBe('Add Data Source')
  })
})