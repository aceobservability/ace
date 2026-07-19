import type { TraceSummary } from '@/types/datasource'

export type ServiceHealthStatus = 'healthy' | 'warning' | 'critical' | 'info' | 'unknown'

export interface ServiceHealthMetrics {
  sampleCount: number
  errorRate: number | null
  latencyP50Ms: number | null
  latencyP95Ms: number | null
  health: ServiceHealthStatus
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null
  if (sorted.length === 1) return sorted[0]!
  const index = (sorted.length - 1) * p
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]!
  const weight = index - lower
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight
}

/**
 * Derive health / latency / error-rate views from recent trace summaries for a service.
 * Uses real telemetry only — never fabricates sample values.
 */
export function deriveServiceHealth(summaries: TraceSummary[]): ServiceHealthMetrics {
  if (summaries.length === 0) {
    return {
      sampleCount: 0,
      errorRate: null,
      latencyP50Ms: null,
      latencyP95Ms: null,
      health: 'unknown',
    }
  }

  const durationsMs = summaries
    .map(s => s.durationNano / 1_000_000)
    .filter(v => Number.isFinite(v) && v >= 0)
    .sort((a, b) => a - b)

  const errorTraces = summaries.filter(s => (s.errorSpanCount ?? 0) > 0).length
  const errorRate = errorTraces / summaries.length
  const latencyP50Ms = percentile(durationsMs, 0.5)
  const latencyP95Ms = percentile(durationsMs, 0.95)

  let health: ServiceHealthStatus = 'healthy'
  if (errorRate >= 0.25 || (latencyP95Ms !== null && latencyP95Ms >= 5000)) {
    health = 'critical'
  } else if (errorRate >= 0.05 || (latencyP95Ms !== null && latencyP95Ms >= 1000)) {
    health = 'warning'
  }

  return {
    sampleCount: summaries.length,
    errorRate,
    latencyP50Ms,
    latencyP95Ms,
    health,
  }
}

export function formatLatencyMs(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '—'
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`
  if (ms < 1000) return `${ms.toFixed(ms < 10 ? 1 : 0)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

export function formatErrorRate(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return '—'
  return `${(rate * 100).toFixed(rate < 0.01 ? 2 : 1)}%`
}

export function healthLabel(status: ServiceHealthStatus): string {
  switch (status) {
    case 'healthy':
      return 'Healthy'
    case 'warning':
      return 'Degraded'
    case 'critical':
      return 'Critical'
    case 'info':
      return 'Info'
    default:
      return 'Not evaluated'
  }
}
