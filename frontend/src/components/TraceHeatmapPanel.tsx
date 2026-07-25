import { useMemo } from 'react'
import type { TraceSummary } from '@/types/datasource'
import { formatDurationNano } from '@/utils/traceFormat'

type DurationBucket = {
  label: string
  maxExclusive: number
}

type TraceHeatmapPanelProps = {
  traces: TraceSummary[]
  onOpenTrace?: (traceId: string) => void
}

const TIME_BUCKETS = 12
const durationBuckets: DurationBucket[] = [
  { label: '<1ms', maxExclusive: 1_000_000 },
  { label: '1-5ms', maxExclusive: 5_000_000 },
  { label: '5-20ms', maxExclusive: 20_000_000 },
  { label: '20-100ms', maxExclusive: 100_000_000 },
  { label: '100-500ms', maxExclusive: 500_000_000 },
  { label: '0.5-1s', maxExclusive: 1_000_000_000 },
  { label: '1-5s', maxExclusive: 5_000_000_000 },
  { label: '>=5s', maxExclusive: Number.POSITIVE_INFINITY },
]

function durationBucketIndex(durationNano: number): number {
  const idx = durationBuckets.findIndex(bucket => durationNano < bucket.maxExclusive)
  return idx === -1 ? durationBuckets.length - 1 : idx
}

export function TraceHeatmapPanel({ traces, onOpenTrace }: TraceHeatmapPanelProps) {
  const sortedByStart = useMemo(
    () => [...traces].sort((a, b) => b.startTimeUnixNano - a.startTimeUnixNano),
    [traces],
  )

  const timeRange = useMemo(() => {
    if (traces.length === 0) return { min: 0, max: 0, width: 1 }
    let min = traces[0]!.startTimeUnixNano
    let max = traces[0]!.startTimeUnixNano
    for (const trace of traces) {
      if (trace.startTimeUnixNano < min) min = trace.startTimeUnixNano
      if (trace.startTimeUnixNano > max) max = trace.startTimeUnixNano
    }
    return { min, max, width: Math.max(1, max - min) }
  }, [traces])

  const matrix = useMemo(() => {
    const rows = Array.from({ length: durationBuckets.length }, () =>
      Array.from({ length: TIME_BUCKETS }, () => 0),
    )
    for (const trace of traces) {
      const durationIdx = durationBucketIndex(trace.durationNano)
      let timeIdx = 0
      if (traces.length > 1) {
        const relativePosition = (trace.startTimeUnixNano - timeRange.min) / timeRange.width
        timeIdx = Math.max(
          0,
          Math.min(TIME_BUCKETS - 1, Math.floor(relativePosition * TIME_BUCKETS)),
        )
      }
      rows[durationIdx]![timeIdx]! += 1
    }
    return rows
  }, [timeRange, traces])

  const maxCellCount = useMemo(() => {
    let max = 0
    for (const row of matrix) {
      for (const count of row) {
        if (count > max) max = count
      }
    }
    return max
  }, [matrix])

  const heatmapRows = useMemo(() => {
    const rows: Array<{ label: string; cells: number[] }> = []
    for (let i = durationBuckets.length - 1; i >= 0; i -= 1) {
      rows.push({
        label: durationBuckets[i]!.label,
        cells: matrix[i]!,
      })
    }
    return rows
  }, [matrix])

  const timeLabels = useMemo(() => {
    if (traces.length === 0) return ['-', '-', '-', '-']
    const labels: string[] = []
    for (const checkpoint of [0, 0.33, 0.66, 1]) {
      const unixNano = timeRange.min + Math.floor(timeRange.width * checkpoint)
      labels.push(new Date(Math.floor(unixNano / 1_000_000)).toLocaleTimeString())
    }
    return labels
  }, [timeRange, traces.length])

  const recentTraces = sortedByStart.slice(0, 6)

  function cellBg(count: number): string {
    if (maxCellCount === 0) return 'rgba(16, 185, 129, 0.06)'
    const intensity = count / maxCellCount
    const alpha = 0.06 + intensity * 0.7
    return `rgba(16, 185, 129, ${alpha})`
  }

  function cellTitle(rowLabel: string, cellIndex: number, count: number): string {
    if (count === 0) return `${rowLabel}, bucket ${cellIndex + 1}: no traces`
    return `${rowLabel}, bucket ${cellIndex + 1}: ${count} trace${count === 1 ? '' : 's'}`
  }

  return (
    <div
      className="flex h-full flex-col gap-2.5 rounded bg-[var(--color-surface-container-low)] p-4"
      data-testid="trace-heatmap-panel"
    >
      <div className="grid min-h-[150px] grid-cols-[auto_1fr] gap-2">
        <div className="grid grid-rows-[repeat(8,1fr)] gap-[3px]">
          {heatmapRows.map(row => (
            <span
              key={row.label}
              className="flex items-center justify-end whitespace-nowrap text-[0.65rem] text-[var(--color-outline)]"
            >
              {row.label}
            </span>
          ))}
        </div>
        <div className="grid grid-rows-[repeat(8,1fr)] gap-[3px]">
          {heatmapRows.map(row => (
            <div key={row.label} className="grid grid-cols-[repeat(12,1fr)] gap-[3px]">
              {row.cells.map((count, cellIndex) => {
                const bucketKey = `${row.label}-t${cellIndex}`
                return (
                  <div
                    key={bucketKey}
                    className="min-h-4 rounded border border-[var(--color-primary)]/20"
                    style={{ backgroundColor: cellBg(count) }}
                    title={cellTitle(row.label, cellIndex, count)}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="ml-[calc(3.9rem+0.45rem)] flex justify-between text-[0.65rem] text-[var(--color-outline)]">
        {timeLabels.map(label => (
          <span key={`time-${label}`}>{label}</span>
        ))}
      </div>

      <div className="border-t pt-2">
        <h4 className="m-0 mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-outline)]">
          Recent traces
        </h4>
        <ul className="m-0 grid list-none grid-cols-2 gap-x-2.5 gap-y-1.5 p-0">
          {recentTraces.map(trace => (
            <li key={trace.traceId}>
              <button
                type="button"
                className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-sm border-none bg-[var(--color-primary)]/10 px-2.5 py-1.5 transition hover:bg-[var(--color-primary)]/10"
                onClick={() => onOpenTrace?.(trace.traceId)}
              >
                <span className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-xs text-[var(--color-on-surface)]">
                  {trace.traceId}
                </span>
                <span className="text-xs text-[var(--color-outline)]">
                  {formatDurationNano(trace.durationNano)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
