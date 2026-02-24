<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Trace, TraceSpan } from '../types/datasource'

interface SpanRow {
  span: TraceSpan
  depth: number
}

const props = defineProps<{
  trace: Trace
  selectedSpanId?: string | null
}>()

const emit = defineEmits<(e: 'select-span', span: TraceSpan) => void>()

const zoomPercent = ref(100)
const panPercent = ref(0)

const axisHeight = 34
const rowHeight = 30
const labelWidth = 300
const barsWidth = 880
const markerCount = 6

const spanMap = computed(() => {
  const byId = new Map<string, TraceSpan>()
  for (const span of props.trace.spans) {
    byId.set(span.spanId, span)
  }
  return byId
})

const childMap = computed(() => {
  const children = new Map<string, TraceSpan[]>()
  for (const span of props.trace.spans) {
    if (!span.parentSpanId) {
      continue
    }

    const list = children.get(span.parentSpanId) || []
    list.push(span)
    children.set(span.parentSpanId, list)
  }

  for (const [parentSpanId, spans] of children.entries()) {
    spans.sort((a, b) => {
      if (a.startTimeUnixNano === b.startTimeUnixNano) {
        return b.durationNano - a.durationNano
      }
      return a.startTimeUnixNano - b.startTimeUnixNano
    })
    children.set(parentSpanId, spans)
  }

  return children
})

function spanSort(a: TraceSpan, b: TraceSpan): number {
  if (a.startTimeUnixNano === b.startTimeUnixNano) {
    return b.durationNano - a.durationNano
  }
  return a.startTimeUnixNano - b.startTimeUnixNano
}

const orderedRows = computed<SpanRow[]>(() => {
  const rows: SpanRow[] = []
  const visited = new Set<string>()
  const byId = spanMap.value

  const roots = props.trace.spans
    .filter((span) => !span.parentSpanId || !byId.has(span.parentSpanId) || span.parentSpanId === span.spanId)
    .sort(spanSort)

  const walk = (span: TraceSpan, depth: number) => {
    if (visited.has(span.spanId)) {
      return
    }

    visited.add(span.spanId)
    rows.push({ span, depth })

    const children = childMap.value.get(span.spanId) || []
    for (const child of children) {
      walk(child, depth + 1)
    }
  }

  for (const root of roots) {
    walk(root, 0)
  }

  const leftovers = props.trace.spans
    .filter((span) => !visited.has(span.spanId))
    .sort(spanSort)
  for (const span of leftovers) {
    walk(span, 0)
  }

  return rows
})

const traceBounds = computed(() => {
  if (props.trace.spans.length === 0) {
    return {
      start: 0,
      end: 1,
      totalDuration: 1,
    }
  }

  const spanStarts = props.trace.spans.map((span) => span.startTimeUnixNano)
  const spanEnds = props.trace.spans.map((span) => span.startTimeUnixNano + Math.max(span.durationNano, 1))

  const minStart = Math.min(...spanStarts)
  const maxEnd = Math.max(...spanEnds)
  const traceStart = props.trace.startTimeUnixNano > 0 ? Math.min(props.trace.startTimeUnixNano, minStart) : minStart
  const traceEndFromDuration = traceStart + Math.max(props.trace.durationNano, 1)
  const traceEnd = Math.max(maxEnd, traceEndFromDuration)

  return {
    start: traceStart,
    end: traceEnd,
    totalDuration: Math.max(traceEnd - traceStart, 1),
  }
})

const zoomScale = computed(() => Math.max(1, zoomPercent.value / 100))
const windowDuration = computed(() => traceBounds.value.totalDuration / zoomScale.value)
const maxPanDuration = computed(() => Math.max(traceBounds.value.totalDuration - windowDuration.value, 0))
const windowStart = computed(() => traceBounds.value.start + maxPanDuration.value * (panPercent.value / 100))
const windowEnd = computed(() => windowStart.value + windowDuration.value)

const visibleRows = computed(() => {
  return orderedRows.value.filter((row) => {
    const spanStart = row.span.startTimeUnixNano
    const spanEnd = spanStart + Math.max(row.span.durationNano, 1)
    return spanStart <= windowEnd.value && spanEnd >= windowStart.value
  })
})

const svgHeight = computed(() => axisHeight + Math.max(visibleRows.value.length, 1) * rowHeight + 10)
const svgWidth = labelWidth + barsWidth + 12

const serviceColorPalette = [
  '#F59E0B',
  '#22c55e',
  '#f59e0b',
  '#f97316',
  '#ef4444',
  '#14b8a6',
  '#6366f1',
  '#ec4899',
  '#84cc16',
  '#eab308',
]

const serviceColorMap = computed(() => {
  const services = [...new Set(props.trace.spans.map((span) => span.serviceName || 'unknown'))].sort()
  const map = new Map<string, string>()
  services.forEach((service, index) => {
    map.set(service, serviceColorPalette[index % serviceColorPalette.length]!)
  })
  return map
})

function getServiceColor(serviceName: string): string {
  return serviceColorMap.value.get(serviceName || 'unknown') || '#94a3b8'
}

function clamped(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function spanStartToX(startTimeUnixNano: number): number {
  const ratio = (startTimeUnixNano - windowStart.value) / windowDuration.value
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

function formatDurationNano(durationNano: number): string {
  if (durationNano >= 1_000_000_000) {
    return `${(durationNano / 1_000_000_000).toFixed(durationNano >= 10_000_000_000 ? 1 : 2)}s`
  }
  if (durationNano >= 1_000_000) {
    return `${(durationNano / 1_000_000).toFixed(durationNano >= 100_000_000 ? 0 : 1)}ms`
  }
  if (durationNano >= 1_000) {
    return `${(durationNano / 1_000).toFixed(durationNano >= 100_000 ? 0 : 1)}us`
  }
  return `${durationNano}ns`
}

function formatTraceOffset(unixNanoTimestamp: number): string {
  return `+${formatDurationNano(Math.max(unixNanoTimestamp - traceBounds.value.start, 0))}`
}

const timeMarkers = computed(() => {
  const markers: Array<{ x: number, label: string }> = []
  for (let i = 0; i <= markerCount; i += 1) {
    const ratio = i / markerCount
    const timestamp = windowStart.value + windowDuration.value * ratio
    markers.push({
      x: labelWidth + barsWidth * ratio,
      label: formatTraceOffset(timestamp),
    })
  }
  return markers
})

interface LongestPathResult {
  score: number
  path: string[]
}

const criticalPathSpanIds = computed(() => {
  const memo = new Map<string, LongestPathResult>()

  const longestPath = (spanId: string, stack: Set<string>): LongestPathResult => {
    if (memo.has(spanId)) {
      return memo.get(spanId) as LongestPathResult
    }

    if (stack.has(spanId)) {
      const loopSpan = spanMap.value.get(spanId)
      const fallback = {
        score: Math.max(loopSpan?.durationNano || 0, 1),
        path: loopSpan ? [loopSpan.spanId] : [],
      }
      memo.set(spanId, fallback)
      return fallback
    }

    const span = spanMap.value.get(spanId)
    if (!span) {
      const empty = { score: 0, path: [] }
      memo.set(spanId, empty)
      return empty
    }

    stack.add(spanId)
    let bestChild: LongestPathResult = { score: 0, path: [] }
    const children = childMap.value.get(spanId) || []
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

  const roots = orderedRows.value
    .filter((row) => row.depth === 0)
    .map((row) => row.span)

  let best: LongestPathResult = { score: 0, path: [] }
  for (const root of roots) {
    const candidate = longestPath(root.spanId, new Set<string>())
    if (candidate.score > best.score) {
      best = candidate
    }
  }

  if (best.path.length === 0) {
    for (const span of props.trace.spans) {
      const candidate = longestPath(span.spanId, new Set<string>())
      if (candidate.score > best.score) {
        best = candidate
      }
    }
  }

  return new Set(best.path)
})
</script>

<template>
  <div class="trace-timeline">
    <div class="timeline-controls">
      <label class="control-item">
        <span>Zoom</span>
        <input v-model.number="zoomPercent" type="range" min="100" max="400" step="25" />
        <strong>{{ zoomPercent }}%</strong>
      </label>

      <label class="control-item" :class="{ disabled: maxPanDuration === 0 }">
        <span>Pan</span>
        <input
          v-model.number="panPercent"
          type="range"
          min="0"
          max="100"
          :disabled="maxPanDuration === 0"
        />
        <strong>{{ panPercent }}%</strong>
      </label>
    </div>

    <div class="service-legend">
      <span v-for="(color, serviceName) in serviceColorMap" :key="serviceName" class="legend-item">
        <i class="legend-color" :style="{ backgroundColor: color as unknown as string }"></i>
        {{ serviceName }}
      </span>
      <span class="legend-item critical">
        <i class="legend-color critical-color"></i>
        Critical path
      </span>
    </div>

    <div class="timeline-scroll-wrap">
      <svg v-if="visibleRows.length > 0" :width="svgWidth" :height="svgHeight" class="timeline-svg" role="img" aria-label="Trace timeline waterfall">
        <g>
          <line
            v-for="marker in timeMarkers"
            :key="`axis-${marker.x}`"
            :x1="marker.x"
            y1="0"
            :x2="marker.x"
            :y2="svgHeight"
            class="axis-line"
          />
          <text
            v-for="marker in timeMarkers"
            :key="`axis-label-${marker.x}`"
            :x="marker.x"
            y="14"
            text-anchor="middle"
            class="axis-label"
          >
            {{ marker.label }}
          </text>
        </g>

        <g>
          <line :x1="labelWidth" y1="0" :x2="labelWidth" :y2="svgHeight" class="divider-line" />
        </g>

        <g v-for="(row, rowIndex) in visibleRows" :key="row.span.spanId">
          <rect
            x="0"
            :y="rowY(rowIndex)"
            :width="svgWidth"
            :height="rowHeight"
            :class="rowIndex % 2 === 0 ? 'row-bg-even' : 'row-bg-odd'"
          />

          <text
            :x="12 + row.depth * 14"
            :y="rowY(rowIndex) + 19"
            class="span-label"
            :title="`${row.span.operationName} (${row.span.serviceName})`"
          >
            {{ row.span.operationName || '(unnamed span)' }}
          </text>

          <rect
            :x="spanStartToX(row.span.startTimeUnixNano)"
            :y="rowY(rowIndex) + 6"
            :width="spanWidth(row.span.durationNano, row.span.startTimeUnixNano)"
            :height="rowHeight - 12"
            rx="4"
            class="span-bar"
            :class="{
              critical: criticalPathSpanIds.has(row.span.spanId),
              selected: row.span.spanId === selectedSpanId,
              error: row.span.status === 'error',
            }"
            :style="{ fill: getServiceColor(row.span.serviceName) }"
            @click="emit('select-span', row.span)"
          />

          <text
            :x="spanStartToX(row.span.startTimeUnixNano) + spanWidth(row.span.durationNano, row.span.startTimeUnixNano) + 6"
            :y="rowY(rowIndex) + 19"
            class="duration-label"
          >
            {{ formatDurationNano(row.span.durationNano) }}
          </text>
        </g>
      </svg>

      <div v-else class="flex flex-col items-center justify-center p-12 text-center text-text-1">
        No spans visible in the current zoom window.
      </div>
    </div>
  </div>
</template>

<style>
.trace-timeline {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.timeline-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.control-item {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  font-size: 0.76rem;
  color: var(--color-text-1);
  padding: 0.45rem 0.6rem;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: rgba(20, 33, 51, 0.75);
}

.control-item input {
  width: 140px;
}

.control-item strong {
  color: var(--color-text-0);
  font-size: 0.72rem;
  min-width: 3.1rem;
  text-align: right;
}

.control-item.disabled {
  opacity: 0.6;
}

.service-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.25rem 0.5rem;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: rgba(15, 24, 39, 0.78);
  color: var(--color-text-1);
  font-size: 0.72rem;
}

.legend-item.critical {
  border-color: rgba(245, 158, 11, 0.45);
}

.legend-color {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  display: inline-block;
}

.critical-color {
  background: #f59e0b;
}

.timeline-scroll-wrap {
  overflow-x: auto;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: rgba(8, 14, 24, 0.9);
}

.timeline-svg {
  display: block;
}

.axis-line {
  stroke: rgba(71, 85, 105, 0.3);
  stroke-width: 1;
}

.axis-label {
  font-size: 10px;
  fill: var(--color-text-2);
  font-family: var(--font-family-mono);
}

.divider-line {
  stroke: rgba(71, 85, 105, 0.6);
  stroke-width: 1;
}

.row-bg-even {
  fill: rgba(15, 23, 42, 0.32);
}

.row-bg-odd {
  fill: rgba(30, 41, 59, 0.22);
}

.span-label {
  font-size: 11px;
  fill: var(--color-text-0);
  user-select: none;
}

.duration-label {
  font-size: 10px;
  fill: var(--color-text-1);
  font-family: var(--font-family-mono);
}

.span-bar {
  cursor: pointer;
  fill-opacity: 0.85;
  stroke: transparent;
  stroke-width: 1.5;
  transition: stroke 0.15s ease, fill-opacity 0.15s ease;
}

.span-bar:hover {
  fill-opacity: 1;
  stroke: rgba(226, 232, 240, 0.65);
}

.span-bar.critical {
  stroke: rgba(245, 158, 11, 0.85);
}

.span-bar.selected {
  stroke: #e2e8f0;
  stroke-width: 2;
  fill-opacity: 1;
}

.span-bar.error {
  stroke: rgba(248, 113, 113, 0.9);
  stroke-width: 2;
}

.empty-state {
  padding: 1rem;
  color: var(--color-text-1);
  font-size: 0.86rem;
}

@media (max-width: 900px) {
  .control-item {
    width: 100%;
    justify-content: space-between;
  }

  .control-item input {
    width: 120px;
  }
}
</style>
