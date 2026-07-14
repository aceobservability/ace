import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Trace, TraceLog, TraceSpan } from '@/types/datasource'
import { formatDurationNano, formatTraceStartFull } from '@/utils/traceFormat'

type TraceSpanDetailsPanelProps = {
  trace: Trace
  span: TraceSpan
  onSelectSpan?: (span: TraceSpan) => void
  onOpenTraceLogs?: (payload: {
    traceId: string
    serviceName: string
    startTimeUnixNano: number
    endTimeUnixNano: number
  }) => void
  onOpenServiceMetrics?: (payload: {
    serviceName: string
    startTimeUnixNano: number
    endTimeUnixNano: number
  }) => void
}

function formatLogFields(log: TraceLog): Array<[string, string]> {
  return Object.entries(log.fields || {}).sort(([leftKey], [rightKey]) =>
    leftKey.localeCompare(rightKey),
  )
}

function copyWithTextArea(value: string): boolean {
  if (typeof document === 'undefined') {
    return false
  }

  const textArea = document.createElement('textarea')
  textArea.value = value
  textArea.setAttribute('readonly', 'true')
  textArea.style.position = 'fixed'
  textArea.style.opacity = '0'
  document.body.appendChild(textArea)
  textArea.select()

  let copied = false
  try {
    copied = document.execCommand('copy')
  } catch {
    copied = false
  }

  document.body.removeChild(textArea)
  return copied
}

function sanitizeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-')
}

export function TraceSpanDetailsPanel({
  trace,
  span,
  onSelectSpan,
  onOpenTraceLogs,
  onOpenServiceMetrics,
}: TraceSpanDetailsPanelProps) {
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const spanMap = useMemo(() => {
    const map = new Map<string, TraceSpan>()
    for (const entry of trace.spans) {
      map.set(entry.spanId, entry)
    }
    return map
  }, [trace.spans])

  const parentSpan = useMemo(() => {
    if (!span.parentSpanId) {
      return null
    }
    return spanMap.get(span.parentSpanId) || null
  }, [span.parentSpanId, spanMap])

  const childSpans = useMemo(() => {
    return trace.spans
      .filter(entry => entry.parentSpanId === span.spanId)
      .sort((left, right) => {
        if (left.startTimeUnixNano === right.startTimeUnixNano) {
          return right.durationNano - left.durationNano
        }
        return left.startTimeUnixNano - right.startTimeUnixNano
      })
  }, [span.spanId, trace.spans])

  const sortedTags = useMemo(() => {
    const tags = span.tags || {}
    return Object.entries(tags).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
  }, [span.tags])

  const sortedLogs = useMemo(() => {
    return [...(span.logs || [])].sort(
      (left, right) => left.timestampUnixNano - right.timestampUnixNano,
    )
  }, [span.logs])

  const formatTraceOffset = useCallback(
    (unixNanoTimestamp: number): string => {
      const duration = Math.max(unixNanoTimestamp - trace.startTimeUnixNano, 0)
      return `+${formatDurationNano(duration)}`
    },
    [trace.startTimeUnixNano],
  )

  const setFeedback = useCallback((message: string) => {
    setFeedbackMessage(message)
    if (feedbackTimeoutRef.current) {
      clearTimeout(feedbackTimeoutRef.current)
    }
    feedbackTimeoutRef.current = setTimeout(() => {
      setFeedbackMessage('')
    }, 2000)
  }, [])

  useEffect(() => {
    return () => {
      if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current)
      }
    }
  }, [])

  const copyToClipboard = useCallback(
    async (value: string, label: string) => {
      if (!value) {
        return
      }

      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(value)
          setFeedback(`${label} copied`)
          return
        }

        if (copyWithTextArea(value)) {
          setFeedback(`${label} copied`)
          return
        }

        setFeedback(`Unable to copy ${label.toLowerCase()}`)
      } catch {
        setFeedback(`Unable to copy ${label.toLowerCase()}`)
      }
    },
    [setFeedback],
  )

  const openTraceLogs = useCallback(() => {
    onOpenTraceLogs?.({
      traceId: trace.traceId,
      serviceName: span.serviceName || '',
      startTimeUnixNano: span.startTimeUnixNano,
      endTimeUnixNano: span.startTimeUnixNano + span.durationNano,
    })
  }, [onOpenTraceLogs, span.durationNano, span.serviceName, span.startTimeUnixNano, trace.traceId])

  const openServiceMetrics = useCallback(() => {
    onOpenServiceMetrics?.({
      serviceName: span.serviceName || '',
      startTimeUnixNano: span.startTimeUnixNano,
      endTimeUnixNano: span.startTimeUnixNano + span.durationNano,
    })
  }, [onOpenServiceMetrics, span.durationNano, span.serviceName, span.startTimeUnixNano])

  const exportSpanJson = useCallback(() => {
    if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
      setFeedback('Unable to export JSON in this environment')
      return
    }

    const payload = {
      traceId: trace.traceId,
      span,
      parentSpan,
      childSpans,
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    const traceId = sanitizeFileName(trace.traceId || 'trace')
    const spanId = sanitizeFileName(span.spanId || 'span')
    anchor.href = objectUrl
    anchor.download = `${traceId}-${spanId}.json`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(objectUrl)
    setFeedback('Span JSON exported')
  }, [childSpans, parentSpan, setFeedback, span, trace.traceId])

  return (
    <aside
      className="flex min-w-0 flex-col gap-3 rounded bg-[var(--color-surface-container-low)] p-4"
      aria-label="Span details panel"
      data-testid="trace-span-details-panel"
    >
      <header className="flex items-start justify-between gap-3 pb-3">
        <div>
          <h3 className="m-0 text-xs font-semibold uppercase tracking-wider text-[var(--color-outline)]">
            Span details
          </h3>
          <p className="mt-1 text-sm font-semibold text-[var(--color-on-surface)]">
            {span.operationName || '(unnamed span)'}
          </p>
        </div>
        <span
          className={
            span.status === 'error'
              ? 'shrink-0 rounded-sm border border-[var(--color-error)]/20 bg-[var(--color-error)]/10 px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide text-[var(--color-error)]'
              : 'shrink-0 rounded-sm border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/10 px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide text-[var(--color-primary)]'
          }
        >
          {span.status === 'error' ? 'Error' : 'OK'}
        </span>
      </header>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="cursor-pointer rounded-sm bg-[var(--color-surface-container-high)] px-3 py-1.5 text-xs text-[var(--color-on-surface-variant)] transition hover:border-[var(--color-primary)]/20 hover:text-[var(--color-primary)]"
          onClick={() => copyToClipboard(span.spanId, 'Span ID')}
        >
          Copy span ID
        </button>
        <button
          type="button"
          className="cursor-pointer rounded-sm bg-[var(--color-surface-container-high)] px-3 py-1.5 text-xs text-[var(--color-on-surface-variant)] transition hover:border-[var(--color-primary)]/20 hover:text-[var(--color-primary)]"
          onClick={() => copyToClipboard(trace.traceId, 'Trace ID')}
        >
          Copy trace ID
        </button>
        <button
          type="button"
          className="cursor-pointer rounded-sm bg-[var(--color-surface-container-high)] px-3 py-1.5 text-xs text-[var(--color-on-surface-variant)] transition hover:border-[var(--color-primary)]/20 hover:text-[var(--color-primary)]"
          onClick={openTraceLogs}
        >
          View Logs
        </button>
        <button
          type="button"
          className="cursor-pointer rounded-sm bg-[var(--color-surface-container-high)] px-3 py-1.5 text-xs text-[var(--color-on-surface-variant)] transition hover:border-[var(--color-primary)]/20 hover:text-[var(--color-primary)]"
          onClick={openServiceMetrics}
        >
          View Service Metrics
        </button>
        <button
          type="button"
          className="cursor-pointer rounded-sm bg-[var(--color-surface-container-high)] px-3 py-1.5 text-xs text-[var(--color-on-surface-variant)] transition hover:border-[var(--color-primary)]/20 hover:text-[var(--color-primary)]"
          onClick={exportSpanJson}
        >
          Export JSON
        </button>
      </div>
      {feedbackMessage ? (
        <p className="-mt-1 text-xs font-medium text-[var(--color-primary)]">{feedbackMessage}</p>
      ) : null}

      <section className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-sm p-3 max-md:grid-cols-1">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-outline)]">
            Service
          </span>
          <code className="break-all font-mono text-sm text-[var(--color-on-surface)]">
            {span.serviceName || 'unknown'}
          </code>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-outline)]">
            Duration
          </span>
          <code className="break-all font-mono text-sm text-[var(--color-on-surface)]">
            {formatDurationNano(span.durationNano)}
          </code>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-outline)]">
            Start
          </span>
          <span className="text-sm text-[var(--color-on-surface-variant)]">
            {formatTraceStartFull(span.startTimeUnixNano)}
          </span>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-outline)]">
            End
          </span>
          <span className="text-sm text-[var(--color-on-surface-variant)]">
            {formatTraceStartFull(span.startTimeUnixNano + span.durationNano)}
          </span>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-outline)]">
            Offset
          </span>
          <code className="break-all font-mono text-sm text-[var(--color-on-surface)]">
            {formatTraceOffset(span.startTimeUnixNano)}
          </code>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-outline)]">
            Span ID
          </span>
          <code className="break-all font-mono text-sm text-[var(--color-on-surface)]">
            {span.spanId}
          </code>
        </div>
      </section>

      <section className="flex flex-col gap-2.5 rounded-sm p-3">
        <h4 className="m-0 text-xs font-semibold uppercase tracking-wider text-[var(--color-outline)]">
          Relationships
        </h4>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-outline)]">
            Parent
          </span>
          {parentSpan ? (
            <button
              type="button"
              className="cursor-pointer rounded-sm border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/10 px-3 py-1.5 text-left text-sm text-[var(--color-primary)] transition hover:border-[var(--color-primary)]/20 hover:text-[var(--color-primary)]"
              onClick={() => onSelectSpan?.(parentSpan)}
            >
              {parentSpan.operationName || '(unnamed span)'}
            </button>
          ) : (
            <span className="text-sm text-[var(--color-outline)]">Root span</span>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-outline)]">
            Children
          </span>
          {childSpans.length > 0 ? (
            <div className="flex flex-col gap-1">
              {childSpans.map(child => (
                <button
                  key={child.spanId}
                  type="button"
                  className="cursor-pointer rounded-sm border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/10 px-3 py-1.5 text-left text-sm text-[var(--color-primary)] transition hover:border-[var(--color-primary)]/20 hover:text-[var(--color-primary)]"
                  onClick={() => onSelectSpan?.(child)}
                >
                  {child.operationName || '(unnamed span)'}
                </button>
              ))}
            </div>
          ) : (
            <span className="text-sm text-[var(--color-outline)]">No child spans</span>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-sm p-3">
        <h4 className="m-0 text-xs font-semibold uppercase tracking-wider text-[var(--color-outline)]">
          Attributes
        </h4>
        {sortedTags.length > 0 ? (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-b border-[var(--color-stroke-subtle)] pb-1.5 text-left text-xs text-[var(--color-outline)]">
                  Key
                </th>
                <th className="border-b border-[var(--color-stroke-subtle)] pb-1.5 text-left text-xs text-[var(--color-outline)]">
                  Value
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedTags.map(([key, value]) => (
                <tr key={key}>
                  <td className="border-b border-[var(--color-stroke-subtle)] py-1.5 align-top">
                    <code className="rounded-sm bg-[var(--color-surface-container-high)] px-1.5 py-0.5 font-mono text-xs text-[var(--color-outline)]">
                      {key}
                    </code>
                  </td>
                  <td className="border-b border-[var(--color-stroke-subtle)] py-1.5 align-top">
                    <code className="rounded-sm bg-[var(--color-surface-container-high)] px-1.5 py-0.5 font-mono text-xs text-[var(--color-on-surface)]">
                      {value}
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="m-0 text-sm text-[var(--color-outline)]">No span attributes.</p>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-sm p-3">
        <h4 className="m-0 text-xs font-semibold uppercase tracking-wider text-[var(--color-outline)]">
          Logs and events
        </h4>
        {sortedLogs.length > 0 ? (
          <div className="flex flex-col gap-2">
            {sortedLogs.map((log, index) => {
              const logFields = formatLogFields(log)

              return (
                <article
                  key={`${log.timestampUnixNano}-${index}`}
                  className="flex flex-col gap-2 rounded-sm p-2.5"
                >
                  <div className="flex items-center justify-between gap-2 text-xs text-[var(--color-outline)]">
                    <span>{formatTraceStartFull(log.timestampUnixNano)}</span>
                    <code className="font-mono">{formatTraceOffset(log.timestampUnixNano)}</code>
                  </div>
                  {logFields.length > 0 ? (
                    <div className="flex flex-col gap-1">
                      {logFields.map(([fieldKey, fieldValue]) => (
                        <div key={fieldKey} className="flex items-start gap-2">
                          <code className="rounded-sm bg-[var(--color-surface-container-high)] px-1.5 py-0.5 font-mono text-xs text-[var(--color-outline)]">
                            {fieldKey}
                          </code>
                          <code className="rounded-sm bg-[var(--color-surface-container-high)] px-1.5 py-0.5 font-mono text-xs text-[var(--color-on-surface)]">
                            {fieldValue}
                          </code>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="m-0 text-sm text-[var(--color-outline)]">No log fields</p>
                  )}
                </article>
              )
            })}
          </div>
        ) : (
          <p className="m-0 text-sm text-[var(--color-outline)]">No logs or events for this span.</p>
        )}
      </section>
    </aside>
  )
}