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
  <div class="flex flex-col gap-3.5" :class="{ 'opacity-60 pointer-events-none': props.disabled }">
    <div v-if="props.showSignalSelector" class="flex flex-col gap-1.5">
      <label for="elasticsearch-signal" class="text-sm font-medium text-slate-900">Signal Type</label>
      <select
        id="elasticsearch-signal"
        :value="props.signal"
        :disabled="props.disabled"
        class="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 cursor-pointer transition-colors duration-200 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
        @change="handleSignalChange"
      >
        <option value="metrics">Metrics</option>
        <option value="logs">Logs</option>
      </select>
    </div>

    <div class="flex flex-col gap-1.5">
      <label for="elasticsearch-query" class="text-sm font-medium text-slate-900">Query</label>
      <textarea
        id="elasticsearch-query"
        :value="props.modelValue"
        :disabled="props.disabled"
        :placeholder="placeholder"
        rows="7"
        spellcheck="false"
        class="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-3 text-sm font-mono text-slate-900 min-h-[140px] resize-y leading-relaxed transition-colors duration-200 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
        @input="handleQueryInput"
      />
    </div>

    <p class="m-0 text-xs text-slate-400 leading-relaxed">{{ helperText }}</p>
  </div>
</template>
