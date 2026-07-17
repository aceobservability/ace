import { Star } from 'lucide-react'
import { chartPalette } from '@/utils/chartTheme'

export type DashboardLink = {
  id: string
  title: string
  url: string
  tags?: string[]
  starred?: boolean
}

type DashboardListPanelProps = {
  dashboards?: DashboardLink[]
  emptyTitle?: string
  emptyDescription?: string
  emptyActionLabel?: string
}

export function DashboardListPanel({
  dashboards = [],
  emptyTitle = 'No dashboards',
  emptyDescription,
  emptyActionLabel,
}: DashboardListPanelProps) {
  if (dashboards.length === 0) {
    return (
      <div
        className="flex h-full w-full flex-col items-center justify-center gap-1 p-4 text-center text-sm"
        data-testid="dashboard-list-empty"
        style={{ color: 'var(--color-on-surface-variant)', fontFamily: "'DM Sans', sans-serif" }}
      >
        <div className="font-semibold" style={{ color: 'var(--color-on-surface)' }}>
          {emptyTitle}
        </div>
        {emptyDescription ? <div className="max-w-sm text-xs leading-5">{emptyDescription}</div> : null}
        {emptyActionLabel ? (
          <div
            className="mt-1 text-[11px] font-semibold uppercase tracking-wide"
            style={{ color: 'var(--color-primary)' }}
          >
            {emptyActionLabel}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div
      className="h-full w-full overflow-y-auto"
      data-testid="dashboard-list-container"
      style={{ fontFamily: "'DM Sans', sans-serif" }}
    >
      {dashboards.map(dashboard => (
        <div
          key={dashboard.id}
          data-testid="dashboard-item"
          className="flex flex-col gap-1 px-3 py-2.5"
          style={{ borderBottom: '1px solid var(--color-surface-container-high)' }}
        >
          <div className="flex items-center gap-2">
            <span data-testid="star-icon" className="shrink-0">
              <Star
                size={14}
                fill={dashboard.starred ? chartPalette[4] : 'none'}
                color={dashboard.starred ? chartPalette[4] : 'var(--color-on-surface-variant)'}
              />
            </span>
            <a
              data-testid="dashboard-link"
              href={dashboard.url}
              className="min-w-0 flex-1 truncate text-sm font-medium no-underline"
              style={{ color: 'var(--color-on-surface)' }}
            >
              {dashboard.title}
            </a>
          </div>
          {dashboard.tags && dashboard.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1 pl-6">
              {dashboard.tags.map(tag => (
                <span
                  key={tag}
                  data-testid="dashboard-tag"
                  className="rounded-full px-1.5 py-0.5 text-[11px] font-medium"
                  style={{
                    backgroundColor: 'var(--color-surface-container-high)',
                    color: 'var(--color-on-surface-variant)',
                    border: '1px solid var(--color-surface-container-high)',
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}
