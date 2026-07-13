import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { initializeAnalytics } from '@/analytics'
import { createAnalyticsRouterAdapter } from '@/lib/analyticsRouter'
import { router } from '@/router'

export function App() {
  useEffect(() => {
    void initializeAnalytics(createAnalyticsRouterAdapter(router))
  }, [])

  return <RouterProvider router={router} />
}