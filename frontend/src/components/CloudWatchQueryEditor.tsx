type CloudWatchSignal = 'logs' | 'metrics'

type CloudWatchQueryEditorProps = {
  value: string
  onChange: (value: string) => void
  signal?: CloudWatchSignal
  disabled?: boolean
  showSignalSelector?: boolean
  onSignalChange?: (signal: CloudWatchSignal) => void
}

const examples: Record<CloudWatchSignal, string> = {
  metrics:
    '{\n  "namespace": "AWS/EC2",\n  "metric_name": "CPUUtilization",\n  "dimensions": {\n    "InstanceId": "i-1234567890"\n  },\n  "stat": "Average",\n  "period": 60\n}',
  logs: 'fields @timestamp, @message, @logStream\n| filter @message like /error/\n| sort @timestamp desc\n| limit 200',
}

export function CloudWatchQueryEditor({
  value,
  onChange,
  signal = 'metrics',
  disabled = false,
  showSignalSelector = true,
  onSignalChange,
}: CloudWatchQueryEditorProps) {
  const helperText =
    signal === 'metrics'
      ? 'Use JSON for metric queries. Required keys: namespace, metric_name (or expression). Optional: dimensions, stat, period, unit, label.'
      : 'Use CloudWatch Logs Insights syntax. Configure log_group on the datasource (or include log_group/log_group_names in JSON).'

  return (
    <div className={`flex flex-col gap-3.5 ${disabled ? 'pointer-events-none opacity-60' : ''}`}>
      {showSignalSelector ? (
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="cloudwatch-signal"
            className="text-sm font-medium text-[var(--color-on-surface)]"
          >
            Signal Type
          </label>
          <select
            id="cloudwatch-signal"
            value={signal}
            data-testid="cloudwatch-signal-select"
            disabled={disabled}
            className="w-full cursor-pointer rounded-sm bg-[var(--color-surface-container-high)] px-3 py-2 text-sm text-[var(--color-on-surface)] transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 disabled:cursor-not-allowed disabled:bg-[var(--color-surface-container-high)] disabled:text-[var(--color-outline)]"
            onChange={event => onSignalChange?.(event.target.value as CloudWatchSignal)}
          >
            <option value="metrics">Metrics</option>
            <option value="logs">Logs</option>
          </select>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="cloudwatch-query"
          className="text-sm font-medium text-[var(--color-on-surface)]"
        >
          Query
        </label>
        <textarea
          id="cloudwatch-query"
          value={value}
          data-testid="cloudwatch-query-input"
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
