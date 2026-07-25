import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DataSourceCreatePage } from '@/pages/DataSourceCreatePage'
import { createTestQueryClient } from '@/test/renderWithProviders'

const mockNavigate = vi.fn()
const mockCreateDataSource = vi.hoisted(() => vi.fn())
const mockUpdateDataSource = vi.hoisted(() => vi.fn())
const mockGetDataSource = vi.hoisted(() => vi.fn())
const mockTestDraft = vi.hoisted(() => vi.fn())
const mockFetchTraceDatasources = vi.hoisted(() => vi.fn())

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('@/hooks/useOrganization', () => ({
  useOrganization: () => ({
    currentOrgId: 'org-1',
    currentOrg: {
      id: 'org-1',
      name: 'Acme',
      slug: 'acme',
      role: 'admin' as const,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    organizations: [],
    selectOrganization: vi.fn(),
    isLoading: false,
    error: null,
  }),
}))

vi.mock('@/api/datasources', () => ({
  createDataSource: (...args: unknown[]) => mockCreateDataSource(...args),
  updateDataSource: (...args: unknown[]) => mockUpdateDataSource(...args),
  getDataSource: (...args: unknown[]) => mockGetDataSource(...args),
  testDataSourceDraftConnection: (...args: unknown[]) => mockTestDraft(...args),
  fetchTraceDatasources: (...args: unknown[]) => mockFetchTraceDatasources(...args),
}))

function renderAt(path: string) {
  const queryClient = createTestQueryClient()
  const router = createMemoryRouter(
    [
      { path: '/app/datasources/new', element: <DataSourceCreatePage /> },
      { path: '/app/datasources/:id/edit', element: <DataSourceCreatePage /> },
    ],
    { initialEntries: [path] },
  )
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('DataSourceCreatePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateDataSource.mockResolvedValue({ id: 'ds-new' })
    mockUpdateDataSource.mockResolvedValue({ id: 'ds-1' })
    mockTestDraft.mockResolvedValue(undefined)
    mockFetchTraceDatasources.mockResolvedValue([])
    mockGetDataSource.mockResolvedValue(undefined)
  })

  it('creates a datasource in create mode', async () => {
    const user = userEvent.setup()
    renderAt('/app/datasources/new')

    expect(screen.getByRole('heading', { name: 'Add Data Source' })).toBeTruthy()

    await user.type(screen.getByTestId('ds-name-input'), 'Primary Prometheus')
    await user.clear(screen.getByTestId('ds-url-input'))
    await user.type(screen.getByTestId('ds-url-input'), 'http://localhost:9090')
    await user.click(screen.getByTestId('ds-save-btn'))

    await waitFor(() => {
      expect(mockCreateDataSource).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({
          name: 'Primary Prometheus',
          type: 'prometheus',
          url: 'http://localhost:9090',
        }),
      )
    })
    expect(mockUpdateDataSource).not.toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith('/app/settings/datasources')
  })

  it('edits a datasource when route includes id', async () => {
    const user = userEvent.setup()
    mockGetDataSource.mockResolvedValue({
      id: 'ds-1',
      organization_id: 'org-1',
      name: 'Tempo Source',
      type: 'tempo',
      url: 'http://tempo:3200',
      is_default: false,
      auth_type: 'none',
      auth_config: {},
      trace_id_field: 'trace_id',
      created_at: '2026-02-08T00:00:00Z',
      updated_at: '2026-02-08T00:00:00Z',
    })

    renderAt('/app/datasources/ds-1/edit')

    await waitFor(() => {
      expect(mockGetDataSource).toHaveBeenCalledWith('ds-1')
    })
    expect(await screen.findByRole('heading', { name: 'Edit Data Source' })).toBeTruthy()

    const nameInput = screen.getByTestId('ds-name-input')
    await user.clear(nameInput)
    await user.type(nameInput, 'Tempo Source Updated')
    await user.click(screen.getByTestId('ds-save-btn'))

    await waitFor(() => {
      expect(mockUpdateDataSource).toHaveBeenCalledWith(
        'ds-1',
        expect.objectContaining({
          name: 'Tempo Source Updated',
          type: 'tempo',
          url: 'http://tempo:3200',
        }),
      )
    })
    expect(mockCreateDataSource).not.toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith('/app/settings/datasources')
  })

  it('tests draft connection before save', async () => {
    const user = userEvent.setup()
    renderAt('/app/datasources/new')

    await user.type(screen.getByTestId('ds-name-input'), 'Prom')
    await user.type(screen.getByTestId('ds-url-input'), 'http://localhost:9090')
    await user.click(screen.getByTestId('ds-test-btn'))

    await waitFor(() => {
      expect(mockTestDraft).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({
          type: 'prometheus',
          url: 'http://localhost:9090',
        }),
      )
    })
    expect(await screen.findByText('Connection test succeeded')).toBeTruthy()
  })
})
