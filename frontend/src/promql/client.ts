import { API_BASE as API_BASE_URL } from '@/api/base'

interface PrometheusMetricResult {
  metric: Record<string, string>
  values: [number, string][]
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

export interface ChartSeries {
  name: string
  data: { timestamp: number; value: number }[]
  labels: Record<string, string>
}

export interface ChartData {
  series: ChartSeries[]
}

interface MetadataResponse {
  status: 'success' | 'error'
  data?: string[]
  error?: string
}

export function transformToChartData(result: PrometheusQueryResult): ChartData {
  const series: ChartSeries[] = []

  if (result.status !== 'success' || !result.data) {
    return { series }
  }

  if (!Array.isArray(result.data.result)) {
    return { series }
  }

  for (const metricResult of result.data.result) {
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
      value: Number.parseFloat(value),
    }))

    series.push({
      name,
      data,
      labels: metricResult.metric,
    })
  }

  return { series }
}

export async function fetchMetrics(): Promise<string[]> {
  const response = await fetch(`${API_BASE_URL}/api/datasources/prometheus/metrics`)
  const data: MetadataResponse = await response.json()

  if (data.status !== 'success' || !data.data) {
    throw new Error(data.error || 'Failed to fetch metrics')
  }

  return data.data
}

export async function fetchLabels(): Promise<string[]> {
  const response = await fetch(`${API_BASE_URL}/api/datasources/prometheus/labels`)
  const data: MetadataResponse = await response.json()

  if (data.status !== 'success' || !data.data) {
    throw new Error(data.error || 'Failed to fetch labels')
  }

  return data.data
}

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