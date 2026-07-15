type ClickHouseSignal = 'logs' | 'metrics' | 'traces'

type ClickHouseSQLEditorProps = {
  value: string
  onChange: (value: string) => void
  signal?: ClickHouseSignal
  disabled?: boolean
  showSignalSelector?: boolean
  onSignalChange?: (signal: ClickHouseSignal) => void
}

const sqlExamples: Record<ClickHouseSignal, string> = {
  logs: 'SELECT Timestamp AS timestamp, Body AS message, SeverityText AS level\nFROM ace_logs\nWHERE Timestamp >= toDateTime({start}) AND Timestamp <= toDateTime({end})\nORDER BY Timestamp DESC\nLIMIT 500',
  metrics:
    'SELECT toStartOfInterval(TimeUnix, INTERVAL 1 minute) AS timestamp, avg(Value) AS value, MetricName AS metric\nFROM otel_metrics_gauge\nWHERE TimeUnix >= fromUnixTimestamp({start}) AND TimeUnix <= fromUnixTimestamp({end})\nGROUP BY timestamp, metric\nORDER BY timestamp',
  traces:
    'SELECT SpanId AS span_id, ParentSpanId AS parent_span_id, SpanName AS operation_name, ServiceName AS service_name, toUnixTimestamp64Nano(Timestamp) AS start_time_unix_nano, Duration AS duration_nano, StatusCode AS status\nFROM ace_traces\nWHERE Timestamp BETWEEN fromUnixTimestamp64Nano({start_ns}) AND fromUnixTimestamp64Nano({end_ns})\nLIMIT 200',
}

const columnGuides: Record<ClickHouseSignal, string[]> = {
  logs: ['timestamp', 'message', 'level (optional)'],
  metrics: ['timestamp', 'value', 'metric (optional)'],
  traces: [
    'span_id',
    'parent_span_id (optional)',
    'operation_name',
    'service_name',
    'start_time_unix_nano',
    'duration_nano',
    'status (optional)',
  ],
}

export function ClickHouseSQLEditor({
  value,
  onChange,
  signal = 'metrics',
  disabled = false,
  showSignalSelector = false,
  onSignalChange,
}: ClickHouseSQLEditorProps) {
  const placeholder = sqlExamples[signal]
  const expectedColumns = columnGuides[signal]

  return (
    <div
      className={`flex flex-col gap-3.5 ${disabled ? 'pointer-events-none opacity-60' : ''}`}
    >
      {showSignalSelector ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="clickhouse-signal" className="text-sm font-medium text-[var(--color-on-surface)]">
            Signal Type
          </label>
          <select
            id="clickhouse-signal"
            value={signal}
            data-testid="clickhouse-signal-select"
            disabled={disabled}
            className="w-full cursor-pointer rounded-sm bg-[var(--color-surface-container-high)] px-3 py-2 text-sm text-[var(--color-on-surface)] transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 disabled:cursor-not-allowed disabled:bg-[var(--color-surface-container-high)] disabled:text-[var(--color-outline)]"
            onChange={event => onSignalChange?.(event.target.value as ClickHouseSignal)}
          >
            <option value="logs">Logs</option>
            <option value="metrics">Metrics</option>
            <option value="traces">Traces</option>
          </select>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="clickhouse-query" className="text-sm font-medium text-[var(--color-on-surface)]">
          SQL
        </label>
        <textarea
          id="clickhouse-query"
          value={value}
          data-testid="clickhouse-query-input"
          disabled={disabled}
          placeholder={placeholder}
          rows={7}
          spellCheck={false}
          className="min-h-[140px] w-full resize-y rounded-sm bg-[var(--color-surface-container-low)] px-3.5 py-3 font-mono text-sm leading-relaxed text-[var(--color-on-surface)] transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 disabled:cursor-not-allowed disabled:bg-[var(--color-surface-container-high)] disabled:text-[var(--color-outline)]"
          onChange={event => onChange(event.target.value)}
        />
      </div>

      <div className="rounded-sm bg-[var(--color-surface-container-high)] px-3.5 py-3">
        <p className="m-0 text-xs text-[var(--color-outline)]">
          Expected columns for {signal} queries:
        </p>
        <p className="mb-0 mt-2 flex flex-wrap gap-1.5">
          {expectedColumns.map(column => (
            <code
              key={column}
              className="inline-flex items-center rounded border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/10 px-1.5 py-0.5 font-mono text-xs text-[var(--color-on-surface-variant)]"
            >
              {column}
            </code>
          ))}
        </p>
        <p className="mb-0 mt-2.5 text-xs leading-relaxed text-[var(--color-outline)]">
          Time placeholders supported:{' '}
          <code className="inline-flex items-center rounded border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/10 px-1.5 py-0.5 font-mono text-xs text-[var(--color-on-surface-variant)]">
            {'{start}'}
          </code>
          ,{' '}
          <code className="inline-flex items-center rounded border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/10 px-1.5 py-0.5 font-mono text-xs text-[var(--color-on-surface-variant)]">
            {'{end}'}
          </code>
          ,{' '}
          <code className="inline-flex items-center rounded border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/10 px-1.5 py-0.5 font-mono text-xs text-[var(--color-on-surface-variant)]">
            {'{step}'}
          </code>
          ,{' '}
          <code className="inline-flex items-center rounded border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/10 px-1.5 py-0.5 font-mono text-xs text-[var(--color-on-surface-variant)]">
            {'{start_ms}'}
          </code>
          ,{' '}
          <code className="inline-flex items-center rounded border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/10 px-1.5 py-0.5 font-mono text-xs text-[var(--color-on-surface-variant)]">
            {'{end_ms}'}
          </code>
          ,{' '}
          <code className="inline-flex items-center rounded border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/10 px-1.5 py-0.5 font-mono text-xs text-[var(--color-on-surface-variant)]">
            {'{start_ns}'}
          </code>
          ,{' '}
          <code className="inline-flex items-center rounded border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/10 px-1.5 py-0.5 font-mono text-xs text-[var(--color-on-surface-variant)]">
            {'{end_ns}'}
          </code>
          .
        </p>
      </div>
    </div>
  )
}