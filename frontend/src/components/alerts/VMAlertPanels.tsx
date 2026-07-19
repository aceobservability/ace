import { BellOff, ChevronDown, ChevronRight, FileCode2 } from 'lucide-react'
import { AiAlertTriage } from '@/components/AiAlertTriage'
import { AlertRow } from '@/components/alerts/AlertRow'
import { formatAlertDuration, formatAlertInterval } from '@/lib/alerts'
import type { VMAlertAlert, VMAlertRule, VMAlertRuleGroup } from '@/types/datasource'

type VMAlertAlertsPanelProps = {
  sortedAlerts: VMAlertAlert[]
  firingAlerts: VMAlertAlert[]
  expandedAlertIdx: number | null
  selectedDatasourceId: string
  isFavorite: (id: string) => boolean
  onToggleExpand: (idx: number) => void
  onToggleFavorite: (id: string, title: string) => void
}

export function VMAlertAlertsPanel({
  sortedAlerts,
  firingAlerts,
  expandedAlertIdx,
  selectedDatasourceId,
  isFavorite,
  onToggleExpand,
  onToggleFavorite,
}: VMAlertAlertsPanelProps) {
  return (
    <div>
      {firingAlerts.length > 0 ? (
        <AiAlertTriage
          alertCount={firingAlerts.length}
          alertNames={firingAlerts
            .map(a => a.name)
            .filter((v, i, arr) => arr.indexOf(v) === i)
            .slice(0, 5)}
          className="mb-4"
        />
      ) : null}

      {sortedAlerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
          <BellOff size={36} style={{ color: 'var(--color-outline)' }} aria-hidden />
          <h3 className="m-0 text-lg font-semibold" style={{ color: 'var(--color-on-surface)' }}>
            No alerts firing
          </h3>
          <p className="m-0 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
            All quiet -- no active or pending alerts.
          </p>
        </div>
      ) : (
        <table className="w-full border-collapse" data-testid="alert-table">
          <thead data-testid="alert-table-header">
            <tr>
              {['Status', 'Alert', 'Labels', 'Active Since'].map((label, i) => (
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
            {sortedAlerts.map((alert, idx) => {
              const favoriteId = `alert::${selectedDatasourceId}::${alert.name}`
              const favorited = isFavorite(favoriteId)
              const rowKey = `${alert.name}|${alert.state}|${alert.activeAt}|${JSON.stringify(alert.labels ?? {})}`
              return (
                <AlertRow
                  key={rowKey}
                  alert={alert}
                  expanded={expandedAlertIdx === idx}
                  favorited={favorited}
                  onToggleExpand={() => onToggleExpand(idx)}
                  onToggleFavorite={() => onToggleFavorite(favoriteId, alert.name)}
                />
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

type VMAlertGroupsPanelProps = {
  groups: VMAlertRuleGroup[]
  expandedGroups: Record<string, boolean>
  onToggleGroup: (groupName: string) => void
  onOpenRuleEditor: (rule: VMAlertRule, groupName: string) => void
}

export function VMAlertGroupsPanel({
  groups,
  expandedGroups,
  onToggleGroup,
  onOpenRuleEditor,
}: VMAlertGroupsPanelProps) {
  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <BellOff size={36} style={{ color: 'var(--color-outline)' }} aria-hidden />
        <h3 className="m-0 text-lg font-semibold" style={{ color: 'var(--color-on-surface)' }}>
          No rule groups
        </h3>
        <p className="m-0 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
          No alerting or recording rule groups found.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.map(group => {
        const expanded = !!expandedGroups[group.name]
        return (
          <div
            key={group.name}
            className="overflow-hidden rounded-lg"
            style={{ backgroundColor: 'var(--color-surface-container-low)' }}
            data-testid="rule-group"
          >
            <button
              type="button"
              className="flex w-full cursor-pointer items-center justify-between border-none bg-transparent px-4 py-3 text-left transition hover:opacity-90"
              onClick={() => onToggleGroup(group.name)}
            >
              <div className="flex items-center gap-2">
                {expanded ? (
                  <ChevronDown size={16} style={{ color: 'var(--color-outline)' }} />
                ) : (
                  <ChevronRight size={16} style={{ color: 'var(--color-outline)' }} />
                )}
                <span className="text-sm font-semibold" style={{ color: 'var(--color-on-surface)' }}>
                  {group.name}
                </span>
              </div>
              <span className="font-mono text-xs" style={{ color: 'var(--color-outline)' }}>
                {group.rules.length} rule{group.rules.length !== 1 ? 's' : ''} · every{' '}
                {formatAlertInterval(group.interval)}
              </span>
            </button>

            {expanded ? (
              <div className="px-4 py-3" style={{ borderTop: '1px solid var(--color-outline-variant)' }}>
                <div className="flex flex-col">
                  {group.rules.map((rule, rIdx) => (
                    <div
                      key={`${group.name}:${rule.name}:${rule.type}:${rule.query}:${rule.duration}`}
                      className="py-3"
                      style={
                        rIdx > 0 ? { borderTop: '1px solid var(--color-outline-variant)' } : undefined
                      }
                      data-testid="rule-item"
                    >
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span
                          className="text-sm font-semibold"
                          style={{ color: 'var(--color-on-surface)' }}
                        >
                          {rule.name}
                        </span>
                        <span
                          className="rounded px-1.5 py-0.5 text-[0.65rem] font-semibold tracking-wide uppercase"
                          style={{
                            backgroundColor:
                              rule.type === 'alerting'
                                ? 'color-mix(in srgb, var(--color-error) 15%, transparent)'
                                : 'color-mix(in srgb, var(--color-primary) 15%, transparent)',
                            color:
                              rule.type === 'alerting'
                                ? 'var(--color-error)'
                                : 'var(--color-primary)',
                          }}
                        >
                          {rule.type}
                        </span>
                        {rule.state ? (
                          <span
                            className="rounded-sm px-2 py-0.5 text-xs font-semibold"
                            style={{
                              backgroundColor:
                                rule.state === 'firing'
                                  ? 'color-mix(in srgb, var(--color-error) 15%, transparent)'
                                  : rule.state === 'pending'
                                    ? 'color-mix(in srgb, var(--color-tertiary) 15%, transparent)'
                                    : 'var(--color-surface-container-high)',
                              color:
                                rule.state === 'firing'
                                  ? 'var(--color-error)'
                                  : rule.state === 'pending'
                                    ? 'var(--color-tertiary)'
                                    : 'var(--color-on-surface-variant)',
                            }}
                          >
                            {rule.state}
                          </span>
                        ) : null}
                        <button
                          type="button"
                          data-testid={`open-rule-editor-${rule.name}`}
                          className="ml-auto inline-flex cursor-pointer items-center gap-1 rounded-sm px-2 py-1 text-xs font-medium transition"
                          style={{
                            backgroundColor: 'var(--color-surface-container-high)',
                            color: 'var(--color-primary)',
                            border: '1px solid var(--color-outline-variant)',
                          }}
                          onClick={() => onOpenRuleEditor(rule, group.name)}
                        >
                          <FileCode2 size={12} aria-hidden />
                          Open editor
                        </button>
                      </div>
                      <div
                        className="mb-2 overflow-x-auto rounded-sm px-3 py-2"
                        style={{ backgroundColor: 'var(--color-surface-container-high)' }}
                      >
                        <code
                          className="font-mono text-xs break-all whitespace-pre-wrap"
                          style={{ color: 'var(--color-on-surface-variant)' }}
                        >
                          {rule.query}
                        </code>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {rule.duration > 0 ? (
                          <span className="mr-1 text-xs" style={{ color: 'var(--color-outline)' }}>
                            <strong>for:</strong> {formatAlertDuration(rule.duration)}
                          </span>
                        ) : null}
                        {Object.entries(rule.labels ?? {}).map(([key, value]) => (
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
                      {rule.annotations && Object.keys(rule.annotations).length > 0 ? (
                        <div
                          className="mt-2 pt-2"
                          style={{ borderTop: '1px solid var(--color-outline-variant)' }}
                        >
                          {Object.entries(rule.annotations).map(([key, value]) => (
                            <div
                              key={key}
                              className="text-xs leading-relaxed"
                              style={{ color: 'var(--color-outline)' }}
                            >
                              <strong style={{ color: 'var(--color-on-surface-variant)' }}>
                                {key}:
                              </strong>{' '}
                              {value}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
