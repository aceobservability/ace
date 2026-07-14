import { Code, Layers, Plus, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchDataSourceLabelValues } from '@/api/datasources'
import { MonacoQueryEditor } from '@/components/MonacoQueryEditor'

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

type LabelFilter = {
  id: string
  label: string
  operator: string
  value: string
}

type LogQLQueryBuilderProps = {
  value: string
  onChange: (value: string) => void
  onSubmit?: () => void
  indexedLabels: string[]
  datasourceId: string
  queryLanguage?: QueryLanguage
  disabled?: boolean
  editorHeight?: number
  placeholder?: string
}

let filterIdCounter = 0

function generateFilterId() {
  filterIdCounter += 1
  return `logql-filter-${filterIdCounter}`
}

function quoteLogsQLField(value: string) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function escapeLogQLValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function normalizeFieldOperator(
  value: string,
  operators: readonly { value: string; label: string }[],
) {
  if (operators.some(operator => operator.value === value)) {
    return value
  }
  return operators[0].value
}

function normalizeTextOperator(
  value: string,
  operators: readonly { value: string; label: string }[],
) {
  if (operators.some(operator => operator.value === value)) {
    return value
  }
  return operators[0].value
}

function buildLogsQLFieldFilter(filter: LabelFilter) {
  const fieldName = quoteLogsQLField(filter.label)
  const escapedValue = escapeLogQLValue(filter.value.trim())
  const operator = filter.operator

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

function buildLogsQLTextFilter(lineFilterOperator: string, lineFilterValue: string) {
  const value = lineFilterValue.trim()
  if (!value) {
    return ''
  }

  const escapedValue = escapeLogQLValue(value)
  const operator = lineFilterOperator

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

function buildLogQLQuery(
  labelFilters: LabelFilter[],
  lineFilterOperator: string,
  lineFilterValue: string,
  fieldOperators: readonly { value: string; label: string }[],
  textOperators: readonly { value: string; label: string }[],
) {
  const selectorFilters = labelFilters
    .filter(filter => filter.label && filter.value.trim())
    .map(
      filter =>
        `${filter.label}${normalizeFieldOperator(filter.operator, fieldOperators)}"${escapeLogQLValue(filter.value.trim())}"`,
    )

  const hasLineFilter = lineFilterValue.trim().length > 0
  if (selectorFilters.length === 0 && !hasLineFilter) {
    return ''
  }

  const selector = selectorFilters.length > 0 ? `{${selectorFilters.join(',')}}` : '{}'
  if (!hasLineFilter) {
    return selector
  }

  return `${selector} ${normalizeTextOperator(lineFilterOperator, textOperators)} "${escapeLogQLValue(lineFilterValue.trim())}"`
}

function buildLogsSQLQuery(
  labelFilters: LabelFilter[],
  lineFilterOperator: string,
  lineFilterValue: string,
) {
  const filters = labelFilters
    .filter(filter => filter.label && filter.value.trim())
    .map(buildLogsQLFieldFilter)

  const textFilter = buildLogsQLTextFilter(lineFilterOperator, lineFilterValue)
  if (filters.length === 0 && !textFilter) {
    return '*'
  }

  const queryParts = ['*', ...filters]
  if (textFilter) {
    queryParts.push(textFilter)
  }

  return queryParts.join(' ')
}

export function LogQLQueryBuilder({
  value,
  onChange,
  onSubmit,
  indexedLabels,
  datasourceId,
  queryLanguage = 'logql',
  disabled = false,
  editorHeight = 130,
  placeholder = '{job=~".+"} |= "error"',
}: LogQLQueryBuilderProps) {
  const isLogsQL = queryLanguage === 'logsql'
  const fieldOperators = isLogsQL ? LOGSQL_FIELD_OPERATORS : LOGQL_LABEL_OPERATORS
  const textOperators = isLogsQL ? LOGSQL_TEXT_OPERATORS : LOGQL_LINE_FILTER_OPERATORS

  const [mode, setMode] = useState<'builder' | 'code'>('builder')
  const [codeQuery, setCodeQuery] = useState(value)
  const [labelFilters, setLabelFilters] = useState<LabelFilter[]>([])
  const [lineFilterOperator, setLineFilterOperator] = useState<string>(textOperators[0].value)
  const [lineFilterValue, setLineFilterValue] = useState('')
  const [labelValuesCache, setLabelValuesCache] = useState<Map<string, string[]>>(new Map())
  const [loadingLabelValues, setLoadingLabelValues] = useState<string | null>(null)
  const isEmittingRef = useRef(false)

  const generatedQuery = useMemo(() => {
    if (isLogsQL) {
      return buildLogsSQLQuery(labelFilters, lineFilterOperator, lineFilterValue)
    }
    return buildLogQLQuery(
      labelFilters,
      lineFilterOperator,
      lineFilterValue,
      fieldOperators,
      textOperators,
    )
  }, [fieldOperators, isLogsQL, labelFilters, lineFilterOperator, lineFilterValue, textOperators])

  const builderAvailable = useMemo(() => {
    if (!codeQuery) return true
    if (mode === 'builder' && generatedQuery) return true
    if (codeQuery === generatedQuery) return true
    return false
  }, [codeQuery, generatedQuery, mode])

  const activeQuery = mode === 'builder' ? generatedQuery : codeQuery

  const generatedQueryLabel = isLogsQL ? 'Generated LogsQL' : 'Generated LogQL'
  const codeEditorLabel = isLogsQL ? 'LogsQL Query' : 'LogQL Query'
  const lineFilterLabel = isLogsQL ? 'Message Filter (Optional)' : 'Line Filter (Optional)'
  const lineFilterPlaceholder = isLogsQL
    ? 'Phrase or regex for _msg field'
    : 'Contains text, regex, or exact match'

  const loadLabelValues = useCallback(async (labelName: string) => {
    if (!datasourceId || !labelName) return []

    let cached: string[] | undefined
    setLabelValuesCache(prev => {
      cached = prev.get(labelName)
      return prev
    })
    if (cached) {
      return cached
    }

    setLoadingLabelValues(labelName)
    try {
      const values = await fetchDataSourceLabelValues(datasourceId, labelName)
      setLabelValuesCache(prev => {
        const next = new Map(prev)
        next.set(labelName, values)
        return next
      })
      return values
    } catch (error) {
      console.error(`Failed to load label values for ${labelName}:`, error)
      setLabelValuesCache(prev => {
        const next = new Map(prev)
        next.set(labelName, [])
        return next
      })
      return []
    } finally {
      setLoadingLabelValues(current => (current === labelName ? null : current))
    }
  }, [datasourceId])

  function addLabelFilter() {
    setLabelFilters(prev => [
      ...prev,
      {
        id: generateFilterId(),
        label: '',
        operator: fieldOperators[0].value,
        value: '',
      },
    ])
  }

  function removeLabelFilter(id: string) {
    setLabelFilters(prev => prev.filter(filter => filter.id !== id))
  }

  function updateLabelFilter(id: string, updates: Partial<LabelFilter>) {
    setLabelFilters(prev =>
      prev.map(filter => (filter.id === id ? { ...filter, ...updates } : filter)),
    )
  }

  async function handleLabelChange(filter: LabelFilter, newLabel: string) {
    updateLabelFilter(filter.id, { label: newLabel, value: '' })
    if (!newLabel) return
    await loadLabelValues(newLabel)
  }

  function getLabelValues(labelName: string) {
    return labelValuesCache.get(labelName) || []
  }

  useEffect(() => {
    setLabelValuesCache(new Map())
    setLoadingLabelValues(null)
  }, [datasourceId])

  useEffect(() => {
    setLineFilterOperator(textOperators[0].value)
    setLabelFilters(prev =>
      prev.map(filter => ({
        ...filter,
        operator: normalizeFieldOperator(filter.operator, fieldOperators),
      })),
    )
  }, [fieldOperators, textOperators])

  useEffect(() => {
    if (isEmittingRef.current) return
    if (value === activeQuery) return

    setCodeQuery(value)
    if (value !== generatedQuery) {
      setMode('code')
    }
  }, [value, activeQuery, generatedQuery])

  useEffect(() => {
    isEmittingRef.current = true
    onChange(activeQuery)
    queueMicrotask(() => {
      isEmittingRef.current = false
    })
  }, [activeQuery, onChange])

  return (
    <div
      className={`flex flex-col gap-4 ${disabled ? 'pointer-events-none opacity-60' : ''}`}
      data-testid="logql-query-builder"
    >
      <div className="flex w-fit rounded-sm bg-[var(--color-surface-container-high)] p-1">
        <button
          type="button"
          className={`flex items-center gap-1.5 rounded-sm border-none bg-transparent px-3 py-1.5 text-xs font-medium text-[var(--color-on-surface-variant)] transition-all duration-200 hover:enabled:text-[var(--color-on-surface)] disabled:cursor-not-allowed disabled:opacity-40 ${
            mode === 'builder'
              ? 'bg-[var(--color-surface-container-low)] text-[var(--color-on-surface)] shadow-sm'
              : ''
          }`}
          data-testid="logql-builder-mode-btn"
          disabled={disabled || !builderAvailable}
          title={!builderAvailable ? 'Query cannot be edited in builder mode' : ''}
          onClick={() => setMode('builder')}
        >
          <Layers size={14} />
          <span>Builder</span>
        </button>
        <button
          type="button"
          className={`flex items-center gap-1.5 rounded-sm border-none bg-transparent px-3 py-1.5 text-xs font-medium text-[var(--color-on-surface-variant)] transition-all duration-200 hover:enabled:text-[var(--color-on-surface)] disabled:cursor-not-allowed disabled:opacity-40 ${
            mode === 'code'
              ? 'bg-[var(--color-surface-container-low)] text-[var(--color-on-surface)] shadow-sm'
              : ''
          }`}
          data-testid="logql-code-mode-btn"
          disabled={disabled}
          onClick={() => setMode('code')}
        >
          <Code size={14} />
          <span>Code</span>
        </button>
      </div>

      {mode === 'builder' ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-[var(--color-on-surface)]">
                Stream Filters
              </label>
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium text-[var(--color-on-surface-variant)] transition-all duration-200 hover:enabled:bg-[var(--color-surface-container-high)] hover:enabled:text-[var(--color-on-surface)]"
                data-testid="logql-add-filter-btn"
                disabled={disabled}
                onClick={addLabelFilter}
              >
                <Plus size={14} />
                <span>Add Filter</span>
              </button>
            </div>

            {labelFilters.length === 0 ? (
              <div className="rounded-sm bg-[var(--color-surface-container-high)] p-4 text-center text-sm text-[var(--color-outline)]">
                No filters yet. Add a field filter to build your selector.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {labelFilters.map(filter => (
                  <div key={filter.id} className="flex items-center gap-2">
                    <select
                      className="min-w-0 flex-1 cursor-pointer rounded-sm bg-[var(--color-surface-container-high)] px-3 py-2 text-sm text-[var(--color-on-surface)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20"
                      value={filter.label}
                      disabled={disabled}
                      onChange={event => void handleLabelChange(filter, event.target.value)}
                    >
                      <option value="">Indexed field</option>
                      {indexedLabels.map(label => (
                        <option key={label} value={label}>
                          {label}
                        </option>
                      ))}
                    </select>

                    <select
                      className="w-[120px] flex-none cursor-pointer rounded-sm bg-[var(--color-surface-container-high)] px-3 py-2 font-mono text-sm text-[var(--color-on-surface-variant)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20"
                      value={filter.operator}
                      disabled={disabled}
                      onChange={event =>
                        updateLabelFilter(filter.id, { operator: event.target.value })
                      }
                    >
                      {fieldOperators.map(operator => (
                        <option key={operator.value} value={operator.value}>
                          {operator.label}
                        </option>
                      ))}
                    </select>

                    {getLabelValues(filter.label).length > 0 ? (
                      <select
                        className="min-w-0 flex-1 cursor-pointer rounded-sm bg-[var(--color-surface-container-high)] px-3 py-2 text-sm text-[var(--color-on-surface)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20"
                        value={filter.value}
                        disabled={disabled || loadingLabelValues === filter.label}
                        onChange={event =>
                          updateLabelFilter(filter.id, { value: event.target.value })
                        }
                      >
                        <option value="">Field value</option>
                        {getLabelValues(filter.label).map(labelValue => (
                          <option key={labelValue} value={labelValue}>
                            {labelValue}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="min-w-0 flex-1 rounded-sm bg-[var(--color-surface-container-high)] px-3 py-2 text-sm text-[var(--color-on-surface)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20"
                        type="text"
                        placeholder="Field value"
                        value={filter.value}
                        disabled={disabled}
                        onChange={event =>
                          updateLabelFilter(filter.id, { value: event.target.value })
                        }
                      />
                    )}

                    <button
                      type="button"
                      className="flex h-7 w-7 items-center justify-center rounded border-none bg-transparent text-[var(--color-outline)] transition-all duration-200 hover:enabled:bg-[var(--color-error)]/10 hover:enabled:text-[var(--color-error)]"
                      disabled={disabled}
                      onClick={() => removeLabelFilter(filter.id)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}

                {loadingLabelValues ? (
                  <span className="text-xs text-[var(--color-outline)]">
                    Loading indexed values...
                  </span>
                ) : null}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-[var(--color-on-surface)]">
              {lineFilterLabel}
            </label>
            <div className="flex items-center gap-2">
              <select
                data-testid="logql-line-filter-operator-select"
                className="w-[120px] flex-none cursor-pointer rounded-sm bg-[var(--color-surface-container-high)] px-3 py-2 font-mono text-sm text-[var(--color-on-surface-variant)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20"
                value={lineFilterOperator}
                disabled={disabled}
                onChange={event => setLineFilterOperator(event.target.value)}
              >
                {textOperators.map(operator => (
                  <option key={operator.value} value={operator.value}>
                    {operator.label}
                  </option>
                ))}
              </select>
              <input
                data-testid="logql-line-filter-value-input"
                className="min-w-0 flex-1 rounded-sm bg-[var(--color-surface-container-high)] px-3 py-2 text-sm text-[var(--color-on-surface)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20"
                type="text"
                placeholder={lineFilterPlaceholder}
                value={lineFilterValue}
                disabled={disabled}
                onChange={event => setLineFilterValue(event.target.value)}
              />
            </div>
          </div>

          <div className="mt-2 flex flex-col gap-2 pt-4">
            <label className="text-sm font-medium text-[var(--color-on-surface)]">
              {generatedQueryLabel}
            </label>
            <div className="min-h-[48px] rounded-sm bg-[var(--color-surface-container-high)] px-4 py-3">
              {generatedQuery ? (
                <code className="break-all font-mono text-sm text-[var(--color-primary)]">
                  {generatedQuery}
                </code>
              ) : (
                <span className="text-sm text-[var(--color-outline)]">
                  Add a field/value filter to generate a query
                </span>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <label className="text-sm font-medium text-[var(--color-on-surface)]">
            {codeEditorLabel}
          </label>
          <MonacoQueryEditor
            value={codeQuery}
            onChange={setCodeQuery}
            onSubmit={onSubmit}
            disabled={disabled}
            height={editorHeight}
            placeholder={placeholder}
            language={queryLanguage}
          />
        </div>
      )}
    </div>
  )
}