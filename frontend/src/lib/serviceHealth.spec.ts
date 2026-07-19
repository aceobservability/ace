import { describe, expect, it } from 'vitest'
import {
  deriveServiceHealth,
  formatErrorRate,
  formatLatencyMs,
  healthLabel,
} from '@/lib/serviceHealth'
import type { TraceSummary } from '@/types/datasource'

function summary(overrides: Partial<TraceSummary> = {}): TraceSummary {
  return {
    traceId: 't1',
    startTimeUnixNano: 0,
    durationNano: 10_000_000,
    spanCount: 3,
    serviceCount: 1,
    errorSpanCount: 0,
    ...overrides,
  }
}

describe('deriveServiceHealth', () => {
  it('returns unknown when there are no samples', () => {
    expect(deriveServiceHealth([])).toEqual({
      sampleCount: 0,
      errorRate: null,
      latencyP50Ms: null,
      latencyP95Ms: null,
      health: 'unknown',
    })
  })

  it('computes latency percentiles and healthy status', () => {
    const metrics = deriveServiceHealth([
      summary({ durationNano: 10_000_000 }),
      summary({ durationNano: 20_000_000 }),
      summary({ durationNano: 30_000_000 }),
      summary({ durationNano: 40_000_000 }),
    ])
    expect(metrics.sampleCount).toBe(4)
    expect(metrics.errorRate).toBe(0)
    expect(metrics.latencyP50Ms).toBe(25)
    expect(metrics.health).toBe('healthy')
  })

  it('marks critical when error rate is high', () => {
    const metrics = deriveServiceHealth([
      summary({ errorSpanCount: 1 }),
      summary({ errorSpanCount: 1 }),
      summary({ errorSpanCount: 0 }),
      summary({ errorSpanCount: 1 }),
    ])
    expect(metrics.errorRate).toBe(0.75)
    expect(metrics.health).toBe('critical')
  })
})

describe('format helpers', () => {
  it('formats latency and error rate', () => {
    expect(formatLatencyMs(null)).toBe('—')
    expect(formatLatencyMs(0.5)).toBe('500µs')
    expect(formatLatencyMs(12.3)).toBe('12ms')
    expect(formatLatencyMs(1500)).toBe('1.50s')
    expect(formatErrorRate(null)).toBe('—')
    expect(formatErrorRate(0.125)).toBe('12.5%')
    expect(healthLabel('warning')).toBe('Degraded')
  })
})
