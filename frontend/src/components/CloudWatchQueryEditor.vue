<script setup lang="ts">
import { computed } from 'vue'

type CloudWatchSignal = 'logs' | 'metrics'

const props = withDefaults(
  defineProps<{
    modelValue: string
    signal?: CloudWatchSignal
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
  'update:signal': [value: CloudWatchSignal]
}>()

const examples: Record<CloudWatchSignal, string> = {
  metrics: '{\n  "namespace": "AWS/EC2",\n  "metric_name": "CPUUtilization",\n  "dimensions": {\n    "InstanceId": "i-1234567890"\n  },\n  "stat": "Average",\n  "period": 60\n}',
  logs: 'fields @timestamp, @message, @logStream\n| filter @message like /error/\n| sort @timestamp desc\n| limit 200',
}

const helperText = computed(() => {
  if (props.signal === 'metrics') {
    return 'Use JSON for metric queries. Required keys: namespace, metric_name (or expression). Optional: dimensions, stat, period, unit, label.'
  }
  return 'Use CloudWatch Logs Insights syntax. Configure log_group on the datasource (or include log_group/log_group_names in JSON).'
})

const placeholder = computed(() => examples[props.signal])

function handleSignalChange(event: Event) {
  emit('update:signal', (event.target as HTMLSelectElement).value as CloudWatchSignal)
}

function handleQueryInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
}
</script>

<template>
  <div class="cloudwatch-query-editor" :class="{ disabled: props.disabled }">
    <div v-if="props.showSignalSelector" class="signal-row">
      <label for="cloudwatch-signal">Signal Type</label>
      <select
        id="cloudwatch-signal"
        :value="props.signal"
        :disabled="props.disabled"
        @change="handleSignalChange"
      >
        <option value="metrics">Metrics</option>
        <option value="logs">Logs</option>
      </select>
    </div>

    <div class="query-row">
      <label for="cloudwatch-query">Query</label>
      <textarea
        id="cloudwatch-query"
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
.cloudwatch-query-editor {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.cloudwatch-query-editor.disabled {
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
