<script setup lang="ts">
import { computed, ref } from 'vue'
import type { TraceSummary } from '../types/datasource'

type TraceSortField = 'traceId' | 'startTimeUnixNano' | 'durationNano' | 'spanCount' | 'errorSpanCount'
type TraceSortDirection = 'asc' | 'desc'

const props = defineProps<{
  traces: TraceSummary[]
}>()

const emit = defineEmits<{
  'open-trace': [traceId: string]
}>()

const sortField = ref<TraceSortField>('startTimeUnixNano')
const sortDirection = ref<TraceSortDirection>('desc')

const sortedTraces = computed(() => {
  const traces = [...props.traces]
  const directionFactor = sortDirection.value === 'asc' ? 1 : -1

  traces.sort((a, b) => {
    const left = a[sortField.value]
    const right = b[sortField.value]

    if (typeof left === 'string' && typeof right === 'string') {
      return left.localeCompare(right) * directionFactor
    }

    return ((left as number) - (right as number)) * directionFactor
  })

  return traces
})

function toggleSort(field: TraceSortField) {
  if (sortField.value === field) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
    return
  }

  sortField.value = field
  sortDirection.value = field === 'traceId' ? 'asc' : 'desc'
}

function openTrace(traceId: string) {
  emit('open-trace', traceId)
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

function formatStart(unixNanoTimestamp: number): string {
  return new Date(Math.floor(unixNanoTimestamp / 1_000_000)).toLocaleString()
}

function sortIndicator(field: TraceSortField): string {
  if (sortField.value !== field) {
    return ''
  }

  return sortDirection.value === 'asc' ? '↑' : '↓'
}
</script>

<template>
  <div class="trace-list-panel">
    <table class="trace-table">
      <thead>
        <tr>
          <th>
            <button type="button" class="sort-button" @click="toggleSort('traceId')">
              Trace {{ sortIndicator('traceId') }}
            </button>
          </th>
          <th>
            <button type="button" class="sort-button" @click="toggleSort('startTimeUnixNano')">
              Start {{ sortIndicator('startTimeUnixNano') }}
            </button>
          </th>
          <th>
            <button type="button" class="sort-button" @click="toggleSort('durationNano')">
              Duration {{ sortIndicator('durationNano') }}
            </button>
          </th>
          <th>
            <button type="button" class="sort-button" @click="toggleSort('spanCount')">
              Spans {{ sortIndicator('spanCount') }}
            </button>
          </th>
          <th>
            <button type="button" class="sort-button" @click="toggleSort('errorSpanCount')">
              Errors {{ sortIndicator('errorSpanCount') }}
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="trace in sortedTraces" :key="trace.traceId" class="trace-row">
          <td class="trace-id-cell">
            <button type="button" class="trace-link" @click="openTrace(trace.traceId)">
              {{ trace.traceId }}
            </button>
          </td>
          <td>{{ formatStart(trace.startTimeUnixNano) }}</td>
          <td>{{ formatDuration(trace.durationNano) }}</td>
          <td>{{ trace.spanCount }}</td>
          <td>
            <span class="error-count" :class="{ 'has-errors': trace.errorSpanCount > 0 }">
              {{ trace.errorSpanCount }}
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style>
.trace-list-panel {
  height: 100%;
  overflow: auto;
}

.trace-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}

.trace-table thead {
  position: sticky;
  top: 0;
  z-index: 1;
  background: rgba(18, 32, 49, 0.95);
}

.trace-table th,
.trace-table td {
  padding: 0.45rem 0.5rem;
  text-align: left;
  border-bottom: 1px solid rgba(113, 145, 176, 0.18);
  vertical-align: middle;
}

.sort-button {
  border: none;
  background: transparent;
  color: var(--color-text-1);
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
}

.sort-button:hover {
  color: var(--color-text-0);
}

.trace-row:hover {
  background: rgba(245, 158, 11, 0.08);
}

.trace-id-cell {
  max-width: 220px;
}

.trace-link {
  display: inline-block;
  width: 100%;
  border: none;
  background: transparent;
  color: var(--color-accent);
  text-align: left;
  cursor: pointer;
  font-family: var(--font-family-mono);
  font-size: 0.75rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0;
}

.trace-link:hover {
  text-decoration: underline;
}

.error-count.has-errors {
  color: var(--color-danger);
  font-weight: 600;
}
</style>
