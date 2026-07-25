import { ChevronLeft, ChevronRight, Download, Filter, Search } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import {
  exportAuditLog,
  listAuditLog,
  type AuditLogEntry,
  type AuditLogParams,
} from '@/api/audit'
import { useOrganization } from '@/hooks/useOrganization'

const ACTION_OPTIONS = [
  { value: '', label: 'All Actions' },
  { value: 'login', label: 'Login' },
  { value: 'logout', label: 'Logout' },
  { value: 'create', label: 'Create' },
  { value: 'update', label: 'Update' },
  { value: 'delete', label: 'Delete' },
  { value: 'permission.change', label: 'Permission Change' },
  { value: 'export', label: 'Export' },
  { value: 'invite', label: 'Invite' },
]

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return ts
  }
}

function resourceLabel(entry: AuditLogEntry): string {
  const parts: string[] = []
  if (entry.resource_type) parts.push(entry.resource_type)
  if (entry.resource_name) parts.push(entry.resource_name)
  else if (entry.resource_id) parts.push(entry.resource_id)
  return parts.join(': ')
}

export function AuditLogPage() {
  const { currentOrg } = useOrganization()

  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit] = useState(50)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  const [actorFilter, setActorFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [resourceTypeFilter, setResourceTypeFilter] = useState('')
  const [fromFilter, setFromFilter] = useState('')
  const [toFilter, setToFilter] = useState('')

  const totalPages = Math.max(1, Math.ceil(total / limit))

  const fetchEntries = useCallback(
    async (pageOverride?: number) => {
      const orgId = currentOrg?.id
      if (!orgId) return

      const nextPage = pageOverride ?? page
      setLoading(true)
      setError(null)

      const params: AuditLogParams = {
        page: nextPage,
        limit,
      }
      if (actorFilter) params.actor = actorFilter
      if (actionFilter) params.action = actionFilter
      if (resourceTypeFilter) params.resource_type = resourceTypeFilter
      if (fromFilter) params.from = `${fromFilter}:00Z`
      if (toFilter) params.to = `${toFilter}:00Z`

      try {
        const result = await listAuditLog(orgId, params)
        setEntries(result.entries)
        setTotal(result.total)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch audit log')
        setEntries([])
        setTotal(0)
      } finally {
        setLoading(false)
      }
    },
    [
      actionFilter,
      actorFilter,
      currentOrg?.id,
      fromFilter,
      limit,
      page,
      resourceTypeFilter,
      toFilter,
    ],
  )

  useEffect(() => {
    void fetchEntries()
  }, [fetchEntries])

  async function handleExport(format: 'csv' | 'json') {
    const orgId = currentOrg?.id
    if (!orgId) return

    setExportError(null)
    try {
      const blob = await exportAuditLog(
        orgId,
        format,
        fromFilter ? `${fromFilter}:00Z` : undefined,
        toFilter ? `${toFilter}:00Z` : undefined,
      )
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit-log.${format}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed')
    }
  }

  function handleFilterChange() {
    setPage(1)
    void fetchEntries(1)
  }

  function prevPage() {
    if (page > 1) {
      const next = page - 1
      setPage(next)
      void fetchEntries(next)
    }
  }

  function nextPage() {
    if (page < totalPages) {
      const next = page + 1
      setPage(next)
      void fetchEntries(next)
    }
  }

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-on-surface)' }}
    >
      <div
        className="flex shrink-0 items-center justify-between px-5 py-4"
        style={{
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          backgroundColor: 'var(--color-surface-container-low)',
        }}
      >
        <h1
          data-testid="audit-log-heading"
          className="font-display text-xl font-semibold"
          style={{ color: 'var(--color-on-surface)', letterSpacing: '-0.02em' }}
        >
          Audit Log
        </h1>

        <div className="flex items-center gap-2">
          {exportError ? (
            <span className="text-xs" style={{ color: 'var(--color-error)' }} data-testid="export-error">
              {exportError}
            </span>
          ) : null}
          <button
            type="button"
            data-testid="export-csv-btn"
            className="flex cursor-pointer items-center gap-1.5 border px-3 py-1.5 text-sm transition-colors"
            style={{
              backgroundColor: 'transparent',
              color: 'var(--color-on-surface-variant)',
              borderColor: 'rgba(255,255,255,0.12)',
              borderRadius: '4px',
            }}
            onClick={() => void handleExport('csv')}
          >
            <Download size={14} />
            CSV
          </button>
          <button
            type="button"
            data-testid="export-json-btn"
            className="flex cursor-pointer items-center gap-1.5 border px-3 py-1.5 text-sm transition-colors"
            style={{
              backgroundColor: 'transparent',
              color: 'var(--color-on-surface-variant)',
              borderColor: 'rgba(255,255,255,0.12)',
              borderRadius: '4px',
            }}
            onClick={() => void handleExport('json')}
          >
            <Download size={14} />
            JSON
          </button>
        </div>
      </div>

      <div
        data-testid="filter-bar"
        className="flex shrink-0 flex-wrap items-center gap-3 px-5 py-3"
        style={{
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          backgroundColor: 'var(--color-surface-container-low)',
        }}
      >
        <div className="relative flex items-center gap-1.5">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5"
            style={{ color: 'var(--color-outline)' }}
          />
          <input
            value={actorFilter}
            onChange={e => setActorFilter(e.target.value)}
            onBlur={handleFilterChange}
            onKeyDown={e => {
              if (e.key === 'Enter') handleFilterChange()
            }}
            data-testid="filter-actor"
            type="text"
            placeholder="Filter by actor email"
            className="py-1.5 pr-3 pl-8 text-sm"
            style={{
              width: '220px',
              backgroundColor: 'var(--color-surface-container-high)',
              color: 'var(--color-on-surface)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '4px',
              outline: 'none',
            }}
          />
        </div>

        <div className="flex items-center gap-1.5">
          <Filter size={14} style={{ color: 'var(--color-outline)' }} />
          <select
            value={actionFilter}
            onChange={e => {
              setActionFilter(e.target.value)
              setPage(1)
            }}
            data-testid="filter-action"
            className="cursor-pointer px-2.5 py-1.5 text-sm"
            style={{
              backgroundColor: 'var(--color-surface-container-high)',
              color: 'var(--color-on-surface)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '4px',
              outline: 'none',
            }}
          >
            {ACTION_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <input
          value={resourceTypeFilter}
          onChange={e => setResourceTypeFilter(e.target.value)}
          onBlur={handleFilterChange}
          onKeyDown={e => {
            if (e.key === 'Enter') handleFilterChange()
          }}
          data-testid="filter-resource-type"
          type="text"
          placeholder="Resource type"
          className="px-3 py-1.5 text-sm"
          style={{
            width: '160px',
            backgroundColor: 'var(--color-surface-container-high)',
            color: 'var(--color-on-surface)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '4px',
            outline: 'none',
          }}
        />

        <input
          value={fromFilter}
          onChange={e => {
            setFromFilter(e.target.value)
            setPage(1)
          }}
          data-testid="filter-from"
          type="datetime-local"
          className="px-3 py-1.5 text-sm"
          style={{
            backgroundColor: 'var(--color-surface-container-high)',
            color: 'var(--color-on-surface)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '4px',
            outline: 'none',
            colorScheme: 'dark',
          }}
        />
        <span className="text-sm" style={{ color: 'var(--color-outline)' }}>
          —
        </span>
        <input
          value={toFilter}
          onChange={e => {
            setToFilter(e.target.value)
            setPage(1)
          }}
          data-testid="filter-to"
          type="datetime-local"
          className="px-3 py-1.5 text-sm"
          style={{
            backgroundColor: 'var(--color-surface-container-high)',
            color: 'var(--color-on-surface)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '4px',
            outline: 'none',
            colorScheme: 'dark',
          }}
        />
      </div>

      {error ? (
        <div
          data-testid="error-banner"
          className="mx-5 mt-4 rounded px-4 py-3 text-sm"
          style={{
            backgroundColor: 'rgba(239,68,68,0.10)',
            color: 'var(--color-error)',
            border: '1px solid rgba(239,68,68,0.24)',
            borderRadius: '4px',
          }}
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <div
          data-testid="loading-state"
          className="flex flex-1 items-center justify-center"
          style={{ color: 'var(--color-on-surface-variant)' }}
        >
          <span className="text-sm">Loading...</span>
        </div>
      ) : (
        <div className="flex-1 overflow-auto px-5 pt-4">
          {entries.length === 0 ? (
            <div
              data-testid="empty-state"
              className="flex flex-col items-center justify-center gap-2 py-16"
            >
              <p className="text-sm font-medium" style={{ color: 'var(--color-on-surface)' }}>
                No audit log entries found
              </p>
              <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                Try adjusting your filters or date range
              </p>
            </div>
          ) : (
            <table data-testid="audit-log-table" className="w-full border-collapse text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {['Timestamp', 'Actor', 'Action', 'Resource', 'Outcome', 'IP Address'].map(
                    (label, idx) => (
                      <th
                        key={label}
                        className={`py-2 text-left text-xs font-medium ${idx < 5 ? 'pr-4' : ''}`}
                        style={{
                          color: 'var(--color-on-surface-variant)',
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                        }}
                      >
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {entries.map(entry => (
                  <tr
                    key={entry.id}
                    data-testid="audit-log-row"
                    className="transition-colors"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                  >
                    <td
                      className="py-2.5 pr-4 font-mono text-xs"
                      style={{ color: 'var(--color-on-surface-variant)' }}
                    >
                      {formatTimestamp(entry.created_at)}
                    </td>
                    <td className="py-2.5 pr-4 text-sm" style={{ color: 'var(--color-on-surface)' }}>
                      {entry.actor_email}
                    </td>
                    <td
                      className="py-2.5 pr-4 font-mono text-sm"
                      style={{ color: 'var(--color-on-surface)' }}
                    >
                      {entry.action}
                    </td>
                    <td
                      className="py-2.5 pr-4 text-sm"
                      style={{ color: 'var(--color-on-surface-variant)' }}
                    >
                      {resourceLabel(entry)}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span
                        className="rounded px-2 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor:
                            entry.outcome === 'success'
                              ? 'rgba(52,211,153,0.12)'
                              : 'rgba(239,68,68,0.12)',
                          color:
                            entry.outcome === 'success'
                              ? 'var(--color-secondary)'
                              : 'var(--color-error)',
                          borderRadius: '4px',
                        }}
                      >
                        {entry.outcome}
                      </span>
                    </td>
                    <td
                      className="py-2.5 font-mono text-xs"
                      style={{ color: 'var(--color-on-surface-variant)' }}
                    >
                      {entry.ip_address ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {!loading && total > 0 ? (
        <div
          data-testid="pagination"
          className="flex shrink-0 items-center justify-between px-5 py-3"
          style={{
            borderTop: '1px solid rgba(255,255,255,0.06)',
            backgroundColor: 'var(--color-surface-container-low)',
          }}
        >
          <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
            {total} total entries
          </span>

          <div className="flex items-center gap-3">
            <button
              type="button"
              data-testid="prev-page-btn"
              className="flex cursor-pointer items-center gap-1 border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              disabled={page <= 1}
              style={{
                backgroundColor: 'transparent',
                color: 'var(--color-on-surface-variant)',
                borderColor: 'rgba(255,255,255,0.12)',
                borderRadius: '4px',
              }}
              onClick={prevPage}
            >
              <ChevronLeft size={14} />
              Previous
            </button>

            <span className="text-sm" style={{ color: 'var(--color-on-surface)' }}>
              Page {page} of {totalPages}
            </span>

            <button
              type="button"
              data-testid="next-page-btn"
              className="flex cursor-pointer items-center gap-1 border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              disabled={page >= totalPages}
              style={{
                backgroundColor: 'transparent',
                color: 'var(--color-on-surface-variant)',
                borderColor: 'rgba(255,255,255,0.12)',
                borderRadius: '4px',
              }}
              onClick={nextPage}
            >
              Next
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
