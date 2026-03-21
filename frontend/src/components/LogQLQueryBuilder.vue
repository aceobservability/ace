<script setup lang="ts">
import { Code, Layers, Plus, X } from 'lucide-vue-next'
import { computed, nextTick, ref, watch } from 'vue'
import { fetchDataSourceLabelValues } from '../api/datasources'
import MonacoQueryEditor from './MonacoQueryEditor.vue'

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

const props = withDefaults(
  defineProps<{
    modelValue: string
    indexedLabels: string[]
    datasourceId: string
    queryLanguage?: QueryLanguage
    disabled?: boolean
    editorHeight?: number
    placeholder?: string
  }>(),
  {
    queryLanguage: 'logql',
    disabled: false,
    editorHeight: 130,
    placeholder: '{job=~".+"} |= "error"',
  },
)

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

const generatedQueryLabel = computed(() =>
  isLogsQL.value ? 'Generated LogsQL' : 'Generated LogQL',
)
const codeEditorLabel = computed(() => (isLogsQL.value ? 'LogsQL Query' : 'LogQL Query'))
const lineFilterLabel = computed(() =>
  isLogsQL.value ? 'Message Filter (Optional)' : 'Line Filter (Optional)',
)
const lineFilterPlaceholder = computed(() => {
  return isLogsQL.value ? 'Phrase or regex for _msg field' : 'Contains text, regex, or exact match'
})

function normalizeFieldOperator(value: string) {
  if (fieldOperators.value.some((operator) => operator.value === value)) {
    return value
  }
  return fieldOperators.value[0].value
}

function normalizeTextOperator(value: string) {
  if (textOperators.value.some((operator) => operator.value === value)) {
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
      .filter((filter) => filter.label && filter.value.trim())
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
    .filter((filter) => filter.label && filter.value.trim())
    .map(
      (filter) =>
        `${filter.label}${normalizeFieldOperator(filter.operator)}"${escapeLogQLValue(filter.value.trim())}"`,
    )

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
  labelFilters.value = labelFilters.value.filter((filter) => filter.id !== id)
}

function updateLabelFilter(id: string, updates: Partial<LabelFilter>) {
  const filter = labelFilters.value.find((current) => current.id === id)
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

watch(
  () => props.datasourceId,
  () => {
    labelValuesCache.value = new Map()
    loadingLabelValues.value = null
  },
)

watch(
  () => props.queryLanguage,
  () => {
    lineFilterOperator.value = textOperators.value[0].value
    labelFilters.value = labelFilters.value.map((filter) => ({
      ...filter,
      operator: normalizeFieldOperator(filter.operator),
    }))
  },
)

watch(
  () => props.modelValue,
  (newValue) => {
    if (isEmitting.value) return
    if (newValue === activeQuery.value) return

    codeQuery.value = newValue
    if (newValue !== generatedQuery.value) {
      mode.value = 'code'
    }
  },
)

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
  <div class="flex flex-col gap-4" :class="{ 'opacity-60 pointer-events-none': props.disabled }">
    <div class="flex rounded-sm bg-surface-overlay p-1 w-fit">
      <button
        type="button"
        class="flex items-center gap-1.5 px-3 py-1.5 bg-transparent border-none rounded-sm text-xs font-medium text-text-secondary cursor-pointer transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:text-text-primary"
        :class="{ 'bg-surface-raised text-text-primary shadow-sm': mode === 'builder' }"
        data-testid="logql-builder-mode-btn"
        :disabled="props.disabled || !builderAvailable"
        :title="!builderAvailable ? 'Query cannot be edited in builder mode' : ''"
        @click="mode = 'builder'"
      >
        <Layers :size="14" />
        <span>Builder</span>
      </button>
      <button
        type="button"
        class="flex items-center gap-1.5 px-3 py-1.5 bg-transparent border-none rounded-sm text-xs font-medium text-text-secondary cursor-pointer transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:text-text-primary"
        :class="{ 'bg-surface-raised text-text-primary shadow-sm': mode === 'code' }"
        data-testid="logql-code-mode-btn"
        :disabled="props.disabled"
        @click="mode = 'code'"
      >
        <Code :size="14" />
        <span>Code</span>
      </button>
    </div>

    <div v-if="mode === 'builder'" class="flex flex-col gap-4">
      <div class="flex flex-col gap-2">
        <div class="flex justify-between items-center">
          <label class="text-sm font-medium text-text-primary">Stream Filters</label>
          <button
            type="button"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-border text-xs font-medium text-text-secondary cursor-pointer transition-all duration-200 hover:enabled:bg-surface-overlay hover:enabled:text-text-primary"
            data-testid="logql-add-filter-btn"
            :disabled="props.disabled"
            @click="addLabelFilter"
          >
            <Plus :size="14" />
            <span>Add Filter</span>
          </button>
        </div>

        <div v-if="labelFilters.length === 0" class="p-4 text-center text-text-muted text-sm bg-surface-overlay rounded-sm">
          No filters yet. Add a field filter to build your selector.
        </div>

        <div v-else class="flex flex-col gap-2">
          <div v-for="filter in labelFilters" :key="filter.id" class="flex items-center gap-2">
            <select
              class="flex-1 min-w-0 rounded-sm border border-border bg-surface-overlay px-3 py-2 text-sm text-text-primary cursor-pointer focus:outline-none focus:border-accent"
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
              class="w-[120px] flex-none rounded-sm border border-border bg-surface-overlay px-3 py-2 text-sm font-mono text-text-secondary cursor-pointer focus:outline-none focus:border-accent"
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
              class="flex-1 min-w-0 rounded-sm border border-border bg-surface-overlay px-3 py-2 text-sm text-text-primary cursor-pointer focus:outline-none focus:border-accent"
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
              class="flex-1 min-w-0 rounded-sm border border-border bg-surface-overlay px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
              type="text"
              placeholder="Field value"
              :value="filter.value"
              :disabled="props.disabled"
              @input="updateLabelFilter(filter.id, { value: ($event.target as HTMLInputElement).value })"
            />

            <button
              type="button"
              class="flex items-center justify-center w-7 h-7 bg-transparent border-none rounded text-text-muted cursor-pointer transition-all duration-200 hover:enabled:bg-red-50 hover:enabled:text-red-500"
              :disabled="props.disabled"
              @click="removeLabelFilter(filter.id)"
            >
              <X :size="14" />
            </button>
          </div>

          <span v-if="loadingLabelValues" class="text-xs text-text-muted">Loading indexed values...</span>
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <label class="text-sm font-medium text-text-primary">{{ lineFilterLabel }}</label>
        <div class="flex items-center gap-2">
          <select
            v-model="lineFilterOperator"
            data-testid="logql-line-filter-operator-select"
            class="w-[120px] flex-none rounded-sm border border-border bg-surface-overlay px-3 py-2 text-sm font-mono text-text-secondary cursor-pointer focus:outline-none focus:border-accent"
            :disabled="props.disabled"
          >
            <option v-for="operator in textOperators" :key="operator.value" :value="operator.value">
              {{ operator.label }}
            </option>
          </select>
          <input
            v-model="lineFilterValue"
            data-testid="logql-line-filter-value-input"
            class="flex-1 min-w-0 rounded-sm border border-border bg-surface-overlay px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
            type="text"
            :placeholder="lineFilterPlaceholder"
            :disabled="props.disabled"
          />
        </div>
      </div>

      <div class="flex flex-col gap-2 mt-2 pt-4 border-t border-border">
        <label class="text-sm font-medium text-text-primary">{{ generatedQueryLabel }}</label>
        <div class="rounded-sm border border-border bg-surface-overlay px-4 py-3 min-h-[48px]">
          <code v-if="generatedQuery" class="font-mono text-sm text-accent break-all">{{ generatedQuery }}</code>
          <span v-else class="text-text-muted text-sm">Add a field/value filter to generate a query</span>
        </div>
      </div>
    </div>

    <div v-else class="flex flex-col gap-4">
      <label class="text-sm font-medium text-text-primary">{{ codeEditorLabel }}</label>
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
