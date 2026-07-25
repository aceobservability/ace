import type { DataSourceType, LogEntry } from '@/types/datasource'

export type LiveState = 'idle' | 'connecting' | 'connected' | 'reconnecting'

export type TraceLogsNavigationContext = {
  traceId?: string
  serviceName?: string
  startMs?: number
  endMs?: number
  createdAt?: number
}

export const LOGS_HISTORY_KEY = 'explore_logs_query_history'
export const TRACE_LOGS_NAVIGATION_CONTEXT_KEY = 'trace_logs_navigation'
export const MAX_STREAM_LOGS = 2000
export const LIVE_RESUME_OVERLAP_SECONDS = 5
export const LIVE_RECONNECT_BASE_DELAY_MS = 1000
export const LIVE_RECONNECT_MAX_DELAY_MS = 15000
export const NEW_LOG_HIGHLIGHT_MS = 2500

function escapeForDoubleQuotedValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function escapeForSingleQuotedValue(value: string): string {
  return value.replace(/'/g, "''")
}

export function getDefaultLogsQuery(type_: DataSourceType): string {
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

export function getLogsSmokeQuery(type_: DataSourceType): string {
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

export function buildTraceLogsQuery(
  type_: DataSourceType,
  traceId: string,
  serviceName: string,
): string {
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

export function sortLogsNewestFirst(entries: LogEntry[]): LogEntry[] {
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

export function getLogKey(log: LogEntry): string {
  const labels = Object.entries(log.labels || {})
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    .map(([key, value]) => `${key}=${value}`)
    .join(',')
  return `${log.timestamp}|${labels}|${log.line}`
}

export function toUnixSeconds(timestamp: string): number | null {
  const parsed = Date.parse(timestamp)
  if (Number.isNaN(parsed)) {
    return null
  }
  return Math.floor(parsed / 1000)
}

export function getLatestTimestampSeconds(entries: LogEntry[]): number | null {
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

export function needsLogsSignal(type_: DataSourceType): boolean {
  return type_ === 'clickhouse' || type_ === 'cloudwatch' || type_ === 'elasticsearch'
}
