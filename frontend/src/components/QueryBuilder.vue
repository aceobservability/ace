<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { Search, Plus, X, Code, Layers, ChevronDown, ChevronUp } from 'lucide-vue-next'
import MonacoQueryEditor from './MonacoQueryEditor.vue'
import {
  useQueryBuilder,
  AGGREGATION_FUNCTIONS,
  LABEL_OPERATORS,
  type LabelFilter
} from '../composables/useQueryBuilder'

const props = defineProps<{
  modelValue: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const {
  mode,
  metric,
  labelFilters,
  aggregation,
  groupByLabels,
  rangeInterval,
  kValue,
  codeQuery,
  generatedQuery,
  activeQuery,
  metricsCache,
  labelsCache,
  labelValuesCache,
  loadingMetrics,
  loadingLabelValues,
  loadMetrics,
  loadLabels,
  loadLabelValues,
  addLabelFilter,
  removeLabelFilter,
  updateLabelFilter,
  toggleGroupByLabel,
  setQuery
} = useQueryBuilder(props.modelValue)

// Track when we're emitting to avoid reacting to our own changes
const isEmitting = ref(false)

// Metric search
const metricSearch = ref('')
const showMetricDropdown = ref(false)

const filteredMetrics = computed(() => {
  if (!metricSearch.value) return metricsCache.value.slice(0, 100)
  const search = metricSearch.value.toLowerCase()
  return metricsCache.value
    .filter(m => m.toLowerCase().includes(search))
    .slice(0, 100)
})

// Group by expanded state
const showGroupBy = ref(false)

// Available labels for group by (exclude __name__)
const availableLabelsForGroupBy = computed(() => {
  return labelsCache.value.filter(l => l !== '__name__')
})

// Check if aggregation requires range
const aggregationRequiresRange = computed(() => {
  const func = AGGREGATION_FUNCTIONS.find(f => f.value === aggregation.value)
  return func && 'requiresRange' in func && func.requiresRange
})

// Check if aggregation requires K value
const aggregationRequiresK = computed(() => {
  const func = AGGREGATION_FUNCTIONS.find(f => f.value === aggregation.value)
  return func && 'requiresK' in func && func.requiresK
})

// Check if builder mode is available
// Builder is unavailable if there's a code query that can't be represented in builder
const builderAvailable = computed(() => {
  // If there's no query, builder is available
  if (!codeQuery.value) return true
  // If we're in builder mode with a generated query, builder is available
  if (mode.value === 'builder' && generatedQuery.value) return true
  // If the code query matches the generated query, builder is available
  if (codeQuery.value === generatedQuery.value) return true
  // If there's a code query but no metric selected (can't parse), builder is unavailable
  if (codeQuery.value && !metric.value) return false
  return true
})

// Load metadata on mount
onMounted(async () => {
  await Promise.all([loadMetrics(), loadLabels()])
})

// Sync with v-model
watch(() => props.modelValue, (newValue) => {
  // Ignore changes triggered by our own emit
  if (isEmitting.value) return
  if (newValue !== activeQuery.value) {
    setQuery(newValue)
  }
})

watch(activeQuery, (newValue) => {
  isEmitting.value = true
  emit('update:modelValue', newValue)
  nextTick(() => {
    isEmitting.value = false
  })
})

// Select metric
function selectMetric(m: string) {
  metric.value = m
  metricSearch.value = ''
  showMetricDropdown.value = false
}

// Delay hiding metric dropdown (to allow click events to fire)
function hideMetricDropdownDelayed() {
  setTimeout(() => {
    showMetricDropdown.value = false
  }, 200)
}

// Handle label filter label change - preload values
async function handleLabelChange(filter: LabelFilter, newLabel: string) {
  updateLabelFilter(filter.id, { label: newLabel, value: '' })
  if (newLabel) {
    await loadLabelValues(newLabel)
  }
}

// Get cached label values
function getLabelValues(labelName: string): string[] {
  return labelValuesCache.value.get(labelName) || []
}
</script>

<template>
  <div class="query-builder" :class="{ disabled }">
    <!-- Mode Toggle -->
    <div class="mode-toggle">
      <button
        type="button"
        class="mode-btn"
        :class="{ active: mode === 'builder' }"
        @click="mode = 'builder'"
        :disabled="disabled || !builderAvailable"
        :title="!builderAvailable ? 'Query cannot be edited in builder mode' : ''"
      >
        <Layers :size="14" />
        <span>Builder</span>
      </button>
      <button
        type="button"
        class="mode-btn"
        :class="{ active: mode === 'code' }"
        @click="mode = 'code'"
        :disabled="disabled"
      >
        <Code :size="14" />
        <span>Code</span>
      </button>
    </div>

    <!-- Builder Mode -->
    <div v-if="mode === 'builder'" class="builder-mode">
      <!-- Metric Selector -->
      <div class="builder-section">
        <label class="section-label">Metric</label>
        <div class="metric-selector">
          <div class="search-input-wrapper">
            <Search :size="14" class="search-icon" />
            <input
              v-model="metricSearch"
              type="text"
              class="search-input"
              placeholder="Search metrics..."
              :disabled="disabled || loadingMetrics"
              @focus="showMetricDropdown = true"
              @blur="hideMetricDropdownDelayed"
            />
            <span v-if="metric" class="selected-metric">{{ metric }}</span>
          </div>

          <div v-if="showMetricDropdown && filteredMetrics.length > 0" class="dropdown">
            <div
              v-for="m in filteredMetrics"
              :key="m"
              class="dropdown-item"
              :class="{ selected: m === metric }"
              @mousedown.prevent="selectMetric(m)"
            >
              {{ m }}
            </div>
            <div v-if="loadingMetrics" class="dropdown-loading">Loading...</div>
          </div>
        </div>
      </div>

      <!-- Label Filters -->
      <div class="builder-section">
        <div class="section-header">
          <label class="section-label">Label Filters</label>
          <button
            type="button"
            class="btn-add"
            @click="addLabelFilter"
            :disabled="disabled"
          >
            <Plus :size="14" />
            <span>Add Filter</span>
          </button>
        </div>

        <div v-if="labelFilters.length === 0" class="empty-filters">
          No label filters. Click "Add Filter" to filter by labels.
        </div>

        <div v-else class="filters-list">
          <div
            v-for="filter in labelFilters"
            :key="filter.id"
            class="filter-row"
          >
            <!-- Label select -->
            <select
              :value="filter.label"
              @change="handleLabelChange(filter, ($event.target as HTMLSelectElement).value)"
              class="filter-select"
              :disabled="disabled"
            >
              <option value="">Select label</option>
              <option v-for="label in labelsCache" :key="label" :value="label">
                {{ label }}
              </option>
            </select>

            <!-- Operator select -->
            <select
              :value="filter.operator"
              @change="updateLabelFilter(filter.id, { operator: ($event.target as HTMLSelectElement).value as any })"
              class="filter-select filter-operator"
              :disabled="disabled"
            >
              <option v-for="op in LABEL_OPERATORS" :key="op.value" :value="op.value">
                {{ op.label }}
              </option>
            </select>

            <!-- Value select/input -->
            <select
              v-if="getLabelValues(filter.label).length > 0"
              :value="filter.value"
              @change="updateLabelFilter(filter.id, { value: ($event.target as HTMLSelectElement).value })"
              class="filter-select filter-value"
              :disabled="disabled || loadingLabelValues === filter.label"
            >
              <option value="">Select value</option>
              <option v-for="v in getLabelValues(filter.label)" :key="v" :value="v">
                {{ v }}
              </option>
            </select>
            <input
              v-else
              type="text"
              :value="filter.value"
              @input="updateLabelFilter(filter.id, { value: ($event.target as HTMLInputElement).value })"
              class="filter-input"
              placeholder="Value"
              :disabled="disabled"
            />

            <!-- Remove button -->
            <button
              type="button"
              class="btn-remove"
              @click="removeLabelFilter(filter.id)"
              :disabled="disabled"
            >
              <X :size="14" />
            </button>
          </div>
        </div>
      </div>

      <!-- Aggregation -->
      <div class="builder-section">
        <label class="section-label">Aggregation</label>
        <div class="aggregation-row">
          <select
            v-model="aggregation"
            class="aggregation-select"
            :disabled="disabled"
          >
            <option v-for="agg in AGGREGATION_FUNCTIONS" :key="agg.value" :value="agg.value">
              {{ agg.label }}
            </option>
          </select>

          <!-- Range input for rate/increase functions -->
          <div v-if="aggregationRequiresRange" class="range-input-group">
            <label>Range:</label>
            <input
              v-model="rangeInterval"
              type="text"
              class="range-input"
              placeholder="5m"
              :disabled="disabled"
            />
          </div>

          <!-- K value for topk/bottomk -->
          <div v-if="aggregationRequiresK" class="k-input-group">
            <label>K:</label>
            <input
              v-model.number="kValue"
              type="number"
              min="1"
              class="k-input"
              :disabled="disabled"
            />
          </div>
        </div>
      </div>

      <!-- Group By -->
      <div v-if="aggregation" class="builder-section">
        <button
          type="button"
          class="section-toggle"
          @click="showGroupBy = !showGroupBy"
          :disabled="disabled"
        >
          <span class="section-label">Group By</span>
          <span v-if="groupByLabels.length > 0" class="group-count">{{ groupByLabels.length }}</span>
          <component :is="showGroupBy ? ChevronUp : ChevronDown" :size="14" />
        </button>

        <div v-if="showGroupBy" class="group-by-section">
          <div class="group-by-list">
            <label
              v-for="label in availableLabelsForGroupBy"
              :key="label"
              class="group-by-item"
            >
              <input
                type="checkbox"
                :checked="groupByLabels.includes(label)"
                @change="toggleGroupByLabel(label)"
                :disabled="disabled"
              />
              <span>{{ label }}</span>
            </label>
          </div>
        </div>
      </div>

      <!-- Preview -->
      <div class="builder-section preview-section">
        <label class="section-label">Generated PromQL</label>
        <div class="preview-box">
          <code v-if="generatedQuery">{{ generatedQuery }}</code>
          <span v-else class="preview-placeholder">Select a metric to generate query</span>
        </div>
      </div>
    </div>

    <!-- Code Mode -->
    <div v-else class="code-mode">
      <label class="section-label">PromQL Query</label>
      <MonacoQueryEditor
        v-model="codeQuery"
        :disabled="disabled"
        :height="120"
        placeholder="Enter PromQL query..."
      />
    </div>
  </div>
</template>

<style>
.query-builder {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.query-builder.disabled {
  opacity: 0.6;
  pointer-events: none;
}

.mode-toggle {
  display: flex;
  background: rgba(20, 33, 52, 0.8);
  border-radius: 10px;
  border: 1px solid var(--color-border);
  padding: 2px;
  width: fit-content;
}

.mode-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  background: transparent;
  border: none;
  border-radius: 8px;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-text-1);
  cursor: pointer;
  transition: all 0.2s;
}

.mode-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.mode-btn:hover:not(:disabled) {
  color: var(--color-text-0);
}

.mode-btn.active {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.22), rgba(99, 102, 241, 0.14));
  border: 1px solid rgba(245, 158, 11, 0.24);
  color: var(--color-text-0);
  box-shadow: 0 2px 10px rgba(2, 8, 23, 0.28);
}

.builder-mode,
.code-mode {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.builder-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.section-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-text-0);
}

.section-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--color-text-0);
  width: 100%;
}

.section-toggle:hover {
  color: var(--color-accent);
}

.group-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  background: var(--color-accent);
  border-radius: 10px;
  font-size: 0.75rem;
  font-weight: 500;
  color: white;
}

.metric-selector {
  position: relative;
}

.search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 0.75rem;
  color: var(--color-text-2);
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 0.625rem 1rem 0.625rem 2.25rem;
  background: var(--color-bg-2);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  font-size: 0.875rem;
  color: var(--color-text-0);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.search-input:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: var(--focus-ring);
}

.selected-metric {
  position: absolute;
  right: 0.75rem;
  padding: 0.25rem 0.5rem;
  background: var(--color-accent);
  border-radius: 4px;
  font-size: 0.75rem;
  font-family: monospace;
  color: white;
}

.dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  max-height: 250px;
  overflow-y: auto;
  background: rgba(11, 21, 33, 0.98);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 100;
}

.dropdown-item {
  padding: 0.5rem 0.75rem;
  font-size: 0.8125rem;
  font-family: monospace;
  color: var(--color-text-0);
  cursor: pointer;
  transition: background-color 0.15s;
}

.dropdown-item:hover {
  background: var(--color-bg-hover);
}

.dropdown-item.selected {
  background: var(--color-accent);
  color: white;
}

.dropdown-loading {
  padding: 0.75rem;
  text-align: center;
  color: var(--color-text-2);
  font-size: 0.8125rem;
}

.btn-add {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  background: var(--color-bg-2);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-text-1);
  cursor: pointer;
  transition: all 0.2s;
}

.btn-add:hover:not(:disabled) {
  background: var(--color-bg-hover);
  color: var(--color-text-0);
  border-color: var(--color-border-strong);
}

.empty-filters {
  padding: 1rem;
  text-align: center;
  color: var(--color-text-2);
  font-size: 0.8125rem;
  background: var(--color-bg-2);
  border-radius: 6px;
}

.filters-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.filter-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.filter-select,
.filter-input {
  padding: 0.5rem 0.75rem;
  background: var(--color-bg-2);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-size: 0.8125rem;
  color: var(--color-text-0);
  transition: border-color 0.2s;
}

.filter-select:focus,
.filter-input:focus {
  outline: none;
  border-color: var(--color-accent);
}

.filter-select {
  flex: 1;
  min-width: 0;
  cursor: pointer;
}

.filter-operator {
  flex: 0 0 70px;
}

.filter-value {
  flex: 1.5;
}

.filter-input {
  flex: 1.5;
}

.btn-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--color-text-2);
  cursor: pointer;
  transition: all 0.2s;
}

.btn-remove:hover:not(:disabled) {
  background: rgba(255, 107, 107, 0.1);
  color: var(--color-danger);
}

.aggregation-row {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.aggregation-select {
  flex: 1;
  max-width: 200px;
  padding: 0.5rem 0.75rem;
  background: var(--color-bg-2);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-size: 0.8125rem;
  color: var(--color-text-0);
  cursor: pointer;
}

.aggregation-select:focus {
  outline: none;
  border-color: var(--color-accent);
}

.range-input-group,
.k-input-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.range-input-group label,
.k-input-group label {
  font-size: 0.8125rem;
  color: var(--color-text-1);
}

.range-input {
  width: 80px;
  padding: 0.5rem 0.75rem;
  background: var(--color-bg-2);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-size: 0.8125rem;
  font-family: monospace;
  color: var(--color-text-0);
}

.range-input:focus {
  outline: none;
  border-color: var(--color-accent);
}

.k-input {
  width: 60px;
  padding: 0.5rem 0.75rem;
  background: var(--color-bg-2);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-size: 0.8125rem;
  color: var(--color-text-0);
}

.k-input:focus {
  outline: none;
  border-color: var(--color-accent);
}

.group-by-section {
  padding: 0.75rem;
  background: var(--color-bg-2);
  border-radius: 6px;
}

.group-by-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.group-by-item {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  background: var(--color-bg-1);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-size: 0.75rem;
  color: var(--color-text-0);
  cursor: pointer;
  transition: all 0.2s;
}

.group-by-item:hover {
  border-color: var(--color-accent);
}

.group-by-item input {
  accent-color: var(--color-accent);
}

.preview-section {
  margin-top: 0.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--color-border);
}

.preview-box {
  padding: 0.75rem 1rem;
  background: var(--color-bg-2);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  min-height: 48px;
}

.preview-box code {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.8125rem;
  color: var(--color-accent);
  word-break: break-all;
}

.preview-placeholder {
  color: var(--color-text-2);
  font-size: 0.8125rem;
}

.code-textarea {
  width: 100%;
  padding: 0.75rem 1rem;
  background: var(--color-bg-2);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.8125rem;
  color: var(--color-text-0);
  resize: vertical;
  min-height: 100px;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.code-textarea::placeholder {
  color: var(--color-text-2);
}

.code-textarea:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: var(--focus-ring);
}

.code-textarea:disabled {
  background: var(--color-bg-0);
  color: var(--color-text-2);
  cursor: not-allowed;
}
</style>
