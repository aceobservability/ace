import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as authApi from '@/api/auth'
import { LoginPage } from '@/pages/LoginPage'
import { useAuthStore } from '@/stores/authStore'

vi.mock('@/analytics', () => ({
  identifyUser: vi.fn(),
  resetUserAnalytics: vi.fn(),
  trackEvent: vi.fn(),
}))

function renderLogin(initialEntry = '/login') {
  const router = createMemoryRouter(
    [
      { path: '/login', element: <LoginPage /> },
      { path: '/app', element: <div>Command Center</div> },
      { path: '/app/dashboards', element: <div>Dashboards</div> },
    ],
    { initialEntries: [initialEntry] },
  )

  render(<RouterProvider router={router} />)
  return router
}

describe('LoginPage', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.setState({
      user: null,
      userOrganizations: [],
      loading: false,
      initialized: true,
      isAuthenticated: false,
    })
    vi.restoreAllMocks()
  })

  it('submits credentials and navigates to the redirect target', async () => {
    const user = userEvent.setup()
    vi.spyOn(authApi, 'login').mockResolvedValue({
      access_token: 'access-1',
      refresh_token: 'refresh-1',
      token_type: 'Bearer',
      expires_in: 900,
    })
    vi.spyOn(authApi, 'getMeWithRefresh').mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      organizations: [],
    })

    const router = renderLogin('/login?redirect=%2Fapp%2Fdashboards')

    await user.type(screen.getByTestId('email-input'), 'user@example.com')
    await user.type(screen.getByTestId('password-input'), 'Password1')
    await user.click(screen.getByTestId('login-submit-btn'))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/app/dashboards')
    })
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })

  it('renders SSO providers when org query param is present', async () => {
    vi.spyOn(authApi, 'fetchSSOProviders').mockResolvedValue([{ provider: 'google' }])
    renderLogin('/login?org=acme')

    expect(await screen.findByTestId('sso-providers')).toBeTruthy()
    expect(screen.getByTestId('sso-btn-google')).toBeTruthy()
  })
})