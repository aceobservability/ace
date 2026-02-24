<script setup lang="ts">
import { computed } from 'vue'

type ElasticsearchSignal = 'logs' | 'metrics'

const props = withDefaults(
  defineProps<{
    modelValue: string
    signal?: ElasticsearchSignal
    disabled?: boolean
    showSignalSelector?: boolean
  }>(),
  {
    signal: 'metrics',
    disabled: false,
    showSignalSelector: true,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:signal': [value: ElasticsearchSignal]
}>()

const examples: Record<ElasticsearchSignal, string> = {
  metrics: '{\n  "index": "ace-logs-*",\n  "query": {\n    "query_string": {\n      "query": "service.name:api"\n    }\n  },\n  "aggs": {\n    "timeseries": {\n      "date_histogram": {\n        "field": "@timestamp",\n        "fixed_interval": "1m"\n      }\n    }\n  }\n}',
  logs: '{\n  "index": "ace-logs-*",\n  "query": {\n    "query_string": {\n      "query": "level:error AND service.name:api"\n    }\n  },\n  "size": 200\n}',
}

const helperText = computed(() => {
  if (props.signal === 'logs') {
    return 'Use Elasticsearch Query DSL JSON (or plain Lucene query string). Time range filtering is applied automatically.'
  }
  return 'Use Elasticsearch Query DSL JSON for aggregations. If aggs are omitted, Ace builds a date_histogram timeseries automatically.'
})

const placeholder = computed(() => examples[props.signal])

function handleSignalChange(event: Event) {
  emit('update:signal', (event.target as HTMLSelectElement).value as ElasticsearchSignal)
}

function handleQueryInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
}
</script>

<template>
  <div class="elasticsearch-query-editor" :class="{ disabled: props.disabled }">
    <div v-if="props.showSignalSelector" class="signal-row">
      <label for="elasticsearch-signal">Signal Type</label>
      <select
        id="elasticsearch-signal"
        :value="props.signal"
        :disabled="props.disabled"
        @change="handleSignalChange"
      >
        <option value="metrics">Metrics</option>
        <option value="logs">Logs</option>
      </select>
    </div>

    <div class="query-row">
      <label for="elasticsearch-query">Query</label>
      <textarea
        id="elasticsearch-query"
        :value="props.modelValue"
        :disabled="props.disabled"
        :placeholder="placeholder"
        rows="7"
        spellcheck="false"
        @input="handleQueryInput"
      />
    </div>

    <p class="help-text">{{ helperText }}</p>
  </div>
</template>

<style scoped>
.elasticsearch-query-editor {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.elasticsearch-query-editor.disabled {
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
  color: var(--text-primary);
}

.signal-row select,
.query-row textarea {
  width: 100%;
  padding: 0.75rem 0.9rem;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  font-size: 0.875rem;
  color: var(--text-primary);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.signal-row select:focus,
.query-row textarea:focus {
  outline: none;
  border-color: var(--accent-primary);
  box-shadow: var(--focus-ring);
}

.signal-row select:disabled,
.query-row textarea:disabled {
  background: var(--bg-primary);
  color: var(--text-tertiary);
  cursor: not-allowed;
}

.signal-row select {
  cursor: pointer;
}

.query-row textarea {
  min-height: 140px;
  resize: vertical;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  line-height: 1.45;
}

.help-text {
  margin: 0;
  font-size: 0.75rem;
  color: var(--text-tertiary);
  line-height: 1.45;
}
</style>
