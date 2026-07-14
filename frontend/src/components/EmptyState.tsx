import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

type EmptyStateProps = {
  icon: LucideIcon
  title: string
  description: string
  actionLabel?: string
  actionRoute?: string
}

export function EmptyState({ icon: Icon, title, description, actionLabel, actionRoute }: EmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center px-6 py-16 text-center"
      data-testid="empty-state"
    >
      <Icon aria-hidden style={{ color: 'var(--color-outline)', width: 40, height: 40 }} />
      <h3
        className="mt-4 font-display text-lg font-semibold"
        style={{ color: 'var(--color-on-surface)' }}
        data-testid="empty-state-title"
      >
        {title}
      </h3>
      <p
        className="mt-2 max-w-sm text-sm"
        style={{ color: 'var(--color-on-surface-variant)' }}
        data-testid="empty-state-description"
      >
        {description}
      </p>
      {actionLabel && actionRoute ? (
        <Link
          to={actionRoute}
          className="mt-6 inline-flex items-center rounded-lg px-5 py-2.5 text-sm font-medium text-white no-underline transition-opacity hover:opacity-90"
          style={{
            background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
          }}
          data-testid="empty-state-action"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  )
}