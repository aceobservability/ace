import { chartPalette, thresholdColors } from '@/utils/chartTheme'

export type AnnotationItem = {
  id: string
  title: string
  description?: string
  timestamp: string
  type: 'deploy' | 'incident' | 'config_change' | 'other'
  tags?: string[]
}

type AnnotationListPanelProps = {
  annotations?: AnnotationItem[]
  emptyTitle?: string
  emptyDescription?: string
  emptyActionLabel?: string
}

function typeColor(type: AnnotationItem['type']): string {
  if (type === 'deploy') return chartPalette[0]
  if (type === 'incident') return thresholdColors.critical
  if (type === 'config_change') return thresholdColors.warning
  return chartPalette[7]
}

function formatTimestamp(iso: string): string {
  const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return `${Math.floor(diffHr / 24)}d ago`
}

export function AnnotationListPanel({
  annotations = [],
  emptyTitle = 'No annotations',
  emptyDescription,
  emptyActionLabel,
}: AnnotationListPanelProps) {
  if (annotations.length === 0) {
    return (
      <div
        className="flex h-full w-full flex-col items-center justify-center gap-1 p-4 text-center text-sm"
        data-testid="annotation-list-empty"
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
      data-testid="annotation-list-container"
      style={{ fontFamily: "'DM Sans', sans-serif" }}
    >
      {annotations.map(annotation => (
        <div
          key={annotation.id}
          data-testid="annotation-item"
          className="flex flex-col gap-1 px-3 py-2.5"
          style={{ borderBottom: '1px solid var(--color-surface-container-high)' }}
        >
          <div className="flex items-center gap-2">
            <span
              data-testid="type-dot"
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: typeColor(annotation.type) }}
            />
            <span
              data-testid="annotation-title"
              className="min-w-0 flex-1 truncate text-sm font-medium"
              style={{ color: 'var(--color-on-surface)' }}
            >
              {annotation.title}
            </span>
            <span
              data-testid="annotation-timestamp"
              className="shrink-0 text-xs"
              style={{ color: 'var(--color-on-surface-variant)' }}
            >
              {formatTimestamp(annotation.timestamp)}
            </span>
          </div>
          {annotation.description ? (
            <div
              data-testid="annotation-description"
              className="pl-5 text-xs"
              style={{ color: 'var(--color-on-surface-variant)' }}
            >
              {annotation.description}
            </div>
          ) : null}
          {annotation.tags && annotation.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1 pl-5">
              {annotation.tags.map(tag => (
                <span
                  key={tag}
                  data-testid="annotation-tag"
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
