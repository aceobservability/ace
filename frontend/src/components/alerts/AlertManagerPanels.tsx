import { BellOff, Plus, Radio, Star, Trash2 } from 'lucide-react'
import { StatusDot } from '@/components/StatusDot'
import { formatDateShort, matcherOperator, stateToStatusDot, truncateId } from '@/lib/alerts'
import type { AMAlert, AMReceiver, AMSilence, AMStatus } from '@/types/datasource'

type AMAlertsPanelProps = {
  sortedAMAlerts: AMAlert[]
  selectedDatasourceId: string
  amFilterActive: boolean
  amFilterSilenced: boolean
  amFilterInhibited: boolean
  isFavorite: (id: string) => boolean
  onToggleFavorite: (id: string, title: string) => void
  onFilterActive: (v: boolean) => void
  onFilterSilenced: (v: boolean) => void
  onFilterInhibited: (v: boolean) => void
}

export function AMAlertsPanel({
  sortedAMAlerts,
  selectedDatasourceId,
  amFilterActive,
  amFilterSilenced,
  amFilterInhibited,
  isFavorite,
  onToggleFavorite,
  onFilterActive,
  onFilterSilenced,
  onFilterInhibited,
}: AMAlertsPanelProps) {
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <span className="text-xs font-medium" style={{ color: 'var(--color-outline)' }}>
          Show:
        </span>
        {(
          [
            ['Active', amFilterActive, onFilterActive, 'alerts-filter-active-btn'],
            ['Silenced', amFilterSilenced, onFilterSilenced, 'alerts-filter-silenced-btn'],
            ['Inhibited', amFilterInhibited, onFilterInhibited, 'alerts-filter-inhibited-btn'],
          ] as const
        ).map(([label, on, setOn, testId]) => (
          <button
            key={label}
            type="button"
            className="cursor-pointer rounded-sm px-2.5 py-1 text-xs transition"
            style={{
              backgroundColor: on
                ? 'color-mix(in srgb, var(--color-primary) 15%, transparent)'
                : 'var(--color-surface-container-high)',
              color: on ? 'var(--color-primary)' : 'var(--color-outline)',
              border: on
                ? '1px solid var(--color-primary)'
                : '1px solid var(--color-outline-variant)',
            }}
            data-testid={testId}
            onClick={() => setOn(!on)}
          >
            {label}
          </button>
        ))}
      </div>

      {sortedAMAlerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
          <BellOff size={36} style={{ color: 'var(--color-outline)' }} aria-hidden />
          <h3 className="m-0 text-lg font-semibold" style={{ color: 'var(--color-on-surface)' }}>
            No alerts
          </h3>
          <p className="m-0 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
            No alerts matching current filters.
          </p>
        </div>
      ) : (
        <table className="w-full border-collapse" data-testid="am-alert-table">
          <thead>
            <tr>
              {['Status', 'Alert', 'Severity', 'Started'].map((label, i) => (
                <th
                  key={label}
                  className={`px-4 py-3 text-xs font-semibold tracking-wider uppercase ${i === 3 ? 'text-right' : 'text-left'}`}
                  style={{ color: 'var(--color-outline)' }}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedAMAlerts.map(alert => {
              const favoriteId = alert.fingerprint
                ? `alert::${selectedDatasourceId}::${alert.fingerprint}`
                : null
              const favorited = favoriteId ? isFavorite(favoriteId) : false
              const rowKey =
                alert.fingerprint ||
                `${alert.labels?.alertname ?? 'alert'}|${alert.startsAt}|${alert.status?.state ?? ''}`
              return (
                <tr key={rowKey} className="transition-colors hover:opacity-90">
                  <td className="px-4 py-3">
                    <StatusDot status={stateToStatusDot(alert.status?.state || '')} size={8} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold" style={{ color: 'var(--color-on-surface)' }}>
                        {alert.labels?.alertname || '--'}
                      </span>
                      {favoriteId ? (
                        <button
                          type="button"
                          className="shrink-0 cursor-pointer border-none bg-transparent p-0.5"
                          title={favorited ? 'Remove from favorites' : 'Add to favorites'}
                          onClick={() =>
                            onToggleFavorite(favoriteId, alert.labels?.alertname || 'Alert')
                          }
                        >
                          <Star
                            size={12}
                            fill={favorited ? 'currentColor' : 'none'}
                            style={{
                              color: favorited
                                ? 'var(--color-primary)'
                                : 'var(--color-outline)',
                            }}
                          />
                        </button>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                      {alert.labels?.severity || 'none'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono text-xs" style={{ color: 'var(--color-outline)' }}>
                      {formatDateShort(alert.startsAt)}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

type AMSilencesPanelProps = {
  amSilences: AMSilence[]
  onNewSilence: () => void
  onExpireSilence: (id: string) => void
}

export function AMSilencesPanel({
  amSilences,
  onNewSilence,
  onExpireSilence,
}: AMSilencesPanelProps) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="m-0 text-sm font-semibold" style={{ color: 'var(--color-on-surface)' }}>
          Silences
        </h3>
        <button
          type="button"
          data-testid="alerts-new-silence-btn"
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-medium transition"
          style={{
            background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
            color: '#fff',
            border: 'none',
          }}
          onClick={onNewSilence}
        >
          <Plus size={14} aria-hidden />
          New Silence
        </button>
      </div>

      {amSilences.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
          <BellOff size={36} style={{ color: 'var(--color-outline)' }} aria-hidden />
          <h3 className="m-0 text-lg font-semibold" style={{ color: 'var(--color-on-surface)' }}>
            No silences
          </h3>
          <p className="m-0 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
            No silence rules configured.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {amSilences.map(silence => (
            <div
              key={silence.id}
              className="rounded-lg p-4"
              style={{ backgroundColor: 'var(--color-surface-container-low)' }}
              data-testid="silence-card"
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="shrink-0 font-mono text-xs"
                    style={{ color: 'var(--color-outline)' }}
                    title={silence.id}
                  >
                    {truncateId(silence.id)}
                  </span>
                  <StatusDot
                    status={
                      silence.status.state === 'active'
                        ? 'info'
                        : silence.status.state === 'pending'
                          ? 'warning'
                          : 'healthy'
                    }
                    size={6}
                  />
                  <span
                    className="text-xs font-semibold"
                    style={{ color: 'var(--color-on-surface-variant)' }}
                  >
                    {silence.status.state}
                  </span>
                </div>
                {silence.status.state === 'active' || silence.status.state === 'pending' ? (
                  <button
                    type="button"
                    className="inline-flex shrink-0 cursor-pointer items-center gap-1 border-none bg-transparent text-sm transition"
                    style={{ color: 'var(--color-error)' }}
                    title="Expire silence"
                    data-testid={`expire-silence-${silence.id}`}
                    onClick={() => onExpireSilence(silence.id)}
                  >
                    <Trash2 size={12} aria-hidden />
                    Expire
                  </button>
                ) : null}
              </div>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {silence.matchers.map(m => (
                  <span
                    key={`${m.name}${matcherOperator(m)}${m.value}`}
                    className="inline-flex rounded-sm px-2 py-0.5 font-mono text-xs"
                    style={{
                      backgroundColor: 'var(--color-surface-container-high)',
                      color: 'var(--color-on-surface-variant)',
                    }}
                  >
                    {m.name}
                    {matcherOperator(m)}&quot;{m.value}&quot;
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--color-outline)' }}>
                <span>{silence.createdBy}</span>
                <span className="max-w-[200px] truncate">{silence.comment}</span>
                <span className="ml-auto shrink-0 font-mono">
                  ends {formatDateShort(silence.endsAt)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

type AMReceiversPanelProps = {
  amReceivers: AMReceiver[]
}

export function AMReceiversPanel({ amReceivers }: AMReceiversPanelProps) {
  if (amReceivers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <Radio size={36} style={{ color: 'var(--color-outline)' }} aria-hidden />
        <h3 className="m-0 text-lg font-semibold" style={{ color: 'var(--color-on-surface)' }}>
          No receivers
        </h3>
        <p className="m-0 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
          No receivers configured in AlertManager.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {amReceivers.map(receiver => (
        <div
          key={receiver.name}
          className="flex items-center gap-3 rounded-lg p-4"
          style={{ backgroundColor: 'var(--color-surface-container-low)' }}
          data-testid="receiver-card"
        >
          <Radio size={16} style={{ color: 'var(--color-outline)' }} className="shrink-0" aria-hidden />
          <span className="text-sm font-semibold" style={{ color: 'var(--color-on-surface)' }}>
            {receiver.name}
          </span>
        </div>
      ))}
    </div>
  )
}

type AMConfigPanelProps = {
  status: AMStatus | null
  loading: boolean
  error: string | null
}

export function AMConfigPanel({ status, loading, error }: AMConfigPanelProps) {
  if (loading && !status) {
    return (
      <div className="py-8 text-center text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
        Loading Alertmanager configuration…
      </div>
    )
  }

  if (error && !status) {
    return (
      <div
        className="rounded-sm px-4 py-3 text-sm"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
          color: 'var(--color-error)',
        }}
        data-testid="am-config-error"
      >
        {error}
      </div>
    )
  }

  if (!status) {
    return (
      <div className="py-8 text-center text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
        No configuration available.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4" data-testid="am-config-panel">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetaCard label="Cluster" value={status.cluster?.status || '—'} testId="am-cluster-status" />
        <MetaCard
          label="Version"
          value={status.versionInfo?.version || '—'}
          testId="am-version"
        />
        <MetaCard
          label="Uptime since"
          value={status.uptime ? formatDateShort(status.uptime) : '—'}
          testId="am-uptime"
        />
      </div>

      <div
        className="rounded-sm px-3 py-2 text-xs leading-relaxed"
        style={{
          backgroundColor: 'var(--color-surface-container-low)',
          color: 'var(--color-on-surface-variant)',
          border: '1px solid var(--color-outline-variant)',
        }}
      >
        Alertmanager configuration is read-only via the v2 API. Edit the Alertmanager config file
        or configmap outside Ace, then reload Alertmanager to apply changes. Silences remain the
        supported mutation path here.
      </div>

      <div className="flex flex-col gap-1.5">
        <span
          className="text-xs font-semibold tracking-wider uppercase"
          style={{ color: 'var(--color-outline)' }}
        >
          config.original
        </span>
        <pre
          data-testid="am-config-yaml"
          className="max-h-[480px] overflow-auto rounded-sm px-3 py-3 font-mono text-xs whitespace-pre-wrap"
          style={{
            backgroundColor: 'var(--color-surface-container-high)',
            color: 'var(--color-on-surface)',
          }}
        >
          {status.config?.original?.trim() || '# Configuration YAML is only available to organization admins (secrets redacted for other roles).'}
        </pre>
      </div>
    </div>
  )
}

function MetaCard({
  label,
  value,
  testId,
}: {
  label: string
  value: string
  testId: string
}) {
  return (
    <div
      className="rounded-lg p-3"
      style={{ backgroundColor: 'var(--color-surface-container-low)' }}
      data-testid={testId}
    >
      <div className="text-xs" style={{ color: 'var(--color-outline)' }}>
        {label}
      </div>
      <div className="mt-1 font-mono text-sm font-medium" style={{ color: 'var(--color-on-surface)' }}>
        {value}
      </div>
    </div>
  )
}
