import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as converterApi from '@/api/converter'
import * as dashboardApi from '@/api/dashboards'
import { CreateDashboardModal } from '@/components/CreateDashboardModal'
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

vi.mock('@/hooks/useDatasources', () => ({
  useDatasources: () => ({ data: [] }),
}))

function renderModal(props: Partial<React.ComponentProps<typeof CreateDashboardModal>> = {}) {
  const onClose = props.onClose ?? vi.fn()
  const onCreated = props.onCreated ?? vi.fn()
  const queryClient = createTestQueryClient()
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: (
          <CreateDashboardModal
            initialMode={props.initialMode}
            onClose={onClose}
            onCreated={onCreated}
          />
        ),
      },
      { path: '/app/dashboards/new/ai', element: <div>AI generation</div> },
    ],
    { initialEntries: ['/'] },
  )

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return { onClose, onCreated, router }
}

describe('CreateDashboardModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('shows both Blank Dashboard and Generate with AI options', () => {
    renderModal()
    expect(screen.getByText('Blank Dashboard')).toBeTruthy()
    expect(screen.getByText('Generate with AI')).toBeTruthy()
  })

  it('navigates to AI generation route on Generate with AI click', async () => {
    const { router, onClose } = renderModal()
    await userEvent.click(screen.getByText('Generate with AI'))
    expect(onClose).toHaveBeenCalled()
    expect(router.state.location.pathname).toBe('/app/dashboards/new/ai')
  })

  it('renders form fields when Blank Dashboard is selected', async () => {
    renderModal()
    await userEvent.click(screen.getByText('Blank Dashboard'))
    expect(screen.getByLabelText(/Title/)).toBeTruthy()
    expect(screen.getByLabelText('Description')).toBeTruthy()
  })

  it('calls onClose when close button is clicked', async () => {
    const { onClose } = renderModal()
    await userEvent.click(screen.getByTestId('create-dashboard-close-btn'))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows error when title is empty on blank dashboard submit', async () => {
    renderModal()
    await userEvent.click(screen.getByText('Blank Dashboard'))
    await userEvent.click(screen.getByTestId('create-dashboard-submit-btn'))
    expect(screen.getByText('Title is required')).toBeTruthy()
  })

  it('calls createDashboard API on blank dashboard submit', async () => {
    vi.spyOn(dashboardApi, 'createDashboard').mockResolvedValue({
      id: '123',
      title: 'New Dashboard',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    })
    const { onCreated } = renderModal()

    await userEvent.click(screen.getByText('Blank Dashboard'))
    await userEvent.type(screen.getByTestId('create-dashboard-title-input'), 'New Dashboard')
    await userEvent.type(screen.getByTestId('create-dashboard-description-input'), 'Description')
    await userEvent.click(screen.getByTestId('create-dashboard-submit-btn'))

    await waitFor(() => {
      expect(dashboardApi.createDashboard).toHaveBeenCalledWith('org-1', {
        title: 'New Dashboard',
        description: 'Description',
      })
      expect(onCreated).toHaveBeenCalled()
    })
  })

  it('shows error on API failure', async () => {
    vi.spyOn(dashboardApi, 'createDashboard').mockRejectedValue(
      new Error('Failed to create dashboard'),
    )
    renderModal()

    await userEvent.click(screen.getByText('Blank Dashboard'))
    await userEvent.type(screen.getByTestId('create-dashboard-title-input'), 'New Dashboard')
    await userEvent.click(screen.getByTestId('create-dashboard-submit-btn'))

    await waitFor(() => {
      expect(screen.getByText('Failed to create dashboard')).toBeTruthy()
    })
  })

  it('imports dashboard from yaml file', async () => {
    vi.spyOn(dashboardApi, 'importDashboardYaml').mockResolvedValue({
      id: 'imported-1',
      title: 'Imported Dashboard',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    })
    const { onCreated } = renderModal()

    await userEvent.click(screen.getByText('Blank Dashboard'))
    await userEvent.click(screen.getByTestId('create-mode-import-btn'))

    const file = new File(
      [
        'version: 2\ntitle: Imported Dashboard\npanels:\n  - title: Requests\n    type: line_chart\n  - title: Errors\n    type: stat\n',
      ],
      'dashboard.yaml',
      { type: 'application/x-yaml' },
    )

    const input = document.getElementById('yaml-file') as HTMLInputElement
    await userEvent.upload(input, file)

    await waitFor(() => {
      expect(screen.getByTestId('yaml-preview')).toBeTruthy()
      expect(screen.getByText(/2 panels/)).toBeTruthy()
    })

    await userEvent.click(screen.getByTestId('create-dashboard-submit-btn'))

    await waitFor(() => {
      expect(dashboardApi.importDashboardYaml).toHaveBeenCalledWith(
        'org-1',
        expect.stringContaining('title: Imported Dashboard'),
      )
      expect(onCreated).toHaveBeenCalled()
    })
  })

  it('imports dashboard from grafana json conversion', async () => {
    vi.spyOn(converterApi, 'convertGrafanaDashboard').mockResolvedValue({
      format: 'yaml',
      content: 'version: 2\ntitle: Converted Dashboard\npanels:\n  - title: Requests\n',
      document: {
        version: 2,
        title: 'Converted Dashboard',
        description: 'From Grafana',
        panels: [
          {
            title: 'Requests',
            type: 'line_chart',
            position: { x: 0, y: 0, w: 24, h: 8 },
          },
        ],
      },
      warnings: ['Converted unsupported panel type'],
    })
    vi.spyOn(dashboardApi, 'importDashboardYaml').mockResolvedValue({
      id: 'converted-1',
      title: 'Converted Dashboard',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    })
    const { onCreated } = renderModal()

    await userEvent.click(screen.getByText('Blank Dashboard'))
    await userEvent.click(screen.getByTestId('create-mode-grafana-btn'))
    fireEvent.change(screen.getByTestId('grafana-source'), {
      target: { value: '{"dashboard":{"title":"grafana"}}' },
    })
    await userEvent.click(screen.getByTestId('grafana-convert'))

    await waitFor(() => {
      expect(converterApi.convertGrafanaDashboard).toHaveBeenCalledWith(
        '{"dashboard":{"title":"grafana"}}',
        'yaml',
      )
      expect(screen.getByTestId('yaml-preview').textContent).toContain('Converted Dashboard')
      expect(screen.getByTestId('grafana-warnings').textContent).toContain('unsupported panel type')
    })

    await userEvent.click(screen.getByTestId('create-dashboard-submit-btn'))

    await waitFor(() => {
      expect(dashboardApi.importDashboardYaml).toHaveBeenCalledWith(
        'org-1',
        expect.stringContaining('version: 2'),
      )
      expect(onCreated).toHaveBeenCalled()
    })
  })

  it('has glassmorphic modal styling', () => {
    renderModal()
    expect(screen.getByTestId('create-dashboard-modal')).toBeTruthy()
  })
})