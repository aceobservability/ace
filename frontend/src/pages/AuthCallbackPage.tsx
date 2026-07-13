import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { storeSessionFromTokens } from '@/api/auth'
import { useAuthStore } from '@/stores/authStore'

function parseHashTokens(hash: string): { accessToken: string | null; refreshToken: string | null } {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  return {
    accessToken: params.get('access_token'),
    refreshToken: params.get('refresh_token'),
  }
}

export function AuthCallbackPage() {
  const navigate = useNavigate()
  const { applySession } = useAuthStore()
  const [error, setError] = useState('')

  useEffect(() => {
    const { accessToken, refreshToken } = parseHashTokens(window.location.hash)

    if (!accessToken || !refreshToken) {
      setError('Sign-in failed — missing tokens from identity provider.')
      return
    }

    void (async () => {
      try {
        storeSessionFromTokens(accessToken, refreshToken)
        await applySession()
        navigate('/app', { replace: true })
      } catch {
        setError('Sign-in failed — could not establish a session.')
      }
    })()
  }, [applySession, navigate])

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