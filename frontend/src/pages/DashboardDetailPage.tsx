import { AlertCircle, ArrowLeft, LayoutGrid, Plus, Settings } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getDashboard } from '@/api/dashboards'
import { deletePanel, listPanels } from '@/api/panels'
import { DashboardGrid } from '@/components/DashboardGrid'
import { PanelEditModal } from '@/components/PanelEditModal'
import { TimeRangePicker } from '@/components/TimeRangePicker'
import { VariableBar } from '@/components/VariableBar'
import { CrosshairSyncProvider } from '@/contexts/CrosshairSyncContext'
import { VariablesProvider, useDashboardVariables } from '@/contexts/VariablesContext'
import { useTimeRange } from '@/hooks/useTimeRange'
import { useFavoritesStore } from '@/stores/favoritesStore'
import type { Dashboard } from '@/types/dashboard'
import type { Panel } from '@/types/panel'

function dashboardLoadErrorMessage(cause: unknown): string {
  if (cause instanceof Error && cause.message === 'Not a member of this organization') {
    return 'You do not have permission to view this dashboard'
  }
  return 'Dashboard not found'
}

function DashboardDetailContent({ dashboardId }: { dashboardId: string }) {
  const navigate = useNavigate()
  const addRecent = useFavoritesStore(state => state.addRecent)
  const { setPreset, setRefreshInterval } = useTimeRange()
  const { variables, hasVariables, fetchVariables, setVariableValue } = useDashboardVariables()

  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [panels, setPanels] = useState<Panel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showPanelModal, setShowPanelModal] = useState(false)
  const [editingPanel, setEditingPanel] = useState<Panel | null>(null)
  const [deletingPanel, setDeletingPanel] = useState<Panel | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    setPreset('1h')
    setRefreshInterval('off')

    let cancelled = false

    async function loadData() {
      setLoading(true)
      setError(null)
      try {
        const dashboardResult = await getDashboard(dashboardId)
        if (cancelled) return

        setDashboard(dashboardResult)
        const [panelResult] = await Promise.all([listPanels(dashboardId), fetchVariables()])
        if (cancelled) return

        setPanels(panelResult)
        addRecent({
          id: dashboardId,
          title: dashboardResult.title,
          visitedAt: Date.now(),
        })
      } catch (cause) {
        if (cancelled) return
        setDashboard(null)
        setPanels([])
        setError(dashboardLoadErrorMessage(cause))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadData()
    return () => {
      cancelled = true
    }
  }, [addRecent, dashboardId, fetchVariables, setPreset, setRefreshInterval])

  function openAddPanel() {
    setEditingPanel(null)
    setShowPanelModal(true)
  }

  function openEditPanel(panel: Panel) {
    setEditingPanel(panel)
    setShowPanelModal(true)
  }

  function closePanelModal() {
    setShowPanelModal(false)
    setEditingPanel(null)
  }

  function handlePanelSaved(saved: Panel) {
    setPanels(current => {
      const existingIndex = current.findIndex(panel => panel.id === saved.id)
      if (existingIndex === -1) {
        return [...current, saved]
      }
      return current.map(panel => (panel.id === saved.id ? saved : panel))
    })
    closePanelModal()
  }

  function confirmDeletePanel(panel: Panel) {
    setDeletingPanel(panel)
  }

  function cancelDelete() {
    setDeletingPanel(null)
  }

  async function handleDeletePanel() {
    if (!deletingPanel) return
    setDeleting(true)
    try {
      await deletePanel(deletingPanel.id)
      setPanels(current => current.filter(panel => panel.id !== deletingPanel.id))
      setDeletingPanel(null)
    } catch {
      // Keep dialog open on failure; user can cancel
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-5">
      <header
        className="relative z-20 mb-4 flex flex-col gap-3 rounded-lg px-6 py-3 sm:flex-row sm:items-center sm:justify-between"
        style={{ backgroundColor: 'var(--color-surface-container-low)' }}
      >
        <div className="flex items-center gap-4">
          <button
            type="button"
            className="flex h-[38px] w-[38px] items-center justify-center rounded-lg transition hover:opacity-80"
            style={{
              backgroundColor: 'var(--color-surface-container-high)',
              color: 'var(--color-on-surface-variant)',
            }}
            data-testid="dashboard-back-btn"
            title="Back to Dashboards"
            onClick={() => navigate('/app/dashboards')}
          >
            <ArrowLeft size={20} />
          </button>
          {dashboard && (
            <div>
              <h1
                className="mb-0.5 font-display text-lg font-semibold tracking-wide"
                style={{ color: 'var(--color-on-surface)' }}
                data-testid="dashboard-title"
              >
                {dashboard.title}
              </h1>
              {dashboard.description && (
                <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
                  {dashboard.description}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <TimeRangePicker />
          <div
            className="hidden h-6 w-px sm:block"
            style={{ backgroundColor: 'var(--color-outline-variant)' }}
          />
          <div className="flex items-center gap-2">
            {dashboard && (
              <Link
                to={`/app/dashboards/${dashboardId}/settings/general`}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition hover:opacity-80"
                style={{
                  backgroundColor: 'var(--color-surface-container-high)',
                  color: 'var(--color-on-surface-variant)',
                }}
                data-testid="dashboard-settings-button"
              >
                <Settings size={16} />
                <span>Settings</span>
              </Link>
            )}
            {dashboard && !loading && !error ? (
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  background:
                    'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
                }}
                data-testid="dashboard-add-panel-btn"
                onClick={openAddPanel}
                disabled={loading}
              >
                <Plus size={18} />
                <span>Add Panel</span>
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {hasVariables && !loading && !error && (
        <VariableBar
          variables={variables}
          onValueChange={({ name, value }) => setVariableValue(name, value)}
        />
      )}

      {loading ? (
        <div
          className="flex min-h-[320px] flex-col items-center justify-center rounded-lg py-20 text-center"
          style={{
            backgroundColor: 'var(--color-surface-container-low)',
            color: 'var(--color-on-surface-variant)',
          }}
          data-testid="dashboard-loading"
        >
          <div
            className="mb-4 h-10 w-10 animate-spin rounded-full border-3"
            style={{
              borderColor: 'var(--color-outline-variant)',
              borderTopColor: 'var(--color-primary)',
            }}
          />
          <p>Loading dashboard...</p>
        </div>
      ) : error ? (
        <div
          className="flex min-h-[320px] flex-col items-center justify-center rounded-lg p-4 text-center text-sm"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
            color: 'var(--color-error)',
          }}
          data-testid="dashboard-error"
        >
          <AlertCircle size={48} />
          <p className="mt-4 mb-4">{error}</p>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition hover:opacity-80"
            style={{
              backgroundColor: 'var(--color-surface-container-high)',
              color: 'var(--color-on-surface-variant)',
            }}
            onClick={() => navigate('/app/dashboards')}
          >
            Back to Dashboards
          </button>
        </div>
      ) : panels.length === 0 ? (
        <div
          className="flex min-h-[320px] flex-col items-center justify-center rounded-lg px-8 py-16 text-center"
          style={{
            backgroundColor: 'var(--color-surface-container-low)',
            color: 'var(--color-on-surface-variant)',
          }}
          data-testid="dashboard-empty"
        >
          <div
            className="mb-4 flex h-[120px] w-[120px] items-center justify-center rounded-lg"
            style={{
              backgroundColor: 'var(--color-surface-container-high)',
              color: 'var(--color-outline)',
            }}
          >
            <LayoutGrid size={64} />
          </div>
          <h2 className="mt-4 mb-2 font-display" style={{ color: 'var(--color-on-surface)' }}>
            No panels yet
          </h2>
          <p className="mb-6">Add your first panel to start visualizing data</p>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold text-white transition hover:opacity-90"
            style={{
              background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
            }}
            data-testid="dashboard-empty-add-panel-btn"
            onClick={openAddPanel}
          >
            <Plus size={18} />
            <span>Add Panel</span>
          </button>
        </div>
      ) : (
        <DashboardGrid
          panels={panels}
          onPanelsChange={setPanels}
          onEditPanel={openEditPanel}
          onDeletePanel={confirmDeletePanel}
        />
      )}

      {showPanelModal ? (
        <PanelEditModal
          dashboardId={dashboardId}
          panel={editingPanel ?? undefined}
          onClose={closePanelModal}
          onSaved={handlePanelSaved}
        />
      ) : null}

      {deletingPanel ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          data-testid="delete-panel-modal"
        >
          <button
            type="button"
            aria-label="Close delete dialog"
            className="absolute inset-0 cursor-default border-none p-0"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)' }}
            onClick={cancelDelete}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-[400px] rounded-lg p-8 text-center shadow-lg"
            style={{
              backgroundColor: 'var(--color-surface-bright)',
              backdropFilter: 'blur(20px)',
            }}
          >
            <h3
              className="mb-2 font-display text-lg font-semibold"
              style={{ color: 'var(--color-on-surface)' }}
            >
              Delete panel?
            </h3>
            <p className="mb-6 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
              This will permanently remove &ldquo;{deletingPanel.title}&rdquo; from the dashboard.
            </p>
            <div className="flex justify-center gap-3">
              <button
                type="button"
                className="cursor-pointer rounded-lg px-5 py-2.5 text-sm font-semibold transition hover:opacity-80 disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--color-surface-container-high)',
                  color: 'var(--color-on-surface)',
                  border: '1px solid var(--color-outline-variant)',
                }}
                data-testid="delete-panel-cancel-btn"
                onClick={cancelDelete}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="cursor-pointer rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-error)' }}
                data-testid="delete-panel-confirm-btn"
                onClick={() => void handleDeletePanel()}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function DashboardDetailPage() {
  const { id } = useParams<{ id: string }>()
  const dashboardId = id ?? ''

  if (!dashboardId) {
    return null
  }

  return (
    <VariablesProvider dashboardId={dashboardId}>
      <CrosshairSyncProvider dashboardId={dashboardId}>
        <DashboardDetailContent dashboardId={dashboardId} />
      </CrosshairSyncProvider>
    </VariablesProvider>
  )
}
