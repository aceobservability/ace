import { getTypeLogo } from '@/components/explore/exploreShared'

export { getTypeLogo }
export type { DatasourceHealthStatus, ExploreDatasourceChanged } from '@/components/explore/exploreShared'
export { healthLabel, TRACE_NAVIGATION_MAX_AGE_MS } from '@/components/explore/exploreShared'

export const CLICKHOUSE_DEFAULT_QUERY =
  "SELECT\n  SpanId AS span_id,\n  ParentSpanId AS parent_span_id,\n  SpanName AS operation_name,\n  ServiceName AS service_name,\n  toUnixTimestamp64Nano(Timestamp) AS start_time_unix_nano,\n  Duration AS duration_nano,\n  StatusCode AS status\nFROM ace_traces\nWHERE Timestamp BETWEEN fromUnixTimestamp64Nano({start_ns}) AND fromUnixTimestamp64Nano({end_ns})\nLIMIT 200"

export const TRACE_NAVIGATION_CONTEXT_KEY = 'dashboard_trace_navigation'
export const TRACE_LOGS_NAVIGATION_CONTEXT_KEY = 'trace_logs_navigation'
export const TRACE_METRICS_NAVIGATION_CONTEXT_KEY = 'trace_metrics_navigation'
export const TRACE_TO_X_PADDING_MS = 5 * 60 * 1000

export function toMilliseconds(unixNanoTimestamp: number): number {
  return Math.floor(unixNanoTimestamp / 1_000_000)
}


export function buildNavigationWindow(payload: {
  startTimeUnixNano: number
  endTimeUnixNano: number
}): { startMs: number; endMs: number } {
  const startMs = toMilliseconds(payload.startTimeUnixNano)
  const endMs = toMilliseconds(payload.endTimeUnixNano)
  const paddedStartMs = Math.max(0, startMs - TRACE_TO_X_PADDING_MS)
  const paddedEndMs = Math.max(paddedStartMs + 1_000, endMs + TRACE_TO_X_PADDING_MS)
  return { startMs: paddedStartMs, endMs: paddedEndMs }
}

export function writeTraceLogsNavigationContext(payload: {
  traceId: string
  serviceName: string
  startTimeUnixNano: number
  endTimeUnixNano: number
}) {
  const { startMs, endMs } = buildNavigationWindow(payload)
  try {
    localStorage.setItem(
      TRACE_LOGS_NAVIGATION_CONTEXT_KEY,
      JSON.stringify({
        traceId: payload.traceId,
        serviceName: payload.serviceName || undefined,
        startMs,
        endMs,
        createdAt: Date.now(),
      }),
    )
  } catch {
    // Ignore localStorage write issues.
  }
}

export function writeServiceMetricsNavigationContext(payload: {
  serviceName: string
  startTimeUnixNano: number
  endTimeUnixNano: number
}) {
  const { startMs, endMs } = buildNavigationWindow(payload)
  try {
    localStorage.setItem(
      TRACE_METRICS_NAVIGATION_CONTEXT_KEY,
      JSON.stringify({
        serviceName: payload.serviceName || undefined,
        startMs,
        endMs,
        createdAt: Date.now(),
      }),
    )
  } catch {
    // Ignore localStorage write issues.
  }
}
