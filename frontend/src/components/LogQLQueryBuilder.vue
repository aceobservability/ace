<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { Layers, Code, Plus, X } from 'lucide-vue-next'
import MonacoQueryEditor from './MonacoQueryEditor.vue'
import { fetchDataSourceLabelValues } from '../api/datasources'

const LOGQL_LABEL_OPERATORS = [
  { value: '=', label: '=' },
  { value: '!=', label: '!=' },
  { value: '=~', label: '=~' },
  { value: '!~', label: '!~' },
] as const

const LOGQL_LINE_FILTER_OPERATORS = [
  { value: '|=', label: '|=' },
  { value: '!=', label: '!=' },
  { value: '|~', label: '|~' },
  { value: '!~', label: '!~' },
] as const

const LOGSQL_FIELD_OPERATORS = [
  { value: 'eq', label: ':=' },
  { value: 'neq', label: 'NOT :=' },
  { value: 'regex', label: ':~' },
  { value: 'nregex', label: 'NOT :~' },
] as const

const LOGSQL_TEXT_OPERATORS = [
  { value: 'contains', label: 'Contains' },
  { value: 'not_contains', label: 'Not contains' },
  { value: 'regex', label: 'Regex' },
  { value: 'not_regex', label: 'Not regex' },
] as const

type QueryLanguage = 'logql' | 'logsql'

interface LabelFilter {
  id: string
  label: string
  operator: string
  value: string
}

const props = withDefaults(defineProps<{
  modelValue: string
  indexedLabels: string[]
  datasourceId: string
  queryLanguage?: QueryLanguage
  disabled?: boolean
  editorHeight?: number
  placeholder?: string
}>(), {
  queryLanguage: 'logql',
  disabled: false,
  editorHeight: 130,
  placeholder: '{job=~".+"} |= "error"',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  submit: []
}>()

const mode = ref<'builder' | 'code'>('builder')
const codeQuery = ref(props.modelValue)
const labelFilters = ref<LabelFilter[]>([])
const lineFilterOperator = ref<string>(props.queryLanguage === 'logsql' ? 'contains' : '|=')
const lineFilterValue = ref('')
const labelValuesCache = ref<Map<string, string[]>>(new Map())
const loadingLabelValues = ref<string | null>(null)
const isEmitting = ref(false)

let filterIdCounter = 0

function generateFilterId() {
  filterIdCounter += 1
  return `logql-filter-${filterIdCounter}`
}

const isLogsQL = computed(() => props.queryLanguage === 'logsql')

const fieldOperators = computed(() => {
  return isLogsQL.value ? LOGSQL_FIELD_OPERATORS : LOGQL_LABEL_OPERATORS
})

const textOperators = computed(() => {
  return isLogsQL.value ? LOGSQL_TEXT_OPERATORS : LOGQL_LINE_FILTER_OPERATORS
})

const generatedQueryLabel = computed(() => (isLogsQL.value ? 'Generated LogsQL' : 'Generated LogQL'))
const codeEditorLabel = computed(() => (isLogsQL.value ? 'LogsQL Query' : 'LogQL Query'))
const lineFilterLabel = computed(() => (isLogsQL.value ? 'Message Filter (Optional)' : 'Line Filter (Optional)'))
const lineFilterPlaceholder = computed(() => {
  return isLogsQL.value
    ? 'Phrase or regex for _msg field'
    : 'Contains text, regex, or exact match'
})

function normalizeFieldOperator(value: string) {
  if (fieldOperators.value.some(operator => operator.value === value)) {
    return value
  }
  return fieldOperators.value[0].value
}

function normalizeTextOperator(value: string) {
  if (textOperators.value.some(operator => operator.value === value)) {
    return value
  }
  return textOperators.value[0].value
}

function quoteLogsQLField(value: string) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function escapeLogQLValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function buildLogsQLFieldFilter(filter: LabelFilter) {
  const fieldName = quoteLogsQLField(filter.label)
  const escapedValue = escapeLogQLValue(filter.value.trim())
  const operator = normalizeFieldOperator(filter.operator)

  if (operator === 'neq') {
    return `NOT ${fieldName}:="${escapedValue}"`
  }
  if (operator === 'regex') {
    return `${fieldName}:~"${escapedValue}"`
  }
  if (operator === 'nregex') {
    return `NOT ${fieldName}:~"${escapedValue}"`
  }
  return `${fieldName}:="${escapedValue}"`
}

function buildLogsQLTextFilter() {
  const value = lineFilterValue.value.trim()
  if (!value) {
    return ''
  }

  const escapedValue = escapeLogQLValue(value)
  const operator = normalizeTextOperator(lineFilterOperator.value)

  if (operator === 'not_contains') {
    return `NOT "${escapedValue}"`
  }
  if (operator === 'regex') {
    return `_msg:~"${escapedValue}"`
  }
  if (operator === 'not_regex') {
    return `NOT _msg:~"${escapedValue}"`
  }
  return `"${escapedValue}"`
}

const generatedQuery = computed(() => {
  if (isLogsQL.value) {
    const filters = labelFilters.value
      .filter(filter => filter.label && filter.value.trim())
      .map(buildLogsQLFieldFilter)

    const textFilter = buildLogsQLTextFilter()
    if (filters.length === 0 && !textFilter) {
      return '*'
    }

    const queryParts = ['*', ...filters]
    if (textFilter) {
      queryParts.push(textFilter)
    }

    return queryParts.join(' ')
  }

  const selectorFilters = labelFilters.value
    .filter(filter => filter.label && filter.value.trim())
    .map(filter => `${filter.label}${normalizeFieldOperator(filter.operator)}"${escapeLogQLValue(filter.value.trim())}"`)

  const hasLineFilter = lineFilterValue.value.trim().length > 0
  if (selectorFilters.length === 0 && !hasLineFilter) {
    return ''
  }

  const selector = selectorFilters.length > 0 ? `{${selectorFilters.join(',')}}` : '{}'
  if (!hasLineFilter) {
    return selector
  }

  return `${selector} ${normalizeTextOperator(lineFilterOperator.value)} "${escapeLogQLValue(lineFilterValue.value.trim())}"`
})

const builderAvailable = computed(() => {
  if (!codeQuery.value) return true
  if (mode.value === 'builder' && generatedQuery.value) return true
  if (codeQuery.value === generatedQuery.value) return true
  return false
})

const activeQuery = computed(() => {
  return mode.value === 'builder' ? generatedQuery.value : codeQuery.value
})

function addLabelFilter() {
  labelFilters.value.push({
    id: generateFilterId(),
    label: '',
    operator: fieldOperators.value[0].value,
    value: '',
  })
}

function removeLabelFilter(id: string) {
  labelFilters.value = labelFilters.value.filter(filter => filter.id !== id)
}

function updateLabelFilter(id: string, updates: Partial<LabelFilter>) {
  const filter = labelFilters.value.find(current => current.id === id)
  if (!filter) return
  Object.assign(filter, updates)
}

async function loadLabelValues(labelName: string) {
  if (!props.datasourceId || !labelName) return []

  if (labelValuesCache.value.has(labelName)) {
    return labelValuesCache.value.get(labelName) || []
  }

  loadingLabelValues.value = labelName
  try {
    const values = await fetchDataSourceLabelValues(props.datasourceId, labelName)
    labelValuesCache.value.set(labelName, values)
    return values
  } catch (error) {
    console.error(`Failed to load label values for ${labelName}:`, error)
    labelValuesCache.value.set(labelName, [])
    return []
  } finally {
    if (loadingLabelValues.value === labelName) {
      loadingLabelValues.value = null
    }
  }
}

async function handleLabelChange(filter: LabelFilter, newLabel: string) {
  updateLabelFilter(filter.id, { label: newLabel, value: '' })
  if (!newLabel) return
  await loadLabelValues(newLabel)
}

function getLabelValues(labelName: string) {
  return labelValuesCache.value.get(labelName) || []
}

function emitSubmit() {
  emit('submit')
}

watch(() => props.datasourceId, () => {
  labelValuesCache.value = new Map()
  loadingLabelValues.value = null
})

watch(() => props.queryLanguage, () => {
  lineFilterOperator.value = textOperators.value[0].value
  labelFilters.value = labelFilters.value.map(filter => ({
    ...filter,
    operator: normalizeFieldOperator(filter.operator),
  }))
})

watch(() => props.modelValue, (newValue) => {
  if (isEmitting.value) return
  if (newValue === activeQuery.value) return

  codeQuery.value = newValue
  if (newValue !== generatedQuery.value) {
    mode.value = 'code'
  }
})

watch(mode, (newMode, oldMode) => {
  if (newMode === 'code' && oldMode === 'builder' && generatedQuery.value) {
    codeQuery.value = generatedQuery.value
  }
})

watch(activeQuery, (newValue) => {
  isEmitting.value = true
  emit('update:modelValue', newValue)
  nextTick(() => {
    isEmitting.value = false
  })
})
</script>

<template>
  <div class="query-builder" :class="{ disabled: props.disabled }">
    <div class="mode-toggle">
      <button
        type="button"
        class="mode-btn"
        :class="{ active: mode === 'builder' }"
        :disabled="props.disabled || !builderAvailable"
        :title="!builderAvailable ? 'Query cannot be edited in builder mode' : ''"
        @click="mode = 'builder'"
      >
        <Layers :size="14" />
        <span>Builder</span>
      </button>
      <button
        type="button"
        class="mode-btn"
        :class="{ active: mode === 'code' }"
        :disabled="props.disabled"
        @click="mode = 'code'"
      >
        <Code :size="14" />
        <span>Code</span>
      </button>
    </div>

    <div v-if="mode === 'builder'" class="builder-mode">
      <div class="builder-section">
        <div class="section-header">
          <label class="section-label">Stream Filters</label>
          <button type="button" class="btn-add" :disabled="props.disabled" @click="addLabelFilter">
            <Plus :size="14" />
            <span>Add Filter</span>
          </button>
        </div>

        <div v-if="labelFilters.length === 0" class="empty-filters">
          No filters yet. Add a field filter to build your selector.
        </div>

        <div v-else class="filters-list">
          <div v-for="filter in labelFilters" :key="filter.id" class="filter-row">
            <select
              class="filter-select filter-label-select"
              :value="filter.label"
              :disabled="props.disabled"
              @change="handleLabelChange(filter, ($event.target as HTMLSelectElement).value)"
            >
              <option value="">Indexed field</option>
              <option v-for="label in props.indexedLabels" :key="label" :value="label">
                {{ label }}
              </option>
            </select>

            <select
              class="filter-select filter-operator-select"
              :value="filter.operator"
              :disabled="props.disabled"
              @change="updateLabelFilter(filter.id, { operator: ($event.target as HTMLSelectElement).value })"
            >
              <option v-for="operator in fieldOperators" :key="operator.value" :value="operator.value">
                {{ operator.label }}
              </option>
            </select>

            <select
              v-if="getLabelValues(filter.label).length > 0"
              class="filter-select filter-value-select"
              :value="filter.value"
              :disabled="props.disabled || loadingLabelValues === filter.label"
              @change="updateLabelFilter(filter.id, { value: ($event.target as HTMLSelectElement).value })"
            >
              <option value="">Field value</option>
              <option v-for="value in getLabelValues(filter.label)" :key="value" :value="value">
                {{ value }}
              </option>
            </select>
            <input
              v-else
              class="filter-input filter-value-input"
              type="text"
              placeholder="Field value"
              :value="filter.value"
              :disabled="props.disabled"
              @input="updateLabelFilter(filter.id, { value: ($event.target as HTMLInputElement).value })"
            />

            <button type="button" class="btn-remove" :disabled="props.disabled" @click="removeLabelFilter(filter.id)">
              <X :size="14" />
            </button>
          </div>

          <span v-if="loadingLabelValues" class="values-loading">Loading indexed values...</span>
        </div>
      </div>

      <div class="builder-section">
        <label class="section-label">{{ lineFilterLabel }}</label>
        <div class="line-filter-row">
          <select v-model="lineFilterOperator" class="filter-select line-operator-select" :disabled="props.disabled">
            <option v-for="operator in textOperators" :key="operator.value" :value="operator.value">
              {{ operator.label }}
            </option>
          </select>
          <input
            v-model="lineFilterValue"
            class="filter-input line-value-input"
            type="text"
            :placeholder="lineFilterPlaceholder"
            :disabled="props.disabled"
          />
        </div>
      </div>

      <div class="builder-section preview-section">
        <label class="section-label">{{ generatedQueryLabel }}</label>
        <div class="preview-box">
          <code v-if="generatedQuery">{{ generatedQuery }}</code>
          <span v-else class="preview-placeholder">Add a field/value filter to generate a query</span>
        </div>
      </div>
    </div>

    <div v-else class="code-mode">
      <label class="section-label">{{ codeEditorLabel }}</label>
      <MonacoQueryEditor
        v-model="codeQuery"
        :disabled="props.disabled"
        :height="props.editorHeight"
        :placeholder="props.placeholder"
        :language="props.queryLanguage"
        :indexed-labels="props.indexedLabels"
        @submit="emitSubmit"
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
  align-items: center;
  gap: 0.5rem;
}

.filter-select,
.filter-input {
  padding: 0.5rem 0.75rem;
  background: var(--color-bg-2);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-size: 0.8125rem;
  color: var(--color-text-0);
}

.filter-select {
  cursor: pointer;
}

.filter-label-select,
.filter-value-select,
.filter-value-input,
.line-value-input {
  flex: 1;
  min-width: 0;
}

.filter-operator-select,
.line-operator-select {
  width: 120px;
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
}

.btn-remove:hover:not(:disabled) {
  background: rgba(255, 107, 107, 0.1);
  color: var(--color-danger);
}

.values-loading {
  font-size: 0.75rem;
  color: var(--color-text-2);
}

.line-filter-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
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
</style>
