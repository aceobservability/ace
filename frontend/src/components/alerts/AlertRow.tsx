import { Star } from 'lucide-react'
import { StatusDot } from '@/components/StatusDot'
import { stateToStatusDot } from '@/lib/alerts'
import type { VMAlertAlert } from '@/types/datasource'

type AlertRowProps = {
  alert: VMAlertAlert
  expanded: boolean
  favorited: boolean
  onToggleExpand: () => void
  onToggleFavorite: () => void
}

export function AlertRow({
  alert,
  expanded,
  favorited,
  onToggleExpand,
  onToggleFavorite,
}: AlertRowProps) {
  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: expandable table row pattern */}
      <tr
        data-testid="alert-row"
        className="cursor-pointer transition-colors"
        style={{
          backgroundColor: expanded ? 'var(--color-surface-container-high)' : 'transparent',
        }}
        onClick={onToggleExpand}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggleExpand()
          }
        }}
        role="button"
        tabIndex={0}
      >
        <td className="px-4 py-3">
          <StatusDot status={stateToStatusDot(alert.state)} size={8} />
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold" style={{ color: 'var(--color-on-surface)' }}>
              {alert.name}
            </span>
            <button
              type="button"
              className="shrink-0 cursor-pointer border-none bg-transparent p-0.5"
              title={favorited ? 'Remove from favorites' : 'Add to favorites'}
              onClick={e => {
                e.stopPropagation()
                onToggleFavorite()
              }}
            >
              <Star
                size={12}
                fill={favorited ? 'currentColor' : 'none'}
                style={{
                  color: favorited ? 'var(--color-primary)' : 'var(--color-outline)',
                }}
              />
            </button>
          </div>
        </td>
        <td className="px-4 py-3">
          {alert.labels && Object.keys(alert.labels).length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(alert.labels).map(([key, value]) => (
                <span
                  key={key}
                  className="inline-flex rounded-sm px-2 py-0.5 font-mono text-xs"
                  style={{
                    backgroundColor: 'var(--color-surface-container-high)',
                    color: 'var(--color-on-surface-variant)',
                  }}
                >
                  {key}={value}
                </span>
              ))}
            </div>
          ) : null}
        </td>
        <td className="px-4 py-3 text-right">
          <span className="font-mono text-xs" style={{ color: 'var(--color-outline)' }}>
            {alert.activeAt || '--'}
          </span>
        </td>
      </tr>
      {expanded ? (
        <tr data-testid="alert-detail">
          <td
            colSpan={4}
            className="px-4 py-4"
            style={{ backgroundColor: 'var(--color-surface-container-low)' }}
          >
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <span
                  className="text-xs font-semibold tracking-wider uppercase"
                  style={{ color: 'var(--color-outline)' }}
                >
                  State
                </span>
                <span
                  className="rounded-sm px-2 py-0.5 font-mono text-xs font-semibold"
                  style={{
                    backgroundColor:
                      alert.state === 'firing'
                        ? 'color-mix(in srgb, var(--color-error) 15%, transparent)'
                        : alert.state === 'pending'
                          ? 'color-mix(in srgb, var(--color-tertiary) 15%, transparent)'
                          : 'var(--color-surface-container-high)',
                    color:
                      alert.state === 'firing'
                        ? 'var(--color-error)'
                        : alert.state === 'pending'
                          ? 'var(--color-tertiary)'
                          : 'var(--color-on-surface-variant)',
                  }}
                >
                  {alert.state}
                </span>
              </div>
              {alert.labels && Object.keys(alert.labels).length > 0 ? (
                <div>
                  <span
                    className="text-xs font-semibold tracking-wider uppercase"
                    style={{ color: 'var(--color-outline)' }}
                  >
                    Labels
                  </span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {Object.entries(alert.labels).map(([key, value]) => (
                      <span
                        key={key}
                        className="inline-flex rounded-sm px-2 py-0.5 font-mono text-xs"
                        style={{
                          backgroundColor: 'var(--color-surface-container-high)',
                          color: 'var(--color-on-surface-variant)',
                        }}
                      >
                        {key}={value}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {alert.annotations && Object.keys(alert.annotations).length > 0 ? (
                <div>
                  <span
                    className="text-xs font-semibold tracking-wider uppercase"
                    style={{ color: 'var(--color-outline)' }}
                  >
                    Annotations
                  </span>
                  <div className="mt-1 flex flex-col gap-1">
                    {Object.entries(alert.annotations).map(([key, value]) => (
                      <div
                        key={key}
                        className="text-xs leading-relaxed"
                        style={{ color: 'var(--color-outline)' }}
                      >
                        <strong style={{ color: 'var(--color-on-surface-variant)' }}>{key}:</strong>{' '}
                        {value}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {alert.expression ? (
                <div>
                  <span
                    className="text-xs font-semibold tracking-wider uppercase"
                    style={{ color: 'var(--color-outline)' }}
                  >
                    Expression
                  </span>
                  <pre
                    className="mt-1 overflow-x-auto rounded-sm px-3 py-2 font-mono text-xs whitespace-pre-wrap"
                    style={{
                      backgroundColor: 'var(--color-surface-container-high)',
                      color: 'var(--color-on-surface-variant)',
                    }}
                  >
                    {alert.expression}
                  </pre>
                </div>
              ) : null}
              <div className="font-mono text-xs" style={{ color: 'var(--color-outline)' }}>
                Active since: {alert.activeAt || '--'}
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  )
}
