import { AlertCircle, Lock, LogIn, Mail, User, UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { API_BASE } from '@/api/base'
import type { SSOProvider } from '@/api/auth'
import { fetchSSOProviders } from '@/api/auth'
import { Button } from '@/components/ui/button'
import { safeRedirectPath } from '@/lib/safeRedirect'
import { storeSsoRedirect } from '@/lib/ssoRedirect'
import { useAuthStore } from '@/stores/authStore'

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  google: 'Google',
  microsoft: 'Microsoft',
  okta: 'Okta',
}

const PROVIDER_ICON_LETTERS: Record<string, string> = {
  google: 'G',
  microsoft: 'M',
  okta: 'O',
}

export function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { login, register } = useAuthStore()

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [orgSlug, setOrgSlug] = useState<string | null>(null)
  const [ssoProviders, setSsoProviders] = useState<SSOProvider[]>([])
  const [ssoLoading, setSsoLoading] = useState(false)

  useEffect(() => {
    const org = searchParams.get('org')
    if (!org) {
      setOrgSlug(null)
      setSsoProviders([])
      setSsoLoading(false)
      return
    }

    setOrgSlug(org)
    setSsoLoading(true)
    void fetchSSOProviders(org).then(providers => {
      setSsoProviders(providers)
      setSsoLoading(false)
    })
  }, [searchParams])

  function handleSSOLogin(provider: string) {
    if (!orgSlug) return
    storeSsoRedirect(searchParams.get('redirect'))
    window.location.href = `${API_BASE}/api/auth/${provider}/login?org=${encodeURIComponent(orgSlug)}`
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (mode === 'login') {
        await login(email, password)
      } else {
        await register(email, password, name || undefined)
      }

      const destination = safeRedirectPath(searchParams.get('redirect')) ?? '/app'
      navigate(destination, { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  function switchMode() {
    setMode(current => (current === 'login' ? 'register' : 'login'))
    setError('')
  }

  return (
    <div className="login-page relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="absolute inset-0 bg-[var(--color-surface)]" />
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(163,166,255,0.06) 0%, transparent 70%), radial-gradient(ellipse 40% 40% at 20% 80%, rgba(96,99,238,0.04) 0%, transparent 60%), radial-gradient(ellipse 50% 30% at 80% 20%, rgba(105,246,184,0.03) 0%, transparent 50%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      <div className="relative z-10 w-full max-w-md rounded-lg bg-[var(--color-surface-container-low)] p-8">
        <div className="mb-8 text-center">
          <div className="mb-6 flex flex-col items-center justify-center">
            <div
              className="relative inline-flex h-11 w-11 items-center justify-center rounded-sm font-mono text-sm font-bold text-white"
              style={{
                background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dim) 100%)',
                boxShadow: '0 0 20px rgba(163,166,255,0.2), 0 2px 8px rgba(0,0,0,0.3)',
              }}
            >
              A
            </div>
            <span className="mt-2.5 font-mono text-[0.6875rem] uppercase tracking-[0.2em] text-[var(--color-outline)]">
              Ace Observability
            </span>
          </div>
          <h1 className="text-center font-display text-2xl font-bold text-[var(--color-on-surface)]">
            {mode === 'login' ? 'Welcome back' : 'Create account'}
          </h1>
          <p className="mt-2 text-center text-sm text-[var(--color-outline)]">
            {mode === 'login' ? 'Sign in to your account to continue' : 'Get started with your new account'}
          </p>
        </div>

        {ssoProviders.length > 0 && mode === 'login' && (
          <div className="mb-5 flex flex-col gap-3" data-testid="sso-providers">
            {ssoProviders.map(provider => (
              <Button
                key={provider.provider}
                type="button"
                variant="outline"
                className="w-full justify-center border-[var(--color-outline-variant)] bg-transparent py-2.5 text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-high)]"
                data-testid={`sso-btn-${provider.provider}`}
                onClick={() => handleSSOLogin(provider.provider)}
              >
                <span
                  className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-xs font-bold"
                  style={{
                    background: 'var(--color-surface-container-high)',
                    color: 'var(--color-on-surface)',
                  }}
                >
                  {PROVIDER_ICON_LETTERS[provider.provider] || provider.provider[0]?.toUpperCase()}
                </span>
                Continue with {PROVIDER_DISPLAY_NAMES[provider.provider] || provider.provider}
              </Button>
            ))}

            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-[var(--color-outline)]" />
              <span className="text-xs uppercase tracking-wider text-[var(--color-on-surface-variant)]">or</span>
              <div className="h-px flex-1 bg-[var(--color-outline)]" />
            </div>
          </div>
        )}

        {ssoLoading && mode === 'login' && orgSlug && (
          <p className="mb-4 text-center text-xs text-[var(--color-outline)]">Loading sign-in options…</p>
        )}

        <form className="flex flex-col gap-5" onSubmit={handleSubmit} data-testid="login-form">
          {error && (
            <div
              className="flex items-center gap-2 rounded-sm bg-[var(--color-error)]/10 px-4 py-3 text-sm text-[var(--color-error)]"
              data-testid="login-error"
            >
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {mode === 'register' && (
            <div className="flex flex-col">
              <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-[var(--color-on-surface-variant)]">
                Name
              </label>
              <div className="relative flex items-center">
                <User size={18} className="pointer-events-none absolute left-3.5 text-[var(--color-outline)]" />
                <input
                  id="name"
                  value={name}
                  onChange={event => setName(event.target.value)}
                  type="text"
                  placeholder="Your name (optional)"
                  disabled={loading}
                  data-testid="name-input"
                  className="w-full rounded-sm border-none bg-[var(--color-surface-container-high)] py-2.5 pr-4 pl-11 text-sm text-[var(--color-on-surface)] transition placeholder:text-[var(--color-outline)] focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>
            </div>
          )}

          <div className="flex flex-col">
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-[var(--color-on-surface-variant)]">
              Email
            </label>
            <div className="relative flex items-center">
              <Mail size={18} className="pointer-events-none absolute left-3.5 text-[var(--color-outline)]" />
              <input
                id="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                type="email"
                placeholder="you@example.com"
                required
                disabled={loading}
                data-testid="email-input"
                className="w-full rounded-sm border-none bg-[var(--color-surface-container-high)] py-2.5 pr-4 pl-11 text-sm text-[var(--color-on-surface)] transition placeholder:text-[var(--color-outline)] focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
          </div>

          <div className="flex flex-col">
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-[var(--color-on-surface-variant)]">
              Password
            </label>
            <div className="relative flex items-center">
              <Lock size={18} className="pointer-events-none absolute left-3.5 text-[var(--color-outline)]" />
              <input
                id="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                type="password"
                placeholder="Enter your password"
                required
                disabled={loading}
                data-testid="password-input"
                className="w-full rounded-sm border-none bg-[var(--color-surface-container-high)] py-2.5 pr-4 pl-11 text-sm text-[var(--color-on-surface)] transition placeholder:text-[var(--color-outline)] focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
            {mode === 'register' && (
              <p className="mt-1 text-xs text-[var(--color-outline)]">
                Min 8 characters with uppercase, lowercase, and number
              </p>
            )}
          </div>

          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-sm py-2.5 text-sm font-semibold text-white transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dim) 100%)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.1)',
            }}
            disabled={loading}
            data-testid="login-submit-btn"
          >
            {loading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                {mode === 'login' ? 'Signing in...' : 'Creating account...'}
              </>
            ) : (
              <>
                {mode === 'login' ? <LogIn size={18} /> : <UserPlus size={18} />}
                {mode === 'login' ? 'Sign in' : 'Create account'}
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-[var(--color-outline)]">
            {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button
              type="button"
              className="ml-1 cursor-pointer border-none bg-transparent p-0 text-sm font-medium text-[var(--color-primary)] hover:underline"
              onClick={switchMode}
              data-testid="auth-mode-switch-btn"
            >
              {mode === 'login' ? 'Create one' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}