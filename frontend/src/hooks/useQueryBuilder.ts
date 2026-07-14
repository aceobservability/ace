import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchDataSourceLabelValues,
  fetchDataSourceLabels,
  fetchDataSourceMetricNames,
} from '@/api/datasources'
import { trackEvent } from '@/analytics'

export const AGGREGATION_FUNCTIONS = [
  { value: '', label: 'None' },
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Average' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
  { value: 'count', label: 'Count' },
  { value: 'rate', label: 'Rate', requiresRange: true },
  { value: 'irate', label: 'Instant Rate', requiresRange: true },
  { value: 'increase', label: 'Increase', requiresRange: true },
  { value: 'idelta', label: 'Instant Delta', requiresRange: true },
  { value: 'stddev', label: 'Std Dev' },
  { value: 'stdvar', label: 'Std Variance' },
  { value: 'topk', label: 'Top K', requiresK: true },
  { value: 'bottomk', label: 'Bottom K', requiresK: true },
] as const

export const LABEL_OPERATORS = [
  { value: '=', label: '=' },
  { value: '!=', label: '!=' },
  { value: '=~', label: '=~' },
  { value: '!~', label: '!~' },
] as const

function escapePromQLLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

type AggregationFunction = (typeof AGGREGATION_FUNCTIONS)[number]['value']
export type LabelOperator = (typeof LABEL_OPERATORS)[number]['value']

export interface LabelFilter {
  id: string
  label: string
  operator: LabelOperator
  value: string
}

let filterIdCounter = 0
function generateFilterId(): string {
  return `filter-${++filterIdCounter}`
}

export function useQueryBuilder(initialQuery = '', datasourceId = '') {
  const [mode, setMode] = useState<'builder' | 'code'>('builder')
  const [codeQuery, setCodeQuery] = useState(initialQuery)
  const [currentDatasourceId, setCurrentDatasourceId] = useState(datasourceId)
  const [metric, setMetric] = useState('')
  const [labelFilters, setLabelFilters] = useState<LabelFilter[]>([])
  const [aggregation, setAggregation] = useState<AggregationFunction>('')
  const [groupByLabels, setGroupByLabels] = useState<string[]>([])
  const [rangeInterval, setRangeInterval] = useState('5m')
  const [kValue, setKValue] = useState(10)
  const [metricsCache, setMetricsCache] = useState<string[]>([])
  const [labelsCache, setLabelsCache] = useState<string[]>([])
  const [labelValuesCache, setLabelValuesCache] = useState<Map<string, string[]>>(new Map())
  const [loadingMetrics, setLoadingMetrics] = useState(false)
  const [loadingLabels, setLoadingLabels] = useState(false)
  const [loadingLabelValues, setLoadingLabelValues] = useState<string | null>(null)

  const metricsCacheRef = useRef(metricsCache)
  const labelsCacheRef = useRef(labelsCache)
  const labelValuesCacheRef = useRef(labelValuesCache)

  useEffect(() => {
    metricsCacheRef.current = metricsCache
  }, [metricsCache])
  useEffect(() => {
    labelsCacheRef.current = labelsCache
  }, [labelsCache])
  useEffect(() => {
    labelValuesCacheRef.current = labelValuesCache
  }, [labelValuesCache])

  const generatedQuery = useMemo(() => {
    if (!metric) return ''

    let query = metric

    if (labelFilters.length > 0) {
      const filters = labelFilters
        .filter(f => f.label && f.value)
        .map(f => `${f.label}${f.operator}"${escapePromQLLabelValue(f.value)}"`)
        .join(',')

      if (filters) {
        query = `${query}{${filters}}`
      }
    }

    const aggFunc = AGGREGATION_FUNCTIONS.find(a => a.value === aggregation)
    if (aggFunc && 'requiresRange' in aggFunc && aggFunc.requiresRange) {
      query = `${aggregation}(${query}[${rangeInterval}])`
    }

    if (aggregation && !('requiresRange' in (aggFunc || {}))) {
      if ('requiresK' in (aggFunc || {}) && (aggFunc as { requiresK?: boolean })?.requiresK) {
        const byClause = groupByLabels.length > 0 ? ` by (${groupByLabels.join(', ')})` : ''
        query = `${aggregation}(${kValue}, ${query})${byClause}`
      } else if (aggFunc) {
        const byClause = groupByLabels.length > 0 ? ` by (${groupByLabels.join(', ')})` : ''
        query = `${aggregation}(${query})${byClause}`
      }
    } else if (
      aggFunc &&
      'requiresRange' in aggFunc &&
      aggFunc.requiresRange &&
      groupByLabels.length > 0
    ) {
      query = `sum(${query}) by (${groupByLabels.join(', ')})`
    }

    return query
  }, [metric, labelFilters, aggregation, groupByLabels, rangeInterval, kValue])

  const activeQuery = mode === 'builder' ? generatedQuery : codeQuery

  const setDatasourceId = useCallback((id: string) => {
    setCurrentDatasourceId(prev => {
      if (prev === id) return prev
      setMetricsCache([])
      setLabelsCache([])
      setLabelValuesCache(new Map())
      return id
    })
  }, [])

  const loadMetrics = useCallback(async () => {
    if (!currentDatasourceId) return []
    if (metricsCacheRef.current.length > 0) return metricsCacheRef.current

    setLoadingMetrics(true)
    try {
      const metrics = await fetchDataSourceMetricNames(currentDatasourceId)
      setMetricsCache(metrics)
      trackEvent('query_builder_metrics_loaded', { metric_count: metrics.length })
      return metrics
    } catch (error) {
      console.error('Failed to load metrics:', error)
      return []
    } finally {
      setLoadingMetrics(false)
    }
  }, [currentDatasourceId])

  const loadLabels = useCallback(async () => {
    if (!currentDatasourceId) return []
    if (labelsCacheRef.current.length > 0) return labelsCacheRef.current

    setLoadingLabels(true)
    try {
      const labels = await fetchDataSourceLabels(currentDatasourceId)
      setLabelsCache(labels)
      trackEvent('query_builder_labels_loaded', { label_count: labels.length })
      return labels
    } catch (error) {
      console.error('Failed to load labels:', error)
      return []
    } finally {
      setLoadingLabels(false)
    }
  }, [currentDatasourceId])

  const loadLabelValues = useCallback(
    async (labelName: string) => {
      if (!currentDatasourceId) return []
      if (labelValuesCacheRef.current.has(labelName)) {
        return labelValuesCacheRef.current.get(labelName) || []
      }

      setLoadingLabelValues(labelName)
      try {
        const values = await fetchDataSourceLabelValues(currentDatasourceId, labelName)
        setLabelValuesCache(prev => {
          const next = new Map(prev)
          next.set(labelName, values)
          return next
        })
        trackEvent('query_builder_label_values_loaded', {
          label: labelName,
          value_count: values.length,
        })
        return values
      } catch (error) {
        console.error(`Failed to load values for label ${labelName}:`, error)
        return []
      } finally {
        setLoadingLabelValues(null)
      }
    },
    [currentDatasourceId],
  )

  const addLabelFilter = useCallback(() => {
    setLabelFilters(prev => [
      ...prev,
      { id: generateFilterId(), label: '', operator: '=', value: '' },
    ])
    trackEvent('query_builder_filter_added', { filter_count: labelFilters.length + 1 })
  }, [labelFilters.length])

  const removeLabelFilter = useCallback((id: string) => {
    setLabelFilters(prev => {
      const next = prev.filter(f => f.id !== id)
      trackEvent('query_builder_filter_removed', { filter_count: next.length })
      return next
    })
  }, [])

  const updateLabelFilter = useCallback((id: string, updates: Partial<LabelFilter>) => {
    setLabelFilters(prev =>
      prev.map(filter => (filter.id === id ? { ...filter, ...updates } : filter)),
    )
  }, [])

  const toggleGroupByLabel = useCallback((label: string) => {
    setGroupByLabels(prev => {
      const index = prev.indexOf(label)
      const next = index === -1 ? [...prev, label] : prev.filter(l => l !== label)
      trackEvent('query_builder_group_by_toggled', {
        label,
        group_by_count: next.length,
      })
      return next
    })
  }, [])

  const setQuery = useCallback((query: string) => {
    setCodeQuery(query)
    if (query) {
      setMode('code')
    }
  }, [])

  const reset = useCallback(() => {
    setMetric('')
    setLabelFilters([])
    setAggregation('')
    setGroupByLabels([])
    setRangeInterval('5m')
    setKValue(10)
    setCodeQuery('')
    setMode('builder')
  }, [])

  const switchMode = useCallback(
    (newMode: 'builder' | 'code') => {
      if (newMode === 'code' && mode === 'builder' && generatedQuery) {
        setCodeQuery(generatedQuery)
      }
      if (newMode !== mode) {
        trackEvent('query_builder_mode_changed', { mode: newMode })
      }
      setMode(newMode)
    },
    [generatedQuery, mode],
  )

  return {
    mode,
    setMode: switchMode,
    metric,
    setMetric,
    labelFilters,
    aggregation,
    setAggregation,
    groupByLabels,
    rangeInterval,
    setRangeInterval,
    kValue,
    setKValue,
    codeQuery,
    setCodeQuery,
    generatedQuery,
    activeQuery,
    metricsCache,
    labelsCache,
    labelValuesCache,
    loadingMetrics,
    loadingLabels,
    loadingLabelValues,
    setDatasourceId,
    loadMetrics,
    loadLabels,
    loadLabelValues,
    addLabelFilter,
    removeLabelFilter,
    updateLabelFilter,
    toggleGroupByLabel,
    setQuery,
    reset,
  }
}