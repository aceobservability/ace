import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { queryDataSource, searchDataSourceTraces } from '@/api/datasources'
import { useTimeRange } from '@/hooks/useTimeRange'
import { queryPrometheus, transformToChartData, type ChartSeries } from '@/promql/client'
import type { LogEntry, TraceSpan, TraceSummary } from '@/types/datasource'
import type { Panel } from '@/types/panel'
import { lookupPanel } from '@/utils/panelRegistry'

type QuerySignal = 'logs' | 'metrics' | 'traces'

function isQuerySignal(value: unknown): value is QuerySignal {
  return value === 'logs' || value === 'metrics' || value === 'traces'
}

function getTagValue(tags: Record<string, string> | undefined, keys: string[]): string {
  if (!tags || Object.keys(tags).length === 0) return ''

  const byNormalizedName: Record<string, string> = {}
  for (const [key, value] of Object.entries(tags)) {
    const normalizedKey = key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
    if (normalizedKey && !(normalizedKey in byNormalizedName)) {
      byNormalizedName[normalizedKey] = value
    }
  }

  for (const key of keys) {
    const normalizedKey = key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
    if (normalizedKey in byNormalizedName) {
      const value = byNormalizedName[normalizedKey].trim()
      if (value) return value
    }
  }

  return ''
}

function isTraceErrorSpan(span: TraceSpan): boolean {
  if (typeof span.status === 'string' && span.status.toLowerCase() === 'error') {
    return true
  }

  const errorTag = getTagValue(span.tags, ['error', 'otelStatusCode', 'statusCode'])
  const normalized = errorTag.toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'error'
}

function getTraceIdForSpan(span: TraceSpan): string {
  const traceIdFromTags = getTagValue(span.tags, [
    'traceId',
    'trace_id',
    'traceid',
    'otelTraceId',
    'trace',
  ])
  if (traceIdFromTags) return traceIdFromTags
  return span.spanId || 'unknown-trace'
}

function convertClickHouseSpansToTraceSummaries(spans: TraceSpan[]): TraceSummary[] {
  const grouped = new Map<
    string,
    {
      traceId: string
      spans: TraceSpan[]
      services: Set<string>
      errorSpanCount: number
      startTimeUnixNano: number
      endTimeUnixNano: number
    }
  >()

  for (const span of spans) {
    const traceId = getTraceIdForSpan(span)
    const group = grouped.get(traceId) || {
      traceId,
      spans: [],
      services: new Set<string>(),
      errorSpanCount: 0,
      startTimeUnixNano: Number.MAX_SAFE_INTEGER,
      endTimeUnixNano: 0,
    }

    group.spans.push(span)
    if (span.serviceName) group.services.add(span.serviceName)
    if (isTraceErrorSpan(span)) group.errorSpanCount += 1

    const spanStart = Math.max(0, span.startTimeUnixNano || 0)
    const spanEnd = spanStart + Math.max(0, span.durationNano || 0)
    group.startTimeUnixNano = Math.min(group.startTimeUnixNano, spanStart)
    group.endTimeUnixNano = Math.max(group.endTimeUnixNano, spanEnd)
    grouped.set(traceId, group)
  }

  const summaries: TraceSummary[] = []
  for (const group of grouped.values()) {
    const spanIds = new Set(group.spans.map(span => span.spanId))
    const rootSpan =
      [...group.spans]
        .sort((left, right) => left.startTimeUnixNano - right.startTimeUnixNano)
        .find(span => !span.parentSpanId || !spanIds.has(span.parentSpanId)) || group.spans[0]

    const startTimeUnixNano =
      group.startTimeUnixNano === Number.MAX_SAFE_INTEGER ? 0 : group.startTimeUnixNano
    const durationNano = Math.max(0, group.endTimeUnixNano - startTimeUnixNano)

    summaries.push({
      traceId: group.traceId,
      rootServiceName: rootSpan?.serviceName || 'unknown',
      rootOperationName: rootSpan?.operationName || '',
      startTimeUnixNano,
      durationNano,
      spanCount: group.spans.length,
      serviceCount: group.services.size,
      errorSpanCount: group.errorSpanCount,
    })
  }

  return summaries.sort((left, right) => right.startTimeUnixNano - left.startTimeUnixNano)
}

function metricSeriesFromResult(
  result: Array<{ metric: Record<string, string>; values: [number, string][] }>,
): ChartSeries[] {
  return result.map(row => {
    const labelParts: string[] = []
    for (const [key, value] of Object.entries(row.metric)) {
      if (key !== '__name__') labelParts.push(`${key}="${value}"`)
    }
    const metricName = row.metric.__name__ || 'value'
    const name = labelParts.length > 0 ? `${metricName}{${labelParts.join(',')}}` : metricName
    return {
      name,
      data: row.values.map(([timestamp, value]) => ({
        timestamp: typeof timestamp === 'number' ? timestamp : Number.parseFloat(String(timestamp)),
        value: Number.parseFloat(String(value)),
      })),
      labels: row.metric,
    }
  })
}

export function usePanelData(
  panel: Panel,
  interpolate: (query: string) => string,
  refreshKey = '',
) {
  const { timeRange, onRefresh } = useTimeRange()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chartSeries, setChartSeries] = useState<ChartSeries[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [traceSummaries, setTraceSummaries] = useState<TraceSummary[]>([])
  const [traceSpans, setTraceSpans] = useState<TraceSpan[]>([])

  const datasourceId = panel.query?.datasource_id as string | undefined
  const queryExpr = (panel.query?.promql || panel.query?.expr || '') as string
  const explicitQuerySignal = isQuerySignal(panel.query?.signal) ? panel.query.signal : null
  const registry = lookupPanel(panel.type)
  const isBuiltinTracePanel = panel.type === 'trace_list' || panel.type === 'trace_heatmap'
  const isLogPanel = panel.type === 'logs' || registry?.queryMode === 'logs'
  const isRegistryTracePanel = registry?.queryMode === 'traces'
  const isStandaloneRegistry = registry?.queryMode === 'none'

  const inferredQuerySignal = useMemo<QuerySignal>(() => {
    if (explicitQuerySignal) return explicitQuerySignal
    if (panel.type === 'logs' || registry?.queryMode === 'logs') return 'logs'
    if (isBuiltinTracePanel || registry?.queryMode === 'traces') return 'traces'
    return 'metrics'
  }, [explicitQuerySignal, isBuiltinTracePanel, panel.type, registry?.queryMode])

  const promqlQuery = datasourceId ? '' : queryExpr
  const start = Math.floor(timeRange.start / 1000)
  const end = Math.floor(timeRange.end / 1000)

  const traceServiceFilter =
    typeof panel.query?.service === 'string' ? panel.query.service : ''
  const rawLimit = panel.query?.limit
  const traceSearchLimit =
    typeof rawLimit === 'number' && Number.isFinite(rawLimit)
      ? Math.max(1, Math.min(200, Math.floor(rawLimit)))
      : 50

  const hasQuery = useMemo(() => {
    if (isBuiltinTracePanel) {
      if (explicitQuerySignal === 'traces') {
        return !!datasourceId && !!queryExpr.trim()
      }
      return !!datasourceId
    }

    if (registry) {
      if (registry.queryMode === 'none') return true
      if (registry.queryMode === 'traces') {
        return !!datasourceId && !!queryExpr.trim()
      }
      return !!datasourceId || !!queryExpr.trim()
    }

    if (isLogPanel) {
      return !!datasourceId && !!queryExpr.trim()
    }

    return !!datasourceId || !!queryExpr.trim()
  }, [
    datasourceId,
    explicitQuerySignal,
    isBuiltinTracePanel,
    isLogPanel,
    queryExpr,
    registry,
  ])

  const interpolateRef = useRef(interpolate)
  interpolateRef.current = interpolate

  const fetchData = useCallback(async () => {
    if (!hasQuery) {
      setChartSeries([])
      setLogs([])
      setTraceSummaries([])
      setTraceSpans([])
      setError(null)
      return
    }

    if (isStandaloneRegistry) {
      setChartSeries([])
      setLogs([])
      setTraceSummaries([])
      setTraceSpans([])
      setError(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      if (datasourceId && isBuiltinTracePanel) {
        const resolvedQuery = interpolateRef.current(queryExpr)
        if (explicitQuerySignal === 'traces') {
          if (!resolvedQuery.trim()) {
            setTraceSummaries([])
            setTraceSpans([])
            setLogs([])
            setChartSeries([])
            return
          }

          const traceResult = await queryDataSource(datasourceId, {
            query: resolvedQuery,
            signal: 'traces',
            start,
            end,
            step: 15,
            limit: traceSearchLimit,
          })

          if (traceResult.status === 'error') {
            setError(traceResult.error || 'Query failed')
            setTraceSummaries([])
            setTraceSpans([])
            return
          }

          if (traceResult.resultType !== 'traces') {
            setError('Selected datasource did not return trace results')
            setTraceSummaries([])
            setTraceSpans([])
            return
          }

          const spans = traceResult.data?.traces || []
          setTraceSpans(spans)
          setTraceSummaries(convertClickHouseSpansToTraceSummaries(spans))
          setLogs([])
          setChartSeries([])
          return
        }

        const summaries = await searchDataSourceTraces(datasourceId, {
          query: resolvedQuery.trim() || undefined,
          service: traceServiceFilter || undefined,
          start,
          end,
          limit: traceSearchLimit,
        })
        setTraceSummaries(summaries)
        setTraceSpans([])
        setLogs([])
        setChartSeries([])
        return
      }

      if (datasourceId && isRegistryTracePanel) {
        const resolvedQuery = interpolateRef.current(queryExpr)
        if (!resolvedQuery.trim()) {
          setLogs([])
          setTraceSummaries([])
          setTraceSpans([])
          setChartSeries([])
          return
        }

        const traceResult = await queryDataSource(datasourceId, {
          query: resolvedQuery,
          signal: 'traces',
          start,
          end,
          step: 15,
          limit: traceSearchLimit,
        })

        if (traceResult.status === 'error') {
          setError(traceResult.error || 'Query failed')
          setTraceSpans([])
          return
        }

        if (traceResult.resultType !== 'traces') {
          setError('Selected datasource did not return trace results')
          setTraceSpans([])
          return
        }

        setLogs([])
        setTraceSummaries([])
        setTraceSpans(traceResult.data?.traces || [])
        setChartSeries([])
        return
      }

      if (datasourceId) {
        const resolvedQuery = interpolateRef.current(queryExpr)
        if (!resolvedQuery.trim()) {
          setChartSeries([])
          setLogs([])
          setTraceSummaries([])
          setTraceSpans([])
          return
        }

        const result = await queryDataSource(datasourceId, {
          query: resolvedQuery,
          signal: inferredQuerySignal,
          start,
          end,
          step: 15,
          limit: 1000,
        })

        if (result.status === 'error') {
          setError(result.error || 'Query failed')
          setChartSeries([])
          setLogs([])
          setTraceSummaries([])
          setTraceSpans([])
          return
        }

        if (result.resultType === 'logs' && result.data?.logs) {
          setLogs(result.data.logs)
          setChartSeries([])
          setTraceSummaries([])
          setTraceSpans([])
          return
        }

        if (result.resultType === 'traces') {
          setError('Trace results can only be rendered in trace panels')
          setLogs([])
          setChartSeries([])
          setTraceSummaries([])
          setTraceSpans([])
          return
        }

        const matrix = result.data?.result
        if (!matrix) {
          setChartSeries([])
          setLogs([])
          setTraceSummaries([])
          setTraceSpans([])
          return
        }

        setChartSeries(metricSeriesFromResult(matrix))
        setLogs([])
        setTraceSummaries([])
        setTraceSpans([])
        return
      }

      const resolvedQuery = interpolateRef.current(promqlQuery)
      if (!resolvedQuery.trim()) {
        setChartSeries([])
        return
      }

      const result = await queryPrometheus(resolvedQuery, start, end, 15)
      if (result.status === 'error') {
        setError(result.error || 'Query failed')
        setChartSeries([])
        return
      }

      setChartSeries(transformToChartData(result).series)
      setLogs([])
      setTraceSummaries([])
      setTraceSpans([])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Query failed')
      setChartSeries([])
      setLogs([])
      setTraceSummaries([])
      setTraceSpans([])
    } finally {
      setLoading(false)
    }
  }, [
    datasourceId,
    end,
    explicitQuerySignal,
    hasQuery,
    inferredQuerySignal,
    isBuiltinTracePanel,
    isRegistryTracePanel,
    isStandaloneRegistry,
    promqlQuery,
    queryExpr,
    start,
    traceSearchLimit,
    traceServiceFilter,
  ])

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey triggers refetch when template variables change
  useEffect(() => {
    void fetchData()
  }, [fetchData, refreshKey])

  useEffect(() => {
    const unsubscribe = onRefresh(() => {
      if (hasQuery) void fetchData()
    })
    return unsubscribe
  }, [fetchData, hasQuery, onRefresh])

  return {
    loading,
    error,
    chartSeries,
    logs,
    traceSummaries,
    traceSpans,
    hasQuery,
    registry,
    refetch: fetchData,
  }
}
