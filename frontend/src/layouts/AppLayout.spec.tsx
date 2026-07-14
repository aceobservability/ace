import { render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as datasourcesApi from '@/api/datasources'
import * as organizationsApi from '@/api/organizations'
import { AppLayout } from '@/layouts/AppLayout'
import { PlaceholderPage } from '@/pages/PlaceholderPage'
import { useAuthStore } from '@/stores/authStore'
import { useOrgStore } from '@/stores/orgStore'
import { useSidebarStore } from '@/stores/sidebarStore'
import { createTestQueryClient } from '@/test/renderWithProviders'

vi.mock('@/analytics', () => ({
  identifyUser: vi.fn(),
  resetUserAnalytics: vi.fn(),
  trackEvent: vi.fn(),
}))

function renderAppLayout(initialPath = '/app') {
  const queryClient = createTestQueryClient()
  const router = createMemoryRouter(
    [
      {
        element: <AppLayout />,
        children: [
          {
            path: '/app',
            element: <PlaceholderPage title="Command Center" />,
          },
        ],
      },
    ],
    { initialEntries: [initialPath] },
  )

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('AppLayout', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    useSidebarStore.getState()._reset()
    useOrgStore.setState({ currentOrgId: 'org-1' })
    useAuthStore.setState({
      user: { id: 'u1', email: 'user@example.com', name: 'User', created_at: '', updated_at: '' },
      userOrganizations: [{ id: 'org-1', name: 'Test Org', slug: 'test', role: 'admin' }],
      loading: false,
      initialized: true,
      isAuthenticated: true,
    })
    vi.spyOn(organizationsApi, 'listOrganizations').mockResolvedValue([
      {
        id: 'org-1',
        name: 'Test Org',
        slug: 'test',
        created_at: '',
        updated_at: '',
      },
    ])
    vi.spyOn(datasourcesApi, 'listDataSources').mockResolvedValue([])
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1440 })
  })

  it('renders placeholder route inside app layout with sidebar', async () => {
    renderAppLayout()
    expect(screen.getByRole('heading', { name: 'Command Center' })).toBeTruthy()
    expect(screen.getByRole('main')).toBeTruthy()
    expect(await screen.findByTestId('sidebar')).toBeTruthy()
  })

  it('fetches datasources when org is set', async () => {
    const listSpy = vi.spyOn(datasourcesApi, 'listDataSources').mockResolvedValue([])
    renderAppLayout()
    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledWith('org-1')
    })
  })

  it('shows narrow viewport overlay below 1280px', async () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 })
    renderAppLayout()
    expect(await screen.findByTestId('narrow-viewport-overlay')).toBeTruthy()
  })
})