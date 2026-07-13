import { render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { AuthGuard } from '@/layouts/AuthGuard'
import { createParamRedirect, resolveParamPath } from '@/lib/redirects'
import { useAuthStore } from '@/stores/authStore'

const DashboardAliasRedirect = createParamRedirect('/app/dashboards/:id')

describe('resolveParamPath', () => {
  it('substitutes route params into the target template', () => {
    expect(resolveParamPath('/app/dashboards/:id', { id: 'foo-42' })).toBe('/app/dashboards/foo-42')
    expect(resolveParamPath('/app/explore/:type', { type: 'metrics' })).toBe('/app/explore/metrics')
  })
})

describe('backward-compat alias redirects', () => {
  it('forwards dashboard id params', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/dashboards/:id',
          element: <DashboardAliasRedirect />,
        },
        {
          path: '/app/dashboards/:id',
          element: <div>Dashboard detail</div>,
        },
      ],
      { initialEntries: ['/dashboards/foo-42'] },
    )

    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/app/dashboards/foo-42')
    })
  })
})

describe('AuthGuard', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.setState({
      user: null,
      userOrganizations: [],
      loading: false,
      initialized: true,
      isAuthenticated: false,
    })
  })

  it('redirects unauthenticated users to login with redirect query', async () => {
    const router = createMemoryRouter(
      [
        {
          element: <AuthGuard />,
          children: [
            { path: '/app', element: <div>Protected</div> },
            { path: '/login', handle: { public: true }, element: <div>Login</div> },
          ],
        },
      ],
      { initialEntries: ['/app'] },
    )

    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login')
      expect(router.state.location.search).toBe('?redirect=%2Fapp')
    })
  })

  it('allows public login route without authentication', async () => {
    const router = createMemoryRouter(
      [
        {
          element: <AuthGuard />,
          children: [{ path: '/login', handle: { public: true }, element: <div>Login page</div> }],
        },
      ],
      { initialEntries: ['/login'] },
    )

    render(<RouterProvider router={router} />)

    expect(await screen.findByText('Login page')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/login')
  })
})