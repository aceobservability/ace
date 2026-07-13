import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as datasourcesApi from '@/api/datasources'
import { AppLayout } from '@/layouts/AppLayout'
import { PlaceholderPage } from '@/pages/PlaceholderPage'
import { useAuthStore } from '@/stores/authStore'
import { useOrgStore } from '@/stores/orgStore'
import { useSidebarStore } from '@/stores/sidebarStore'

vi.mock('@/analytics', () => ({
  identifyUser: vi.fn(),
  resetUserAnalytics: vi.fn(),
  trackEvent: vi.fn(),
}))

function renderAppLayout(initialPath = '/app') {
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
  render(<RouterProvider router={router} />)
}

describe('AppLayout', () => {
  beforeEach(() => {
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
    vi.spyOn(datasourcesApi, 'listDataSources').mockResolvedValue([])
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1440 })
    vi.restoreAllMocks()
  })

  it('renders placeholder route inside app layout with sidebar', () => {
    renderAppLayout()
    expect(screen.getByRole('heading', { name: 'Command Center' })).toBeTruthy()
    expect(screen.getByRole('main')).toBeTruthy()
    expect(screen.getByTestId('sidebar')).toBeTruthy()
  })

  it('fetches datasources when org is set', async () => {
    const listSpy = vi.spyOn(datasourcesApi, 'listDataSources').mockResolvedValue([])
    renderAppLayout()
    await vi.waitFor(() => {
      expect(listSpy).toHaveBeenCalledWith('org-1')
    })
  })

  it('shows narrow viewport overlay below 1280px', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 })
    renderAppLayout()
    expect(screen.getByTestId('narrow-viewport-overlay')).toBeTruthy()
  })
})