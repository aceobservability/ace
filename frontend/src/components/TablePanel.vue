<script setup lang="ts">
import { computed } from 'vue'

interface DataPoint {
  timestamp: number
  value: number
}

interface TableSeries {
  name: string
  data: DataPoint[]
}

const props = withDefaults(
  defineProps<{
    series: TableSeries[]
    height?: string | number
    decimals?: number
  }>(),
  {
    height: '100%',
    decimals: 2,
  }
)

// Get all unique timestamps across all series, sorted
const timestamps = computed(() => {
  const tsSet = new Set<number>()
  for (const s of props.series) {
    for (const d of s.data) {
      tsSet.add(d.timestamp)
    }
  }
  return Array.from(tsSet).sort((a, b) => b - a) // Most recent first
})

// Create a lookup map for each series: timestamp -> value
const seriesDataMaps = computed(() => {
  return props.series.map((s) => {
    const map = new Map<number, number>()
    for (const d of s.data) {
      map.set(d.timestamp, d.value)
    }
    return map
  })
})

// Format timestamp for display
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

// Format value for display
function formatValue(value: number | undefined): string {
  if (value === undefined) return '-'
  return value.toFixed(props.decimals)
}

// Get value for a given series index and timestamp
function getValue(seriesIndex: number, timestamp: number): number | undefined {
  return seriesDataMaps.value[seriesIndex]?.get(timestamp)
}
</script>

<template>
  <div
    class="h-full overflow-auto rounded-xl border border-slate-200 bg-white"
    :style="{ height: typeof height === 'number' ? `${height}px` : height }"
  >
    <table class="w-full text-left">
      <thead class="sticky top-0 z-10 bg-slate-900 font-mono text-xs uppercase tracking-[0.07em] text-slate-300">
        <tr>
          <th class="min-w-[140px] px-4 py-3 font-semibold">Time</th>
          <th
            v-for="(s, idx) in series"
            :key="idx"
            class="min-w-[100px] px-4 py-3 text-right font-semibold"
          >
            {{ s.name }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="ts in timestamps"
          :key="ts"
          class="border-b border-slate-100 text-sm text-slate-600 hover:bg-slate-50"
        >
          <td class="min-w-[140px] px-4 py-3 text-slate-400">{{ formatTimestamp(ts) }}</td>
          <td
            v-for="(_, idx) in series"
            :key="idx"
            class="min-w-[100px] px-4 py-3 text-right tabular-nums text-slate-700"
          >
            {{ formatValue(getValue(idx, ts)) }}
          </td>
        </tr>
        <tr v-if="timestamps.length === 0">
          <td :colspan="series.length + 1" class="py-8 text-center text-sm text-slate-400">
            No data available
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
