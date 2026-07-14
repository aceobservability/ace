import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as dashboardApi from '@/api/dashboards'
import * as folderApi from '@/api/folders'
import { DashboardList } from '@/components/DashboardList'
import { useFavoritesStore } from '@/stores/favoritesStore'
import { useOrgStore } from '@/stores/orgStore'
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

const mockDashboards = [
  {
    id: '123e4567-e89b-12d3-a456-426614174000',
    folder_id: 'folder-a',
    title: 'Test Dashboard',
    description: 'Test description',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: '223e4567-e89b-12d3-a456-426614174001',
    folder_id: null,
    title: 'Another Dashboard',
    created_at: '2024-01-02T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
  },
  {
    id: '323e4567-e89b-12d3-a456-426614174002',
    folder_id: 'missing-folder',
    title: 'Needs Reassignment',
    description: 'Folder was deleted',
    created_at: '2024-01-03T00:00:00Z',
    updated_at: '2024-01-03T00:00:00Z',
  },
]

const mockFolders = [
  {
    id: 'folder-a',
    organization_id: 'org-1',
    parent_id: null,
    name: 'Operations',
    sort_order: 0,
    created_by: 'user-1',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'folder-b',
    organization_id: 'org-1',
    parent_id: null,
    name: 'Product',
    sort_order: 1,
    created_by: 'user-1',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
]

function renderDashboardList(initialPath = '/app/dashboards', searchQuery = '') {
  const queryClient = createTestQueryClient()
  const router = createMemoryRouter(
    [
      {
        path: '/app/dashboards',
        element: <DashboardList searchQuery={searchQuery} />,
      },
      {
        path: '/app/dashboards/:id',
        element: <div>Dashboard detail</div>,
      },
      {
        path: '/app/dashboards/new/ai',
        element: <div>AI generation</div>,
      },
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

describe('DashboardList', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useOrgStore.setState({ currentOrgId: 'org-1' })
    useFavoritesStore.setState({ favorites: [], recentDashboards: [] })
    vi.spyOn(dashboardApi, 'listDashboards').mockResolvedValue(mockDashboards)
    vi.spyOn(folderApi, 'listFolders').mockResolvedValue(mockFolders)
  })

  it('displays loading state initially', () => {
    vi.spyOn(dashboardApi, 'listDashboards').mockImplementation(() => new Promise(() => {}))
    vi.spyOn(folderApi, 'listFolders').mockImplementation(() => new Promise(() => {}))
    renderDashboardList()
    expect(screen.getByText('Loading dashboards...')).toBeTruthy()
  })

  it('renders dashboard cards after loading', async () => {
    renderDashboardList()
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-card-123e4567-e89b-12d3-a456-426614174000')).toBeTruthy()
    })
    expect(screen.getAllByTestId(/^dashboard-card-/).length).toBe(3)
    expect(screen.getByText('Test Dashboard')).toBeTruthy()
    expect(screen.getByText('Another Dashboard')).toBeTruthy()
  })

  it('shows folder name on cards for dashboards in folders', async () => {
    renderDashboardList()
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-card-123e4567-e89b-12d3-a456-426614174000')).toBeTruthy()
    })
    const card = screen.getByTestId('dashboard-card-123e4567-e89b-12d3-a456-426614174000')
    expect(card.textContent).toContain('Operations')
  })

  it('shows empty state when no dashboards and no folders', async () => {
    vi.spyOn(dashboardApi, 'listDashboards').mockResolvedValue([])
    vi.spyOn(folderApi, 'listFolders').mockResolvedValue([])
    renderDashboardList()
    await waitFor(() => {
      expect(screen.getByText('No dashboards yet')).toBeTruthy()
    })
    expect(screen.getByText('Create Dashboard')).toBeTruthy()
    expect(screen.getByText('Generate with AI')).toBeTruthy()
  })

  it('displays error state on fetch failure', async () => {
    vi.spyOn(dashboardApi, 'listDashboards').mockRejectedValue(new Error('Network error'))
    renderDashboardList()
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeTruthy()
    })
  })

  it('navigates to dashboard on card click', async () => {
    const router = renderDashboardList()
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-card-123e4567-e89b-12d3-a456-426614174000')).toBeTruthy()
    })
    await userEvent.click(screen.getByTestId('dashboard-card-123e4567-e89b-12d3-a456-426614174000'))
    expect(router.state.location.pathname).toBe('/app/dashboards/123e4567-e89b-12d3-a456-426614174000')
  })

  it('calls toggleFavorite on star click', async () => {
    renderDashboardList()
    await waitFor(() => {
      expect(screen.getByTestId('favorite-btn-123e4567-e89b-12d3-a456-426614174000')).toBeTruthy()
    })
    await userEvent.click(screen.getByTestId('favorite-btn-123e4567-e89b-12d3-a456-426614174000'))
    expect(useFavoritesStore.getState().favorites).toEqual([
      expect.objectContaining({
        id: '123e4567-e89b-12d3-a456-426614174000',
        type: 'dashboard',
      }),
    ])
  })

  it('renders folder chips as filters', async () => {
    renderDashboardList()
    await waitFor(() => {
      expect(screen.getByTestId('folder-chip-folder-a')).toBeTruthy()
    })
    expect(screen.getByTestId('folder-chip-folder-a').textContent).toContain('Operations')
    expect(screen.getByTestId('folder-chip-folder-b').textContent).toContain('Product')
  })

  it('filters dashboards by folder chip selection', async () => {
    renderDashboardList()
    await waitFor(() => {
      expect(screen.getByTestId('folder-chip-folder-a')).toBeTruthy()
    })
    await userEvent.click(screen.getByTestId('folder-chip-folder-a'))
    expect(screen.getAllByTestId(/^dashboard-card-/).length).toBe(1)
    expect(screen.getByText('Test Dashboard')).toBeTruthy()
  })

  it('filters dashboards by search query', async () => {
    renderDashboardList('/app/dashboards', 'Another')
    await waitFor(() => {
      expect(screen.getByText('Another Dashboard')).toBeTruthy()
    })
    expect(screen.queryByText('Test Dashboard')).toBeNull()
  })

  it('opens create modal when Create Dashboard empty state button is clicked', async () => {
    vi.spyOn(dashboardApi, 'listDashboards').mockResolvedValue([])
    vi.spyOn(folderApi, 'listFolders').mockResolvedValue([])
    renderDashboardList()
    await waitFor(() => {
      expect(screen.getByText('Create Dashboard')).toBeTruthy()
    })
    await userEvent.click(screen.getByText('Create Dashboard'))
    expect(screen.getByTestId('create-dashboard-modal')).toBeTruthy()
  })

  it('moves dashboard to a different folder via drag and drop', async () => {
    vi.spyOn(dashboardApi, 'updateDashboard').mockImplementation(async (id, data) => {
      const source = mockDashboards.find(dashboard => dashboard.id === id)
      if (!source) throw new Error('Dashboard not found')
      return { ...source, folder_id: data.folder_id ?? null }
    })

    renderDashboardList()
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-card-123e4567-e89b-12d3-a456-426614174000')).toBeTruthy()
    })

    const card = screen.getByTestId('dashboard-card-123e4567-e89b-12d3-a456-426614174000')
    const dropZone = screen.getByTestId('folder-drop-folder-b')

    fireEvent.dragStart(card)
    fireEvent.dragOver(dropZone)
    fireEvent.drop(dropZone)

    await waitFor(() => {
      expect(dashboardApi.updateDashboard).toHaveBeenCalledWith(
        '123e4567-e89b-12d3-a456-426614174000',
        { folder_id: 'folder-b' },
      )
    })
  })

  it('rolls back dashboard move on drag-and-drop API failure', async () => {
    vi.spyOn(dashboardApi, 'updateDashboard').mockRejectedValue(
      new Error('Not authorized to update this dashboard'),
    )

    renderDashboardList()
    await waitFor(() => {
      expect(screen.getByTestId('dashboard-card-123e4567-e89b-12d3-a456-426614174000')).toBeTruthy()
    })

    const card = screen.getByTestId('dashboard-card-123e4567-e89b-12d3-a456-426614174000')
    const dropZone = screen.getByTestId('folder-drop-folder-b')

    fireEvent.dragStart(card)
    fireEvent.dragOver(dropZone)
    fireEvent.drop(dropZone)

    await waitFor(() => {
      expect(screen.getByText('Not authorized to update this dashboard')).toBeTruthy()
    })
    expect(screen.getByTestId('dashboard-card-123e4567-e89b-12d3-a456-426614174000').textContent).toContain(
      'Operations',
    )
  })
})