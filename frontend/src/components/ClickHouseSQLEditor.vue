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
  <div class="clickhouse-sql-editor" :class="{ disabled: props.disabled }">
    <div class="signal-row">
      <label for="clickhouse-signal">Signal Type</label>
      <select
        id="clickhouse-signal"
        :value="props.signal"
        :disabled="props.disabled"
        @change="handleSignalChange"
      >
        <option value="logs">Logs</option>
        <option value="metrics">Metrics</option>
        <option value="traces">Traces</option>
      </select>
    </div>

    <div class="query-row">
      <label for="clickhouse-query">SQL</label>
      <textarea
        id="clickhouse-query"
        :value="props.modelValue"
        :disabled="props.disabled"
        :placeholder="placeholder"
        rows="7"
        spellcheck="false"
        @input="handleQueryInput"
      />
    </div>

    <div class="help-box">
      <p class="help-title">Expected columns for {{ props.signal }} queries:</p>
      <p class="help-columns">
        <code v-for="column in expectedColumns" :key="column">{{ column }}</code>
      </p>
      <p class="help-note">Time placeholders supported: <code>{start}</code>, <code>{end}</code>, <code>{step}</code>, <code>{start_ms}</code>, <code>{end_ms}</code>, <code>{start_ns}</code>, <code>{end_ns}</code>.</p>
    </div>
  </div>
</template>

<style>
.clickhouse-sql-editor {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.clickhouse-sql-editor.disabled {
  opacity: 0.6;
  pointer-events: none;
}

.signal-row,
.query-row {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.signal-row label,
.query-row label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-text-0);
}

.signal-row select,
.query-row textarea {
  width: 100%;
  padding: 0.75rem 0.9rem;
  background: var(--color-bg-2);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 0.875rem;
  color: var(--color-text-0);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.signal-row select:focus,
.query-row textarea:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: var(--focus-ring);
}

.signal-row select:disabled,
.query-row textarea:disabled {
  background: var(--color-bg-0);
  color: var(--color-text-2);
  cursor: not-allowed;
}

.signal-row select {
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a0a0a0' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.75rem center;
  padding-right: 2.5rem;
}

.query-row textarea {
  min-height: 140px;
  resize: vertical;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  line-height: 1.45;
}

.help-box {
  padding: 0.75rem 0.85rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: rgba(16, 26, 40, 0.55);
}

.help-title {
  margin: 0;
  color: var(--color-text-1);
  font-size: 0.75rem;
}

.help-columns {
  margin: 0.5rem 0 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.help-columns code,
.help-note code {
  display: inline-flex;
  align-items: center;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.25);
  color: var(--color-text-0);
  font-size: 0.72rem;
}

.help-note {
  margin: 0.65rem 0 0;
  color: var(--color-text-2);
  font-size: 0.73rem;
  line-height: 1.45;
}
</style>
