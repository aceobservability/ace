import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, LayoutGrid, Star } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { listDashboards, updateDashboard } from '@/api/dashboards'
import { listFolders } from '@/api/folders'
import { CreateDashboardModal } from '@/components/CreateDashboardModal'
import { EmptyState } from '@/components/EmptyState'
import { useOrganization } from '@/hooks/useOrganization'
import { useFavoritesStore } from '@/stores/favoritesStore'
import type { Dashboard } from '@/types/dashboard'
import type { Folder } from '@/types/folder'

type DashboardListProps = {
  searchQuery?: string
}

type CreateMode = 'create' | 'import' | 'grafana'

function normalizeCreateMode(rawMode: string | null): CreateMode | null {
  if (rawMode === 'create' || rawMode === 'import' || rawMode === 'grafana') {
    return rawMode
  }
  return null
}

export function DashboardList({ searchQuery = '' }: DashboardListProps) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const { currentOrgId, currentOrg } = useOrganization()
  const toggleFavorite = useFavoritesStore(state => state.toggleFavorite)
  const isFavorite = useFavoritesStore(state => state.isFavorite)

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createModalInitialMode, setCreateModalInitialMode] = useState<CreateMode>('create')
  const [draggingDashboardId, setDraggingDashboardId] = useState<string | null>(null)
  const [movingDashboardId, setMovingDashboardId] = useState<string | null>(null)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [moveError, setMoveError] = useState<string | null>(null)
  const [optimisticFolderIds, setOptimisticFolderIds] = useState<Record<string, string | null>>({})

  const canManageDashboards =
    currentOrg?.role === 'admin' || currentOrg?.role === 'editor'

  const dashboardsQuery = useQuery({
    queryKey: ['dashboards', currentOrgId],
    queryFn: () => listDashboards(currentOrgId!),
    enabled: Boolean(currentOrgId),
  })

  const foldersQuery = useQuery({
    queryKey: ['folders', currentOrgId],
    queryFn: () => listFolders(currentOrgId!),
    enabled: Boolean(currentOrgId),
  })

  const dashboards = dashboardsQuery.data ?? []
  const folders = foldersQuery.data ?? []
  const loading = dashboardsQuery.isLoading || foldersQuery.isLoading
  const error =
    dashboardsQuery.error instanceof Error
      ? dashboardsQuery.error.message
      : foldersQuery.error instanceof Error
        ? foldersQuery.error.message
        : null

  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const hasSearchQuery = normalizedSearchQuery.length > 0

  const folderById = useMemo(() => {
    const map = new Map<string, Folder>()
    for (const folder of folders) {
      map.set(folder.id, folder)
    }
    return map
  }, [folders])

  const dashboardsWithOptimistic = useMemo(
    () =>
      dashboards.map(dashboard => ({
        ...dashboard,
        folder_id:
          dashboard.id in optimisticFolderIds
            ? optimisticFolderIds[dashboard.id]
            : dashboard.folder_id,
      })),
    [dashboards, optimisticFolderIds],
  )

  const isCompletelyEmpty = dashboards.length === 0 && folders.length === 0

  function getFolderName(dashboard: Dashboard): string | null {
    if (!dashboard.folder_id) return null
    return folderById.get(dashboard.folder_id)?.name ?? null
  }

  const filteredDashboards = useMemo(() => {
    let result = dashboardsWithOptimistic.filter(dashboard => {
      if (!hasSearchQuery) return true
      return [dashboard.title, dashboard.description ?? '']
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearchQuery)
    })

    if (selectedFolderId !== null) {
      if (selectedFolderId === '__unfiled__') {
        const folderIds = new Set(folders.map(folder => folder.id))
        result = result.filter(
          dashboard => !dashboard.folder_id || !folderIds.has(dashboard.folder_id),
        )
      } else {
        result = result.filter(dashboard => dashboard.folder_id === selectedFolderId)
      }
    }

    return result.sort((a, b) => a.title.localeCompare(b.title))
  }, [dashboardsWithOptimistic, folders, selectedFolderId, normalizedSearchQuery, hasSearchQuery])

  useEffect(() => {
    const modeFromQuery = normalizeCreateMode(searchParams.get('newDashboardMode'))
    if (!modeFromQuery) return

    setCreateModalInitialMode(modeFromQuery)
    setShowCreateModal(true)

    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('newDashboardMode')
    setSearchParams(nextParams, { replace: true })
  }, [searchParams, setSearchParams])

  function openCreateModalWithMode(initialMode: CreateMode) {
    setCreateModalInitialMode(initialMode)
    setShowCreateModal(true)
  }

  function closeCreateModal() {
    setShowCreateModal(false)
  }

  function onDashboardCreated() {
    closeCreateModal()
    void queryClient.invalidateQueries({ queryKey: ['dashboards', currentOrgId] })
  }

  function openDashboard(dashboard: Dashboard) {
    navigate(`/app/dashboards/${dashboard.id}`)
  }

  function selectFolder(folderId: string | null) {
    setSelectedFolderId(current => (current === folderId ? null : folderId))
  }

  function onDashboardDragStart(dashboard: Dashboard) {
    if (!canManageDashboards) return
    setMoveError(null)
    setDraggingDashboardId(dashboard.id)
  }

  function onDashboardDragEnd() {
    setDraggingDashboardId(null)
  }

  async function onFolderDrop(folderId: string | null) {
    if (!canManageDashboards || !draggingDashboardId || movingDashboardId) return

    const dashboardId = draggingDashboardId
    const dashboard = dashboardsWithOptimistic.find(item => item.id === dashboardId)
    if (!dashboard) {
      onDashboardDragEnd()
      return
    }

    const currentFolderId = dashboard.folder_id ?? null
    if (currentFolderId === folderId) {
      onDashboardDragEnd()
      return
    }

    setMoveError(null)
    setMovingDashboardId(dashboardId)
    setOptimisticFolderIds(current => ({ ...current, [dashboardId]: folderId }))

    try {
      await updateDashboard(dashboardId, { folder_id: folderId })
      await queryClient.invalidateQueries({ queryKey: ['dashboards', currentOrgId] })
      setOptimisticFolderIds(current => {
        const next = { ...current }
        delete next[dashboardId]
        return next
      })
    } catch (e) {
      setOptimisticFolderIds(current => {
        const next = { ...current }
        delete next[dashboardId]
        return next
      })
      setMoveError(e instanceof Error ? e.message : 'Failed to move dashboard')
    } finally {
      setMovingDashboardId(null)
      onDashboardDragEnd()
    }
  }

  function refetch() {
    void dashboardsQuery.refetch()
    void foldersQuery.refetch()
  }

  if (!currentOrgId) {
    return (
      <div>
        <EmptyState
          icon={LayoutGrid}
          title="No dashboards yet"
          description="Create your first dashboard to start monitoring your metrics."
        />
        <div className="-mt-8 flex items-center justify-center gap-3">
          <button
            type="button"
            className="inline-flex cursor-pointer items-center rounded-lg border px-5 py-2.5 text-sm font-medium transition-colors hover:opacity-80"
            style={{
              borderColor: 'var(--color-outline-variant)',
              color: 'var(--color-on-surface-variant)',
            }}
            onClick={() => openCreateModalWithMode('create')}
          >
            Create Dashboard
          </button>
          <button
            type="button"
            className="inline-flex cursor-pointer items-center rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            style={{
              background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
            }}
            onClick={() => navigate('/app/dashboards/new/ai')}
          >
            Generate with AI
          </button>
        </div>
        {showCreateModal ? (
          <CreateDashboardModal
            initialMode={createModalInitialMode}
            onClose={closeCreateModal}
            onCreated={onDashboardCreated}
          />
        ) : null}
      </div>
    )
  }

  if (loading) {
    return (
      <div
        className="flex min-h-[320px] flex-col items-center justify-center rounded-lg py-16 text-center"
        style={{ color: 'var(--color-on-surface-variant)' }}
      >
        <div
          className="mb-4 h-10 w-10 animate-spin rounded-full border-3"
          style={{
            borderColor: 'var(--color-outline-variant)',
            borderTopColor: 'var(--color-primary)',
          }}
        />
        <p>Loading dashboards...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div
        className="flex min-h-[320px] flex-col items-center justify-center rounded-lg py-16 text-center"
        style={{ color: 'var(--color-error)' }}
      >
        <AlertCircle size={48} />
        <p className="mb-5 mt-4">{error}</p>
        <button
          type="button"
          className="cursor-pointer rounded-lg border px-5 py-2.5 text-sm font-medium transition-colors"
          style={{
            borderColor: 'var(--color-outline-variant)',
            color: 'var(--color-on-surface)',
            backgroundColor: 'var(--color-surface-container-low)',
          }}
          onClick={refetch}
        >
          Try Again
        </button>
      </div>
    )
  }

  if (isCompletelyEmpty) {
    return (
      <div>
        <EmptyState
          icon={LayoutGrid}
          title="No dashboards yet"
          description="Create your first dashboard to start monitoring your metrics."
        />
        <div className="-mt-8 flex items-center justify-center gap-3">
          <button
            type="button"
            className="inline-flex cursor-pointer items-center rounded-lg border px-5 py-2.5 text-sm font-medium transition-colors hover:opacity-80"
            style={{
              borderColor: 'var(--color-outline-variant)',
              color: 'var(--color-on-surface-variant)',
            }}
            onClick={() => openCreateModalWithMode('create')}
          >
            Create Dashboard
          </button>
          <button
            type="button"
            className="inline-flex cursor-pointer items-center rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            style={{
              background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
            }}
            onClick={() => navigate('/app/dashboards/new/ai')}
          >
            Generate with AI
          </button>
        </div>
        {showCreateModal ? (
          <CreateDashboardModal
            initialMode={createModalInitialMode}
            onClose={closeCreateModal}
            onCreated={onDashboardCreated}
          />
        ) : null}
      </div>
    )
  }

  return (
    <div>
      {moveError ? (
        <p
          className="mb-4 rounded-lg px-4 py-3 text-sm"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
            color: 'var(--color-error)',
            border: '1px solid color-mix(in srgb, var(--color-error) 30%, transparent)',
          }}
        >
          {moveError}
        </p>
      ) : null}

      {folders.length > 0 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {folders.map(folder => (
            <button
              key={folder.id}
              type="button"
              data-testid={`folder-chip-${folder.id}`}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                backgroundColor:
                  selectedFolderId === folder.id
                    ? 'var(--color-primary-container)'
                    : 'var(--color-surface-container)',
                color:
                  selectedFolderId === folder.id
                    ? 'var(--color-on-primary-container)'
                    : 'var(--color-on-surface-variant)',
                border: `1px solid ${
                  selectedFolderId === folder.id
                    ? 'var(--color-primary)'
                    : 'var(--color-outline-variant)'
                }`,
              }}
              onClick={() => selectFolder(folder.id)}
              onDragOver={event => {
                event.preventDefault()
                if (canManageDashboards && draggingDashboardId) {
                  event.dataTransfer.dropEffect = 'move'
                }
              }}
              onDrop={event => {
                event.preventDefault()
                void onFolderDrop(folder.id)
              }}
            >
              {folder.name}
            </button>
          ))}
          <button
            type="button"
            data-testid="folder-chip-unfiled"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              backgroundColor:
                selectedFolderId === '__unfiled__'
                  ? 'var(--color-primary-container)'
                  : 'var(--color-surface-container)',
              color:
                selectedFolderId === '__unfiled__'
                  ? 'var(--color-on-primary-container)'
                  : 'var(--color-on-surface-variant)',
              border: `1px solid ${
                selectedFolderId === '__unfiled__'
                  ? 'var(--color-primary)'
                  : 'var(--color-outline-variant)'
              }`,
            }}
            onClick={() => selectFolder('__unfiled__')}
            onDragOver={event => {
              event.preventDefault()
              if (canManageDashboards && draggingDashboardId) {
                event.dataTransfer.dropEffect = 'move'
              }
            }}
            onDrop={event => {
              event.preventDefault()
              void onFolderDrop(null)
            }}
          >
            Unfiled
          </button>
        </div>
      ) : null}

      {folders.map(folder => (
        // biome-ignore lint/a11y/noStaticElementInteractions: hidden drag-and-drop target
        <div
          key={`drop-${folder.id}`}
          data-testid={`folder-drop-${folder.id}`}
          className="hidden"
          onDragOver={event => event.preventDefault()}
          onDrop={event => {
            event.preventDefault()
            void onFolderDrop(folder.id)
          }}
        />
      ))}

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
        {filteredDashboards.map(dashboard => (
          // biome-ignore lint/a11y/useSemanticElements: card is draggable; native button breaks HTML5 drag
          <div
            key={dashboard.id}
            data-testid={`dashboard-card-${dashboard.id}`}
            role="button"
            tabIndex={0}
            className="group relative cursor-pointer rounded-lg p-4 transition-colors"
            style={{ backgroundColor: 'var(--color-surface-container-low)' }}
            draggable={canManageDashboards}
            onDragStart={() => onDashboardDragStart(dashboard)}
            onDragEnd={onDashboardDragEnd}
            onClick={() => openDashboard(dashboard)}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                openDashboard(dashboard)
              }
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3
                  className="truncate font-display text-sm font-semibold leading-snug"
                  style={{ color: 'var(--color-on-surface)' }}
                >
                  {dashboard.title}
                </h3>
                {getFolderName(dashboard) ? (
                  <p className="mt-1 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                    {getFolderName(dashboard)}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                data-testid={`favorite-btn-${dashboard.id}`}
                className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors"
                style={{
                  color: isFavorite(dashboard.id)
                    ? 'var(--color-primary)'
                    : 'var(--color-outline)',
                }}
                onClick={event => {
                  event.stopPropagation()
                  toggleFavorite({
                    id: dashboard.id,
                    title: dashboard.title,
                    type: 'dashboard',
                  })
                }}
              >
                <Star size={16} fill={isFavorite(dashboard.id) ? 'currentColor' : 'none'} />
              </button>
            </div>
            {dashboard.description ? (
              <p
                className="mt-2 line-clamp-2 text-xs leading-relaxed"
                style={{ color: 'var(--color-on-surface-variant)' }}
              >
                {dashboard.description}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      {filteredDashboards.length === 0 ? (
        <p
          className="mt-6 text-center text-sm"
          style={{ color: 'var(--color-on-surface-variant)' }}
        >
          No dashboards match your search.
        </p>
      ) : null}

      {showCreateModal ? (
        <CreateDashboardModal
          initialMode={createModalInitialMode}
          onClose={closeCreateModal}
          onCreated={onDashboardCreated}
        />
      ) : null}
    </div>
  )
}