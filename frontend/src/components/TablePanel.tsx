import { useMemo } from 'react'

type DataPoint = {
  timestamp: number
  value: number
}

type TableSeries = {
  name: string
  data: DataPoint[]
}

type TablePanelProps = {
  series: TableSeries[]
  height?: string | number
  decimals?: number
}

function formatTimestamp(ts: number): string {
  const date = new Date(ts * 1000)
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function TablePanel({ series, height = '100%', decimals = 2 }: TablePanelProps) {
  const timestamps = useMemo(() => {
    const tsSet = new Set<number>()
    for (const entry of series) {
      for (const point of entry.data) {
        tsSet.add(point.timestamp)
      }
    }
    return Array.from(tsSet).sort((a, b) => b - a)
  }, [series])

  const seriesDataMaps = useMemo(
    () =>
      series.map(entry => {
        const map = new Map<number, number>()
        for (const point of entry.data) {
          map.set(point.timestamp, point.value)
        }
        return map
      }),
    [series],
  )

  return (
    <div
      className="h-full overflow-auto rounded-lg bg-[var(--color-surface-container-low)]"
      style={{ height: typeof height === 'number' ? `${height}px` : height }}
      data-testid="table-panel"
    >
      <table className="w-full text-left">
        <thead className="sticky top-0 z-10 bg-[var(--color-surface-container-high)] font-mono text-xs uppercase tracking-[0.07em] text-[var(--color-on-surface-variant)]">
          <tr>
            <th className="min-w-[140px] px-4 py-3 font-semibold">Time</th>
            {series.map(entry => (
              <th key={entry.name} className="min-w-[100px] px-4 py-3 text-right font-semibold">
                {entry.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {timestamps.map(ts => (
            <tr
              key={ts}
              className="text-sm text-[var(--color-on-surface-variant)] transition-colors hover:bg-[var(--color-surface-container-high)]"
            >
              <td className="min-w-[140px] px-4 py-3 text-[var(--color-outline)]">
                {formatTimestamp(ts)}
              </td>
              {seriesDataMaps.map((map, index) => {
                const value = map.get(ts)
                return (
                  <td
                    key={`${series[index]?.name ?? index}-${ts}`}
                    className="min-w-[100px] px-4 py-3 text-right font-mono tabular-nums text-[var(--color-on-surface)]"
                  >
                    {value === undefined ? '-' : value.toFixed(decimals)}
                  </td>
                )
              })}
            </tr>
          ))}
          {timestamps.length === 0 ? (
            <tr>
              <td
                colSpan={series.length + 1}
                className="py-8 text-center text-sm text-[var(--color-outline)]"
              >
                No data available
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}
