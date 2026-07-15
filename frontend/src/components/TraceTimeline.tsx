import { useMemo, useState } from 'react'
import type { Trace, TraceSpan } from '@/types/datasource'
import { chartPalette, thresholdColors } from '@/utils/chartTheme'
import { formatDurationNano } from '@/utils/traceFormat'

interface SpanRow {
  span: TraceSpan
  depth: number
}

interface LongestPathResult {
  score: number
  path: string[]
}

type TraceTimelineProps = {
  trace: Trace
  selectedSpanId?: string | null
  onSelectSpan?: (span: TraceSpan) => void
}

const axisHeight = 34
const rowHeight = 30
const labelWidth = 300
const barsWidth = 880
const markerCount = 6
const serviceColorPalette = chartPalette

function spanSort(a: TraceSpan, b: TraceSpan): number {
  if (a.startTimeUnixNano === b.startTimeUnixNano) {
    return b.durationNano - a.durationNano
  }
  return a.startTimeUnixNano - b.startTimeUnixNano
}

function clamped(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function TraceTimeline({ trace, selectedSpanId, onSelectSpan }: TraceTimelineProps) {
  const [zoomPercent, setZoomPercent] = useState(100)
  const [panPercent, setPanPercent] = useState(0)

  const spanMap = useMemo(() => {
    const byId = new Map<string, TraceSpan>()
    for (const span of trace.spans) {
      byId.set(span.spanId, span)
    }
    return byId
  }, [trace.spans])

  const childMap = useMemo(() => {
    const children = new Map<string, TraceSpan[]>()
    for (const span of trace.spans) {
      if (!span.parentSpanId) {
        continue
      }

      const list = children.get(span.parentSpanId) || []
      list.push(span)
      children.set(span.parentSpanId, list)
    }

    for (const [parentSpanId, spans] of children.entries()) {
      spans.sort(spanSort)
      children.set(parentSpanId, spans)
    }

    return children
  }, [trace.spans])

  const orderedRows = useMemo<SpanRow[]>(() => {
    const rows: SpanRow[] = []
    const visited = new Set<string>()

    const roots = trace.spans
      .filter(
        (span) =>
          !span.parentSpanId || !spanMap.has(span.parentSpanId) || span.parentSpanId === span.spanId,
      )
      .sort(spanSort)

    const walk = (span: TraceSpan, depth: number) => {
      if (visited.has(span.spanId)) {
        return
      }

      visited.add(span.spanId)
      rows.push({ span, depth })

      const children = childMap.get(span.spanId) || []
      for (const child of children) {
        walk(child, depth + 1)
      }
    }

    for (const root of roots) {
      walk(root, 0)
    }

    const leftovers = trace.spans.filter((span) => !visited.has(span.spanId)).sort(spanSort)
    for (const span of leftovers) {
      walk(span, 0)
    }

    return rows
  }, [trace.spans, spanMap, childMap])

  const traceBounds = useMemo(() => {
    if (trace.spans.length === 0) {
      return {
        start: 0,
        end: 1,
        totalDuration: 1,
      }
    }

    // Loop instead of Math.min/max(...arr) to avoid call-stack argument limits
    // on dense traces (spread can exceed engine arg caps ~65k–500k).
    let minStart = Number.POSITIVE_INFINITY
    let maxEnd = Number.NEGATIVE_INFINITY
    for (const span of trace.spans) {
      if (span.startTimeUnixNano < minStart) {
        minStart = span.startTimeUnixNano
      }
      const spanEnd = span.startTimeUnixNano + Math.max(span.durationNano, 1)
      if (spanEnd > maxEnd) {
        maxEnd = spanEnd
      }
    }

    const traceStart =
      trace.startTimeUnixNano > 0 ? Math.min(trace.startTimeUnixNano, minStart) : minStart
    const traceEndFromDuration = traceStart + Math.max(trace.durationNano, 1)
    const traceEnd = Math.max(maxEnd, traceEndFromDuration)

    return {
      start: traceStart,
      end: traceEnd,
      totalDuration: Math.max(traceEnd - traceStart, 1),
    }
  }, [trace])

  const zoomScale = useMemo(() => Math.max(1, zoomPercent / 100), [zoomPercent])
  const windowDuration = useMemo(
    () => traceBounds.totalDuration / zoomScale,
    [traceBounds.totalDuration, zoomScale],
  )
  const maxPanDuration = useMemo(
    () => Math.max(traceBounds.totalDuration - windowDuration, 0),
    [traceBounds.totalDuration, windowDuration],
  )
  const windowStart = useMemo(
    () => traceBounds.start + maxPanDuration * (panPercent / 100),
    [traceBounds.start, maxPanDuration, panPercent],
  )
  const windowEnd = useMemo(
    () => windowStart + windowDuration,
    [windowStart, windowDuration],
  )

  const visibleRows = useMemo(() => {
    return orderedRows.filter((row) => {
      const spanStart = row.span.startTimeUnixNano
      const spanEnd = spanStart + Math.max(row.span.durationNano, 1)
      return spanStart <= windowEnd && spanEnd >= windowStart
    })
  }, [orderedRows, windowStart, windowEnd])

  const svgHeight = useMemo(
    () => axisHeight + Math.max(visibleRows.length, 1) * rowHeight + 10,
    [visibleRows.length],
  )
  const svgWidth = labelWidth + barsWidth + 12

  const serviceColorMap = useMemo(() => {
    const services = [
      ...new Set(trace.spans.map((span) => span.serviceName || 'unknown')),
    ].sort()
    const map = new Map<string, string>()
    services.forEach((service, index) => {
      map.set(service, serviceColorPalette[index % serviceColorPalette.length])
    })
    return map
  }, [trace.spans])

  const timeMarkers = useMemo(() => {
    const markers: Array<{ x: number; label: string }> = []
    for (let i = 0; i <= markerCount; i += 1) {
      const ratio = i / markerCount
      const timestamp = windowStart + windowDuration * ratio
      markers.push({
        x: labelWidth + barsWidth * ratio,
        label: `+${formatDurationNano(Math.max(timestamp - traceBounds.start, 0))}`,
      })
    }
    return markers
  }, [windowStart, windowDuration, traceBounds.start])

  const criticalPathSpanIds = useMemo(() => {
    const memo = new Map<string, LongestPathResult>()

    const longestPath = (spanId: string, stack: Set<string>): LongestPathResult => {
      if (memo.has(spanId)) {
        return memo.get(spanId) as LongestPathResult
      }

      if (stack.has(spanId)) {
        const loopSpan = spanMap.get(spanId)
        const fallback = {
          score: Math.max(loopSpan?.durationNano || 0, 1),
          path: loopSpan ? [loopSpan.spanId] : [],
        }
        memo.set(spanId, fallback)
        return fallback
      }

      const span = spanMap.get(spanId)
      if (!span) {
        const empty = { score: 0, path: [] }
        memo.set(spanId, empty)
        return empty
      }

      stack.add(spanId)
      let bestChild: LongestPathResult = { score: 0, path: [] }
      const children = childMap.get(spanId) || []
      for (const child of children) {
        const candidate = longestPath(child.spanId, stack)
        if (candidate.score > bestChild.score) {
          bestChild = candidate
        }
      }
      stack.delete(spanId)

      const result = {
        score: Math.max(span.durationNano, 1) + bestChild.score,
        path: [span.spanId, ...bestChild.path],
      }
      memo.set(spanId, result)
      return result
    }

    const roots = orderedRows.filter((row) => row.depth === 0).map((row) => row.span)

    let best: LongestPathResult = { score: 0, path: [] }
    for (const root of roots) {
      const candidate = longestPath(root.spanId, new Set<string>())
      if (candidate.score > best.score) {
        best = candidate
      }
    }

    if (best.path.length === 0) {
      for (const span of trace.spans) {
        const candidate = longestPath(span.spanId, new Set<string>())
        if (candidate.score > best.score) {
          best = candidate
        }
      }
    }

    return new Set(best.path)
  }, [orderedRows, spanMap, childMap, trace.spans])

  function getServiceColor(serviceName: string): string {
    return serviceColorMap.get(serviceName || 'unknown') || chartPalette[7]
  }

  function spanStartToX(startTimeUnixNano: number): number {
    const ratio = (startTimeUnixNano - windowStart) / windowDuration
    return labelWidth + clamped(ratio, 0, 1) * barsWidth
  }

  function spanWidth(durationNano: number, startTimeUnixNano: number): number {
    const startX = spanStartToX(startTimeUnixNano)
    const endX = spanStartToX(startTimeUnixNano + Math.max(durationNano, 1))
    return Math.max(endX - startX, 3)
  }

  function rowY(rowIndex: number): number {
    return axisHeight + rowIndex * rowHeight
  }

  function spanBarStroke(span: TraceSpan): string {
    if (span.status === 'error') return thresholdColors.critical
    if (criticalPathSpanIds.has(span.spanId)) return thresholdColors.warning
    if (span.spanId === selectedSpanId) return 'var(--color-outline-variant)'
    return 'transparent'
  }

  function spanBarStrokeWidth(span: TraceSpan): number {
    if (span.status === 'error') return 2
    if (span.spanId === selectedSpanId) return 2
    if (criticalPathSpanIds.has(span.spanId)) return 1.5
    return 1.5
  }

  function spanBarOpacity(span: TraceSpan): number {
    return span.spanId === selectedSpanId ? 1 : 0.85
  }

  function rowBgFill(rowIndex: number): string {
    return rowIndex % 2 === 0
      ? 'var(--color-surface-container-low)'
      : 'var(--color-surface-container-high)'
  }

  return (
    <div className="flex flex-col gap-3" data-testid="trace-timeline">
      <div className="flex flex-wrap gap-3">
        <label className="inline-flex items-center gap-2 rounded-sm bg-[var(--color-surface-container-high)] px-3 py-2 text-xs text-[var(--color-outline)] max-sm:w-full max-sm:justify-between">
          <span>Zoom</span>
          <input
            type="range"
            min={100}
            max={400}
            step={25}
            value={zoomPercent}
            onChange={(event) => setZoomPercent(Number(event.target.value))}
            className="w-36 max-sm:w-30"
          />
          <strong className="min-w-[3.1rem] text-right text-xs font-semibold text-[var(--color-on-surface)]">
            {zoomPercent}%
          </strong>
        </label>

        <label
          className={`inline-flex items-center gap-2 rounded-sm bg-[var(--color-surface-container-high)] px-3 py-2 text-xs text-[var(--color-outline)] max-sm:w-full max-sm:justify-between${maxPanDuration === 0 ? ' opacity-60' : ''}`}
        >
          <span>Pan</span>
          <input
            type="range"
            min={0}
            max={100}
            value={panPercent}
            disabled={maxPanDuration === 0}
            onChange={(event) => setPanPercent(Number(event.target.value))}
            className="w-36 max-sm:w-30"
          />
          <strong className="min-w-[3.1rem] text-right text-xs font-semibold text-[var(--color-on-surface)]">
            {panPercent}%
          </strong>
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        {Array.from(serviceColorMap.entries()).map(([serviceName, color]) => (
          <span
            key={serviceName}
            className="inline-flex items-center gap-1.5 rounded-sm bg-[var(--color-surface-container-high)] px-2.5 py-1 text-xs text-[var(--color-outline)]"
          >
            <i
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            {serviceName}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 rounded-sm border border-[var(--color-tertiary)]/20 bg-[var(--color-tertiary)]/10 px-2.5 py-1 text-xs text-[var(--color-tertiary)]">
          <i className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--color-tertiary)]" />
          Critical path
        </span>
      </div>

      <div className="overflow-x-auto rounded bg-[var(--color-surface-container-low)]">
        {visibleRows.length > 0 ? (
          <svg
            width={svgWidth}
            height={svgHeight}
            className="block"
            role="img"
            aria-label="Trace timeline waterfall"
          >
            <g>
              {timeMarkers.map((marker) => (
                <line
                  key={`axis-${marker.x}`}
                  x1={marker.x}
                  y1={0}
                  x2={marker.x}
                  y2={svgHeight}
                  stroke="var(--color-stroke-subtle)"
                  strokeWidth={1}
                />
              ))}
              {timeMarkers.map((marker) => (
                <text
                  key={`axis-label-${marker.x}`}
                  x={marker.x}
                  y={14}
                  textAnchor="middle"
                  fill="var(--color-outline)"
                  fontSize={10}
                  fontFamily="JetBrains Mono, monospace"
                >
                  {marker.label}
                </text>
              ))}
            </g>

            <g>
              <line
                x1={labelWidth}
                y1={0}
                x2={labelWidth}
                y2={svgHeight}
                stroke="var(--color-stroke-strong)"
                strokeWidth={1}
              />
            </g>

            {visibleRows.map((row, rowIndex) => (
              <g key={row.span.spanId}>
                <rect
                  x={0}
                  y={rowY(rowIndex)}
                  width={svgWidth}
                  height={rowHeight}
                  fill={rowBgFill(rowIndex)}
                />

                <text
                  x={12 + row.depth * 14}
                  y={rowY(rowIndex) + 19}
                  fill="var(--color-on-surface)"
                  fontSize={11}
                  className="select-none"
                >
                  <title>{`${row.span.operationName} (${row.span.serviceName})`}</title>
                  {row.span.operationName || '(unnamed span)'}
                </text>

                {/* biome-ignore lint/a11y/noStaticElementInteractions: SVG rect span selector */}
                <rect
                  x={spanStartToX(row.span.startTimeUnixNano)}
                  y={rowY(rowIndex) + 6}
                  width={spanWidth(row.span.durationNano, row.span.startTimeUnixNano)}
                  height={rowHeight - 12}
                  rx={4}
                  className="cursor-pointer"
                  fill={getServiceColor(row.span.serviceName)}
                  fillOpacity={spanBarOpacity(row.span)}
                  stroke={spanBarStroke(row.span)}
                  strokeWidth={spanBarStrokeWidth(row.span)}
                  onClick={() => onSelectSpan?.(row.span)}
                />

                <text
                  x={
                    spanStartToX(row.span.startTimeUnixNano) +
                    spanWidth(row.span.durationNano, row.span.startTimeUnixNano) +
                    6
                  }
                  y={rowY(rowIndex) + 19}
                  fill="var(--color-on-surface-variant)"
                  fontSize={10}
                  fontFamily="JetBrains Mono, monospace"
                >
                  {formatDurationNano(row.span.durationNano)}
                </text>
              </g>
            ))}
          </svg>
        ) : (
          <div className="p-4 text-sm text-[var(--color-outline)]">
            No spans visible in the current zoom window.
          </div>
        )}
      </div>
    </div>
  )
}