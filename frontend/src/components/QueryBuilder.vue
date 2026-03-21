<script setup lang="ts">
import { ChevronDown, ChevronUp, Code, Layers, Plus, Search, X } from 'lucide-vue-next'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import {
  AGGREGATION_FUNCTIONS,
  LABEL_OPERATORS,
  type LabelFilter,
  useQueryBuilder,
} from '../composables/useQueryBuilder'
import MonacoQueryEditor from './MonacoQueryEditor.vue'

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
  setQuery,
} = useQueryBuilder(props.modelValue)

// Track when we're emitting to avoid reacting to our own changes
const isEmitting = ref(false)

// Metric search
const metricSearch = ref('')
const showMetricDropdown = ref(false)

const filteredMetrics = computed(() => {
  if (!metricSearch.value) return metricsCache.value.slice(0, 100)
  const search = metricSearch.value.toLowerCase()
  return metricsCache.value.filter((m) => m.toLowerCase().includes(search)).slice(0, 100)
})

// Group by expanded state
const showGroupBy = ref(false)

// Available labels for group by (exclude __name__)
const availableLabelsForGroupBy = computed(() => {
  return labelsCache.value.filter((l) => l !== '__name__')
})

// Check if aggregation requires range
const aggregationRequiresRange = computed(() => {
  const func = AGGREGATION_FUNCTIONS.find((f) => f.value === aggregation.value)
  return func && 'requiresRange' in func && func.requiresRange
})

// Check if aggregation requires K value
const aggregationRequiresK = computed(() => {
  const func = AGGREGATION_FUNCTIONS.find((f) => f.value === aggregation.value)
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
watch(
  () => props.modelValue,
  (newValue) => {
    // Ignore changes triggered by our own emit
    if (isEmitting.value) return
    if (newValue !== activeQuery.value) {
      setQuery(newValue)
    }
  },
)

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
  <div class="flex flex-col gap-4" :class="{ 'opacity-60 pointer-events-none': disabled }">
    <!-- Mode Toggle -->
    <div class="flex rounded-sm bg-surface-overlay p-1 w-fit">
      <button
        type="button"
        class="flex items-center gap-1.5 px-3 py-1.5 bg-transparent border-none rounded-sm text-xs font-medium text-text-secondary cursor-pointer transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:text-text-primary"
        :class="{ 'bg-surface-raised text-text-primary shadow-sm': mode === 'builder' }"
        data-testid="query-builder-mode-btn"
        @click="mode = 'builder'"
        :disabled="disabled || !builderAvailable"
        :title="!builderAvailable ? 'Query cannot be edited in builder mode' : ''"
      >
        <Layers :size="14" />
        <span>Builder</span>
      </button>
      <button
        type="button"
        class="flex items-center gap-1.5 px-3 py-1.5 bg-transparent border-none rounded-sm text-xs font-medium text-text-secondary cursor-pointer transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:text-text-primary"
        :class="{ 'bg-surface-raised text-text-primary shadow-sm': mode === 'code' }"
        data-testid="query-code-mode-btn"
        @click="mode = 'code'"
        :disabled="disabled"
      >
        <Code :size="14" />
        <span>Code</span>
      </button>
    </div>

    <!-- Builder Mode -->
    <div v-if="mode === 'builder'" class="flex flex-col gap-4">
      <!-- Metric Selector -->
      <div class="flex flex-col gap-2">
        <label class="text-sm font-medium text-text-primary">Metric</label>
        <div class="relative">
          <div class="relative flex items-center">
            <Search :size="14" class="absolute left-3 text-text-muted pointer-events-none" />
            <input
              v-model="metricSearch"
              type="text"
              data-testid="query-metric-search-input"
              class="w-full rounded-sm border border-border bg-surface-overlay px-3 py-2 pl-9 text-sm text-text-primary transition-colors duration-200 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              placeholder="Search metrics..."
              :disabled="disabled || loadingMetrics"
              @focus="showMetricDropdown = true"
              @blur="hideMetricDropdownDelayed"
            />
            <span v-if="metric" class="absolute right-3 rounded bg-accent px-2 py-0.5 text-xs font-mono text-white">{{ metric }}</span>
          </div>

          <div v-if="showMetricDropdown && filteredMetrics.length > 0" class="absolute top-[calc(100%+4px)] left-0 right-0 max-h-[250px] overflow-y-auto bg-surface-raised border border-border rounded-sm shadow-lg z-[100]">
            <div
              v-for="m in filteredMetrics"
              :key="m"
              class="px-3 py-2 text-sm font-mono text-text-primary cursor-pointer transition-colors duration-150 hover:bg-surface-overlay"
              :class="{ 'bg-accent-muted text-accent': m === metric }"
              @mousedown.prevent="selectMetric(m)"
            >
              {{ m }}
            </div>
            <div v-if="loadingMetrics" class="py-3 text-center text-text-muted text-sm">Loading...</div>
          </div>
        </div>
      </div>

      <!-- Label Filters -->
      <div class="flex flex-col gap-2">
        <div class="flex justify-between items-center">
          <label class="text-sm font-medium text-text-primary">Label Filters</label>
          <button
            type="button"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-border text-xs font-medium text-text-secondary cursor-pointer transition-all duration-200 hover:enabled:bg-surface-overlay hover:enabled:text-text-primary"
            data-testid="query-add-filter-btn"
            @click="addLabelFilter"
            :disabled="disabled"
          >
            <Plus :size="14" />
            <span>Add Filter</span>
          </button>
        </div>

        <div v-if="labelFilters.length === 0" class="p-4 text-center text-text-muted text-sm bg-surface-overlay rounded-sm">
          No label filters. Click "Add Filter" to filter by labels.
        </div>

        <div v-else class="flex flex-col gap-2">
          <div
            v-for="filter in labelFilters"
            :key="filter.id"
            class="flex gap-2 items-center"
          >
            <!-- Label select -->
            <select
              :value="filter.label"
              @change="handleLabelChange(filter, ($event.target as HTMLSelectElement).value)"
              class="flex-1 min-w-0 rounded-sm border border-border bg-surface-overlay px-3 py-2 text-sm text-text-primary cursor-pointer focus:outline-none focus:border-accent"
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
              class="w-[70px] flex-none rounded-sm border border-border bg-surface-overlay px-3 py-2 text-sm font-mono text-text-secondary cursor-pointer focus:outline-none focus:border-accent"
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
              class="flex-[1.5] min-w-0 rounded-sm border border-border bg-surface-overlay px-3 py-2 text-sm text-text-primary cursor-pointer focus:outline-none focus:border-accent"
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
              class="flex-[1.5] min-w-0 rounded-sm border border-border bg-surface-overlay px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
              placeholder="Value"
              :disabled="disabled"
            />

            <!-- Remove button -->
            <button
              type="button"
              class="flex items-center justify-center w-7 h-7 bg-transparent border-none rounded text-text-muted cursor-pointer transition-all duration-200 hover:enabled:bg-red-50 hover:enabled:text-red-500"
              @click="removeLabelFilter(filter.id)"
              :disabled="disabled"
            >
              <X :size="14" />
            </button>
          </div>
        </div>
      </div>

      <!-- Aggregation -->
      <div class="flex flex-col gap-2">
        <label class="text-sm font-medium text-text-primary">Aggregation</label>
        <div class="flex gap-4 items-center">
          <select
            v-model="aggregation"
            data-testid="query-aggregation-select"
            class="flex-1 max-w-[200px] rounded-sm border border-border bg-surface-overlay px-3 py-2 text-sm text-text-primary cursor-pointer focus:outline-none focus:border-accent"
            :disabled="disabled"
          >
            <option v-for="agg in AGGREGATION_FUNCTIONS" :key="agg.value" :value="agg.value">
              {{ agg.label }}
            </option>
          </select>

          <!-- Range input for rate/increase functions -->
          <div v-if="aggregationRequiresRange" class="flex items-center gap-2">
            <label class="text-sm text-text-muted">Range:</label>
            <input
              v-model="rangeInterval"
              type="text"
              data-testid="query-range-input"
              class="w-20 rounded-sm border border-border bg-surface-overlay px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-accent"
              placeholder="5m"
              :disabled="disabled"
            />
          </div>

          <!-- K value for topk/bottomk -->
          <div v-if="aggregationRequiresK" class="flex items-center gap-2">
            <label class="text-sm text-text-muted">K:</label>
            <input
              v-model.number="kValue"
              type="number"
              min="1"
              data-testid="query-k-input"
              class="w-[60px] rounded-sm border border-border bg-surface-overlay px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
              :disabled="disabled"
            />
          </div>
        </div>
      </div>

      <!-- Group By -->
      <div v-if="aggregation" class="flex flex-col gap-2">
        <button
          type="button"
          class="flex items-center gap-2 py-2 bg-transparent border-none cursor-pointer text-text-primary w-full hover:text-accent"
          @click="showGroupBy = !showGroupBy"
          :disabled="disabled"
        >
          <span class="text-sm font-medium">Group By</span>
          <span v-if="groupByLabels.length > 0" class="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-accent rounded-sm text-xs font-medium text-white">{{ groupByLabels.length }}</span>
          <component :is="showGroupBy ? ChevronUp : ChevronDown" :size="14" />
        </button>

        <div v-if="showGroupBy" class="p-3 bg-surface-overlay rounded-sm">
          <div class="flex flex-wrap gap-2">
            <label
              v-for="label in availableLabelsForGroupBy"
              :key="label"
              class="flex items-center gap-1.5 px-2.5 py-1.5 bg-surface-raised border border-border rounded text-xs text-text-primary cursor-pointer transition-all duration-200 hover:border-accent-border"
            >
              <input
                type="checkbox"
                :checked="groupByLabels.includes(label)"
                @change="toggleGroupByLabel(label)"
                :disabled="disabled"
                class="accent-accent"
              />
              <span>{{ label }}</span>
            </label>
          </div>
        </div>
      </div>

      <!-- Preview -->
      <div class="flex flex-col gap-2 mt-2 pt-4 border-t border-border">
        <label class="text-sm font-medium text-text-primary">Generated PromQL</label>
        <div class="rounded-sm border border-border bg-surface-overlay px-4 py-3 min-h-[48px]">
          <code v-if="generatedQuery" class="font-mono text-sm text-accent break-all">{{ generatedQuery }}</code>
          <span v-else class="text-text-muted text-sm">Select a metric to generate query</span>
        </div>
      </div>
    </div>

    <!-- Code Mode -->
    <div v-else class="flex flex-col gap-4">
      <label class="text-sm font-medium text-text-primary">PromQL Query</label>
      <MonacoQueryEditor
        v-model="codeQuery"
        :disabled="disabled"
        :height="120"
        placeholder="Enter PromQL query..."
      />
    </div>
  </div>
</template>
