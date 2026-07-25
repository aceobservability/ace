import { useCallback, useMemo, useRef, useState } from 'react'
import {
  fetchDataSourceTrace,
  fetchDataSourceTraceServiceGraph,
  fetchDataSourceTraceServices,
  queryDataSource,
  searchDataSourceTraces,
} from '@/api/datasources'
import {
  type DatasourceHealthStatus,
  CLICKHOUSE_DEFAULT_QUERY,
} from '@/components/explore/tracesExploreHelpers'
import type {
  DataSource,
  DataSourceType,
  Trace,
  TraceServiceGraph as TraceServiceGraphModel,
  TraceSpan,
  TraceSummary,
} from '@/types/datasource'
import { convertClickHouseSpansToTraceSummaries } from '@/utils/traceClickHouse'

type TimeRange = { start: number; end: number }

type UseTracesExploreDataParams = {
  tracingDatasources: DataSource[]
  timeRange: TimeRange
  isCustomRange: boolean
}

export function useTracesExploreData({
  tracingDatasources,
  timeRange,
  isCustomRange,
}: UseTracesExploreDataParams) {
  const [selectedDatasourceId, setSelectedDatasourceId] = useState('')
  const [showDatasourceMenu, setShowDatasourceMenu] = useState(false)
  const [datasourceHealth, setDatasourceHealth] = useState<Record<string, DatasourceHealthStatus>>(
    {},
  )
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

  const pendingTraceDatasourceIdRef = useRef('')
  const pendingTraceIdRef = useRef('')

  const activeDatasource = useMemo(
    () => tracingDatasources.find(ds => ds.id === selectedDatasourceId) ?? null,
    [tracingDatasources, selectedDatasourceId],
  )
  const isClickHouseDatasource = activeDatasource?.type === 'clickhouse'
  const hasTracingDatasources = tracingDatasources.length > 0

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

  const runClickHouseTraceQuery = useCallback(
    async (overrides?: { datasourceId?: string; queryText?: string }) => {
      const effectiveQuery = (overrides?.queryText ?? query).trim()
      const effectiveDatasourceId = overrides?.datasourceId ?? selectedDatasourceId

      if (!effectiveQuery) {
        setError('Query is required')
        return
      }

      if (!effectiveDatasourceId) {
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

        const response = await queryDataSource(effectiveDatasourceId, {
          query: effectiveQuery,
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
    },
    [limit, query, selectedDatasourceId, timeRange.end, timeRange.start],
  )

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
        void runClickHouseTraceQuery({
          datasourceId,
          queryText: CLICKHOUSE_DEFAULT_QUERY,
        })
      }
    },
    [query, runClickHouseTraceQuery, tracingDatasources],
  )

  const resetResults = useCallback(() => {
    setTraceSummaries([])
    setActiveTrace(null)
    setActiveServiceGraph(null)
    setServiceGraphError(null)
    setLoadingServiceGraph(false)
    setSelectedTraceId('')
    setSelectedSpan(null)
    setHasSearched(false)
  }, [])

  const resetForOrgChange = useCallback(() => {
    setSelectedDatasourceId('')
    setDatasourceHealth({})
    setTraceSummaries([])
    setActiveTrace(null)
    setError(null)
  }, [])

  return {
    selectedDatasourceId,
    setSelectedDatasourceId,
    showDatasourceMenu,
    setShowDatasourceMenu,
    datasourceHealth,
    setDatasourceHealth,
    datasourceHealthErrors,
    query,
    setQuery,
    selectedService,
    setSelectedService,
    limit,
    setLimit,
    traceIdInput,
    setTraceIdInput,
    loadingSearch,
    loadingTrace,
    loadingServices,
    error,
    setError,
    serviceGraphError,
    services,
    traceSummaries,
    selectedTraceId,
    activeTrace,
    activeServiceGraph,
    selectedSpan,
    setSelectedSpan,
    loadingServiceGraph,
    hasSearched,
    pendingTraceDatasourceIdRef,
    pendingTraceIdRef,
    activeDatasource,
    isClickHouseDatasource,
    hasTracingDatasources,
    checkDatasourceHealth,
    runSearch,
    loadTrace,
    loadServices,
    tryLoadPendingTrace,
    selectDatasource,
    resetResults,
    resetForOrgChange,
  }
}
