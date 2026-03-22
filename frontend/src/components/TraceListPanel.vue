<script setup lang="ts">
import { computed, ref } from 'vue'
import type { TraceSummary } from '../types/datasource'

type TraceSortField =
  | 'traceId'
  | 'startTimeUnixNano'
  | 'durationNano'
  | 'spanCount'
  | 'errorSpanCount'
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

  return sortDirection.value === 'asc' ? '\u2191' : '\u2193'
}
</script>

<template>
  <div class="h-full overflow-auto rounded bg-[var(--color-surface-container-low)]">
    <table class="w-full border-collapse text-sm">
      <thead class="sticky top-0 z-10 bg-[var(--color-surface-container-high)]">
        <tr>
          <th class="border-b  px-4 py-3 text-left align-middle">
            <button type="button" class="cursor-pointer border-none bg-transparent p-0 text-xs font-semibold text-[var(--color-outline)] transition hover:text-[var(--color-on-surface)]" @click="toggleSort('traceId')">
              Trace {{ sortIndicator('traceId') }}
            </button>
          </th>
          <th class="border-b  px-4 py-3 text-left align-middle">
            <button type="button" class="cursor-pointer border-none bg-transparent p-0 text-xs font-semibold text-[var(--color-outline)] transition hover:text-[var(--color-on-surface)]" @click="toggleSort('startTimeUnixNano')">
              Start {{ sortIndicator('startTimeUnixNano') }}
            </button>
          </th>
          <th class="border-b  px-4 py-3 text-left align-middle">
            <button type="button" class="cursor-pointer border-none bg-transparent p-0 text-xs font-semibold text-[var(--color-outline)] transition hover:text-[var(--color-on-surface)]" @click="toggleSort('durationNano')">
              Duration {{ sortIndicator('durationNano') }}
            </button>
          </th>
          <th class="border-b  px-4 py-3 text-left align-middle">
            <button type="button" class="cursor-pointer border-none bg-transparent p-0 text-xs font-semibold text-[var(--color-outline)] transition hover:text-[var(--color-on-surface)]" @click="toggleSort('spanCount')">
              Spans {{ sortIndicator('spanCount') }}
            </button>
          </th>
          <th class="border-b  px-4 py-3 text-left align-middle">
            <button type="button" class="cursor-pointer border-none bg-transparent p-0 text-xs font-semibold text-[var(--color-outline)] transition hover:text-[var(--color-on-surface)]" @click="toggleSort('errorSpanCount')">
              Errors {{ sortIndicator('errorSpanCount') }}
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="trace in sortedTraces" :key="trace.traceId" class="transition hover:bg-[var(--color-surface-container-high)]">
          <td class="max-w-[220px] px-4 py-3 align-middle">
            <button type="button" class="inline-block w-full cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap border-none bg-transparent p-0 text-left font-mono text-xs text-[var(--color-primary)] transition hover:text-[var(--color-primary)] hover:underline" @click="openTrace(trace.traceId)">
              {{ trace.traceId }}
            </button>
          </td>
          <td class="border-b  px-4 py-3 align-middle text-sm text-[var(--color-on-surface-variant)]">{{ formatStart(trace.startTimeUnixNano) }}</td>
          <td class="border-b  px-4 py-3 align-middle font-mono text-xs text-[var(--color-outline)]">{{ formatDuration(trace.durationNano) }}</td>
          <td class="border-b  px-4 py-3 align-middle text-sm text-[var(--color-on-surface-variant)]">{{ trace.spanCount }}</td>
          <td class="border-b  px-4 py-3 align-middle">
            <span :class="trace.errorSpanCount > 0 ? 'font-semibold text-[var(--color-error)]' : 'text-[var(--color-on-surface-variant)]'">
              {{ trace.errorSpanCount }}
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
