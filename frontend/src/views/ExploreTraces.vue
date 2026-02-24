<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { AlertCircle, Check, ChevronDown, ChevronUp, Loader2, Search, Waypoints } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import TimeRangePicker from '../components/TimeRangePicker.vue'
import TraceTimeline from '../components/TraceTimeline.vue'
import TraceSpanDetailsPanel from '../components/TraceSpanDetailsPanel.vue'
import TraceServiceGraph from '../components/TraceServiceGraph.vue'
import TraceListPanel from '../components/TraceListPanel.vue'
import ClickHouseSQLEditor from '../components/ClickHouseSQLEditor.vue'
import { useTimeRange } from '../composables/useTimeRange'
import { useOrganization } from '../composables/useOrganization'
import { useDatasource } from '../composables/useDatasource'
import {
  queryDataSource,
  fetchDataSourceTrace,
  fetchDataSourceTraceServiceGraph,
  fetchDataSourceTraceServices,
  searchDataSourceTraces,
} from '../api/datasources'
import type {
  DataSourceType,
  Trace,
  TraceServiceGraph as TraceServiceGraphModel,
  TraceSpan,
  TraceSummary,
} from '../types/datasource'
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

interface TraceNavigationContext {
  datasourceId?: string
  traceId?: string
  createdAt?: number
}

interface TraceLogsNavigationContext {
  traceId: string
  serviceName?: string
  startMs: number
  endMs: number
  createdAt: number
}

interface TraceMetricsNavigationContext {
  serviceName?: string
  startMs: number
  endMs: number
  createdAt: number
}

const TRACE_NAVIGATION_CONTEXT_KEY = 'dashboard_trace_navigation'
const TRACE_LOGS_NAVIGATION_CONTEXT_KEY = 'trace_logs_navigation'
const TRACE_METRICS_NAVIGATION_CONTEXT_KEY = 'trace_metrics_navigation'
const TRACE_NAVIGATION_MAX_AGE_MS = 5 * 60 * 1000
const TRACE_TO_X_PADDING_MS = 5 * 60 * 1000

const router = useRouter()
const { timeRange, isCustomRange, onRefresh } = useTimeRange()
const { currentOrg } = useOrganization()
const { tracingDatasources, fetchDatasources } = useDatasource()

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

const selectedDatasourceId = ref('')
const showDatasourceMenu = ref(false)
const datasourceMenuRef = ref<HTMLElement | null>(null)

const query = ref('')
const selectedService = ref('')
const limit = ref(20)
const traceIdInput = ref('')

const loadingSearch = ref(false)
const loadingTrace = ref(false)
const loadingServices = ref(false)
const error = ref<string | null>(null)
const serviceGraphError = ref<string | null>(null)

const services = ref<string[]>([])
const traceSummaries = ref<TraceSummary[]>([])
const selectedTraceId = ref('')
const activeTrace = ref<Trace | null>(null)
const activeServiceGraph = ref<TraceServiceGraphModel | null>(null)
const selectedSpan = ref<TraceSpan | null>(null)
const loadingServiceGraph = ref(false)
const pendingTraceDatasourceId = ref('')
const pendingTraceId = ref('')
const hasSearched = ref(false)
let unsubscribeRefresh: (() => void) | null = null

const hasTracingDatasources = computed(() => tracingDatasources.value.length > 0)
const activeDatasource = computed(
  () => tracingDatasources.value.find((ds) => ds.id === selectedDatasourceId.value) || null,
)
const isClickHouseDatasource = computed(() => activeDatasource.value?.type === 'clickhouse')

function getTypeLogo(type_: DataSourceType): string {
  return dataSourceTypeLogos[type_] ?? ''
}

function toggleDatasourceMenu() {
  if (!hasTracingDatasources.value || loadingSearch.value || loadingTrace.value) {
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

function formatDurationNano(durationNano: number): string {
  if (durationNano >= 1_000_000_000) {
    return `${(durationNano / 1_000_000_000).toFixed(durationNano >= 10_000_000_000 ? 1 : 2)}s`
  }
  if (durationNano >= 1_000_000) {
    return `${(durationNano / 1_000_000).toFixed(durationNano >= 100_000_000 ? 0 : 1)}ms`
  }
  if (durationNano >= 1_000) {
    return `${(durationNano / 1_000).toFixed(durationNano >= 100_000 ? 0 : 1)}us`
  }
  return `${durationNano}ns`
}

function formatStart(unixNanoTimestamp: number): string {
  return new Date(Math.floor(unixNanoTimestamp / 1_000_000)).toLocaleTimeString()
}

async function loadServices() {
  if (isClickHouseDatasource.value) {
    services.value = []
    selectedService.value = ''
    return
  }

  if (!selectedDatasourceId.value) {
    services.value = []
    selectedService.value = ''
    return
  }

  loadingServices.value = true
  try {
    services.value = await fetchDataSourceTraceServices(selectedDatasourceId.value)
    if (selectedService.value && !services.value.includes(selectedService.value)) {
      selectedService.value = ''
    }
  } catch {
    services.value = []
  } finally {
    loadingServices.value = false
  }
}

async function runSearch() {
  if (!selectedDatasourceId.value) {
    error.value = 'Select a tracing datasource'
    return
  }

  if (isClickHouseDatasource.value) {
    await runClickHouseTraceQuery()
    return
  }

  hasSearched.value = true
  loadingSearch.value = true
  error.value = null

  try {
    let start: number
    let end: number

    const isCustom = isCustomRange?.value ?? true
    if (isCustom) {
      start = Math.floor(timeRange.value.start / 1000)
      end = Math.floor(timeRange.value.end / 1000)
    } else {
      const windowDurationSeconds = Math.max(
        1,
        Math.floor((timeRange.value.end - timeRange.value.start) / 1000),
      )
      end = Math.floor(Date.now() / 1000)
      start = end - windowDurationSeconds
    }

    traceSummaries.value = await searchDataSourceTraces(selectedDatasourceId.value, {
      query: query.value.trim() || undefined,
      service: selectedService.value || undefined,
      start,
      end,
      limit: limit.value,
    })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to search traces'
    traceSummaries.value = []
  } finally {
    loadingSearch.value = false
  }
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
      const value = byNormalizedName[normalizedKey]!.trim()
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
  const traceIdFromTags = getTagValue(span.tags, ['traceId', 'trace_id', 'traceid', 'otelTraceId', 'trace'])
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
    const rootSpan = [...group.spans]
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

async function runClickHouseTraceQuery() {
  if (!query.value.trim()) {
    error.value = 'Query is required'
    return
  }

  hasSearched.value = true
  loadingSearch.value = true
  error.value = null
  activeTrace.value = null
  activeServiceGraph.value = null
  serviceGraphError.value = null
  selectedTraceId.value = ''
  selectedSpan.value = null

  try {
    const start = Math.floor(timeRange.value.start / 1000)
    const end = Math.floor(timeRange.value.end / 1000)

    const response = await queryDataSource(selectedDatasourceId.value, {
      query: query.value,
      signal: 'traces',
      start,
      end,
      step: 15,
      limit: limit.value,
    })

    if (response.status === 'error') {
      error.value = response.error || 'Query failed'
      traceSummaries.value = []
      return
    }

    if (response.resultType !== 'traces') {
      error.value = 'Selected datasource did not return trace results'
      traceSummaries.value = []
      return
    }

    traceSummaries.value = convertClickHouseSpansToTraceSummaries(response.data?.traces || [])
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to query traces'
    traceSummaries.value = []
  } finally {
    loadingSearch.value = false
  }
}

async function loadTrace(traceId: string) {
  if (isClickHouseDatasource.value) {
    error.value = 'Trace detail lookup is not available for ClickHouse SQL results yet'
    return
  }

  if (!selectedDatasourceId.value) {
    error.value = 'Select a tracing datasource'
    return
  }

  loadingTrace.value = true
  error.value = null
  try {
    activeTrace.value = await fetchDataSourceTrace(selectedDatasourceId.value, traceId)
    loadingServiceGraph.value = true
    serviceGraphError.value = null
    try {
      activeServiceGraph.value = await fetchDataSourceTraceServiceGraph(selectedDatasourceId.value, traceId)
    } catch (graphError) {
      activeServiceGraph.value = null
      serviceGraphError.value = graphError instanceof Error
        ? graphError.message
        : 'Failed to fetch trace service graph'
    } finally {
      loadingServiceGraph.value = false
    }

    selectedTraceId.value = traceId
    selectedSpan.value = null
    traceIdInput.value = traceId
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to fetch trace'
    activeTrace.value = null
    activeServiceGraph.value = null
    serviceGraphError.value = null
    loadingServiceGraph.value = false
  } finally {
    loadingTrace.value = false
  }
}

async function lookupTraceById() {
  if (isClickHouseDatasource.value) {
    error.value = 'Open Trace ID is not available for ClickHouse SQL results yet'
    return
  }

  const traceId = traceIdInput.value.trim()
  if (!traceId) {
    error.value = 'Trace ID is required'
    return
  }

  await loadTrace(traceId)
}

function handleSelectSpan(span: TraceSpan) {
  selectedSpan.value = span
}

function handleSelectServiceFromGraph(serviceName: string) {
  if (!serviceName) {
    return
  }

  selectedService.value = serviceName
  void runSearch()
}

function handleSelectEdgeFromGraph(edge: { source: string, target: string }) {
  if (!edge.target) {
    return
  }

  selectedService.value = edge.target
  query.value = `caller.service=${edge.source} callee.service=${edge.target}`
  void runSearch()
}

function toMilliseconds(unixNanoTimestamp: number): number {
  return Math.floor(unixNanoTimestamp / 1_000_000)
}

function buildNavigationWindow(payload: {
  startTimeUnixNano: number
  endTimeUnixNano: number
}): { startMs: number, endMs: number } {
  const startMs = toMilliseconds(payload.startTimeUnixNano)
  const endMs = toMilliseconds(payload.endTimeUnixNano)
  const paddedStartMs = Math.max(0, startMs - TRACE_TO_X_PADDING_MS)
  const paddedEndMs = Math.max(paddedStartMs + 1_000, endMs + TRACE_TO_X_PADDING_MS)
  return {
    startMs: paddedStartMs,
    endMs: paddedEndMs,
  }
}

function openTraceLogs(payload: {
  traceId: string
  serviceName: string
  startTimeUnixNano: number
  endTimeUnixNano: number
}) {
  const { startMs, endMs } = buildNavigationWindow(payload)
  const navigationContext: TraceLogsNavigationContext = {
    traceId: payload.traceId,
    serviceName: payload.serviceName || undefined,
    startMs,
    endMs,
    createdAt: Date.now(),
  }

  try {
    localStorage.setItem(TRACE_LOGS_NAVIGATION_CONTEXT_KEY, JSON.stringify(navigationContext))
  } catch {
    // Ignore localStorage write issues; navigation still works.
  }

  router.push('/app/explore/logs')
}

function openServiceMetrics(payload: {
  serviceName: string
  startTimeUnixNano: number
  endTimeUnixNano: number
}) {
  const { startMs, endMs } = buildNavigationWindow(payload)
  const navigationContext: TraceMetricsNavigationContext = {
    serviceName: payload.serviceName || undefined,
    startMs,
    endMs,
    createdAt: Date.now(),
  }

  try {
    localStorage.setItem(TRACE_METRICS_NAVIGATION_CONTEXT_KEY, JSON.stringify(navigationContext))
  } catch {
    // Ignore localStorage write issues; navigation still works.
  }

  router.push('/app/explore/metrics')
}

function consumeTraceNavigationContext() {
  let rawContext: string | null = null
  try {
    rawContext = localStorage.getItem(TRACE_NAVIGATION_CONTEXT_KEY)
    localStorage.removeItem(TRACE_NAVIGATION_CONTEXT_KEY)
  } catch {
    return
  }

  if (!rawContext) {
    return
  }

  try {
    const parsed = JSON.parse(rawContext) as TraceNavigationContext
    if (!parsed.traceId || typeof parsed.traceId !== 'string') {
      return
    }

    if (typeof parsed.createdAt === 'number') {
      const ageMs = Date.now() - parsed.createdAt
      if (ageMs > TRACE_NAVIGATION_MAX_AGE_MS) {
        return
      }
    }

    pendingTraceId.value = parsed.traceId.trim()
    pendingTraceDatasourceId.value = typeof parsed.datasourceId === 'string'
      ? parsed.datasourceId.trim()
      : ''
  } catch {
    // Ignore malformed navigation context.
  }
}

async function tryLoadPendingTrace() {
  if (!pendingTraceId.value || !selectedDatasourceId.value) {
    return
  }

  if (pendingTraceDatasourceId.value && pendingTraceDatasourceId.value !== selectedDatasourceId.value) {
    return
  }

  const traceId = pendingTraceId.value
  pendingTraceId.value = ''
  pendingTraceDatasourceId.value = ''
  traceIdInput.value = traceId
  await loadTrace(traceId)
}

watch(
  tracingDatasources,
  (sources) => {
    if (sources.length === 0) {
      selectedDatasourceId.value = ''
      return
    }

    const hasSelected = sources.some((ds) => ds.id === selectedDatasourceId.value)
    if (!hasSelected) {
      const pendingDatasource = pendingTraceDatasourceId.value
        ? sources.find((ds) => ds.id === pendingTraceDatasourceId.value)
        : null

      if (pendingDatasource) {
        selectedDatasourceId.value = pendingDatasource.id
        return
      }

      const defaultDatasource = sources.find((ds) => ds.is_default)
      selectedDatasourceId.value = defaultDatasource?.id || sources[0]!.id
    }
  },
  { immediate: true },
)

watch(
  () => currentOrg.value?.id,
  (orgId, previousOrgId) => {
    if (orgId && orgId !== previousOrgId) {
      fetchDatasources(orgId)
    }
  },
)

watch(
  selectedDatasourceId,
  async () => {
    traceSummaries.value = []
    activeTrace.value = null
    activeServiceGraph.value = null
    serviceGraphError.value = null
    loadingServiceGraph.value = false
    selectedTraceId.value = ''
    selectedSpan.value = null
    hasSearched.value = false

    await loadServices()
    if (!isClickHouseDatasource.value) {
      await tryLoadPendingTrace()
    }
  },
  { immediate: true },
)

async function handleOpenTraceFromList(traceId: string) {
  if (isClickHouseDatasource.value) {
    error.value = 'Trace detail lookup is not available for ClickHouse SQL results yet'
    return
  }

  await loadTrace(traceId)
}

onMounted(() => {
  consumeTraceNavigationContext()
  void tryLoadPendingTrace()
  document.addEventListener('click', handleDocumentClick)
  if (typeof onRefresh === 'function') {
    unsubscribeRefresh = onRefresh(() => {
      if (
        hasSearched.value
        && selectedDatasourceId.value
        && !loadingSearch.value
        && !loadingTrace.value
      ) {
        void runSearch()
      }
    })
  }
  if (currentOrg.value) {
    fetchDatasources(currentOrg.value.id)
  }
})

onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClick)
  if (unsubscribeRefresh) {
    unsubscribeRefresh()
  }
})
</script>

<template>
  <div class="flex flex-col py-5 px-6 max-w-[1400px] mx-auto max-md:p-[0.9rem]">
    <header class="flex justify-between items-center gap-4 mb-4 p-4 border border-border rounded-[14px] bg-surface-1 shadow-sm">
      <div class="flex items-center gap-3">
        <h1>Explore</h1>
        <span class="mode-badge">Tracing</span>
      </div>
    </header>

    <div class="flex flex-col gap-4">
      <div class="bg-surface-1 border border-border rounded-[14px] p-5 shadow-sm flex flex-col gap-4">
        <div class="query-context-row">
          <div class="datasource-row">
            <label>Data Source</label>
            <div ref="datasourceMenuRef" class="datasource-selector">
              <button
                type="button"
                class="active-datasource-panel datasource-trigger"
                :disabled="!hasTracingDatasources"
                @click="toggleDatasourceMenu"
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
                </template>
                <span v-else class="active-datasource-empty">No tracing datasource configured</span>
                <component
                  :is="showDatasourceMenu ? ChevronUp : ChevronDown"
                  :size="16"
                  class="datasource-chevron"
                />
              </button>

              <div v-if="showDatasourceMenu && hasTracingDatasources" class="datasource-dropdown">
                <button
                  v-for="ds in tracingDatasources"
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
            <label>Search Range</label>
            <TimeRangePicker stacked />
          </div>
        </div>

        <div class="search-filters-row">
          <template v-if="!isClickHouseDatasource">
            <label class="filter-field">
              <span>Service</span>
              <select v-model="selectedService" :disabled="loadingServices || services.length === 0">
                <option value="">All services</option>
                <option v-for="service in services" :key="service" :value="service">{{ service }}</option>
              </select>
            </label>

            <label class="filter-field limit-field">
              <span>Limit</span>
              <select v-model.number="limit">
                <option :value="10">10</option>
                <option :value="20">20</option>
                <option :value="50">50</option>
                <option :value="100">100</option>
              </select>
            </label>
          </template>

          <template v-else>
            <ClickHouseSQLEditor
              v-model="query"
              signal="traces"
              :disabled="loadingSearch || !selectedDatasourceId"
            />
          </template>
        </div>

        <div v-if="!isClickHouseDatasource" class="search-query-row">
          <label for="trace-search-query" class="query-label">Search Query</label>
          <input
            id="trace-search-query"
            v-model="query"
            type="text"
            class="query-input"
            placeholder="service.name=api error=true"
          />
        </div>

        <div class="query-actions">
          <button
            class="btn btn-search"
            :disabled="loadingSearch || !selectedDatasourceId || (isClickHouseDatasource && !query.trim())"
            @click="runSearch"
          >
            <Loader2 v-if="loadingSearch" :size="16" class="icon-spin" />
            <Search v-else :size="16" />
            <span>{{ loadingSearch ? 'Searching...' : (isClickHouseDatasource ? 'Run Query' : 'Search Traces') }}</span>
          </button>
        </div>

        <div v-if="!isClickHouseDatasource" class="trace-lookup-row">
          <label for="trace-id-input">Open Trace ID</label>
          <div class="trace-lookup-input-wrap">
            <input
              id="trace-id-input"
              v-model="traceIdInput"
              type="text"
              placeholder="Paste trace id"
              class="trace-id-input"
            />
            <button
              class="btn btn-find-trace"
              :disabled="loadingTrace || !selectedDatasourceId || !traceIdInput.trim()"
              @click="lookupTraceById"
            >
              <Loader2 v-if="loadingTrace" :size="15" class="icon-spin" />
              <Waypoints v-else :size="15" />
              <span>{{ loadingTrace ? 'Loading...' : 'Open Trace' }}</span>
            </button>
          </div>
        </div>

        <div v-if="error" class="query-error">
          <AlertCircle :size="16" />
          <span>{{ error }}</span>
        </div>
      </div>

      <div class="bg-surface-1 border border-border rounded-[14px] p-5 shadow-sm min-h-[300px]">
        <div v-if="!hasTracingDatasources" class="flex flex-col items-center justify-center p-12 text-center text-text-1">
          <p>No tracing datasource configured.</p>
          <p class="hint-text">Add a Tempo, VictoriaTraces, or ClickHouse datasource in Data Sources.</p>
        </div>

        <div v-else-if="isClickHouseDatasource" class="clickhouse-results-layout">
          <div v-if="loadingSearch" class="flex flex-col items-center justify-center p-12 gap-4 text-text-1">
            <Loader2 :size="18" class="icon-spin" />
            <span>Executing trace SQL...</span>
          </div>

          <div v-else-if="traceSummaries.length > 0" class="clickhouse-trace-list">
            <TraceListPanel :traces="traceSummaries" @open-trace="handleOpenTraceFromList" />
          </div>

          <div v-else class="flex flex-col items-center justify-center p-12 text-center text-text-1">
            <p>Run a ClickHouse SQL query to inspect traces.</p>
            <p class="hint-text">Expected columns include span_id, operation_name, service_name, start_time_unix_nano, and duration_nano.</p>
          </div>
        </div>

        <div v-else class="trace-layout">
          <aside class="trace-results-panel">
            <div class="panel-header">
              <h2>Matching traces</h2>
              <span>{{ traceSummaries.length }} result{{ traceSummaries.length === 1 ? '' : 's' }}</span>
            </div>

            <div v-if="loadingSearch" class="loading-state compact">
              <Loader2 :size="16" class="icon-spin" />
              <span>Searching traces...</span>
            </div>

            <div v-else-if="traceSummaries.length > 0" class="trace-result-list">
              <button
                v-for="summary in traceSummaries"
                :key="summary.traceId"
                class="trace-result-row"
                :class="{ active: selectedTraceId === summary.traceId }"
                @click="loadTrace(summary.traceId)"
              >
                <code class="trace-id">{{ summary.traceId }}</code>
                <div class="trace-meta-grid">
                  <span>{{ summary.rootServiceName || 'unknown service' }}</span>
                  <span>{{ formatDurationNano(summary.durationNano) }}</span>
                  <span>{{ summary.spanCount }} spans</span>
                  <span :class="{ error: summary.errorSpanCount > 0 }">{{ summary.errorSpanCount }} errors</span>
                </div>
                <span class="trace-start">{{ formatStart(summary.startTimeUnixNano) }}</span>
              </button>
            </div>

            <div v-else class="empty-traces">
              Run a trace search or open a trace ID directly.
            </div>
          </aside>

          <section class="timeline-panel">
            <div class="panel-header">
              <h2>Timeline waterfall</h2>
              <span v-if="activeTrace">{{ activeTrace.spans.length }} spans</span>
            </div>

            <div v-if="loadingTrace" class="flex flex-col items-center justify-center p-12 gap-4 text-text-1">
              <Loader2 :size="18" class="icon-spin" />
              <span>Loading trace...</span>
            </div>

            <div v-else-if="activeTrace" class="timeline-content">
              <div class="trace-summary-bar">
                <code>{{ activeTrace.traceId }}</code>
                <span>{{ formatDurationNano(activeTrace.durationNano) }}</span>
                <span>{{ activeTrace.services.length }} services</span>
              </div>

              <div class="service-graph-panel">
                <div class="service-graph-header">
                  <h3>Service dependency graph</h3>
                  <span v-if="activeServiceGraph">{{ activeServiceGraph.edges.length }} edges</span>
                </div>

                <div v-if="loadingServiceGraph" class="loading-state compact">
                  <Loader2 :size="16" class="icon-spin" />
                  <span>Loading service graph...</span>
                </div>

                <div v-else-if="serviceGraphError" class="service-graph-error">
                  <AlertCircle :size="14" />
                  <span>{{ serviceGraphError }}</span>
                </div>

                <TraceServiceGraph
                  v-else-if="activeServiceGraph && activeServiceGraph.nodes.length > 0"
                  :graph="activeServiceGraph"
                  @select-service="handleSelectServiceFromGraph"
                  @select-edge="handleSelectEdgeFromGraph"
                />

                <div v-else class="service-graph-empty">
                  Not enough trace data to render service dependencies.
                </div>
              </div>

              <div class="trace-detail-layout">
                <div class="timeline-main-pane">
                  <TraceTimeline
                    :trace="activeTrace"
                    :selected-span-id="selectedSpan?.spanId || null"
                    @select-span="handleSelectSpan"
                  />
                </div>

                <TraceSpanDetailsPanel
                  v-if="selectedSpan"
                  :trace="activeTrace"
                  :span="selectedSpan"
                  @select-span="handleSelectSpan"
                  @open-trace-logs="openTraceLogs"
                  @open-service-metrics="openServiceMetrics"
                />

                <aside v-else class="span-selection-placeholder">
                  <h3>Span details</h3>
                  <p>Select a span in the timeline to inspect attributes, logs, and relationships.</p>
                </aside>
              </div>
            </div>

            <div v-else class="flex flex-col items-center justify-center p-12 text-center text-text-1">
              <p>Select a trace result to view the waterfall timeline.</p>
              <p class="hint-text">You can search by service/time range or open a known trace ID.</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.explore-page {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  padding: 1.25rem 1.8rem;
}

.explore-header {
  display: flex;
  align-items: center;
  margin-bottom: 1rem;
  padding: 0.95rem 1.15rem;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: var(--color-surface-1);
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
  font-family: var(--font-family-mono);
  color: var(--color-text-0);
  margin: 0;
}

.mode-badge {
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
  border: 1px solid rgba(217, 119, 6, 0.38);
  background: rgba(217, 119, 6, 0.14);
  color: #FCD34D;
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
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
  background: var(--color-surface-1);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  box-shadow: var(--shadow-sm);
}

.query-context-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 1rem;
  align-items: end;
}

.datasource-row,
.query-time-controls,
.search-query-row,
.trace-lookup-row {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.datasource-row label,
.query-time-controls label,
.search-query-row .query-label,
.trace-lookup-row label,
.filter-field span {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-text-1);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.active-datasource-panel {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0.75rem;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-2);
}

.datasource-selector {
  position: relative;
}

.datasource-trigger {
  width: 100%;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.2s, background-color 0.2s;
}

.datasource-trigger:hover:not(:disabled) {
  border-color: var(--color-border-strong);
  background: var(--color-bg-hover);
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
  color: var(--color-text-2);
}

.active-datasource-name {
  font-size: 0.86rem;
  font-weight: 600;
  color: var(--color-text-0);
}

.active-datasource-type {
  font-size: 0.75rem;
  color: var(--color-text-1);
}

.active-datasource-empty {
  color: var(--color-text-2);
  font-size: 0.85rem;
}

.datasource-chevron {
  margin-left: auto;
  color: var(--color-text-2);
  flex-shrink: 0;
}

.datasource-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  background: rgba(11, 21, 33, 0.98);
  border: 1px solid var(--color-border);
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
  color: var(--color-text-0);
  cursor: pointer;
}

.datasource-option:hover {
  background: var(--color-bg-hover);
}

.datasource-option.selected {
  background: rgba(245, 158, 11, 0.14);
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
  color: var(--color-text-0);
}

.datasource-option-meta span {
  font-size: 0.75rem;
  color: var(--color-text-1);
}

.datasource-option-check {
  margin-left: auto;
  color: var(--color-accent);
}

.search-filters-row {
  display: flex;
  gap: 0.8rem;
  flex-wrap: wrap;
}

.filter-field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 180px;
}

.limit-field {
  min-width: 110px;
}

.filter-field select,
.query-input,
.trace-id-input {
  border: 1px solid var(--color-border);
  background: rgba(12, 21, 34, 0.85);
  color: var(--color-text-0);
  border-radius: 10px;
  font-size: 0.86rem;
  padding: 0.62rem 0.72rem;
}

.trace-lookup-input-wrap {
  display: flex;
  gap: 0.6rem;
}

.trace-id-input {
  flex: 1;
}

.query-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  border-radius: 10px;
  border: 1px solid transparent;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 500;
  padding: 0.62rem 1.1rem;
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.btn-search {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: #051625;
}

.btn-find-trace {
  background: rgba(245, 158, 11, 0.16);
  border-color: rgba(245, 158, 11, 0.28);
  color: #ccefff;
}

.query-error {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: rgba(251, 113, 133, 0.1);
  border: 1px solid rgba(251, 113, 133, 0.3);
  border-radius: 8px;
  color: var(--color-danger);
  font-size: 0.875rem;
}

.results-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--color-surface-1);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  min-height: 440px;
  box-shadow: var(--shadow-sm);
}

.trace-layout {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  min-height: 460px;
  flex: 1;
}

.clickhouse-results-layout {
  display: flex;
  flex: 1;
  min-height: 420px;
}

.clickhouse-trace-list {
  flex: 1;
  min-height: 0;
  padding: 0.8rem;
}

.trace-results-panel {
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
}

.timeline-panel {
  display: flex;
  flex-direction: column;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.85rem 1rem;
  border-bottom: 1px solid var(--color-border);
  background: rgba(15, 24, 39, 0.85);
}

.panel-header h2 {
  margin: 0;
  font-size: 0.86rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-0);
}

.panel-header span {
  font-size: 0.74rem;
  color: var(--color-text-2);
}

.trace-result-list {
  overflow-y: auto;
  padding: 0.45rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.trace-result-row {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  text-align: left;
  padding: 0.7rem;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: rgba(14, 22, 36, 0.8);
  color: var(--color-text-0);
  cursor: pointer;
}

.trace-result-row:hover {
  border-color: rgba(245, 158, 11, 0.42);
  background: rgba(18, 29, 45, 0.9);
}

.trace-result-row.active {
  border-color: rgba(245, 158, 11, 0.52);
  background: rgba(245, 158, 11, 0.12);
}

.trace-id {
  font-size: 0.75rem;
  color: #bae6fd;
  word-break: break-all;
  font-family: var(--font-family-mono);
}

.trace-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.25rem 0.5rem;
  font-size: 0.74rem;
  color: var(--color-text-1);
}

.trace-meta-grid .error {
  color: #fb7185;
}

.trace-start {
  font-size: 0.7rem;
  color: var(--color-text-2);
}

.timeline-content {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 0.9rem;
}

.trace-detail-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 0.85rem;
  align-items: start;
}

.timeline-main-pane {
  min-width: 0;
}

.span-selection-placeholder {
  border: 1px dashed rgba(71, 85, 105, 0.55);
  border-radius: 12px;
  background: rgba(12, 21, 33, 0.75);
  padding: 0.85rem;
  color: var(--color-text-1);
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.span-selection-placeholder h3 {
  margin: 0;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--color-text-2);
}

.span-selection-placeholder p {
  margin: 0;
  font-size: 0.8rem;
}

.trace-summary-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 0.55rem 0.65rem;
  background: rgba(12, 20, 32, 0.82);
}

.trace-summary-bar code {
  font-size: 0.76rem;
  color: #bae6fd;
  font-family: var(--font-family-mono);
}

.trace-summary-bar span {
  font-size: 0.74rem;
  color: var(--color-text-1);
}

.service-graph-panel {
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: rgba(10, 18, 30, 0.7);
  padding: 0.7rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.service-graph-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.service-graph-header h3 {
  margin: 0;
  font-size: 0.76rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-text-2);
}

.service-graph-header span {
  font-size: 0.72rem;
  color: var(--color-text-1);
}

.service-graph-error,
.service-graph-empty {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border-radius: 10px;
  border: 1px dashed rgba(71, 85, 105, 0.55);
  background: rgba(12, 21, 33, 0.65);
  padding: 0.7rem;
  font-size: 0.8rem;
  color: var(--color-text-1);
}

.service-graph-error {
  border-color: rgba(251, 113, 133, 0.34);
  color: #fda4af;
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  color: var(--color-text-1);
  padding: 2rem;
  flex: 1;
}

.loading-state.compact {
  padding: 1.2rem;
}

.empty-state,
.empty-traces {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 2rem;
  text-align: center;
  color: var(--color-text-1);
  flex: 1;
}

.hint-text {
  font-size: 0.8rem;
  color: var(--color-text-2);
}

.icon-spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1100px) {
  .trace-layout {
    grid-template-columns: 1fr;
  }

  .trace-results-panel {
    border-right: none;
    border-bottom: 1px solid var(--color-border);
    max-height: 320px;
  }
}

@media (max-width: 900px) {
  .explore-page {
    padding: 0.9rem;
  }

  .trace-detail-layout {
    grid-template-columns: 1fr;
  }

  .query-context-row {
    grid-template-columns: 1fr;
  }

  .trace-lookup-input-wrap {
    flex-direction: column;
  }
}
</style>
