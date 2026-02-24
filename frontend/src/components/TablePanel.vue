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
    class="table-panel"
    :style="{ height: typeof height === 'number' ? `${height}px` : height }"
  >
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th class="time-column">Time</th>
            <th v-for="(s, idx) in series" :key="idx" class="value-column">
              {{ s.name }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="ts in timestamps" :key="ts">
            <td class="time-column">{{ formatTimestamp(ts) }}</td>
            <td
              v-for="(_, idx) in series"
              :key="idx"
              class="value-column"
            >
              {{ formatValue(getValue(idx, ts)) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style>
.table-panel {
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.table-container {
  flex: 1;
  overflow: auto;
  border-radius: 6px;
  border: 1px solid var(--color-border);
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}

thead {
  position: sticky;
  top: 0;
  z-index: 1;
}

th {
  background: var(--color-bg-2);
  color: var(--color-text-0);
  font-weight: 600;
  text-align: left;
  padding: 0.625rem 0.75rem;
  border-bottom: 1px solid var(--color-border);
  white-space: nowrap;
}

td {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text-1);
}

tbody tr:hover {
  background: var(--color-bg-hover);
}

tbody tr:last-child td {
  border-bottom: none;
}

.time-column {
  min-width: 140px;
  color: var(--color-text-2);
}

.value-column {
  text-align: right;
  font-variant-numeric: tabular-nums;
  min-width: 100px;
}

td.value-column {
  color: var(--color-text-0);
}
</style>
