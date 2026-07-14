import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  HeartPulse,
  History,
  LayoutDashboard,
  Loader2,
  Play,
  Star,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { queryDataSource } from '@/api/datasources'
import { ExportToDashboardModal } from '@/components/ExportToDashboardModal'
import { LineChart, type ChartSeries } from '@/components/LineChart'
import { MonacoQueryEditor } from '@/components/MonacoQueryEditor'
import { QueryBuilder } from '@/components/QueryBuilder'
import { TimeRangePicker } from '@/components/TimeRangePicker'
import { useMetricsDatasources } from '@/hooks/useMetricsDatasources'
import { useTimeRange } from '@/hooks/useTimeRange'
import {
  type PrometheusQueryData,
  type PrometheusQueryResult,
  transformToChartData,
} from '@/promql/client'
import { useFavoritesStore } from '@/stores/favoritesStore'
import { useOrgStore } from '@/stores/orgStore'
import {
  dataSourceTypeLabels,
  type DataSource,
  type DataSourceType,
} from '@/types/datasource'
import { dataSourceTypeLogos } from '@/utils/datasourceLogos'

type DatasourceHealthStatus = 'unknown' | 'checking' | 'healthy' | 'unhealthy'

type TraceMetricsNavigationContext = {
  serviceName?: string
  startMs?: number
  endMs?: number
  createdAt?: number
}

type MetricsExplorePanelProps = {
  onDatasourceChanged?: (payload: { id: string; name: string; type: string }) => void
}

const HISTORY_KEY = 'explore_query_history'
const MAX_HISTORY = 10
const TRACE_METRICS_NAVIGATION_CONTEXT_KEY = 'trace_metrics_navigation'
const TRACE_NAVIGATION_MAX_AGE_MS = 5 * 60 * 1000

function escapePromQLLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function escapeForSingleQuotedValue(value: string): string {
  return value.replace(/'/g, "''")
}

function getDefaultMetricsQuery(type_: DataSourceType): string {
  switch (type_) {
    case 'prometheus':
    case 'victoriametrics':
      return ''
    case 'clickhouse':
      return "SELECT\n  toStartOfInterval(TimeUnix, INTERVAL 1 minute) AS timestamp,\n  avg(Value) AS value,\n  MetricName AS metric\nFROM otel_metrics_gauge\nWHERE TimeUnix >= fromUnixTimestamp({start})\n  AND TimeUnix <= fromUnixTimestamp({end})\nGROUP BY timestamp, metric\nORDER BY timestamp"
    case 'elasticsearch':
      return '{"index":"ace-logs","aggs":{"timeseries":{"date_histogram":{"field":"@timestamp","fixed_interval":"1m","min_doc_count":0}}}}'
    case 'cloudwatch':
      return '{"namespace":"AWS/EC2","metric_name":"CPUUtilization","stat":"Average","period":60}'
    default:
      return ''
  }
}

function buildServiceMetricsQuery(type_: DataSourceType, serviceName: string): string {
  if (type_ === 'clickhouse') {
    const escapedService = escapeForSingleQuotedValue(serviceName)
    if (!escapedService) {
      return 'SELECT timestamp, value, metric FROM metrics WHERE timestamp >= toDateTime({start}) AND timestamp <= toDateTime({end}) ORDER BY timestamp'
    }

    return `SELECT timestamp, value, metric\nFROM metrics\nWHERE timestamp >= toDateTime({start}) AND timestamp <= toDateTime({end})\nAND service_name = '${escapedService}'\nORDER BY timestamp`
  }

  if (type_ === 'cloudwatch') {
    return JSON.stringify(
      {
        namespace: 'AWS/ECS',
        metric_name: 'CPUUtilization',
        dimensions: serviceName ? { ServiceName: serviceName } : {},
        stat: 'Average',
        period: 60,
      },
      null,
      2,
    )
  }

  if (type_ === 'elasticsearch') {
    const serviceFilter = serviceName ? [{ term: { 'service.name.keyword': serviceName } }] : []

    return JSON.stringify(
      {
        index: 'ace-logs',
        query: {
          bool: {
            filter: serviceFilter,
          },
        },
        aggs: {
          timeseries: {
            date_histogram: {
              field: '@timestamp',
              fixed_interval: '30s',
              min_doc_count: 0,
            },
          },
        },
      },
      null,
      2,
    )
  }

  if (!serviceName) {
    return 'sum(rate(http_requests_total[5m]))'
  }

  const escapedService = escapePromQLLabelValue(serviceName)
  return `sum(rate(http_requests_total{service="${escapedService}"}[5m])) or sum(rate(http_requests_total{service_name="${escapedService}"}[5m]))`
}

function getSmokeQuery(type_: DataSourceType): string {
  if (type_ === 'prometheus' || type_ === 'victoriametrics') {
    return 'up'
  }
  if (type_ === 'clickhouse') {
    return "SELECT now() AS timestamp, toFloat64(1) AS value, 'up' AS metric LIMIT 1"
  }
  if (type_ === 'cloudwatch') {
    return '{"namespace":"AWS/EC2","metric_name":"CPUUtilization","stat":"Average","period":60}'
  }
  if (type_ === 'elasticsearch') {
    return '{"index":"ace-logs","aggs":{"timeseries":{"date_histogram":{"field":"@timestamp","fixed_interval":"1m","min_doc_count":0}}}}'
  }
  if (type_ === 'loki') {
    return '{job=~".+"}'
  }
  return '*'
}

function getTypeLogo(type_: DataSourceType): string | undefined {
  return dataSourceTypeLogos[type_]
}

function isPrometheusLike(type_: DataSourceType): boolean {
  return type_ === 'prometheus' || type_ === 'victoriametrics'
}

export function MetricsExplorePanel({ onDatasourceChanged }: MetricsExplorePanelProps) {
  const currentOrgId = useOrgStore(state => state.currentOrgId)
  const { metricsDatasources } = useMetricsDatasources(currentOrgId)
  const { timeRange, onRefresh, setCustomRange } = useTimeRange()
  const toggleFavorite = useFavoritesStore(state => state.toggleFavorite)
  const isFavorite = useFavoritesStore(state => state.isFavorite)
  const [searchParams] = useSearchParams()

  const [selectedDatasourceId, setSelectedDatasourceId] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PrometheusQueryResult | null>(null)
  const [chartSeries, setChartSeries] = useState<ChartSeries[]>([])
  const [showExportModal, setShowExportModal] = useState(false)
  const [queryHistory, setQueryHistory] = useState<string[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [showDatasourceMenu, setShowDatasourceMenu] = useState(false)
  const [datasourceHealth, setDatasourceHealth] = useState<Record<string, DatasourceHealthStatus>>(
    {},
  )
  const [datasourceHealthErrors, setDatasourceHealthErrors] = useState<Record<string, string>>({})
  const [pendingServiceName, setPendingServiceName] = useState('')
  const [pendingStartMs, setPendingStartMs] = useState<number | null>(null)
  const [pendingEndMs, setPendingEndMs] = useState<number | null>(null)

  const datasourceMenuRef = useRef<HTMLDivElement | null>(null)
  const pendingNavigationRef = useRef({
    serviceName: '',
    startMs: null as number | null,
    endMs: null as number | null,
  })

  const activeDatasource = useMemo(
    () => metricsDatasources.find(ds => ds.id === selectedDatasourceId) ?? null,
    [metricsDatasources, selectedDatasourceId],
  )

  const hasMetricsDatasources = metricsDatasources.length > 0
  const hasResults = result?.status === 'success' && chartSeries.length > 0
  const seriesCount = chartSeries.length
  const activeDatasourceHealth = activeDatasource
    ? datasourceHealth[activeDatasource.id] || 'unknown'
    : 'unknown'

  const activeDatasourceHealthLabel =
    activeDatasourceHealth === 'healthy'
      ? 'Healthy'
      : activeDatasourceHealth === 'unhealthy'
        ? 'Unhealthy'
        : activeDatasourceHealth === 'checking'
          ? 'Checking...'
          : 'Unknown'

  const addToHistory = useCallback((q: string) => {
    if (!q.trim()) return
    setQueryHistory(prev => {
      const filtered = prev.filter(item => item !== q)
      const next = [q, ...filtered].slice(0, MAX_HISTORY)
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const runQuery = useCallback(async () => {
    if (!selectedDatasourceId) {
      setError('Select a metrics datasource')
      return
    }

    if (!query.trim()) {
      setError('Query is required')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)
    setChartSeries([])

    try {
      const start = Math.floor(timeRange.start / 1000)
      const end = Math.floor(timeRange.end / 1000)
      const duration = end - start
      const step = Math.max(15, Math.floor(duration / 200))
      const dsType = activeDatasource?.type

      const response = await queryDataSource(selectedDatasourceId, {
        query,
        signal:
          dsType === 'clickhouse' || dsType === 'cloudwatch' || dsType === 'elasticsearch'
            ? 'metrics'
            : undefined,
        start,
        end,
        step,
      })

      if (response.status === 'error') {
        setError(response.error || 'Query failed')
      } else if (response.resultType !== 'metrics') {
        setError('Selected datasource did not return metric results')
      } else {
        const metricsResponse: PrometheusQueryResult = {
          status: response.status,
          data: response.data as PrometheusQueryData | undefined,
          error: response.error,
        }

        setResult(metricsResponse)
        const chartData = transformToChartData(metricsResponse)
        setChartSeries(
          chartData.series.map(series => ({
            name: series.name,
            data: series.data,
          })),
        )
        addToHistory(query)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to execute query')
    } finally {
      setLoading(false)
    }
  }, [activeDatasource?.type, addToHistory, query, selectedDatasourceId, timeRange.end, timeRange.start])

  const applyTraceMetricsNavigationContext = useCallback(() => {
    const pending = pendingNavigationRef.current
    if (!pending.serviceName && pending.startMs === null && pending.endMs === null) {
      return
    }

    setQuery(
      buildServiceMetricsQuery(activeDatasource?.type || 'prometheus', pending.serviceName),
    )

    if (pending.startMs !== null && pending.endMs !== null) {
      setCustomRange(pending.startMs, pending.endMs)
    }

    pendingNavigationRef.current = { serviceName: '', startMs: null, endMs: null }
    setPendingServiceName('')
    setPendingStartMs(null)
    setPendingEndMs(null)
  }, [activeDatasource?.type, setCustomRange])

  const checkDatasourceHealth = useCallback(async (datasourceId: string, type_: DataSourceType) => {
    setDatasourceHealth(prev => ({ ...prev, [datasourceId]: 'checking' }))
    setDatasourceHealthErrors(prev => {
      const next = { ...prev }
      delete next[datasourceId]
      return next
    })

    const end = Math.floor(Date.now() / 1000)
    const start = end - 15 * 60

    try {
      const healthResult = await queryDataSource(datasourceId, {
        query: getSmokeQuery(type_),
        signal:
          type_ === 'clickhouse' || type_ === 'cloudwatch' || type_ === 'elasticsearch'
            ? 'metrics'
            : undefined,
        start,
        end,
        step: 15,
        limit: 100,
      })

      if (healthResult.status === 'error') {
        throw new Error(healthResult.error || 'Health check failed')
      }

      setDatasourceHealth(prev => ({ ...prev, [datasourceId]: 'healthy' }))
    } catch (e) {
      setDatasourceHealth(prev => ({ ...prev, [datasourceId]: 'unhealthy' }))
      setDatasourceHealthErrors(prev => ({
        ...prev,
        [datasourceId]: e instanceof Error ? e.message : 'Health check failed',
      }))
    }
  }, [])

  useEffect(() => {
    const urlQuery = searchParams.get('q')
    if (urlQuery) {
      setQuery(urlQuery)
    }

    try {
      const rawContext = localStorage.getItem(TRACE_METRICS_NAVIGATION_CONTEXT_KEY)
      localStorage.removeItem(TRACE_METRICS_NAVIGATION_CONTEXT_KEY)
      if (rawContext) {
        const parsed = JSON.parse(rawContext) as TraceMetricsNavigationContext
        if (typeof parsed.createdAt === 'number') {
          const ageMs = Date.now() - parsed.createdAt
          if (ageMs <= TRACE_NAVIGATION_MAX_AGE_MS) {
            const serviceName =
              typeof parsed.serviceName === 'string' ? parsed.serviceName.trim() : ''
            const startMs =
              typeof parsed.startMs === 'number' &&
              typeof parsed.endMs === 'number' &&
              parsed.endMs > parsed.startMs
                ? parsed.startMs
                : null
            const endMs =
              typeof parsed.startMs === 'number' &&
              typeof parsed.endMs === 'number' &&
              parsed.endMs > parsed.startMs
                ? parsed.endMs
                : null

            pendingNavigationRef.current = { serviceName, startMs, endMs }
            setPendingServiceName(serviceName)
            setPendingStartMs(startMs)
            setPendingEndMs(endMs)
          }
        }
      }
    } catch {
      // Ignore malformed navigation context.
    }

    const stored = sessionStorage.getItem(HISTORY_KEY)
    if (stored) {
      try {
        setQueryHistory(JSON.parse(stored))
      } catch {
        setQueryHistory([])
      }
    }
  }, [searchParams])

  const previousOrgIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!currentOrgId) return
    if (previousOrgIdRef.current && previousOrgIdRef.current !== currentOrgId) {
      setSelectedDatasourceId('')
      setDatasourceHealth({})
      setDatasourceHealthErrors({})
      setQuery('')
      setResult(null)
      setChartSeries([])
      setError(null)
    }
    previousOrgIdRef.current = currentOrgId
  }, [currentOrgId])

  useEffect(() => {
    if (metricsDatasources.length === 0) {
      setSelectedDatasourceId('')
      return
    }

    const hasSelected = metricsDatasources.some(ds => ds.id === selectedDatasourceId)
    if (!hasSelected) {
      const defaultDatasource = metricsDatasources.find(ds => ds.is_default)
      const selected = defaultDatasource || metricsDatasources[0]
      if (!selected) return
      setSelectedDatasourceId(selected.id)

      if (!query.trim()) {
        const defaultQuery = getDefaultMetricsQuery(selected.type)
        if (defaultQuery) {
          setQuery(defaultQuery)
        }
      }
    }
  }, [metricsDatasources, query, selectedDatasourceId])

  useEffect(() => {
    const sourceIds = new Set(metricsDatasources.map(ds => ds.id))
    setDatasourceHealth(prev =>
      Object.fromEntries(Object.entries(prev).filter(([id]) => sourceIds.has(id))),
    )
    setDatasourceHealthErrors(prev =>
      Object.fromEntries(Object.entries(prev).filter(([id]) => sourceIds.has(id))),
    )
  }, [metricsDatasources])

  // biome-ignore lint/correctness/useExhaustiveDependencies: run when navigation/health context for active datasource changes
  useEffect(() => {
    if (!activeDatasource) return

    if (
      pendingServiceName ||
      pendingStartMs !== null ||
      pendingEndMs !== null ||
      pendingNavigationRef.current.serviceName ||
      pendingNavigationRef.current.startMs !== null
    ) {
      applyTraceMetricsNavigationContext()
    }

    if ((datasourceHealth[activeDatasource.id] || 'unknown') === 'unknown') {
      void checkDatasourceHealth(activeDatasource.id, activeDatasource.type)
    }
  }, [
    activeDatasource,
    applyTraceMetricsNavigationContext,
    checkDatasourceHealth,
    datasourceHealth,
    pendingEndMs,
    pendingServiceName,
    pendingStartMs,
  ])

  // biome-ignore lint/correctness/useExhaustiveDependencies: close menu when datasource selection changes
  useEffect(() => {
    setShowDatasourceMenu(false)
  }, [selectedDatasourceId])

  useEffect(() => {
    const ds = metricsDatasources.find(d => d.id === selectedDatasourceId)
    if (ds) {
      onDatasourceChanged?.({ id: ds.id, name: ds.name, type: ds.type })
    }
  }, [metricsDatasources, onDatasourceChanged, selectedDatasourceId])

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      const target = event.target as Node
      if (!datasourceMenuRef.current?.contains(target)) {
        setShowDatasourceMenu(false)
      }
    }

    document.addEventListener('click', handleDocumentClick)
    return () => document.removeEventListener('click', handleDocumentClick)
  }, [])

  useEffect(() => {
    return onRefresh(() => {
      if (query.trim() && selectedDatasourceId && result?.status === 'success') {
        void runQuery()
      }
    })
  }, [onRefresh, query, result?.status, runQuery, selectedDatasourceId])

  function handleKeydown(event: React.KeyboardEvent<HTMLDivElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      void runQuery()
    }
  }

  function selectDatasource(datasourceId: string) {
    const prevDs = metricsDatasources.find(d => d.id === selectedDatasourceId)
    setSelectedDatasourceId(datasourceId)
    setShowDatasourceMenu(false)

    const newDs = metricsDatasources.find(d => d.id === datasourceId)
    if (newDs) {
      const defaultQuery = getDefaultMetricsQuery(newDs.type)
      if (defaultQuery && (!query.trim() || (prevDs && prevDs.type !== newDs.type))) {
        setQuery(defaultQuery)
      }
    }
  }

  function selectHistoryQuery(q: string) {
    setQuery(q)
    setShowHistory(false)
  }

  function clearHistory() {
    setQueryHistory([])
    sessionStorage.removeItem(HISTORY_KEY)
  }

  function toggleDatasourceMenu() {
    if (loading || !hasMetricsDatasources) return
    setShowDatasourceMenu(prev => !prev)
  }

  const favoriteId = `explore::metrics::${query}`

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: panel-level Ctrl/Cmd+Enter to run query
    <section className="flex flex-1 flex-col gap-6" onKeyDown={handleKeydown}>
      <div
        className="flex flex-col gap-4 rounded-lg p-4"
        style={{ backgroundColor: 'var(--color-surface-container-low)' }}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 max-md:grid-cols-1">
          <div className="flex flex-col gap-2.5">
            <label
              htmlFor="explore-datasource-btn"
              className="text-xs font-semibold tracking-wide uppercase"
              style={{ color: 'var(--color-outline)' }}
            >
              Data Source
            </label>
            <div ref={datasourceMenuRef} className="relative">
              <button
                id="explore-datasource-btn"
                type="button"
                className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  backgroundColor: 'var(--color-surface-container-high)',
                  border: '1px solid var(--color-outline-variant)',
                  color: 'var(--color-on-surface)',
                }}
                data-testid="explore-datasource-btn"
                disabled={loading || !hasMetricsDatasources}
                onClick={toggleDatasourceMenu}
              >
                {activeDatasource ? (
                  <>
                    <img
                      src={getTypeLogo(activeDatasource.type)}
                      alt={`${dataSourceTypeLabels[activeDatasource.type]} logo`}
                      className="h-7 w-7 shrink-0 object-contain"
                    />
                    <div className="flex min-w-0 flex-col gap-px">
                      <span
                        className="text-[0.68rem] tracking-wide uppercase"
                        style={{ color: 'var(--color-outline)' }}
                      >
                        Active Source
                      </span>
                      <strong
                        className="truncate text-sm font-semibold"
                        style={{ color: 'var(--color-on-surface)' }}
                      >
                        {activeDatasource.name}
                      </strong>
                      <span
                        className="font-mono text-xs tracking-[0.07em] uppercase"
                        style={{ color: 'var(--color-outline)' }}
                      >
                        {dataSourceTypeLabels[activeDatasource.type]}
                      </span>
                    </div>
                    <span
                      className="ml-auto inline-flex items-center gap-1.5 rounded-sm px-2.5 py-0.5 text-xs"
                      style={{
                        border: '1px solid var(--color-outline-variant)',
                        color:
                          activeDatasourceHealth === 'healthy'
                            ? 'var(--color-secondary)'
                            : activeDatasourceHealth === 'unhealthy'
                              ? 'var(--color-error)'
                              : 'var(--color-outline)',
                      }}
                      title={datasourceHealthErrors[activeDatasource.id]}
                    >
                      {activeDatasourceHealth === 'checking' ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : activeDatasourceHealth === 'healthy' ? (
                        <HeartPulse size={12} />
                      ) : activeDatasourceHealth === 'unhealthy' ? (
                        <CircleAlert size={12} />
                      ) : null}
                      <span>{activeDatasourceHealthLabel}</span>
                    </span>
                  </>
                ) : (
                  <span className="text-sm" style={{ color: 'var(--color-outline)' }}>
                    No metrics datasource configured
                  </span>
                )}
                {showDatasourceMenu ? (
                  <ChevronUp size={16} className="ml-1 shrink-0" style={{ color: 'var(--color-outline)' }} />
                ) : (
                  <ChevronDown size={16} className="ml-1 shrink-0" style={{ color: 'var(--color-outline)' }} />
                )}
              </button>

              {showDatasourceMenu && hasMetricsDatasources ? (
                <div
                  className="absolute top-full right-0 left-0 z-[110] mt-1.5 max-h-[280px] overflow-y-auto rounded-lg shadow-lg"
                  style={{
                    backgroundColor: 'var(--color-surface-bright)',
                    border: '1px solid var(--color-outline-variant)',
                  }}
                >
                  {metricsDatasources.map((ds: DataSource) => (
                    <button
                      key={ds.id}
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-2.5 border-none bg-transparent px-3 py-2.5 text-left transition"
                      style={{
                        color: 'var(--color-on-surface)',
                        backgroundColor:
                          ds.id === selectedDatasourceId
                            ? 'color-mix(in srgb, var(--color-primary) 15%, transparent)'
                            : 'transparent',
                      }}
                      onClick={() => selectDatasource(ds.id)}
                      onMouseEnter={event => {
                        event.currentTarget.style.backgroundColor =
                          'var(--color-surface-container-high)'
                      }}
                      onMouseLeave={event => {
                        event.currentTarget.style.backgroundColor =
                          ds.id === selectedDatasourceId
                            ? 'color-mix(in srgb, var(--color-primary) 15%, transparent)'
                            : 'transparent'
                      }}
                    >
                      <img
                        src={getTypeLogo(ds.type)}
                        alt={`${dataSourceTypeLabels[ds.type]} logo`}
                        className="h-[18px] w-[18px] shrink-0 object-contain"
                      />
                      <div className="flex min-w-0 flex-col gap-px">
                        <strong className="text-sm font-semibold" style={{ color: 'var(--color-on-surface)' }}>
                          {ds.name}
                        </strong>
                        <span className="text-xs" style={{ color: 'var(--color-outline)' }}>
                          {dataSourceTypeLabels[ds.type]}
                        </span>
                      </div>
                      {ds.id === selectedDatasourceId ? (
                        <Check size={14} className="ml-auto" style={{ color: 'var(--color-primary)' }} />
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <span
              className="text-xs font-semibold tracking-wide uppercase"
              style={{ color: 'var(--color-outline)' }}
            >
              Query Range
            </span>
            <TimeRangePicker stacked />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {activeDatasource && isPrometheusLike(activeDatasource.type) ? (
            <QueryBuilder
              value={query}
              onChange={setQuery}
              disabled={loading || !hasMetricsDatasources}
              datasourceId={selectedDatasourceId}
            />
          ) : (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-[var(--color-on-surface)]">Query</span>
              <MonacoQueryEditor
                value={query}
                onChange={setQuery}
                onSubmit={() => void runQuery()}
                disabled={loading || !hasMetricsDatasources}
                height={160}
                placeholder={
                  activeDatasource?.type === 'clickhouse'
                    ? 'Enter SQL query...'
                    : activeDatasource?.type === 'cloudwatch'
                      ? 'Enter CloudWatch query JSON...'
                      : activeDatasource?.type === 'elasticsearch'
                        ? 'Enter Elasticsearch query JSON...'
                        : 'Enter query...'
                }
              />
            </div>
          )}

          {queryHistory.length > 0 ? (
            <div className="relative">
              <button
                type="button"
                data-testid="explore-history-btn"
                className="flex cursor-pointer items-center gap-1 border-none bg-transparent text-sm transition"
                style={{ color: showHistory ? 'var(--color-on-surface)' : 'var(--color-outline)' }}
                onClick={() => setShowHistory(prev => !prev)}
                title="Query history"
              >
                <History size={16} />
                <span>History</span>
              </button>

              {showHistory ? (
                <div
                  className="absolute top-full left-0 z-10 mt-1 max-h-[300px] w-80 overflow-y-auto rounded-lg shadow-lg max-md:w-full"
                  style={{
                    backgroundColor: 'var(--color-surface-bright)',
                    border: '1px solid var(--color-outline-variant)',
                  }}
                >
                  <div
                    className="flex items-center justify-between px-4 py-3 text-xs font-semibold tracking-wide uppercase"
                    style={{
                      color: 'var(--color-outline)',
                      borderBottom: '1px solid var(--color-outline-variant)',
                    }}
                  >
                    <span>Recent Queries</span>
                    <button
                      type="button"
                      className="flex h-6 w-6 cursor-pointer items-center justify-center rounded border-none bg-transparent transition"
                      style={{ color: 'var(--color-outline)' }}
                      onClick={clearHistory}
                      title="Clear history"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  {queryHistory.map((historyQuery, index) => (
                    <button
                      // biome-ignore lint/suspicious/noArrayIndexKey: duplicate queries in history are rare; index disambiguates
                      key={`${historyQuery}-${index}`}
                      type="button"
                      className="block w-full cursor-pointer border-none bg-transparent px-4 py-2.5 text-left transition"
                      style={{ borderBottom: '1px solid var(--color-outline-variant)' }}
                      onClick={() => selectHistoryQuery(historyQuery)}
                      onMouseEnter={event => {
                        event.currentTarget.style.backgroundColor =
                          'var(--color-surface-container-high)'
                      }}
                      onMouseLeave={event => {
                        event.currentTarget.style.backgroundColor = 'transparent'
                      }}
                    >
                      <code
                        className="block truncate font-mono text-xs"
                        style={{ color: 'var(--color-on-surface-variant)' }}
                      >
                        {historyQuery}
                      </code>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            data-testid="explore-run-query-btn"
            className="inline-flex cursor-pointer items-center gap-2 rounded-sm px-5 py-2.5 text-sm font-semibold whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
              color: '#fff',
              border: 'none',
            }}
            disabled={loading || !query.trim() || !selectedDatasourceId || !hasMetricsDatasources}
            onClick={() => void runQuery()}
          >
            <Play size={16} />
            <span>{loading ? 'Running...' : 'Run Query'}</span>
          </button>

          {query.trim() ? (
            <button
              type="button"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm border px-3 py-2.5 text-sm transition"
              style={{
                backgroundColor: isFavorite(favoriteId)
                  ? 'var(--color-primary-muted)'
                  : 'var(--color-surface-container-high)',
                borderColor: isFavorite(favoriteId)
                  ? 'var(--color-primary)'
                  : 'var(--color-stroke-subtle)',
                color: isFavorite(favoriteId)
                  ? 'var(--color-primary)'
                  : 'var(--color-on-surface-variant)',
              }}
              title={isFavorite(favoriteId) ? 'Remove from favorites' : 'Save to favorites'}
              onClick={() =>
                toggleFavorite({
                  id: favoriteId,
                  title: query.length > 40 ? `${query.slice(0, 40)}...` : query,
                  type: 'explore',
                })
              }
            >
              <Star size={14} fill={isFavorite(favoriteId) ? 'currentColor' : 'none'} />
            </button>
          ) : null}

          <button
            type="button"
            data-testid="explore-export-btn"
            className="inline-flex items-center gap-2 rounded-sm px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              backgroundColor: 'transparent',
              color: query.trim() ? 'var(--color-on-surface-variant)' : 'var(--color-outline)',
              border: '1px solid var(--color-outline-variant)',
            }}
            disabled={!query.trim() || !selectedDatasourceId}
            onClick={() => setShowExportModal(true)}
          >
            <LayoutDashboard size={16} />
            <span>Add to Dashboard</span>
          </button>

          <span className="text-xs" style={{ color: 'var(--color-outline)' }}>
            Ctrl+Enter to run
          </span>
        </div>

        {error ? (
          <div
            className="flex items-center gap-2 rounded-sm p-4 text-sm"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
              color: 'var(--color-error)',
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        ) : null}
      </div>

      <div
        className="flex min-h-[400px] flex-1 flex-col overflow-hidden rounded-lg"
        style={{ backgroundColor: 'var(--color-surface-container-low)' }}
      >
        {loading ? (
          <div
            className="flex flex-1 flex-col items-center justify-center gap-4 py-12"
            style={{ color: 'var(--color-outline)' }}
          >
            <div
              className="h-8 w-8 animate-spin rounded-full"
              style={{
                border: '3px solid var(--color-outline-variant)',
                borderTopColor: 'var(--color-primary)',
              }}
            />
            <span className="text-sm">Executing query...</span>
          </div>
        ) : hasResults ? (
          <div className="flex flex-1 flex-col">
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{
                borderBottom: '1px solid var(--color-outline-variant)',
                backgroundColor: 'var(--color-surface-container-high)',
              }}
            >
              <span className="font-mono text-sm" style={{ color: 'var(--color-outline)' }}>
                {seriesCount} series
              </span>
              {seriesCount > 30 ? (
                <span className="ml-2 text-xs" style={{ color: 'var(--color-tertiary)' }}>
                  Tip: Add label filters or use an aggregation like{' '}
                  <code
                    className="rounded px-1"
                    style={{ backgroundColor: 'var(--color-surface)' }}
                  >
                    rate()
                  </code>{' '}
                  or{' '}
                  <code
                    className="rounded px-1"
                    style={{ backgroundColor: 'var(--color-surface)' }}
                  >
                    sum by()
                  </code>{' '}
                  to reduce series count.
                </span>
              ) : null}
            </div>
            <div className="min-h-[400px] flex-1 p-4">
              <LineChart series={chartSeries} height={400} group="explore-metrics" />
            </div>
          </div>
        ) : result?.status === 'success' && chartSeries.length === 0 ? (
          <div
            className="flex flex-1 flex-col items-center justify-center py-12 text-center text-sm"
            style={{ color: 'var(--color-outline)' }}
          >
            <p className="m-0">No data returned for the selected time range.</p>
          </div>
        ) : !hasMetricsDatasources ? (
          <div
            className="flex flex-1 flex-col items-center justify-center py-12 text-center text-sm"
            style={{ color: 'var(--color-outline)' }}
          >
            <p className="m-0">No metrics datasource configured.</p>
            <p className="m-0 text-xs">
              Add a Prometheus, VictoriaMetrics, CloudWatch, or Elasticsearch datasource in Data
              Sources.
            </p>
          </div>
        ) : (
          <div
            className="flex flex-1 flex-col items-center justify-center py-12 text-center text-sm"
            style={{ color: 'var(--color-outline)' }}
          >
            <p className="m-0">Write a query and click &quot;Run Query&quot; to visualize your metrics.</p>
          </div>
        )}
      </div>

      {showExportModal ? (
        <ExportToDashboardModal
          query={query}
          signal="metrics"
          datasourceId={selectedDatasourceId}
          onClose={() => setShowExportModal(false)}
        />
      ) : null}
    </section>
  )
}