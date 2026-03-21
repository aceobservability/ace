<script setup lang="ts">
import { computed } from 'vue'

type ClickHouseSignal = 'logs' | 'metrics' | 'traces'

const props = withDefaults(
  defineProps<{
    modelValue: string
    signal?: ClickHouseSignal
    disabled?: boolean
  }>(),
  {
    signal: 'metrics',
    disabled: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:signal': [value: ClickHouseSignal]
}>()

const sqlExamples: Record<ClickHouseSignal, string> = {
  logs: 'SELECT timestamp, message, level\nFROM logs_table\nWHERE timestamp >= toDateTime({start}) AND timestamp <= toDateTime({end})\nORDER BY timestamp DESC\nLIMIT 500',
  metrics:
    'SELECT timestamp, value, metric\nFROM metrics_table\nWHERE timestamp >= toDateTime({start}) AND timestamp <= toDateTime({end})\nORDER BY timestamp',
  traces:
    'SELECT span_id, parent_span_id, operation_name, service_name, start_time_unix_nano, duration_nano, status\nFROM traces_table\nWHERE start_time_unix_nano BETWEEN {start_ns} AND {end_ns}\nLIMIT 200',
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
    <div class="flex flex-col gap-1.5">
      <label for="clickhouse-signal" class="text-sm font-medium text-text-primary">Signal Type</label>
      <select
        id="clickhouse-signal"
        :value="props.signal"
        data-testid="clickhouse-signal-select"
        :disabled="props.disabled"
        class="w-full rounded-sm border border-border bg-surface-overlay px-3 py-2 text-sm text-text-primary cursor-pointer transition-colors duration-200 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:bg-surface-overlay disabled:text-text-muted disabled:cursor-not-allowed"
        @change="handleSignalChange"
      >
        <option value="logs">Logs</option>
        <option value="metrics">Metrics</option>
        <option value="traces">Traces</option>
      </select>
    </div>

    <div class="flex flex-col gap-1.5">
      <label for="clickhouse-query" class="text-sm font-medium text-text-primary">SQL</label>
      <textarea
        id="clickhouse-query"
        :value="props.modelValue"
        data-testid="clickhouse-query-input"
        :disabled="props.disabled"
        :placeholder="placeholder"
        rows="7"
        spellcheck="false"
        class="w-full rounded-sm border border-border bg-surface-raised px-3.5 py-3 text-sm font-mono text-text-primary min-h-[140px] resize-y leading-relaxed transition-colors duration-200 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:bg-surface-overlay disabled:text-text-muted disabled:cursor-not-allowed"
        @input="handleQueryInput"
      />
    </div>

    <div class="rounded-sm border border-border bg-surface-overlay px-3.5 py-3">
      <p class="m-0 text-xs text-text-muted">Expected columns for {{ props.signal }} queries:</p>
      <p class="mt-2 mb-0 flex flex-wrap gap-1.5">
        <code v-for="column in expectedColumns" :key="column" class="inline-flex items-center px-1.5 py-0.5 rounded bg-accent-muted border border-accent-border text-xs text-text-secondary font-mono">{{ column }}</code>
      </p>
      <p class="mt-2.5 mb-0 text-xs text-text-muted leading-relaxed">Time placeholders supported: <code class="inline-flex items-center px-1.5 py-0.5 rounded bg-accent-muted border border-accent-border text-xs text-text-secondary font-mono">{start}</code>, <code class="inline-flex items-center px-1.5 py-0.5 rounded bg-accent-muted border border-accent-border text-xs text-text-secondary font-mono">{end}</code>, <code class="inline-flex items-center px-1.5 py-0.5 rounded bg-accent-muted border border-accent-border text-xs text-text-secondary font-mono">{step}</code>, <code class="inline-flex items-center px-1.5 py-0.5 rounded bg-accent-muted border border-accent-border text-xs text-text-secondary font-mono">{start_ms}</code>, <code class="inline-flex items-center px-1.5 py-0.5 rounded bg-accent-muted border border-accent-border text-xs text-text-secondary font-mono">{end_ms}</code>, <code class="inline-flex items-center px-1.5 py-0.5 rounded bg-accent-muted border border-accent-border text-xs text-text-secondary font-mono">{start_ns}</code>, <code class="inline-flex items-center px-1.5 py-0.5 rounded bg-accent-muted border border-accent-border text-xs text-text-secondary font-mono">{end_ns}</code>.</p>
    </div>
  </div>
</template>
