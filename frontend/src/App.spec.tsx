import { render, screen } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as organizationsApi from '@/api/organizations'
import { AppLayout } from '@/layouts/AppLayout'
import { PlaceholderPage } from '@/pages/PlaceholderPage'
import { useAuthStore } from '@/stores/authStore'
import { createTestQueryClient } from '@/test/renderWithProviders'

vi.mock('@/analytics', () => ({
  identifyUser: vi.fn(),
  resetUserAnalytics: vi.fn(),
  trackEvent: vi.fn(),
}))

describe('React foundation', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: { id: 'u1', email: 'user@example.com', created_at: '', updated_at: '' },
      userOrganizations: [],
      loading: false,
      initialized: true,
      isAuthenticated: true,
    })
    vi.spyOn(organizationsApi, 'listOrganizations').mockResolvedValue([])
  })

  it('renders placeholder route inside app layout', async () => {
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
      { initialEntries: ['/app'] },
    )

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Command Center' })).toBeTruthy()
    expect(screen.getByRole('main')).toBeTruthy()
  })
})