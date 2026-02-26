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
import { fetchDataSourceLabels, queryDataSource, streamDataSourceLogs } from '../api/datasources'
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
import CloudWatchQueryEditor from '../components/CloudWatchQueryEditor.vue'
import ElasticsearchQueryEditor from '../components/ElasticsearchQueryEditor.vue'
import LogQLQueryBuilder from '../components/LogQLQueryBuilder.vue'
import LogViewer from '../components/LogViewer.vue'
import TimeRangePicker from '../components/TimeRangePicker.vue'
import { useDatasource } from '../composables/useDatasource'
import { useOrganization } from '../composables/useOrganization'
import { useTimeRange } from '../composables/useTimeRange'
import type { DataSourceType, LogEntry } from '../types/datasource'
import { dataSourceTypeLabels } from '../types/datasource'

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
  vmalert: vmalertLogo,
  alertmanager: alertmanagerLogo,
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
    const selector = escapedServiceName ? `{service_name="${escapedServiceName}"}` : '{job=~".+"}'
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

    const hasSelected = sources.some((ds) => ds.id === selectedDatasourceId.value)
    if (!hasSelected) {
      const defaultDatasource = sources.find((ds) => ds.is_default)
      selectedDatasourceId.value = defaultDatasource?.id || sources[0].id
    }
  },
  { immediate: true },
)

watch(logsDatasources, (sources) => {
  const sourceIds = new Set(sources.map((ds) => ds.id))
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
})

function addToHistory(q: string) {
  if (!q.trim()) return

  const filtered = queryHistory.value.filter((h) => h !== q)
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
    .map((entry) => entry.log)
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
  if (
    timestampSec !== null &&
    (lastLiveTimestampSec.value === null || timestampSec > lastLiveTimestampSec.value)
  ) {
    lastLiveTimestampSec.value = timestampSec
  }

  if (logs.value.length > MAX_STREAM_LOGS) {
    logs.value = sortLogsNewestFirst(logs.value).slice(0, MAX_STREAM_LOGS)
    seenLogKeys.value = new Set(logs.value.map(getLogKey))

    const remainingKeys = new Set(logs.value.map(getLogKey))
    highlightedLogKeys.value = new Set(
      Array.from(highlightedLogKeys.value).filter((logKey) => remainingKeys.has(logKey)),
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
      signal:
        isClickHouseDatasource.value ||
        isCloudWatchDatasource.value ||
        isElasticsearchDatasource.value
          ? 'logs'
          : undefined,
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
const isLiveBusy = computed(
  () => liveState.value === 'connecting' || liveState.value === 'reconnecting',
)
const activeDatasource = computed(
  () => logsDatasources.value.find((ds) => ds.id === selectedDatasourceId.value) || null,
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
    return "SELECT now() AS timestamp, 'healthcheck' AS message LIMIT 1"
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
      signal:
        type_ === 'clickhouse' || type_ === 'cloudwatch' || type_ === 'elasticsearch'
          ? 'logs'
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

watch(
  () => selectedDatasourceId.value,
  (datasourceId) => {
    if (!datasourceId || !supportsLabelDiscovery.value) {
      indexedLabels.value = []
      return
    }

    void loadIndexedLabels(datasourceId)
  },
  { immediate: true },
)
</script>

<template>
  <div class="flex flex-col min-h-full px-8 py-6">
    <header class="flex items-center justify-between mb-6">
      <div class="flex items-center flex-wrap gap-3">
        <h1 class="text-2xl font-bold text-slate-900 m-0">Explore</h1>
        <span class="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-emerald-700">Logs</span>
      </div>
    </header>

    <div class="flex flex-col gap-6 flex-1">
      <div class="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4">
        <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-4 items-end max-md:grid-cols-1">
          <div class="flex flex-col gap-2.5">
            <label class="text-xs font-semibold uppercase tracking-wide text-slate-500">Data Source</label>
            <div ref="datasourceMenuRef" class="relative">
              <button
                type="button"
                class="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left cursor-pointer transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
                :disabled="loading || !hasLogsDatasources"
                @click="toggleDatasourceMenu"
                :title="activeDatasource ? `Active datasource: ${activeDatasource.name}` : 'No logs datasource configured'"
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
                    <span class="font-mono text-xs uppercase tracking-[0.07em] text-slate-500">{{ dataSourceTypeLabels[activeDatasource.type] }}</span>
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

                <span v-else class="text-sm text-slate-400">No logs datasource configured</span>

                <component
                  :is="showDatasourceMenu ? ChevronUp : ChevronDown"
                  :size="16"
                  class="ml-1 shrink-0 text-slate-400"
                />
              </button>

              <div v-if="showDatasourceMenu && hasLogsDatasources" class="absolute left-0 right-0 top-full mt-1.5 z-[110] max-h-[280px] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                <button
                  v-for="ds in logsDatasources"
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
            <label class="text-xs font-semibold uppercase tracking-wide text-slate-500">Query Range</label>
            <TimeRangePicker stacked />
          </div>
        </div>

        <div class="flex flex-col gap-4">
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

          <!-- History button -->
          <div v-if="queryHistory.length > 0" class="relative">
            <button
              class="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 cursor-pointer"
              :class="{ 'text-slate-700': showHistory }"
              @click="showHistory = !showHistory"
              title="Query history"
            >
              <History :size="16" />
              <span>History</span>
            </button>

            <!-- Query history dropdown -->
            <div v-if="showHistory" class="absolute left-0 top-full mt-1 z-10 w-80 max-h-[300px] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg max-md:w-full">
              <div class="flex items-center justify-between px-4 py-3 border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <span>Recent Queries</span>
                <button class="flex items-center justify-center h-6 w-6 rounded bg-transparent border-none text-slate-400 cursor-pointer transition hover:bg-slate-100 hover:text-rose-500" @click="clearHistory" title="Clear history">
                  <X :size="14" />
                </button>
              </div>
              <button
                v-for="(q, index) in queryHistory"
                :key="index"
                class="block w-full border-none bg-transparent px-4 py-2.5 text-left cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                @click="selectHistoryQuery(q)"
              >
                <code class="block font-mono text-xs text-slate-600 truncate">{{ q }}</code>
              </button>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-4 flex-wrap">
          <button
            class="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            :disabled="loading || !query.trim() || !selectedDatasourceId || !hasLogsDatasources"
            @click="runQuery"
          >
            <Play :size="16" />
            <span>{{ loading ? 'Running...' : 'Run Query' }}</span>
          </button>

          <button
            class="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
            :class="isLive
              ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300'"
            :disabled="loading || !supportsLiveStreaming || (!isLive && (!query.trim() || !selectedDatasourceId || !hasLogsDatasources))"
            @click="toggleLive"
            :title="supportsLiveStreaming ? '' : 'Live streaming is only available for Loki and Victoria Logs datasources'"
          >
            <Loader2 v-if="isLiveBusy" :size="16" class="animate-spin" />
            <X v-else-if="isLive" :size="16" />
            <HeartPulse v-else :size="16" />
            <span>{{ isLive ? 'Stop Live' : 'Start Live' }}</span>
          </button>

          <span class="text-xs text-slate-400">Ctrl+Enter to run</span>

          <span
            v-if="liveStatusLabel"
            class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs border"
            :class="{
              'border-emerald-200 bg-emerald-50 text-emerald-700': liveState === 'connected',
              'border-slate-200 bg-slate-50 text-slate-500': liveState === 'connecting' || liveState === 'reconnecting',
            }"
          >{{ liveStatusLabel }}</span>
        </div>

        <!-- Error display -->
        <div v-if="error" class="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <AlertCircle :size="16" />
          <span>{{ error }}</span>
        </div>

        <div v-else-if="liveError && isLive" class="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          <AlertCircle :size="16" />
          <span>{{ liveError }}</span>
        </div>
      </div>

      <!-- Results section -->
      <div class="flex flex-1 flex-col rounded-xl border border-slate-200 bg-white overflow-hidden min-h-[400px]">
        <div v-if="loading" class="flex flex-col items-center justify-center gap-4 py-12 text-slate-500 flex-1">
          <div class="animate-spin h-8 w-8 rounded-full border-[3px] border-slate-200 border-t-emerald-600"></div>
          <span class="text-sm">Executing query...</span>
        </div>

        <div v-else-if="hasResults" class="flex flex-col flex-1 min-h-0">
          <div class="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
            <span class="text-sm text-slate-500">{{ logs.length }} {{ logs.length === 1 ? 'entry' : 'entries' }}</span>
            <span
              v-if="liveStatusLabel"
              class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs border"
              :class="{
                'border-emerald-200 bg-emerald-50 text-emerald-700': liveState === 'connected',
                'border-slate-200 bg-slate-50 text-slate-500': liveState === 'connecting' || liveState === 'reconnecting',
              }"
            >
              <span
                class="h-1.5 w-1.5 rounded-full bg-current"
                :class="{ 'animate-pulse': liveState === 'connected' }"
              ></span>
              {{ liveStatusLabel }}
            </span>
          </div>
          <div class="flex-1 min-h-0 p-4">
            <LogViewer
              :logs="newestFirstLogs"
              :highlighted-log-keys="highlightedLogKeyList"
              :trace-id-field="activeDatasource?.trace_id_field || 'trace_id'"
              :linked-trace-datasource-id="activeDatasource?.linked_trace_datasource_id || null"
            />
          </div>
        </div>

        <div v-else-if="hasSuccessfulQuery && logs.length === 0" class="flex flex-col items-center justify-center py-12 text-center text-sm text-slate-500 flex-1">
          <p class="m-0">No logs returned for the selected time range.</p>
        </div>

        <div v-else-if="!hasLogsDatasources" class="flex flex-col items-center justify-center py-12 text-center text-sm text-slate-500 flex-1">
          <p class="m-0">No logs datasource configured.</p>
          <p class="m-0 text-xs text-slate-400">Add a Loki, Victoria Logs, CloudWatch, or Elasticsearch datasource in Data Sources.</p>
        </div>

        <div v-else class="flex flex-col items-center justify-center py-12 text-center text-sm text-slate-500 flex-1">
          <p class="m-0">
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
          <p v-if="isClickHouseDatasource" class="m-0 text-xs text-slate-400">
            Examples: <code class="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">SELECT timestamp, message, level FROM logs WHERE timestamp &gt;= toDateTime({start})</code>
          </p>
          <p v-else-if="isCloudWatchDatasource" class="m-0 text-xs text-slate-400">
            Example: <code class="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">fields @timestamp, @message | filter @message like /error/ | sort @timestamp desc | limit 200</code>
          </p>
          <p v-else-if="isElasticsearchDatasource" class="m-0 text-xs text-slate-400">
            Examples: <code class="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">service.name:"api" AND level:error</code>, <code class="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">{"index":"logs-*","query":{"query_string":{"query":"error"}}}</code>
          </p>
          <p v-else class="m-0 text-xs text-slate-400">Examples: <code class="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">{job=~".+"}</code>, <code class="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">{app="api"} |= "error"</code>, <code class="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">*</code></p>
        </div>
      </div>
    </div>
  </div>
</template>
