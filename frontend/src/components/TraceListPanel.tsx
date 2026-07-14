import { useMemo, useState } from 'react'
import type { TraceSummary } from '@/types/datasource'
import { formatDurationNano, formatTraceStartFull } from '@/utils/traceFormat'

type TraceSortField =
  | 'traceId'
  | 'startTimeUnixNano'
  | 'durationNano'
  | 'spanCount'
  | 'errorSpanCount'
type TraceSortDirection = 'asc' | 'desc'

type TraceListPanelProps = {
  traces: TraceSummary[]
  onOpenTrace?: (traceId: string) => void
}

export function TraceListPanel({ traces, onOpenTrace }: TraceListPanelProps) {
  const [sortField, setSortField] = useState<TraceSortField>('startTimeUnixNano')
  const [sortDirection, setSortDirection] = useState<TraceSortDirection>('desc')

  const sortedTraces = useMemo(() => {
    const directionFactor = sortDirection === 'asc' ? 1 : -1
    return [...traces].sort((left, right) => {
      const leftValue = left[sortField]
      const rightValue = right[sortField]

      if (typeof leftValue === 'string' && typeof rightValue === 'string') {
        return leftValue.localeCompare(rightValue) * directionFactor
      }

      return ((leftValue as number) - (rightValue as number)) * directionFactor
    })
  }, [traces, sortDirection, sortField])

  function toggleSort(field: TraceSortField) {
    if (sortField === field) {
      setSortDirection(current => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortField(field)
    setSortDirection(field === 'traceId' ? 'asc' : 'desc')
  }

  function sortIndicator(field: TraceSortField): string {
    if (sortField !== field) {
      return ''
    }
    return sortDirection === 'asc' ? '\u2191' : '\u2193'
  }

  return (
    <div className="h-full overflow-auto rounded bg-[var(--color-surface-container-low)]">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-[var(--color-surface-container-high)]">
          <tr>
            {(
              [
                ['traceId', 'Trace'],
                ['startTimeUnixNano', 'Start'],
                ['durationNano', 'Duration'],
                ['spanCount', 'Spans'],
                ['errorSpanCount', 'Errors'],
              ] as const
            ).map(([field, label]) => (
              <th
                key={field}
                className="border-b border-[var(--color-stroke-subtle)] px-4 py-3 text-left align-middle"
              >
                <button
                  type="button"
                  className="cursor-pointer border-none bg-transparent p-0 text-xs font-semibold text-[var(--color-outline)] transition hover:text-[var(--color-on-surface)]"
                  onClick={() => toggleSort(field)}
                >
                  {label} {sortIndicator(field)}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedTraces.map(trace => (
            <tr
              key={trace.traceId}
              className="transition hover:bg-[var(--color-surface-container-high)]"
            >
              <td className="max-w-[220px] border-b border-[var(--color-stroke-subtle)] px-4 py-3 align-middle">
                <button
                  type="button"
                  className="inline-block w-full cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap border-none bg-transparent p-0 text-left font-mono text-xs text-[var(--color-primary)] transition hover:text-[var(--color-primary)] hover:underline"
                  onClick={() => onOpenTrace?.(trace.traceId)}
                >
                  {trace.traceId}
                </button>
              </td>
              <td className="border-b border-[var(--color-stroke-subtle)] px-4 py-3 align-middle text-sm text-[var(--color-on-surface-variant)]">
                {formatTraceStartFull(trace.startTimeUnixNano)}
              </td>
              <td className="border-b border-[var(--color-stroke-subtle)] px-4 py-3 align-middle font-mono text-xs text-[var(--color-outline)]">
                {formatDurationNano(trace.durationNano)}
              </td>
              <td className="border-b border-[var(--color-stroke-subtle)] px-4 py-3 align-middle text-sm text-[var(--color-on-surface-variant)]">
                {trace.spanCount}
              </td>
              <td className="border-b border-[var(--color-stroke-subtle)] px-4 py-3 align-middle">
                <span
                  className={
                    trace.errorSpanCount > 0
                      ? 'font-semibold text-[var(--color-error)]'
                      : 'text-[var(--color-on-surface-variant)]'
                  }
                >
                  {trace.errorSpanCount}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}