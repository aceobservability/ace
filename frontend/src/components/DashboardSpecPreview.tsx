import {
  BarChart3,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  ExternalLink,
  Gauge,
  Hash,
  Loader2,
  type LucideIcon,
  PieChart,
  Table,
  TrendingUp,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { queryDataSource } from '@/api/datasources'
import { useDatasources } from '@/hooks/useDatasources'
import { useOrganization } from '@/hooks/useOrganization'
import type { DashboardSpec, PanelType } from '@/utils/dashboardSpec'
import { saveDashboardSpec, validateDashboardSpec } from '@/utils/dashboardSpec'

type DryRunStatus = 'checking' | 'success' | 'empty' | 'error'

type DashboardSpecPreviewProps = {
  spec: DashboardSpec
  onSaved?: (dashboardId: string) => void
}

const DEMO_METRIC_NAMES = [
  'http_requests_total',
  'http_request_duration_seconds',
  'process_cpu_seconds',
  'process_resident_memory_bytes',
  'node_cpu_seconds',
  'node_memory_MemAvailable_bytes',
]

const panelTypeIcons: Record<PanelType, LucideIcon> = {
  line_chart: TrendingUp,
  bar_chart: BarChart3,
  stat: Hash,
  gauge: Gauge,
  table: Table,
  pie: PieChart,
}

function dryRunDotClass(status: DryRunStatus): string {
  switch (status) {
    case 'checking':
      return 'animate-pulse bg-[var(--color-outline)]'
    case 'success':
      return 'bg-[var(--color-secondary)]'
    case 'empty':
      return 'bg-[var(--color-tertiary)]'
    case 'error':
      return 'bg-[var(--color-error)]'
  }
}

export function DashboardSpecPreview({ spec, onSaved }: DashboardSpecPreviewProps) {
  const { currentOrgId } = useOrganization()
  const { data: datasources = [] } = useDatasources(currentOrgId)

  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedDashboardId, setSavedDashboardId] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [specExpanded, setSpecExpanded] = useState(false)
  const [specCopied, setSpecCopied] = useState(false)
  const [dryRunResults, setDryRunResults] = useState<Record<number, DryRunStatus>>({})

  const panelCount = spec.panels?.length ?? 0
  const knownDatasourceIds = useMemo(() => datasources.map((ds) => ds.id), [datasources])
  const isDemoSpec = useMemo(
    () =>
      Boolean(
        spec.panels?.some((panel) =>
          DEMO_METRIC_NAMES.some((metric) => panel.query.expr.includes(metric)),
        ),
      ),
    [spec.panels],
  )
  const maxGridRow = useMemo(() => {
    if (!spec.panels || spec.panels.length === 0) return 1
    return Math.max(
      ...spec.panels.map((panel) => (panel.position?.y ?? 0) + (panel.position?.h ?? 1)),
    )
  }, [spec.panels])
  const isSaved = savedDashboardId !== null
  const hasValidationErrors = validationErrors.length > 0

  useEffect(() => {
    setSavedDashboardId(null)
    setSaveSuccess(false)
    setSaveError(null)
    setValidationErrors([])

    if (!spec.panels || spec.panels.length === 0) {
      setDryRunResults({})
      return
    }

    let cancelled = false
    const initial: Record<number, DryRunStatus> = {}
    spec.panels.forEach((_, index) => {
      initial[index] = 'checking'
    })
    setDryRunResults(initial)

    const now = Math.floor(Date.now() / 1000)
    void Promise.allSettled(
      spec.panels.map(async (panel, index) => {
        try {
          const result = await queryDataSource(panel.datasource_id, {
            query: panel.query.expr,
            signal: panel.query.signal ?? 'metrics',
            start: now - 300,
            end: now,
            step: 15,
          })

          const hasData =
            result.status === 'success' && result.data?.result && result.data.result.length > 0

          if (!cancelled) {
            setDryRunResults((current) => ({
              ...current,
              [index]: hasData ? 'success' : 'empty',
            }))
          }
        } catch {
          if (!cancelled) {
            setDryRunResults((current) => ({
              ...current,
              [index]: 'error',
            }))
          }
        }
      }),
    )

    return () => {
      cancelled = true
    }
  }, [spec])

  async function handleSave() {
    const { valid, errors } = validateDashboardSpec(spec, knownDatasourceIds)
    if (!valid) {
      setValidationErrors(errors)
      return
    }
    setValidationErrors([])

    if (!currentOrgId) {
      setSaveError('No organization selected')
      return
    }

    setSaving(true)
    setSaveError(null)
    try {
      const id = await saveDashboardSpec(spec, currentOrgId)
      setSaveSuccess(true)
      window.setTimeout(() => {
        setSavedDashboardId(id)
        onSaved?.(id)
      }, 1000)
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'Failed to save dashboard')
    } finally {
      setSaving(false)
    }
  }

  async function copySpec() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(spec, null, 2))
      setSpecCopied(true)
      window.setTimeout(() => setSpecCopied(false), 2000)
    } catch {
      // clipboard not available
    }
  }

  return (
    <section
      aria-label={`Dashboard preview: ${spec.title}, ${panelCount} panels`}
      className={`overflow-hidden rounded-lg border border-[color-mix(in_srgb,var(--color-outline-variant)_30%,transparent)] ${saving ? 'opacity-70' : ''}`}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="truncate text-sm font-semibold text-[var(--color-on-surface)]">
          {spec.title}
        </span>
        <span className="shrink-0 text-xs text-[var(--color-outline)]">
          {panelCount} panel{panelCount !== 1 ? 's' : ''}
        </span>
      </div>

      {isDemoSpec && (
        <div className="px-3 pb-2">
          <span className="rounded bg-[var(--color-tertiary)]/10 px-2 py-1 text-xs text-[var(--color-tertiary)]">
            Demo dashboard — connect a real datasource to see your data
          </span>
        </div>
      )}

      <div className="px-3 pb-2">
        <ul
          className="m-0 grid list-none gap-1 p-0"
          style={{
            gridTemplateColumns: 'repeat(12, 1fr)',
            gridTemplateRows: `repeat(${maxGridRow}, 24px)`,
          }}
        >
          {spec.panels?.map((panel, index) => {
            const Icon = panelTypeIcons[panel.type] || TrendingUp
            const panelKey = `${panel.title}-${panel.type}-${panel.position?.x ?? 0}-${panel.position?.y ?? 0}-${panel.query.expr}`
            return (
              <li
                key={panelKey}
                aria-label={`${panel.title} (${panel.type})`}
                className="relative flex min-w-0 items-center gap-1 rounded bg-[var(--color-surface-container-low)] px-1.5 py-0.5"
                style={{
                  gridColumn: `${(panel.position?.x ?? 0) + 1} / span ${panel.position?.w ?? 4}`,
                  gridRow: `${(panel.position?.y ?? 0) + 1} / span ${panel.position?.h ?? 1}`,
                }}
              >
                <Icon size={10} className="shrink-0 text-[var(--color-outline)]" />
                <span className="truncate text-[10px] text-[var(--color-outline)]">
                  {panel.title}
                </span>
                {dryRunResults[index] && (
                  <span
                    className={`ml-auto h-2 w-2 shrink-0 rounded-full ${dryRunDotClass(dryRunResults[index]!)}`}
                  />
                )}
              </li>
            )
          })}
        </ul>
      </div>

      {hasValidationErrors && (
        <div className="px-3 pb-2">
          <ul className="m-0 list-inside list-disc rounded bg-[var(--color-error)]/10 px-3 py-2 text-xs text-[var(--color-error)]">
            {validationErrors.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {saveError && (
        <div className="px-3 pb-2" aria-live="polite">
          <span className="rounded bg-[var(--color-error)]/10 px-2 py-1 text-xs text-[var(--color-error)]">
            {saveError}
          </span>
        </div>
      )}

      <div className="flex items-center gap-3 px-3 pb-3" aria-live="polite">
        {isSaved ? (
          <>
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--color-secondary)]">
              <Check size={14} />
              Dashboard saved
            </span>
            <Link
              to={`/app/dashboards/${savedDashboardId}`}
              className="inline-flex items-center gap-1 text-xs text-[var(--color-primary)] no-underline hover:underline"
            >
              <ExternalLink size={12} />
              Open dashboard
            </Link>
          </>
        ) : saveSuccess ? (
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--color-secondary)]">
            <Check size={14} />
            Dashboard saved
          </span>
        ) : (
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm border-none bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={saving || hasValidationErrors}
            data-testid="spec-preview-save-btn"
            onClick={() => void handleSave()}
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? 'Saving...' : 'Save'}
          </button>
        )}

        <button
          type="button"
          className="ml-auto inline-flex cursor-pointer items-center gap-0.5 border-none bg-transparent text-xs text-[var(--color-outline)] hover:text-[var(--color-on-surface)]"
          aria-expanded={specExpanded}
          data-testid="spec-preview-toggle-spec"
          onClick={() => setSpecExpanded((current) => !current)}
        >
          View spec
          {specExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {specExpanded && (
        <div className="border-t border-[color-mix(in_srgb,var(--color-outline-variant)_30%,transparent)] px-3 py-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs text-[var(--color-outline)]">Dashboard spec (JSON)</span>
            <button
              type="button"
              className="inline-flex cursor-pointer items-center gap-1 border-none bg-transparent text-xs text-[var(--color-outline)] hover:text-[var(--color-on-surface)]"
              data-testid="spec-preview-copy-btn"
              onClick={() => void copySpec()}
            >
              {specCopied ? (
                <Check size={12} className="text-[var(--color-secondary)]" />
              ) : (
                <ClipboardCopy size={12} />
              )}
              {specCopied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <pre className="m-0 max-h-48 overflow-x-auto overflow-y-auto rounded bg-[var(--color-surface-container-high)] p-2 text-[10px] text-[var(--color-on-surface-variant)]">
            {JSON.stringify(spec, null, 2)}
          </pre>
        </div>
      )}
    </section>
  )
}
