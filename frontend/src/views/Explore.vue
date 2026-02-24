<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { Play, AlertCircle, History, X, Loader2, HeartPulse, CircleAlert, ChevronDown, ChevronUp, Check } from 'lucide-vue-next'
import QueryBuilder from '../components/QueryBuilder.vue'
import ClickHouseSQLEditor from '../components/ClickHouseSQLEditor.vue'
import CloudWatchQueryEditor from '../components/CloudWatchQueryEditor.vue'
import ElasticsearchQueryEditor from '../components/ElasticsearchQueryEditor.vue'
import TimeRangePicker from '../components/TimeRangePicker.vue'
import LineChart from '../components/LineChart.vue'
import { useTimeRange } from '../composables/useTimeRange'
import { transformToChartData, type PrometheusQueryResult } from '../composables/useProm'
import { useOrganization } from '../composables/useOrganization'
import { useDatasource } from '../composables/useDatasource'
import { queryDataSource } from '../api/datasources'
import type { DataSourceType } from '../types/datasource'
import { dataSourceTypeLabels } from '../types/datasource'
import prometheusLogo from '../assets/datasources/prometheus-logo.svg'
import lokiLogo from '../assets/datasources/loki-logo.svg'
import victoriaMetricsLogo from '../assets/datasources/victoriametrics-logo.svg'
import victoriaLogsLogo from '../assets/datasources/victorialogs-logo.svg'
import tempoLogo from '../assets/datasources/tempo-logo.svg'
import victoriaTracesLogo from '../assets/datasources/victoriatraces-logo.svg'
import clickhouseLogo from '../assets/datasources/clickhouse-logo.svg'
import cloudwatchLogo from '../assets/datasources/cloudwatch-logo.svg'
import elasticsearchLogo from '../assets/datasources/elasticsearch-logo.svg'
import type { ChartSeries } from '../components/LineChart.vue'

const { timeRange, onRefresh, setCustomRange } = useTimeRange()
const { currentOrg } = useOrganization()
const { metricsDatasources, fetchDatasources } = useDatasource()

const dataSourceTypeLogos: Partial<Record<DataSourceType, string>> = {
  prometheus: prometheusLogo,
  loki: lokiLogo,
  victoriametrics: victoriaMetricsLogo,
  victorialogs: victoriaLogsLogo,
  tempo: tempoLogo,
  victoriatraces: victoriaTracesLogo,
  clickhouse: clickhouseLogo,
  cloudwatch: cloudwatchLogo,
  elasticsearch: elasticsearchLogo,
}

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
    const serviceFilter = serviceName
      ? [{ term: { 'service.name.keyword': serviceName } }]
      : []

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

    pendingServiceName.value = typeof parsed.serviceName === 'string' ? parsed.serviceName.trim() : ''

    if (typeof parsed.startMs === 'number' && typeof parsed.endMs === 'number' && parsed.endMs > parsed.startMs) {
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

  query.value = buildServiceMetricsQuery(activeDatasource.value?.type || 'prometheus', pendingServiceName.value)

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

    const hasSelected = sources.some(ds => ds.id === selectedDatasourceId.value)
    if (!hasSelected) {
      const defaultDatasource = sources.find(ds => ds.is_default)
      selectedDatasourceId.value = defaultDatasource?.id || sources[0].id
    }
  },
  { immediate: true },
)

watch(
  metricsDatasources,
  (sources) => {
    const sourceIds = new Set(sources.map(ds => ds.id))
    datasourceHealth.value = Object.fromEntries(
      Object.entries(datasourceHealth.value).filter(([id]) => sourceIds.has(id)),
    )
    datasourceHealthErrors.value = Object.fromEntries(
      Object.entries(datasourceHealthErrors.value).filter(([id]) => sourceIds.has(id)),
    )
  },
)

// Save query to history
function addToHistory(q: string) {
  if (!q.trim()) return

  // Remove duplicate if exists
  const filtered = queryHistory.value.filter(h => h !== q)

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
      signal: isClickHouseDatasource.value || isCloudWatchDatasource.value || isElasticsearchDatasource.value ? 'metrics' : undefined,
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
      chartSeries.value = chartData.series.map(s => ({
        name: s.name,
        data: s.data
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
  document.removeEventListener('click', handleDocumentClick)
  if (unsubscribeRefresh) {
    unsubscribeRefresh()
  }
})

// Computed properties
const hasResults = computed(() => result.value?.status === 'success' && chartSeries.value.length > 0)
const seriesCount = computed(() => chartSeries.value.length)
const hasMetricsDatasources = computed(() => metricsDatasources.value.length > 0)
const activeDatasource = computed(
  () => metricsDatasources.value.find(ds => ds.id === selectedDatasourceId.value) || null,
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
    return 'SELECT now() AS timestamp, toFloat64(1) AS value, \'up\' AS metric LIMIT 1'
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
      signal: type_ === 'clickhouse' || type_ === 'cloudwatch' || type_ === 'elasticsearch' ? 'metrics' : undefined,
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
  <div class="explore-page" @keydown="handleKeydown">
    <header class="explore-header">
      <div class="header-title">
        <h1>Explore</h1>
        <span class="mode-badge">Metrics</span>
      </div>
    </header>

    <div class="explore-content">
      <div class="query-section">
        <div class="query-context-row">
          <div class="datasource-row">
            <label>Data Source</label>
            <div ref="datasourceMenuRef" class="datasource-selector">
              <button
                type="button"
                class="active-datasource-panel datasource-trigger"
                :disabled="loading || !hasMetricsDatasources"
                @click="toggleDatasourceMenu"
                :title="activeDatasource ? `Active datasource: ${activeDatasource.name}` : 'No metrics datasource configured'"
              >
                <template v-if="activeDatasource">
                  <img
                    :src="getTypeLogo(activeDatasource.type)"
                    :alt="`${dataSourceTypeLabels[activeDatasource.type]} logo`"
                    class="active-datasource-logo"
                  />
                  <div class="active-datasource-meta">
                    <span class="active-datasource-label">Active Source</span>
                    <strong class="active-datasource-name">{{ activeDatasource.name }}</strong>
                    <span class="active-datasource-type">{{ dataSourceTypeLabels[activeDatasource.type] }}</span>
                  </div>
                  <span
                    class="source-health-badge"
                    :class="`health-${activeDatasourceHealth}`"
                    :title="activeDatasourceHealthError || activeDatasourceHealthLabel"
                  >
                    <Loader2 v-if="activeDatasourceHealth === 'checking'" :size="12" class="icon-spin" />
                    <HeartPulse v-else-if="activeDatasourceHealth === 'healthy'" :size="12" />
                    <CircleAlert v-else-if="activeDatasourceHealth === 'unhealthy'" :size="12" />
                    <span>{{ activeDatasourceHealthLabel }}</span>
                  </span>
                </template>

                <span v-else class="active-datasource-empty">No metrics datasource configured</span>

                <component
                  :is="showDatasourceMenu ? ChevronUp : ChevronDown"
                  :size="16"
                  class="datasource-chevron"
                />
              </button>

              <div v-if="showDatasourceMenu && hasMetricsDatasources" class="datasource-dropdown">
                <button
                  v-for="ds in metricsDatasources"
                  :key="ds.id"
                  type="button"
                  class="datasource-option"
                  :class="{ selected: ds.id === selectedDatasourceId }"
                  @click="selectDatasource(ds.id)"
                >
                  <img
                    :src="getTypeLogo(ds.type)"
                    :alt="`${dataSourceTypeLabels[ds.type]} logo`"
                    class="datasource-option-logo"
                  />
                  <div class="datasource-option-meta">
                    <strong>{{ ds.name }}</strong>
                    <span>{{ dataSourceTypeLabels[ds.type] }}</span>
                  </div>
                  <Check v-if="ds.id === selectedDatasourceId" :size="14" class="datasource-option-check" />
                </button>
              </div>
            </div>
          </div>

          <div class="query-time-controls">
            <label>Query Range</label>
            <TimeRangePicker stacked />
          </div>
        </div>

        <div class="query-builder-wrapper">
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
          <div v-if="queryHistory.length > 0" class="history-container">
            <button
              class="history-btn"
              :class="{ active: showHistory }"
              @click="showHistory = !showHistory"
              title="Query history"
            >
              <History :size="16" />
              <span>History</span>
            </button>

            <!-- Query history dropdown -->
            <div v-if="showHistory" class="history-dropdown">
              <div class="history-header">
                <span>Recent Queries</span>
                <button class="clear-history-btn" @click="clearHistory" title="Clear history">
                  <X :size="14" />
                </button>
              </div>
              <button
                v-for="(q, index) in queryHistory"
                :key="index"
                class="history-item"
                @click="selectHistoryQuery(q)"
              >
                <code>{{ q }}</code>
              </button>
            </div>
          </div>
        </div>

        <div class="query-actions">
          <button
            class="btn btn-run"
            :disabled="loading || !query.trim() || !selectedDatasourceId || !hasMetricsDatasources"
            @click="runQuery"
          >
            <Play :size="16" />
            <span>{{ loading ? 'Running...' : 'Run Query' }}</span>
          </button>
          <span class="hint">Ctrl+Enter to run</span>
        </div>

        <!-- Error display -->
        <div v-if="error" class="query-error">
          <AlertCircle :size="16" />
          <span>{{ error }}</span>
        </div>
      </div>

      <!-- Results section -->
      <div class="results-section">
        <div v-if="loading" class="loading-state">
          <div class="loading-spinner"></div>
          <span>Executing query...</span>
        </div>

        <div v-else-if="hasResults" class="results-container">
          <div class="results-header">
            <span class="result-count">{{ seriesCount }} {{ seriesCount === 1 ? 'series' : 'series' }}</span>
          </div>
          <div class="chart-container">
            <LineChart :series="chartSeries" :height="400" />
          </div>
        </div>

        <div v-else-if="result?.status === 'success' && chartSeries.length === 0" class="empty-state">
          <p>No data returned for the selected time range.</p>
        </div>

        <div v-else-if="!hasMetricsDatasources" class="empty-state">
          <p>No metrics datasource configured.</p>
          <p class="hint-text">Add a Prometheus, VictoriaMetrics, CloudWatch, or Elasticsearch datasource in Data Sources.</p>
        </div>

        <div v-else class="empty-state">
          <p>
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
          <p v-if="isClickHouseDatasource" class="hint-text">
            Examples: <code>SELECT timestamp, value, metric FROM metrics WHERE timestamp &gt;= toDateTime({start})</code>
          </p>
          <p v-else-if="isCloudWatchDatasource" class="hint-text">
            Example: <code>{"namespace":"AWS/EC2","metric_name":"CPUUtilization","stat":"Average","period":60}</code>
          </p>
          <p v-else-if="isElasticsearchDatasource" class="hint-text">
            Example: <code>{"index":"logs-*","aggs":{"timeseries":{"date_histogram":{"field":"@timestamp","fixed_interval":"1m"}}}}</code>
          </p>
          <p v-else class="hint-text">Examples: <code>up</code>, <code>rate(http_requests_total[5m])</code>, <code>node_cpu_seconds_total</code></p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.explore-page {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  padding: 1.25rem 1.8rem;
}

.explore-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding: 0.95rem 1.15rem;
  border: 1px solid var(--border-primary);
  border-radius: 14px;
  background: var(--surface-1);
  box-shadow: var(--shadow-sm);
}

.header-title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.explore-header h1 {
  font-size: 1.08rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  font-family: var(--font-mono);
  color: var(--text-primary);
  margin: 0;
}

.mode-badge {
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
  border: 1px solid rgba(52, 211, 153, 0.38);
  background: rgba(52, 211, 153, 0.14);
  color: #b7f3dd;
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.active-datasource-panel {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0.75rem;
  border-radius: 12px;
  border: 1px solid var(--border-primary);
  background: var(--bg-tertiary);
}

.datasource-trigger {
  width: 100%;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.2s, background-color 0.2s;
}

.datasource-trigger:hover:not(:disabled) {
  border-color: var(--border-secondary);
  background: var(--bg-hover);
}

.datasource-trigger:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.active-datasource-logo {
  width: 28px;
  height: 28px;
  object-fit: contain;
  flex-shrink: 0;
}

.active-datasource-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 0.1rem;
}

.active-datasource-label {
  font-size: 0.68rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-tertiary);
}

.active-datasource-name {
  font-size: 0.86rem;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.active-datasource-type {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.active-datasource-empty {
  color: var(--text-tertiary);
  font-size: 0.85rem;
}

.source-health-badge {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  font-size: 0.72rem;
  border: 1px solid var(--border-primary);
  color: var(--text-secondary);
}

.source-health-badge.health-checking {
  border-color: rgba(148, 163, 184, 0.45);
  color: var(--text-secondary);
}

.source-health-badge.health-healthy {
  border-color: rgba(16, 185, 129, 0.4);
  background: rgba(16, 185, 129, 0.12);
  color: #7de9c5;
}

.source-health-badge.health-unhealthy {
  border-color: rgba(244, 63, 94, 0.4);
  background: rgba(244, 63, 94, 0.12);
  color: #ff9db0;
}

.source-health-badge.health-unknown {
  border-color: rgba(148, 163, 184, 0.45);
  background: rgba(148, 163, 184, 0.1);
}

.icon-spin {
  animation: spin 0.9s linear infinite;
}

.datasource-selector {
  position: relative;
}

.datasource-chevron {
  margin-left: 0.25rem;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.datasource-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  background: rgba(11, 21, 33, 0.98);
  border: 1px solid var(--border-primary);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  z-index: 110;
  max-height: 280px;
  overflow-y: auto;
}

.datasource-option {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.6rem 0.75rem;
  background: transparent;
  border: none;
  text-align: left;
  color: var(--text-primary);
  cursor: pointer;
}

.datasource-option:hover {
  background: var(--bg-hover);
}

.datasource-option.selected {
  background: rgba(56, 189, 248, 0.14);
}

.datasource-option-logo {
  width: 18px;
  height: 18px;
  object-fit: contain;
  flex-shrink: 0;
}

.datasource-option-meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.datasource-option-meta strong {
  font-size: 0.84rem;
  font-weight: 600;
  color: var(--text-primary);
}

.datasource-option-meta span {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.datasource-option-check {
  margin-left: auto;
  color: var(--accent-primary);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.explore-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  flex: 1;
}

.query-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.2rem;
  background: var(--surface-1);
  border: 1px solid var(--border-primary);
  border-radius: 14px;
  box-shadow: var(--shadow-sm);
}

.query-context-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 1rem;
  align-items: end;
}

.datasource-row {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.datasource-row label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.query-time-controls {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.query-time-controls label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.query-builder-wrapper {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.history-container {
  position: relative;
}

.history-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 0.8125rem;
  cursor: pointer;
  transition: all 0.2s;
}

.history-btn:hover,
.history-btn.active {
  background: var(--bg-hover);
  color: var(--text-primary);
  border-color: var(--border-secondary);
}

.history-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  width: 350px;
  max-height: 300px;
  overflow-y: auto;
  background: rgba(11, 21, 33, 0.98);
  border: 1px solid var(--border-primary);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  z-index: 100;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border-primary);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.clear-history-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all 0.2s;
}

.clear-history-btn:hover {
  background: var(--bg-hover);
  color: var(--accent-danger);
}

.history-item {
  display: block;
  width: 100%;
  padding: 0.625rem 1rem;
  background: transparent;
  border: none;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s;
}

.history-item:hover {
  background: var(--bg-hover);
}

.history-item code {
  display: block;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.8125rem;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.query-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.btn-run {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.25rem;
  background: var(--accent-success);
  border: 1px solid var(--accent-success);
  border-radius: 10px;
  color: white;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-run:hover:not(:disabled) {
  background: #0ea67d;
  border-color: #0ea67d;
}

.btn-run:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.hint {
  font-size: 0.75rem;
  color: var(--text-tertiary);
}

.query-error {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: rgba(251, 113, 133, 0.1);
  border: 1px solid rgba(251, 113, 133, 0.3);
  border-radius: 8px;
  color: var(--accent-danger);
  font-size: 0.875rem;
}

.results-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--surface-1);
  border: 1px solid var(--border-primary);
  border-radius: 14px;
  overflow: hidden;
  min-height: 400px;
  box-shadow: var(--shadow-sm);
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 3rem;
  color: var(--text-secondary);
  flex: 1;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid rgba(50, 81, 115, 0.65);
  border-top-color: var(--accent-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.results-container {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border-primary);
  background: rgba(20, 32, 50, 0.9);
}

.result-count {
  font-size: 0.8125rem;
  color: var(--text-secondary);
}

.chart-container {
  flex: 1;
  padding: 1rem;
  min-height: 400px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 3rem;
  text-align: center;
  flex: 1;
}

.empty-state p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.9375rem;
}

.empty-state .hint-text {
  font-size: 0.8125rem;
  color: var(--text-tertiary);
}

.empty-state code {
  padding: 0.125rem 0.375rem;
  background: var(--bg-tertiary);
  border-radius: 4px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.8125rem;
  color: var(--text-accent);
}

@media (max-width: 900px) {
  .explore-page {
    padding: 0.9rem;
  }

  .explore-header {
    flex-direction: column;
    align-items: stretch;
    gap: 0.65rem;
  }

  .header-title {
    justify-content: flex-start;
  }

  .active-datasource-panel {
    width: 100%;
  }

  .query-context-row {
    grid-template-columns: 1fr;
  }

  .history-dropdown {
    width: 100%;
  }
}
</style>
