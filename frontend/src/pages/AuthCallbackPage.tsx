import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { storeSessionFromTokens } from '@/api/auth'
import { clearTokens } from '@/lib/tokenStorage'
import { consumeSsoRedirect } from '@/lib/ssoRedirect'
import { useAuthStore } from '@/stores/authStore'

function parseHashTokens(hash: string): { accessToken: string | null; refreshToken: string | null } {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  return {
    accessToken: params.get('access_token'),
    refreshToken: params.get('refresh_token'),
  }
}

function stripHashFromUrl(): void {
  history.replaceState(null, '', window.location.pathname + window.location.search)
}

export function AuthCallbackPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { applySession } = useAuthStore()
  const [error, setError] = useState('')

  useEffect(() => {
    const { accessToken, refreshToken } = parseHashTokens(location.hash)
    stripHashFromUrl()

    if (!accessToken || !refreshToken) {
      setError('Sign-in failed — missing tokens from identity provider.')
      return
    }

    void (async () => {
      try {
        storeSessionFromTokens(accessToken, refreshToken)
        await applySession()
        const destination = consumeSsoRedirect() ?? '/app'
        navigate(destination, { replace: true })
      } catch {
        clearTokens()
        setError('Sign-in failed — could not establish a session.')
      }
    })()
  }, [applySession, location.hash, navigate])

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-4 text-sm text-error">
        {error}
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface text-sm text-on-surface-variant">
      Completing sign-in…
    </div>
  )
}