import { type Ref, ref, watch } from 'vue'
import { trackEvent } from '../analytics'
import {
  type ChartData,
  type PrometheusQueryResult,
  queryPrometheus,
  transformToChartData,
} from '@/promql/client'

export type {
  ChartData,
  ChartSeries,
  PrometheusQueryData,
  PrometheusQueryResult,
} from '@/promql/client'

export {
  fetchLabelValues,
  fetchLabels,
  fetchMetrics,
  queryPrometheus,
  transformToChartData,
} from '@/promql/client'

interface UsePromOptions {
  query: Ref<string>
  start: Ref<number>
  end: Ref<number>
  step?: Ref<number>
  autoFetch?: boolean
  interpolate?: (query: string) => string
}

interface UsePromReturn {
  data: Ref<PrometheusQueryResult | null>
  chartData: Ref<ChartData>
  loading: Ref<boolean>
  error: Ref<string | null>
  fetch: () => Promise<void>
}

export function useProm(options: UsePromOptions): UsePromReturn {
  const data = ref<PrometheusQueryResult | null>(null)
  const chartData = ref<ChartData>({ series: [] })
  const loading = ref(false)
  const error = ref<string | null>(null)

  const defaultStep = ref(15)

  async function fetch() {
    if (!options.query.value) {
      error.value = 'Query is required'
      return
    }

    loading.value = true
    error.value = null

    try {
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