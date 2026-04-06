<script setup lang="ts">
import { computed } from 'vue'

type ClickHouseSignal = 'logs' | 'metrics' | 'traces'

const props = withDefaults(
  defineProps<{
    modelValue: string
    signal?: ClickHouseSignal
    disabled?: boolean
    showSignalSelector?: boolean
  }>(),
  {
    signal: 'metrics',
    disabled: false,
    showSignalSelector: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:signal': [value: ClickHouseSignal]
}>()

const sqlExamples: Record<ClickHouseSignal, string> = {
  logs: 'SELECT Timestamp AS timestamp, Body AS message, SeverityText AS level\nFROM ace_logs\nWHERE Timestamp >= toDateTime({start}) AND Timestamp <= toDateTime({end})\nORDER BY Timestamp DESC\nLIMIT 500',
  metrics:
    'SELECT toStartOfInterval(TimeUnix, INTERVAL 1 minute) AS timestamp, avg(Value) AS value, MetricName AS metric\nFROM otel_metrics_gauge\nWHERE TimeUnix >= fromUnixTimestamp({start}) AND TimeUnix <= fromUnixTimestamp({end})\nGROUP BY timestamp, metric\nORDER BY timestamp',
  traces:
    'SELECT SpanId AS span_id, ParentSpanId AS parent_span_id, SpanName AS operation_name, ServiceName AS service_name, toUnixTimestamp64Nano(Timestamp) AS start_time_unix_nano, Duration AS duration_nano, StatusCode AS status\nFROM ace_traces\nWHERE Timestamp BETWEEN fromUnixTimestamp64Nano({start_ns}) AND fromUnixTimestamp64Nano({end_ns})\nLIMIT 200',
}

const columnGuides: Record<ClickHouseSignal, string[]> = {
  logs: ['timestamp', 'message', 'level (optional)'],
  metrics: ['timestamp', 'value', 'metric (optional)'],
  traces: [
    'span_id',
    'parent_span_id (optional)',
    'operation_name',
    'service_name',
    'start_time_unix_nano',
    'duration_nano',
    'status (optional)',
  ],
}

const placeholder = computed(() => sqlExamples[props.signal])
const expectedColumns = computed(() => columnGuides[props.signal])

function handleSignalChange(event: Event) {
  const signal = (event.target as HTMLSelectElement).value as ClickHouseSignal
  emit('update:signal', signal)
}

function handleQueryInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
}
</script>

<template>
  <div class="flex flex-col gap-3.5" :class="{ 'opacity-60 pointer-events-none': props.disabled }">
    <div v-if="showSignalSelector" class="flex flex-col gap-1.5">
      <label for="clickhouse-signal" class="text-sm font-medium text-[var(--color-on-surface)]">Signal Type</label>
      <select
        id="clickhouse-signal"
        :value="props.signal"
        data-testid="clickhouse-signal-select"
        :disabled="props.disabled"
        class="w-full rounded-sm bg-[var(--color-surface-container-high)] px-3 py-2 text-sm text-[var(--color-on-surface)] cursor-pointer transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 disabled:bg-[var(--color-surface-container-high)] disabled:text-[var(--color-outline)] disabled:cursor-not-allowed"
        @change="handleSignalChange"
      >
        <option value="logs">Logs</option>
        <option value="metrics">Metrics</option>
        <option value="traces">Traces</option>
      </select>
    </div>

    <div class="flex flex-col gap-1.5">
      <label for="clickhouse-query" class="text-sm font-medium text-[var(--color-on-surface)]">SQL</label>
      <textarea
        id="clickhouse-query"
        :value="props.modelValue"
        data-testid="clickhouse-query-input"
        :disabled="props.disabled"
        :placeholder="placeholder"
        rows="7"
        spellcheck="false"
        class="w-full rounded-sm bg-[var(--color-surface-container-low)] px-3.5 py-3 text-sm font-mono text-[var(--color-on-surface)] min-h-[140px] resize-y leading-relaxed transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 disabled:bg-[var(--color-surface-container-high)] disabled:text-[var(--color-outline)] disabled:cursor-not-allowed"
        @input="handleQueryInput"
      />
    </div>

    <div class="rounded-sm bg-[var(--color-surface-container-high)] px-3.5 py-3">
      <p class="m-0 text-xs text-[var(--color-outline)]">Expected columns for {{ props.signal }} queries:</p>
      <p class="mt-2 mb-0 flex flex-wrap gap-1.5">
        <code v-for="column in expectedColumns" :key="column" class="inline-flex items-center px-1.5 py-0.5 rounded bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 text-xs text-[var(--color-on-surface-variant)] font-mono">{{ column }}</code>
      </p>
      <p class="mt-2.5 mb-0 text-xs text-[var(--color-outline)] leading-relaxed">Time placeholders supported: <code class="inline-flex items-center px-1.5 py-0.5 rounded bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 text-xs text-[var(--color-on-surface-variant)] font-mono">{start}</code>, <code class="inline-flex items-center px-1.5 py-0.5 rounded bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 text-xs text-[var(--color-on-surface-variant)] font-mono">{end}</code>, <code class="inline-flex items-center px-1.5 py-0.5 rounded bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 text-xs text-[var(--color-on-surface-variant)] font-mono">{step}</code>, <code class="inline-flex items-center px-1.5 py-0.5 rounded bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 text-xs text-[var(--color-on-surface-variant)] font-mono">{start_ms}</code>, <code class="inline-flex items-center px-1.5 py-0.5 rounded bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 text-xs text-[var(--color-on-surface-variant)] font-mono">{end_ms}</code>, <code class="inline-flex items-center px-1.5 py-0.5 rounded bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 text-xs text-[var(--color-on-surface-variant)] font-mono">{start_ns}</code>, <code class="inline-flex items-center px-1.5 py-0.5 rounded bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 text-xs text-[var(--color-on-surface-variant)] font-mono">{end_ns}</code>.</p>
    </div>
  </div>
</template>
