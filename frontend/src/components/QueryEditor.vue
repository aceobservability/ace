<script setup lang="ts">
import { Play, Tag } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { type PrometheusQueryResult, queryPrometheus } from '../composables/useProm'

const props = defineProps<{
  modelValue: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const query = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value),
})

const loading = ref(false)
const error = ref<string | null>(null)
const result = ref<PrometheusQueryResult | null>(null)
const showPreview = ref(false)

async function runQuery() {
  if (!query.value.trim()) {
    error.value = 'Query is required'
    return
  }

  loading.value = true
  error.value = null
  result.value = null

  try {
    // Use a 1-hour time range ending now for preview
    const end = Math.floor(Date.now() / 1000)
    const start = end - 3600
    const step = 15

    const response = await queryPrometheus(query.value, start, end, step)
    result.value = response

    if (response.status === 'error') {
      error.value = response.error || 'Query failed'
    } else {
      showPreview.value = true
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to execute query'
  } finally {
    loading.value = false
  }
}

// Reset results when query changes
watch(query, () => {
  error.value = null
  result.value = null
  showPreview.value = false
})

// Extract unique labels from results
const metricLabels = computed(() => {
  if (!result.value?.data?.result) return []

  const labelSet = new Set<string>()
  for (const metric of result.value.data.result) {
    for (const key of Object.keys(metric.metric)) {
      labelSet.add(key)
    }
  }
  return Array.from(labelSet).sort()
})

// Format results for preview table
const previewData = computed(() => {
  if (!result.value?.data?.result) return []

  return result.value.data.result.map((metric) => {
    const values = metric.values ?? []
    const lastValue = values.length > 0 ? values[values.length - 1] : null
    return {
      metric: metric.metric,
      latestValue: lastValue ? lastValue[1] : 'N/A',
      valueCount: values.length,
    }
  })
})
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-col gap-2">
      <label for="promql-query" class="text-sm font-medium text-text-primary">PromQL Query</label>
      <textarea
        id="promql-query"
        v-model="query"
        placeholder="up"
        rows="3"
        :disabled="disabled || loading"
        class="w-full rounded-lg border border-border bg-surface-raised px-4 py-3 font-mono text-sm text-text-primary resize-y min-h-[80px] transition-colors duration-200 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:bg-surface-overlay disabled:text-slate-400 disabled:cursor-not-allowed"
        @keydown.ctrl.enter="runQuery"
      ></textarea>
      <div class="flex items-center gap-4">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 border border-emerald-600 rounded-lg text-white text-sm font-medium cursor-pointer transition-all duration-200 hover:enabled:bg-emerald-700 hover:enabled:border-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="disabled || loading || !query.trim()"
          @click="runQuery"
        >
          <Play :size="14" />
          <span>{{ loading ? 'Running...' : 'Run Query' }}</span>
        </button>
        <span class="text-xs text-slate-400">Ctrl+Enter to run</span>
      </div>
    </div>

    <div v-if="error" class="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
      {{ error }}
    </div>

    <div v-if="showPreview && result?.status === 'success'" class="border border-border rounded-lg overflow-hidden bg-surface-raised">
      <div class="flex justify-between items-center px-4 py-3 bg-surface-overlay border-b border-border">
        <h4 class="m-0 text-sm font-semibold text-text-primary">Query Results</h4>
        <span class="text-xs text-text-muted bg-surface-overlay px-2 py-0.5 rounded">{{ result.data?.result?.length || 0 }} series</span>
      </div>

      <div v-if="metricLabels.length > 0" class="flex items-center flex-wrap gap-2 px-4 py-3 border-b border-border text-sm">
        <Tag :size="14" class="text-slate-400" />
        <span class="text-text-muted font-medium">Labels:</span>
        <span v-for="label in metricLabels" :key="label" class="rounded-full bg-surface-overlay px-2 py-0.5 text-xs text-text-secondary font-mono">
          {{ label }}
        </span>
      </div>

      <div v-if="previewData.length > 0" class="max-h-[200px] overflow-y-auto">
        <table class="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th class="px-4 py-2.5 text-left border-b border-border bg-surface-overlay font-medium sticky top-0 text-xs text-text-muted uppercase tracking-wide">Metric</th>
              <th class="px-4 py-2.5 text-left border-b border-border bg-surface-overlay font-medium sticky top-0 text-xs text-text-muted uppercase tracking-wide">Latest Value</th>
              <th class="px-4 py-2.5 text-left border-b border-border bg-surface-overlay font-medium sticky top-0 text-xs text-text-muted uppercase tracking-wide">Points</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in previewData" :key="index" class="hover:bg-surface-overlay">
              <td class="px-4 py-2.5 text-left border-b border-border text-text-primary max-w-[300px] overflow-hidden text-ellipsis whitespace-nowrap">
                <code class="text-xs text-text-muted">{{ JSON.stringify(row.metric) }}</code>
              </td>
              <td class="px-4 py-2.5 text-left border-b border-border text-text-primary">{{ row.latestValue }}</td>
              <td class="px-4 py-2.5 text-left border-b border-border text-text-primary">{{ row.valueCount }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="py-6 text-center text-slate-400 text-sm">
        No data returned for the selected time range.
      </div>
    </div>
  </div>
</template>
