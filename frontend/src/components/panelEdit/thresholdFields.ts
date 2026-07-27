export type Threshold = {
  id: string
  value: number
  color: string
}

let thresholdIdCounter = 0

export function nextThresholdId() {
  thresholdIdCounter += 1
  return `threshold-${thresholdIdCounter}`
}

export function toThreshold(value: number, color: string, id?: string): Threshold {
  return { id: id ?? nextThresholdId(), value, color }
}

export function readQueryString(query: Record<string, unknown> | undefined, key: string): string {
  const value = query?.[key]
  return typeof value === 'string' ? value : ''
}

export function readQueryNumber(
  query: Record<string, unknown> | undefined,
  key: string,
  fallback: number,
): number {
  const value = query?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function readThresholds(query: Record<string, unknown> | undefined): Threshold[] {
  if (!Array.isArray(query?.thresholds)) return []
  return (query.thresholds as Array<{ value?: number; color?: string }>).map(threshold =>
    toThreshold(
      typeof threshold.value === 'number' ? threshold.value : 0,
      typeof threshold.color === 'string' ? threshold.color : '#feca57',
    ),
  )
}

export function thresholdsForQuery(thresholds: Threshold[]): Array<{ value: number; color: string }> {
  return thresholds.map(({ value, color }) => ({ value, color }))
}
