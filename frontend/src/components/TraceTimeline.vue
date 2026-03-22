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
    .filter(
      (span) =>
        !span.parentSpanId || !byId.has(span.parentSpanId) || span.parentSpanId === span.spanId,
    )
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

  const leftovers = props.trace.spans.filter((span) => !visited.has(span.spanId)).sort(spanSort)
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
  const spanEnds = props.trace.spans.map(
    (span) => span.startTimeUnixNano + Math.max(span.durationNano, 1),
  )

  const minStart = Math.min(...spanStarts)
  const maxEnd = Math.max(...spanEnds)
  const traceStart =
    props.trace.startTimeUnixNano > 0 ? Math.min(props.trace.startTimeUnixNano, minStart) : minStart
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
const maxPanDuration = computed(() =>
  Math.max(traceBounds.value.totalDuration - windowDuration.value, 0),
)
const windowStart = computed(
  () => traceBounds.value.start + maxPanDuration.value * (panPercent.value / 100),
)
const windowEnd = computed(() => windowStart.value + windowDuration.value)

const visibleRows = computed(() => {
  return orderedRows.value.filter((row) => {
    const spanStart = row.span.startTimeUnixNano
    const spanEnd = spanStart + Math.max(row.span.durationNano, 1)
    return spanStart <= windowEnd.value && spanEnd >= windowStart.value
  })
})

const svgHeight = computed(
  () => axisHeight + Math.max(visibleRows.value.length, 1) * rowHeight + 10,
)
const svgWidth = labelWidth + barsWidth + 12

const serviceColorPalette = [
  '#059669',
  '#10b981',
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
  const services = [
    ...new Set(props.trace.spans.map((span) => span.serviceName || 'unknown')),
  ].sort()
  const map = new Map<string, string>()
  services.forEach((service, index) => {
    map.set(service, serviceColorPalette[index % serviceColorPalette.length])
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
  const markers: Array<{ x: number; label: string }> = []
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

  const roots = orderedRows.value.filter((row) => row.depth === 0).map((row) => row.span)

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

function spanBarStroke(span: TraceSpan): string {
  if (span.status === 'error') return '#f87171'
  if (criticalPathSpanIds.value.has(span.spanId)) return '#f59e0b'
  if (span.spanId === props.selectedSpanId) return '#334155'
  return 'transparent'
}

function spanBarStrokeWidth(span: TraceSpan): number {
  if (span.status === 'error') return 2
  if (span.spanId === props.selectedSpanId) return 2
  if (criticalPathSpanIds.value.has(span.spanId)) return 1.5
  return 1.5
}

function spanBarOpacity(span: TraceSpan): number {
  return span.spanId === props.selectedSpanId ? 1 : 0.85
}

function rowBgFill(rowIndex: number): string {
  return rowIndex % 2 === 0 ? '#f8fafc' : '#ffffff'
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap gap-3">
      <label class="inline-flex items-center gap-2 rounded-sm bg-[var(--color-surface-container-high)] px-3 py-2 text-xs text-[var(--color-outline)] max-sm:w-full max-sm:justify-between">
        <span>Zoom</span>
        <input v-model.number="zoomPercent" type="range" min="100" max="400" step="25" class="w-36 max-sm:w-30" />
        <strong class="min-w-[3.1rem] text-right text-xs font-semibold text-[var(--color-on-surface)]">{{ zoomPercent }}%</strong>
      </label>

      <label
        class="inline-flex items-center gap-2 rounded-sm bg-[var(--color-surface-container-high)] px-3 py-2 text-xs text-[var(--color-outline)] max-sm:w-full max-sm:justify-between"
        :class="{ 'opacity-60': maxPanDuration === 0 }"
      >
        <span>Pan</span>
        <input
          v-model.number="panPercent"
          type="range"
          min="0"
          max="100"
          :disabled="maxPanDuration === 0"
          class="w-36 max-sm:w-30"
        />
        <strong class="min-w-[3.1rem] text-right text-xs font-semibold text-[var(--color-on-surface)]">{{ panPercent }}%</strong>
      </label>
    </div>

    <div class="flex flex-wrap gap-2">
      <span
        v-for="[serviceName, color] in serviceColorMap"
        :key="serviceName"
        class="inline-flex items-center gap-1.5 rounded-sm bg-[var(--color-surface-container-high)] px-2.5 py-1 text-xs text-[var(--color-outline)]"
      >
        <i class="inline-block h-2.5 w-2.5 rounded-full" :style="{ backgroundColor: color }"></i>
        {{ serviceName }}
      </span>
      <span class="inline-flex items-center gap-1.5 rounded-sm border border-[var(--color-tertiary)]/20 bg-[var(--color-tertiary)]/10 px-2.5 py-1 text-xs text-[var(--color-tertiary)]">
        <i class="inline-block h-2.5 w-2.5 rounded-full bg-[var(--color-tertiary)]"></i>
        Critical path
      </span>
    </div>

    <div class="overflow-x-auto rounded bg-[var(--color-surface-container-low)]">
      <svg v-if="visibleRows.length > 0" :width="svgWidth" :height="svgHeight" class="block" role="img" aria-label="Trace timeline waterfall">
        <g>
          <line
            v-for="marker in timeMarkers"
            :key="`axis-${marker.x}`"
            :x1="marker.x"
            y1="0"
            :x2="marker.x"
            :y2="svgHeight"
            stroke="#e2e8f0"
            stroke-width="1"
          />
          <text
            v-for="marker in timeMarkers"
            :key="`axis-label-${marker.x}`"
            :x="marker.x"
            y="14"
            text-anchor="middle"
            fill="#94a3b8"
            font-size="10"
            font-family="IBM Plex Mono, monospace"
          >
            {{ marker.label }}
          </text>
        </g>

        <g>
          <line :x1="labelWidth" y1="0" :x2="labelWidth" :y2="svgHeight" stroke="#cbd5e1" stroke-width="1" />
        </g>

        <g v-for="(row, rowIndex) in visibleRows" :key="row.span.spanId">
          <rect
            x="0"
            :y="rowY(rowIndex)"
            :width="svgWidth"
            :height="rowHeight"
            :fill="rowBgFill(rowIndex)"
          />

          <text
            :x="12 + row.depth * 14"
            :y="rowY(rowIndex) + 19"
            fill="#0f172a"
            font-size="11"
            class="select-none"
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
            class="cursor-pointer"
            :style="{
              fill: getServiceColor(row.span.serviceName),
              fillOpacity: spanBarOpacity(row.span),
              stroke: spanBarStroke(row.span),
              strokeWidth: spanBarStrokeWidth(row.span),
            }"
            @click="emit('select-span', row.span)"
          />

          <text
            :x="spanStartToX(row.span.startTimeUnixNano) + spanWidth(row.span.durationNano, row.span.startTimeUnixNano) + 6"
            :y="rowY(rowIndex) + 19"
            fill="#64748b"
            font-size="10"
            font-family="IBM Plex Mono, monospace"
          >
            {{ formatDurationNano(row.span.durationNano) }}
          </text>
        </g>
      </svg>

      <div v-else class="p-4 text-sm text-[var(--color-outline)]">
        No spans visible in the current zoom window.
      </div>
    </div>
  </div>
</template>
