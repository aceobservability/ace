import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  HeartPulse,
  Loader2,
  Search,
  Star,
  Waypoints,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  fetchDataSourceTrace,
  fetchDataSourceTraceServiceGraph,
  fetchDataSourceTraceServices,
  queryDataSource,
  searchDataSourceTraces,
} from '@/api/datasources'
import { ClickHouseSQLEditor } from '@/components/ClickHouseSQLEditor'
import { TimeRangePicker } from '@/components/TimeRangePicker'
import { TraceListPanel } from '@/components/TraceListPanel'
import { TraceServiceGraph } from '@/components/TraceServiceGraph'
import { TraceSpanDetailsPanel } from '@/components/TraceSpanDetailsPanel'
import { TraceTimeline } from '@/components/TraceTimeline'
import { useTimeRange } from '@/hooks/useTimeRange'
import { useTracingDatasources } from '@/hooks/useTracingDatasources'
import { useFavoritesStore } from '@/stores/favoritesStore'
import { useOrgStore } from '@/stores/orgStore'
import {
  dataSourceTypeLabels,
  type DataSourceType,
  type Trace,
  type TraceServiceGraph as TraceServiceGraphModel,
  type TraceSpan,
  type TraceSummary,
} from '@/types/datasource'
import { convertClickHouseSpansToTraceSummaries } from '@/utils/traceClickHouse'
import { dataSourceTypeLogos } from '@/utils/datasourceLogos'
import { formatDurationNano, formatTraceStart } from '@/utils/traceFormat'

type DatasourceHealthStatus = 'unknown' | 'checking' | 'healthy' | 'unhealthy'

type TracesExplorePanelProps = {
  onDatasourceChanged?: (payload: { id: string; name: string; type: string }) => void
}

const CLICKHOUSE_DEFAULT_QUERY =
  "SELECT\n  SpanId AS span_id,\n  ParentSpanId AS parent_span_id,\n  SpanName AS operation_name,\n  ServiceName AS service_name,\n  toUnixTimestamp64Nano(Timestamp) AS start_time_unix_nano,\n  Duration AS duration_nano,\n  StatusCode AS status\nFROM ace_traces\nWHERE Timestamp BETWEEN fromUnixTimestamp64Nano({start_ns}) AND fromUnixTimestamp64Nano({end_ns})\nLIMIT 200"

const TRACE_NAVIGATION_CONTEXT_KEY = 'dashboard_trace_navigation'
const TRACE_LOGS_NAVIGATION_CONTEXT_KEY = 'trace_logs_navigation'
const TRACE_METRICS_NAVIGATION_CONTEXT_KEY = 'trace_metrics_navigation'
const TRACE_NAVIGATION_MAX_AGE_MS = 5 * 60 * 1000
const TRACE_TO_X_PADDING_MS = 5 * 60 * 1000

function getTypeLogo(type_: DataSourceType): string | undefined {
  return dataSourceTypeLogos[type_]
}

function toMilliseconds(unixNanoTimestamp: number): number {
  return Math.floor(unixNanoTimestamp / 1_000_000)
}

export function TracesExplorePanel({ onDatasourceChanged }: TracesExplorePanelProps) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const currentOrgId = useOrgStore(state => state.currentOrgId)
  const { tracingDatasources } = useTracingDatasources(currentOrgId)
  const { timeRange, isCustomRange, onRefresh } = useTimeRange()
  const toggleFavorite = useFavoritesStore(state => state.toggleFavorite)
  const isFavorite = useFavoritesStore(state => state.isFavorite)

  const [selectedDatasourceId, setSelectedDatasourceId] = useState('')
  const [showDatasourceMenu, setShowDatasourceMenu] = useState(false)
  const [datasourceHealth, setDatasourceHealth] = useState<Record<string, DatasourceHealthStatus>>({})
  const [datasourceHealthErrors, setDatasourceHealthErrors] = useState<Record<string, string>>({})

  const [query, setQuery] = useState('')
  const [selectedService, setSelectedService] = useState('')
  const [limit, setLimit] = useState(20)
  const [traceIdInput, setTraceIdInput] = useState('')

  const [loadingSearch, setLoadingSearch] = useState(false)
  const [loadingTrace, setLoadingTrace] = useState(false)
  const [loadingServices, setLoadingServices] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [serviceGraphError, setServiceGraphError] = useState<string | null>(null)

  const [services, setServices] = useState<string[]>([])
  const [traceSummaries, setTraceSummaries] = useState<TraceSummary[]>([])
  const [selectedTraceId, setSelectedTraceId] = useState('')
  const [activeTrace, setActiveTrace] = useState<Trace | null>(null)
  const [activeServiceGraph, setActiveServiceGraph] = useState<TraceServiceGraphModel | null>(null)
  const [selectedSpan, setSelectedSpan] = useState<TraceSpan | null>(null)
  const [loadingServiceGraph, setLoadingServiceGraph] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  const datasourceMenuRef = useRef<HTMLDivElement | null>(null)
  const pendingTraceDatasourceIdRef = useRef('')
  const pendingTraceIdRef = useRef('')

  const hasTracingDatasources = tracingDatasources.length > 0
  const activeDatasource = useMemo(
    () => tracingDatasources.find(ds => ds.id === selectedDatasourceId) ?? null,
    [tracingDatasources, selectedDatasourceId],
  )
  const isClickHouseDatasource = activeDatasource?.type === 'clickhouse'

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

  const activeDatasourceHealthError = activeDatasource
    ? datasourceHealthErrors[activeDatasource.id] || ''
    : ''

  const checkDatasourceHealth = useCallback(async (datasourceId: string, type_: DataSourceType) => {
    setDatasourceHealth(prev => ({ ...prev, [datasourceId]: 'checking' }))
    setDatasourceHealthErrors(prev => {
      const next = { ...prev }
      delete next[datasourceId]
      return next
    })

    try {
      if (type_ === 'clickhouse') {
        const end = Math.floor(Date.now() / 1000)
        const start = end - 15 * 60
        const healthResult = await queryDataSource(datasourceId, {
          query: "SELECT now() AS timestamp, 'up' AS status LIMIT 1",
          signal: 'traces',
          start,
          end,
          step: 15,
          limit: 1,
        })

        if (healthResult.status === 'error') {
          throw new Error(healthResult.error || 'Health check failed')
        }
      } else {
        await fetchDataSourceTraceServices(datasourceId)
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

  const runClickHouseTraceQuery = useCallback(async () => {
    if (!query.trim()) {
      setError('Query is required')
      return
    }

    if (!selectedDatasourceId) {
      setError('Select a tracing datasource')
      return
    }

    setHasSearched(true)
    setLoadingSearch(true)
    setError(null)
    setActiveTrace(null)
    setActiveServiceGraph(null)
    setServiceGraphError(null)
    setSelectedTraceId('')
    setSelectedSpan(null)

    try {
      const start = Math.floor(timeRange.start / 1000)
      const end = Math.floor(timeRange.end / 1000)

      const response = await queryDataSource(selectedDatasourceId, {
        query,
        signal: 'traces',
        start,
        end,
        step: 15,
        limit,
      })

      if (response.status === 'error') {
        setError(response.error || 'Query failed')
        setTraceSummaries([])
        return
      }

      if (response.resultType !== 'traces') {
        setError('Selected datasource did not return trace results')
        setTraceSummaries([])
        return
      }

      setTraceSummaries(convertClickHouseSpansToTraceSummaries(response.data?.traces || []))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to query traces')
      setTraceSummaries([])
    } finally {
      setLoadingSearch(false)
    }
  }, [limit, query, selectedDatasourceId, timeRange.end, timeRange.start])

  const runSearch = useCallback(async () => {
    if (!selectedDatasourceId) {
      setError('Select a tracing datasource')
      return
    }

    if (isClickHouseDatasource) {
      await runClickHouseTraceQuery()
      return
    }

    setHasSearched(true)
    setLoadingSearch(true)
    setError(null)

    try {
      let start: number
      let end: number

      if (isCustomRange) {
        start = Math.floor(timeRange.start / 1000)
        end = Math.floor(timeRange.end / 1000)
      } else {
        const windowDurationSeconds = Math.max(
          1,
          Math.floor((timeRange.end - timeRange.start) / 1000),
        )
        end = Math.floor(Date.now() / 1000)
        start = end - windowDurationSeconds
      }

      const summaries = await searchDataSourceTraces(selectedDatasourceId, {
        query: query.trim() || undefined,
        service: selectedService || undefined,
        start,
        end,
        limit,
      })
      setTraceSummaries(summaries)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to search traces')
      setTraceSummaries([])
    } finally {
      setLoadingSearch(false)
    }
  }, [
    isClickHouseDatasource,
    isCustomRange,
    limit,
    query,
    runClickHouseTraceQuery,
    selectedDatasourceId,
    selectedService,
    timeRange.end,
    timeRange.start,
  ])

  const loadTrace = useCallback(
    async (traceId: string) => {
      if (isClickHouseDatasource) {
        setError('Trace detail lookup is not available for ClickHouse SQL results yet')
        return
      }

      if (!selectedDatasourceId) {
        setError('Select a tracing datasource')
        return
      }

      setLoadingTrace(true)
      setError(null)

      try {
        const trace = await fetchDataSourceTrace(selectedDatasourceId, traceId)
        setActiveTrace(trace)
        setLoadingServiceGraph(true)
        setServiceGraphError(null)

        try {
          const graph = await fetchDataSourceTraceServiceGraph(selectedDatasourceId, traceId)
          setActiveServiceGraph(graph)
        } catch (graphError) {
          setActiveServiceGraph(null)
          setServiceGraphError(
            graphError instanceof Error ? graphError.message : 'Failed to fetch trace service graph',
          )
        } finally {
          setLoadingServiceGraph(false)
        }

        setSelectedTraceId(traceId)
        setSelectedSpan(null)
        setTraceIdInput(traceId)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to fetch trace')
        setActiveTrace(null)
        setActiveServiceGraph(null)
        setServiceGraphError(null)
        setLoadingServiceGraph(false)
      } finally {
        setLoadingTrace(false)
      }
    },
    [isClickHouseDatasource, selectedDatasourceId],
  )

  const loadServices = useCallback(
    async (autoSearch = false) => {
      if (isClickHouseDatasource) {
        setServices([])
        setSelectedService('')
        return
      }

      if (!selectedDatasourceId) {
        setServices([])
        setSelectedService('')
        return
      }

      setLoadingServices(true)
      try {
        const serviceList = await fetchDataSourceTraceServices(selectedDatasourceId)
        setServices(serviceList)
        setSelectedService(current =>
          current && !serviceList.includes(current) ? '' : current,
        )
        if (autoSearch) {
          void runSearch()
        }
      } catch {
        setServices([])
      } finally {
        setLoadingServices(false)
      }
    },
    [isClickHouseDatasource, runSearch, selectedDatasourceId],
  )

  const tryLoadPendingTrace = useCallback(async () => {
    if (!pendingTraceIdRef.current || !selectedDatasourceId) {
      return
    }

    if (
      pendingTraceDatasourceIdRef.current &&
      pendingTraceDatasourceIdRef.current !== selectedDatasourceId
    ) {
      return
    }

    const traceId = pendingTraceIdRef.current
    pendingTraceIdRef.current = ''
    pendingTraceDatasourceIdRef.current = ''
    setTraceIdInput(traceId)
    await loadTrace(traceId)
  }, [loadTrace, selectedDatasourceId])

  const selectDatasource = useCallback(
    (datasourceId: string) => {
      setSelectedDatasourceId(datasourceId)
      setShowDatasourceMenu(false)

      const ds = tracingDatasources.find(d => d.id === datasourceId)
      if (ds?.type === 'clickhouse' && !query.trim()) {
        setQuery(CLICKHOUSE_DEFAULT_QUERY)
        void runSearch()
      }
    },
    [query, runSearch, tracingDatasources],
  )

  const buildNavigationWindow = useCallback(
    (payload: { startTimeUnixNano: number; endTimeUnixNano: number }) => {
      const startMs = toMilliseconds(payload.startTimeUnixNano)
      const endMs = toMilliseconds(payload.endTimeUnixNano)
      const paddedStartMs = Math.max(0, startMs - TRACE_TO_X_PADDING_MS)
      const paddedEndMs = Math.max(paddedStartMs + 1_000, endMs + TRACE_TO_X_PADDING_MS)
      return { startMs: paddedStartMs, endMs: paddedEndMs }
    },
    [],
  )

  const openTraceLogs = useCallback(
    (payload: {
      traceId: string
      serviceName: string
      startTimeUnixNano: number
      endTimeUnixNano: number
    }) => {
      const { startMs, endMs } = buildNavigationWindow(payload)
      try {
        localStorage.setItem(
          TRACE_LOGS_NAVIGATION_CONTEXT_KEY,
          JSON.stringify({
            traceId: payload.traceId,
            serviceName: payload.serviceName || undefined,
            startMs,
            endMs,
            createdAt: Date.now(),
          }),
        )
      } catch {
        // Ignore localStorage write issues.
      }
      navigate('/app/explore/logs')
    },
    [buildNavigationWindow, navigate],
  )

  const openServiceMetrics = useCallback(
    (payload: {
      serviceName: string
      startTimeUnixNano: number
      endTimeUnixNano: number
    }) => {
      const { startMs, endMs } = buildNavigationWindow(payload)
      try {
        localStorage.setItem(
          TRACE_METRICS_NAVIGATION_CONTEXT_KEY,
          JSON.stringify({
            serviceName: payload.serviceName || undefined,
            startMs,
            endMs,
            createdAt: Date.now(),
          }),
        )
      } catch {
        // Ignore localStorage write issues.
      }
      navigate('/app/explore/metrics')
    },
    [buildNavigationWindow, navigate],
  )

  useEffect(() => {
    const queryParam = searchParams.get('q')
    if (queryParam) {
      setQuery(queryParam)
    }

    const queryTraceId = searchParams.get('traceId')
    const queryDatasourceId = searchParams.get('datasourceId')
    if (queryTraceId) {
      pendingTraceIdRef.current = queryTraceId
      setTraceIdInput(queryTraceId)
    }
    if (queryDatasourceId) {
      pendingTraceDatasourceIdRef.current = queryDatasourceId
    }

    try {
      const rawContext = localStorage.getItem(TRACE_NAVIGATION_CONTEXT_KEY)
      localStorage.removeItem(TRACE_NAVIGATION_CONTEXT_KEY)
      if (rawContext) {
        const parsed = JSON.parse(rawContext) as {
          traceId?: string
          datasourceId?: string
          createdAt?: number
        }
        if (parsed.traceId && typeof parsed.traceId === 'string') {
          if (typeof parsed.createdAt === 'number') {
            const ageMs = Date.now() - parsed.createdAt
            if (ageMs <= TRACE_NAVIGATION_MAX_AGE_MS) {
              pendingTraceIdRef.current = parsed.traceId.trim()
              pendingTraceDatasourceIdRef.current =
                typeof parsed.datasourceId === 'string' ? parsed.datasourceId.trim() : ''
            }
          } else {
            pendingTraceIdRef.current = parsed.traceId.trim()
            pendingTraceDatasourceIdRef.current =
              typeof parsed.datasourceId === 'string' ? parsed.datasourceId.trim() : ''
          }
        }
      }
    } catch {
      // Ignore malformed navigation context.
    }
  }, [searchParams])

  useEffect(() => {
    if (tracingDatasources.length === 0) {
      setSelectedDatasourceId('')
      return
    }

    const hasSelected = tracingDatasources.some(ds => ds.id === selectedDatasourceId)
    if (!hasSelected) {
      const pendingDatasource = pendingTraceDatasourceIdRef.current
        ? tracingDatasources.find(ds => ds.id === pendingTraceDatasourceIdRef.current)
        : null

      if (pendingDatasource) {
        setSelectedDatasourceId(pendingDatasource.id)
        return
      }

      const defaultDatasource = tracingDatasources.find(ds => ds.is_default)
      const selected = defaultDatasource || tracingDatasources[0]
      if (!selected) return
      setSelectedDatasourceId(selected.id)

      if (selected.type === 'clickhouse' && !query.trim()) {
        setQuery(CLICKHOUSE_DEFAULT_QUERY)
      }
    }
  }, [query, selectedDatasourceId, tracingDatasources])

  useEffect(() => {
    if (!activeDatasource) return
    if ((datasourceHealth[activeDatasource.id] || 'unknown') === 'unknown') {
      void checkDatasourceHealth(activeDatasource.id, activeDatasource.type)
    }
  }, [activeDatasource, checkDatasourceHealth, datasourceHealth])

  useEffect(() => {
    setTraceSummaries([])
    setActiveTrace(null)
    setActiveServiceGraph(null)
    setServiceGraphError(null)
    setLoadingServiceGraph(false)
    setSelectedTraceId('')
    setSelectedSpan(null)
    setHasSearched(false)

    void loadServices(true)
    if (!isClickHouseDatasource) {
      void tryLoadPendingTrace()
    }
  }, [isClickHouseDatasource, loadServices, selectedDatasourceId, tryLoadPendingTrace])

  useEffect(() => {
    const ds = tracingDatasources.find(d => d.id === selectedDatasourceId)
    if (ds) {
      onDatasourceChanged?.({ id: ds.id, name: ds.name, type: ds.type })
    }
  }, [onDatasourceChanged, selectedDatasourceId, tracingDatasources])

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
    const unsubscribe = onRefresh(() => {
      if (hasSearched && selectedDatasourceId && !loadingSearch && !loadingTrace) {
        void runSearch()
      }
    })
    return unsubscribe
  }, [hasSearched, loadingSearch, loadingTrace, onRefresh, runSearch, selectedDatasourceId])

  useEffect(() => {
    setSelectedDatasourceId('')
    setDatasourceHealth({})
    setTraceSummaries([])
    setActiveTrace(null)
    setError(null)
  }, [currentOrgId])

  function toggleDatasourceMenu() {
    if (!hasTracingDatasources || loadingSearch || loadingTrace) {
      return
    }
    setShowDatasourceMenu(current => !current)
  }

  async function lookupTraceById() {
    if (isClickHouseDatasource) {
      setError('Open Trace ID is not available for ClickHouse SQL results yet')
      return
    }

    const traceId = traceIdInput.trim()
    if (!traceId) {
      setError('Trace ID is required')
      return
    }

    await loadTrace(traceId)
  }

  function handleSelectServiceFromGraph(serviceName: string) {
    if (!serviceName) return
    setSelectedService(serviceName)
    void runSearch()
  }

  function handleSelectEdgeFromGraph(edge: { source: string; target: string }) {
    if (!edge.target) return
    setSelectedService(edge.target)
    setQuery(`caller.service=${edge.source} callee.service=${edge.target}`)
    void runSearch()
  }

  async function handleOpenTraceFromList(traceId: string) {
    if (isClickHouseDatasource) {
      setError('Trace detail lookup is not available for ClickHouse SQL results yet')
      return
    }
    await loadTrace(traceId)
  }

  const favoriteKey = `explore::traces::${query}`

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-4 rounded bg-[var(--color-surface-container-low)] p-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 max-md:grid-cols-1">
          <div className="flex flex-col gap-2.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--color-outline)]">
              Data Source
            </label>
            <div ref={datasourceMenuRef} className="relative">
              <button
                type="button"
                className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  backgroundColor: 'var(--color-surface-container-high)',
                  border: '1px solid var(--color-outline-variant)',
                  color: 'var(--color-on-surface)',
                }}
                data-testid="explore-traces-datasource-btn"
                disabled={!hasTracingDatasources}
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
                      <span className="text-[0.68rem] uppercase tracking-wide text-[var(--color-outline)]">
                        Active Source
                      </span>
                      <strong className="truncate text-sm font-semibold text-[var(--color-on-surface)]">
                        {activeDatasource.name}
                      </strong>
                      <span className="text-xs text-[var(--color-outline)]">
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
                      title={activeDatasourceHealthError || activeDatasourceHealthLabel}
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
                  <span className="text-sm text-[var(--color-outline)]">
                    No tracing datasource configured
                  </span>
                )}
                {showDatasourceMenu ? (
                  <ChevronUp size={16} className="ml-1 shrink-0 text-[var(--color-outline)]" />
                ) : (
                  <ChevronDown size={16} className="ml-1 shrink-0 text-[var(--color-outline)]" />
                )}
              </button>

              {showDatasourceMenu && hasTracingDatasources ? (
                <div className="absolute left-0 right-0 top-full z-[110] mt-1.5 max-h-[280px] overflow-y-auto rounded bg-[var(--color-surface-container-low)] shadow-lg">
                  {tracingDatasources.map(ds => (
                    <button
                      key={ds.id}
                      type="button"
                      className={`flex w-full cursor-pointer items-center gap-2.5 border-none bg-transparent px-3 py-2.5 text-left text-[var(--color-on-surface)] hover:bg-[var(--color-surface-container-high)] ${
                        ds.id === selectedDatasourceId ? 'bg-[var(--color-primary)]/10' : ''
                      }`}
                      onClick={() => selectDatasource(ds.id)}
                    >
                      <img
                        src={getTypeLogo(ds.type)}
                        alt={`${dataSourceTypeLabels[ds.type]} logo`}
                        className="h-[18px] w-[18px] shrink-0 object-contain"
                      />
                      <div className="flex min-w-0 flex-col gap-px">
                        <strong className="text-sm font-semibold text-[var(--color-on-surface)]">
                          {ds.name}
                        </strong>
                        <span className="text-xs text-[var(--color-outline)]">
                          {dataSourceTypeLabels[ds.type]}
                        </span>
                      </div>
                      {ds.id === selectedDatasourceId ? (
                        <Check size={14} className="ml-auto text-[var(--color-primary)]" />
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--color-outline)]">
              Search Range
            </label>
            <TimeRangePicker stacked />
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {!isClickHouseDatasource ? (
            <>
              <label className="flex min-w-[180px] flex-col gap-2">
                <span className="text-xs font-medium text-[var(--color-outline)]">Service</span>
                <select
                  value={selectedService}
                  data-testid="explore-traces-service-select"
                  disabled={loadingServices || services.length === 0}
                  className="rounded-sm bg-[var(--color-surface-container-low)] px-3 py-2 text-sm text-[var(--color-on-surface)] disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ border: '1px solid var(--color-outline-variant)' }}
                  onChange={event => setSelectedService(event.target.value)}
                >
                  <option value="">All services</option>
                  {services.map(service => (
                    <option key={service} value={service}>
                      {service}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex min-w-[110px] flex-col gap-2">
                <span className="text-xs font-medium text-[var(--color-outline)]">Limit</span>
                <select
                  value={limit}
                  data-testid="explore-traces-limit-select"
                  className="rounded-sm bg-[var(--color-surface-container-low)] px-3 py-2 text-sm text-[var(--color-on-surface)]"
                  style={{ border: '1px solid var(--color-outline-variant)' }}
                  onChange={event => setLimit(Number(event.target.value))}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </label>
            </>
          ) : (
            <ClickHouseSQLEditor
              value={query}
              signal="traces"
              disabled={loadingSearch || !selectedDatasourceId}
              onChange={setQuery}
            />
          )}
        </div>

        {!isClickHouseDatasource ? (
          <div className="flex flex-col gap-2">
            <label htmlFor="trace-search-query" className="text-xs font-medium text-[var(--color-outline)]">
              Search Query
            </label>
            <input
              id="trace-search-query"
              value={query}
              data-testid="explore-traces-search-input"
              type="text"
              className="rounded-sm bg-[var(--color-surface-container-low)] px-3 py-2 text-sm text-[var(--color-on-surface)] placeholder:text-[var(--color-outline)]"
              style={{ border: '1px solid var(--color-outline-variant)' }}
              placeholder="service.name=api error=true"
              onChange={event => setQuery(event.target.value)}
            />
          </div>
        ) : null}

        <div className="flex items-center gap-4">
          <button
            type="button"
            data-testid="explore-traces-search-btn"
            className="inline-flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-sm bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
            disabled={
              loadingSearch ||
              !selectedDatasourceId ||
              (isClickHouseDatasource && !query.trim())
            }
            onClick={() => void runSearch()}
          >
            {loadingSearch ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            <span>
              {loadingSearch
                ? 'Searching...'
                : isClickHouseDatasource
                  ? 'Run Query'
                  : 'Search Traces'}
            </span>
          </button>
          {isClickHouseDatasource && query.trim() ? (
            <button
              type="button"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm border px-3 py-2.5 text-sm transition"
              style={{
                backgroundColor: isFavorite(favoriteKey)
                  ? 'var(--color-primary-muted)'
                  : 'var(--color-surface-container-high)',
                borderColor: isFavorite(favoriteKey)
                  ? 'var(--color-primary)'
                  : 'var(--color-stroke-subtle)',
                color: isFavorite(favoriteKey)
                  ? 'var(--color-primary)'
                  : 'var(--color-on-surface-variant)',
              }}
              title={isFavorite(favoriteKey) ? 'Remove from favorites' : 'Save to favorites'}
              onClick={() =>
                toggleFavorite({
                  id: favoriteKey,
                  title: query.length > 40 ? `${query.slice(0, 40)}...` : query,
                  type: 'explore',
                })
              }
            >
              <Star size={14} fill={isFavorite(favoriteKey) ? 'currentColor' : 'none'} />
            </button>
          ) : null}
        </div>

        {!isClickHouseDatasource ? (
          <div className="flex flex-col gap-2">
            <label htmlFor="trace-id-input" className="text-xs font-medium text-[var(--color-outline)]">
              Open Trace ID
            </label>
            <div className="flex gap-2.5 max-md:flex-col">
              <input
                id="trace-id-input"
                value={traceIdInput}
                data-testid="explore-traces-id-input"
                type="text"
                placeholder="Paste trace id"
                className="flex-1 rounded-sm bg-[var(--color-surface-container-low)] px-3 py-2 text-sm text-[var(--color-on-surface)] placeholder:text-[var(--color-outline)]"
                style={{ border: '1px solid var(--color-outline-variant)' }}
                onChange={event => setTraceIdInput(event.target.value)}
              />
              <button
                type="button"
                data-testid="explore-traces-open-btn"
                className="inline-flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-sm bg-[var(--color-surface-container-high)] px-4 py-2 text-sm font-medium text-[var(--color-on-surface)] transition hover:bg-[var(--color-surface-container-high)] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={loadingTrace || !selectedDatasourceId || !traceIdInput.trim()}
                onClick={() => void lookupTraceById()}
              >
                {loadingTrace ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Waypoints size={15} />
                )}
                <span>{loadingTrace ? 'Loading...' : 'Open Trace'}</span>
              </button>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="flex items-center gap-2 rounded border border-[var(--color-error)]/25 bg-[var(--color-error)]/10 p-4 text-sm text-[var(--color-error)]">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        ) : null}
      </div>

      <div className="flex min-h-[440px] flex-1 flex-col overflow-hidden rounded bg-[var(--color-surface-container-low)]">
        {!hasTracingDatasources ? (
          <div className="flex flex-1 flex-col items-center justify-center py-12 text-center text-sm text-[var(--color-outline)]">
            <p className="m-0">No tracing datasource configured.</p>
            <p className="m-0 text-xs text-[var(--color-outline)]">
              Add a Tempo, VictoriaTraces, or ClickHouse datasource in Data Sources.
            </p>
          </div>
        ) : isClickHouseDatasource ? (
          <div className="flex min-h-[420px] flex-1">
            {loadingSearch ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 py-12 text-[var(--color-outline)]">
                <Loader2 size={18} className="animate-spin" />
                <span className="text-sm">Executing trace SQL...</span>
              </div>
            ) : traceSummaries.length > 0 ? (
              <div className="min-h-0 flex-1 p-3">
                <TraceListPanel traces={traceSummaries} onOpenTrace={handleOpenTraceFromList} />
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center py-12 text-center text-sm text-[var(--color-outline)]">
                <p className="m-0">Run a ClickHouse SQL query to inspect traces.</p>
                <p className="m-0 text-xs text-[var(--color-outline)]">
                  Expected columns include span_id, operation_name, service_name, start_time_unix_nano,
                  and duration_nano.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="grid min-h-[460px] flex-1 grid-cols-[320px_minmax(0,1fr)] max-lg:grid-cols-1">
            <aside className="flex flex-col max-lg:max-h-[320px] max-lg:border-b max-lg:border-[var(--color-stroke-subtle)] max-lg:border-r-0">
              <div className="flex items-center justify-between bg-[var(--color-surface-container-high)] px-4 py-3">
                <h2 className="m-0 text-xs font-semibold uppercase tracking-wide text-[var(--color-on-surface-variant)]">
                  Matching traces
                </h2>
                <span className="text-xs text-[var(--color-outline)]">
                  {traceSummaries.length} result{traceSummaries.length === 1 ? '' : 's'}
                </span>
              </div>

              {loadingSearch ? (
                <div className="flex items-center justify-center gap-2 py-5 text-[var(--color-outline)]">
                  <Loader2 size={16} className="animate-spin" />
                  <span className="text-sm">Searching traces...</span>
                </div>
              ) : traceSummaries.length > 0 ? (
                <div className="flex flex-col gap-1.5 overflow-y-auto p-2" data-testid="trace-search-results">
                  {traceSummaries.map(summary => (
                    <button
                      key={summary.traceId}
                      type="button"
                      className={`flex cursor-pointer flex-col gap-1 rounded-sm border p-3 text-left transition ${
                        selectedTraceId === summary.traceId
                          ? 'border-[var(--color-primary)]/20 bg-[var(--color-primary)]/10'
                          : 'border-[var(--color-stroke-subtle)] bg-[var(--color-surface-container-low)] hover:bg-[var(--color-surface-container-high)]'
                      }`}
                      onClick={() => void loadTrace(summary.traceId)}
                    >
                      <code className="break-all font-mono text-xs text-[var(--color-primary)]">
                        {summary.traceId}
                      </code>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs text-[var(--color-outline)]">
                        <span>{summary.rootServiceName || 'unknown service'}</span>
                        <span>{formatDurationNano(summary.durationNano)}</span>
                        <span>{summary.spanCount} spans</span>
                        <span
                          className={
                            summary.errorSpanCount > 0
                              ? 'font-medium text-[var(--color-error)]'
                              : ''
                          }
                        >
                          {summary.errorSpanCount} errors
                        </span>
                      </div>
                      <span className="text-[0.7rem] text-[var(--color-outline)]">
                        {formatTraceStart(summary.startTimeUnixNano)}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center py-8 text-center text-sm text-[var(--color-outline)]">
                  Run a trace search or open a trace ID directly.
                </div>
              )}
            </aside>

            <section className="flex flex-col">
              <div className="flex items-center justify-between bg-[var(--color-surface-container-high)] px-4 py-3">
                <h2 className="m-0 text-xs font-semibold uppercase tracking-wide text-[var(--color-on-surface-variant)]">
                  Timeline waterfall
                </h2>
                {activeTrace ? (
                  <span className="text-xs text-[var(--color-outline)]">
                    {activeTrace.spans.length} spans
                  </span>
                ) : null}
              </div>

              {loadingTrace ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-4 py-12 text-[var(--color-outline)]">
                  <Loader2 size={18} className="animate-spin" />
                  <span className="text-sm">Loading trace...</span>
                </div>
              ) : activeTrace ? (
                <div className="flex flex-col gap-3.5 p-4">
                  <div className="flex flex-wrap items-center gap-3 rounded-sm bg-[var(--color-surface-container-high)] px-3 py-2">
                    <code className="font-mono text-xs text-[var(--color-primary)]">
                      {activeTrace.traceId}
                    </code>
                    <span className="text-xs text-[var(--color-outline)]">
                      {formatDurationNano(activeTrace.durationNano)}
                    </span>
                    <span className="text-xs text-[var(--color-outline)]">
                      {activeTrace.services.length} services
                    </span>
                  </div>

                  <div className="flex flex-col gap-2.5 rounded bg-[var(--color-surface-container-low)] p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="m-0 text-xs font-semibold uppercase tracking-wide text-[var(--color-outline)]">
                        Service dependency graph
                      </h3>
                      {activeServiceGraph ? (
                        <span className="text-xs text-[var(--color-outline)]">
                          {activeServiceGraph.edges.length} edges
                        </span>
                      ) : null}
                    </div>

                    {loadingServiceGraph ? (
                      <div className="flex items-center justify-center gap-2 py-5 text-[var(--color-outline)]">
                        <Loader2 size={16} className="animate-spin" />
                        <span className="text-sm">Loading service graph...</span>
                      </div>
                    ) : serviceGraphError ? (
                      <div className="flex items-center gap-2 rounded-sm border border-[var(--color-error)]/25 bg-[var(--color-error)]/10 px-3 py-2 text-sm text-[var(--color-error)]">
                        <AlertCircle size={14} />
                        <span>{serviceGraphError}</span>
                      </div>
                    ) : activeServiceGraph && activeServiceGraph.nodes.length > 0 ? (
                      <TraceServiceGraph
                        graph={activeServiceGraph}
                        onSelectService={handleSelectServiceFromGraph}
                        onSelectEdge={handleSelectEdgeFromGraph}
                      />
                    ) : (
                      <div className="flex items-center gap-2 rounded-sm bg-[var(--color-surface-container-high)] px-3 py-3 text-sm text-[var(--color-outline)]">
                        Not enough trace data to render service dependencies.
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-3.5 max-md:grid-cols-1">
                    <div className="min-w-0">
                      <TraceTimeline
                        trace={activeTrace}
                        selectedSpanId={selectedSpan?.spanId || null}
                        onSelectSpan={setSelectedSpan}
                      />
                    </div>

                    {selectedSpan ? (
                      <TraceSpanDetailsPanel
                        trace={activeTrace}
                        span={selectedSpan}
                        onSelectSpan={setSelectedSpan}
                        onOpenTraceLogs={openTraceLogs}
                        onOpenServiceMetrics={openServiceMetrics}
                      />
                    ) : (
                      <aside className="flex flex-col gap-2 rounded bg-[var(--color-surface-container-high)] p-4">
                        <h3 className="m-0 text-xs font-semibold uppercase tracking-wide text-[var(--color-outline)]">
                          Span details
                        </h3>
                        <p className="m-0 text-sm text-[var(--color-outline)]">
                          Select a span in the timeline to inspect attributes, logs, and relationships.
                        </p>
                      </aside>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center py-12 text-center text-sm text-[var(--color-outline)]">
                  <p className="m-0">Select a trace result to view the waterfall timeline.</p>
                  <p className="m-0 text-xs text-[var(--color-outline)]">
                    You can search by service/time range or open a known trace ID.
                  </p>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}