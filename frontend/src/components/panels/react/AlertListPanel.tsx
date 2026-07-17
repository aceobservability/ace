import type { CSSProperties } from 'react'
import { chartPalette, thresholdColors } from '@/utils/chartTheme'

export type AlertItem = {
  id: string
  name: string
  severity: 'critical' | 'warning' | 'info'
  state: 'firing' | 'resolved' | 'pending'
  timestamp: string
  message?: string
}

type AlertListPanelProps = {
  alerts?: AlertItem[]
  emptyTitle?: string
  emptyDescription?: string
  emptyActionLabel?: string
}

function severityColor(severity: AlertItem['severity']): string {
  if (severity === 'critical') return thresholdColors.critical
  if (severity === 'warning') return thresholdColors.warning
  return chartPalette[0]
}

function stateBadgeStyle(state: AlertItem['state']): CSSProperties {
  if (state === 'firing') {
    return {
      backgroundColor: `${thresholdColors.critical}22`,
      color: thresholdColors.critical,
      border: `1px solid ${thresholdColors.critical}55`,
    }
  }
  if (state === 'resolved') {
    return {
      backgroundColor: `${thresholdColors.good}22`,
      color: thresholdColors.good,
      border: `1px solid ${thresholdColors.good}55`,
    }
  }
  return {
    backgroundColor: `${thresholdColors.warning}22`,
    color: thresholdColors.warning,
    border: `1px solid ${thresholdColors.warning}55`,
  }
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

export function AlertListPanel({
  alerts = [],
  emptyTitle = 'No alerts',
  emptyDescription,
  emptyActionLabel,
}: AlertListPanelProps) {
  if (alerts.length === 0) {
    return (
      <div
        className="flex h-full w-full flex-col items-center justify-center gap-1 p-4 text-center text-sm"
        data-testid="alert-list-empty"
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
      data-testid="alert-list-container"
      style={{ fontFamily: "'DM Sans', sans-serif" }}
    >
      {alerts.map(alert => (
        <div
          key={alert.id}
          data-testid="alert-item"
          className="flex flex-col gap-1 px-3 py-2.5"
          style={{ borderBottom: '1px solid var(--color-surface-container-high)' }}
        >
          <div className="flex items-center gap-2">
            <span
              data-testid="severity-dot"
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: severityColor(alert.severity) }}
            />
            <span
              data-testid="alert-name"
              className="min-w-0 flex-1 truncate text-sm font-medium"
              style={{ color: 'var(--color-on-surface)' }}
            >
              {alert.name}
            </span>
            <span
              data-testid="state-badge"
              className="shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
              style={stateBadgeStyle(alert.state)}
            >
              {alert.state}
            </span>
            <span
              data-testid="alert-timestamp"
              className="shrink-0 text-xs"
              style={{ color: 'var(--color-on-surface-variant)' }}
            >
              {formatTimestamp(alert.timestamp)}
            </span>
          </div>
          {alert.message ? (
            <div
              data-testid="alert-message"
              className="pl-5 text-xs"
              style={{ color: 'var(--color-on-surface-variant)' }}
            >
              {alert.message}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}
