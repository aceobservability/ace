<script setup lang="ts">
import { computed } from 'vue'
import type { TraceSummary } from '../types/datasource'

interface DurationBucket {
  label: string
  maxExclusive: number
}

const props = defineProps<{
  traces: TraceSummary[]
}>()

const emit = defineEmits<{
  'open-trace': [traceId: string]
}>()

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

const sortedByStart = computed(() => {
  return [...props.traces].sort((a, b) => b.startTimeUnixNano - a.startTimeUnixNano)
})

const timeRange = computed(() => {
  if (props.traces.length === 0) {
    return { min: 0, max: 0, width: 1 }
  }

  let min = props.traces[0]!.startTimeUnixNano
  let max = props.traces[0]!.startTimeUnixNano

  for (const trace of props.traces) {
    if (trace.startTimeUnixNano < min) {
      min = trace.startTimeUnixNano
    }
    if (trace.startTimeUnixNano > max) {
      max = trace.startTimeUnixNano
    }
  }

  return {
    min,
    max,
    width: Math.max(1, max - min),
  }
})

function durationBucketIndex(durationNano: number): number {
  const idx = durationBuckets.findIndex((bucket) => durationNano < bucket.maxExclusive)
  return idx === -1 ? durationBuckets.length - 1 : idx
}

function timeBucketIndex(startTimeUnixNano: number): number {
  if (props.traces.length <= 1) {
    return 0
  }

  const relativePosition = (startTimeUnixNano - timeRange.value.min) / timeRange.value.width
  const rawIndex = Math.floor(relativePosition * TIME_BUCKETS)
  return Math.max(0, Math.min(TIME_BUCKETS - 1, rawIndex))
}

const matrix = computed(() => {
  const rows = Array.from({ length: durationBuckets.length }, () =>
    Array.from({ length: TIME_BUCKETS }, () => 0),
  )

  for (const trace of props.traces) {
    const durationIdx = durationBucketIndex(trace.durationNano)
    const timeIdx = timeBucketIndex(trace.startTimeUnixNano)
    rows[durationIdx]![timeIdx]! += 1
  }

  return rows
})

const maxCellCount = computed(() => {
  let max = 0
  for (const row of matrix.value) {
    for (const count of row) {
      if (count > max) {
        max = count
      }
    }
  }
  return max
})

const heatmapRows = computed(() => {
  const rows = [] as Array<{ label: string, cells: number[] }>

  for (let i = durationBuckets.length - 1; i >= 0; i -= 1) {
    rows.push({
      label: durationBuckets[i]!.label,
      cells: matrix.value[i]!,
    })
  }

  return rows
})

const timeLabels = computed(() => {
  if (props.traces.length === 0) {
    return ['-', '-', '-', '-']
  }

  const labels = [] as string[]
  const checkpoints = [0, 0.33, 0.66, 1]

  for (const checkpoint of checkpoints) {
    const unixNano = timeRange.value.min + Math.floor(timeRange.value.width * checkpoint)
    labels.push(new Date(Math.floor(unixNano / 1_000_000)).toLocaleTimeString())
  }

  return labels
})

const recentTraces = computed(() => sortedByStart.value.slice(0, 6))

function cellIntensity(count: number): number {
  if (maxCellCount.value === 0) {
    return 0
  }
  return count / maxCellCount.value
}

function cellTitle(rowLabel: string, cellIndex: number, count: number): string {
  if (count === 0) {
    return `${rowLabel}, bucket ${cellIndex + 1}: no traces`
  }
  return `${rowLabel}, bucket ${cellIndex + 1}: ${count} trace${count === 1 ? '' : 's'}`
}

function formatDuration(durationNano: number): string {
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

function openTrace(traceId: string) {
  emit('open-trace', traceId)
}
</script>

<template>
  <div class="trace-heatmap-panel">
    <div class="heatmap-layout">
      <div class="duration-axis">
        <span v-for="row in heatmapRows" :key="row.label" class="duration-label">{{ row.label }}</span>
      </div>
      <div class="heatmap-grid">
        <div v-for="row in heatmapRows" :key="row.label" class="heatmap-row">
          <div
            v-for="(count, cellIndex) in row.cells"
            :key="`${row.label}-${cellIndex}`"
            class="heatmap-cell"
            :style="{ '--cell-intensity': String(cellIntensity(count)) }"
            :title="cellTitle(row.label, cellIndex, count)"
          ></div>
        </div>
      </div>
    </div>

    <div class="time-axis">
      <span v-for="(label, index) in timeLabels" :key="`${label}-${index}`">{{ label }}</span>
    </div>

    <div class="recent-traces">
      <h4>Recent traces</h4>
      <ul>
        <li v-for="trace in recentTraces" :key="trace.traceId">
          <button type="button" class="trace-link" @click="openTrace(trace.traceId)">
            <span class="trace-id">{{ trace.traceId }}</span>
            <span class="trace-duration">{{ formatDuration(trace.durationNano) }}</span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<style>
.trace-heatmap-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.heatmap-layout {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.45rem;
  min-height: 150px;
}

.duration-axis {
  display: grid;
  grid-template-rows: repeat(8, 1fr);
  gap: 3px;
}

.duration-label {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  color: var(--color-text-2);
  font-size: 0.65rem;
  white-space: nowrap;
}

.heatmap-grid {
  display: grid;
  grid-template-rows: repeat(8, 1fr);
  gap: 3px;
}

.heatmap-row {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 3px;
}

.heatmap-cell {
  min-height: 16px;
  border-radius: 4px;
  border: 1px solid rgba(252, 211, 77, 0.12);
  background: rgba(245, 158, 11, calc(0.08 + var(--cell-intensity) * 0.75));
}

.time-axis {
  display: flex;
  justify-content: space-between;
  color: var(--color-text-2);
  font-size: 0.65rem;
  margin-left: calc(3.9rem + 0.45rem);
}

.recent-traces {
  border-top: 1px solid rgba(113, 145, 176, 0.2);
  padding-top: 0.5rem;
}

.recent-traces h4 {
  margin: 0 0 0.4rem;
  font-size: 0.72rem;
  color: var(--color-text-1);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.recent-traces ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.35rem 0.6rem;
}

.trace-link {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  border: none;
  background: rgba(245, 158, 11, 0.08);
  border-radius: 6px;
  padding: 0.35rem 0.5rem;
  cursor: pointer;
}

.trace-link:hover {
  background: rgba(245, 158, 11, 0.16);
}

.trace-id {
  font-family: var(--font-family-mono);
  font-size: 0.68rem;
  color: var(--color-text-0);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trace-duration {
  color: var(--color-text-1);
  font-size: 0.68rem;
}
</style>
