import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  HeartPulse,
  History,
  LayoutDashboard,
  Loader2,
  Play,
  Star,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  fetchDataSourceLabels,
  queryDataSource,
  streamDataSourceLogs,
} from '@/api/datasources'
import { ExportToDashboardModal } from '@/components/ExportToDashboardModal'
import { LogQLQueryBuilder } from '@/components/LogQLQueryBuilder'
import { LogViewer } from '@/components/LogViewer'
import { MonacoQueryEditor } from '@/components/MonacoQueryEditor'
import { TimeRangePicker } from '@/components/TimeRangePicker'
import { useLogsDatasources } from '@/hooks/useLogsDatasources'
import { useTimeRange } from '@/hooks/useTimeRange'
import { useFavoritesStore } from '@/stores/favoritesStore'
import { useOrgStore } from '@/stores/orgStore'
import {
  dataSourceTypeLabels,
  type DataSource,
  type DataSourceType,
  type LogEntry,
} from '@/types/datasource'
import { dataSourceTypeLogos } from '@/utils/datasourceLogos'

type DatasourceHealthStatus = 'unknown' | 'checking' | 'healthy' | 'unhealthy'
type LiveState = 'idle' | 'connecting' | 'connected' | 'reconnecting'

type TraceLogsNavigationContext = {
  traceId?: string
  serviceName?: string
  startMs?: number
  endMs?: number
  createdAt?: number
}

type LogsExplorePanelProps = {
  onDatasourceChanged?: (payload: { id: string; name: string; type: string }) => void
}

const HISTORY_KEY = 'explore_logs_query_history'
const MAX_HISTORY = 10
const TRACE_LOGS_NAVIGATION_CONTEXT_KEY = 'trace_logs_navigation'
const TRACE_NAVIGATION_MAX_AGE_MS = 5 * 60 * 1000
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

function getTypeLogo(type_: DataSourceType): string | undefined {
  return dataSourceTypeLogos[type_]
}

function getDefaultLogsQuery(type_: DataSourceType): string {
  switch (type_) {
    case 'loki':
      return '{job=~".+"}'
    case 'victorialogs':
      return '*'
    case 'clickhouse':
      return "SELECT\n  Timestamp AS timestamp,\n  Body AS message,\n  SeverityText AS level\nFROM ace_logs\nWHERE Timestamp >= toDateTime({start})\n  AND Timestamp <= toDateTime({end})\nORDER BY Timestamp DESC\nLIMIT 100"
    case 'cloudwatch':
      return 'fields @timestamp, @message\n| sort @timestamp desc\n| limit 100'
    case 'elasticsearch':
      return '*'
    default:
      return ''
  }
}

function getSmokeQuery(type_: DataSourceType): string {
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

function needsLogsSignal(type_: DataSourceType): boolean {
  return type_ === 'clickhouse' || type_ === 'cloudwatch' || type_ === 'elasticsearch'
}

export function LogsExplorePanel({ onDatasourceChanged }: LogsExplorePanelProps) {
  const currentOrgId = useOrgStore(state => state.currentOrgId)
  const { logsDatasources } = useLogsDatasources(currentOrgId)
  const { timeRange, onRefresh, setCustomRange } = useTimeRange()
  const toggleFavorite = useFavoritesStore(state => state.toggleFavorite)
  const isFavorite = useFavoritesStore(state => state.isFavorite)
  const [searchParams] = useSearchParams()

  const [selectedDatasourceId, setSelectedDatasourceId] = useState('')
  const [query, setQuery] = useState('')
  const [showExportModal, setShowExportModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [hasSuccessfulQuery, setHasSuccessfulQuery] = useState(false)
  const [isLive, setIsLive] = useState(false)
  const [liveState, setLiveState] = useState<LiveState>('idle')
  const [liveError, setLiveError] = useState<string | null>(null)
  const [liveReconnectAttempt, setLiveReconnectAttempt] = useState(0)
  const [queryHistory, setQueryHistory] = useState<string[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [showDatasourceMenu, setShowDatasourceMenu] = useState(false)
  const [datasourceHealth, setDatasourceHealth] = useState<Record<string, DatasourceHealthStatus>>(
    {},
  )
  const [datasourceHealthErrors, setDatasourceHealthErrors] = useState<Record<string, string>>({})
  const [indexedLabels, setIndexedLabels] = useState<string[]>([])
  const [highlightedLogKeys, setHighlightedLogKeys] = useState<Set<string>>(new Set())

  const datasourceMenuRef = useRef<HTMLDivElement | null>(null)
  const seenLogKeysRef = useRef<Set<string>>(new Set())
  const lastLiveTimestampSecRef = useRef<number | null>(null)
  const liveAbortControllerRef = useRef<AbortController | null>(null)
  const liveReconnectTimerRef = useRef<number | null>(null)
  const highlightTimeoutIdsRef = useRef<Map<string, number>>(new Map())
  const labelsCacheRef = useRef<Map<string, string[]>>(new Map())
  const pendingNavigationRef = useRef({
    traceId: '',
    serviceName: '',
    startMs: null as number | null,
    endMs: null as number | null,
  })

  const activeDatasource = useMemo(
    () => logsDatasources.find(ds => ds.id === selectedDatasourceId) ?? null,
    [logsDatasources, selectedDatasourceId],
  )

  const hasLogsDatasources = logsDatasources.length > 0
  const hasResults = hasSuccessfulQuery && logs.length > 0
  const newestFirstLogs = useMemo(() => sortLogsNewestFirst(logs), [logs])
  const highlightedLogKeyList = useMemo(() => Array.from(highlightedLogKeys), [highlightedLogKeys])

  const isClickHouseDatasource = activeDatasource?.type === 'clickhouse'
  const isCloudWatchDatasource = activeDatasource?.type === 'cloudwatch'
  const isElasticsearchDatasource = activeDatasource?.type === 'elasticsearch'
  const supportsLabelDiscovery =
    activeDatasource?.type === 'loki' || activeDatasource?.type === 'victorialogs'
  const supportsLiveStreaming =
    activeDatasource?.type === 'loki' || activeDatasource?.type === 'victorialogs'
  const queryLanguage = activeDatasource?.type === 'victorialogs' ? 'logsql' : 'logql'
  const queryPlaceholder =
    queryLanguage === 'logsql' ? '*' : '{job=~".+"} |= "error"'

  const activeDatasourceHealth = activeDatasource
    ? datasourceHealth[activeDatasource.id] || 'unknown'
    : 'unknown'

  const activeDatasourceHealthLabel =
    activeDatasourceHealth === 'healthy'
      ? 'Healthy'
      : activeDatasourceHealth === 'unhealthy'
        ? 'Unhealthy'
        : activeDatasourceHealth === 'checking'
          ? 'Checking...'
          : 'Unknown'

  const liveStatusLabel =
    liveState === 'connected'
      ? 'Live'
      : liveState === 'connecting'
        ? 'Connecting...'
        : liveState === 'reconnecting'
          ? 'Reconnecting...'
          : ''

  const isLiveBusy = liveState === 'connecting' || liveState === 'reconnecting'

  const addToHistory = useCallback((q: string) => {
    if (!q.trim()) return
    setQueryHistory(prev => {
      const filtered = prev.filter(item => item !== q)
      const next = [q, ...filtered].slice(0, MAX_HISTORY)
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const clearLogHighlights = useCallback(() => {
    for (const timeoutId of highlightTimeoutIdsRef.current.values()) {
      window.clearTimeout(timeoutId)
    }
    highlightTimeoutIdsRef.current = new Map()
    setHighlightedLogKeys(new Set())
  }, [])

  const markLogAsNew = useCallback((logKey: string) => {
    setHighlightedLogKeys(prev => new Set(prev).add(logKey))

    const existingTimeout = highlightTimeoutIdsRef.current.get(logKey)
    if (existingTimeout !== undefined) {
      window.clearTimeout(existingTimeout)
    }

    const timeoutId = window.setTimeout(() => {
      setHighlightedLogKeys(prev => {
        const next = new Set(prev)
        next.delete(logKey)
        return next
      })
      highlightTimeoutIdsRef.current.delete(logKey)
    }, NEW_LOG_HIGHLIGHT_MS)

    highlightTimeoutIdsRef.current.set(logKey, timeoutId)
  }, [])

  const resetLogCache = useCallback((entries: LogEntry[]) => {
    seenLogKeysRef.current = new Set(entries.map(getLogKey))
    lastLiveTimestampSecRef.current = getLatestTimestampSeconds(entries)
  }, [])

  const appendStreamLog = useCallback(
    (entry: LogEntry) => {
      const key = getLogKey(entry)
      if (seenLogKeysRef.current.has(key)) {
        return
      }

      seenLogKeysRef.current.add(key)
      markLogAsNew(key)

      const timestampSec = toUnixSeconds(entry.timestamp)
      if (
        timestampSec !== null &&
        (lastLiveTimestampSecRef.current === null ||
          timestampSec > lastLiveTimestampSecRef.current)
      ) {
        lastLiveTimestampSecRef.current = timestampSec
      }

      setLogs(prev => {
        const next = [...prev, entry]
        if (next.length <= MAX_STREAM_LOGS) {
          return next
        }

        const trimmed = sortLogsNewestFirst(next).slice(0, MAX_STREAM_LOGS)
        seenLogKeysRef.current = new Set(trimmed.map(getLogKey))

        const remainingKeys = new Set(trimmed.map(getLogKey))
        setHighlightedLogKeys(current =>
          new Set(Array.from(current).filter(logKey => remainingKeys.has(logKey))),
        )

        for (const [logKey, timeoutId] of highlightTimeoutIdsRef.current.entries()) {
          if (!remainingKeys.has(logKey)) {
            window.clearTimeout(timeoutId)
            highlightTimeoutIdsRef.current.delete(logKey)
          }
        }

        return trimmed
      })
    },
    [markLogAsNew],
  )

  const clearLiveReconnectTimer = useCallback(() => {
    if (liveReconnectTimerRef.current !== null) {
      window.clearTimeout(liveReconnectTimerRef.current)
      liveReconnectTimerRef.current = null
    }
  }, [])

  const cancelLiveStream = useCallback(() => {
    if (liveAbortControllerRef.current) {
      liveAbortControllerRef.current.abort()
      liveAbortControllerRef.current = null
    }
  }, [])

  const stopLive = useCallback(
    (resetError = true) => {
      setIsLive(false)
      setLiveState('idle')
      if (resetError) {
        setLiveError(null)
      }
      setLiveReconnectAttempt(0)
      clearLiveReconnectTimer()
      cancelLiveStream()
    },
    [cancelLiveStream, clearLiveReconnectTimer],
  )

  const getLiveStreamStart = useCallback(() => {
    if (lastLiveTimestampSecRef.current === null) {
      return Math.floor(Date.now() / 1000) - LIVE_RESUME_OVERLAP_SECONDS
    }
    return Math.max(0, lastLiveTimestampSecRef.current - LIVE_RESUME_OVERLAP_SECONDS)
  }, [])

  const openLiveStream = useCallback(async () => {
    if (!isLive || !selectedDatasourceId || !query.trim()) {
      return
    }

    clearLiveReconnectTimer()
    cancelLiveStream()

    liveAbortControllerRef.current = new AbortController()
    if (liveState !== 'reconnecting') {
      setLiveState('connecting')
    }

    try {
      await streamDataSourceLogs(
        selectedDatasourceId,
        {
          query,
          start: getLiveStreamStart(),
          limit: 200,
        },
        {
          onLog: appendStreamLog,
          onStatus: (status, message) => {
            if (!isLive) return

            if (status === 'connected') {
              setLiveState('connected')
              setLiveError(null)
              setLiveReconnectAttempt(0)
              return
            }

            if (status === 'connecting') {
              setLiveState('connecting')
            }

            if (message) {
              setLiveError(message)
            }
          },
          onError: message => {
            if (!isLive) return
            setLiveError(message)
          },
        },
        liveAbortControllerRef.current.signal,
      )

      if (!isLive) return

      setLiveError('Live stream disconnected')
      setLiveState('reconnecting')
      const delayMs = Math.min(
        LIVE_RECONNECT_MAX_DELAY_MS,
        LIVE_RECONNECT_BASE_DELAY_MS * 2 ** liveReconnectAttempt,
      )
      setLiveReconnectAttempt(prev => prev + 1)
      liveReconnectTimerRef.current = window.setTimeout(() => {
        void openLiveStream()
      }, delayMs)
    } catch (e) {
      if (!isLive) return
      if (e instanceof Error && e.name === 'AbortError') return

      setLiveError(e instanceof Error ? e.message : 'Live stream failed')
      setLiveState('reconnecting')
      const delayMs = Math.min(
        LIVE_RECONNECT_MAX_DELAY_MS,
        LIVE_RECONNECT_BASE_DELAY_MS * 2 ** liveReconnectAttempt,
      )
      setLiveReconnectAttempt(prev => prev + 1)
      liveReconnectTimerRef.current = window.setTimeout(() => {
        void openLiveStream()
      }, delayMs)
    }
  }, [
    appendStreamLog,
    cancelLiveStream,
    clearLiveReconnectTimer,
    getLiveStreamStart,
    isLive,
    liveReconnectAttempt,
    liveState,
    query,
    selectedDatasourceId,
  ])

  const runQuery = useCallback(async () => {
    const wasLive = isLive
    if (wasLive) {
      stopLive()
    }

    if (!selectedDatasourceId) {
      setError('Select a logs datasource')
      return
    }

    if (!query.trim()) {
      setError('Query is required')
      return
    }

    setLoading(true)
    setError(null)
    setLiveError(null)
    clearLogHighlights()
    setLogs([])
    seenLogKeysRef.current = new Set()
    lastLiveTimestampSecRef.current = null
    setHasSuccessfulQuery(false)

    try {
      const start = Math.floor(timeRange.start / 1000)
      const end = Math.floor(timeRange.end / 1000)
      const dsType = activeDatasource?.type

      const response = await queryDataSource(selectedDatasourceId, {
        query,
        signal: dsType && needsLogsSignal(dsType) ? 'logs' : undefined,
        start,
        end,
        step: 15,
        limit: 1000,
      })

      if (response.status === 'error') {
        setError(response.error || 'Query failed')
        return
      }

      if (response.resultType !== 'logs') {
        setError('Selected datasource did not return log results')
        return
      }

      const nextLogs = response.data?.logs || []
      setLogs(nextLogs)
      resetLogCache(nextLogs)
      setHasSuccessfulQuery(true)
      addToHistory(query)

      if (wasLive) {
        setIsLive(true)
        setLiveState('connecting')
        setLiveError(null)
        setLiveReconnectAttempt(0)
        void openLiveStream()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to execute query')
    } finally {
      setLoading(false)
    }
  }, [
    activeDatasource?.type,
    addToHistory,
    clearLogHighlights,
    isLive,
    openLiveStream,
    query,
    resetLogCache,
    selectedDatasourceId,
    stopLive,
    timeRange.end,
    timeRange.start,
  ])

  const startLive = useCallback(async () => {
    if (isLive || isLiveBusy) {
      return
    }

    if (!selectedDatasourceId) {
      setError('Select a logs datasource')
      return
    }

    if (!query.trim()) {
      setError('Query is required')
      return
    }

    if (!hasSuccessfulQuery) {
      await runQuery()
      return
    }

    setIsLive(true)
    setLiveState('connecting')
    setLiveError(null)
    setLiveReconnectAttempt(0)
    void openLiveStream()
  }, [
    hasSuccessfulQuery,
    isLive,
    isLiveBusy,
    openLiveStream,
    query,
    runQuery,
    selectedDatasourceId,
  ])

  const toggleLive = useCallback(() => {
    if (isLive) {
      stopLive()
      return
    }
    void startLive()
  }, [isLive, startLive, stopLive])

  const checkDatasourceHealth = useCallback(async (datasourceId: string, type_: DataSourceType) => {
    setDatasourceHealth(prev => ({ ...prev, [datasourceId]: 'checking' }))
    setDatasourceHealthErrors(prev => {
      const next = { ...prev }
      delete next[datasourceId]
      return next
    })

    const end = Math.floor(Date.now() / 1000)
    const start = end - 15 * 60

    try {
      const healthResult = await queryDataSource(datasourceId, {
        query: getSmokeQuery(type_),
        signal: needsLogsSignal(type_) ? 'logs' : undefined,
        start,
        end,
        step: 15,
        limit: 100,
      })

      if (healthResult.status === 'error') {
        throw new Error(healthResult.error || 'Health check failed')
      }

      setDatasourceHealth(prev => ({ ...prev, [datasourceId]: 'healthy' }))
    } catch (e) {
      setDatasourceHealth(prev => ({ ...prev, [datasourceId]: 'unhealthy' }))
      setDatasourceHealthErrors(prev => ({
        ...prev,
        [datasourceId]: e instanceof Error ? e.message : 'Health check failed',
      }))
    }
  }, [])

  const applyTraceLogsNavigationContext = useCallback(() => {
    const pending = pendingNavigationRef.current
    if (!pending.traceId) {
      return
    }

    setQuery(
      buildTraceLogsQuery(activeDatasource?.type || 'loki', pending.traceId, pending.serviceName),
    )

    if (pending.startMs !== null && pending.endMs !== null) {
      setCustomRange(pending.startMs, pending.endMs)
    }

    pendingNavigationRef.current = { traceId: '', serviceName: '', startMs: null, endMs: null }
  }, [activeDatasource?.type, setCustomRange])

  const loadIndexedLabels = useCallback(async (datasourceId: string) => {
    if (labelsCacheRef.current.has(datasourceId)) {
      setIndexedLabels(labelsCacheRef.current.get(datasourceId) || [])
      return
    }

    try {
      const labels = await fetchDataSourceLabels(datasourceId)
      labelsCacheRef.current.set(datasourceId, labels)
      if (selectedDatasourceId === datasourceId) {
        setIndexedLabels(labels)
      }
    } catch {
      if (selectedDatasourceId === datasourceId) {
        setIndexedLabels([])
      }
    }
  }, [selectedDatasourceId])

  useEffect(() => {
    const urlQuery = searchParams.get('q')
    if (urlQuery) {
      setQuery(urlQuery)
    }

    try {
      const rawContext = localStorage.getItem(TRACE_LOGS_NAVIGATION_CONTEXT_KEY)
      localStorage.removeItem(TRACE_LOGS_NAVIGATION_CONTEXT_KEY)
      if (rawContext) {
        const parsed = JSON.parse(rawContext) as TraceLogsNavigationContext
        if (typeof parsed.traceId === 'string' && parsed.traceId.trim()) {
          if (typeof parsed.createdAt !== 'number' || Date.now() - parsed.createdAt <= TRACE_NAVIGATION_MAX_AGE_MS) {
            pendingNavigationRef.current = {
              traceId: parsed.traceId.trim(),
              serviceName:
                typeof parsed.serviceName === 'string' ? parsed.serviceName.trim() : '',
              startMs:
                typeof parsed.startMs === 'number' &&
                typeof parsed.endMs === 'number' &&
                parsed.endMs > parsed.startMs
                  ? parsed.startMs
                  : null,
              endMs:
                typeof parsed.startMs === 'number' &&
                typeof parsed.endMs === 'number' &&
                parsed.endMs > parsed.startMs
                  ? parsed.endMs
                  : null,
            }
          }
        }
      }
    } catch {
      // Ignore malformed navigation context.
    }

    const stored = sessionStorage.getItem(HISTORY_KEY)
    if (stored) {
      try {
        setQueryHistory(JSON.parse(stored))
      } catch {
        setQueryHistory([])
      }
    }
  }, [searchParams])

  const previousOrgIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!currentOrgId) return
    if (previousOrgIdRef.current && previousOrgIdRef.current !== currentOrgId) {
      setSelectedDatasourceId('')
      setDatasourceHealth({})
      setDatasourceHealthErrors({})
      labelsCacheRef.current = new Map()
      setQuery('')
      setLogs([])
      setError(null)
      stopLive()
    }
    previousOrgIdRef.current = currentOrgId
  }, [currentOrgId, stopLive])

  useEffect(() => {
    if (logsDatasources.length === 0) {
      setSelectedDatasourceId('')
      return
    }

    const hasSelected = logsDatasources.some(ds => ds.id === selectedDatasourceId)
    if (!hasSelected) {
      const defaultDatasource = logsDatasources.find(ds => ds.is_default)
      const selected = defaultDatasource || logsDatasources[0]
      if (!selected) return
      setSelectedDatasourceId(selected.id)

      if (!query.trim()) {
        setQuery(getDefaultLogsQuery(selected.type))
      }
    }
  }, [logsDatasources, query, selectedDatasourceId])

  useEffect(() => {
    const sourceIds = new Set(logsDatasources.map(ds => ds.id))
    setDatasourceHealth(prev =>
      Object.fromEntries(Object.entries(prev).filter(([id]) => sourceIds.has(id))),
    )
    setDatasourceHealthErrors(prev =>
      Object.fromEntries(Object.entries(prev).filter(([id]) => sourceIds.has(id))),
    )

    const filteredCache = new Map<string, string[]>()
    for (const [id, labels] of labelsCacheRef.current.entries()) {
      if (sourceIds.has(id)) {
        filteredCache.set(id, labels)
      }
    }
    labelsCacheRef.current = filteredCache
  }, [logsDatasources])

  useEffect(() => {
    if (!activeDatasource) return

    if (pendingNavigationRef.current.traceId) {
      applyTraceLogsNavigationContext()
    }

    if ((datasourceHealth[activeDatasource.id] || 'unknown') === 'unknown') {
      void checkDatasourceHealth(activeDatasource.id, activeDatasource.type)
    }
  }, [activeDatasource, applyTraceLogsNavigationContext, checkDatasourceHealth, datasourceHealth])

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset UI when datasource selection changes
  useEffect(() => {
    setShowDatasourceMenu(false)
    stopLive()
    clearLogHighlights()
  }, [clearLogHighlights, selectedDatasourceId, stopLive])

  useEffect(() => {
    if (!supportsLiveStreaming && isLive) {
      stopLive()
    }
  }, [isLive, stopLive, supportsLiveStreaming])

  useEffect(() => {
    if (!selectedDatasourceId || !supportsLabelDiscovery) {
      setIndexedLabels([])
      return
    }

    void loadIndexedLabels(selectedDatasourceId)
  }, [loadIndexedLabels, selectedDatasourceId, supportsLabelDiscovery])

  useEffect(() => {
    const ds = logsDatasources.find(d => d.id === selectedDatasourceId)
    if (ds) {
      onDatasourceChanged?.({ id: ds.id, name: ds.name, type: ds.type })
    }
  }, [logsDatasources, onDatasourceChanged, selectedDatasourceId])

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      const target = event.target as Node
      if (!datasourceMenuRef.current?.contains(target)) {
        setShowDatasourceMenu(false)
      }
    }

    document.addEventListener('click', handleDocumentClick)
    return () => document.removeEventListener('click', handleDocumentClick)
  }, [])

  useEffect(() => {
    return onRefresh(() => {
      if (isLive) return
      if (query.trim() && selectedDatasourceId && hasSuccessfulQuery) {
        void runQuery()
      }
    })
  }, [hasSuccessfulQuery, isLive, onRefresh, query, runQuery, selectedDatasourceId])

  useEffect(() => {
    return () => {
      stopLive(false)
      clearLogHighlights()
    }
  }, [clearLogHighlights, stopLive])

  function handleKeydown(event: React.KeyboardEvent<HTMLDivElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      void runQuery()
    }
  }

  function selectDatasource(datasourceId: string) {
    const prevDs = logsDatasources.find(d => d.id === selectedDatasourceId)
    setSelectedDatasourceId(datasourceId)
    setShowDatasourceMenu(false)

    const newDs = logsDatasources.find(d => d.id === datasourceId)
    if (newDs && (!query.trim() || (prevDs && prevDs.type !== newDs.type))) {
      setQuery(getDefaultLogsQuery(newDs.type))
    }
  }

  function selectHistoryQuery(q: string) {
    setQuery(q)
    setShowHistory(false)
  }

  function clearHistory() {
    setQueryHistory([])
    sessionStorage.removeItem(HISTORY_KEY)
  }

  function toggleDatasourceMenu() {
    if (loading || !hasLogsDatasources) return
    setShowDatasourceMenu(prev => !prev)
  }

  const favoriteId = `explore::logs::${query}`

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: panel-level Ctrl/Cmd+Enter to run query
    <section className="flex flex-1 flex-col gap-6" onKeyDown={handleKeydown}>
      <div
        className="flex flex-col gap-4 rounded-lg p-4"
        style={{ backgroundColor: 'var(--color-surface-container-low)' }}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 max-md:grid-cols-1">
          <div className="flex flex-col gap-2.5">
            <label
              htmlFor="explore-logs-datasource-btn"
              className="text-xs font-semibold tracking-wide uppercase"
              style={{ color: 'var(--color-outline)' }}
            >
              Data Source
            </label>
            <div ref={datasourceMenuRef} className="relative">
              <button
                id="explore-logs-datasource-btn"
                type="button"
                className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  backgroundColor: 'var(--color-surface-container-high)',
                  border: '1px solid var(--color-outline-variant)',
                  color: 'var(--color-on-surface)',
                }}
                data-testid="explore-logs-datasource-btn"
                disabled={loading || !hasLogsDatasources}
                onClick={toggleDatasourceMenu}
              >
                {activeDatasource ? (
                  <>
                    <img
                      src={getTypeLogo(activeDatasource.type)}
                      alt={`${dataSourceTypeLabels[activeDatasource.type]} logo`}
                      className="h-7 w-7 shrink-0 object-contain"
                    />
                    <div className="flex min-w-0 flex-col gap-px">
                      <span
                        className="text-[0.68rem] tracking-wide uppercase"
                        style={{ color: 'var(--color-outline)' }}
                      >
                        Active Source
                      </span>
                      <strong
                        className="truncate text-sm font-semibold"
                        style={{ color: 'var(--color-on-surface)' }}
                      >
                        {activeDatasource.name}
                      </strong>
                      <span
                        className="font-mono text-xs tracking-[0.07em] uppercase"
                        style={{ color: 'var(--color-outline)' }}
                      >
                        {dataSourceTypeLabels[activeDatasource.type]}
                      </span>
                    </div>
                    <span
                      className="ml-auto inline-flex items-center gap-1.5 rounded-sm px-2.5 py-0.5 text-xs"
                      style={{
                        border: '1px solid var(--color-outline-variant)',
                        color:
                          activeDatasourceHealth === 'healthy'
                            ? 'var(--color-secondary)'
                            : activeDatasourceHealth === 'unhealthy'
                              ? 'var(--color-error)'
                              : 'var(--color-outline)',
                      }}
                      title={datasourceHealthErrors[activeDatasource.id]}
                    >
                      {activeDatasourceHealth === 'checking' ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : activeDatasourceHealth === 'healthy' ? (
                        <HeartPulse size={12} />
                      ) : activeDatasourceHealth === 'unhealthy' ? (
                        <CircleAlert size={12} />
                      ) : null}
                      <span>{activeDatasourceHealthLabel}</span>
                    </span>
                  </>
                ) : (
                  <span className="text-sm" style={{ color: 'var(--color-outline)' }}>
                    No logs datasource configured
                  </span>
                )}
                {showDatasourceMenu ? (
                  <ChevronUp size={16} className="ml-1 shrink-0" style={{ color: 'var(--color-outline)' }} />
                ) : (
                  <ChevronDown size={16} className="ml-1 shrink-0" style={{ color: 'var(--color-outline)' }} />
                )}
              </button>

              {showDatasourceMenu && hasLogsDatasources ? (
                <div
                  className="absolute top-full right-0 left-0 z-[110] mt-1.5 max-h-[280px] overflow-y-auto rounded-lg shadow-lg"
                  style={{
                    backgroundColor: 'var(--color-surface-bright)',
                    border: '1px solid var(--color-outline-variant)',
                  }}
                >
                  {logsDatasources.map((ds: DataSource) => (
                    <button
                      key={ds.id}
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-2.5 border-none bg-transparent px-3 py-2.5 text-left transition"
                      style={{
                        color: 'var(--color-on-surface)',
                        backgroundColor:
                          ds.id === selectedDatasourceId
                            ? 'color-mix(in srgb, var(--color-primary) 15%, transparent)'
                            : 'transparent',
                      }}
                      onClick={() => selectDatasource(ds.id)}
                    >
                      <img
                        src={getTypeLogo(ds.type)}
                        alt={`${dataSourceTypeLabels[ds.type]} logo`}
                        className="h-[18px] w-[18px] shrink-0 object-contain"
                      />
                      <div className="flex min-w-0 flex-col gap-px">
                        <strong className="text-sm font-semibold">{ds.name}</strong>
                        <span className="text-xs" style={{ color: 'var(--color-outline)' }}>
                          {dataSourceTypeLabels[ds.type]}
                        </span>
                      </div>
                      {ds.id === selectedDatasourceId ? (
                        <Check size={14} className="ml-auto" style={{ color: 'var(--color-primary)' }} />
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <span
              className="text-xs font-semibold tracking-wide uppercase"
              style={{ color: 'var(--color-outline)' }}
            >
              Query Range
            </span>
            <TimeRangePicker stacked />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {isClickHouseDatasource || isCloudWatchDatasource || isElasticsearchDatasource ? (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-[var(--color-on-surface)]">Query</span>
              <MonacoQueryEditor
                value={query}
                onChange={setQuery}
                onSubmit={() => void runQuery()}
                disabled={loading || !hasLogsDatasources}
                height={160}
                placeholder={
                  isClickHouseDatasource
                    ? 'Enter SQL query...'
                    : isCloudWatchDatasource
                      ? 'fields @timestamp, @message | sort @timestamp desc | limit 100'
                      : 'Enter Elasticsearch/Lucene query...'
                }
              />
            </div>
          ) : (
            <LogQLQueryBuilder
              value={query}
              onChange={setQuery}
              onSubmit={() => void runQuery()}
              queryLanguage={queryLanguage}
              datasourceId={selectedDatasourceId}
              indexedLabels={indexedLabels}
              disabled={loading || !hasLogsDatasources}
              editorHeight={130}
              placeholder={queryPlaceholder}
            />
          )}

          {queryHistory.length > 0 ? (
            <div className="relative">
              <button
                type="button"
                data-testid="explore-logs-history-btn"
                className="flex cursor-pointer items-center gap-1 border-none bg-transparent text-sm transition"
                style={{ color: showHistory ? 'var(--color-on-surface)' : 'var(--color-outline)' }}
                onClick={() => setShowHistory(prev => !prev)}
                title="Query history"
              >
                <History size={16} />
                <span>History</span>
              </button>

              {showHistory ? (
                <div
                  className="absolute top-full left-0 z-10 mt-1 max-h-[300px] w-80 overflow-y-auto rounded-lg shadow-lg max-md:w-full"
                  style={{ backgroundColor: 'var(--color-surface-container-low)' }}
                >
                  <div
                    className="flex items-center justify-between px-4 py-3 text-xs font-semibold tracking-wide uppercase"
                    style={{ color: 'var(--color-outline)' }}
                  >
                    <span>Recent Queries</span>
                    <button
                      type="button"
                      className="flex h-6 w-6 cursor-pointer items-center justify-center rounded border-none bg-transparent transition"
                      style={{ color: 'var(--color-outline)' }}
                      onClick={clearHistory}
                      title="Clear history"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  {queryHistory.map(historyQuery => (
                    <button
                      key={historyQuery}
                      type="button"
                      className="block w-full cursor-pointer border-none bg-transparent px-4 py-2.5 text-left transition hover:bg-[var(--color-surface-container-high)]"
                      onClick={() => selectHistoryQuery(historyQuery)}
                    >
                      <code
                        className="block truncate font-mono text-xs"
                        style={{ color: 'var(--color-on-surface-variant)' }}
                      >
                        {historyQuery}
                      </code>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            data-testid="explore-logs-run-query-btn"
            className="inline-flex cursor-pointer items-center gap-2 rounded-sm px-5 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)' }}
            disabled={loading || !query.trim() || !selectedDatasourceId || !hasLogsDatasources}
            onClick={() => void runQuery()}
          >
            <Play size={16} />
            <span>{loading ? 'Running...' : 'Run Query'}</span>
          </button>

          <button
            type="button"
            className={`inline-flex items-center gap-2 rounded-sm border px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
              isLive
                ? 'border-[var(--color-primary)]/20 bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                : 'border-[var(--color-outline-variant)] bg-[var(--color-surface-container-low)] text-[var(--color-on-surface)]'
            }`}
            data-testid="explore-logs-live-btn"
            disabled={
              loading ||
              !supportsLiveStreaming ||
              (!isLive && (!query.trim() || !selectedDatasourceId || !hasLogsDatasources))
            }
            onClick={toggleLive}
            title={
              supportsLiveStreaming
                ? ''
                : 'Live streaming is only available for Loki and Victoria Logs datasources'
            }
          >
            {isLiveBusy ? (
              <Loader2 size={16} className="animate-spin" />
            ) : isLive ? (
              <X size={16} />
            ) : (
              <HeartPulse size={16} />
            )}
            <span>{isLive ? 'Stop Live' : 'Start Live'}</span>
          </button>

          {query.trim() ? (
            <button
              type="button"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm border px-3 py-2.5 text-sm transition"
              style={{
                backgroundColor: isFavorite(favoriteId)
                  ? 'var(--color-primary-muted)'
                  : 'var(--color-surface-container-high)',
                borderColor: isFavorite(favoriteId)
                  ? 'var(--color-primary)'
                  : 'var(--color-stroke-subtle)',
                color: isFavorite(favoriteId)
                  ? 'var(--color-primary)'
                  : 'var(--color-on-surface-variant)',
              }}
              title={isFavorite(favoriteId) ? 'Remove from favorites' : 'Save to favorites'}
              onClick={() =>
                toggleFavorite({
                  id: favoriteId,
                  title: query.length > 40 ? `${query.slice(0, 40)}...` : query,
                  type: 'explore',
                })
              }
            >
              <Star size={14} fill={isFavorite(favoriteId) ? 'currentColor' : 'none'} />
            </button>
          ) : null}

          <button
            type="button"
            data-testid="explore-logs-export-btn"
            className="inline-flex items-center gap-2 rounded-sm border border-[var(--color-outline-variant)] bg-transparent px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              color: query.trim() ? 'var(--color-on-surface-variant)' : 'var(--color-outline)',
            }}
            disabled={!query.trim() || !selectedDatasourceId}
            onClick={() => setShowExportModal(true)}
          >
            <LayoutDashboard size={16} />
            <span>Add to Dashboard</span>
          </button>

          <span className="text-xs" style={{ color: 'var(--color-outline)' }}>
            Ctrl+Enter to run
          </span>

          {liveStatusLabel ? (
            <span
              className={`inline-flex items-center rounded-sm border px-2.5 py-0.5 text-xs ${
                liveState === 'connected'
                  ? 'border-[var(--color-primary)]/20 bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                  : 'border-[var(--color-outline-variant)] bg-[var(--color-surface)] text-[var(--color-outline)]'
              }`}
            >
              {liveStatusLabel}
            </span>
          ) : null}
        </div>

        {error ? (
          <div
            className="flex items-center gap-2 rounded border p-4 text-sm"
            style={{
              borderColor: 'color-mix(in srgb, var(--color-error) 25%, transparent)',
              backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
              color: 'var(--color-error)',
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        ) : liveError && isLive ? (
          <div className="flex items-center gap-2 rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
            <AlertCircle size={16} />
            <span>{liveError}</span>
          </div>
        ) : null}
      </div>

      <div
        className="flex min-h-[400px] flex-1 flex-col overflow-hidden rounded-lg"
        style={{ backgroundColor: 'var(--color-surface-container-low)' }}
      >
        {loading ? (
          <div
            className="flex flex-1 flex-col items-center justify-center gap-4 py-12"
            style={{ color: 'var(--color-outline)' }}
          >
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-t-[var(--color-primary)]" />
            <span className="text-sm">Executing query...</span>
          </div>
        ) : hasResults ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ backgroundColor: 'var(--color-surface-container-high)' }}
            >
              <span className="text-sm" style={{ color: 'var(--color-outline)' }}>
                {logs.length} {logs.length === 1 ? 'entry' : 'entries'}
              </span>
              {liveStatusLabel ? (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-0.5 text-xs ${
                    liveState === 'connected'
                      ? 'border-[var(--color-primary)]/20 bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                      : 'border-[var(--color-outline-variant)] bg-[var(--color-surface)] text-[var(--color-outline)]'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full bg-current ${
                      liveState === 'connected' ? 'animate-pulse' : ''
                    }`}
                  />
                  {liveStatusLabel}
                </span>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 p-4">
              <LogViewer
                logs={newestFirstLogs}
                highlightedLogKeys={highlightedLogKeyList}
                traceIdField={activeDatasource?.trace_id_field || 'trace_id'}
                linkedTraceDatasourceId={activeDatasource?.linked_trace_datasource_id || null}
              />
            </div>
          </div>
        ) : hasSuccessfulQuery && logs.length === 0 ? (
          <div
            className="flex flex-1 flex-col items-center justify-center py-12 text-center text-sm"
            style={{ color: 'var(--color-outline)' }}
          >
            <p className="m-0">No logs returned for the selected time range.</p>
          </div>
        ) : !hasLogsDatasources ? (
          <div
            className="flex flex-1 flex-col items-center justify-center py-12 text-center text-sm"
            style={{ color: 'var(--color-outline)' }}
          >
            <p className="m-0">No logs datasource configured.</p>
            <p className="m-0 text-xs">
              Add a Loki, Victoria Logs, CloudWatch, or Elasticsearch datasource in Data Sources.
            </p>
          </div>
        ) : (
          <div
            className="flex flex-1 flex-col items-center justify-center py-12 text-center text-sm"
            style={{ color: 'var(--color-outline)' }}
          >
            <p className="m-0">
              {isClickHouseDatasource
                ? 'Write a SQL query and click "Run Query" to inspect logs.'
                : isCloudWatchDatasource
                  ? 'Write a CloudWatch Logs Insights query and click "Run Query" to inspect logs.'
                  : isElasticsearchDatasource
                    ? 'Write an Elasticsearch/Lucene query and click "Run Query" to inspect logs.'
                    : 'Write a log query and click "Run Query" to inspect logs.'}
            </p>
          </div>
        )}
      </div>

      {showExportModal ? (
        <ExportToDashboardModal
          query={query}
          signal="logs"
          datasourceId={selectedDatasourceId}
          onClose={() => setShowExportModal(false)}
        />
      ) : null}
    </section>
  )
}