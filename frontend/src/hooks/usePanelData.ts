import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { queryDataSource } from '@/api/datasources'
import { useTimeRange } from '@/hooks/useTimeRange'
import { queryPrometheus, transformToChartData, type ChartSeries } from '@/promql/client'
import type { Panel } from '@/types/panel'

type QuerySignal = 'logs' | 'metrics' | 'traces'

function isQuerySignal(value: unknown): value is QuerySignal {
  return value === 'logs' || value === 'metrics' || value === 'traces'
}

export function usePanelData(panel: Panel, interpolate: (query: string) => string) {
  const { timeRange, onRefresh } = useTimeRange()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chartSeries, setChartSeries] = useState<ChartSeries[]>([])

  const datasourceId = panel.query?.datasource_id as string | undefined
  const queryExpr = (panel.query?.promql || panel.query?.expr || '') as string
  const explicitQuerySignal = isQuerySignal(panel.query?.signal) ? panel.query.signal : null

  const inferredQuerySignal = useMemo<QuerySignal>(() => {
    if (explicitQuerySignal) return explicitQuerySignal
    return 'metrics'
  }, [explicitQuerySignal])

  const promqlQuery = datasourceId ? '' : queryExpr
  const start = Math.floor(timeRange.start / 1000)
  const end = Math.floor(timeRange.end / 1000)

  const hasQuery = useMemo(() => {
    return !!datasourceId || !!queryExpr.trim()
  }, [datasourceId, queryExpr])

  const interpolateRef = useRef(interpolate)
  interpolateRef.current = interpolate

  const fetchData = useCallback(async () => {
    if (!hasQuery) {
      setChartSeries([])
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    try {
      if (datasourceId) {
        const resolvedQuery = interpolateRef.current(queryExpr)
        if (!resolvedQuery.trim()) {
          setChartSeries([])
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
          return
        }

        if (result.resultType === 'logs' || result.resultType === 'traces') {
          setError('Only metrics panels are supported in this view')
          setChartSeries([])
          return
        }

        const matrix = result.data?.result
        if (!matrix) {
          setChartSeries([])
          return
        }

        setChartSeries(
          matrix.map(row => {
            const labelParts: string[] = []
            for (const [key, value] of Object.entries(row.metric)) {
              if (key !== '__name__') labelParts.push(`${key}="${value}"`)
            }
            const metricName = row.metric.__name__ || 'value'
            const name =
              labelParts.length > 0 ? `${metricName}{${labelParts.join(',')}}` : metricName
            return {
              name,
              data: row.values.map(([timestamp, value]) => ({
                timestamp: typeof timestamp === 'number' ? timestamp : Number.parseFloat(String(timestamp)),
                value: Number.parseFloat(String(value)),
              })),
              labels: row.metric,
            }
          }),
        )
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Query failed')
      setChartSeries([])
    } finally {
      setLoading(false)
    }
  }, [datasourceId, end, hasQuery, inferredQuerySignal, promqlQuery, queryExpr, start])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

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
    hasQuery,
    refetch: fetchData,
  }
}