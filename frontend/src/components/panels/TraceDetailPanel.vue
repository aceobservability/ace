<script setup lang="ts">
import { computed } from 'vue'
import { getSeriesColor, thresholdColors } from '../../utils/chartTheme'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TraceSpanItem {
  spanId: string
  parentSpanId?: string
  operationName: string
  serviceName: string
  startTime: number // Unix timestamp in microseconds
  duration: number // Duration in microseconds
  status?: 'ok' | 'error'
  tags?: Record<string, string>
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

const props = defineProps<{
  spans: TraceSpanItem[]
  traceStartTime?: number
  traceDuration?: number
  emptyTitle?: string
  emptyDescription?: string
  emptyActionLabel?: string
}>()

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INDENT_PX = 16
const ROW_HEIGHT = 28
const ROW_GAP = 2

// ---------------------------------------------------------------------------
// Tree building + DFS flattening
// ---------------------------------------------------------------------------

interface FlatSpan {
  span: TraceSpanItem
  depth: number
}

function buildFlatSpans(spans: TraceSpanItem[]): FlatSpan[] {
  if (spans.length === 0) return []

  // Build parent -> children map
  const childrenMap = new Map<string, TraceSpanItem[]>()
  const spanById = new Map<string, TraceSpanItem>()
  const roots: TraceSpanItem[] = []

  for (const span of spans) {
    spanById.set(span.spanId, span)
    if (!span.parentSpanId) {
      roots.push(span)
    } else {
      const siblings = childrenMap.get(span.parentSpanId) ?? []
      siblings.push(span)
      childrenMap.set(span.parentSpanId, siblings)
    }
  }

  // Handle orphan spans (parentSpanId set but parent not in the list)
  for (const span of spans) {
    if (span.parentSpanId && !spanById.has(span.parentSpanId)) {
      roots.push(span)
    }
  }

  // DFS from roots
  const result: FlatSpan[] = []
  function dfs(span: TraceSpanItem, depth: number) {
    result.push({ span, depth })
    const children = childrenMap.get(span.spanId) ?? []
    for (const child of children) {
      dfs(child, depth + 1)
    }
  }

  for (const root of roots) {
    dfs(root, 0)
  }

  return result
}

// ---------------------------------------------------------------------------
// Computed
// ---------------------------------------------------------------------------

const flatSpans = computed(() => buildFlatSpans(props.spans))

const resolvedTraceStartTime = computed(() => {
  if (props.traceStartTime !== undefined) return props.traceStartTime
  if (props.spans.length === 0) return 0
  return Math.min(...props.spans.map((s) => s.startTime))
})

const resolvedTraceDuration = computed(() => {
  if (props.traceDuration !== undefined) return props.traceDuration
  if (props.spans.length === 0) return 1
  const traceEnd = Math.max(...props.spans.map((s) => s.startTime + s.duration))
  const dur = traceEnd - resolvedTraceStartTime.value
  return dur > 0 ? dur : 1
})

// Map service names to stable color indices
const serviceColorMap = computed(() => {
  const map = new Map<string, number>()
  let idx = 0
  for (const span of props.spans) {
    if (!map.has(span.serviceName)) {
      map.set(span.serviceName, idx++)
    }
  }
  return map
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function barLeft(span: TraceSpanItem): string {
  const pct = ((span.startTime - resolvedTraceStartTime.value) / resolvedTraceDuration.value) * 100
  return `${pct}%`
}

function barWidth(span: TraceSpanItem): string {
  const pct = (span.duration / resolvedTraceDuration.value) * 100
  return `${pct}%`
}

function barColor(span: TraceSpanItem): string {
  if (span.status === 'error') return thresholdColors.critical
  const idx = serviceColorMap.value.get(span.serviceName) ?? 0
  return getSeriesColor(idx)
}

function formatDuration(us: number): string {
  if (us < 1000) return `${us}us`
  if (us < 1000000) {
    const ms = us / 1000
    return `${Number.isInteger(ms) ? ms : ms.toFixed(1)}ms`
  }
  const s = us / 1000000
  return `${Number.isInteger(s) ? s : s.toFixed(1)}s`
}

const emptyStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.35rem',
  height: '100%',
  color: 'var(--color-on-surface-variant)',
  fontSize: '0.875rem',
  textAlign: 'center' as const,
  padding: '1rem',
}

const emptyTitleStyle = {
  color: 'var(--color-on-surface)',
  fontWeight: '600',
}

const emptyDescriptionStyle = {
  maxWidth: '22rem',
  fontSize: '0.75rem',
  lineHeight: '1.35',
}

const emptyActionStyle = {
  marginTop: '0.25rem',
  fontSize: '0.6875rem',
  fontWeight: '600',
  color: 'var(--color-primary)',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.04em',
}
</script>

<template>
  <div
    data-testid="trace-detail-container"
    :style="{
      overflow: 'auto',
      height: '100%',
      width: '100%',
      backgroundColor: 'transparent',
      fontFamily: '\'DM Sans\', sans-serif',
    }"
  >
    <div
      v-if="props.spans.length === 0"
      data-testid="trace-detail-empty"
      :style="emptyStyle"
    >
      <div :style="emptyTitleStyle">{{ props.emptyTitle || 'No trace spans' }}</div>
      <div v-if="props.emptyDescription" :style="emptyDescriptionStyle">
        {{ props.emptyDescription }}
      </div>
      <div v-if="props.emptyActionLabel" :style="emptyActionStyle">
        {{ props.emptyActionLabel }}
      </div>
    </div>

    <div
      v-for="(entry, i) in flatSpans"
      v-else
      :key="entry.span.spanId + '-' + i"
      data-testid="trace-span-row"
      :style="{
        display: 'flex',
        alignItems: 'center',
        height: ROW_HEIGHT + 'px',
        marginBottom: ROW_GAP + 'px',
        cursor: 'pointer',
      }"
      class="trace-span-row"
    >
      <!-- Left: span label area (fixed width) -->
      <div
        data-testid="span-label"
        :style="{
          width: '200px',
          minWidth: '200px',
          paddingLeft: entry.depth * INDENT_PX + 'px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontSize: '12px',
          lineHeight: ROW_HEIGHT + 'px',
        }"
      >
        <span :style="{ color: 'var(--color-on-surface-variant)', marginRight: '4px' }">{{
          entry.span.serviceName
        }}</span>
        <span :style="{ color: 'var(--color-on-surface)' }">{{
          entry.span.operationName
        }}</span>
      </div>

      <!-- Right: timeline bar area -->
      <div
        :style="{
          flex: '1',
          position: 'relative',
          height: '100%',
        }"
      >
        <div
          data-testid="span-bar"
          :style="{
            position: 'absolute',
            top: '4px',
            bottom: '4px',
            left: barLeft(entry.span),
            width: barWidth(entry.span),
            backgroundColor: barColor(entry.span),
            borderRadius: '2px',
            minWidth: '1px',
          }"
        />
        <span
          data-testid="span-duration"
          :style="{
            position: 'absolute',
            top: '50%',
            transform: 'translateY(-50%)',
            left: 'calc(' + barLeft(entry.span) + ' + ' + barWidth(entry.span) + ' + 4px)',
            fontSize: '10px',
            fontFamily: '\'JetBrains Mono\', monospace',
            color: 'var(--color-on-surface-variant)',
            whiteSpace: 'nowrap',
          }"
        >
          {{ formatDuration(entry.span.duration) }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.trace-span-row:hover {
  background-color: var(--color-surface-hover, rgba(255, 255, 255, 0.04));
}
</style>
