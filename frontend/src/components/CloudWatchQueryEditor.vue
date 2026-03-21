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
  metrics:
    '{\n  "namespace": "AWS/EC2",\n  "metric_name": "CPUUtilization",\n  "dimensions": {\n    "InstanceId": "i-1234567890"\n  },\n  "stat": "Average",\n  "period": 60\n}',
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
  <div class="flex flex-col gap-3.5" :class="{ 'opacity-60 pointer-events-none': props.disabled }">
    <div v-if="props.showSignalSelector" class="flex flex-col gap-1.5">
      <label for="cloudwatch-signal" class="text-sm font-medium text-text-primary">Signal Type</label>
      <select
        id="cloudwatch-signal"
        :value="props.signal"
        data-testid="cloudwatch-signal-select"
        :disabled="props.disabled"
        class="w-full rounded-sm border border-border bg-surface-overlay px-3 py-2 text-sm text-text-primary cursor-pointer transition-colors duration-200 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:bg-surface-overlay disabled:text-text-muted disabled:cursor-not-allowed"
        @change="handleSignalChange"
      >
        <option value="metrics">Metrics</option>
        <option value="logs">Logs</option>
      </select>
    </div>

    <div class="flex flex-col gap-1.5">
      <label for="cloudwatch-query" class="text-sm font-medium text-text-primary">Query</label>
      <textarea
        id="cloudwatch-query"
        :value="props.modelValue"
        data-testid="cloudwatch-query-input"
        :disabled="props.disabled"
        :placeholder="placeholder"
        rows="7"
        spellcheck="false"
        class="w-full rounded-sm border border-border bg-surface-raised px-3.5 py-3 text-sm font-mono text-text-primary min-h-[140px] resize-y leading-relaxed transition-colors duration-200 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:bg-surface-overlay disabled:text-text-muted disabled:cursor-not-allowed"
        @input="handleQueryInput"
      />
    </div>

    <p class="m-0 text-xs text-text-muted leading-relaxed">{{ helperText }}</p>
  </div>
</template>
