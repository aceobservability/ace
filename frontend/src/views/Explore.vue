<script setup lang="ts">
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  HeartPulse,
  History,
  Loader2,
  Play,
  X,
} from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { queryDataSource } from '../api/datasources'
import ClickHouseSQLEditor from '../components/ClickHouseSQLEditor.vue'
import CloudWatchQueryEditor from '../components/CloudWatchQueryEditor.vue'
import ElasticsearchQueryEditor from '../components/ElasticsearchQueryEditor.vue'
import type { ChartSeries } from '../components/LineChart.vue'
import LineChart from '../components/LineChart.vue'
import QueryBuilder from '../components/QueryBuilder.vue'
import TimeRangePicker from '../components/TimeRangePicker.vue'
import { useDatasource } from '../composables/useDatasource'
import { useOrganization } from '../composables/useOrganization'
import { type PrometheusQueryResult, transformToChartData } from '../composables/useProm'
import { useQueryEditor } from '../composables/useQueryEditor'
import { useTimeRange } from '../composables/useTimeRange'
import type { DataSourceType } from '../types/datasource'
import { dataSourceTypeLabels } from '../types/datasource'
import { dataSourceTypeLogos } from '../utils/datasourceLogos'

const { timeRange, onRefresh, setCustomRange } = useTimeRange()
const { currentOrg } = useOrganization()
const { metricsDatasources, fetchDatasources } = useDatasource()
const queryEditor = useQueryEditor()

type DatasourceHealthStatus = 'unknown' | 'checking' | 'healthy' | 'unhealthy'

interface TraceMetricsNavigationContext {
  serviceName?: string
  startMs?: number
  endMs?: number
  createdAt?: number
}

const TRACE_METRICS_NAVIGATION_CONTEXT_KEY = 'trace_metrics_navigation'
const TRACE_NAVIGATION_MAX_AGE_MS = 5 * 60 * 1000

// Query state
const selectedDatasourceId = ref('')
const query = ref('')
const loading = ref(false)
const error = ref<string | null>(null)
const result = ref<PrometheusQueryResult | null>(null)
const chartSeries = ref<ChartSeries[]>([])

// Query history (session storage)
const HISTORY_KEY = 'explore_query_history'
const MAX_HISTORY = 10
const queryHistory = ref<string[]>([])
const showHistory = ref(false)
const showDatasourceMenu = ref(false)
const datasourceMenuRef = ref<HTMLElement | null>(null)
const datasourceHealth = ref<Record<string, DatasourceHealthStatus>>({})
const datasourceHealthErrors = ref<Record<string, string>>({})
const pendingServiceName = ref('')
const pendingStartMs = ref<number | null>(null)
const pendingEndMs = ref<number | null>(null)

function escapePromQLLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function escapeForSingleQuotedValue(value: string): string {
  return value.replace(/'/g, "''")
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
        index: 'logs-*',
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

function consumeTraceMetricsNavigationContext() {
  let rawContext: string | null = null
  try {
    rawContext = localStorage.getItem(TRACE_METRICS_NAVIGATION_CONTEXT_KEY)
    localStorage.removeItem(TRACE_METRICS_NAVIGATION_CONTEXT_KEY)
  } catch {
    return
  }

  if (!rawContext) {
    return
  }

  try {
    const parsed = JSON.parse(rawContext) as TraceMetricsNavigationContext

    if (typeof parsed.createdAt === 'number') {
      const ageMs = Date.now() - parsed.createdAt
      if (ageMs > TRACE_NAVIGATION_MAX_AGE_MS) {
        return
      }
    }

    pendingServiceName.value =
      typeof parsed.serviceName === 'string' ? parsed.serviceName.trim() : ''

    if (
      typeof parsed.startMs === 'number' &&
      typeof parsed.endMs === 'number' &&
      parsed.endMs > parsed.startMs
    ) {
      pendingStartMs.value = parsed.startMs
      pendingEndMs.value = parsed.endMs
    }
  } catch {
    // Ignore malformed navigation context.
  }
}

function applyTraceMetricsNavigationContext() {
  if (!pendingServiceName.value && pendingStartMs.value === null && pendingEndMs.value === null) {
    return
  }

  query.value = buildServiceMetricsQuery(
    activeDatasource.value?.type || 'prometheus',
    pendingServiceName.value,
  )

  if (pendingStartMs.value !== null && pendingEndMs.value !== null) {
    setCustomRange(pendingStartMs.value, pendingEndMs.value)
  }

  pendingServiceName.value = ''
  pendingStartMs.value = null
  pendingEndMs.value = null
}

// Load history from session storage
onMounted(() => {
  consumeTraceMetricsNavigationContext()

  if (activeDatasource.value) {
    applyTraceMetricsNavigationContext()
  }

  const stored = sessionStorage.getItem(HISTORY_KEY)
  if (stored) {
    try {
      queryHistory.value = JSON.parse(stored)
    } catch {
      queryHistory.value = []
    }
  }

  if (currentOrg.value) {
    fetchDatasources(currentOrg.value.id)
  }

  queryEditor.register({
    setQuery: (q: string) => {
      query.value = q
    },
    execute: () => {
      runQuery()
    },
    getQuery: () => query.value,
  })
})

watch(
  () => currentOrg.value?.id,
  (orgId, previousOrgId) => {
    if (orgId && orgId !== previousOrgId) {
      fetchDatasources(orgId)
    }
  },
)

watch(
  metricsDatasources,
  (sources) => {
    if (sources.length === 0) {
      selectedDatasourceId.value = ''
      return
    }

    const hasSelected = sources.some((ds) => ds.id === selectedDatasourceId.value)
    if (!hasSelected) {
      const defaultDatasource = sources.find((ds) => ds.is_default)
      selectedDatasourceId.value = defaultDatasource?.id || sources[0].id
    }
  },
  { immediate: true },
)

watch(metricsDatasources, (sources) => {
  const sourceIds = new Set(sources.map((ds) => ds.id))
  datasourceHealth.value = Object.fromEntries(
    Object.entries(datasourceHealth.value).filter(([id]) => sourceIds.has(id)),
  )
  datasourceHealthErrors.value = Object.fromEntries(
    Object.entries(datasourceHealthErrors.value).filter(([id]) => sourceIds.has(id)),
  )
})

// Save query to history
function addToHistory(q: string) {
  if (!q.trim()) return

  // Remove duplicate if exists
  const filtered = queryHistory.value.filter((h) => h !== q)

  // Add to beginning
  queryHistory.value = [q, ...filtered].slice(0, MAX_HISTORY)

  // Save to session storage
  sessionStorage.setItem(HISTORY_KEY, JSON.stringify(queryHistory.value))
}

// Run the query
async function runQuery() {
  if (!selectedDatasourceId.value) {
    error.value = 'Select a metrics datasource'
    return
  }

  if (!query.value.trim()) {
    error.value = 'Query is required'
    return
  }

  loading.value = true
  error.value = null
  result.value = null
  chartSeries.value = []

  try {
    // Convert time range from milliseconds to seconds
    const start = Math.floor(timeRange.value.start / 1000)
    const end = Math.floor(timeRange.value.end / 1000)

    // Calculate step based on time range (aim for ~200 data points)
    const duration = end - start
    const step = Math.max(15, Math.floor(duration / 200))

    const response = await queryDataSource(selectedDatasourceId.value, {
      query: query.value,
      signal:
        isClickHouseDatasource.value ||
        isCloudWatchDatasource.value ||
        isElasticsearchDatasource.value
          ? 'metrics'
          : undefined,
      start,
      end,
      step,
    })

    if (response.status === 'error') {
      error.value = response.error || 'Query failed'
    } else if (response.resultType !== 'metrics') {
      error.value = 'Selected datasource did not return metric results'
    } else {
      const metricsResponse: PrometheusQueryResult = {
        status: response.status,
        data: response.data,
        error: response.error,
      }

      result.value = metricsResponse

      const chartData = transformToChartData(metricsResponse)
      chartSeries.value = chartData.series.map((s) => ({
        name: s.name,
        data: s.data,
      }))

      // Add to history on successful query
      addToHistory(query.value)
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to execute query'
  } finally {
    loading.value = false
  }
}

// Handle keyboard shortcut
function handleKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    runQuery()
  }
}

// Select query from history
function selectHistoryQuery(q: string) {
  query.value = q
  showHistory.value = false
}

// Clear history
function clearHistory() {
  queryHistory.value = []
  sessionStorage.removeItem(HISTORY_KEY)
}

// Subscribe to refresh events
let unsubscribeRefresh: (() => void) | null = null

onMounted(() => {
  document.addEventListener('click', handleDocumentClick)
  unsubscribeRefresh = onRefresh(() => {
    if (query.value.trim() && selectedDatasourceId.value && result.value?.status === 'success') {
      runQuery()
    }
  })
})

onUnmounted(() => {
  queryEditor.unregister()
  document.removeEventListener('click', handleDocumentClick)
  if (unsubscribeRefresh) {
    unsubscribeRefresh()
  }
})

// Computed properties
const hasResults = computed(
  () => result.value?.status === 'success' && chartSeries.value.length > 0,
)
const seriesCount = computed(() => chartSeries.value.length)
const hasMetricsDatasources = computed(() => metricsDatasources.value.length > 0)
const activeDatasource = computed(
  () => metricsDatasources.value.find((ds) => ds.id === selectedDatasourceId.value) || null,
)
const isClickHouseDatasource = computed(() => activeDatasource.value?.type === 'clickhouse')
const isCloudWatchDatasource = computed(() => activeDatasource.value?.type === 'cloudwatch')
const isElasticsearchDatasource = computed(() => activeDatasource.value?.type === 'elasticsearch')
const activeDatasourceHealth = computed<DatasourceHealthStatus>(() => {
  if (!activeDatasource.value) {
    return 'unknown'
  }

  return datasourceHealth.value[activeDatasource.value.id] || 'unknown'
})
const activeDatasourceHealthLabel = computed(() => {
  if (activeDatasourceHealth.value === 'healthy') return 'Healthy'
  if (activeDatasourceHealth.value === 'unhealthy') return 'Unhealthy'
  if (activeDatasourceHealth.value === 'checking') return 'Checking...'
  return 'Unknown'
})
const activeDatasourceHealthError = computed(() => {
  if (!activeDatasource.value) {
    return ''
  }

  return datasourceHealthErrors.value[activeDatasource.value.id] || ''
})

function getTypeLogo(type_: DataSourceType): string {
  return dataSourceTypeLogos[type_]
}

function toggleDatasourceMenu() {
  if (loading.value || !hasMetricsDatasources.value) {
    return
  }

  showDatasourceMenu.value = !showDatasourceMenu.value
}

function selectDatasource(datasourceId: string) {
  selectedDatasourceId.value = datasourceId
  showDatasourceMenu.value = false
}

function handleDocumentClick(event: MouseEvent) {
  const target = event.target as Node
  if (!datasourceMenuRef.value?.contains(target)) {
    showDatasourceMenu.value = false
  }
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
    return '{"index":"logs-*","aggs":{"timeseries":{"date_histogram":{"field":"@timestamp","fixed_interval":"1m","min_doc_count":0}}}}'
  }
  if (type_ === 'loki') {
    return '{job=~".+"}'
  }
  return '*'
}

async function checkDatasourceHealth(datasourceId: string, type_: DataSourceType) {
  datasourceHealth.value[datasourceId] = 'checking'
  delete datasourceHealthErrors.value[datasourceId]

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

    datasourceHealth.value[datasourceId] = 'healthy'
  } catch (e) {
    datasourceHealth.value[datasourceId] = 'unhealthy'
    datasourceHealthErrors.value[datasourceId] =
      e instanceof Error ? e.message : 'Health check failed'
  }
}

watch(
  activeDatasource,
  (datasource) => {
    if (!datasource) {
      return
    }

    applyTraceMetricsNavigationContext()

    if ((datasourceHealth.value[datasource.id] || 'unknown') === 'unknown') {
      checkDatasourceHealth(datasource.id, datasource.type)
    }
  },
  { immediate: true },
)

watch(selectedDatasourceId, () => {
  showDatasourceMenu.value = false
})
</script>

<template>
  <div class="flex min-h-full" @keydown="handleKeydown">
    <div class="flex flex-col flex-1 min-w-0 px-8 py-6">
    <header class="flex items-center justify-between mb-6">
      <div class="flex items-center flex-wrap gap-3">
        <h1 class="text-2xl font-bold text-text-primary m-0">Explore</h1>
        <span class="rounded-sm border border-accent-border bg-accent-muted px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-accent">Metrics</span>
      </div>
    </header>

    <div class="flex flex-col gap-6 flex-1">
      <div class="flex flex-col gap-4 rounded border border-border bg-surface-raised p-4">
        <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-4 items-end max-md:grid-cols-1">
          <div class="flex flex-col gap-2.5">
            <label class="text-xs font-semibold uppercase tracking-wide text-text-muted">Data Source</label>
            <div ref="datasourceMenuRef" class="relative">
              <button
                type="button"
                class="flex w-full items-center gap-3 rounded border border-border bg-surface-raised px-4 py-3 text-left cursor-pointer transition hover:border-border-strong hover:bg-surface-overlay disabled:opacity-60 disabled:cursor-not-allowed"
                data-testid="explore-datasource-btn"
                :disabled="loading || !hasMetricsDatasources"
                @click="toggleDatasourceMenu"
                :title="activeDatasource ? `Active datasource: ${activeDatasource.name}` : 'No metrics datasource configured'"
              >
                <template v-if="activeDatasource">
                  <img
                    :src="getTypeLogo(activeDatasource.type)"
                    :alt="`${dataSourceTypeLabels[activeDatasource.type]} logo`"
                    class="h-7 w-7 shrink-0 object-contain"
                  />
                  <div class="flex flex-col min-w-0 gap-px">
                    <span class="text-[0.68rem] uppercase tracking-wide text-text-muted">Active Source</span>
                    <strong class="text-sm font-semibold text-text-primary truncate">{{ activeDatasource.name }}</strong>
                    <span class="font-mono text-xs uppercase tracking-[0.07em] text-text-muted">{{ dataSourceTypeLabels[activeDatasource.type] }}</span>
                  </div>
                  <span
                    class="ml-auto inline-flex items-center gap-1.5 rounded-sm px-2.5 py-0.5 text-xs border"
                    :class="{
                      'border-border text-text-muted': activeDatasourceHealth === 'checking' || activeDatasourceHealth === 'unknown',
                      'border-accent-border bg-accent-muted text-accent': activeDatasourceHealth === 'healthy',
                      'border-rose-500/25 bg-rose-500/10 text-rose-500': activeDatasourceHealth === 'unhealthy',
                    }"
                    :title="activeDatasourceHealthError || activeDatasourceHealthLabel"
                  >
                    <Loader2 v-if="activeDatasourceHealth === 'checking'" :size="12" class="animate-spin" />
                    <HeartPulse v-else-if="activeDatasourceHealth === 'healthy'" :size="12" />
                    <CircleAlert v-else-if="activeDatasourceHealth === 'unhealthy'" :size="12" />
                    <span>{{ activeDatasourceHealthLabel }}</span>
                  </span>
                </template>

                <span v-else class="text-sm text-text-muted">No metrics datasource configured</span>

                <component
                  :is="showDatasourceMenu ? ChevronUp : ChevronDown"
                  :size="16"
                  class="ml-1 shrink-0 text-text-muted"
                />
              </button>

              <div v-if="showDatasourceMenu && hasMetricsDatasources" class="absolute left-0 right-0 top-full mt-1.5 z-[110] max-h-[280px] overflow-y-auto rounded border border-border bg-surface-raised shadow-lg">
                <button
                  v-for="ds in metricsDatasources"
                  :key="ds.id"
                  type="button"
                  class="flex w-full items-center gap-2.5 border-none bg-transparent px-3 py-2.5 text-left text-text-primary cursor-pointer hover:bg-surface-overlay"
                  :class="{ 'bg-accent-muted': ds.id === selectedDatasourceId }"
                  @click="selectDatasource(ds.id)"
                >
                  <img
                    :src="getTypeLogo(ds.type)"
                    :alt="`${dataSourceTypeLabels[ds.type]} logo`"
                    class="h-[18px] w-[18px] shrink-0 object-contain"
                  />
                  <div class="flex min-w-0 flex-col gap-px">
                    <strong class="text-sm font-semibold text-text-primary">{{ ds.name }}</strong>
                    <span class="text-xs text-text-muted">{{ dataSourceTypeLabels[ds.type] }}</span>
                  </div>
                  <Check v-if="ds.id === selectedDatasourceId" :size="14" class="ml-auto text-accent" />
                </button>
              </div>
            </div>
          </div>

          <div class="flex flex-col gap-2.5">
            <label class="text-xs font-semibold uppercase tracking-wide text-text-muted">Query Range</label>
            <TimeRangePicker stacked />
          </div>
        </div>

        <div class="flex flex-col gap-4">
          <ClickHouseSQLEditor
            v-if="isClickHouseDatasource"
            v-model="query"
            signal="metrics"
            :disabled="loading || !hasMetricsDatasources"
          />
          <CloudWatchQueryEditor
            v-else-if="isCloudWatchDatasource"
            v-model="query"
            signal="metrics"
            :show-signal-selector="false"
            :disabled="loading || !hasMetricsDatasources"
          />
          <ElasticsearchQueryEditor
            v-else-if="isElasticsearchDatasource"
            v-model="query"
            signal="metrics"
            :show-signal-selector="false"
            :disabled="loading || !hasMetricsDatasources"
          />
          <QueryBuilder v-else v-model="query" :disabled="loading || !hasMetricsDatasources" />

          <!-- History button -->
          <div v-if="queryHistory.length > 0" class="relative">
            <button
              data-testid="explore-history-btn"
              class="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary cursor-pointer"
              :class="{ 'text-text-primary': showHistory }"
              @click="showHistory = !showHistory"
              title="Query history"
            >
              <History :size="16" />
              <span>History</span>
            </button>

            <!-- Query history dropdown -->
            <div v-if="showHistory" class="absolute left-0 top-full mt-1 z-10 w-80 max-h-[300px] overflow-y-auto rounded border border-border bg-surface-raised shadow-lg max-md:w-full">
              <div class="flex items-center justify-between px-4 py-3 border-b border-border text-xs font-semibold uppercase tracking-wide text-text-muted">
                <span>Recent Queries</span>
                <button class="flex items-center justify-center h-6 w-6 rounded bg-transparent border-none text-text-muted cursor-pointer transition hover:bg-surface-overlay hover:text-rose-500" @click="clearHistory" title="Clear history">
                  <X :size="14" />
                </button>
              </div>
              <button
                v-for="(q, index) in queryHistory"
                :key="index"
                class="block w-full border-none bg-transparent px-4 py-2.5 text-left cursor-pointer border-b border-border hover:bg-surface-overlay"
                @click="selectHistoryQuery(q)"
              >
                <code class="block font-mono text-xs text-text-secondary truncate">{{ q }}</code>
              </button>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-4">
          <button
            data-testid="explore-run-query-btn"
            class="inline-flex items-center gap-2 rounded-sm bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            :disabled="loading || !query.trim() || !selectedDatasourceId || !hasMetricsDatasources"
            @click="runQuery"
          >
            <Play :size="16" />
            <span>{{ loading ? 'Running...' : 'Run Query' }}</span>
          </button>
          <span class="text-xs text-text-muted">Ctrl+Enter to run</span>
        </div>

        <!-- Error display -->
        <div v-if="error" class="flex items-center gap-2 rounded border border-rose-500/25 bg-rose-500/10 p-4 text-sm text-rose-500">
          <AlertCircle :size="16" />
          <span>{{ error }}</span>
        </div>
      </div>

      <!-- Results section -->
      <div class="flex flex-1 flex-col rounded border border-border bg-surface-raised overflow-hidden min-h-[400px]">
        <div v-if="loading" class="flex flex-col items-center justify-center gap-4 py-12 text-text-muted flex-1">
          <div class="animate-spin h-8 w-8 rounded-full border-[3px] border-border border-t-accent"></div>
          <span class="text-sm">Executing query...</span>
        </div>

        <div v-else-if="hasResults" class="flex flex-col flex-1">
          <div class="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-overlay">
            <span class="text-sm text-text-muted">{{ seriesCount }} {{ seriesCount === 1 ? 'series' : 'series' }}</span>
          </div>
          <div class="flex-1 p-4 min-h-[400px]">
            <LineChart :series="chartSeries" :height="400" />
          </div>
        </div>

        <div v-else-if="result?.status === 'success' && chartSeries.length === 0" class="flex flex-col items-center justify-center py-12 text-center text-sm text-text-muted flex-1">
          <p class="m-0">No data returned for the selected time range.</p>
        </div>

        <div v-else-if="!hasMetricsDatasources" class="flex flex-col items-center justify-center py-12 text-center text-sm text-text-muted flex-1">
          <p class="m-0">No metrics datasource configured.</p>
          <p class="m-0 text-xs text-text-muted">Add a Prometheus, VictoriaMetrics, CloudWatch, or Elasticsearch datasource in Data Sources.</p>
        </div>

        <div v-else class="flex flex-col items-center justify-center py-12 text-center text-sm text-text-muted flex-1">
          <p class="m-0">
            {{
              isClickHouseDatasource
                ? 'Write a SQL query and click "Run Query" to visualize your metrics.'
                : isCloudWatchDatasource
                  ? 'Write a CloudWatch metrics query and click "Run Query" to visualize your metrics.'
                  : isElasticsearchDatasource
                    ? 'Write an Elasticsearch aggregation query and click "Run Query" to visualize your metrics.'
                    : 'Write a PromQL query and click "Run Query" to visualize your metrics.'
            }}
          </p>
          <p v-if="isClickHouseDatasource" class="m-0 text-xs text-text-muted">
            Examples: <code class="rounded bg-surface-overlay px-1.5 py-0.5 font-mono text-xs text-text-secondary">SELECT timestamp, value, metric FROM metrics WHERE timestamp &gt;= toDateTime({start})</code>
          </p>
          <p v-else-if="isCloudWatchDatasource" class="m-0 text-xs text-text-muted">
            Example: <code class="rounded bg-surface-overlay px-1.5 py-0.5 font-mono text-xs text-text-secondary">{"namespace":"AWS/EC2","metric_name":"CPUUtilization","stat":"Average","period":60}</code>
          </p>
          <p v-else-if="isElasticsearchDatasource" class="m-0 text-xs text-text-muted">
            Example: <code class="rounded bg-surface-overlay px-1.5 py-0.5 font-mono text-xs text-text-secondary">{"index":"logs-*","aggs":{"timeseries":{"date_histogram":{"field":"@timestamp","fixed_interval":"1m"}}}}</code>
          </p>
          <p v-else class="m-0 text-xs text-text-muted">Examples: <code class="rounded bg-surface-overlay px-1.5 py-0.5 font-mono text-xs text-text-secondary">up</code>, <code class="rounded bg-surface-overlay px-1.5 py-0.5 font-mono text-xs text-text-secondary">rate(http_requests_total[5m])</code>, <code class="rounded bg-surface-overlay px-1.5 py-0.5 font-mono text-xs text-text-secondary">node_cpu_seconds_total</code></p>
        </div>
      </div>
    </div>
    </div>
  </div>
</template>
