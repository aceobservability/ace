<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { LogEntry } from '../types/datasource'

const router = useRouter()

const props = withDefaults(
  defineProps<{
    logs: LogEntry[]
    highlightedLogKeys?: string[]
    traceIdField?: string
    linkedTraceDatasourceId?: string | null
  }>(),
  {
    highlightedLogKeys: () => [],
    traceIdField: 'trace_id',
    linkedTraceDatasourceId: null,
  },
)

function extractTraceId(entry: LogEntry): string | null {
  const field = props.traceIdField || 'trace_id'

  if (entry.labels && entry.labels[field]) {
    return entry.labels[field]
  }

  try {
    const parsed = JSON.parse(entry.line)
    if (parsed[field]) return String(parsed[field])
  } catch {}

  const regex = new RegExp(`(?:${field}[=:]["']?)([a-f0-9]{16,64})`, 'i')
  const match = entry.line.match(regex)
  if (match) return match[1]

  return null
}

function navigateToTrace(traceId: string) {
  router.push({
    name: 'explore-traces',
    query: {
      datasourceId: props.linkedTraceDatasourceId,
      traceId: traceId,
    },
  })
}

interface DetectedField {
  key: string
  value: string
}

function getLevelBadgeClasses(level?: string): string {
  switch (level) {
    case 'error':
      return 'rounded-full bg-rose-50 px-2 py-0.5 text-rose-700 ring-1 ring-rose-600/20 font-semibold'
    case 'warning':
    case 'warn':
      return 'rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 ring-1 ring-amber-600/20 font-semibold'
    case 'info':
      return 'rounded-full bg-sky-50 px-2 py-0.5 text-sky-700 ring-1 ring-sky-600/20 font-semibold'
    case 'debug':
      return 'rounded-full bg-slate-100 px-2 py-0.5 text-slate-600'
    default:
      return 'rounded-full bg-slate-100 px-2 py-0.5 text-slate-600'
  }
}

function formatTimestamp(ts: string): string {
  try {
    const date = new Date(ts)
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    })
  } catch {
    return ts
  }
}

const displayLogs = computed(() => props.logs.slice(0, 1000))
const highlightedLogKeySet = computed(() => new Set(props.highlightedLogKeys))
const expandedRows = ref<Set<number>>(new Set())

function getLogKey(log: LogEntry): string {
  const labels = Object.entries(log.labels || {})
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    .map(([key, value]) => `${key}=${value}`)
    .join(',')
  return `${log.timestamp}|${labels}|${log.line}`
}

function isHighlighted(log: LogEntry): boolean {
  return highlightedLogKeySet.value.has(getLogKey(log))
}

function toggleRow(index: number) {
  const next = new Set(expandedRows.value)
  if (next.has(index)) {
    next.delete(index)
  } else {
    next.add(index)
  }
  expandedRows.value = next
}

function isExpanded(index: number): boolean {
  return expandedRows.value.has(index)
}

function formatFieldValue(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function flattenObject(value: unknown, prefix = '', depth = 0): DetectedField[] {
  if (depth > 4) {
    return [{ key: prefix || 'value', value: formatFieldValue(value) }]
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [{ key: prefix || 'value', value: '[]' }]
    }

    const rows: DetectedField[] = []
    for (let i = 0; i < value.length; i += 1) {
      const childPrefix = prefix ? `${prefix}[${i}]` : `[${i}]`
      rows.push(...flattenObject(value[i], childPrefix, depth + 1))
    }
    return rows
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) {
      return [{ key: prefix || 'value', value: '{}' }]
    }

    const rows: DetectedField[] = []
    for (const [key, child] of entries) {
      const childPrefix = prefix ? `${prefix}.${key}` : key
      rows.push(...flattenObject(child, childPrefix, depth + 1))
    }
    return rows
  }

  return [{ key: prefix || 'value', value: formatFieldValue(value) }]
}

function parseJsonFields(line: string): DetectedField[] {
  const trimmed = line.trim()
  const candidates: string[] = [trimmed]
  const firstBrace = trimmed.indexOf('{')
  if (firstBrace > 0) {
    candidates.push(trimmed.slice(firstBrace))
  }

  for (const candidate of candidates) {
    if (!candidate.startsWith('{') || !candidate.endsWith('}')) {
      continue
    }

    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return flattenObject(parsed)
      }
    } catch {}
  }

  return []
}

function parseKeyValueFields(line: string): DetectedField[] {
  const fields: DetectedField[] = []
  const seenKeys = new Set<string>()
  const pattern = /([a-zA-Z_][\w.-]*)=("[^"]*"|'[^']*'|[^,\s]+)/g

  for (const match of line.matchAll(pattern)) {
    const key = match[1]
    if (!key || seenKeys.has(key)) {
      continue
    }

    const rawValue = match[2] || ''
    const value =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
        ? rawValue.slice(1, -1)
        : rawValue

    fields.push({ key, value })
    seenKeys.add(key)
  }

  return fields
}

function getMessageFields(log: LogEntry): DetectedField[] {
  const jsonFields = parseJsonFields(log.line)
  if (jsonFields.length > 0) {
    return jsonFields
  }

  return parseKeyValueFields(log.line)
}

const detectedFieldsByRow = computed(() => displayLogs.value.map((log) => getMessageFields(log)))

watch(displayLogs, () => {
  expandedRows.value = new Set<number>()
})
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden rounded-xl border border-slate-200 bg-white">
    <!-- Header -->
    <div class="flex items-center gap-4 bg-slate-900 px-4 py-2.5 font-mono text-xs uppercase tracking-[0.07em] text-slate-300">
      <span class="shrink-0 w-44">Timestamp</span>
      <span class="shrink-0 w-20">Level</span>
      <span class="flex-1">Message</span>
    </div>
    <div class="shrink-0 text-xs font-mono py-1 px-4 bg-slate-900 border-b border-slate-700">
      <span class="text-slate-400">{{ logs.length }} log entries</span>
    </div>

    <!-- Log rows -->
    <div class="flex-1 overflow-auto">
      <template v-for="(log, i) in displayLogs" :key="i">
        <div
          :class="[
            'flex items-start gap-4 border-b border-slate-100 px-4 py-2 text-xs font-mono hover:bg-slate-50 cursor-pointer transition',
            isExpanded(i) ? 'bg-slate-50' : '',
            isHighlighted(log) ? 'animate-[row-highlight-fade_2.4s_ease-out]' : '',
          ]"
          @click="toggleRow(i)"
        >
          <!-- Timestamp -->
          <span class="shrink-0 text-slate-400 w-44">{{ formatTimestamp(log.timestamp) }}</span>

          <!-- Level badge -->
          <span class="shrink-0 w-20">
            <span
              v-if="log.level"
              :class="['inline-block text-[0.7rem] uppercase', getLevelBadgeClasses(log.level)]"
            >
              {{ log.level }}
            </span>
          </span>

          <!-- Trace ID badge -->
          <span class="shrink-0 w-40">
            <button
              v-if="linkedTraceDatasourceId && extractTraceId(log)"
              class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-mono bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/30 transition-colors cursor-pointer border border-emerald-500/30"
              @click.stop="navigateToTrace(extractTraceId(log)!)"
              :title="`View trace ${extractTraceId(log)}`"
            >
              <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
              {{ extractTraceId(log)?.slice(0, 16) }}…
            </button>
          </span>

          <!-- Message -->
          <div class="flex-1 text-slate-700 break-all">
            <div class="flex items-start gap-1.5">
              <span class="shrink-0 text-slate-400 text-[0.72rem] leading-[1.35] mt-px">{{ isExpanded(i) ? 'v' : '>' }}</span>
              <span class="whitespace-pre-wrap">{{ log.line }}</span>
            </div>
            <div v-if="log.labels && Object.keys(log.labels).length > 0" class="mt-1 flex flex-wrap gap-1">
              <span
                v-for="(value, key) in log.labels"
                :key="String(key)"
                class="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 mr-1"
              >
                {{ key }}={{ value }}
              </span>
            </div>
          </div>
        </div>

        <!-- Expanded detail row -->
        <div v-if="isExpanded(i)" class="bg-slate-50 px-6 py-4 text-xs font-mono border-b border-slate-100">
          <div class="text-[0.7rem] font-semibold uppercase tracking-[0.04em] text-slate-500 mb-2">
            Detected Fields
          </div>
          <div v-if="detectedFieldsByRow[i]?.length" class="grid gap-1.5">
            <div
              v-for="field in detectedFieldsByRow[i]"
              :key="field.key"
              class="grid grid-cols-[minmax(120px,220px)_1fr] gap-2.5 max-sm:grid-cols-1 max-sm:gap-1"
            >
              <span class="text-slate-500 break-words">{{ field.key }}</span>
              <span class="text-slate-800 whitespace-pre-wrap break-words">{{ field.value }}</span>
            </div>
          </div>
          <div v-else class="text-slate-400">No structured fields detected in this message.</div>
        </div>
      </template>

      <!-- Empty state -->
      <div v-if="logs.length === 0" class="text-center text-slate-400 py-8 px-4 text-xs font-mono">
        No log entries
      </div>
    </div>
  </div>
</template>
