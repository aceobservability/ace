import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AppLayout } from '@/layouts/AppLayout'
import { PlaceholderPage } from '@/pages/PlaceholderPage'

describe('React foundation', () => {
  it('renders placeholder route inside app layout', () => {
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

    render(<RouterProvider router={router} />)
    expect(screen.getByRole('heading', { name: 'Command Center' })).toBeTruthy()
    expect(screen.getByRole('main')).toBeTruthy()
  })
})