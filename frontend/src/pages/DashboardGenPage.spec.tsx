import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as datasourcesApi from '@/api/datasources'
import { DashboardGenPage } from '@/pages/DashboardGenPage'
import { createTestQueryClient } from '@/test/renderWithProviders'
import type { DashboardSpec } from '@/utils/dashboardSpec'

const mockGenerate = vi.fn()
const mockCancel = vi.fn()
const mockFetchProviders = vi.fn()
const mockFetchModels = vi.fn()

let mockProviders: Array<{ id: string; display_name: string }> = [
  { id: 'p1', display_name: 'OpenAI' },
]

vi.mock('@/hooks/useOrganization', () => ({
  useOrganization: () => ({
    currentOrg: { id: 'org-1' },
    currentOrgId: 'org-1',
  }),
}))

vi.mock('@/hooks/useAIProvider', () => ({
  useAIProvider: () => ({
    fetchProviders: mockFetchProviders,
    fetchModels: mockFetchModels,
    providers: mockProviders,
    selectedProviderId: mockProviders[0]?.id ?? '',
  }),
}))

vi.mock('@/hooks/useDashboardGeneration', () => ({
  useDashboardGeneration: () => ({
    generate: mockGenerate,
    cancel: mockCancel,
    isGenerating: false,
    error: null,
    toolStatuses: [],
    progressText: '',
  }),
}))

vi.mock('@/lib/copilotTools', () => ({
  getToolsForDatasourceType: vi.fn().mockReturnValue([]),
}))

vi.mock('@/components/DashboardSpecPreview', () => ({
  DashboardSpecPreview: ({
    spec,
    onSaved,
  }: {
    spec: DashboardSpec
    onSaved?: (id: string) => void
  }) => (
    <div data-testid="spec-preview">
      <span>{spec.title}</span>
      <button
        type="button"
        data-testid="mock-save-generated-dashboard"
        onClick={() => onSaved?.('dash-ai-1')}
      >
        Save generated
      </button>
    </div>
  ),
}))

function renderGenPage() {
  const queryClient = createTestQueryClient()
  const router = createMemoryRouter(
    [
      {
        path: '/app/dashboards/new/ai',
        element: <DashboardGenPage />,
      },
      {
        path: '/app/dashboards/:id',
        element: <div>Saved dashboard</div>,
      },
      {
        path: '/app/settings',
        element: <div>Settings</div>,
      },
    ],
    { initialEntries: ['/app/dashboards/new/ai'] },
  )

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return router
}

describe('DashboardGenPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    mockProviders = [{ id: 'p1', display_name: 'OpenAI' }]
    mockGenerate.mockReset()
    mockCancel.mockReset()
    mockFetchProviders.mockResolvedValue(undefined)
    mockFetchModels.mockResolvedValue(undefined)
    mockGenerate.mockResolvedValue({ spec: null, content: null })

    vi.spyOn(datasourcesApi, 'listDataSources').mockResolvedValue([
      {
        id: 'ds-1',
        organization_id: 'org-1',
        name: 'VictoriaMetrics',
        type: 'victoriametrics',
        url: 'http://vm:8428',
        is_default: true,
        auth_type: 'none',
        trace_id_field: 'trace_id',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'ds-2',
        organization_id: 'org-1',
        name: 'Loki',
        type: 'loki',
        url: 'http://loki:3100',
        is_default: false,
        auth_type: 'none',
        trace_id_field: 'trace_id',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ])
  })

  it('renders describe step with heading', async () => {
    renderGenPage()

    expect(await screen.findByText('What do you want to monitor?')).toBeTruthy()
  })

  it('has a generate button that is disabled when input is empty', async () => {
    renderGenPage()

    const btn = await screen.findByTestId('gen-generate-btn')
    expect((btn as HTMLButtonElement).disabled).toBe(true)
  })

  it('generates and saves a dashboard on the happy path', async () => {
    const user = userEvent.setup()
    mockGenerate.mockResolvedValue({
      spec: {
        title: 'API Latency Dashboard',
        description: 'Generated',
        panels: [
          {
            title: 'p95 latency',
            type: 'line_chart',
            position: { x: 0, y: 0, w: 12, h: 3 },
            datasource_id: 'ds-1',
            query: { expr: 'histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))' },
          },
        ],
      },
      content: null,
    })

    const router = renderGenPage()

    await waitFor(() => {
      expect(screen.getByTestId('gen-describe-input')).toBeTruthy()
    })

    await user.type(screen.getByTestId('gen-describe-input'), 'Monitor API latency')
    await user.click(screen.getByTestId('gen-generate-btn'))

    await waitFor(() => {
      expect(mockGenerate).toHaveBeenCalled()
    })

    expect(await screen.findByTestId('spec-preview')).toBeTruthy()
    expect(screen.getByText('API Latency Dashboard')).toBeTruthy()

    await user.click(screen.getByTestId('mock-save-generated-dashboard'))

    expect(await screen.findByText('Dashboard created!')).toBeTruthy()

    await waitFor(
      () => {
        expect(router.state.location.pathname).toBe('/app/dashboards/dash-ai-1')
      },
      { timeout: 2500 },
    )
  })

  it('shows datasource dropdown when multiple datasources exist', async () => {
    renderGenPage()

    expect(await screen.findByTestId('gen-datasource-select')).toBeTruthy()
  })

  it('shows no AI provider warning when providers is empty', async () => {
    mockProviders = []
    renderGenPage()

    expect(await screen.findByTestId('gen-no-provider-warning')).toBeTruthy()
    expect(screen.getByText(/No AI provider configured/i)).toBeTruthy()
  })

  it('persists selected datasource to localStorage on generate', async () => {
    const user = userEvent.setup()
    mockGenerate.mockResolvedValue({ spec: null, content: null })

    renderGenPage()

    await waitFor(() => {
      expect(screen.getByTestId('gen-describe-input')).toBeTruthy()
    })

    await user.type(screen.getByTestId('gen-describe-input'), 'Test')
    await user.click(screen.getByTestId('gen-generate-btn'))

    await waitFor(() => {
      expect(localStorage.getItem('ace:lastDatasource:org-1')).toBeTruthy()
    })
  })
})
