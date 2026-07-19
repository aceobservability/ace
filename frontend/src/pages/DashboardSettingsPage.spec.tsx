import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as converterApi from '@/api/converter'
import * as dashboardApi from '@/api/dashboards'
import { DashboardSettingsPage } from '@/pages/DashboardSettingsPage'
import { createTestQueryClient } from '@/test/renderWithProviders'
import type { MembershipRole } from '@/types/organization'

const mockCurrentOrg = {
  id: 'org-1',
  name: 'Acme',
  slug: 'acme',
  role: 'admin' as MembershipRole,
  created_at: '2026-02-08T00:00:00Z',
  updated_at: '2026-02-08T00:00:00Z',
}

vi.mock('@/hooks/useOrganization', () => ({
  useOrganization: () => ({
    currentOrgId: mockCurrentOrg.id,
    currentOrg: mockCurrentOrg,
  }),
}))

vi.mock('@/components/DashboardPermissionsEditor', () => ({
  DashboardPermissionsEditor: () => <div data-testid="dashboard-permissions-editor" />,
}))

const mockDashboard = {
  id: 'dashboard-1',
  title: 'Production Overview',
  description: 'Main prod metrics',
  organization_id: 'org-1',
  created_at: '2026-02-09T00:00:00Z',
  updated_at: '2026-02-09T00:00:00Z',
}

const initialYaml = `schema_version: 1
dashboard:
  title: Production Overview
  description: Main prod metrics
  panels: []
`

function renderSettings(section = 'general') {
  const queryClient = createTestQueryClient()
  const router = createMemoryRouter(
    [
      {
        path: '/app/dashboards/:id/settings/:section',
        element: <DashboardSettingsPage />,
      },
      {
        path: '/app/dashboards/:id',
        element: <div>Dashboard detail</div>,
      },
    ],
    { initialEntries: [`/app/dashboards/dashboard-1/settings/${section}`] },
  )

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return router
}

describe('DashboardSettingsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockCurrentOrg.role = 'admin'
    localStorage.removeItem('dashboard_view_settings')

    vi.spyOn(dashboardApi, 'getDashboard').mockResolvedValue({ ...mockDashboard })
    vi.spyOn(dashboardApi, 'updateDashboard').mockResolvedValue({ ...mockDashboard })
    vi.spyOn(dashboardApi, 'exportDashboardYaml').mockResolvedValue(
      new Blob([initialYaml], { type: 'application/x-yaml' }),
    )
    vi.spyOn(converterApi, 'convertGrafanaDashboard').mockResolvedValue({
      format: 'yaml',
      content: initialYaml,
      document: {
        schema_version: 1,
        dashboard: { title: 'Production Overview', panels: [] },
      },
      warnings: [],
    })
  })

  it('renders general section with secondary sidebar', async () => {
    renderSettings('general')

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-settings-sidebar')).toBeTruthy()
    })

    expect(screen.getByText('Dashboard Settings')).toBeTruthy()
    expect(screen.getByTestId('settings-section-general').className).toContain(
      'text-[var(--color-primary)]',
    )
  })

  it('navigates sections through sidebar links', async () => {
    const user = userEvent.setup()
    const router = renderSettings('general')

    await waitFor(() => {
      expect(screen.getByTestId('settings-section-yaml')).toBeTruthy()
    })

    await user.click(screen.getByTestId('settings-section-yaml'))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/app/dashboards/dashboard-1/settings/yaml')
    })
  })

  it('redirects invalid section routes to general', async () => {
    const router = renderSettings('invalid')

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/app/dashboards/dashboard-1/settings/general')
    })
  })

  it('hides permissions section for viewers and redirects direct permissions route', async () => {
    mockCurrentOrg.role = 'viewer'
    const router = renderSettings('permissions')

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/app/dashboards/dashboard-1/settings/general')
    })

    expect(screen.queryByTestId('settings-section-permissions')).toBeNull()
  })

  it('saves general settings and persists dashboard view preferences', async () => {
    const user = userEvent.setup()
    renderSettings('general')

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-name-input')).toBeTruthy()
    })

    const nameInput = screen.getByTestId('dashboard-name-input')
    await user.clear(nameInput)
    await user.type(nameInput, 'Updated Overview')

    await user.selectOptions(screen.getByTestId('dashboard-refresh-select'), '30s')

    const variablesInput = screen.getByLabelText(/Variable names/i)
    await user.clear(variablesInput)
    await user.type(variablesInput, 'env,cluster')

    await user.click(screen.getByTestId('save-dashboard-settings'))

    await waitFor(() => {
      expect(dashboardApi.updateDashboard).toHaveBeenCalledWith('dashboard-1', {
        title: 'Updated Overview',
        description: 'Main prod metrics',
      })
    })

    const storedSettings = JSON.parse(localStorage.getItem('dashboard_view_settings') || '{}')
    expect(storedSettings['dashboard-1']).toEqual({
      timeRangePreset: '1h',
      refreshInterval: '30s',
      variables: ['env', 'cluster'],
    })
  })

  it('saves YAML editor content', async () => {
    const user = userEvent.setup()
    renderSettings('yaml')

    await waitFor(() => {
      expect(screen.getByTestId('yaml-editor-input')).toBeTruthy()
    })

    const nextYaml = `schema_version: 1
dashboard:
  title: YAML Updated
  description: From YAML
  panels: []
`
    const yamlInput = screen.getByTestId('yaml-editor-input')
    fireEvent.change(yamlInput, { target: { value: nextYaml } })

    await user.click(screen.getByTestId('save-dashboard-yaml'))

    await waitFor(() => {
      expect(dashboardApi.updateDashboard).toHaveBeenCalledWith('dashboard-1', {
        title: 'YAML Updated',
        description: 'From YAML',
      })
    })

    expect(await screen.findByText('Dashboard YAML saved')).toBeTruthy()
  })

  it('renders dashboard permissions editor inline on permissions section', async () => {
    renderSettings('permissions')

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-permissions-editor')).toBeTruthy()
    })
  })
})
