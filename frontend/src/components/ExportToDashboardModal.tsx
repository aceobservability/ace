import { useQuery } from '@tanstack/react-query'
import { ExternalLink, LayoutDashboard, Plus, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { createDashboard, listDashboards } from '@/api/dashboards'
import { createPanel, listPanels } from '@/api/panels'
import { useOrgStore } from '@/stores/orgStore'

type ExportToDashboardModalProps = {
  query: string
  signal: 'metrics' | 'logs' | 'traces'
  datasourceId: string
  onClose: () => void
}

export function ExportToDashboardModal({
  query,
  signal,
  datasourceId,
  onClose,
}: ExportToDashboardModalProps) {
  const navigate = useNavigate()
  const currentOrgId = useOrgStore(state => state.currentOrgId)
  const [selectedDashboardId, setSelectedDashboardId] = useState('')
  const [newDashboardName, setNewDashboardName] = useState('')
  const [panelTitle, setPanelTitle] = useState('Explore Query')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ dashboardId: string; title: string } | null>(null)

  const dashboardsQuery = useQuery({
    queryKey: ['dashboards', currentOrgId],
    queryFn: () => listDashboards(currentOrgId!),
    enabled: Boolean(currentOrgId),
  })

  const dashboards = dashboardsQuery.data ?? []

  const defaultPanelType = useMemo(() => {
    switch (signal) {
      case 'logs':
        return 'logs'
      case 'traces':
        return 'traces'
      default:
        return 'line'
    }
  }, [signal])

  const isNewDashboard = selectedDashboardId === '__new__'

  useEffect(() => {
    if (selectedDashboardId || dashboardsQuery.isLoading) return
    const first = dashboards[0]
    setSelectedDashboardId(first ? first.id : '__new__')
  }, [dashboards, dashboardsQuery.isLoading, selectedDashboardId])

  async function save() {
    if (!currentOrgId) return

    setSaving(true)
    setError(null)

    try {
      let dashboardId = selectedDashboardId
      let dashboardTitle = ''

      if (isNewDashboard) {
        const name = newDashboardName.trim() || 'Untitled Dashboard'
        const dashboard = await createDashboard(currentOrgId, { title: name })
        dashboardId = dashboard.id
        dashboardTitle = name
      } else {
        dashboardTitle = dashboards.find(d => d.id === dashboardId)?.title || ''
      }

      const queryObj: Record<string, unknown> = { expr: query }
      if (datasourceId) {
        queryObj.datasource_id = datasourceId
      }

      let nextY = 0
      if (!isNewDashboard) {
        try {
          const existing = await listPanels(dashboardId)
          for (const panel of existing) {
            const bottom = (panel.grid_pos?.y ?? 0) + (panel.grid_pos?.h ?? 0)
            if (bottom > nextY) nextY = bottom
          }
        } catch {
          // Default to y=0 if panels cannot be fetched.
        }
      }

      await createPanel(dashboardId, {
        title: panelTitle.trim() || 'Explore Query',
        type: defaultPanelType,
        grid_pos: { x: 0, y: nextY, w: 12, h: 8 },
        query: queryObj,
      })

      setSuccess({ dashboardId, title: dashboardTitle })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save panel')
    } finally {
      setSaving(false)
    }
  }

  function goToDashboard() {
    if (!success) return
    navigate(`/app/dashboards/${success.dashboardId}`)
    onClose()
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0" style={{ backgroundColor: 'var(--overlay-scrim)' }} />

      <div
        className="relative mx-4 w-full max-w-[480px] animate-fade-in rounded-xl"
        style={{
          backgroundColor: 'var(--color-surface-bright)',
          boxShadow: 'var(--shadow-xl)',
          border: '1px solid var(--color-outline-variant)',
        }}
        data-testid="export-dashboard-modal"
        onClick={event => event.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--color-outline-variant)' }}
        >
          <div className="flex items-center gap-2">
            <LayoutDashboard size={18} style={{ color: 'var(--color-primary)' }} />
            <h2
              className="m-0 font-display text-lg font-semibold"
              style={{ color: 'var(--color-on-surface)' }}
            >
              Add to Dashboard
            </h2>
          </div>
          <button
            type="button"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded border-none bg-transparent transition"
            style={{ color: 'var(--color-outline)' }}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        {success ? (
          <div className="px-6 py-8 text-center">
            <div className="mb-4 text-sm" style={{ color: 'var(--color-secondary)' }}>
              Panel added to <strong>{success.title}</strong>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-sm px-4 py-2.5 text-sm font-semibold transition"
              style={{
                background:
                  'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
                color: '#fff',
                border: 'none',
              }}
              onClick={goToDashboard}
              data-testid="export-go-to-dashboard"
            >
              <ExternalLink size={14} />
              Open Dashboard
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-5 px-6 py-5">
              <div className="flex flex-col gap-2">
                <label
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: 'var(--color-outline)' }}
                >
                  Dashboard
                </label>
                <select
                  value={selectedDashboardId}
                  onChange={event => setSelectedDashboardId(event.target.value)}
                  className="w-full cursor-pointer rounded-sm px-3 py-2.5 text-sm"
                  style={{
                    backgroundColor: 'var(--color-surface-container-high)',
                    color: 'var(--color-on-surface)',
                    border: '1px solid var(--color-outline-variant)',
                  }}
                  disabled={dashboardsQuery.isLoading}
                  data-testid="export-dashboard-select"
                >
                  {dashboards.map(dashboard => (
                    <option key={dashboard.id} value={dashboard.id}>
                      {dashboard.title}
                    </option>
                  ))}
                  <option value="__new__">+ New Dashboard</option>
                </select>
              </div>

              {isNewDashboard ? (
                <div className="flex flex-col gap-2">
                  <label
                    className="text-xs font-semibold uppercase tracking-wide"
                    style={{ color: 'var(--color-outline)' }}
                  >
                    Dashboard Name
                  </label>
                  <input
                    value={newDashboardName}
                    onChange={event => setNewDashboardName(event.target.value)}
                    type="text"
                    placeholder="Untitled Dashboard"
                    className="w-full rounded-sm px-3 py-2.5 text-sm"
                    style={{
                      backgroundColor: 'var(--color-surface-container-high)',
                      color: 'var(--color-on-surface)',
                      border: '1px solid var(--color-outline-variant)',
                    }}
                    data-testid="export-new-dashboard-name"
                  />
                </div>
              ) : null}

              <div className="flex flex-col gap-2">
                <label
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: 'var(--color-outline)' }}
                >
                  Panel Title
                </label>
                <input
                  value={panelTitle}
                  onChange={event => setPanelTitle(event.target.value)}
                  type="text"
                  placeholder="Explore Query"
                  className="w-full rounded-sm px-3 py-2.5 text-sm"
                  style={{
                    backgroundColor: 'var(--color-surface-container-high)',
                    color: 'var(--color-on-surface)',
                    border: '1px solid var(--color-outline-variant)',
                  }}
                  data-testid="export-panel-title"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: 'var(--color-outline)' }}
                >
                  Query
                </label>
                <code
                  className="block truncate rounded-sm px-3 py-2 font-mono text-xs"
                  style={{
                    backgroundColor: 'var(--color-surface)',
                    color: 'var(--color-on-surface-variant)',
                    border: '1px solid var(--color-outline-variant)',
                  }}
                >
                  {query}
                </code>
              </div>

              {error ? (
                <div className="text-sm" style={{ color: 'var(--color-error)' }}>
                  {error}
                </div>
              ) : null}
            </div>

            <div
              className="flex items-center justify-end gap-3 px-6 py-4"
              style={{ borderTop: '1px solid var(--color-outline-variant)' }}
            >
              <button
                type="button"
                className="cursor-pointer rounded-sm border-none bg-transparent px-4 py-2 text-sm font-medium transition"
                style={{ color: 'var(--color-outline)' }}
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-sm px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  background:
                    'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
                  color: '#fff',
                  border: 'none',
                }}
                disabled={saving || !selectedDashboardId}
                onClick={save}
                data-testid="export-save-btn"
              >
                {saving ? 'Saving...' : 'Save Panel'}
                {!saving ? <Plus size={14} /> : null}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}