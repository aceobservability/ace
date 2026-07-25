type ElasticsearchSignal = 'logs' | 'metrics'

type ElasticsearchQueryEditorProps = {
  value: string
  onChange: (value: string) => void
  signal?: ElasticsearchSignal
  disabled?: boolean
  showSignalSelector?: boolean
  onSignalChange?: (signal: ElasticsearchSignal) => void
}

const examples: Record<ElasticsearchSignal, string> = {
  metrics:
    '{\n  "index": "ace-logs-*",\n  "query": {\n    "query_string": {\n      "query": "service.name:api"\n    }\n  },\n  "aggs": {\n    "timeseries": {\n      "date_histogram": {\n        "field": "@timestamp",\n        "fixed_interval": "1m"\n      }\n    }\n  }\n}',
  logs: '{\n  "index": "ace-logs-*",\n  "query": {\n    "query_string": {\n      "query": "level:error AND service.name:api"\n    }\n  },\n  "size": 200\n}',
}

export function ElasticsearchQueryEditor({
  value,
  onChange,
  signal = 'metrics',
  disabled = false,
  showSignalSelector = true,
  onSignalChange,
}: ElasticsearchQueryEditorProps) {
  const helperText =
    signal === 'logs'
      ? 'Use Elasticsearch Query DSL JSON (or plain Lucene query string). Time range filtering is applied automatically.'
      : 'Use Elasticsearch Query DSL JSON for aggregations. If aggs are omitted, Ace builds a date_histogram timeseries automatically.'

  return (
    <div className={`flex flex-col gap-3.5 ${disabled ? 'pointer-events-none opacity-60' : ''}`}>
      {showSignalSelector ? (
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="elasticsearch-signal"
            className="text-sm font-medium text-[var(--color-on-surface)]"
          >
            Signal Type
          </label>
          <select
            id="elasticsearch-signal"
            value={signal}
            data-testid="elasticsearch-signal-select"
            disabled={disabled}
            className="w-full cursor-pointer rounded-sm bg-[var(--color-surface-container-high)] px-3 py-2 text-sm text-[var(--color-on-surface)] transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 disabled:cursor-not-allowed disabled:bg-[var(--color-surface-container-high)] disabled:text-[var(--color-outline)]"
            onChange={event => onSignalChange?.(event.target.value as ElasticsearchSignal)}
          >
            <option value="metrics">Metrics</option>
            <option value="logs">Logs</option>
          </select>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="elasticsearch-query"
          className="text-sm font-medium text-[var(--color-on-surface)]"
        >
          Query
        </label>
        <textarea
          id="elasticsearch-query"
          value={value}
          data-testid="elasticsearch-query-input"
          disabled={disabled}
          placeholder={examples[signal]}
          rows={7}
          spellCheck={false}
          className="min-h-[140px] w-full resize-y rounded-sm bg-[var(--color-surface-container-low)] px-3.5 py-3 font-mono text-sm leading-relaxed text-[var(--color-on-surface)] transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 disabled:cursor-not-allowed disabled:bg-[var(--color-surface-container-high)] disabled:text-[var(--color-outline)]"
          onChange={event => onChange(event.target.value)}
        />
      </div>

      <p className="m-0 text-xs leading-relaxed text-[var(--color-outline)]">{helperText}</p>
    </div>
  )
}
