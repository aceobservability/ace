<script setup lang="ts">
import { AlertCircle, BarChart3, Pencil, Trash2 } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { queryDataSource, searchDataSourceTraces } from '../api/datasources'
import { useProm } from '../composables/useProm'
import { useTimeRange } from '../composables/useTimeRange'
import type { LogEntry, TraceSpan, TraceSummary } from '../types/datasource'
import type { Panel } from '../types/panel'
import BarChart from './BarChart.vue'
import GaugeChart, { type Threshold } from './GaugeChart.vue'
import LineChart from './LineChart.vue'
import LogViewer from './LogViewer.vue'
import PieChart, { type PieDataItem } from './PieChart.vue'
import StatPanel, { type DataPoint } from './StatPanel.vue'
import TablePanel from './TablePanel.vue'
import TraceHeatmapPanel from './TraceHeatmapPanel.vue'
import TraceListPanel from './TraceListPanel.vue'

const props = defineProps<{
  panel: Panel
}>()

const emit = defineEmits<{
  edit: [panel: Panel]
  delete: [panel: Panel]
  'open-trace': [payload: { datasourceId: string; traceId: string }]
}>()

const { timeRange, onRefresh } = useTimeRange()

type QuerySignal = 'logs' | 'metrics' | 'traces'

function isQuerySignal(value: unknown): value is QuerySignal {
  return value === 'logs' || value === 'metrics' || value === 'traces'
}

function getTagValue(tags: Record<string, string> | undefined, keys: string[]): string {
  if (!tags || Object.keys(tags).length === 0) {
    return ''
  }

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
      if (value) {
        return value
      }
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
  if (traceIdFromTags) {
    return traceIdFromTags
  }

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
    if (span.serviceName) {
      group.services.add(span.serviceName)
    }

    if (isTraceErrorSpan(span)) {
      group.errorSpanCount += 1
    }

    const spanStart = Math.max(0, span.startTimeUnixNano || 0)
    const spanEnd = spanStart + Math.max(0, span.durationNano || 0)
    group.startTimeUnixNano = Math.min(group.startTimeUnixNano, spanStart)
    group.endTimeUnixNano = Math.max(group.endTimeUnixNano, spanEnd)

    grouped.set(traceId, group)
  }

  const summaries: TraceSummary[] = []
  for (const group of grouped.values()) {
    const spanIds = new Set(group.spans.map((span) => span.spanId))
    const rootSpan =
      [...group.spans]
        .sort((left, right) => left.startTimeUnixNano - right.startTimeUnixNano)
        .find((span) => !span.parentSpanId || !spanIds.has(span.parentSpanId)) || group.spans[0]

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

// Check if panel uses a datasource-based query
const datasourceId = computed(() => props.panel.query?.datasource_id as string | undefined)
const queryExpr = computed(
  () => (props.panel.query?.promql || props.panel.query?.expr || '') as string,
)
const explicitQuerySignal = computed<QuerySignal | null>(() => {
  const value = props.panel.query?.signal
  return isQuerySignal(value) ? value : null
})

const inferredQuerySignal = computed<QuerySignal | undefined>(() => {
  if (explicitQuerySignal.value) {
    return explicitQuerySignal.value
  }

  if (props.panel.type === 'logs') {
    return 'logs'
  }

  if (props.panel.type === 'trace_list' || props.panel.type === 'trace_heatmap') {
    return 'traces'
  }

  return 'metrics'
})

// Setup Prometheus query (legacy, when no datasource_id)
const promqlQuery = computed(() => (!datasourceId.value ? queryExpr.value : ''))

// Create refs for useProm
const queryRef = ref(promqlQuery.value)
const startRef = computed(() => Math.floor(timeRange.value.start / 1000))
const endRef = computed(() => Math.floor(timeRange.value.end / 1000))

// Watch for query changes
watch(
  promqlQuery,
  (newQuery) => {
    queryRef.value = newQuery
  },
  { immediate: true },
)

const {
  chartData: promChartData,
  loading: promLoading,
  error: promError,
  fetch: promRefetch,
} = useProm({
  query: queryRef,
  start: startRef,
  end: endRef,
  autoFetch: true,
})

// Datasource-based query state
const dsLoading = ref(false)
const dsError = ref<string | null>(null)
const dsLogs = ref<LogEntry[]>([])
const dsTraceSummaries = ref<TraceSummary[]>([])
const dsChartData = ref<{
  series: { name: string; data: { timestamp: number; value: number }[] }[]
}>({ series: [] })

const traceServiceFilter = computed(() => {
  return typeof props.panel.query?.service === 'string' ? props.panel.query.service : ''
})

const traceSearchLimit = computed(() => {
  const rawLimit = props.panel.query?.limit
  if (typeof rawLimit !== 'number' || !Number.isFinite(rawLimit)) {
    return 50
  }

  return Math.max(1, Math.min(200, Math.floor(rawLimit)))
})

async function fetchDatasourceData() {
  if (!datasourceId.value) return

  const isTracePanel = props.panel.type === 'trace_list' || props.panel.type === 'trace_heatmap'
  const hasExplicitTraceSignal = explicitQuerySignal.value === 'traces'

  dsLoading.value = true
  dsError.value = null

  try {
    if (isTracePanel) {
      if (hasExplicitTraceSignal) {
        if (!queryExpr.value.trim()) {
          dsTraceSummaries.value = []
          dsLogs.value = []
          dsChartData.value = { series: [] }
          return
        }

        const traceResult = await queryDataSource(datasourceId.value, {
          query: queryExpr.value,
          signal: 'traces',
          start: startRef.value,
          end: endRef.value,
          step: 15,
          limit: traceSearchLimit.value,
        })

        if (traceResult.status === 'error') {
          dsError.value = traceResult.error || 'Query failed'
          dsTraceSummaries.value = []
          return
        }

        if (traceResult.resultType !== 'traces') {
          dsError.value = 'Selected datasource did not return trace results'
          dsTraceSummaries.value = []
          return
        }

        dsTraceSummaries.value = convertClickHouseSpansToTraceSummaries(
          traceResult.data?.traces || [],
        )
      } else {
        dsTraceSummaries.value = await searchDataSourceTraces(datasourceId.value, {
          query: queryExpr.value.trim() || undefined,
          service: traceServiceFilter.value || undefined,
          start: startRef.value,
          end: endRef.value,
          limit: traceSearchLimit.value,
        })
      }
      dsLogs.value = []
      dsChartData.value = { series: [] }
      return
    }

    if (!queryExpr.value) {
      dsLogs.value = []
      dsTraceSummaries.value = []
      dsChartData.value = { series: [] }
      return
    }

    const result = await queryDataSource(datasourceId.value, {
      query: queryExpr.value,
      signal: inferredQuerySignal.value,
      start: startRef.value,
      end: endRef.value,
      step: 15,
      limit: 1000,
    })

    if (result.status === 'error') {
      dsError.value = result.error || 'Query failed'
      dsTraceSummaries.value = []
      return
    }

    if (result.resultType === 'logs' && result.data?.logs) {
      dsLogs.value = result.data.logs
      dsTraceSummaries.value = []
      dsChartData.value = { series: [] }
    } else if (result.resultType === 'traces' && result.data?.traces) {
      dsLogs.value = []
      dsChartData.value = { series: [] }
      dsTraceSummaries.value = []
      dsError.value = 'Trace results can only be rendered in trace panels'
    } else if (result.data?.result) {
      dsLogs.value = []
      dsTraceSummaries.value = []
      dsChartData.value = {
        series: result.data.result.map((r) => {
          const labelParts: string[] = []
          for (const [key, value] of Object.entries(r.metric)) {
            if (key !== '__name__') labelParts.push(`${key}="${value}"`)
          }
          const metricName = r.metric.__name__ || 'value'
          const name = labelParts.length > 0 ? `${metricName}{${labelParts.join(',')}}` : metricName
          return {
            name,
            data: r.values.map(([ts, val]) => ({
              timestamp: typeof ts === 'number' ? ts : parseFloat(String(ts)),
              value: parseFloat(String(val)),
            })),
          }
        }),
      }
    }
  } catch (e) {
    dsError.value = e instanceof Error ? e.message : 'Query failed'
    dsTraceSummaries.value = []
  } finally {
    dsLoading.value = false
  }
}

// Fetch datasource data when params change
watch(
  [
    datasourceId,
    queryExpr,
    explicitQuerySignal,
    inferredQuerySignal,
    traceServiceFilter,
    traceSearchLimit,
    startRef,
    endRef,
  ],
  () => {
    const isTracePanel = props.panel.type === 'trace_list' || props.panel.type === 'trace_heatmap'
    if (datasourceId.value && (isTracePanel || queryExpr.value)) {
      fetchDatasourceData()
    }
  },
  { immediate: true },
)

// Unified computed values
const loading = computed(() => (datasourceId.value ? dsLoading.value : promLoading.value))
const error = computed(() => (datasourceId.value ? dsError.value : promError.value))
const chartData = computed(() => (datasourceId.value ? dsChartData.value : promChartData.value))
const logEntries = computed(() => dsLogs.value)
const traceSummaries = computed(() => dsTraceSummaries.value)

function refetch() {
  if (datasourceId.value) {
    fetchDatasourceData()
  } else {
    promRefetch()
  }
}

// Transform to chart series format
const chartSeries = computed(() => {
  return chartData.value.series.map((s) => ({
    name: s.name,
    data: s.data,
  }))
})

// Get the latest value for gauge chart (from first series)
const gaugeValue = computed(() => {
  if (chartData.value.series.length === 0) return 0
  const firstSeries = chartData.value.series[0]
  if (firstSeries.data.length === 0) return 0
  return firstSeries.data[firstSeries.data.length - 1].value
})

// Extract gauge config from panel query
const gaugeConfig = computed(() => {
  const query = props.panel.query || {}
  return {
    min: typeof query.min === 'number' ? query.min : 0,
    max: typeof query.max === 'number' ? query.max : 100,
    unit: typeof query.unit === 'string' ? query.unit : '',
    decimals: typeof query.decimals === 'number' ? query.decimals : 2,
    thresholds: Array.isArray(query.thresholds) ? (query.thresholds as Threshold[]) : [],
  }
})

// Transform chartData to PieChart data format (use latest value from each series)
const pieData = computed<PieDataItem[]>(() => {
  return chartData.value.series.map((s) => ({
    name: s.name,
    value: s.data.length > 0 ? s.data[s.data.length - 1].value : 0,
  }))
})

// Extract pie chart config from panel query
const pieConfig = computed(() => {
  const query = props.panel.query || {}
  return {
    displayAs: (query.displayAs === 'donut' ? 'donut' : 'pie') as 'pie' | 'donut',
    showLegend: query.showLegend !== false,
    showLabels: query.showLabels !== false,
  }
})

// Auto-refresh on time range change
watch([timeRange, onRefresh], () => {
  if (hasQuery.value) {
    refetch()
  }
})

// Transform data to StatPanel format
const statData = computed<DataPoint[]>(() => {
  if (chartData.value.series.length === 0) return []
  const firstSeries = chartData.value.series[0]
  return firstSeries.data.map((d) => ({
    timestamp: d.timestamp,
    value: d.value,
  }))
})

// Get the current (latest) value for stat panel
const statValue = computed(() => {
  if (chartData.value.series.length === 0) return 0
  const firstSeries = chartData.value.series[0]
  if (firstSeries.data.length === 0) return 0
  return firstSeries.data[firstSeries.data.length - 1].value
})

// Get the previous value for trend calculation (second to last data point)
const statPreviousValue = computed(() => {
  if (chartData.value.series.length === 0) return undefined
  const firstSeries = chartData.value.series[0]
  if (firstSeries.data.length < 2) return undefined
  return firstSeries.data[firstSeries.data.length - 2].value
})

// Extract stat panel config
const statConfig = computed(() => {
  const query = props.panel.query || {}
  return {
    unit: typeof query.unit === 'string' ? query.unit : '',
    decimals: typeof query.decimals === 'number' ? query.decimals : 2,
    showTrend: query.showTrend !== false,
    showSparkline: query.showSparkline !== false,
    thresholds: Array.isArray(query.thresholds) ? (query.thresholds as Threshold[]) : [],
  }
})

const isLineChart = computed(() => props.panel.type === 'line_chart')
const isBarChart = computed(() => props.panel.type === 'bar_chart')
const isGaugeChart = computed(() => props.panel.type === 'gauge')
const isPieChart = computed(() => props.panel.type === 'pie')
const isStatPanel = computed(() => props.panel.type === 'stat')
const isTablePanel = computed(() => props.panel.type === 'table')
const isLogPanel = computed(() => props.panel.type === 'logs')
const isTraceListPanel = computed(() => props.panel.type === 'trace_list')
const isTraceHeatmapPanel = computed(() => props.panel.type === 'trace_heatmap')
const hasQuery = computed(() => {
  if (isTraceListPanel.value || isTraceHeatmapPanel.value) {
    if (explicitQuerySignal.value === 'traces') {
      return !!datasourceId.value && !!queryExpr.value
    }

    return !!datasourceId.value
  }

  return !!queryExpr.value
})

function handleOpenTrace(traceId: string) {
  if (!datasourceId.value || explicitQuerySignal.value === 'traces') {
    return
  }

  emit('open-trace', {
    datasourceId: datasourceId.value,
    traceId,
  })
}
</script>

<template>
  <div class="flex h-full flex-col rounded border border-border bg-surface-raised overflow-hidden">
    <div class="flex items-center justify-between border-b border-border px-4 py-2">
      <h3 class="text-sm font-semibold text-text-primary truncate">{{ panel.title }}</h3>
      <div class="flex gap-1">
        <button
          class="flex items-center justify-center h-7 w-7 rounded-sm border-0 bg-transparent text-text-muted hover:bg-surface-overlay hover:text-text-secondary transition cursor-pointer"
          data-testid="panel-edit-btn"
          @click="$emit('edit', panel)"
          title="Edit panel"
        >
          <Pencil :size="16" />
        </button>
        <button
          class="flex items-center justify-center h-7 w-7 rounded-sm border-0 bg-transparent text-text-muted hover:bg-surface-overlay hover:text-text-secondary transition cursor-pointer"
          data-testid="panel-delete-btn"
          @click="$emit('delete', panel)"
          title="Delete panel"
        >
          <Trash2 :size="16" />
        </button>
      </div>
    </div>
    <div class="flex-1 overflow-hidden p-2 flex flex-col min-h-0">
      <div v-if="!hasQuery" class="flex-1 flex flex-col items-center justify-center gap-3 text-text-muted">
        <BarChart3 :size="48" class="text-text-muted" />
        <p class="text-sm text-text-muted m-0">No query configured</p>
        <button
          class="px-4 py-2 bg-accent text-white border-0 rounded-sm text-sm font-medium cursor-pointer hover:-translate-y-px transition"
          data-testid="panel-configure-btn"
          @click="$emit('edit', panel)"
        >
          Configure Panel
        </button>
      </div>
      <div v-else-if="loading" class="flex-1 flex flex-col items-center justify-center gap-3">
        <div class="h-8 w-8 rounded-sm border-[3px] border-border border-t-accent animate-spin"></div>
        <p class="text-sm text-text-muted m-0">Loading data...</p>
      </div>
      <div v-else-if="error" class="flex-1 flex flex-col items-center justify-center gap-3">
        <AlertCircle :size="48" class="text-rose-500" />
        <p class="text-xs text-rose-500 p-2 m-0">{{ error }}</p>
      </div>
      <div v-else-if="isLineChart && chartSeries.length > 0" class="flex-1 min-h-0">
        <LineChart :series="chartSeries" />
      </div>
      <div v-else-if="isBarChart && chartSeries.length > 0" class="flex-1 min-h-0">
        <BarChart :series="chartSeries" />
      </div>
      <div v-else-if="isGaugeChart && chartSeries.length > 0" class="flex-1 min-h-0">
        <GaugeChart
          :value="gaugeValue"
          :min="gaugeConfig.min"
          :max="gaugeConfig.max"
          :unit="gaugeConfig.unit"
          :decimals="gaugeConfig.decimals"
          :thresholds="gaugeConfig.thresholds"
        />
      </div>
      <div v-else-if="isPieChart && pieData.length > 0" class="flex-1 min-h-0">
        <PieChart
          :data="pieData"
          :display-as="pieConfig.displayAs"
          :show-legend="pieConfig.showLegend"
          :show-labels="pieConfig.showLabels"
        />
      </div>
      <div v-else-if="isStatPanel && statData.length > 0" class="flex-1 min-h-0">
        <StatPanel
          :value="statValue"
          :previous-value="statPreviousValue"
          :data="statData"
          :label="panel.title"
          :unit="statConfig.unit"
          :decimals="statConfig.decimals"
          :thresholds="statConfig.thresholds"
          :show-trend="statConfig.showTrend"
          :show-sparkline="statConfig.showSparkline"
        />
      </div>
      <div v-else-if="isTablePanel && chartSeries.length > 0" class="flex-1 min-h-0">
        <TablePanel :series="chartSeries" />
      </div>
      <div v-else-if="isLogPanel && logEntries.length > 0" class="flex-1 min-h-0">
        <LogViewer :logs="logEntries" />
      </div>
      <div v-else-if="isTraceListPanel && traceSummaries.length > 0" class="flex-1 min-h-0">
        <TraceListPanel :traces="traceSummaries" @open-trace="handleOpenTrace" />
      </div>
      <div v-else-if="isTraceHeatmapPanel && traceSummaries.length > 0" class="flex-1 min-h-0">
        <TraceHeatmapPanel :traces="traceSummaries" @open-trace="handleOpenTrace" />
      </div>
      <div
        v-else-if="chartSeries.length === 0 && logEntries.length === 0 && traceSummaries.length === 0"
        class="flex-1 flex flex-col items-center justify-center gap-3 text-text-muted"
      >
        <AlertCircle :size="48" class="text-amber-400" />
        <p class="text-sm text-text-muted m-0">No data available</p>
      </div>
    </div>
  </div>
</template>
