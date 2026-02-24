import { ref, computed, watch } from 'vue'
import { fetchMetrics, fetchLabels, fetchLabelValues } from './useProm'
import { trackEvent } from '../analytics'

// Supported aggregation functions
export const AGGREGATION_FUNCTIONS = [
  { value: '', label: 'None' },
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Average' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
  { value: 'count', label: 'Count' },
  { value: 'rate', label: 'Rate', requiresRange: true },
  { value: 'irate', label: 'Instant Rate', requiresRange: true },
  { value: 'increase', label: 'Increase', requiresRange: true },
  { value: 'idelta', label: 'Instant Delta', requiresRange: true },
  { value: 'stddev', label: 'Std Dev' },
  { value: 'stdvar', label: 'Std Variance' },
  { value: 'topk', label: 'Top K', requiresK: true },
  { value: 'bottomk', label: 'Bottom K', requiresK: true }
] as const

// Label filter operators
export const LABEL_OPERATORS = [
  { value: '=', label: '=' },
  { value: '!=', label: '!=' },
  { value: '=~', label: '=~' },
  { value: '!~', label: '!~' }
] as const

type AggregationFunction = typeof AGGREGATION_FUNCTIONS[number]['value']
export type LabelOperator = typeof LABEL_OPERATORS[number]['value']

export interface LabelFilter {
  id: string
  label: string
  operator: LabelOperator
  value: string
}

interface QueryBuilderState {
  metric: string
  labelFilters: LabelFilter[]
  aggregation: AggregationFunction
  groupByLabels: string[]
  rangeInterval: string // e.g., '5m', '1h'
  kValue: number // for topk/bottomk
}

let filterIdCounter = 0
function generateFilterId(): string {
  return `filter-${++filterIdCounter}`
}

export function useQueryBuilder(initialQuery = '') {
  // State
  const mode = ref<'builder' | 'code'>('builder')
  const codeQuery = ref(initialQuery)

  // Builder state
  const metric = ref('')
  const labelFilters = ref<LabelFilter[]>([])
  const aggregation = ref<AggregationFunction>('')
  const groupByLabels = ref<string[]>([])
  const rangeInterval = ref('5m')
  const kValue = ref(10)

  // Cached metadata
  const metricsCache = ref<string[]>([])
  const labelsCache = ref<string[]>([])
  const labelValuesCache = ref<Map<string, string[]>>(new Map())
  const loadingMetrics = ref(false)
  const loadingLabels = ref(false)
  const loadingLabelValues = ref<string | null>(null)

  // Generate PromQL from builder state
  const generatedQuery = computed(() => {
    if (!metric.value) return ''

    let query = metric.value

    // Add label filters
    if (labelFilters.value.length > 0) {
      const filters = labelFilters.value
        .filter(f => f.label && f.value)
        .map(f => `${f.label}${f.operator}"${f.value}"`)
        .join(',')

      if (filters) {
        query = `${query}{${filters}}`
      }
    }

    // Wrap with rate/increase/irate/idelta functions (needs range)
    const aggFunc = AGGREGATION_FUNCTIONS.find(a => a.value === aggregation.value)
    if (aggFunc && 'requiresRange' in aggFunc && aggFunc.requiresRange) {
      query = `${aggregation.value}(${query}[${rangeInterval.value}])`
    }

    // Wrap with aggregation function
    if (aggregation.value && !('requiresRange' in (aggFunc || {}))) {
      if ('requiresK' in (aggFunc || {}) && (aggFunc as { requiresK?: boolean })?.requiresK) {
        // topk/bottomk
        const byClause = groupByLabels.value.length > 0
          ? ` by (${groupByLabels.value.join(', ')})`
          : ''
        query = `${aggregation.value}(${kValue.value}, ${query})${byClause}`
      } else if (aggFunc) {
        // Normal aggregation
        const byClause = groupByLabels.value.length > 0
          ? ` by (${groupByLabels.value.join(', ')})`
          : ''
        query = `${aggregation.value}(${query})${byClause}`
      }
    } else if (aggFunc && 'requiresRange' in aggFunc && aggFunc.requiresRange && groupByLabels.value.length > 0) {
      // For rate/increase functions with group by, wrap with sum
      query = `sum(${query}) by (${groupByLabels.value.join(', ')})`
    }

    return query
  })

  // The current active query (depends on mode)
  const activeQuery = computed(() => {
    return mode.value === 'builder' ? generatedQuery.value : codeQuery.value
  })

  // Load metrics from API
  async function loadMetrics() {
    if (metricsCache.value.length > 0) return metricsCache.value

    loadingMetrics.value = true
    try {
      metricsCache.value = await fetchMetrics()
      trackEvent('query_builder_metrics_loaded', {
        metric_count: metricsCache.value.length,
      })
      return metricsCache.value
    } catch (error) {
      console.error('Failed to load metrics:', error)
      return []
    } finally {
      loadingMetrics.value = false
    }
  }

  // Load labels from API
  async function loadLabels() {
    if (labelsCache.value.length > 0) return labelsCache.value

    loadingLabels.value = true
    try {
      labelsCache.value = await fetchLabels()
      trackEvent('query_builder_labels_loaded', {
        label_count: labelsCache.value.length,
      })
      return labelsCache.value
    } catch (error) {
      console.error('Failed to load labels:', error)
      return []
    } finally {
      loadingLabels.value = false
    }
  }

  // Load label values for a specific label
  async function loadLabelValues(labelName: string) {
    if (labelValuesCache.value.has(labelName)) {
      return labelValuesCache.value.get(labelName) || []
    }

    loadingLabelValues.value = labelName
    try {
      const values = await fetchLabelValues(labelName)
      labelValuesCache.value.set(labelName, values)
      trackEvent('query_builder_label_values_loaded', {
        label: labelName,
        value_count: values.length,
      })
      return values
    } catch (error) {
      console.error(`Failed to load values for label ${labelName}:`, error)
      return []
    } finally {
      loadingLabelValues.value = null
    }
  }

  // Add a new label filter
  function addLabelFilter() {
    labelFilters.value.push({
      id: generateFilterId(),
      label: '',
      operator: '=',
      value: ''
    })
    trackEvent('query_builder_filter_added', {
      filter_count: labelFilters.value.length,
    })
  }

  // Remove a label filter
  function removeLabelFilter(id: string) {
    labelFilters.value = labelFilters.value.filter(f => f.id !== id)
    trackEvent('query_builder_filter_removed', {
      filter_count: labelFilters.value.length,
    })
  }

  // Update a label filter
  function updateLabelFilter(id: string, updates: Partial<LabelFilter>) {
    const filter = labelFilters.value.find(f => f.id === id)
    if (filter) {
      Object.assign(filter, updates)
    }
  }

  // Toggle group by label
  function toggleGroupByLabel(label: string) {
    const index = groupByLabels.value.indexOf(label)
    if (index === -1) {
      groupByLabels.value.push(label)
    } else {
      groupByLabels.value.splice(index, 1)
    }

    trackEvent('query_builder_group_by_toggled', {
      label,
      group_by_count: groupByLabels.value.length,
    })
  }

  // Set query from external source (e.g., loading saved panel)
  function setQuery(query: string) {
    codeQuery.value = query
    // Note: parsing PromQL back to builder state would be complex,
    // so we just switch to code mode when setting a query externally
    if (query) {
      mode.value = 'code'
    }
  }

  // Reset builder state
  function reset() {
    metric.value = ''
    labelFilters.value = []
    aggregation.value = ''
    groupByLabels.value = []
    rangeInterval.value = '5m'
    kValue.value = 10
    codeQuery.value = ''
    mode.value = 'builder'
  }

  // Sync code mode with generated query when switching
  watch(mode, (newMode, oldMode) => {
    if (newMode === 'code' && oldMode === 'builder') {
      // Switching to code mode: copy generated query to code editor
      if (generatedQuery.value) {
        codeQuery.value = generatedQuery.value
      }
    }

    if (newMode !== oldMode) {
      trackEvent('query_builder_mode_changed', {
        mode: newMode,
      })
    }
  })

  return {
    // State
    mode,
    metric,
    labelFilters,
    aggregation,
    groupByLabels,
    rangeInterval,
    kValue,
    codeQuery,

    // Computed
    generatedQuery,
    activeQuery,

    // Cache state
    metricsCache,
    labelsCache,
    labelValuesCache,
    loadingMetrics,
    loadingLabels,
    loadingLabelValues,

    // Methods
    loadMetrics,
    loadLabels,
    loadLabelValues,
    addLabelFilter,
    removeLabelFilter,
    updateLabelFilter,
    toggleGroupByLabel,
    setQuery,
    reset
  }
}
