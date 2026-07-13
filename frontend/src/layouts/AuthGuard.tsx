import { useEffect } from 'react'
import { Navigate, Outlet, useLocation, useMatches } from 'react-router-dom'
import type { RouteMeta } from '@/router'
import { useAuthStore } from '@/stores/authStore'

export function AuthGuard() {
  const location = useLocation()
  const matches = useMatches()
  const meta = matches.at(-1)?.handle as RouteMeta | undefined
  const { initialize, initialized, loading, isAuthenticated } = useAuthStore()

  useEffect(() => {
    void initialize()
  }, [initialize])

  if (!initialized || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface text-sm text-on-surface-variant">
        Loading…
      </div>
    )
  }

  const isPublic = meta?.public === true

  if (isPublic && location.pathname === '/login' && isAuthenticated) {
    const params = new URLSearchParams(location.search)
    const redirect = params.get('redirect')
    const destination = redirect?.startsWith('/') ? redirect : '/app'
    return <Navigate to={destination} replace />
  }

  if (!isPublic && !isAuthenticated) {
    const redirect = `${location.pathname}${location.search}${location.hash}`
    return <Navigate to={`/login?redirect=${encodeURIComponent(redirect)}`} replace />
  }

  return <Outlet />
}