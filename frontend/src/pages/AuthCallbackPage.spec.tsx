import { render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as authApi from '@/api/auth'
import { AuthCallbackPage } from '@/pages/AuthCallbackPage'
import { useAuthStore } from '@/stores/authStore'

vi.mock('@/analytics', () => ({
  identifyUser: vi.fn(),
  resetUserAnalytics: vi.fn(),
  trackEvent: vi.fn(),
}))

describe('AuthCallbackPage', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    useAuthStore.setState({
      user: null,
      userOrganizations: [],
      loading: false,
      initialized: false,
      isAuthenticated: false,
    })
    vi.restoreAllMocks()
  })

  it('parses hash tokens, applies session, and navigates to stored redirect', async () => {
    sessionStorage.setItem('sso_redirect', '/app/dashboards')
    const applySession = vi.spyOn(useAuthStore.getState(), 'applySession').mockResolvedValue()
    const storeSpy = vi.spyOn(authApi, 'storeSessionFromTokens').mockImplementation(() => {})

    const router = createMemoryRouter(
      [
        { path: '/auth/callback', element: <AuthCallbackPage /> },
        { path: '/app/dashboards', element: <div>Dashboards</div> },
      ],
      { initialEntries: ['/auth/callback#access_token=abc&refresh_token=def'] },
    )

    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(storeSpy).toHaveBeenCalledWith('abc', 'def')
      expect(applySession).toHaveBeenCalled()
      expect(router.state.location.pathname).toBe('/app/dashboards')
    })
  })

  it('shows an error when tokens are missing from the hash', async () => {
    const router = createMemoryRouter([{ path: '/auth/callback', element: <AuthCallbackPage /> }], {
      initialEntries: ['/auth/callback#token_type=Bearer'],
    })

    render(<RouterProvider router={router} />)

    expect(await screen.findByText(/missing tokens/i)).toBeTruthy()
  })

  it('clears tokens when applySession fails', async () => {
    localStorage.setItem('access_token', 'old')
    localStorage.setItem('refresh_token', 'old')
    vi.spyOn(useAuthStore.getState(), 'applySession').mockRejectedValue(new Error('fail'))

    const router = createMemoryRouter([{ path: '/auth/callback', element: <AuthCallbackPage /> }], {
      initialEntries: ['/auth/callback#access_token=abc&refresh_token=def'],
    })

    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByText(/could not establish a session/i)).toBeTruthy()
      expect(localStorage.getItem('access_token')).toBeNull()
    })
  })
})