import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as organizationsApi from '@/api/organizations'
import { AppSidebar } from '@/components/AppSidebar'
import { useKeyboardShortcutsStore } from '@/lib/keyboardShortcuts'
import { FAVORITES_KEY, RECENTS_KEY } from '@/lib/favorites'
import { useAuthStore } from '@/stores/authStore'
import { useFavoritesStore } from '@/stores/favoritesStore'
import { useOrgStore } from '@/stores/orgStore'
import { useSidebarStore } from '@/stores/sidebarStore'
import { useThemeStore } from '@/stores/themeStore'
import { createTestQueryClient } from '@/test/renderWithProviders'

function renderSidebar(initialPath = '/app/dashboards') {
  const queryClient = createTestQueryClient()
  const router = createMemoryRouter(
    [{ path: '/app/*', element: <AppSidebar /> }],
    { initialEntries: [initialPath] },
  )
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('AppSidebar', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    useSidebarStore.getState()._reset()
    useThemeStore.setState({ mode: 'dark', isDark: true })
    useOrgStore.setState({ currentOrgId: 'org-1' })
    useAuthStore.setState({
      user: { id: 'u1', email: 'jane@example.com', name: 'Jane Doe', created_at: '', updated_at: '' },
      userOrganizations: [{ id: 'org-1', name: 'Test Org', slug: 'test', role: 'admin' }],
      loading: false,
      initialized: true,
      isAuthenticated: true,
    })
    vi.spyOn(organizationsApi, 'listOrganizations').mockResolvedValue([
      { id: 'org-1', name: 'Test Org', slug: 'test', created_at: '', updated_at: '' },
      { id: 'org-2', name: 'Other Org', slug: 'other', created_at: '', updated_at: '' },
    ])
  })

  it('renders the sidebar with nav items', async () => {
    renderSidebar()
    expect(await screen.findByTestId('sidebar')).toBeTruthy()
    expect(screen.getByTestId('sidebar-nav-home')).toBeTruthy()
    expect(screen.getByTestId('sidebar-nav-dashboards')).toBeTruthy()
    expect(screen.getByTestId('sidebar-nav-explore')).toBeTruthy()
  })

  it('shows search and sub-nav when expanded', async () => {
    const user = userEvent.setup()
    renderSidebar('/app/explore/metrics')
    await user.click(await screen.findByTestId('sidebar-nav-explore'))
    expect(screen.getByTestId('sidebar-search')).toBeTruthy()
    expect(screen.getByTestId('sidebar-subnav-metrics')).toBeTruthy()
    expect(screen.getByTestId('sidebar-subnav-logs')).toBeTruthy()
    expect(screen.getByTestId('sidebar-subnav-traces')).toBeTruthy()
  })

  it('opens org switcher and selects a different org', async () => {
    const user = userEvent.setup()
    renderSidebar()
    const orgSelector = await screen.findByTestId('sidebar-org-selector')
    await waitFor(() => {
      expect(orgSelector.textContent).toContain('T')
    })
    await user.click(orgSelector)
    expect(screen.getByTestId('org-switcher-popup')).toBeTruthy()
    await user.click(screen.getByTestId('org-switcher-org-2'))
    expect(useOrgStore.getState().currentOrgId).toBe('org-2')
    expect(screen.queryByTestId('org-switcher-popup')).toBeNull()
  })

  it('renders favorites and recents in dashboard flyout', async () => {
    localStorage.setItem(
      FAVORITES_KEY,
      JSON.stringify([{ id: 'dash-1', title: 'Ops Overview', type: 'dashboard' }]),
    )
    localStorage.setItem(
      RECENTS_KEY,
      JSON.stringify([{ id: 'dash-2', title: 'SLO Board', visitedAt: Date.now() }]),
    )
    useFavoritesStore.getState()._reset()

    const user = userEvent.setup()
    renderSidebar('/app/dashboards')
    await user.click(await screen.findByTestId('sidebar-nav-dashboards'))

    expect(screen.getByTestId('sidebar-fav-dash-1')).toBeTruthy()
    expect(screen.getByTestId('sidebar-recent-dash-2')).toBeTruthy()
  })

  it('toggles theme from the user menu', async () => {
    const user = userEvent.setup()
    renderSidebar()
    await user.click(await screen.findByTestId('sidebar-user-avatar'))
    await user.click(screen.getByTestId('user-menu-theme-toggle'))
    expect(useThemeStore.getState().mode).toBe('light')
    expect(localStorage.getItem('ace-theme')).toBe('light')
  })

  it('opens shortcuts help state via Cmd+/', async () => {
    renderSidebar()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', metaKey: true, bubbles: true }))
    await waitFor(() => {
      expect(useKeyboardShortcutsStore.getState().showHelp).toBe(true)
    })
  })

  it('renders user initials on avatar', async () => {
    renderSidebar()
    expect((await screen.findByTestId('sidebar-user-avatar')).textContent).toContain('JD')
  })

  it('has aria-label on the nav landmark', async () => {
    renderSidebar()
    expect(await screen.findByRole('navigation', { name: 'Main navigation' })).toBeTruthy()
  })
})