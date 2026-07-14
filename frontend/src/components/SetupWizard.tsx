import { Database, Sparkles, X } from 'lucide-react'
import { Link } from 'react-router-dom'

const DISMISS_KEY = 'ace-setup-wizard-dismissed'

type SetupWizardProps = {
  onDismissed: () => void
}

export function SetupWizard({ onDismissed }: SetupWizardProps) {
  function dismiss() {
    localStorage.setItem(DISMISS_KEY, 'true')
    onDismissed()
  }

  return (
    <div
      className="mx-auto flex max-w-lg flex-col items-center px-6 py-16 text-center"
      data-testid="setup-wizard"
    >
      <button
        type="button"
        className="mb-6 self-end cursor-pointer rounded-md border-none bg-transparent p-1"
        style={{ color: 'var(--color-on-surface-variant)' }}
        onClick={dismiss}
        aria-label="Dismiss setup wizard"
      >
        <X size={18} aria-hidden />
      </button>

      <Sparkles aria-hidden style={{ color: 'var(--color-primary)', width: 48, height: 48 }} />
      <h1
        className="mt-6 font-display text-2xl font-bold"
        style={{ color: 'var(--color-on-surface)' }}
      >
        Welcome to Ace
      </h1>
      <p className="mt-3 max-w-md text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
        Connect your first data source to start exploring metrics, logs, and traces.
      </p>

      <Link
        to="/app/settings/datasources"
        className="mt-8 inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white no-underline transition-opacity hover:opacity-90"
        style={{
          background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
        }}
      >
        <Database size={16} aria-hidden />
        Add Data Source
      </Link>

      <button
        type="button"
        className="mt-4 cursor-pointer border-none bg-transparent text-sm underline"
        style={{ color: 'var(--color-on-surface-variant)' }}
        onClick={dismiss}
      >
        Skip for now
      </button>
    </div>
  )
}

export function isSetupWizardDismissed(): boolean {
  return localStorage.getItem(DISMISS_KEY) === 'true'
}