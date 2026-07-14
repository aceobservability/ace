import { ChevronDown, ChevronUp, Code, Layers, Plus, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { MonacoQueryEditor } from '@/components/MonacoQueryEditor'
import {
  AGGREGATION_FUNCTIONS,
  LABEL_OPERATORS,
  type LabelFilter,
  useQueryBuilder,
} from '@/hooks/useQueryBuilder'

const MAX_LABEL_VALUES = 500

type QueryBuilderProps = {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  datasourceId?: string
}

export function QueryBuilder({
  value,
  onChange,
  disabled = false,
  datasourceId = '',
}: QueryBuilderProps) {
  const {
    mode,
    setMode,
    metric,
    setMetric,
    labelFilters,
    aggregation,
    setAggregation,
    groupByLabels,
    rangeInterval,
    setRangeInterval,
    kValue,
    setKValue,
    codeQuery,
    setCodeQuery,
    generatedQuery,
    activeQuery,
    metricsCache,
    labelsCache,
    labelValuesCache,
    loadingMetrics,
    loadingLabelValues,
    setDatasourceId,
    loadMetrics,
    loadLabels,
    loadLabelValues,
    addLabelFilter,
    removeLabelFilter,
    updateLabelFilter,
    toggleGroupByLabel,
    setQuery,
  } = useQueryBuilder(value, datasourceId)

  const isEmittingRef = useRef(false)
  const [metricSearch, setMetricSearch] = useState('')
  const [showMetricDropdown, setShowMetricDropdown] = useState(false)
  const [showGroupBy, setShowGroupBy] = useState(false)

  const filteredMetrics = useMemo(() => {
    if (!metricSearch) return metricsCache.slice(0, 100)
    const search = metricSearch.toLowerCase()
    return metricsCache.filter(m => m.toLowerCase().includes(search)).slice(0, 100)
  }, [metricSearch, metricsCache])

  const availableLabelsForGroupBy = useMemo(
    () => labelsCache.filter(label => label !== '__name__'),
    [labelsCache],
  )

  const aggregationRequiresRange = useMemo(() => {
    const func = AGGREGATION_FUNCTIONS.find(f => f.value === aggregation)
    return Boolean(func && 'requiresRange' in func && func.requiresRange)
  }, [aggregation])

  const aggregationRequiresK = useMemo(() => {
    const func = AGGREGATION_FUNCTIONS.find(f => f.value === aggregation)
    return Boolean(func && 'requiresK' in func && func.requiresK)
  }, [aggregation])

  const builderAvailable = useMemo(() => {
    if (!codeQuery) return true
    if (mode === 'builder' && generatedQuery) return true
    if (codeQuery === generatedQuery) return true
    if (codeQuery && !metric) return false
    return true
  }, [codeQuery, generatedQuery, metric, mode])

  useEffect(() => {
    if (datasourceId) {
      setDatasourceId(datasourceId)
      void Promise.all([loadMetrics(), loadLabels()])
    }
  }, [datasourceId, loadLabels, loadMetrics, setDatasourceId])

  useEffect(() => {
    if (isEmittingRef.current) return
    if (value !== activeQuery) {
      setQuery(value)
    }
  }, [value, activeQuery, setQuery])

  useEffect(() => {
    isEmittingRef.current = true
    onChange(activeQuery)
    const timer = window.setTimeout(() => {
      isEmittingRef.current = false
    }, 0)
    return () => clearTimeout(timer)
  }, [activeQuery, onChange])

  function selectMetric(nextMetric: string) {
    setMetric(nextMetric)
    setMetricSearch('')
    setShowMetricDropdown(false)
  }

  function hideMetricDropdownDelayed() {
    window.setTimeout(() => setShowMetricDropdown(false), 200)
  }

  async function handleLabelChange(filter: LabelFilter, newLabel: string) {
    updateLabelFilter(filter.id, { label: newLabel, value: '' })
    if (newLabel) {
      await loadLabelValues(newLabel)
    }
  }

  function getLabelValues(labelName: string): string[] {
    const values = labelValuesCache.get(labelName) || []
    return values.slice(0, MAX_LABEL_VALUES)
  }

  return (
    <div
      className={`flex flex-col gap-4 ${disabled ? 'pointer-events-none opacity-60' : ''}`}
      data-testid="query-builder"
    >
      <div className="flex w-fit rounded-sm bg-[var(--color-surface-container-high)] p-1">
        <button
          type="button"
          className={`flex items-center gap-1.5 rounded-sm border-none bg-transparent px-3 py-1.5 text-xs font-medium text-[var(--color-on-surface-variant)] transition-all duration-200 hover:enabled:text-[var(--color-on-surface)] disabled:cursor-not-allowed disabled:opacity-40 ${mode === 'builder' ? 'bg-[var(--color-surface-container-low)] text-[var(--color-on-surface)] shadow-sm' : ''}`}
          data-testid="query-builder-mode-btn"
          onClick={() => setMode('builder')}
          disabled={disabled || !builderAvailable}
          title={!builderAvailable ? 'Query cannot be edited in builder mode' : ''}
        >
          <Layers size={14} />
          <span>Builder</span>
        </button>
        <button
          type="button"
          className={`flex items-center gap-1.5 rounded-sm border-none bg-transparent px-3 py-1.5 text-xs font-medium text-[var(--color-on-surface-variant)] transition-all duration-200 hover:enabled:text-[var(--color-on-surface)] disabled:cursor-not-allowed disabled:opacity-40 ${mode === 'code' ? 'bg-[var(--color-surface-container-low)] text-[var(--color-on-surface)] shadow-sm' : ''}`}
          data-testid="query-code-mode-btn"
          onClick={() => setMode('code')}
          disabled={disabled}
        >
          <Code size={14} />
          <span>Code</span>
        </button>
      </div>

      {mode === 'builder' ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-[var(--color-on-surface)]">Metric</label>
            <div className="relative">
              <div className="relative flex items-center">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-3 text-[var(--color-outline)]"
                />
                <input
                  value={metricSearch}
                  onChange={event => setMetricSearch(event.target.value)}
                  type="text"
                  data-testid="query-metric-search-input"
                  className="w-full rounded-sm bg-[var(--color-surface-container-high)] px-3 py-2 pl-9 text-sm text-[var(--color-on-surface)] transition-colors duration-200 focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:outline-none"
                  placeholder="Search metrics..."
                  disabled={disabled || loadingMetrics}
                  onFocus={() => setShowMetricDropdown(true)}
                  onBlur={hideMetricDropdownDelayed}
                />
                {metric ? (
                  <span className="absolute right-3 rounded bg-[var(--color-primary)] px-2 py-0.5 font-mono text-xs text-white">
                    {metric}
                  </span>
                ) : null}
              </div>

              {showMetricDropdown && filteredMetrics.length > 0 ? (
                <div className="absolute top-[calc(100%+4px)] right-0 left-0 z-[100] max-h-[250px] overflow-y-auto rounded-sm bg-[var(--color-surface-container-low)] shadow-lg">
                  {filteredMetrics.map(m => (
                    <div
                      key={m}
                      className={`cursor-pointer px-3 py-2 font-mono text-sm text-[var(--color-on-surface)] transition-colors duration-150 hover:bg-[var(--color-surface-container-high)] ${m === metric ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]' : ''}`}
                      onMouseDown={event => {
                        event.preventDefault()
                        selectMetric(m)
                      }}
                    >
                      {m}
                    </div>
                  ))}
                  {loadingMetrics ? (
                    <div className="py-3 text-center text-sm text-[var(--color-outline)]">
                      Loading...
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-[var(--color-on-surface)]">
                Label Filters
              </label>
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium text-[var(--color-on-surface-variant)] transition-all duration-200 hover:enabled:bg-[var(--color-surface-container-high)] hover:enabled:text-[var(--color-on-surface)]"
                data-testid="query-add-filter-btn"
                onClick={addLabelFilter}
                disabled={disabled}
              >
                <Plus size={14} />
                <span>Add Filter</span>
              </button>
            </div>

            {labelFilters.length === 0 ? (
              <div className="rounded-sm bg-[var(--color-surface-container-high)] p-4 text-center text-sm text-[var(--color-outline)]">
                No label filters. Click &quot;Add Filter&quot; to filter by labels.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {labelFilters.map(filter => (
                  <div key={filter.id} className="flex items-center gap-2">
                    <select
                      value={filter.label}
                      onChange={event => handleLabelChange(filter, event.target.value)}
                      className="min-w-0 flex-1 cursor-pointer rounded-sm bg-[var(--color-surface-container-high)] px-3 py-2 text-sm text-[var(--color-on-surface)] focus:ring-1 focus:ring-[var(--color-primary)]/20 focus:outline-none"
                      disabled={disabled}
                    >
                      <option value="">Select label</option>
                      {labelsCache.map(label => (
                        <option key={label} value={label}>
                          {label}
                        </option>
                      ))}
                    </select>

                    <select
                      value={filter.operator}
                      onChange={event =>
                        updateLabelFilter(filter.id, {
                          operator: event.target.value as LabelFilter['operator'],
                        })
                      }
                      className="w-[70px] flex-none cursor-pointer rounded-sm bg-[var(--color-surface-container-high)] px-3 py-2 font-mono text-sm text-[var(--color-on-surface-variant)] focus:ring-1 focus:ring-[var(--color-primary)]/20 focus:outline-none"
                      disabled={disabled}
                    >
                      {LABEL_OPERATORS.map(op => (
                        <option key={op.value} value={op.value}>
                          {op.label}
                        </option>
                      ))}
                    </select>

                    {getLabelValues(filter.label).length > 0 ? (
                      <select
                        value={filter.value}
                        onChange={event =>
                          updateLabelFilter(filter.id, { value: event.target.value })
                        }
                        className="min-w-0 flex-[1.5] cursor-pointer rounded-sm bg-[var(--color-surface-container-high)] px-3 py-2 text-sm text-[var(--color-on-surface)] focus:ring-1 focus:ring-[var(--color-primary)]/20 focus:outline-none"
                        disabled={disabled || loadingLabelValues === filter.label}
                      >
                        <option value="">Select value</option>
                        {getLabelValues(filter.label).map(v => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={filter.value}
                        onChange={event =>
                          updateLabelFilter(filter.id, { value: event.target.value })
                        }
                        className="min-w-0 flex-[1.5] rounded-sm bg-[var(--color-surface-container-high)] px-3 py-2 text-sm text-[var(--color-on-surface)] focus:ring-1 focus:ring-[var(--color-primary)]/20 focus:outline-none"
                        placeholder="Value"
                        disabled={disabled}
                      />
                    )}

                    <button
                      type="button"
                      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded border-none bg-transparent text-[var(--color-outline)] transition-all duration-200 hover:enabled:bg-[var(--color-error)]/10 hover:enabled:text-[var(--color-error)]"
                      onClick={() => removeLabelFilter(filter.id)}
                      disabled={disabled}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-[var(--color-on-surface)]">
              Aggregation
            </label>
            <div className="flex items-center gap-4">
              <select
                value={aggregation}
                onChange={event => setAggregation(event.target.value as typeof aggregation)}
                data-testid="query-aggregation-select"
                className="max-w-[200px] flex-1 cursor-pointer rounded-sm bg-[var(--color-surface-container-high)] px-3 py-2 text-sm text-[var(--color-on-surface)] focus:ring-1 focus:ring-[var(--color-primary)]/20 focus:outline-none"
                disabled={disabled}
              >
                {AGGREGATION_FUNCTIONS.map(agg => (
                  <option key={agg.value} value={agg.value}>
                    {agg.label}
                  </option>
                ))}
              </select>

              {aggregationRequiresRange ? (
                <div className="flex items-center gap-2">
                  <label className="text-sm text-[var(--color-outline)]">Range:</label>
                  <input
                    value={rangeInterval}
                    onChange={event => setRangeInterval(event.target.value)}
                    type="text"
                    data-testid="query-range-input"
                    className="w-20 rounded-sm bg-[var(--color-surface-container-high)] px-3 py-2 font-mono text-sm text-[var(--color-on-surface)] focus:ring-1 focus:ring-[var(--color-primary)]/20 focus:outline-none"
                    placeholder="5m"
                    disabled={disabled}
                  />
                </div>
              ) : null}

              {aggregationRequiresK ? (
                <div className="flex items-center gap-2">
                  <label className="text-sm text-[var(--color-outline)]">K:</label>
                  <input
                    value={kValue}
                    onChange={event => setKValue(Number(event.target.value))}
                    type="number"
                    min={1}
                    data-testid="query-k-input"
                    className="w-[60px] rounded-sm bg-[var(--color-surface-container-high)] px-3 py-2 text-sm text-[var(--color-on-surface)] focus:ring-1 focus:ring-[var(--color-primary)]/20 focus:outline-none"
                    disabled={disabled}
                  />
                </div>
              ) : null}
            </div>
          </div>

          {aggregation ? (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent py-2 text-[var(--color-on-surface)] hover:text-[var(--color-primary)]"
                onClick={() => setShowGroupBy(prev => !prev)}
                disabled={disabled}
              >
                <span className="text-sm font-medium">Group By</span>
                {groupByLabels.length > 0 ? (
                  <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-sm bg-[var(--color-primary)] px-1.5 text-xs font-medium text-white">
                    {groupByLabels.length}
                  </span>
                ) : null}
                {showGroupBy ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {showGroupBy ? (
                <div className="rounded-sm bg-[var(--color-surface-container-high)] p-3">
                  <div className="flex flex-wrap gap-2">
                    {availableLabelsForGroupBy.map(label => (
                      <label
                        key={label}
                        className="flex cursor-pointer items-center gap-1.5 rounded bg-[var(--color-surface-container-low)] px-2.5 py-1.5 text-xs text-[var(--color-on-surface)] transition-all duration-200 hover:border-[var(--color-primary)]/20"
                      >
                        <input
                          type="checkbox"
                          checked={groupByLabels.includes(label)}
                          onChange={() => toggleGroupByLabel(label)}
                          disabled={disabled}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-2 flex flex-col gap-2 pt-4">
            <label className="text-sm font-medium text-[var(--color-on-surface)]">
              Generated Query
            </label>
            <div className="min-h-[48px] rounded-sm bg-[var(--color-surface-container-high)] px-4 py-3">
              {generatedQuery ? (
                <code className="font-mono text-sm break-all text-[var(--color-primary)]">
                  {generatedQuery}
                </code>
              ) : (
                <span className="text-sm text-[var(--color-outline)]">
                  Select a metric to generate query
                </span>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <label className="text-sm font-medium text-[var(--color-on-surface)]">Query</label>
          <MonacoQueryEditor
            value={codeQuery}
            onChange={setCodeQuery}
            disabled={disabled}
            height={120}
            placeholder="Enter query (PromQL / MetricsQL)..."
          />
        </div>
      )}
    </div>
  )
}