<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import type { Trace, TraceLog, TraceSpan } from '../types/datasource'

const props = defineProps<{
  trace: Trace
  span: TraceSpan
}>()

const emit = defineEmits<{
  (e: 'select-span', span: TraceSpan): void
  (
    e: 'open-trace-logs',
    payload: {
      traceId: string
      serviceName: string
      startTimeUnixNano: number
      endTimeUnixNano: number
    },
  ): void
  (
    e: 'open-service-metrics',
    payload: {
      serviceName: string
      startTimeUnixNano: number
      endTimeUnixNano: number
    },
  ): void
}>()

const feedbackMessage = ref('')

let feedbackTimeout: ReturnType<typeof setTimeout> | null = null

const spanMap = computed(() => {
  const map = new Map<string, TraceSpan>()
  for (const span of props.trace.spans) {
    map.set(span.spanId, span)
  }
  return map
})

const parentSpan = computed(() => {
  if (!props.span.parentSpanId) {
    return null
  }
  return spanMap.value.get(props.span.parentSpanId) || null
})

const childSpans = computed(() => {
  return props.trace.spans
    .filter((span) => span.parentSpanId === props.span.spanId)
    .sort((a, b) => {
      if (a.startTimeUnixNano === b.startTimeUnixNano) {
        return b.durationNano - a.durationNano
      }
      return a.startTimeUnixNano - b.startTimeUnixNano
    })
})

const sortedTags = computed(() => {
  const tags = props.span.tags || {}
  return Object.entries(tags).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
})

const sortedLogs = computed(() => {
  return [...(props.span.logs || [])].sort((a, b) => a.timestampUnixNano - b.timestampUnixNano)
})

onUnmounted(() => {
  if (feedbackTimeout) {
    clearTimeout(feedbackTimeout)
  }
})

function setFeedback(message: string) {
  feedbackMessage.value = message
  if (feedbackTimeout) {
    clearTimeout(feedbackTimeout)
  }
  feedbackTimeout = setTimeout(() => {
    feedbackMessage.value = ''
  }, 2000)
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

function formatTimestamp(unixNanoTimestamp: number): string {
  return new Date(Math.floor(unixNanoTimestamp / 1_000_000)).toLocaleString()
}

function formatTraceOffset(unixNanoTimestamp: number): string {
  const duration = Math.max(unixNanoTimestamp - props.trace.startTimeUnixNano, 0)
  return `+${formatDurationNano(duration)}`
}

function formatLogFields(log: TraceLog): Array<[string, string]> {
  return Object.entries(log.fields || {}).sort(([leftKey], [rightKey]) =>
    leftKey.localeCompare(rightKey),
  )
}

function copyWithTextArea(value: string): boolean {
  if (typeof document === 'undefined') {
    return false
  }

  const textArea = document.createElement('textarea')
  textArea.value = value
  textArea.setAttribute('readonly', 'true')
  textArea.style.position = 'fixed'
  textArea.style.opacity = '0'
  document.body.appendChild(textArea)
  textArea.select()

  let copied = false
  try {
    copied = document.execCommand('copy')
  } catch {
    copied = false
  }

  document.body.removeChild(textArea)
  return copied
}

async function copyToClipboard(value: string, label: string) {
  if (!value) {
    return
  }

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      setFeedback(`${label} copied`)
      return
    }

    if (copyWithTextArea(value)) {
      setFeedback(`${label} copied`)
      return
    }

    setFeedback(`Unable to copy ${label.toLowerCase()}`)
  } catch {
    setFeedback(`Unable to copy ${label.toLowerCase()}`)
  }
}

function sanitizeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-')
}

function openTraceLogs() {
  emit('open-trace-logs', {
    traceId: props.trace.traceId,
    serviceName: props.span.serviceName || '',
    startTimeUnixNano: props.span.startTimeUnixNano,
    endTimeUnixNano: props.span.startTimeUnixNano + props.span.durationNano,
  })
}

function openServiceMetrics() {
  emit('open-service-metrics', {
    serviceName: props.span.serviceName || '',
    startTimeUnixNano: props.span.startTimeUnixNano,
    endTimeUnixNano: props.span.startTimeUnixNano + props.span.durationNano,
  })
}

function exportSpanJson() {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
    setFeedback('Unable to export JSON in this environment')
    return
  }

  const payload = {
    traceId: props.trace.traceId,
    span: props.span,
    parentSpan: parentSpan.value,
    childSpans: childSpans.value,
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  const traceId = sanitizeFileName(props.trace.traceId || 'trace')
  const spanId = sanitizeFileName(props.span.spanId || 'span')
  anchor.href = objectUrl
  anchor.download = `${traceId}-${spanId}.json`
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(objectUrl)
  setFeedback('Span JSON exported')
}
</script>

<template>
  <aside class="flex min-w-0 flex-col gap-3 rounded bg-[var(--color-surface-container-low)] p-4" aria-label="Span details panel">
    <header class="flex items-start justify-between gap-3 pb-3">
      <div>
        <h3 class="m-0 text-xs font-semibold uppercase tracking-wider text-[var(--color-outline)]">Span details</h3>
        <p class="mt-1 text-sm font-semibold text-[var(--color-on-surface)]">{{ span.operationName || '(unnamed span)' }}</p>
      </div>
      <span
        class="shrink-0 rounded-sm px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide"
        :class="span.status === 'error'
          ? 'border border-[var(--color-error)]/20 bg-[var(--color-error)]/10 text-[var(--color-error)]'
          : 'border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/10 text-[var(--color-primary)]'"
      >
        {{ span.status === 'error' ? 'Error' : 'OK' }}
      </span>
    </header>

    <div class="flex flex-wrap gap-2">
      <button type="button" class="cursor-pointer rounded-sm bg-[var(--color-surface-container-high)] px-3 py-1.5 text-xs text-[var(--color-on-surface-variant)] transition hover:border-[var(--color-primary)]/20 hover:text-[var(--color-primary)]" @click="copyToClipboard(span.spanId, 'Span ID')">
        Copy span ID
      </button>
      <button type="button" class="cursor-pointer rounded-sm bg-[var(--color-surface-container-high)] px-3 py-1.5 text-xs text-[var(--color-on-surface-variant)] transition hover:border-[var(--color-primary)]/20 hover:text-[var(--color-primary)]" @click="copyToClipboard(trace.traceId, 'Trace ID')">
        Copy trace ID
      </button>
      <button type="button" class="cursor-pointer rounded-sm bg-[var(--color-surface-container-high)] px-3 py-1.5 text-xs text-[var(--color-on-surface-variant)] transition hover:border-[var(--color-primary)]/20 hover:text-[var(--color-primary)]" @click="openTraceLogs">
        View Logs
      </button>
      <button type="button" class="cursor-pointer rounded-sm bg-[var(--color-surface-container-high)] px-3 py-1.5 text-xs text-[var(--color-on-surface-variant)] transition hover:border-[var(--color-primary)]/20 hover:text-[var(--color-primary)]" @click="openServiceMetrics">
        View Service Metrics
      </button>
      <button type="button" class="cursor-pointer rounded-sm bg-[var(--color-surface-container-high)] px-3 py-1.5 text-xs text-[var(--color-on-surface-variant)] transition hover:border-[var(--color-primary)]/20 hover:text-[var(--color-primary)]" @click="exportSpanJson">
        Export JSON
      </button>
    </div>
    <p v-if="feedbackMessage" class="-mt-1 text-xs font-medium text-[var(--color-primary)]">{{ feedbackMessage }}</p>

    <section class="grid grid-cols-2 gap-x-3 gap-y-2 rounded-sm p-3 max-md:grid-cols-1">
      <div class="flex min-w-0 flex-col gap-0.5">
        <span class="text-xs font-semibold uppercase tracking-wider text-[var(--color-outline)]">Service</span>
        <code class="break-all font-mono text-sm text-[var(--color-on-surface)]">{{ span.serviceName || 'unknown' }}</code>
      </div>
      <div class="flex min-w-0 flex-col gap-0.5">
        <span class="text-xs font-semibold uppercase tracking-wider text-[var(--color-outline)]">Duration</span>
        <code class="break-all font-mono text-sm text-[var(--color-on-surface)]">{{ formatDurationNano(span.durationNano) }}</code>
      </div>
      <div class="flex min-w-0 flex-col gap-0.5">
        <span class="text-xs font-semibold uppercase tracking-wider text-[var(--color-outline)]">Start</span>
        <span class="text-sm text-[var(--color-on-surface-variant)]">{{ formatTimestamp(span.startTimeUnixNano) }}</span>
      </div>
      <div class="flex min-w-0 flex-col gap-0.5">
        <span class="text-xs font-semibold uppercase tracking-wider text-[var(--color-outline)]">End</span>
        <span class="text-sm text-[var(--color-on-surface-variant)]">{{ formatTimestamp(span.startTimeUnixNano + span.durationNano) }}</span>
      </div>
      <div class="flex min-w-0 flex-col gap-0.5">
        <span class="text-xs font-semibold uppercase tracking-wider text-[var(--color-outline)]">Offset</span>
        <code class="break-all font-mono text-sm text-[var(--color-on-surface)]">{{ formatTraceOffset(span.startTimeUnixNano) }}</code>
      </div>
      <div class="flex min-w-0 flex-col gap-0.5">
        <span class="text-xs font-semibold uppercase tracking-wider text-[var(--color-outline)]">Span ID</span>
        <code class="break-all font-mono text-sm text-[var(--color-on-surface)]">{{ span.spanId }}</code>
      </div>
    </section>

    <section class="flex flex-col gap-2.5 rounded-sm p-3">
      <h4 class="m-0 text-xs font-semibold uppercase tracking-wider text-[var(--color-outline)]">Relationships</h4>
      <div class="flex flex-col gap-1.5">
        <span class="text-xs font-semibold uppercase tracking-wider text-[var(--color-outline)]">Parent</span>
        <button
          v-if="parentSpan"
          type="button"
          class="cursor-pointer rounded-sm border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/10 px-3 py-1.5 text-left text-sm text-[var(--color-primary)] transition hover:border-[var(--color-primary)]/20 hover:text-[var(--color-primary)]"
          @click="emit('select-span', parentSpan)"
        >
          {{ parentSpan.operationName || '(unnamed span)' }}
        </button>
        <span v-else class="text-sm text-[var(--color-outline)]">Root span</span>
      </div>

      <div class="flex flex-col gap-1.5">
        <span class="text-xs font-semibold uppercase tracking-wider text-[var(--color-outline)]">Children</span>
        <div v-if="childSpans.length > 0" class="flex flex-col gap-1">
          <button
            v-for="child in childSpans"
            :key="child.spanId"
            type="button"
            class="cursor-pointer rounded-sm border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/10 px-3 py-1.5 text-left text-sm text-[var(--color-primary)] transition hover:border-[var(--color-primary)]/20 hover:text-[var(--color-primary)]"
            @click="emit('select-span', child)"
          >
            {{ child.operationName || '(unnamed span)' }}
          </button>
        </div>
        <span v-else class="text-sm text-[var(--color-outline)]">No child spans</span>
      </div>
    </section>

    <section class="flex flex-col gap-2 rounded-sm p-3">
      <h4 class="m-0 text-xs font-semibold uppercase tracking-wider text-[var(--color-outline)]">Attributes</h4>
      <table v-if="sortedTags.length > 0" class="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th class="border-b  pb-1.5 text-left text-xs text-[var(--color-outline)]">Key</th>
            <th class="border-b  pb-1.5 text-left text-xs text-[var(--color-outline)]">Value</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="([key, value]) in sortedTags" :key="key">
            <td class="border-b  py-1.5 align-top">
              <code class="rounded-sm bg-[var(--color-surface-container-high)] px-1.5 py-0.5 font-mono text-xs text-[var(--color-outline)]">{{ key }}</code>
            </td>
            <td class="border-b  py-1.5 align-top">
              <code class="rounded-sm bg-[var(--color-surface-container-high)] px-1.5 py-0.5 font-mono text-xs text-[var(--color-on-surface)]">{{ value }}</code>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="m-0 text-sm text-[var(--color-outline)]">No span attributes.</p>
    </section>

    <section class="flex flex-col gap-2 rounded-sm p-3">
      <h4 class="m-0 text-xs font-semibold uppercase tracking-wider text-[var(--color-outline)]">Logs and events</h4>
      <div v-if="sortedLogs.length > 0" class="flex flex-col gap-2">
        <article v-for="(log, index) in sortedLogs" :key="`${log.timestampUnixNano}-${index}`" class="flex flex-col gap-2 rounded-sm p-2.5">
          <div class="flex items-center justify-between gap-2 text-xs text-[var(--color-outline)]">
            <span>{{ formatTimestamp(log.timestampUnixNano) }}</span>
            <code class="font-mono">{{ formatTraceOffset(log.timestampUnixNano) }}</code>
          </div>
          <div v-if="formatLogFields(log).length > 0" class="flex flex-col gap-1">
            <div
              v-for="([fieldKey, fieldValue]) in formatLogFields(log)"
              :key="fieldKey"
              class="flex items-start gap-2"
            >
              <code class="rounded-sm bg-[var(--color-surface-container-high)] px-1.5 py-0.5 font-mono text-xs text-[var(--color-outline)]">{{ fieldKey }}</code>
              <code class="rounded-sm bg-[var(--color-surface-container-high)] px-1.5 py-0.5 font-mono text-xs text-[var(--color-on-surface)]">{{ fieldValue }}</code>
            </div>
          </div>
          <p v-else class="m-0 text-sm text-[var(--color-outline)]">No log fields</p>
        </article>
      </div>
      <p v-else class="m-0 text-sm text-[var(--color-outline)]">No logs or events for this span.</p>
    </section>
  </aside>
</template>
