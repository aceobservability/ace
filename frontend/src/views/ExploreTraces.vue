<script setup lang="ts">
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  HeartPulse,
  Loader2,
  Search,
  Sparkles,
  Waypoints,
} from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  fetchDataSourceTrace,
  fetchDataSourceTraceServiceGraph,
  fetchDataSourceTraceServices,
  queryDataSource,
  searchDataSourceTraces,
} from '../api/datasources'
import alertmanagerLogo from '../assets/datasources/alertmanager-logo.svg'
import clickhouseLogo from '../assets/datasources/clickhouse-logo.svg'
import cloudwatchLogo from '../assets/datasources/cloudwatch-logo.svg'
import elasticsearchLogo from '../assets/datasources/elasticsearch-logo.svg'
import lokiLogo from '../assets/datasources/loki-logo.svg'
import prometheusLogo from '../assets/datasources/prometheus-logo.svg'
import tempoLogo from '../assets/datasources/tempo-logo.svg'
import victoriaLogsLogo from '../assets/datasources/victorialogs-logo.svg'
import victoriaMetricsLogo from '../assets/datasources/victoriametrics-logo.svg'
import victoriaTracesLogo from '../assets/datasources/victoriatraces-logo.svg'
import vmalertLogo from '../assets/datasources/vmalert-logo.svg'
import ClickHouseSQLEditor from '../components/ClickHouseSQLEditor.vue'
import CopilotPanel from '../components/CopilotPanel.vue'
import TimeRangePicker from '../components/TimeRangePicker.vue'
import TraceListPanel from '../components/TraceListPanel.vue'
import TraceServiceGraph from '../components/TraceServiceGraph.vue'
import TraceSpanDetailsPanel from '../components/TraceSpanDetailsPanel.vue'
import TraceTimeline from '../components/TraceTimeline.vue'
import { useDatasource } from '../composables/useDatasource'
import { useOrganization } from '../composables/useOrganization'
import { useTimeRange } from '../composables/useTimeRange'
import type {
  DataSourceType,
  Trace,
  TraceServiceGraph as TraceServiceGraphModel,
  TraceSpan,
  TraceSummary,
} from '../types/datasource'
import { dataSourceTypeLabels } from '../types/datasource'

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

const route = useRoute()
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
  vmalert: vmalertLogo,
  alertmanager: alertmanagerLogo,
}

type DatasourceHealthStatus = 'unknown' | 'checking' | 'healthy' | 'unhealthy'

// Copilot
const showCopilot = ref(false)

const selectedDatasourceId = ref('')
const showDatasourceMenu = ref(false)
const datasourceMenuRef = ref<HTMLElement | null>(null)
const datasourceHealth = ref<Record<string, DatasourceHealthStatus>>({})
const datasourceHealthErrors = ref<Record<string, string>>({})


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

async function checkDatasourceHealth(datasourceId: string, type_: DataSourceType) {
  datasourceHealth.value[datasourceId] = 'checking'
  delete datasourceHealthErrors.value[datasourceId]

  try {
    if (type_ === 'clickhouse') {
      const end = Math.floor(Date.now() / 1000)
      const start = end - 15 * 60
      const healthResult = await queryDataSource(datasourceId, {
        query: "SELECT now() AS timestamp, 'up' AS status LIMIT 1",
        signal: 'traces',
        start,
        end,
        step: 15,
        limit: 1,
      })

      if (healthResult.status === 'error') {
        throw new Error(healthResult.error || 'Health check failed')
      }
    } else {
      await fetchDataSourceTraceServices(datasourceId)
    }

    datasourceHealth.value[datasourceId] = 'healthy'
  } catch (e) {
    datasourceHealth.value[datasourceId] = 'unhealthy'
    datasourceHealthErrors.value[datasourceId] =
      e instanceof Error ? e.message : 'Health check failed'
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
      activeServiceGraph.value = await fetchDataSourceTraceServiceGraph(
        selectedDatasourceId.value,
        traceId,
      )
    } catch (graphError) {
      activeServiceGraph.value = null
      serviceGraphError.value =
        graphError instanceof Error ? graphError.message : 'Failed to fetch trace service graph'
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

function handleSelectEdgeFromGraph(edge: { source: string; target: string }) {
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

function buildNavigationWindow(payload: { startTimeUnixNano: number; endTimeUnixNano: number }): {
  startMs: number
  endMs: number
} {
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

  router.push('/explore/logs')
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

  router.push('/explore/metrics')
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
    pendingTraceDatasourceId.value =
      typeof parsed.datasourceId === 'string' ? parsed.datasourceId.trim() : ''
  } catch {
    // Ignore malformed navigation context.
  }
}

async function tryLoadPendingTrace() {
  if (!pendingTraceId.value || !selectedDatasourceId.value) {
    return
  }

  if (
    pendingTraceDatasourceId.value &&
    pendingTraceDatasourceId.value !== selectedDatasourceId.value
  ) {
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
      selectedDatasourceId.value = defaultDatasource?.id || sources[0].id
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
  activeDatasource,
  (datasource) => {
    if (!datasource) {
      return
    }

    if ((datasourceHealth.value[datasource.id] || 'unknown') === 'unknown') {
      checkDatasourceHealth(datasource.id, datasource.type)
    }
  },
  { immediate: true },
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
  const queryTraceId = route.query.traceId
  const queryDatasourceId = route.query.datasourceId
  if (queryTraceId && typeof queryTraceId === 'string') {
    pendingTraceId.value = queryTraceId
    traceIdInput.value = queryTraceId
  }
  if (queryDatasourceId && typeof queryDatasourceId === 'string') {
    pendingTraceDatasourceId.value = queryDatasourceId
  }

  consumeTraceNavigationContext()
  void tryLoadPendingTrace()
  document.addEventListener('click', handleDocumentClick)
  if (typeof onRefresh === 'function') {
    unsubscribeRefresh = onRefresh(() => {
      if (
        hasSearched.value &&
        selectedDatasourceId.value &&
        !loadingSearch.value &&
        !loadingTrace.value
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
  <div class="flex min-h-full">
    <div class="flex flex-col flex-1 min-w-0 px-8 py-6 max-md:px-4 max-md:py-4">
    <!-- Page header -->
    <header class="flex items-center justify-between mb-6">
      <div class="flex items-center flex-wrap gap-3">
        <h1 class="text-2xl font-bold text-text-primary m-0">Explore</h1>
        <span class="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-emerald-700">Tracing</span>
      </div>
      <button
        class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold cursor-pointer transition hover:bg-amber-50 hover:border-amber-300"
        :class="showCopilot ? 'text-amber-600 border-amber-300 bg-amber-50' : 'text-slate-600'"
        @click="showCopilot = !showCopilot"
        title="Toggle AI assistant"
      >
        <Sparkles :size="14" />
        AI
      </button>
    </header>

    <div class="flex flex-col gap-6 flex-1">
      <!-- Query / filter section -->
      <div class="flex flex-col gap-4 rounded-xl border border-border bg-surface-raised p-4">
        <!-- Datasource + time range row -->
        <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-4 items-end max-md:grid-cols-1">
          <div class="flex flex-col gap-2.5">
            <label class="text-xs font-semibold uppercase tracking-wide text-slate-500">Data Source</label>
            <div ref="datasourceMenuRef" class="relative">
              <button
                type="button"
                class="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left cursor-pointer transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
                :disabled="!hasTracingDatasources"
                @click="toggleDatasourceMenu"
              >
                <template v-if="activeDatasource">
                  <img
                    :src="getTypeLogo(activeDatasource.type)"
                    :alt="`${dataSourceTypeLabels[activeDatasource.type]} logo`"
                    class="h-7 w-7 shrink-0 object-contain"
                  />
                  <div class="flex flex-col min-w-0 gap-px">
                    <span class="text-[0.68rem] uppercase tracking-wide text-slate-400">Active Source</span>
                    <strong class="text-sm font-semibold text-slate-900 truncate">{{ activeDatasource.name }}</strong>
                    <span class="text-xs text-slate-500">{{ dataSourceTypeLabels[activeDatasource.type] }}</span>
                  </div>
                  <span
                    class="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs border"
                    :class="{
                      'border-slate-200 text-slate-500': activeDatasourceHealth === 'checking' || activeDatasourceHealth === 'unknown',
                      'border-emerald-200 bg-emerald-50 text-emerald-700': activeDatasourceHealth === 'healthy',
                      'border-rose-200 bg-rose-50 text-rose-700': activeDatasourceHealth === 'unhealthy',
                    }"
                    :title="activeDatasourceHealthError || activeDatasourceHealthLabel"
                  >
                    <Loader2 v-if="activeDatasourceHealth === 'checking'" :size="12" class="animate-spin" />
                    <HeartPulse v-else-if="activeDatasourceHealth === 'healthy'" :size="12" />
                    <CircleAlert v-else-if="activeDatasourceHealth === 'unhealthy'" :size="12" />
                    <span>{{ activeDatasourceHealthLabel }}</span>
                  </span>
                </template>
                <span v-else class="text-sm text-slate-400">No tracing datasource configured</span>
                <component
                  :is="showDatasourceMenu ? ChevronUp : ChevronDown"
                  :size="16"
                  class="ml-1 shrink-0 text-slate-400"
                />
              </button>

              <div v-if="showDatasourceMenu && hasTracingDatasources" class="absolute left-0 right-0 top-full mt-1.5 z-[110] max-h-[280px] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                <button
                  v-for="ds in tracingDatasources"
                  :key="ds.id"
                  type="button"
                  class="flex w-full items-center gap-2.5 border-none bg-transparent px-3 py-2.5 text-left text-slate-900 cursor-pointer hover:bg-slate-50"
                  :class="{ 'bg-emerald-50': ds.id === selectedDatasourceId }"
                  @click="selectDatasource(ds.id)"
                >
                  <img
                    :src="getTypeLogo(ds.type)"
                    :alt="`${dataSourceTypeLabels[ds.type]} logo`"
                    class="h-[18px] w-[18px] shrink-0 object-contain"
                  />
                  <div class="flex min-w-0 flex-col gap-px">
                    <strong class="text-sm font-semibold text-slate-900">{{ ds.name }}</strong>
                    <span class="text-xs text-slate-500">{{ dataSourceTypeLabels[ds.type] }}</span>
                  </div>
                  <Check v-if="ds.id === selectedDatasourceId" :size="14" class="ml-auto text-emerald-600" />
                </button>
              </div>
            </div>
          </div>

          <div class="flex flex-col gap-2.5">
            <label class="text-xs font-semibold uppercase tracking-wide text-slate-500">Search Range</label>
            <TimeRangePicker stacked />
          </div>
        </div>

        <!-- Filters row (service / limit or ClickHouse editor) -->
        <div class="flex flex-wrap gap-3">
          <template v-if="!isClickHouseDatasource">
            <label class="flex flex-col gap-2 min-w-[180px]">
              <span class="text-xs font-medium text-slate-500">Service</span>
              <select
                v-model="selectedService"
                :disabled="loadingServices || services.length === 0"
                class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">All services</option>
                <option v-for="service in services" :key="service" :value="service">{{ service }}</option>
              </select>
            </label>

            <label class="flex flex-col gap-2 min-w-[110px]">
              <span class="text-xs font-medium text-slate-500">Limit</span>
              <select
                v-model.number="limit"
                class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              >
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

        <!-- Search query input (non-ClickHouse) -->
        <div v-if="!isClickHouseDatasource" class="flex flex-col gap-2">
          <label for="trace-search-query" class="text-xs font-medium text-slate-500">Search Query</label>
          <input
            id="trace-search-query"
            v-model="query"
            type="text"
            class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
            placeholder="service.name=api error=true"
          />
        </div>

        <!-- Search button -->
        <div class="flex items-center gap-4">
          <button
            class="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            :disabled="loadingSearch || !selectedDatasourceId || (isClickHouseDatasource && !query.trim())"
            @click="runSearch"
          >
            <Loader2 v-if="loadingSearch" :size="16" class="animate-spin" />
            <Search v-else :size="16" />
            <span>{{ loadingSearch ? 'Searching...' : (isClickHouseDatasource ? 'Run Query' : 'Search Traces') }}</span>
          </button>
        </div>

        <!-- Open Trace ID row (non-ClickHouse) -->
        <div v-if="!isClickHouseDatasource" class="flex flex-col gap-2">
          <label for="trace-id-input" class="text-xs font-medium text-slate-500">Open Trace ID</label>
          <div class="flex gap-2.5 max-md:flex-col">
            <input
              id="trace-id-input"
              v-model="traceIdInput"
              type="text"
              placeholder="Paste trace id"
              class="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
            />
            <button
              class="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              :disabled="loadingTrace || !selectedDatasourceId || !traceIdInput.trim()"
              @click="lookupTraceById"
            >
              <Loader2 v-if="loadingTrace" :size="15" class="animate-spin" />
              <Waypoints v-else :size="15" />
              <span>{{ loadingTrace ? 'Loading...' : 'Open Trace' }}</span>
            </button>
          </div>
        </div>

        <!-- Error -->
        <div v-if="error" class="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <AlertCircle :size="16" />
          <span>{{ error }}</span>
        </div>
      </div>

      <!-- Results section -->
      <div class="flex flex-1 flex-col rounded-xl border border-border bg-surface-raised overflow-hidden min-h-[440px]">
        <!-- No datasources -->
        <div v-if="!hasTracingDatasources" class="flex flex-col items-center justify-center py-12 text-center text-sm text-slate-500 flex-1">
          <p class="m-0">No tracing datasource configured.</p>
          <p class="m-0 text-xs text-slate-400">Add a Tempo, VictoriaTraces, or ClickHouse datasource in Data Sources.</p>
        </div>

        <!-- ClickHouse results layout -->
        <div v-else-if="isClickHouseDatasource" class="flex flex-1 min-h-[420px]">
          <div v-if="loadingSearch" class="flex flex-col items-center justify-center gap-4 py-12 text-slate-500 flex-1">
            <Loader2 :size="18" class="animate-spin" />
            <span class="text-sm">Executing trace SQL...</span>
          </div>

          <div v-else-if="traceSummaries.length > 0" class="flex-1 min-h-0 p-3">
            <TraceListPanel :traces="traceSummaries" @open-trace="handleOpenTraceFromList" />
          </div>

          <div v-else class="flex flex-col items-center justify-center py-12 text-center text-sm text-slate-500 flex-1">
            <p class="m-0">Run a ClickHouse SQL query to inspect traces.</p>
            <p class="m-0 text-xs text-slate-400">Expected columns include span_id, operation_name, service_name, start_time_unix_nano, and duration_nano.</p>
          </div>
        </div>

        <!-- Standard trace layout: list + detail -->
        <div v-else class="grid grid-cols-[320px_minmax(0,1fr)] min-h-[460px] flex-1 max-lg:grid-cols-1">
          <!-- Trace results sidebar -->
          <aside class="flex flex-col border-r border-border max-lg:border-r-0 max-lg:border-b max-lg:max-h-[320px]">
            <div class="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-overlay">
              <h2 class="m-0 text-xs font-semibold uppercase tracking-wide text-slate-700">Matching traces</h2>
              <span class="text-xs text-slate-400">{{ traceSummaries.length }} result{{ traceSummaries.length === 1 ? '' : 's' }}</span>
            </div>

            <div v-if="loadingSearch" class="flex items-center justify-center gap-2 py-5 text-slate-500">
              <Loader2 :size="16" class="animate-spin" />
              <span class="text-sm">Searching traces...</span>
            </div>

            <div v-else-if="traceSummaries.length > 0" class="overflow-y-auto p-2 flex flex-col gap-1.5">
              <button
                v-for="summary in traceSummaries"
                :key="summary.traceId"
                class="flex flex-col gap-1 text-left p-3 rounded-lg border cursor-pointer transition"
                :class="selectedTraceId === summary.traceId
                  ? 'border-emerald-300 bg-emerald-50'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'"
                @click="loadTrace(summary.traceId)"
              >
                <code class="text-xs font-mono text-emerald-700 break-all">{{ summary.traceId }}</code>
                <div class="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs text-slate-500">
                  <span>{{ summary.rootServiceName || 'unknown service' }}</span>
                  <span>{{ formatDurationNano(summary.durationNano) }}</span>
                  <span>{{ summary.spanCount }} spans</span>
                  <span :class="summary.errorSpanCount > 0 ? 'text-rose-600 font-medium' : ''">{{ summary.errorSpanCount }} errors</span>
                </div>
                <span class="text-[0.7rem] text-slate-400">{{ formatStart(summary.startTimeUnixNano) }}</span>
              </button>
            </div>

            <div v-else class="flex flex-col items-center justify-center py-8 text-center text-sm text-slate-400 flex-1">
              Run a trace search or open a trace ID directly.
            </div>
          </aside>

          <!-- Timeline / detail panel -->
          <section class="flex flex-col">
            <div class="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-overlay">
              <h2 class="m-0 text-xs font-semibold uppercase tracking-wide text-slate-700">Timeline waterfall</h2>
              <span v-if="activeTrace" class="text-xs text-slate-400">{{ activeTrace.spans.length }} spans</span>
            </div>

            <div v-if="loadingTrace" class="flex flex-col items-center justify-center gap-4 py-12 text-slate-500 flex-1">
              <Loader2 :size="18" class="animate-spin" />
              <span class="text-sm">Loading trace...</span>
            </div>

            <div v-else-if="activeTrace" class="flex flex-col gap-3.5 p-4">
              <!-- Trace summary bar -->
              <div class="flex items-center gap-3 flex-wrap rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <code class="text-xs font-mono text-emerald-700">{{ activeTrace.traceId }}</code>
                <span class="text-xs text-slate-500">{{ formatDurationNano(activeTrace.durationNano) }}</span>
                <span class="text-xs text-slate-500">{{ activeTrace.services.length }} services</span>
              </div>

              <!-- Service graph panel -->
              <div class="rounded-xl border border-slate-200 bg-white p-4 flex flex-col gap-2.5">
                <div class="flex items-center justify-between">
                  <h3 class="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">Service dependency graph</h3>
                  <span v-if="activeServiceGraph" class="text-xs text-slate-400">{{ activeServiceGraph.edges.length }} edges</span>
                </div>

                <div v-if="loadingServiceGraph" class="flex items-center justify-center gap-2 py-5 text-slate-500">
                  <Loader2 :size="16" class="animate-spin" />
                  <span class="text-sm">Loading service graph...</span>
                </div>

                <div v-else-if="serviceGraphError" class="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
                  <AlertCircle :size="14" />
                  <span>{{ serviceGraphError }}</span>
                </div>

                <TraceServiceGraph
                  v-else-if="activeServiceGraph && activeServiceGraph.nodes.length > 0"
                  :graph="activeServiceGraph"
                  @select-service="handleSelectServiceFromGraph"
                  @select-edge="handleSelectEdgeFromGraph"
                />

                <div v-else class="flex items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-400">
                  Not enough trace data to render service dependencies.
                </div>
              </div>

              <!-- Trace detail: timeline + span details -->
              <div class="grid grid-cols-[minmax(0,1fr)_340px] gap-3.5 items-start max-md:grid-cols-1">
                <div class="min-w-0">
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

                <aside v-else class="flex flex-col gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4">
                  <h3 class="m-0 text-xs font-semibold uppercase tracking-wide text-slate-400">Span details</h3>
                  <p class="m-0 text-sm text-slate-500">Select a span in the timeline to inspect attributes, logs, and relationships.</p>
                </aside>
              </div>
            </div>

            <div v-else class="flex flex-col items-center justify-center py-12 text-center text-sm text-slate-500 flex-1">
              <p class="m-0">Select a trace result to view the waterfall timeline.</p>
              <p class="m-0 text-xs text-slate-400">You can search by service/time range or open a known trace ID.</p>
            </div>
          </section>
        </div>
      </div>
    </div>
    </div>

    <CopilotPanel
      v-if="showCopilot"
      :datasource-type="activeDatasource?.type || 'tempo'"
      :datasource-name="activeDatasource?.name || ''"
      :on-insert-query="(q: string) => { query = q }"
      @close="showCopilot = false"
    />
  </div>
</template>
