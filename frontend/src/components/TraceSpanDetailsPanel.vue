<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import type { Trace, TraceLog, TraceSpan } from '../types/datasource'

const props = defineProps<{
  trace: Trace
  span: TraceSpan
}>()

const emit = defineEmits<{
  (e: 'select-span', span: TraceSpan): void
  (e: 'open-trace-logs', payload: {
    traceId: string
    serviceName: string
    startTimeUnixNano: number
    endTimeUnixNano: number
  }): void
  (e: 'open-service-metrics', payload: {
    serviceName: string
    startTimeUnixNano: number
    endTimeUnixNano: number
  }): void
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
  return Object.entries(log.fields || {}).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
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
  <aside class="trace-span-details" aria-label="Span details panel">
    <header class="details-header">
      <div>
        <h3>Span details</h3>
        <p class="span-title">{{ span.operationName || '(unnamed span)' }}</p>
      </div>
      <span class="status-pill" :class="{ error: span.status === 'error' }">
        {{ span.status === 'error' ? 'Error' : 'OK' }}
      </span>
    </header>

    <div class="action-row">
      <button type="button" class="action-button" @click="copyToClipboard(span.spanId, 'Span ID')">
        Copy span ID
      </button>
      <button type="button" class="action-button" @click="copyToClipboard(trace.traceId, 'Trace ID')">
        Copy trace ID
      </button>
      <button type="button" class="action-button" @click="openTraceLogs">
        View Logs
      </button>
      <button type="button" class="action-button" @click="openServiceMetrics">
        View Service Metrics
      </button>
      <button type="button" class="action-button" @click="exportSpanJson">
        Export JSON
      </button>
    </div>
    <p v-if="feedbackMessage" class="feedback-message">{{ feedbackMessage }}</p>

    <section class="details-section overview-grid">
      <div class="overview-row">
        <span class="label">Service</span>
        <code>{{ span.serviceName || 'unknown' }}</code>
      </div>
      <div class="overview-row">
        <span class="label">Duration</span>
        <code>{{ formatDurationNano(span.durationNano) }}</code>
      </div>
      <div class="overview-row">
        <span class="label">Start</span>
        <span>{{ formatTimestamp(span.startTimeUnixNano) }}</span>
      </div>
      <div class="overview-row">
        <span class="label">End</span>
        <span>{{ formatTimestamp(span.startTimeUnixNano + span.durationNano) }}</span>
      </div>
      <div class="overview-row">
        <span class="label">Offset</span>
        <code>{{ formatTraceOffset(span.startTimeUnixNano) }}</code>
      </div>
      <div class="overview-row">
        <span class="label">Span ID</span>
        <code>{{ span.spanId }}</code>
      </div>
    </section>

    <section class="details-section relationships">
      <h4>Relationships</h4>
      <div class="relation-block">
        <span class="label">Parent</span>
        <button
          v-if="parentSpan"
          type="button"
          class="relation-link"
          @click="emit('select-span', parentSpan)"
        >
          {{ parentSpan.operationName || '(unnamed span)' }}
        </button>
        <span v-else class="relation-empty">Root span</span>
      </div>

      <div class="relation-block">
        <span class="label">Children</span>
        <div v-if="childSpans.length > 0" class="child-link-list">
          <button
            v-for="child in childSpans"
            :key="child.spanId"
            type="button"
            class="relation-link"
            @click="emit('select-span', child)"
          >
            {{ child.operationName || '(unnamed span)' }}
          </button>
        </div>
        <span v-else class="relation-empty">No child spans</span>
      </div>
    </section>

    <section class="details-section">
      <h4>Attributes</h4>
      <table v-if="sortedTags.length > 0" class="attribute-table">
        <thead>
          <tr>
            <th>Key</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="([key, value]) in sortedTags" :key="key">
            <td><code class="token-key">{{ key }}</code></td>
            <td><code class="token-value">{{ value }}</code></td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty-copy">No span attributes.</p>
    </section>

    <section class="details-section">
      <h4>Logs and events</h4>
      <div v-if="sortedLogs.length > 0" class="event-timeline">
        <article v-for="(log, index) in sortedLogs" :key="`${log.timestampUnixNano}-${index}`" class="event-row">
          <div class="event-meta">
            <span>{{ formatTimestamp(log.timestampUnixNano) }}</span>
            <code>{{ formatTraceOffset(log.timestampUnixNano) }}</code>
          </div>
          <div v-if="formatLogFields(log).length > 0" class="event-fields">
            <div
              v-for="([fieldKey, fieldValue]) in formatLogFields(log)"
              :key="fieldKey"
              class="event-field"
            >
              <code class="token-key">{{ fieldKey }}</code>
              <code class="token-value">{{ fieldValue }}</code>
            </div>
          </div>
          <p v-else class="empty-copy">No log fields</p>
        </article>
      </div>
      <p v-else class="empty-copy">No logs or events for this span.</p>
    </section>
  </aside>
</template>

<style>
.trace-span-details {
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: rgba(12, 21, 33, 0.9);
  padding: 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 0;
}

.details-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.7rem;
}

.details-header h3 {
  margin: 0;
  font-size: 0.8rem;
  color: var(--color-text-2);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.span-title {
  margin: 0.2rem 0 0;
  font-size: 0.86rem;
  color: var(--color-text-0);
}

.status-pill {
  border-radius: 999px;
  border: 1px solid rgba(99, 102, 241, 0.45);
  background: rgba(16, 185, 129, 0.15);
  color: #9bf5d2;
  font-size: 0.69rem;
  letter-spacing: 0.04em;
  padding: 0.2rem 0.5rem;
  text-transform: uppercase;
}

.status-pill.error {
  border-color: rgba(248, 113, 113, 0.45);
  background: rgba(248, 113, 113, 0.14);
  color: #fecaca;
}

.action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.action-button {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: rgba(20, 31, 48, 0.78);
  color: var(--color-text-1);
  font-size: 0.74rem;
  padding: 0.38rem 0.56rem;
  cursor: pointer;
}

.action-button:hover {
  border-color: rgba(245, 158, 11, 0.42);
  color: #d5efff;
}

.feedback-message {
  margin: -0.2rem 0 0;
  font-size: 0.74rem;
  color: #FCD34D;
}

.details-section {
  border: 1px solid rgba(71, 85, 105, 0.4);
  border-radius: 10px;
  padding: 0.7rem;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.details-section h4 {
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-text-2);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.45rem 0.75rem;
}

.overview-row {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
  color: var(--color-text-1);
  font-size: 0.78rem;
}

.label {
  font-size: 0.69rem;
  color: var(--color-text-2);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

code {
  font-family: var(--font-family-mono);
  word-break: break-all;
}

.relationships {
  gap: 0.65rem;
}

.relation-block {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.child-link-list {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.relation-link {
  border: 1px solid rgba(245, 158, 11, 0.35);
  border-radius: 8px;
  background: rgba(8, 24, 38, 0.82);
  color: #d5efff;
  font-size: 0.76rem;
  text-align: left;
  padding: 0.34rem 0.48rem;
  cursor: pointer;
}

.relation-link:hover {
  border-color: rgba(252, 211, 77, 0.6);
}

.relation-empty,
.empty-copy {
  margin: 0;
  font-size: 0.76rem;
  color: var(--color-text-1);
}

.attribute-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.74rem;
}

.attribute-table th {
  text-align: left;
  color: var(--color-text-2);
  border-bottom: 1px solid rgba(71, 85, 105, 0.5);
  padding-bottom: 0.35rem;
}

.attribute-table td {
  vertical-align: top;
  padding: 0.35rem 0;
  border-bottom: 1px solid rgba(71, 85, 105, 0.24);
}

.token-key {
  color: #bae6fd;
  background: rgba(217, 119, 6, 0.12);
  border-radius: 6px;
  padding: 0.12rem 0.3rem;
}

.token-value {
  color: #cbd5e1;
  background: rgba(71, 85, 105, 0.23);
  border-radius: 6px;
  padding: 0.12rem 0.3rem;
}

.event-timeline {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.event-row {
  border: 1px solid rgba(71, 85, 105, 0.45);
  border-radius: 8px;
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.event-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.72rem;
  color: var(--color-text-1);
}

.event-fields {
  display: flex;
  flex-direction: column;
  gap: 0.32rem;
}

.event-field {
  display: flex;
  gap: 0.4rem;
  align-items: flex-start;
}

@media (max-width: 820px) {
  .overview-grid {
    grid-template-columns: 1fr;
  }
}
</style>
