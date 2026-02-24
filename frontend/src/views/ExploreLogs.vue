<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { Play, AlertCircle, History, X, Loader2, HeartPulse, CircleAlert, ChevronDown, ChevronUp, Check } from 'lucide-vue-next'
import TimeRangePicker from '../components/TimeRangePicker.vue'
import LogViewer from '../components/LogViewer.vue'
import LogQLQueryBuilder from '../components/LogQLQueryBuilder.vue'
import ClickHouseSQLEditor from '../components/ClickHouseSQLEditor.vue'
import CloudWatchQueryEditor from '../components/CloudWatchQueryEditor.vue'
import ElasticsearchQueryEditor from '../components/ElasticsearchQueryEditor.vue'
import { useTimeRange } from '../composables/useTimeRange'
import { useOrganization } from '../composables/useOrganization'
import { useDatasource } from '../composables/useDatasource'
import { queryDataSource, fetchDataSourceLabels, streamDataSourceLogs } from '../api/datasources'
import type { DataSourceType } from '../types/datasource'
import { dataSourceTypeLabels } from '../types/datasource'
import type { LogEntry } from '../types/datasource'
import prometheusLogo from '../assets/datasources/prometheus-logo.svg'
import lokiLogo from '../assets/datasources/loki-logo.svg'
import victoriaMetricsLogo from '../assets/datasources/victoriametrics-logo.svg'
import victoriaLogsLogo from '../assets/datasources/victorialogs-logo.svg'
import tempoLogo from '../assets/datasources/tempo-logo.svg'
import victoriaTracesLogo from '../assets/datasources/victoriatraces-logo.svg'
import clickhouseLogo from '../assets/datasources/clickhouse-logo.svg'
import cloudwatchLogo from '../assets/datasources/cloudwatch-logo.svg'
import elasticsearchLogo from '../assets/datasources/elasticsearch-logo.svg'

const { timeRange, onRefresh, setCustomRange } = useTimeRange()
const { currentOrg } = useOrganization()
const { logsDatasources, fetchDatasources } = useDatasource()

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

interface TraceLogsNavigationContext {
  traceId?: string
  serviceName?: string
  startMs?: number
  endMs?: number
  createdAt?: number
}

const TRACE_LOGS_NAVIGATION_CONTEXT_KEY = 'trace_logs_navigation'
const TRACE_NAVIGATION_MAX_AGE_MS = 5 * 60 * 1000

const selectedDatasourceId = ref('')
const query = ref('')
const loading = ref(false)
const error = ref<string | null>(null)
const logs = ref<LogEntry[]>([])
const hasSuccessfulQuery = ref(false)
const isLive = ref(false)
const liveState = ref<'idle' | 'connecting' | 'connected' | 'reconnecting'>('idle')
const liveError = ref<string | null>(null)
const liveReconnectAttempt = ref(0)
const lastLiveTimestampSec = ref<number | null>(null)

const HISTORY_KEY = 'explore_logs_query_history'
const MAX_HISTORY = 10
const queryHistory = ref<string[]>([])
const showHistory = ref(false)
const showDatasourceMenu = ref(false)
const datasourceMenuRef = ref<HTMLElement | null>(null)
const datasourceHealth = ref<Record<string, DatasourceHealthStatus>>({})
const datasourceHealthErrors = ref<Record<string, string>>({})
const indexedLabels = ref<string[]>([])
const labelsCache = ref<Map<string, string[]>>(new Map())
const seenLogKeys = ref<Set<string>>(new Set())
const highlightedLogKeys = ref<Set<string>>(new Set())
const highlightTimeoutIds = ref<Map<string, number>>(new Map())
const pendingTraceId = ref('')
const pendingServiceName = ref('')
const pendingStartMs = ref<number | null>(null)
const pendingEndMs = ref<number | null>(null)

const MAX_STREAM_LOGS = 2000
const LIVE_RESUME_OVERLAP_SECONDS = 5
const LIVE_RECONNECT_BASE_DELAY_MS = 1000
const LIVE_RECONNECT_MAX_DELAY_MS = 15000
const NEW_LOG_HIGHLIGHT_MS = 2500

function escapeForDoubleQuotedValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function escapeForSingleQuotedValue(value: string): string {
  return value.replace(/'/g, "''")
}

function buildTraceLogsQuery(type_: DataSourceType, traceId: string, serviceName: string): string {
  const escapedTraceId = escapeForDoubleQuotedValue(traceId)
  const escapedServiceName = escapeForDoubleQuotedValue(serviceName)
  const escapedTraceIdSql = escapeForSingleQuotedValue(traceId)
  const escapedServiceNameSql = escapeForSingleQuotedValue(serviceName)

  if (type_ === 'loki') {
    const selector = escapedServiceName
      ? `{service_name="${escapedServiceName}"}`
      : '{job=~".+"}'
    return `${selector} |= "${escapedTraceId}"`
  }

  if (type_ === 'clickhouse') {
    const serviceCondition = escapedServiceNameSql
      ? `AND service_name = '${escapedServiceNameSql}'`
      : ''
    return `SELECT timestamp, message, level\nFROM logs\nWHERE message ILIKE '%${escapedTraceIdSql}%' ${serviceCondition}\nORDER BY timestamp DESC\nLIMIT 500`
  }

  if (type_ === 'cloudwatch') {
    const serviceFilter = escapedServiceName
      ? ` | filter service_name = "${escapedServiceName}"`
      : ''
    return `fields @timestamp, @message, @logStream\n| filter @message like /${escapedTraceId}/${serviceFilter}\n| sort @timestamp desc\n| limit 500`
  }

  if (type_ === 'elasticsearch') {
    if (escapedServiceName) {
      return `trace.id:"${escapedTraceId}" AND service.name:"${escapedServiceName}"`
    }
    return `trace.id:"${escapedTraceId}"`
  }

  if (escapedServiceName) {
    return `"${escapedServiceName}" "${escapedTraceId}"`
  }

  return `"${escapedTraceId}"`
}

function consumeTraceLogsNavigationContext() {
  let rawContext: string | null = null
  try {
    rawContext = localStorage.getItem(TRACE_LOGS_NAVIGATION_CONTEXT_KEY)
    localStorage.removeItem(TRACE_LOGS_NAVIGATION_CONTEXT_KEY)
  } catch {
    return
  }

  if (!rawContext) {
    return
  }

  try {
    const parsed = JSON.parse(rawContext) as TraceLogsNavigationContext

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
    pendingServiceName.value = typeof parsed.serviceName === 'string'
      ? parsed.serviceName.trim()
      : ''

    if (typeof parsed.startMs === 'number' && typeof parsed.endMs === 'number' && parsed.endMs > parsed.startMs) {
      pendingStartMs.value = parsed.startMs
      pendingEndMs.value = parsed.endMs
    }
  } catch {
    // Ignore malformed navigation context.
  }
}

function applyTraceLogsNavigationContext(type_: DataSourceType) {
  if (!pendingTraceId.value) {
    return
  }

  query.value = buildTraceLogsQuery(type_, pendingTraceId.value, pendingServiceName.value)

  if (pendingStartMs.value !== null && pendingEndMs.value !== null) {
    setCustomRange(pendingStartMs.value, pendingEndMs.value)
  }

  pendingTraceId.value = ''
  pendingServiceName.value = ''
  pendingStartMs.value = null
  pendingEndMs.value = null
}

onMounted(() => {
  consumeTraceLogsNavigationContext()

  if (activeDatasource.value) {
    applyTraceLogsNavigationContext(activeDatasource.value.type)
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
  logsDatasources,
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
  logsDatasources,
  (sources) => {
    const sourceIds = new Set(sources.map(ds => ds.id))
    datasourceHealth.value = Object.fromEntries(
      Object.entries(datasourceHealth.value).filter(([id]) => sourceIds.has(id)),
    )
    datasourceHealthErrors.value = Object.fromEntries(
      Object.entries(datasourceHealthErrors.value).filter(([id]) => sourceIds.has(id)),
    )

    const filteredCache = new Map<string, string[]>()
    for (const [id, labels] of labelsCache.value.entries()) {
      if (sourceIds.has(id)) {
        filteredCache.set(id, labels)
      }
    }
    labelsCache.value = filteredCache
  },
)

function addToHistory(q: string) {
  if (!q.trim()) return

  const filtered = queryHistory.value.filter(h => h !== q)
  queryHistory.value = [q, ...filtered].slice(0, MAX_HISTORY)
  sessionStorage.setItem(HISTORY_KEY, JSON.stringify(queryHistory.value))
}

function sortLogsNewestFirst(entries: LogEntry[]): LogEntry[] {
  return entries
    .map((log, index) => {
      const parsedTimestamp = Date.parse(log.timestamp)
      return {
        log,
        index,
        timestampMs: Number.isNaN(parsedTimestamp) ? null : parsedTimestamp,
      }
    })
    .sort((a, b) => {
      if (a.timestampMs === null && b.timestampMs === null) {
        return a.index - b.index
      }
      if (a.timestampMs === null) {
        return 1
      }
      if (b.timestampMs === null) {
        return -1
      }
      if (a.timestampMs === b.timestampMs) {
        return a.index - b.index
      }

      return b.timestampMs - a.timestampMs
    })
    .map(entry => entry.log)
}

function getLogKey(log: LogEntry): string {
  const labels = Object.entries(log.labels || {})
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    .map(([key, value]) => `${key}=${value}`)
    .join(',')
  return `${log.timestamp}|${labels}|${log.line}`
}

function toUnixSeconds(timestamp: string): number | null {
  const parsed = Date.parse(timestamp)
  if (Number.isNaN(parsed)) {
    return null
  }
  return Math.floor(parsed / 1000)
}

function getLatestTimestampSeconds(entries: LogEntry[]): number | null {
  let latest: number | null = null
  for (const entry of entries) {
    const ts = toUnixSeconds(entry.timestamp)
    if (ts === null) {
      continue
    }
    if (latest === null || ts > latest) {
      latest = ts
    }
  }
  return latest
}

function resetLogCache(entries: LogEntry[]) {
  seenLogKeys.value = new Set(entries.map(getLogKey))
  lastLiveTimestampSec.value = getLatestTimestampSeconds(entries)
}

function clearLogHighlights() {
  for (const timeoutId of highlightTimeoutIds.value.values()) {
    window.clearTimeout(timeoutId)
  }
  highlightTimeoutIds.value = new Map()
  highlightedLogKeys.value = new Set()
}

function markLogAsNew(logKey: string) {
  const nextHighlightKeys = new Set(highlightedLogKeys.value)
  nextHighlightKeys.add(logKey)
  highlightedLogKeys.value = nextHighlightKeys

  const nextTimeouts = new Map(highlightTimeoutIds.value)
  const existingTimeout = nextTimeouts.get(logKey)
  if (existingTimeout !== undefined) {
    window.clearTimeout(existingTimeout)
  }

  const timeoutId = window.setTimeout(() => {
    const remainingHighlights = new Set(highlightedLogKeys.value)
    remainingHighlights.delete(logKey)
    highlightedLogKeys.value = remainingHighlights

    const remainingTimeouts = new Map(highlightTimeoutIds.value)
    remainingTimeouts.delete(logKey)
    highlightTimeoutIds.value = remainingTimeouts
  }, NEW_LOG_HIGHLIGHT_MS)

  nextTimeouts.set(logKey, timeoutId)
  highlightTimeoutIds.value = nextTimeouts
}

function appendStreamLog(entry: LogEntry) {
  const key = getLogKey(entry)
  if (seenLogKeys.value.has(key)) {
    return
  }

  seenLogKeys.value.add(key)
  logs.value = [...logs.value, entry]
  markLogAsNew(key)

  const timestampSec = toUnixSeconds(entry.timestamp)
  if (timestampSec !== null && (lastLiveTimestampSec.value === null || timestampSec > lastLiveTimestampSec.value)) {
    lastLiveTimestampSec.value = timestampSec
  }

  if (logs.value.length > MAX_STREAM_LOGS) {
    logs.value = sortLogsNewestFirst(logs.value).slice(0, MAX_STREAM_LOGS)
    seenLogKeys.value = new Set(logs.value.map(getLogKey))

    const remainingKeys = new Set(logs.value.map(getLogKey))
    highlightedLogKeys.value = new Set(
      Array.from(highlightedLogKeys.value).filter(logKey => remainingKeys.has(logKey)),
    )

    const nextTimeouts = new Map(highlightTimeoutIds.value)
    for (const [logKey, timeoutId] of nextTimeouts.entries()) {
      if (!remainingKeys.has(logKey)) {
        window.clearTimeout(timeoutId)
        nextTimeouts.delete(logKey)
      }
    }
    highlightTimeoutIds.value = nextTimeouts
  }
}

function getLiveStreamStart(): number {
  if (lastLiveTimestampSec.value === null) {
    return Math.floor(Date.now() / 1000) - LIVE_RESUME_OVERLAP_SECONDS
  }

  return Math.max(0, lastLiveTimestampSec.value - LIVE_RESUME_OVERLAP_SECONDS)
}

let liveAbortController: AbortController | null = null
let liveReconnectTimer: number | null = null

function clearLiveReconnectTimer() {
  if (liveReconnectTimer !== null) {
    window.clearTimeout(liveReconnectTimer)
    liveReconnectTimer = null
  }
}

function cancelLiveStream() {
  if (liveAbortController) {
    liveAbortController.abort()
    liveAbortController = null
  }
}

function stopLive(resetError = true) {
  isLive.value = false
  liveState.value = 'idle'
  if (resetError) {
    liveError.value = null
  }
  liveReconnectAttempt.value = 0
  clearLiveReconnectTimer()
  cancelLiveStream()
}

function scheduleLiveReconnect() {
  if (!isLive.value) {
    return
  }

  clearLiveReconnectTimer()
  liveState.value = 'reconnecting'

  const delayMs = Math.min(
    LIVE_RECONNECT_MAX_DELAY_MS,
    LIVE_RECONNECT_BASE_DELAY_MS * 2 ** liveReconnectAttempt.value,
  )
  liveReconnectAttempt.value += 1

  liveReconnectTimer = window.setTimeout(() => {
    void openLiveStream()
  }, delayMs)
}

async function openLiveStream() {
  if (!isLive.value || !selectedDatasourceId.value || !query.value.trim()) {
    return
  }

  clearLiveReconnectTimer()
  cancelLiveStream()

  liveAbortController = new AbortController()
  if (liveState.value !== 'reconnecting') {
    liveState.value = 'connecting'
  }

  try {
    await streamDataSourceLogs(
      selectedDatasourceId.value,
      {
        query: query.value,
        start: getLiveStreamStart(),
        limit: 200,
      },
      {
        onLog: appendStreamLog,
        onStatus: (status, message) => {
          if (!isLive.value) {
            return
          }

          if (status === 'connected') {
            liveState.value = 'connected'
            liveError.value = null
            liveReconnectAttempt.value = 0
            return
          }

          if (status === 'connecting') {
            liveState.value = 'connecting'
          }

          if (message) {
            liveError.value = message
          }
        },
        onError: (message) => {
          if (!isLive.value) {
            return
          }
          liveError.value = message
        },
      },
      liveAbortController.signal,
    )

    if (!isLive.value) {
      return
    }

    liveError.value = 'Live stream disconnected'
    scheduleLiveReconnect()
  } catch (e) {
    if (!isLive.value) {
      return
    }

    if (e instanceof Error && e.name === 'AbortError') {
      return
    }

    liveError.value = e instanceof Error ? e.message : 'Live stream failed'
    scheduleLiveReconnect()
  }
}

async function startLive() {
  if (isLive.value || liveState.value === 'connecting' || liveState.value === 'reconnecting') {
    return
  }

  if (!selectedDatasourceId.value) {
    error.value = 'Select a logs datasource'
    return
  }

  if (!query.value.trim()) {
    error.value = 'Query is required'
    return
  }

  if (!hasSuccessfulQuery.value) {
    await runQuery()
    if (!hasSuccessfulQuery.value) {
      return
    }
  }

  isLive.value = true
  liveState.value = 'connecting'
  liveError.value = null
  liveReconnectAttempt.value = 0
  void openLiveStream()
}

function toggleLive() {
  if (isLive.value) {
    stopLive()
    return
  }

  void startLive()
}

async function runQuery() {
  const wasLive = isLive.value
  if (wasLive) {
    stopLive()
  }

  if (!selectedDatasourceId.value) {
    error.value = 'Select a logs datasource'
    return
  }

  if (!query.value.trim()) {
    error.value = 'Query is required'
    return
  }

  loading.value = true
  error.value = null
  liveError.value = null
  clearLogHighlights()
  logs.value = []
  seenLogKeys.value = new Set()
  lastLiveTimestampSec.value = null
  hasSuccessfulQuery.value = false

  try {
    const start = Math.floor(timeRange.value.start / 1000)
    const end = Math.floor(timeRange.value.end / 1000)

    const response = await queryDataSource(selectedDatasourceId.value, {
      query: query.value,
      signal: isClickHouseDatasource.value || isCloudWatchDatasource.value || isElasticsearchDatasource.value ? 'logs' : undefined,
      start,
      end,
      step: 15,
      limit: 1000,
    })

    if (response.status === 'error') {
      error.value = response.error || 'Query failed'
      return
    }

    if (response.resultType !== 'logs') {
      error.value = 'Selected datasource did not return log results'
      return
    }

    logs.value = response.data?.logs || []
    resetLogCache(logs.value)
    hasSuccessfulQuery.value = true
    addToHistory(query.value)

    if (wasLive) {
      isLive.value = true
      liveState.value = 'connecting'
      liveError.value = null
      liveReconnectAttempt.value = 0
      void openLiveStream()
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to execute query'
  } finally {
    loading.value = false
  }
}

function selectHistoryQuery(q: string) {
  query.value = q
  showHistory.value = false
}

function clearHistory() {
  queryHistory.value = []
  sessionStorage.removeItem(HISTORY_KEY)
}

async function loadIndexedLabels(datasourceId: string) {
  if (labelsCache.value.has(datasourceId)) {
    indexedLabels.value = labelsCache.value.get(datasourceId) || []
    return
  }

  try {
    const labels = await fetchDataSourceLabels(datasourceId)
    labelsCache.value.set(datasourceId, labels)
    if (selectedDatasourceId.value === datasourceId) {
      indexedLabels.value = labels
    }
  } catch {
    if (selectedDatasourceId.value === datasourceId) {
      indexedLabels.value = []
    }
  }
}

let unsubscribeRefresh: (() => void) | null = null

onMounted(() => {
  document.addEventListener('click', handleDocumentClick)
  unsubscribeRefresh = onRefresh(() => {
    if (isLive.value) {
      return
    }

    if (query.value.trim() && selectedDatasourceId.value && hasSuccessfulQuery.value) {
      runQuery()
    }
  })
})

onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClick)
  stopLive(false)
  clearLogHighlights()
  if (unsubscribeRefresh) {
    unsubscribeRefresh()
  }
})

const hasLogsDatasources = computed(() => logsDatasources.value.length > 0)
const hasResults = computed(() => hasSuccessfulQuery.value && logs.value.length > 0)
const newestFirstLogs = computed(() => sortLogsNewestFirst(logs.value))
const highlightedLogKeyList = computed(() => Array.from(highlightedLogKeys.value))
const liveStatusLabel = computed(() => {
  if (liveState.value === 'connected') {
    return 'Live'
  }
  if (liveState.value === 'connecting') {
    return 'Connecting...'
  }
  if (liveState.value === 'reconnecting') {
    return 'Reconnecting...'
  }
  return ''
})
const isLiveBusy = computed(() => liveState.value === 'connecting' || liveState.value === 'reconnecting')
const activeDatasource = computed(
  () => logsDatasources.value.find(ds => ds.id === selectedDatasourceId.value) || null,
)
const isClickHouseDatasource = computed(() => activeDatasource.value?.type === 'clickhouse')
const isCloudWatchDatasource = computed(() => activeDatasource.value?.type === 'cloudwatch')
const isElasticsearchDatasource = computed(() => activeDatasource.value?.type === 'elasticsearch')
const supportsLabelDiscovery = computed(
  () => activeDatasource.value?.type === 'loki' || activeDatasource.value?.type === 'victorialogs',
)
const supportsLiveStreaming = computed(
  () => activeDatasource.value?.type === 'loki' || activeDatasource.value?.type === 'victorialogs',
)
const queryLanguage = computed<'logql' | 'logsql'>(() => {
  if (activeDatasource.value?.type === 'victorialogs') {
    return 'logsql'
  }
  return 'logql'
})
const queryPlaceholder = computed(() => {
  if (queryLanguage.value === 'logsql') {
    return '*'
  }
  return '{job=~".+"} |= "error"'
})
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
  if (loading.value || !hasLogsDatasources.value) {
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
    return 'SELECT now() AS timestamp, \'healthcheck\' AS message LIMIT 1'
  }
  if (type_ === 'cloudwatch') {
    return 'fields @timestamp, @message | sort @timestamp desc | limit 1'
  }
  if (type_ === 'elasticsearch') {
    return '*'
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
      signal: type_ === 'clickhouse' || type_ === 'cloudwatch' || type_ === 'elasticsearch' ? 'logs' : undefined,
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

    applyTraceLogsNavigationContext(datasource.type)

    if ((datasourceHealth.value[datasource.id] || 'unknown') === 'unknown') {
      checkDatasourceHealth(datasource.id, datasource.type)
    }
  },
  { immediate: true },
)

watch(selectedDatasourceId, () => {
  showDatasourceMenu.value = false
  stopLive()
  clearLogHighlights()
})

watch(supportsLiveStreaming, (supports) => {
  if (!supports && isLive.value) {
    stopLive()
  }
})

watch(query, (nextQuery, previousQuery) => {
  if (nextQuery !== previousQuery && isLive.value) {
    stopLive(false)
  }
})

watch(() => selectedDatasourceId.value, (datasourceId) => {
  if (!datasourceId || !supportsLabelDiscovery.value) {
    indexedLabels.value = []
    return
  }

  void loadIndexedLabels(datasourceId)
}, { immediate: true })
</script>

<template>
  <div class="explore-page">
    <header class="explore-header">
      <div class="header-title">
        <h1>Explore</h1>
        <span class="mode-badge">Logs</span>
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
                :disabled="loading || !hasLogsDatasources"
                @click="toggleDatasourceMenu"
                :title="activeDatasource ? `Active datasource: ${activeDatasource.name}` : 'No logs datasource configured'"
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

                <span v-else class="active-datasource-empty">No logs datasource configured</span>

                <component
                  :is="showDatasourceMenu ? ChevronUp : ChevronDown"
                  :size="16"
                  class="datasource-chevron"
                />
              </button>

              <div v-if="showDatasourceMenu && hasLogsDatasources" class="datasource-dropdown">
                <button
                  v-for="ds in logsDatasources"
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
            signal="logs"
            :disabled="loading || !hasLogsDatasources"
          />
          <CloudWatchQueryEditor
            v-else-if="isCloudWatchDatasource"
            v-model="query"
            signal="logs"
            :show-signal-selector="false"
            :disabled="loading || !hasLogsDatasources"
          />
          <ElasticsearchQueryEditor
            v-else-if="isElasticsearchDatasource"
            v-model="query"
            signal="logs"
            :show-signal-selector="false"
            :disabled="loading || !hasLogsDatasources"
          />
          <LogQLQueryBuilder
            v-else
            v-model="query"
            :query-language="queryLanguage"
            :datasource-id="selectedDatasourceId"
            :indexed-labels="indexedLabels"
            :disabled="loading || !hasLogsDatasources"
            :editor-height="130"
            :placeholder="queryPlaceholder"
            @submit="runQuery"
          />

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
            :disabled="loading || !query.trim() || !selectedDatasourceId || !hasLogsDatasources"
            @click="runQuery"
          >
            <Play :size="16" />
            <span>{{ loading ? 'Running...' : 'Run Query' }}</span>
          </button>

          <button
            class="btn btn-live"
            :class="{ active: isLive }"
            :disabled="loading || !supportsLiveStreaming || (!isLive && (!query.trim() || !selectedDatasourceId || !hasLogsDatasources))"
            @click="toggleLive"
            :title="supportsLiveStreaming ? '' : 'Live streaming is only available for Loki and Victoria Logs datasources'"
          >
            <Loader2 v-if="isLiveBusy" :size="16" class="icon-spin" />
            <X v-else-if="isLive" :size="16" />
            <HeartPulse v-else :size="16" />
            <span>{{ isLive ? 'Stop Live' : 'Start Live' }}</span>
          </button>

          <span class="hint">Ctrl+Enter to run</span>
          <span v-if="liveStatusLabel" class="live-status" :class="`live-${liveState}`">{{ liveStatusLabel }}</span>
        </div>

        <div v-if="error" class="query-error">
          <AlertCircle :size="16" />
          <span>{{ error }}</span>
        </div>

        <div v-else-if="liveError && isLive" class="query-error live-query-error">
          <AlertCircle :size="16" />
          <span>{{ liveError }}</span>
        </div>
      </div>

      <div class="results-section">
        <div v-if="loading" class="loading-state">
          <div class="loading-spinner"></div>
          <span>Executing query...</span>
        </div>

        <div v-else-if="hasResults" class="results-container">
          <div class="results-header">
            <span class="result-count">{{ logs.length }} {{ logs.length === 1 ? 'entry' : 'entries' }}</span>
            <span v-if="liveStatusLabel" class="result-live-pill" :class="`live-${liveState}`">
              <span class="live-dot"></span>
              {{ liveStatusLabel }}
            </span>
          </div>
          <div class="log-viewer-container">
            <LogViewer :logs="newestFirstLogs" :highlighted-log-keys="highlightedLogKeyList" />
          </div>
        </div>

        <div v-else-if="hasSuccessfulQuery && logs.length === 0" class="empty-state">
          <p>No logs returned for the selected time range.</p>
        </div>

        <div v-else-if="!hasLogsDatasources" class="empty-state">
          <p>No logs datasource configured.</p>
          <p class="hint-text">Add a Loki, Victoria Logs, CloudWatch, or Elasticsearch datasource in Data Sources.</p>
        </div>

        <div v-else class="empty-state">
          <p>
            {{
              isClickHouseDatasource
                ? 'Write a SQL query and click "Run Query" to inspect logs.'
                : isCloudWatchDatasource
                  ? 'Write a CloudWatch Logs Insights query and click "Run Query" to inspect logs.'
                  : isElasticsearchDatasource
                    ? 'Write an Elasticsearch/Lucene query and click "Run Query" to inspect logs.'
                    : 'Write a log query and click "Run Query" to inspect logs.'
            }}
          </p>
          <p v-if="isClickHouseDatasource" class="hint-text">
            Examples: <code>SELECT timestamp, message, level FROM logs WHERE timestamp &gt;= toDateTime({start})</code>
          </p>
          <p v-else-if="isCloudWatchDatasource" class="hint-text">
            Example: <code>fields @timestamp, @message | filter @message like /error/ | sort @timestamp desc | limit 200</code>
          </p>
          <p v-else-if="isElasticsearchDatasource" class="hint-text">
            Examples: <code>service.name:"api" AND level:error</code>, <code>{"index":"logs-*","query":{"query_string":{"query":"error"}}}</code>
          </p>
          <p v-else class="hint-text">Examples: <code>{job=~".+"}</code>, <code>{app="api"} |= "error"</code>, <code>*</code></p>
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
  border: 1px solid rgba(56, 189, 248, 0.38);
  background: rgba(56, 189, 248, 0.14);
  color: #bde9ff;
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
  gap: 0.7rem;
}

.query-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.query-input {
  width: 100%;
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
  flex-wrap: wrap;
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

.btn-live {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.1rem;
  background: rgba(56, 189, 248, 0.12);
  border: 1px solid rgba(56, 189, 248, 0.3);
  border-radius: 10px;
  color: #bde9ff;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-live:hover:not(:disabled) {
  background: rgba(56, 189, 248, 0.2);
  border-color: rgba(56, 189, 248, 0.5);
}

.btn-live.active {
  background: rgba(16, 185, 129, 0.16);
  border-color: rgba(16, 185, 129, 0.42);
  color: #7de9c5;
}

.btn-live:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.hint {
  font-size: 0.75rem;
  color: var(--text-tertiary);
}

.live-status {
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  border: 1px solid var(--border-primary);
  font-size: 0.72rem;
  color: var(--text-secondary);
}

.live-status.live-connected {
  border-color: rgba(16, 185, 129, 0.4);
  background: rgba(16, 185, 129, 0.12);
  color: #7de9c5;
}

.live-status.live-connecting,
.live-status.live-reconnecting {
  border-color: rgba(148, 163, 184, 0.45);
  background: rgba(148, 163, 184, 0.12);
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

.live-query-error {
  background: rgba(250, 204, 21, 0.1);
  border-color: rgba(250, 204, 21, 0.28);
  color: #facc15;
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
  min-height: 0;
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

.result-live-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  border: 1px solid var(--border-primary);
  font-size: 0.72rem;
  color: var(--text-secondary);
}

.result-live-pill.live-connected {
  border-color: rgba(16, 185, 129, 0.4);
  background: rgba(16, 185, 129, 0.12);
  color: #7de9c5;
}

.result-live-pill.live-connecting,
.result-live-pill.live-reconnecting {
  border-color: rgba(148, 163, 184, 0.45);
  background: rgba(148, 163, 184, 0.12);
}

.live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.9;
}

.result-live-pill.live-connected .live-dot {
  animation: live-pulse 1.2s ease-in-out infinite;
}

@keyframes live-pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.45;
  }
  50% {
    transform: scale(1.25);
    opacity: 1;
  }
}

.log-viewer-container {
  flex: 1;
  min-height: 0;
  padding: 1rem;
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
