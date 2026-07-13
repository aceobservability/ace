import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppSidebar } from '@/components/AppSidebar'
import { useAuthStore } from '@/stores/authStore'
import { useOrgStore } from '@/stores/orgStore'
import { useSidebarStore } from '@/stores/sidebarStore'

function renderSidebar(initialPath = '/app/dashboards') {
  const router = createMemoryRouter(
    [{ path: '/app/*', element: <AppSidebar /> }],
    { initialEntries: [initialPath] },
  )
  render(<RouterProvider router={router} />)
}

describe('AppSidebar', () => {
  beforeEach(() => {
    localStorage.clear()
    useSidebarStore.getState()._reset()
    useOrgStore.setState({ currentOrgId: 'org-1' })
    useAuthStore.setState({
      user: { id: 'u1', email: 'jane@example.com', name: 'Jane Doe', created_at: '', updated_at: '' },
      userOrganizations: [
        { id: 'org-1', name: 'Test Org', slug: 'test', role: 'admin' },
        { id: 'org-2', name: 'Other Org', slug: 'other', role: 'viewer' },
      ],
      loading: false,
      initialized: true,
      isAuthenticated: true,
    })
    vi.restoreAllMocks()
  })

  it('renders the sidebar with nav items', () => {
    renderSidebar()
    expect(screen.getByTestId('sidebar')).toBeTruthy()
    expect(screen.getByTestId('sidebar-nav-home')).toBeTruthy()
    expect(screen.getByTestId('sidebar-nav-dashboards')).toBeTruthy()
    expect(screen.getByTestId('sidebar-nav-explore')).toBeTruthy()
  })

  it('shows search and sub-nav when expanded', async () => {
    const user = userEvent.setup()
    renderSidebar('/app/explore/metrics')
    await user.click(screen.getByTestId('sidebar-nav-explore'))
    expect(screen.getByTestId('sidebar-search')).toBeTruthy()
    expect(screen.getByTestId('sidebar-subnav-metrics')).toBeTruthy()
    expect(screen.getByTestId('sidebar-subnav-logs')).toBeTruthy()
    expect(screen.getByTestId('sidebar-subnav-traces')).toBeTruthy()
  })

  it('opens org switcher and selects a different org', async () => {
    const user = userEvent.setup()
    renderSidebar()
    await user.click(screen.getByTestId('sidebar-org-selector'))
    expect(screen.getByTestId('org-switcher-popup')).toBeTruthy()
    await user.click(screen.getByTestId('org-switcher-org-2'))
    expect(useOrgStore.getState().currentOrgId).toBe('org-2')
    expect(screen.queryByTestId('org-switcher-popup')).toBeNull()
  })

  it('renders user initials on avatar', () => {
    renderSidebar()
    expect(screen.getByTestId('sidebar-user-avatar').textContent).toContain('JD')
  })

  it('has aria-label on the nav landmark', () => {
    renderSidebar()
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeTruthy()
  })
})