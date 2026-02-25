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

  let min = props.traces[0].startTimeUnixNano
  let max = props.traces[0].startTimeUnixNano

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
    rows[durationIdx][timeIdx] += 1
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
      label: durationBuckets[i].label,
      cells: matrix.value[i],
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

function cellBg(count: number): string {
  const intensity = cellIntensity(count)
  const alpha = 0.06 + intensity * 0.7
  return `rgba(16, 185, 129, ${alpha})`
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
  <div class="flex h-full flex-col gap-2.5 rounded-xl border border-slate-200 bg-white p-4">
    <div class="grid min-h-[150px] grid-cols-[auto_1fr] gap-2">
      <div class="grid grid-rows-[repeat(8,1fr)] gap-[3px]">
        <span v-for="row in heatmapRows" :key="row.label" class="flex items-center justify-end whitespace-nowrap text-[0.65rem] text-slate-400">{{ row.label }}</span>
      </div>
      <div class="grid grid-rows-[repeat(8,1fr)] gap-[3px]">
        <div v-for="row in heatmapRows" :key="row.label" class="grid grid-cols-[repeat(12,1fr)] gap-[3px]">
          <div
            v-for="(count, cellIndex) in row.cells"
            :key="`${row.label}-${cellIndex}`"
            class="min-h-4 rounded border border-emerald-200/30"
            :style="{ backgroundColor: cellBg(count) }"
            :title="cellTitle(row.label, cellIndex, count)"
          ></div>
        </div>
      </div>
    </div>

    <div class="ml-[calc(3.9rem+0.45rem)] flex justify-between text-[0.65rem] text-slate-400">
      <span v-for="(label, index) in timeLabels" :key="`${label}-${index}`">{{ label }}</span>
    </div>

    <div class="border-t border-slate-100 pt-2">
      <h4 class="m-0 mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Recent traces</h4>
      <ul class="m-0 grid list-none grid-cols-2 gap-x-2.5 gap-y-1.5 p-0">
        <li v-for="trace in recentTraces" :key="trace.traceId">
          <button type="button" class="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border-none bg-emerald-50 px-2.5 py-1.5 transition hover:bg-emerald-100" @click="openTrace(trace.traceId)">
            <span class="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-xs text-slate-900">{{ trace.traceId }}</span>
            <span class="text-xs text-slate-500">{{ formatDuration(trace.durationNano) }}</span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
