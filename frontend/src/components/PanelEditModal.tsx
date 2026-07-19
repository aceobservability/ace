import { Plus, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { fetchDataSourceLabels } from '@/api/datasources'
import { createPanel, updatePanel } from '@/api/panels'
import { ClickHouseSQLEditor } from '@/components/ClickHouseSQLEditor'
import { CloudWatchQueryEditor } from '@/components/CloudWatchQueryEditor'
import { ElasticsearchQueryEditor } from '@/components/ElasticsearchQueryEditor'
import { LogQLQueryBuilder } from '@/components/LogQLQueryBuilder'
import { ensurePanelTypesRegistered } from '@/components/panels/registerPanelTypes'
import { QueryBuilder } from '@/components/QueryBuilder'
import { useDatasources } from '@/hooks/useDatasources'
import { useOrganization } from '@/hooks/useOrganization'
import type { DataSource } from '@/types/datasource'
import { isLogsType, isTracingType } from '@/types/datasource'
import type { Panel } from '@/types/panel'
import {
  getAllPanels,
  lookupPanel,
  type PanelQueryMode,
  type PanelRegistration,
} from '@/utils/panelRegistry'

ensurePanelTypesRegistered()

type Threshold = {
  id: string
  value: number
  color: string
}

let thresholdIdCounter = 0

function nextThresholdId() {
  thresholdIdCounter += 1
  return `threshold-${thresholdIdCounter}`
}

function toThreshold(value: number, color: string, id?: string): Threshold {
  return { id: id ?? nextThresholdId(), value, color }
}

type QuerySignal = 'logs' | 'metrics' | 'traces'

type PanelEditModalProps = {
  dashboardId: string
  panel?: Panel
  onClose: () => void
  onSaved: (panel: Panel) => void
}

const BUILTIN_TYPES = new Set([
  'line_chart',
  'bar_chart',
  'pie',
  'gauge',
  'stat',
  'table',
  'logs',
  'trace_list',
  'trace_heatmap',
])

const DEFAULT_GRID_POS = { x: 0, y: 0, w: 6, h: 4 }

const inputClass =
  'w-full rounded-lg px-3 py-2.5 text-sm transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50'
const selectClass =
  'w-full cursor-pointer appearance-none rounded-lg px-3 py-2.5 pr-10 text-sm transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50'
const fieldStyle = {
  backgroundColor: 'var(--color-surface-container-low)',
  color: 'var(--color-on-surface)',
  border: '1px solid var(--color-outline-variant)',
} as const

function getDefaultQuerySignal(panelType: string): QuerySignal {
  if (panelType === 'logs') return 'logs'
  if (panelType === 'trace_list' || panelType === 'trace_heatmap') return 'traces'
  return 'metrics'
}

function isQuerySignal(value: unknown): value is QuerySignal {
  return value === 'logs' || value === 'metrics' || value === 'traces'
}

function panelOptionLabel(reg: PanelRegistration): string {
  if (reg.supportStatus === 'unsupported') return `${reg.label} (not supported)`
  if (reg.supportStatus === 'setup_required') return `${reg.label} (setup required)`
  return reg.label
}

function readQueryString(query: Record<string, unknown> | undefined, key: string): string {
  const value = query?.[key]
  return typeof value === 'string' ? value : ''
}

function readQueryNumber(
  query: Record<string, unknown> | undefined,
  key: string,
  fallback: number,
): number {
  const value = query?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function readThresholds(query: Record<string, unknown> | undefined): Threshold[] {
  if (!Array.isArray(query?.thresholds)) return []
  return (query.thresholds as Array<{ value?: number; color?: string }>).map(threshold =>
    toThreshold(
      typeof threshold.value === 'number' ? threshold.value : 0,
      typeof threshold.color === 'string' ? threshold.color : '#feca57',
    ),
  )
}

function thresholdsForQuery(thresholds: Threshold[]): Array<{ value: number; color: string }> {
  return thresholds.map(({ value, color }) => ({ value, color }))
}

function getQueryMode(panelType: string): PanelQueryMode {
  if (panelType === 'logs') return 'logs'
  if (panelType === 'trace_list' || panelType === 'trace_heatmap') return 'traces'
  if (BUILTIN_TYPES.has(panelType)) return 'metrics'
  return lookupPanel(panelType)?.queryMode ?? 'metrics'
}

function isSignalDatasourceType(type: string | undefined): boolean {
  return type === 'clickhouse' || type === 'cloudwatch' || type === 'elasticsearch'
}

export function PanelEditModal({ dashboardId, panel, onClose, onSaved }: PanelEditModalProps) {
  const isEditing = Boolean(panel)
  const { currentOrgId } = useOrganization()
  const { data: datasources = [] } = useDatasources(currentOrgId)

  const [title, setTitle] = useState(panel?.title ?? '')
  const [panelType, setPanelType] = useState(panel?.type ?? 'line_chart')
  const [selectedDatasourceId, setSelectedDatasourceId] = useState(
    readQueryString(panel?.query, 'datasource_id'),
  )
  const [queryText, setQueryText] = useState(
    readQueryString(panel?.query, 'promql') || readQueryString(panel?.query, 'expr'),
  )
  const [querySignal, setQuerySignal] = useState<QuerySignal>(
    isQuerySignal(panel?.query?.signal)
      ? (panel?.query?.signal as QuerySignal)
      : getDefaultQuerySignal(panel?.type ?? 'line_chart'),
  )

  // Gauge options
  const [gaugeMin, setGaugeMin] = useState(readQueryNumber(panel?.query, 'min', 0))
  const [gaugeMax, setGaugeMax] = useState(readQueryNumber(panel?.query, 'max', 100))
  const [gaugeUnit, setGaugeUnit] = useState(readQueryString(panel?.query, 'unit'))
  const [gaugeDecimals, setGaugeDecimals] = useState(readQueryNumber(panel?.query, 'decimals', 2))
  const [gaugeThresholds, setGaugeThresholds] = useState<Threshold[]>(() => {
    const existing = readThresholds(panel?.query)
    return existing.length > 0 ? existing : [toThreshold(80, '#ff6b6b')]
  })

  // Pie options
  const [pieDisplayAs, setPieDisplayAs] = useState<'pie' | 'donut'>(
    panel?.query?.displayAs === 'donut' ? 'donut' : 'pie',
  )
  const [pieShowLegend, setPieShowLegend] = useState(panel?.query?.showLegend !== false)
  const [pieShowLabels, setPieShowLabels] = useState(panel?.query?.showLabels !== false)

  // Stat options
  const [statUnit, setStatUnit] = useState(readQueryString(panel?.query, 'unit'))
  const [statDecimals, setStatDecimals] = useState(readQueryNumber(panel?.query, 'decimals', 2))
  const [statShowTrend, setStatShowTrend] = useState(panel?.query?.showTrend !== false)
  const [statShowSparkline, setStatShowSparkline] = useState(panel?.query?.showSparkline !== false)
  const [statThresholds, setStatThresholds] = useState<Threshold[]>(() => readThresholds(panel?.query))

  // Trace options
  const [traceService, setTraceService] = useState(readQueryString(panel?.query, 'service'))
  const [traceLimit, setTraceLimit] = useState(() => {
    const limit = readQueryNumber(panel?.query, 'limit', 50)
    return Math.max(1, Math.min(200, Math.floor(limit)))
  })

  const [indexedLabels, setIndexedLabels] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const registeredPanels = useMemo(
    () => getAllPanels().filter(entry => !BUILTIN_TYPES.has(entry.type)),
    [],
  )

  const currentQueryMode = getQueryMode(panelType)
  const needsDatasource = currentQueryMode !== 'none'
  const isTracePanelType = currentQueryMode === 'traces'
  const isLogsPanelType = currentQueryMode === 'logs'
  const isBuiltinTracePanel = panelType === 'trace_list' || panelType === 'trace_heatmap'
  const isGaugeType = panelType === 'gauge'
  const isPieType = panelType === 'pie'
  const isStatType = panelType === 'stat'

  const selectedDatasource: DataSource | null = useMemo(
    () => datasources.find(ds => ds.id === selectedDatasourceId) ?? null,
    [datasources, selectedDatasourceId],
  )

  const isClickHouseDatasource = selectedDatasource?.type === 'clickhouse'
  const isCloudWatchDatasource = selectedDatasource?.type === 'cloudwatch'
  const isElasticsearchDatasource = selectedDatasource?.type === 'elasticsearch'
  const isSignalDatasource = isSignalDatasourceType(selectedDatasource?.type)
  const isNativeLogsDatasource =
    selectedDatasource?.type === 'loki' || selectedDatasource?.type === 'victorialogs'
  const logQueryLanguage = selectedDatasource?.type === 'victorialogs' ? 'logsql' : 'logql'

  const availableDatasources = useMemo(() => {
    if (isTracePanelType) {
      return datasources.filter(ds => isTracingType(ds.type))
    }
    if (isLogsPanelType) {
      return datasources.filter(ds => isLogsType(ds.type))
    }
    return datasources
  }, [datasources, isLogsPanelType, isTracePanelType])

  // Keep datasource selection valid when panel type or datasource list changes.
  // Intentionally does not depend on selectedDatasourceId so manual clears are preserved
  // (matches Vue PanelEditModal watch on [panelType, datasources] only).
  useEffect(() => {
    if (isTracePanelType || isLogsPanelType) {
      setSelectedDatasourceId(current => {
        if (availableDatasources.some(ds => ds.id === current)) return current
        return availableDatasources[0]?.id ?? ''
      })
      return
    }

    setSelectedDatasourceId(current => {
      if (current && !datasources.some(ds => ds.id === current)) return ''
      return current
    })
  }, [availableDatasources, datasources, isLogsPanelType, isTracePanelType])

  // Reset query signal when panel type changes on signal datasources (skip initial mount)
  const previousPanelTypeRef = useRef(panelType)
  useEffect(() => {
    if (previousPanelTypeRef.current === panelType) return
    previousPanelTypeRef.current = panelType
    if (!isSignalDatasource) return
    setQuerySignal(getDefaultQuerySignal(panelType))
  }, [panelType, isSignalDatasource])

  // Reset query signal when switching onto a signal datasource type
  const previousDatasourceTypeRef = useRef(selectedDatasource?.type)
  useEffect(() => {
    const nextType = selectedDatasource?.type
    const prevType = previousDatasourceTypeRef.current
    previousDatasourceTypeRef.current = nextType
    if (!nextType || nextType === prevType) return
    if (!isSignalDatasourceType(nextType)) return
    setQuerySignal(getDefaultQuerySignal(panelType))
  }, [selectedDatasource?.type, panelType])

  // Fetch indexed labels for native log datasources
  useEffect(() => {
    if (!selectedDatasourceId || !isLogsPanelType || !isNativeLogsDatasource) {
      setIndexedLabels([])
      return
    }

    let cancelled = false
    void fetchDataSourceLabels(selectedDatasourceId)
      .then(labels => {
        if (!cancelled) setIndexedLabels(labels)
      })
      .catch(() => {
        if (!cancelled) setIndexedLabels([])
      })

    return () => {
      cancelled = true
    }
  }, [selectedDatasourceId, isLogsPanelType, isNativeLogsDatasource])

  function handleNonTraceSignalChange(signal: 'logs' | 'metrics') {
    setQuerySignal(signal)
  }

  function addGaugeThreshold() {
    setGaugeThresholds(current => {
      const lastValue = current.length > 0 ? current[current.length - 1].value + 10 : 50
      return [...current, toThreshold(lastValue, '#feca57')]
    })
  }

  function removeGaugeThreshold(id: string) {
    setGaugeThresholds(current => current.filter(threshold => threshold.id !== id))
  }

  function updateGaugeThreshold(id: string, patch: Partial<Pick<Threshold, 'value' | 'color'>>) {
    setGaugeThresholds(current =>
      current.map(threshold => (threshold.id === id ? { ...threshold, ...patch } : threshold)),
    )
  }

  function addStatThreshold() {
    setStatThresholds(current => {
      const lastValue = current.length > 0 ? current[current.length - 1].value + 10 : 50
      return [...current, toThreshold(lastValue, '#feca57')]
    })
  }

  function removeStatThreshold(id: string) {
    setStatThresholds(current => current.filter(threshold => threshold.id !== id))
  }

  function updateStatThreshold(id: string, patch: Partial<Pick<Threshold, 'value' | 'color'>>) {
    setStatThresholds(current =>
      current.map(threshold => (threshold.id === id ? { ...threshold, ...patch } : threshold)),
    )
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (!title.trim()) {
      setError('Title is required')
      return
    }

    if (isTracePanelType && !selectedDatasourceId) {
      setError('Tracing datasource is required for trace panels')
      return
    }

    // Validate grid size defaults used on create (matches Vue fixed grid_pos)
    if (!isEditing) {
      const { w, h } = DEFAULT_GRID_POS
      if (w < 2 || h < 2) {
        setError('Panel size is invalid')
        return
      }
    }

    const query: Record<string, unknown> = {}

    if (!needsDatasource) {
      const reg = lookupPanel(panelType)
      if (reg) Object.assign(query, reg.defaultQuery)
    } else {
      if (selectedDatasourceId) {
        query.datasource_id = selectedDatasourceId
      }

      const trimmedQuery = queryText.trim()
      if (trimmedQuery) {
        if (selectedDatasourceId) {
          query.expr = trimmedQuery
        } else {
          query.promql = trimmedQuery
        }
      }

      if (isSignalDatasource) {
        if (
          (isCloudWatchDatasource || isElasticsearchDatasource) &&
          querySignal === 'traces'
        ) {
          query.signal = panelType === 'logs' ? 'logs' : 'metrics'
        } else {
          query.signal = querySignal
        }
      }

      if (isBuiltinTracePanel) {
        const trimmedService = traceService.trim()
        if (trimmedService) query.service = trimmedService
        const normalizedTraceLimit = Number.isFinite(traceLimit)
          ? Math.max(1, Math.min(200, Math.floor(traceLimit)))
          : 50
        query.limit = normalizedTraceLimit
      }
    }

    if (isGaugeType) {
      query.min = gaugeMin
      query.max = gaugeMax
      query.unit = gaugeUnit
      query.decimals = gaugeDecimals
      query.thresholds = thresholdsForQuery(gaugeThresholds)
    }

    if (isPieType) {
      query.displayAs = pieDisplayAs
      query.showLegend = pieShowLegend
      query.showLabels = pieShowLabels
    }

    if (isStatType) {
      query.unit = statUnit
      query.decimals = statDecimals
      query.showTrend = statShowTrend
      query.showSparkline = statShowSparkline
      if (statThresholds.length > 0) {
        query.thresholds = thresholdsForQuery(statThresholds)
      }
    }

    const finalQuery = Object.keys(query).length > 0 ? query : undefined

    setLoading(true)
    setError(null)

    try {
      if (isEditing && panel) {
        const updated = await updatePanel(panel.id, {
          title: title.trim(),
          type: panelType,
          query: finalQuery,
        })
        onSaved(updated)
      } else {
        const created = await createPanel(dashboardId, {
          title: title.trim(),
          type: panelType,
          grid_pos: DEFAULT_GRID_POS,
          query: finalQuery,
        })
        onSaved(created)
      }
    } catch {
      setError(isEditing ? 'Failed to update panel' : 'Failed to create panel')
    } finally {
      setLoading(false)
    }
  }

  const queryEditorLabel = isClickHouseDatasource
    ? 'SQL Query'
    : isCloudWatchDatasource
      ? 'CloudWatch Query'
      : isElasticsearchDatasource
        ? 'Elasticsearch Query'
        : isNativeLogsDatasource
          ? 'Log Query'
          : 'Query'

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      data-testid="panel-edit-modal"
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 cursor-default border-none p-0"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="panel-edit-title"
        className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg shadow-lg"
        style={{
          backgroundColor: 'var(--color-surface-bright)',
          backdropFilter: 'blur(20px)',
        }}
      >
        <header
          className="sticky top-0 z-10 flex items-center justify-between px-6 py-4"
          style={{
            backgroundColor: 'var(--color-surface-bright)',
            borderBottom: '1px solid var(--color-outline-variant)',
          }}
        >
          <h2
            id="panel-edit-title"
            className="font-display text-lg font-semibold"
            style={{ color: 'var(--color-on-surface)' }}
          >
            {isEditing ? 'Edit Panel' : 'Add Panel'}
          </h2>
          <button
            type="button"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition hover:opacity-80"
            style={{ color: 'var(--color-outline)', backgroundColor: 'transparent' }}
            data-testid="panel-edit-close-btn"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>

        <form className="px-6 py-4" onSubmit={event => void handleSubmit(event)}>
          <div className="grid grid-cols-[1fr_auto] gap-4">
            <div className="mb-5">
              <label
                htmlFor="panel-title"
                className="mb-2 block text-sm font-medium"
                style={{ color: 'var(--color-on-surface)' }}
              >
                Title <span style={{ color: 'var(--color-error)' }}>*</span>
              </label>
              <input
                id="panel-title"
                type="text"
                value={title}
                onChange={event => setTitle(event.target.value)}
                placeholder="Panel title"
                disabled={loading}
                autoComplete="off"
                data-testid="panel-title-input"
                className={inputClass}
                style={fieldStyle}
              />
            </div>

            <div className="mb-5 min-w-[160px]">
              <label
                htmlFor="panel-type"
                className="mb-2 block text-sm font-medium"
                style={{ color: 'var(--color-on-surface)' }}
              >
                Panel Type
              </label>
              <select
                id="panel-type"
                value={panelType}
                onChange={event => setPanelType(event.target.value)}
                disabled={loading}
                data-testid="panel-type-select"
                className={selectClass}
                style={fieldStyle}
              >
                <option value="line_chart">Line Chart</option>
                <option value="bar_chart">Bar Chart</option>
                <option value="pie">Pie Chart</option>
                <option value="gauge">Gauge</option>
                <option value="stat">Stat</option>
                <option value="table">Table</option>
                <option value="logs">Logs</option>
                <option value="trace_list">Trace List</option>
                <option value="trace_heatmap">Trace Heatmap</option>
                {registeredPanels.map(reg => (
                  <option key={reg.type} value={reg.type}>
                    {panelOptionLabel(reg)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {needsDatasource && datasources.length > 0 ? (
            <div className="mb-5">
              <label
                htmlFor="panel-datasource"
                className="mb-2 block text-sm font-medium"
                style={{ color: 'var(--color-on-surface)' }}
              >
                Data Source
              </label>
              <select
                id="panel-datasource"
                value={selectedDatasourceId}
                onChange={event => setSelectedDatasourceId(event.target.value)}
                disabled={loading}
                data-testid="panel-datasource-select"
                className={selectClass}
                style={fieldStyle}
              >
                {isTracePanelType ? (
                  <option value="">Select tracing datasource</option>
                ) : isLogsPanelType ? (
                  <option value="">Select logs datasource</option>
                ) : (
                  <option value="">Default (Prometheus)</option>
                )}
                {availableDatasources.map(ds => (
                  <option key={ds.id} value={ds.id}>
                    {ds.name} ({ds.type})
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {needsDatasource && (!isTracePanelType || isSignalDatasource) ? (
            <div
              className="mb-5 pt-5"
              style={{ borderTop: '1px solid var(--color-outline-variant)' }}
            >
              <div
                className="mb-2 block text-sm font-medium"
                style={{ color: 'var(--color-on-surface)' }}
              >
                {queryEditorLabel}
              </div>
              {isLogsPanelType && isNativeLogsDatasource ? (
                <LogQLQueryBuilder
                  value={queryText}
                  onChange={setQueryText}
                  queryLanguage={logQueryLanguage}
                  datasourceId={selectedDatasourceId}
                  indexedLabels={indexedLabels}
                  disabled={loading}
                />
              ) : !isSignalDatasource ? (
                <QueryBuilder
                  value={queryText}
                  onChange={setQueryText}
                  disabled={loading}
                  datasourceId={selectedDatasourceId}
                />
              ) : isClickHouseDatasource ? (
                <ClickHouseSQLEditor
                  value={queryText}
                  onChange={setQueryText}
                  signal={querySignal}
                  showSignalSelector
                  disabled={loading}
                  onSignalChange={setQuerySignal}
                />
              ) : isCloudWatchDatasource ? (
                <CloudWatchQueryEditor
                  value={queryText}
                  onChange={setQueryText}
                  signal={querySignal === 'traces' ? 'metrics' : querySignal}
                  disabled={loading}
                  onSignalChange={handleNonTraceSignalChange}
                />
              ) : (
                <ElasticsearchQueryEditor
                  value={queryText}
                  onChange={setQueryText}
                  signal={querySignal === 'traces' ? 'metrics' : querySignal}
                  disabled={loading}
                  onSignalChange={handleNonTraceSignalChange}
                />
              )}
            </div>
          ) : null}

          {isBuiltinTracePanel ? (
            <div
              className="mb-5 pt-5"
              style={{ borderTop: '1px solid var(--color-outline-variant)' }}
            >
              <h4
                className="mb-3 text-sm font-semibold"
                style={{ color: 'var(--color-on-surface)' }}
              >
                Trace Panel Options
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="mb-3">
                  <label
                    htmlFor="trace-service-filter"
                    className="mb-2 block text-sm font-medium"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    Service Filter (optional)
                  </label>
                  <input
                    id="trace-service-filter"
                    type="text"
                    value={traceService}
                    onChange={event => setTraceService(event.target.value)}
                    placeholder="api-service"
                    disabled={loading}
                    data-testid="panel-trace-service-input"
                    className={inputClass}
                    style={fieldStyle}
                  />
                </div>
                <div className="mb-3">
                  <label
                    htmlFor="trace-limit"
                    className="mb-2 block text-sm font-medium"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    Max traces
                  </label>
                  <input
                    id="trace-limit"
                    type="number"
                    min={1}
                    max={200}
                    value={traceLimit}
                    onChange={event => setTraceLimit(Number(event.target.value))}
                    disabled={loading}
                    data-testid="panel-trace-limit-input"
                    className={inputClass}
                    style={fieldStyle}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {isGaugeType ? (
            <div
              className="mb-5 pt-5"
              style={{ borderTop: '1px solid var(--color-outline-variant)' }}
            >
              <h4
                className="mb-3 text-sm font-semibold"
                style={{ color: 'var(--color-on-surface)' }}
              >
                Gauge Options
              </h4>
              <div className="grid grid-cols-4 gap-3">
                <div className="mb-3">
                  <label
                    htmlFor="gauge-min"
                    className="mb-2 block text-sm font-medium"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    Min
                  </label>
                  <input
                    id="gauge-min"
                    type="number"
                    value={gaugeMin}
                    onChange={event => setGaugeMin(Number(event.target.value))}
                    disabled={loading}
                    data-testid="panel-gauge-min-input"
                    className={inputClass}
                    style={fieldStyle}
                  />
                </div>
                <div className="mb-3">
                  <label
                    htmlFor="gauge-max"
                    className="mb-2 block text-sm font-medium"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    Max
                  </label>
                  <input
                    id="gauge-max"
                    type="number"
                    value={gaugeMax}
                    onChange={event => setGaugeMax(Number(event.target.value))}
                    disabled={loading}
                    data-testid="panel-gauge-max-input"
                    className={inputClass}
                    style={fieldStyle}
                  />
                </div>
                <div className="mb-3">
                  <label
                    htmlFor="gauge-unit"
                    className="mb-2 block text-sm font-medium"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    Unit
                  </label>
                  <input
                    id="gauge-unit"
                    type="text"
                    value={gaugeUnit}
                    onChange={event => setGaugeUnit(event.target.value)}
                    placeholder="%"
                    disabled={loading}
                    data-testid="panel-gauge-unit-input"
                    className={inputClass}
                    style={fieldStyle}
                  />
                </div>
                <div className="mb-3">
                  <label
                    htmlFor="gauge-decimals"
                    className="mb-2 block text-sm font-medium"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    Decimals
                  </label>
                  <input
                    id="gauge-decimals"
                    type="number"
                    min={0}
                    max={10}
                    value={gaugeDecimals}
                    onChange={event => setGaugeDecimals(Number(event.target.value))}
                    disabled={loading}
                    data-testid="panel-gauge-decimals-input"
                    className={inputClass}
                    style={fieldStyle}
                  />
                </div>
              </div>
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <span
                    className="text-sm font-medium"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    Thresholds
                  </span>
                  <button
                    type="button"
                    data-testid="panel-gauge-add-threshold-btn"
                    className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
                    style={{
                      backgroundColor: 'var(--color-surface-container-high)',
                      color: 'var(--color-on-surface)',
                      border: '1px solid var(--color-outline-variant)',
                    }}
                    onClick={addGaugeThreshold}
                    disabled={loading}
                  >
                    <Plus size={14} />
                    Add
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  {gaugeThresholds.map(threshold => (
                    <div key={threshold.id} className="flex items-center gap-2">
                      <input
                        type="number"
                        value={threshold.value}
                        onChange={event =>
                          updateGaugeThreshold(threshold.id, {
                            value: Number(event.target.value),
                          })
                        }
                        placeholder="Value"
                        disabled={loading}
                        className={`${inputClass} !w-auto flex-1`}
                        style={fieldStyle}
                      />
                      <input
                        type="color"
                        value={threshold.color}
                        onChange={event =>
                          updateGaugeThreshold(threshold.id, { color: event.target.value })
                        }
                        disabled={loading}
                        className="h-9 w-10 cursor-pointer rounded-lg p-0.5"
                        style={fieldStyle}
                      />
                      <button
                        type="button"
                        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent transition hover:opacity-80"
                        style={{ color: 'var(--color-error)' }}
                        onClick={() => removeGaugeThreshold(threshold.id)}
                        disabled={loading}
                        title="Remove threshold"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {isPieType ? (
            <div
              className="mb-5 pt-5"
              style={{ borderTop: '1px solid var(--color-outline-variant)' }}
            >
              <h4
                className="mb-3 text-sm font-semibold"
                style={{ color: 'var(--color-on-surface)' }}
              >
                Pie Chart Options
              </h4>
              <div className="grid grid-cols-3 gap-3">
                <div className="mb-3">
                  <label
                    htmlFor="pie-display"
                    className="mb-2 block text-sm font-medium"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    Display Style
                  </label>
                  <select
                    id="pie-display"
                    value={pieDisplayAs}
                    onChange={event => setPieDisplayAs(event.target.value as 'pie' | 'donut')}
                    disabled={loading}
                    data-testid="panel-pie-display-select"
                    className={selectClass}
                    style={fieldStyle}
                  >
                    <option value="pie">Pie</option>
                    <option value="donut">Donut</option>
                  </select>
                </div>
                <div className="mb-3">
                  <label
                    htmlFor="pie-legend"
                    className="mb-2 block text-sm font-medium"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    Show Legend
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="pie-legend"
                      type="checkbox"
                      checked={pieShowLegend}
                      onChange={event => setPieShowLegend(event.target.checked)}
                      disabled={loading}
                      data-testid="panel-pie-legend-checkbox"
                      className="h-4 w-4 rounded"
                    />
                    <label
                      htmlFor="pie-legend"
                      className="text-sm"
                      style={{ color: 'var(--color-on-surface)' }}
                    >
                      Display legend
                    </label>
                  </div>
                </div>
                <div className="mb-3">
                  <label
                    htmlFor="pie-labels"
                    className="mb-2 block text-sm font-medium"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    Show Labels
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="pie-labels"
                      type="checkbox"
                      checked={pieShowLabels}
                      onChange={event => setPieShowLabels(event.target.checked)}
                      disabled={loading}
                      data-testid="panel-pie-labels-checkbox"
                      className="h-4 w-4 rounded"
                    />
                    <label
                      htmlFor="pie-labels"
                      className="text-sm"
                      style={{ color: 'var(--color-on-surface)' }}
                    >
                      Display value labels
                    </label>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {isStatType ? (
            <div
              className="mb-5 pt-5"
              style={{ borderTop: '1px solid var(--color-outline-variant)' }}
            >
              <h4
                className="mb-3 text-sm font-semibold"
                style={{ color: 'var(--color-on-surface)' }}
              >
                Stat Panel Options
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="mb-3">
                  <label
                    htmlFor="stat-unit"
                    className="mb-2 block text-sm font-medium"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    Unit
                  </label>
                  <input
                    id="stat-unit"
                    type="text"
                    value={statUnit}
                    onChange={event => setStatUnit(event.target.value)}
                    placeholder="%"
                    disabled={loading}
                    data-testid="panel-stat-unit-input"
                    className={inputClass}
                    style={fieldStyle}
                  />
                </div>
                <div className="mb-3">
                  <label
                    htmlFor="stat-decimals"
                    className="mb-2 block text-sm font-medium"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    Decimals
                  </label>
                  <input
                    id="stat-decimals"
                    type="number"
                    min={0}
                    max={10}
                    value={statDecimals}
                    onChange={event => setStatDecimals(Number(event.target.value))}
                    disabled={loading}
                    data-testid="panel-stat-decimals-input"
                    className={inputClass}
                    style={fieldStyle}
                  />
                </div>
              </div>
              <div className="mb-3 grid grid-cols-2 gap-3">
                <label
                  className="flex cursor-pointer items-center gap-2 text-sm font-medium"
                  style={{ color: 'var(--color-on-surface)' }}
                >
                  <input
                    type="checkbox"
                    checked={statShowTrend}
                    onChange={event => setStatShowTrend(event.target.checked)}
                    disabled={loading}
                    data-testid="panel-stat-trend-checkbox"
                    className="h-4 w-4 rounded"
                  />
                  Show Trend Indicator
                </label>
                <label
                  className="flex cursor-pointer items-center gap-2 text-sm font-medium"
                  style={{ color: 'var(--color-on-surface)' }}
                >
                  <input
                    type="checkbox"
                    checked={statShowSparkline}
                    onChange={event => setStatShowSparkline(event.target.checked)}
                    disabled={loading}
                    data-testid="panel-stat-sparkline-checkbox"
                    className="h-4 w-4 rounded"
                  />
                  Show Sparkline
                </label>
              </div>
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <span
                    className="text-sm font-medium"
                    style={{ color: 'var(--color-on-surface)' }}
                  >
                    Thresholds (Optional)
                  </span>
                  <button
                    type="button"
                    data-testid="panel-stat-add-threshold-btn"
                    className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
                    style={{
                      backgroundColor: 'var(--color-surface-container-high)',
                      color: 'var(--color-on-surface)',
                      border: '1px solid var(--color-outline-variant)',
                    }}
                    onClick={addStatThreshold}
                    disabled={loading}
                  >
                    <Plus size={14} />
                    Add
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  {statThresholds.map(threshold => (
                    <div key={threshold.id} className="flex items-center gap-2">
                      <input
                        type="number"
                        value={threshold.value}
                        onChange={event =>
                          updateStatThreshold(threshold.id, {
                            value: Number(event.target.value),
                          })
                        }
                        placeholder="Value"
                        disabled={loading}
                        className={`${inputClass} !w-auto flex-1`}
                        style={fieldStyle}
                      />
                      <input
                        type="color"
                        value={threshold.color}
                        onChange={event =>
                          updateStatThreshold(threshold.id, { color: event.target.value })
                        }
                        disabled={loading}
                        className="h-9 w-10 cursor-pointer rounded-lg p-0.5"
                        style={fieldStyle}
                      />
                      <button
                        type="button"
                        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent transition hover:opacity-80"
                        style={{ color: 'var(--color-error)' }}
                        onClick={() => removeStatThreshold(threshold.id)}
                        disabled={loading}
                        title="Remove threshold"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {error ? (
            <div
              className="mb-5 rounded-lg px-4 py-3 text-sm"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
                color: 'var(--color-error)',
              }}
              data-testid="panel-edit-error"
            >
              {error}
            </div>
          ) : null}

          <div
            className="mt-2 flex justify-end gap-3 pt-4"
            style={{ borderTop: '1px solid var(--color-outline-variant)' }}
          >
            <button
              type="button"
              data-testid="panel-edit-cancel-btn"
              className="cursor-pointer rounded-lg px-5 py-2.5 text-sm font-semibold transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                backgroundColor: 'var(--color-surface-container-high)',
                color: 'var(--color-on-surface)',
                border: '1px solid var(--color-outline-variant)',
              }}
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="panel-edit-save-btn"
              className="cursor-pointer rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                background:
                  'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
              }}
              disabled={loading}
            >
              {loading ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Panel'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
