<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Play, Tag } from 'lucide-vue-next'
import { queryPrometheus, type PrometheusQueryResult } from '../composables/useProm'

const props = defineProps<{
  modelValue: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const query = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value)
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
      valueCount: values.length
    }
  })
})
</script>

<template>
  <div class="query-editor">
    <div class="query-input-group">
      <label for="promql-query">PromQL Query</label>
      <textarea
        id="promql-query"
        v-model="query"
        placeholder="up"
        rows="3"
        :disabled="disabled || loading"
        class="query-textarea"
        @keydown.ctrl.enter="runQuery"
      ></textarea>
      <div class="query-actions">
        <button
          type="button"
          class="btn btn-run"
          :disabled="disabled || loading || !query.trim()"
          @click="runQuery"
        >
          <Play :size="14" />
          <span>{{ loading ? 'Running...' : 'Run Query' }}</span>
        </button>
        <span class="hint">Ctrl+Enter to run</span>
      </div>
    </div>

    <div v-if="error" class="query-error">
      {{ error }}
    </div>

    <div v-if="showPreview && result?.status === 'success'" class="query-preview">
      <div class="preview-header">
        <h4>Query Results</h4>
        <span class="result-count">{{ result.data?.result?.length || 0 }} series</span>
      </div>

      <div v-if="metricLabels.length > 0" class="labels-section">
        <Tag :size="14" class="labels-icon" />
        <span class="labels-title">Labels:</span>
        <span v-for="label in metricLabels" :key="label" class="label-tag">
          {{ label }}
        </span>
      </div>

      <div v-if="previewData.length > 0" class="preview-table-wrapper">
        <table class="preview-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th>Latest Value</th>
              <th>Points</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in previewData" :key="index">
              <td class="metric-cell">
                <code>{{ JSON.stringify(row.metric) }}</code>
              </td>
              <td>{{ row.latestValue }}</td>
              <td>{{ row.valueCount }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="no-data">
        No data returned for the selected time range.
      </div>
    </div>
  </div>
</template>

<style>
.query-editor {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.query-input-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.query-input-group label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-0);
}

.query-textarea {
  width: 100%;
  padding: 0.75rem 1rem;
  background: var(--color-bg-0);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.8125rem;
  color: var(--color-text-0);
  resize: vertical;
  min-height: 80px;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.query-textarea::placeholder {
  color: var(--color-text-2);
}

.query-textarea:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: var(--focus-ring);
}

.query-textarea:disabled {
  background: var(--color-bg-2);
  color: var(--color-text-2);
  cursor: not-allowed;
}

.query-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.btn-run {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  background: var(--color-success);
  border: 1px solid var(--color-success);
  border-radius: 6px;
  color: white;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-run:hover:not(:disabled) {
  background: #00c49a;
  border-color: #00c49a;
}

.btn-run:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.hint {
  font-size: 0.75rem;
  color: var(--color-text-2);
}

.query-error {
  padding: 0.75rem 1rem;
  background: rgba(255, 107, 107, 0.1);
  border: 1px solid rgba(255, 107, 107, 0.3);
  border-radius: 6px;
  color: var(--color-danger);
  font-size: 0.8125rem;
}

.query-preview {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
  background: var(--color-bg-2);
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background: var(--color-bg-1);
  border-bottom: 1px solid var(--color-border);
}

.preview-header h4 {
  margin: 0;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-text-0);
}

.result-count {
  font-size: 0.75rem;
  color: var(--color-text-2);
  background: var(--color-bg-2);
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.labels-section {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-border);
  font-size: 0.8125rem;
}

.labels-icon {
  color: var(--color-text-2);
}

.labels-title {
  color: var(--color-text-1);
  font-weight: 500;
}

.label-tag {
  display: inline-block;
  padding: 0.125rem 0.5rem;
  background: var(--color-bg-1);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-family: monospace;
  font-size: 0.75rem;
  color: var(--color-accent);
}

.preview-table-wrapper {
  max-height: 200px;
  overflow-y: auto;
}

.preview-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}

.preview-table th,
.preview-table td {
  padding: 0.625rem 1rem;
  text-align: left;
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text-0);
}

.preview-table th {
  background: var(--color-bg-1);
  font-weight: 500;
  position: sticky;
  top: 0;
  color: var(--color-text-1);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.preview-table tr:last-child td {
  border-bottom: none;
}

.preview-table tr:hover td {
  background: var(--color-bg-hover);
}

.metric-cell {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.metric-cell code {
  font-size: 0.75rem;
  color: var(--color-text-1);
}

.no-data {
  padding: 1.5rem;
  text-align: center;
  color: var(--color-text-2);
  font-size: 0.8125rem;
}
</style>
