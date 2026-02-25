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

  return sortDirection.value === 'asc' ? '\u2191' : '\u2193'
}
</script>

<template>
  <div class="h-full overflow-auto rounded-xl border border-slate-200 bg-white">
    <table class="w-full border-collapse text-sm">
      <thead class="sticky top-0 z-10 bg-slate-50">
        <tr>
          <th class="border-b border-slate-200 px-4 py-3 text-left align-middle">
            <button type="button" class="cursor-pointer border-none bg-transparent p-0 text-xs font-semibold text-slate-500 transition hover:text-slate-900" @click="toggleSort('traceId')">
              Trace {{ sortIndicator('traceId') }}
            </button>
          </th>
          <th class="border-b border-slate-200 px-4 py-3 text-left align-middle">
            <button type="button" class="cursor-pointer border-none bg-transparent p-0 text-xs font-semibold text-slate-500 transition hover:text-slate-900" @click="toggleSort('startTimeUnixNano')">
              Start {{ sortIndicator('startTimeUnixNano') }}
            </button>
          </th>
          <th class="border-b border-slate-200 px-4 py-3 text-left align-middle">
            <button type="button" class="cursor-pointer border-none bg-transparent p-0 text-xs font-semibold text-slate-500 transition hover:text-slate-900" @click="toggleSort('durationNano')">
              Duration {{ sortIndicator('durationNano') }}
            </button>
          </th>
          <th class="border-b border-slate-200 px-4 py-3 text-left align-middle">
            <button type="button" class="cursor-pointer border-none bg-transparent p-0 text-xs font-semibold text-slate-500 transition hover:text-slate-900" @click="toggleSort('spanCount')">
              Spans {{ sortIndicator('spanCount') }}
            </button>
          </th>
          <th class="border-b border-slate-200 px-4 py-3 text-left align-middle">
            <button type="button" class="cursor-pointer border-none bg-transparent p-0 text-xs font-semibold text-slate-500 transition hover:text-slate-900" @click="toggleSort('errorSpanCount')">
              Errors {{ sortIndicator('errorSpanCount') }}
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="trace in sortedTraces" :key="trace.traceId" class="transition hover:bg-slate-50">
          <td class="max-w-[220px] border-b border-slate-100 px-4 py-3 align-middle">
            <button type="button" class="inline-block w-full cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap border-none bg-transparent p-0 text-left font-mono text-xs text-emerald-600 transition hover:text-emerald-700 hover:underline" @click="openTrace(trace.traceId)">
              {{ trace.traceId }}
            </button>
          </td>
          <td class="border-b border-slate-100 px-4 py-3 align-middle text-sm text-slate-600">{{ formatStart(trace.startTimeUnixNano) }}</td>
          <td class="border-b border-slate-100 px-4 py-3 align-middle font-mono text-xs text-slate-500">{{ formatDuration(trace.durationNano) }}</td>
          <td class="border-b border-slate-100 px-4 py-3 align-middle text-sm text-slate-600">{{ trace.spanCount }}</td>
          <td class="border-b border-slate-100 px-4 py-3 align-middle">
            <span :class="trace.errorSpanCount > 0 ? 'font-semibold text-rose-600' : 'text-slate-600'">
              {{ trace.errorSpanCount }}
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
