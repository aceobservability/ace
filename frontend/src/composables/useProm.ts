import { type Ref, ref, watch } from 'vue'
import { trackEvent } from '../analytics'
import { API_BASE as API_BASE_URL } from '../api/base'

// Types for Prometheus API response
interface PrometheusMetricResult {
  metric: Record<string, string>
  values: [number, string][] // [timestamp, value] pairs
}

export interface PrometheusQueryData {
  resultType: string
  result: PrometheusMetricResult[]
}

export interface PrometheusQueryResult {
  status: 'success' | 'error'
  data?: PrometheusQueryData
  error?: string
}

// Chart-friendly data format
export interface ChartSeries {
  name: string
  data: { timestamp: number; value: number }[]
  labels: Record<string, string>
}

export interface ChartData {
  series: ChartSeries[]
}

// Transform Prometheus response to chart-friendly format
export function transformToChartData(result: PrometheusQueryResult): ChartData {
  const series: ChartSeries[] = []

  if (result.status !== 'success' || !result.data) {
    return { series }
  }

  if (!Array.isArray(result.data.result)) {
    return { series }
  }

  for (const metricResult of result.data.result) {
    // Create a label string from metric labels
    const labelParts: string[] = []
    for (const [key, value] of Object.entries(metricResult.metric)) {
      if (key !== '__name__') {
        labelParts.push(`${key}="${value}"`)
      }
    }
    const metricName = metricResult.metric.__name__ || 'value'
    const name = labelParts.length > 0 ? `${metricName}{${labelParts.join(',')}}` : metricName

    const data = metricResult.values.map(([timestamp, value]) => ({
      timestamp,
      value: parseFloat(value),
    }))

    series.push({
      name,
      data,
      labels: metricResult.metric,
    })
  }

  return { series }
}

// Metadata response type
interface MetadataResponse {
  status: 'success' | 'error'
  data?: string[]
  error?: string
}

// Fetch available metric names from Prometheus
export async function fetchMetrics(): Promise<string[]> {
  const response = await fetch(`${API_BASE_URL}/api/datasources/prometheus/metrics`)
  const data: MetadataResponse = await response.json()

  if (data.status !== 'success' || !data.data) {
    throw new Error(data.error || 'Failed to fetch metrics')
  }

  return data.data
}

// Fetch available label names from Prometheus
export async function fetchLabels(): Promise<string[]> {
  const response = await fetch(`${API_BASE_URL}/api/datasources/prometheus/labels`)
  const data: MetadataResponse = await response.json()

  if (data.status !== 'success' || !data.data) {
    throw new Error(data.error || 'Failed to fetch labels')
  }

  return data.data
}

// Fetch label values for a specific label
export async function fetchLabelValues(labelName: string): Promise<string[]> {
  const response = await fetch(
    `${API_BASE_URL}/api/datasources/prometheus/label/${encodeURIComponent(labelName)}/values`,
  )
  const data: MetadataResponse = await response.json()

  if (data.status !== 'success' || !data.data) {
    throw new Error(data.error || 'Failed to fetch label values')
  }

  return data.data
}

// Query Prometheus via backend API
export async function queryPrometheus(
  query: string,
  start: number,
  end: number,
  step: number,
): Promise<PrometheusQueryResult> {
  const params = new URLSearchParams({
    query,
    start: Math.floor(start).toString(),
    end: Math.floor(end).toString(),
    step: step.toString(),
  })

  const response = await fetch(`${API_BASE_URL}/api/datasources/prometheus/query?${params}`)
  const data: PrometheusQueryResult = await response.json()

  return data
}

interface UsePromOptions {
  query: Ref<string>
  start: Ref<number>
  end: Ref<number>
  step?: Ref<number>
  autoFetch?: boolean
  /**
   * Optional function to interpolate template variables (e.g. $job, ${instance})
   * into the query string before execution. Typically provided by the
   * useVariables composable's `interpolate` method at the dashboard level.
   */
  interpolate?: (query: string) => string
}

interface UsePromReturn {
  data: Ref<PrometheusQueryResult | null>
  chartData: Ref<ChartData>
  loading: Ref<boolean>
  error: Ref<string | null>
  fetch: () => Promise<void>
}

// Composable for fetching Prometheus data
export function useProm(options: UsePromOptions): UsePromReturn {
  const data = ref<PrometheusQueryResult | null>(null)
  const chartData = ref<ChartData>({ series: [] })
  const loading = ref(false)
  const error = ref<string | null>(null)

  const defaultStep = ref(15) // 15 seconds default step

  async function fetch() {
    if (!options.query.value) {
      error.value = 'Query is required'
      return
    }

    loading.value = true
    error.value = null

    try {
      // Apply template variable interpolation if an interpolate function is provided.
      // This replaces $var and ${var} patterns with their current dashboard variable values.
      const resolvedQuery = options.interpolate
        ? options.interpolate(options.query.value)
        : options.query.value

      const result = await queryPrometheus(
        resolvedQuery,
        options.start.value,
        options.end.value,
        options.step?.value ?? defaultStep.value,
      )

      data.value = result

      if (result.status === 'error') {
        trackEvent('query_builder_query_failed', {
          query_length: options.query.value.length,
          error: result.error,
        })
        error.value = result.error || 'Query failed'
        chartData.value = { series: [] }
      } else {
        trackEvent('query_builder_query_succeeded', {
          query_length: options.query.value.length,
          series_count: result.data?.result.length || 0,
        })
        chartData.value = transformToChartData(result)
      }
    } catch (e) {
      trackEvent('query_builder_query_failed', {
        query_length: options.query.value.length,
        error: e instanceof Error ? e.message : 'Failed to fetch data',
      })
      error.value = e instanceof Error ? e.message : 'Failed to fetch data'
      data.value = null
      chartData.value = { series: [] }
    } finally {
      loading.value = false
    }
  }

  // Auto-fetch when parameters change
  if (options.autoFetch !== false) {
    watch(
      [options.query, options.start, options.end, options.step ?? defaultStep],
      () => {
        if (options.query.value) {
          fetch()
        }
      },
      { immediate: true },
    )
  }

  return {
    data,
    chartData,
    loading,
    error,
    fetch,
  }
}
