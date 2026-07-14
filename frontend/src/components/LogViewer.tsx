import { Activity } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { LogEntry } from '@/types/datasource'

type DetectedField = {
  key: string
  value: string
}

type LogViewerProps = {
  logs: LogEntry[]
  highlightedLogKeys?: string[]
  traceIdField?: string
  linkedTraceDatasourceId?: string | null
}

function extractTraceId(entry: LogEntry, traceIdField: string): string | null {
  const field = traceIdField || 'trace_id'

  if (entry.labels?.[field]) {
    return entry.labels[field]
  }

  try {
    const parsed = JSON.parse(entry.line) as Record<string, unknown>
    if (parsed[field]) return String(parsed[field])
  } catch {
    // Not JSON
  }

  const regex = new RegExp(`(?:${field}[=:]["']?)([a-f0-9]{16,64})`, 'i')
  const match = entry.line.match(regex)
  if (match) return match[1] ?? null

  return null
}

function getLevelBadgeClasses(level?: string): string {
  switch (level) {
    case 'error':
      return 'rounded-sm bg-[var(--color-error)]/10 px-2 py-0.5 text-[var(--color-error)] ring-1 ring-[var(--color-error)]/20 font-semibold'
    case 'warning':
    case 'warn':
      return 'rounded-sm bg-[var(--color-tertiary)]/10 px-2 py-0.5 text-[var(--color-tertiary)] ring-1 ring-[var(--color-tertiary)]/20 font-semibold'
    case 'info':
      return 'rounded-sm bg-[var(--color-primary)]/10 px-2 py-0.5 text-[var(--color-primary)] ring-1 ring-[var(--color-primary)]/20 font-semibold'
    case 'debug':
      return 'rounded-sm bg-[var(--color-surface-container-high)] px-2 py-0.5 text-[var(--color-on-surface-variant)]'
    default:
      return 'rounded-sm bg-[var(--color-surface-container-high)] px-2 py-0.5 text-[var(--color-on-surface-variant)]'
  }
}

function formatTimestamp(ts: string): string {
  try {
    const date = new Date(ts)
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    })
  } catch {
    return ts
  }
}

function formatFieldValue(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function flattenObject(value: unknown, prefix = '', depth = 0): DetectedField[] {
  if (depth > 4) {
    return [{ key: prefix || 'value', value: formatFieldValue(value) }]
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [{ key: prefix || 'value', value: '[]' }]
    }

    const rows: DetectedField[] = []
    for (let i = 0; i < value.length; i += 1) {
      const childPrefix = prefix ? `${prefix}[${i}]` : `[${i}]`
      rows.push(...flattenObject(value[i], childPrefix, depth + 1))
    }
    return rows
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) {
      return [{ key: prefix || 'value', value: '{}' }]
    }

    const rows: DetectedField[] = []
    for (const [key, child] of entries) {
      const childPrefix = prefix ? `${prefix}.${key}` : key
      rows.push(...flattenObject(child, childPrefix, depth + 1))
    }
    return rows
  }

  return [{ key: prefix || 'value', value: formatFieldValue(value) }]
}

function parseJsonFields(line: string): DetectedField[] {
  const trimmed = line.trim()
  const candidates: string[] = [trimmed]
  const firstBrace = trimmed.indexOf('{')
  if (firstBrace > 0) {
    candidates.push(trimmed.slice(firstBrace))
  }

  for (const candidate of candidates) {
    if (!candidate.startsWith('{') || !candidate.endsWith('}')) {
      continue
    }

    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return flattenObject(parsed)
      }
    } catch {
      // Not valid JSON
    }
  }

  return []
}

function parseKeyValueFields(line: string): DetectedField[] {
  const fields: DetectedField[] = []
  const seenKeys = new Set<string>()
  const pattern = /([a-zA-Z_][\w.-]*)=("[^"]*"|'[^']*'|[^,\s]+)/g

  for (const match of line.matchAll(pattern)) {
    const key = match[1]
    if (!key || seenKeys.has(key)) {
      continue
    }

    const rawValue = match[2] || ''
    const value =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
        ? rawValue.slice(1, -1)
        : rawValue

    fields.push({ key, value })
    seenKeys.add(key)
  }

  return fields
}

function getMessageFields(log: LogEntry): DetectedField[] {
  const jsonFields = parseJsonFields(log.line)
  if (jsonFields.length > 0) {
    return jsonFields
  }

  return parseKeyValueFields(log.line)
}

export function LogViewer({
  logs,
  highlightedLogKeys = [],
  traceIdField = 'trace_id',
  linkedTraceDatasourceId = null,
}: LogViewerProps) {
  const navigate = useNavigate()
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

  const displayLogs = useMemo(() => logs.slice(0, 1000), [logs])
  const highlightedLogKeySet = useMemo(() => new Set(highlightedLogKeys), [highlightedLogKeys])
  const detectedFieldsByRow = useMemo(
    () => displayLogs.map(log => getMessageFields(log)),
    [displayLogs],
  )

  function getLogKey(log: LogEntry): string {
    const labels = Object.entries(log.labels || {})
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
      .map(([key, value]) => `${key}=${value}`)
      .join(',')
    return `${log.timestamp}|${labels}|${log.line}`
  }

  function isHighlighted(log: LogEntry): boolean {
    return highlightedLogKeySet.has(getLogKey(log))
  }

  function toggleRow(index: number) {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  function navigateToTrace(traceId: string) {
    const params = new URLSearchParams()
    if (linkedTraceDatasourceId) {
      params.set('datasourceId', linkedTraceDatasourceId)
    }
    params.set('traceId', traceId)
    navigate(`/app/explore/traces?${params.toString()}`)
  }

  if (logs.length === 0) {
    return (
      <div
        className="flex h-full flex-col overflow-hidden rounded bg-[var(--color-surface-container-low)]"
        data-testid="log-viewer"
      >
        <div className="text-center px-4 py-8 text-xs font-mono text-[var(--color-outline)]">
          No log entries
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded bg-[var(--color-surface-container-low)]"
      data-testid="log-viewer"
    >
      <div className="flex items-center gap-4 bg-[var(--color-surface-container-high)] px-4 py-2.5 font-mono text-xs uppercase tracking-[0.07em] text-[var(--color-on-surface-variant)]">
        <span className="w-44 shrink-0">Timestamp</span>
        <span className="w-20 shrink-0">Level</span>
        <span className="flex-1">Message</span>
      </div>
      <div className="shrink-0 bg-[var(--color-surface-container-high)] px-4 py-1 font-mono text-xs">
        <span className="text-[var(--color-outline)]">{logs.length} log entries</span>
      </div>

      <div className="flex-1 overflow-auto">
        {displayLogs.map((log, index) => {
          const expanded = expandedRows.has(index)
          const traceId =
            linkedTraceDatasourceId && extractTraceId(log, traceIdField)

          return (
            <div key={`${getLogKey(log)}-${index}`}>
              <div
                className={`group flex cursor-pointer items-start gap-4 px-4 py-2 font-mono text-xs transition hover:bg-[var(--color-surface-container-high)] ${
                  expanded ? 'bg-[var(--color-surface-container-high)]' : ''
                } ${isHighlighted(log) ? 'animate-[row-highlight-fade_2.4s_ease-out]' : ''}`}
                data-testid="log-viewer-row"
                onClick={() => toggleRow(index)}
              >
                <span className="w-44 shrink-0 text-[var(--color-outline)]">
                  {formatTimestamp(log.timestamp)}
                </span>

                <span className="w-20 shrink-0">
                  {log.level ? (
                    <span
                      className={`inline-block text-[0.7rem] uppercase ${getLevelBadgeClasses(log.level)}`}
                    >
                      {log.level}
                    </span>
                  ) : null}
                </span>

                <span className="w-40 shrink-0">
                  {traceId ? (
                    <button
                      type="button"
                      className="inline-flex cursor-pointer items-center gap-1 rounded border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/10 px-1.5 py-0.5 font-mono text-xs text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)]/10"
                      title={`View trace ${traceId}`}
                      onClick={event => {
                        event.stopPropagation()
                        navigateToTrace(traceId)
                      }}
                    >
                      <Activity className="h-3 w-3" />
                      {traceId.slice(0, 16)}…
                    </button>
                  ) : null}
                </span>

                <div className="flex-1 break-all text-[var(--color-on-surface)]">
                  <div className="flex items-start gap-1.5">
                    <svg
                      className={`mt-0.5 shrink-0 transition-all duration-150 group-hover:!text-[var(--color-primary)] ${
                        expanded ? 'rotate-90' : ''
                      }`}
                      style={{
                        color: expanded ? 'var(--color-primary)' : 'var(--color-outline)',
                      }}
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                    <span className="flex-1 whitespace-pre-wrap">{log.line}</span>
                  </div>
                  {log.labels && Object.keys(log.labels).length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {Object.entries(log.labels).map(([key, value]) => (
                        <span
                          key={key}
                          className="mr-1 inline-flex rounded-sm bg-[var(--color-surface-container-high)] px-2 py-0.5 text-xs text-[var(--color-on-surface-variant)]"
                        >
                          {key}={value}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              {expanded ? (
                <div className="bg-[var(--color-surface-container-high)] px-6 py-4 font-mono text-xs">
                  <div className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.04em] text-[var(--color-outline)]">
                    Detected Fields
                  </div>
                  {detectedFieldsByRow[index]?.length ? (
                    <div className="grid gap-1.5">
                      {detectedFieldsByRow[index].map(field => (
                        <div
                          key={field.key}
                          className="grid grid-cols-[minmax(120px,220px)_1fr] gap-2.5 max-sm:grid-cols-1 max-sm:gap-1"
                        >
                          <span className="break-words text-[var(--color-outline)]">
                            {field.key}
                          </span>
                          <span className="whitespace-pre-wrap break-words text-[var(--color-on-surface)]">
                            {field.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[var(--color-outline)]">
                      No structured fields detected in this message.
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}