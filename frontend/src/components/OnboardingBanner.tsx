import { Check, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

const STORAGE_KEY = 'ace-onboarding-dismissed'

const steps = [
  { label: 'Connect a data source', route: '/app/datasources/new' },
  { label: 'Create your first dashboard', route: '/app/dashboards' },
  { label: 'Set up alerts', route: '/app/alerts' },
] as const

export function OnboardingBanner() {
  const [isDismissed, setIsDismissed] = useState(() => localStorage.getItem(STORAGE_KEY) === 'true')

  if (isDismissed) return null

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, 'true')
    setIsDismissed(true)
  }

  return (
    <div
      data-testid="onboarding-banner"
      className="relative rounded-xl p-5"
      style={{
        backgroundColor: 'var(--color-surface-container)',
        border: '1px solid var(--color-outline-variant)',
      }}
    >
      <button
        type="button"
        className="absolute top-3 right-3 cursor-pointer rounded-md border-none bg-transparent p-1 transition-opacity"
        style={{ color: 'var(--color-on-surface-variant)' }}
        data-testid="onboarding-dismiss"
        onClick={dismiss}
        aria-label="Dismiss onboarding"
      >
        <X size={16} aria-hidden />
      </button>

      <h2
        className="mb-4 font-display text-lg font-semibold"
        style={{ color: 'var(--color-on-surface)' }}
      >
        Get started with Ace
      </h2>

      <div className="flex flex-col gap-2">
        {steps.map((step, index) => (
          <Link
            key={step.label}
            to={step.route}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm no-underline transition-colors hover:opacity-90"
            style={{
              backgroundColor: 'var(--color-surface-container-high)',
              color: 'var(--color-on-surface)',
            }}
          >
            <span
              className="flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
              style={{
                backgroundColor: 'var(--color-surface-container)',
                color: 'var(--color-on-surface-variant)',
                border: '1px solid var(--color-outline-variant)',
              }}
            >
              {index + 1}
            </span>
            <span className="flex-1">{step.label}</span>
            <Check size={14} aria-hidden style={{ color: 'var(--color-outline)', opacity: 0.4 }} />
          </Link>
        ))}
      </div>
    </div>
  )
}