<script setup lang="ts">
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder as FolderIcon,
  LayoutDashboard,
  Pencil,
  Plus,
  Search,
  Shield,
  Trash2,
} from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { deleteDashboard, listDashboards, updateDashboard } from '../api/dashboards'
import { createFolder, listFolders } from '../api/folders'
import { useOrganization } from '../composables/useOrganization'
import type { Dashboard } from '../types/dashboard'
import type { Folder } from '../types/folder'
import CreateDashboardModal from './CreateDashboardModal.vue'
import EditDashboardModal from './EditDashboardModal.vue'
import FolderPermissionsModal from './FolderPermissionsModal.vue'

const router = useRouter()
const route = useRoute()
const { currentOrgId, currentOrg } = useOrganization()

const dashboards = ref<Dashboard[]>([])
const folders = ref<Folder[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const showCreateModal = ref(false)
const createModalInitialMode = ref<'create' | 'import' | 'grafana'>('create')
const showEditModal = ref(false)
const editingDashboard = ref<Dashboard | null>(null)
const showDeleteConfirm = ref(false)
const deletingDashboard = ref<Dashboard | null>(null)
const showFolderPermissionsModal = ref(false)
const selectedFolderForPermissions = ref<Folder | null>(null)
const folderPermissionsMessage = ref<string | null>(null)
const creatingFolder = ref(false)
const folderName = ref('')
const folderError = ref<string | null>(null)
const moveError = ref<string | null>(null)
const draggingDashboardId = ref<string | null>(null)
const dropTargetSectionId = ref<string | null>(null)
const movingDashboardId = ref<string | null>(null)
const searchQuery = ref('')
const expandedFolderIds = ref<string[]>([])
const selectedExplorerNode = ref<'all' | `folder:${string}`>('all')
const selectedTreeDashboardId = ref<string | null>(null)
const hoveredDashboardId = ref<string | null>(null)
const showInlineFolderForm = ref(false)
const inlineFolderParentId = ref<string | null>(null)

interface DashboardSection {
  id: string
  name: string
  dashboards: Dashboard[]
  folder: Folder
}

interface FolderTreeRow {
  folder: Folder
  depth: number
  hasChildren: boolean
  isExpanded: boolean
  dashboards: Dashboard[]
}

interface Breadcrumb {
  id: string
  label: string
  type: 'all' | 'folder'
}

const isOrgAdmin = computed(() => currentOrg.value?.role === 'admin')
const canCreateFolder = computed(
  () => currentOrg.value?.role === 'admin' || currentOrg.value?.role === 'editor',
)
const canManageDashboards = computed(
  () => currentOrg.value?.role === 'admin' || currentOrg.value?.role === 'editor',
)
const normalizedSearchQuery = computed(() => searchQuery.value.trim().toLowerCase())
const hasSearchQuery = computed(() => normalizedSearchQuery.value.length > 0)

function dashboardMatchesSearch(dashboard: Dashboard): boolean {
  if (!hasSearchQuery.value) {
    return true
  }

  return [dashboard.title, dashboard.description ?? '']
    .join(' ')
    .toLowerCase()
    .includes(normalizedSearchQuery.value)
}

const folderById = computed(() => {
  const map = new Map<string, Folder>()
  for (const folder of folders.value) {
    map.set(folder.id, folder)
  }
  return map
})

const dashboardsByFolder = computed(() => {
  const map = new Map<string | null, Dashboard[]>()
  for (const dashboard of dashboards.value) {
    const folderId = dashboard.folder_id ?? null
    const list = map.get(folderId) ?? []
    list.push(dashboard)
    map.set(folderId, list)
  }
  return map
})

const folderChildrenMap = computed(() => {
  const map = new Map<string | null, Folder[]>()
  for (const folder of folders.value) {
    const parentId =
      folder.parent_id && folderById.value.has(folder.parent_id) ? folder.parent_id : null
    const children = map.get(parentId) ?? []
    children.push(folder)
    map.set(parentId, children)
  }

  for (const [key, children] of map.entries()) {
    map.set(
      key,
      [...children].sort((a, b) => a.name.localeCompare(b.name)),
    )
  }

  return map
})

const rootFolders = computed(() => folderChildrenMap.value.get(null) ?? [])

const folderDashboardCountMap = computed(() => {
  const counts = new Map<string, number>()

  function countFolderTree(folderId: string): number {
    const cached = counts.get(folderId)
    if (cached !== undefined) {
      return cached
    }

    let total = dashboardsByFolder.value.get(folderId)?.length ?? 0
    const children = folderChildrenMap.value.get(folderId) ?? []
    for (const child of children) {
      total += countFolderTree(child.id)
    }

    counts.set(folderId, total)
    return total
  }

  for (const folder of folders.value) {
    countFolderTree(folder.id)
  }

  return counts
})

const selectedFolderId = computed(() => {
  if (!selectedExplorerNode.value.startsWith('folder:')) {
    return null
  }
  return selectedExplorerNode.value.slice('folder:'.length)
})

const selectedFolder = computed(() => {
  if (!selectedFolderId.value) {
    return null
  }
  return folderById.value.get(selectedFolderId.value) ?? null
})

const unfiledDashboards = computed(() => {
  const folderIds = new Set(folders.value.map((folder) => folder.id))
  return dashboards.value.filter(
    (dashboard) => !dashboard.folder_id || !folderIds.has(dashboard.folder_id),
  )
})

const groupedDashboardSections = computed<DashboardSection[]>(() => {
  return folders.value
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((folder) => ({
      id: folder.id,
      name: folder.name,
      dashboards: dashboards.value.filter((dashboard) => dashboard.folder_id === folder.id),
      folder,
    }))
})

const isCompletelyEmpty = computed(
  () => dashboards.value.length === 0 && folders.value.length === 0,
)
const hasNoFolders = computed(() => folders.value.length === 0)

const sectionScopeFolderIds = computed(() => {
  if (!selectedFolderId.value) {
    return new Set<string>()
  }

  const scoped = new Set<string>([selectedFolderId.value])
  const children = folderChildrenMap.value.get(selectedFolderId.value) ?? []
  for (const child of children) {
    scoped.add(child.id)
  }

  return scoped
})

const selectedFolderChildren = computed(() => {
  if (!selectedFolderId.value) {
    return []
  }

  return (folderChildrenMap.value.get(selectedFolderId.value) ?? []).filter((folder) =>
    folderVisibilityForSearch.value.get(folder.id),
  )
})

const folderVisibilityForSearch = computed(() => {
  const visibility = new Map<string, boolean>()

  if (!hasSearchQuery.value) {
    for (const folder of folders.value) {
      visibility.set(folder.id, true)
    }
    return visibility
  }

  function folderMatches(folder: Folder): boolean {
    return folder.name.toLowerCase().includes(normalizedSearchQuery.value)
  }

  function evaluate(folder: Folder): boolean {
    const ownDashboards = dashboardsByFolder.value.get(folder.id) ?? []
    const ownDashboardMatch = ownDashboards.some(dashboardMatchesSearch)
    const childFolders = folderChildrenMap.value.get(folder.id) ?? []
    const childMatch = childFolders.some(evaluate)
    const visible = folderMatches(folder) || ownDashboardMatch || childMatch
    visibility.set(folder.id, visible)
    return visible
  }

  for (const folder of rootFolders.value) {
    evaluate(folder)
  }

  return visibility
})

const treeDashboardsByFolder = computed(() => {
  const map = new Map<string, Dashboard[]>()
  for (const folder of folders.value) {
    const dashboardsInFolder = (dashboardsByFolder.value.get(folder.id) ?? [])
      .filter(dashboardMatchesSearch)
      .sort((a, b) => a.title.localeCompare(b.title))
    map.set(folder.id, dashboardsInFolder)
  }
  return map
})

const unfiledTreeDashboards = computed(() =>
  unfiledDashboards.value
    .filter(dashboardMatchesSearch)
    .sort((a, b) => a.title.localeCompare(b.title)),
)

const rootDashboardsForMain = computed(() => {
  if (selectedExplorerNode.value !== 'all') {
    return []
  }

  return unfiledTreeDashboards.value
})

const explorerTreeRows = computed<FolderTreeRow[]>(() => {
  const expanded = new Set(expandedFolderIds.value)
  const rows: FolderTreeRow[] = []

  function walk(parentId: string | null, depth: number) {
    const children = folderChildrenMap.value.get(parentId) ?? []
    for (const folder of children) {
      if (!folderVisibilityForSearch.value.get(folder.id)) {
        continue
      }

      const visibleChildren = (folderChildrenMap.value.get(folder.id) ?? []).filter((child) =>
        folderVisibilityForSearch.value.get(child.id),
      )
      const visibleDashboards = treeDashboardsByFolder.value.get(folder.id) ?? []
      const isExpanded = hasSearchQuery.value || expanded.has(folder.id)

      rows.push({
        folder,
        depth,
        hasChildren: visibleChildren.length > 0 || visibleDashboards.length > 0,
        isExpanded,
        dashboards: visibleDashboards,
      })

      if (visibleChildren.length > 0 && isExpanded) {
        walk(folder.id, depth + 1)
      }
    }
  }

  walk(null, 0)
  return rows
})

const breadcrumbs = computed<Breadcrumb[]>(() => {
  const items: Breadcrumb[] = [
    {
      id: 'all',
      label: 'Dashboards',
      type: 'all',
    },
  ]

  if (!selectedFolderId.value || !selectedFolder.value) {
    return items
  }

  const path: Folder[] = []
  let cursor: Folder | null = selectedFolder.value
  while (cursor) {
    path.unshift(cursor)
    if (!cursor.parent_id) {
      break
    }
    cursor = folderById.value.get(cursor.parent_id) ?? null
  }

  for (const folder of path) {
    items.push({
      id: folder.id,
      label: folder.name,
      type: 'folder',
    })
  }

  return items
})

const activeExplorerTitle = computed(() => {
  if (selectedFolder.value) {
    return selectedFolder.value.name
  }
  return 'All Dashboards'
})

const filteredSections = computed<DashboardSection[]>(() => {
  function sectionInScope(section: DashboardSection): boolean {
    if (selectedExplorerNode.value === 'all') {
      return true
    }

    return sectionScopeFolderIds.value.has(section.id)
  }

  return groupedDashboardSections.value
    .filter(sectionInScope)
    .map((section) => {
      const dashboardsForSection = section.dashboards.filter(dashboardMatchesSearch)
      return {
        ...section,
        dashboards: dashboardsForSection,
      }
    })
    .filter((section) => {
      if (!hasSearchQuery.value) {
        return true
      }

      if (section.name.toLowerCase().includes(normalizedSearchQuery.value)) {
        return true
      }

      if (section.folder && folderVisibilityForSearch.value.get(section.folder.id)) {
        return true
      }

      return section.dashboards.length > 0
    })
})

const hoveredDashboard = computed(() => {
  if (!hoveredDashboardId.value) {
    return null
  }
  return dashboards.value.find((dashboard) => dashboard.id === hoveredDashboardId.value) ?? null
})

const hoveredDashboardFolderName = computed(() => {
  if (!hoveredDashboard.value?.folder_id) {
    return 'Unfiled'
  }
  return folderById.value.get(hoveredDashboard.value.folder_id)?.name ?? 'Unfiled'
})

const activeCreateParent = computed(() => {
  if (!inlineFolderParentId.value) {
    return null
  }
  return folderById.value.get(inlineFolderParentId.value) ?? null
})

async function fetchDashboards() {
  if (!currentOrgId.value) {
    dashboards.value = []
    folders.value = []
    loading.value = false
    return
  }

  loading.value = true
  error.value = null
  try {
    const [dashboardResponse, folderResponse] = await Promise.all([
      listDashboards(currentOrgId.value),
      listFolders(currentOrgId.value),
    ])
    dashboards.value = dashboardResponse
    folders.value = folderResponse
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load dashboards'
  } finally {
    loading.value = false
  }
}

function ensureRootFoldersExpanded() {
  const rootIds = rootFolders.value.map((folder) => folder.id)
  const knownFolders = new Set(folders.value.map((folder) => folder.id))
  const preserved = expandedFolderIds.value.filter((folderId) => knownFolders.has(folderId))
  expandedFolderIds.value = Array.from(new Set([...rootIds, ...preserved]))

  if (selectedFolderId.value && !knownFolders.has(selectedFolderId.value)) {
    selectedExplorerNode.value = 'all'
  }

  if (
    hoveredDashboardId.value &&
    !dashboards.value.some((dashboard) => dashboard.id === hoveredDashboardId.value)
  ) {
    hoveredDashboardId.value = null
  }

  if (
    selectedTreeDashboardId.value &&
    !dashboards.value.some((dashboard) => dashboard.id === selectedTreeDashboardId.value)
  ) {
    selectedTreeDashboardId.value = null
  }
}

watch(currentOrgId, () => {
  fetchDashboards()
})

watch([folders, dashboards], () => {
  ensureRootFoldersExpanded()
})

function normalizeCreateMode(rawMode: unknown): 'create' | 'import' | 'grafana' | null {
  if (rawMode === 'create' || rawMode === 'import' || rawMode === 'grafana') {
    return rawMode
  }
  return null
}

function openCreateModalWithMode(initialMode: 'create' | 'import' | 'grafana') {
  createModalInitialMode.value = initialMode
  showCreateModal.value = true
}

function openCreateModal() {
  openCreateModalWithMode('create')
}

function openCreateFolderModal() {
  if (!canCreateFolder.value) {
    return
  }

  folderName.value = ''
  folderError.value = null
  showInlineFolderForm.value = true
  inlineFolderParentId.value = selectedFolderId.value
}

function closeCreateFolderModal() {
  showInlineFolderForm.value = false
  folderName.value = ''
  folderError.value = null
  inlineFolderParentId.value = null
}

function closeCreateModal() {
  showCreateModal.value = false
}

function onDashboardCreated() {
  closeCreateModal()
  fetchDashboards()
}

function openEditModal(dashboard: Dashboard) {
  editingDashboard.value = dashboard
  showEditModal.value = true
}

function closeEditModal() {
  showEditModal.value = false
  editingDashboard.value = null
}

function onDashboardUpdated() {
  closeEditModal()
  fetchDashboards()
}

function confirmDelete(dashboard: Dashboard) {
  deletingDashboard.value = dashboard
  showDeleteConfirm.value = true
}

function cancelDelete() {
  showDeleteConfirm.value = false
  deletingDashboard.value = null
}

async function handleDelete() {
  if (!deletingDashboard.value) return

  try {
    await deleteDashboard(deletingDashboard.value.id)
    cancelDelete()
    fetchDashboards()
  } catch {
    error.value = 'Failed to delete dashboard'
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function openDashboard(dashboard: Dashboard) {
  router.push(`/dashboards/${dashboard.id}`)
}

function normalizeSectionId(sectionId: string | null): string {
  return sectionId ?? 'root'
}

function onDashboardDragStart(dashboard: Dashboard) {
  if (!canManageDashboards.value) {
    return
  }

  moveError.value = null
  draggingDashboardId.value = dashboard.id
}

function onDashboardDragEnd() {
  draggingDashboardId.value = null
  dropTargetSectionId.value = null
}

function onSectionDragOver(sectionId: string | null) {
  if (!canManageDashboards.value || !draggingDashboardId.value) {
    return
  }

  dropTargetSectionId.value = normalizeSectionId(sectionId)
}

async function onSectionDrop(sectionId: string | null) {
  if (!canManageDashboards.value || !draggingDashboardId.value || movingDashboardId.value) {
    return
  }

  const dashboardId = draggingDashboardId.value
  const targetFolderId = sectionId
  const dashboard = dashboards.value.find((item) => item.id === dashboardId)

  if (!dashboard) {
    onDashboardDragEnd()
    return
  }

  const currentFolderId = dashboard.folder_id ?? null
  if (currentFolderId === targetFolderId) {
    onDashboardDragEnd()
    return
  }

  moveError.value = null
  movingDashboardId.value = dashboardId
  dashboards.value = dashboards.value.map((item) =>
    item.id === dashboardId
      ? {
          ...item,
          folder_id: targetFolderId,
        }
      : item,
  )

  try {
    await updateDashboard(dashboardId, {
      folder_id: targetFolderId,
    })
  } catch (e) {
    dashboards.value = dashboards.value.map((item) =>
      item.id === dashboardId
        ? {
            ...item,
            folder_id: currentFolderId,
          }
        : item,
    )
    moveError.value = e instanceof Error ? e.message : 'Failed to move dashboard'
  } finally {
    movingDashboardId.value = null
    onDashboardDragEnd()
  }
}

function openFolderPermissions(folder: Folder) {
  selectedFolderForPermissions.value = folder
  folderPermissionsMessage.value = null
  showFolderPermissionsModal.value = true
}

function closeFolderPermissionsModal() {
  showFolderPermissionsModal.value = false
  selectedFolderForPermissions.value = null
}

async function onFolderPermissionsSaved() {
  if (!selectedFolderForPermissions.value) {
    return
  }

  const folderDisplayName = selectedFolderForPermissions.value.name
  closeFolderPermissionsModal()
  folderPermissionsMessage.value = `Updated permissions for "${folderDisplayName}"`
  await fetchDashboards()
}

async function handleCreateFolder() {
  if (!folderName.value.trim()) {
    folderError.value = 'Folder name is required'
    return
  }

  if (!currentOrgId.value) {
    folderError.value = 'No organization selected'
    return
  }

  creatingFolder.value = true
  folderError.value = null

  try {
    await createFolder(currentOrgId.value, {
      name: folderName.value.trim(),
      ...(inlineFolderParentId.value ? { parent_id: inlineFolderParentId.value } : {}),
    })
    closeCreateFolderModal()
    await fetchDashboards()
  } catch (e) {
    folderError.value = e instanceof Error ? e.message : 'Failed to create folder'
  } finally {
    creatingFolder.value = false
  }
}

function toggleFolderExpanded(folderId: string) {
  const set = new Set(expandedFolderIds.value)
  if (set.has(folderId)) {
    set.delete(folderId)
  } else {
    set.add(folderId)
  }
  expandedFolderIds.value = Array.from(set)
}

function onTreeFolderClick(folderId: string, hasChildren: boolean) {
  selectExplorerFolder(folderId)
  if (hasChildren) {
    toggleFolderExpanded(folderId)
  }
}

function selectExplorerFolder(folderId: string) {
  selectedTreeDashboardId.value = null
  hoveredDashboardId.value = null
  selectedExplorerNode.value = `folder:${folderId}`
  const set = new Set(expandedFolderIds.value)
  let cursor = folderById.value.get(folderId) ?? null

  while (cursor?.parent_id) {
    set.add(cursor.parent_id)
    cursor = folderById.value.get(cursor.parent_id) ?? null
  }

  expandedFolderIds.value = Array.from(set)
}

function selectExplorerAll() {
  selectedTreeDashboardId.value = null
  hoveredDashboardId.value = null
  selectedExplorerNode.value = 'all'
}

function selectExplorerDashboard(dashboard: Dashboard) {
  selectedTreeDashboardId.value = dashboard.id
  hoveredDashboardId.value = dashboard.id
}

function expandAllFolders() {
  expandedFolderIds.value = folders.value.map((folder) => folder.id)
}

function collapseTree() {
  if (!selectedFolder.value) {
    expandedFolderIds.value = []
    return
  }

  const expanded = new Set<string>()
  let cursor: Folder | null = selectedFolder.value
  while (cursor?.parent_id) {
    expanded.add(cursor.parent_id)
    cursor = folderById.value.get(cursor.parent_id) ?? null
  }

  expandedFolderIds.value = Array.from(expanded)
}

function onBreadcrumbSelect(item: Breadcrumb) {
  if (item.type === 'all') {
    selectExplorerAll()
    return
  }

  selectExplorerFolder(item.id)
}

function showDashboardPreview(dashboardId: string) {
  hoveredDashboardId.value = dashboardId
}

function clearDashboardPreview(dashboardId: string) {
  if (hoveredDashboardId.value === dashboardId && selectedTreeDashboardId.value !== dashboardId) {
    hoveredDashboardId.value = null
  }
}

onMounted(fetchDashboards)

onMounted(() => {
  const modeFromQuery = normalizeCreateMode(route.query.newDashboardMode)
  if (!modeFromQuery) {
    return
  }

  openCreateModalWithMode(modeFromQuery)

  const nextQuery = { ...route.query }
  delete nextQuery.newDashboardMode
  router.replace({ query: nextQuery })
})
</script>

<template>
  <div class="mx-auto max-w-[1560px] px-7 pt-6 pb-8">
    <!-- Page header -->
    <header class="mb-4 flex items-center justify-between gap-4 rounded border border-border bg-surface-raised p-4 shadow-sm">
      <div>
        <h1 class="mb-1 text-lg font-bold tracking-wide text-text-primary">Dashboards</h1>
        <p class="text-sm text-text-secondary">File explorer for folders and monitoring dashboards</p>
      </div>
      <div class="inline-flex items-center gap-2.5">
        <button
          v-if="canCreateFolder"
          class="inline-flex items-center gap-2 rounded-sm border border-border bg-surface-raised px-4 py-2 text-sm font-medium text-text-primary transition hover:border-border-strong hover:bg-surface-overlay cursor-pointer"
          data-testid="new-folder-header"
          @click="openCreateFolderModal"
        >
          <FolderIcon :size="18" />
          <span>New Folder</span>
        </button>
        <button
          class="inline-flex items-center gap-2 rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-hover cursor-pointer"
          data-testid="new-dashboard-btn"
          @click="openCreateModal"
        >
          <Plus :size="18" />
          <span>New Dashboard</span>
        </button>
      </div>
    </header>

    <!-- Loading state -->
    <div v-if="loading" class="flex min-h-[320px] flex-col items-center justify-center rounded border border-border bg-surface-raised py-16 text-center text-text-secondary">
      <div class="mb-4 h-10 w-10 animate-spin rounded-sm border-3 border-border border-t-accent"></div>
      <p>Loading dashboards...</p>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="flex min-h-[320px] flex-col items-center justify-center rounded border border-border bg-surface-raised py-16 text-center text-rose-600">
      <AlertCircle :size="48" />
      <p class="mb-5 mt-4">{{ error }}</p>
      <button
        class="inline-flex items-center gap-2 rounded-sm border border-border bg-surface-raised px-4 py-2 text-sm font-medium text-text-primary transition hover:border-border-strong hover:bg-surface-overlay cursor-pointer"
        @click="fetchDashboards"
      >
        Try Again
      </button>
    </div>

    <!-- Empty state -->
    <div v-else-if="isCompletelyEmpty" class="flex min-h-[320px] flex-col items-center justify-center rounded border border-border bg-surface-raised py-16 text-center text-text-secondary">
      <div class="mb-4 flex h-28 w-28 items-center justify-center rounded border border-border bg-gradient-to-br from-accent-muted to-surface-raised text-text-muted">
        <LayoutDashboard :size="64" />
      </div>
      <h2 class="mt-4 mb-2 text-lg font-semibold text-text-primary">No dashboards yet</h2>
      <p class="mb-5">Create your first dashboard to start monitoring your metrics</p>
      <div class="flex gap-3">
        <button
          v-if="canCreateFolder"
          class="inline-flex items-center gap-2 rounded-sm border border-border bg-surface-raised px-4 py-2 text-sm font-medium text-text-primary transition hover:border-border-strong hover:bg-surface-overlay cursor-pointer"
          data-testid="new-folder-empty"
          @click="openCreateFolderModal"
        >
          <FolderIcon :size="18" />
          <span>Create Folder</span>
        </button>
        <button
          class="inline-flex items-center gap-2 rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-hover cursor-pointer"
          @click="openCreateModal"
        >
          <Plus :size="18" />
          <span>Create Dashboard</span>
        </button>
      </div>
    </div>

    <!-- Explorer shell: sidebar + main + preview -->
    <div v-else class="grid grid-cols-1 items-start gap-4">
      <!-- Sidebar / folder tree -->
      <aside class="min-h-[640px] rounded border border-border bg-surface-raised p-4 shadow-sm">
        <!-- Search -->
        <div class="mb-3 flex items-center gap-2 rounded-sm border border-border bg-surface-overlay px-3 py-2 text-text-muted">
          <Search :size="16" />
          <input
            v-model="searchQuery"
            type="search"
            placeholder="Search folders and dashboards"
            data-testid="explorer-search"
            class="w-full border-none bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
          />
        </div>

        <!-- Finder header / breadcrumbs -->
        <div class="mb-2.5 rounded-sm border border-border bg-surface-overlay px-2.5 py-2">
          <div class="flex flex-wrap items-center gap-1" aria-label="Current folder path">
            <template v-for="(item, index) in breadcrumbs" :key="`sidebar-${item.type === 'folder' ? item.id : item.type}`">
              <button
                class="border-none bg-transparent px-1 py-0.5 text-xs text-text-secondary cursor-pointer"
                :class="{ 'font-semibold text-text-primary': index === breadcrumbs.length - 1 }"
                @click="onBreadcrumbSelect(item)"
              >
                {{ item.label }}
              </button>
              <ChevronRight v-if="index < breadcrumbs.length - 1" :size="14" class="text-text-muted" />
            </template>
          </div>
        </div>

        <!-- Tree toolbar -->
        <div class="mb-2.5 flex items-center justify-between gap-2.5">
          <p class="m-0 text-xs font-semibold tracking-widest text-text-muted uppercase">Explorer</p>
          <div class="inline-flex items-center gap-1.5">
            <button
              type="button"
              class="rounded-sm border border-border bg-surface-overlay px-2 py-0.5 text-xs text-text-secondary transition cursor-pointer hover:border-border-strong hover:bg-surface-overlay hover:text-text-primary"
              @click="expandAllFolders"
            >
              Expand all
            </button>
            <button
              type="button"
              class="rounded-sm border border-border bg-surface-overlay px-2 py-0.5 text-xs text-text-secondary transition cursor-pointer hover:border-border-strong hover:bg-surface-overlay hover:text-text-primary"
              @click="collapseTree"
            >
              Collapse
            </button>
          </div>
        </div>

        <!-- Tree nav -->
        <nav class="flex flex-col gap-0.5" aria-label="Folder tree">
          <!-- Root "All Dashboards" node -->
          <div :style="{ paddingLeft: '0px' }">
            <div
              class="flex items-center gap-1 rounded-sm border border-transparent transition"
              :class="dropTargetSectionId === normalizeSectionId(null) ? 'border-accent-border bg-accent-muted' : 'hover:border-border hover:bg-surface-overlay'"
              data-testid="tree-row-root"
              @dragover.prevent="onSectionDragOver(null)"
              @drop.prevent="onSectionDrop(null)"
            >
              <span class="inline-flex h-6 w-6 shrink-0 items-center justify-center"></span>
              <button
                class="flex w-full items-center gap-2 rounded-sm border border-transparent bg-transparent px-2 py-1.5 text-sm text-text-secondary transition cursor-pointer"
                :class="selectedExplorerNode === 'all' ? 'border-accent-border bg-accent-muted font-medium text-accent' : 'hover:bg-surface-overlay hover:text-text-primary'"
                data-testid="tree-node-all"
                @click="selectExplorerAll"
              >
                <LayoutDashboard :size="15" :class="selectedExplorerNode === 'all' ? 'text-accent' : 'text-text-muted'" />
                <span>All Dashboards</span>
                <span
                  class="ml-auto inline-flex h-6 min-w-6 items-center justify-center rounded-sm border text-xs font-mono"
                  :class="selectedExplorerNode === 'all' ? 'border-accent-border bg-accent-muted text-accent' : 'border-border bg-surface-overlay text-text-secondary'"
                >
                  {{ dashboards.length }}
                </span>
              </button>
            </div>
          </div>

          <!-- Folder rows -->
          <div v-for="row in explorerTreeRows" :key="row.folder.id" :style="{ paddingLeft: `${row.depth * 14}px` }">
            <div
              class="flex items-center gap-1 rounded-sm border border-transparent transition"
              :class="dropTargetSectionId === normalizeSectionId(row.folder.id) ? 'border-accent-border bg-accent-muted' : 'hover:border-border hover:bg-surface-overlay'"
              :data-testid="`tree-row-${row.folder.id}`"
              @dragover.prevent="onSectionDragOver(row.folder.id)"
              @drop.prevent="onSectionDrop(row.folder.id)"
            >
              <button
                v-if="row.hasChildren"
                class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border-none bg-transparent text-text-muted cursor-pointer transition hover:bg-surface-overlay"
                :data-testid="`folder-toggle-${row.folder.id}`"
                @click.stop="toggleFolderExpanded(row.folder.id)"
              >
                <ChevronDown v-if="row.isExpanded" :size="14" />
                <ChevronRight v-else :size="14" />
              </button>
              <span v-else class="inline-flex h-6 w-6 shrink-0 items-center justify-center"></span>

              <button
                class="flex w-full items-center gap-2 rounded-sm border border-transparent bg-transparent px-2 py-1.5 text-sm text-text-secondary transition cursor-pointer"
                :class="selectedExplorerNode === `folder:${row.folder.id}` ? 'border-accent-border bg-accent-muted font-medium text-accent' : 'hover:bg-surface-overlay hover:text-text-primary'"
                :data-testid="`tree-node-${row.folder.id}`"
                @click="onTreeFolderClick(row.folder.id, row.hasChildren)"
              >
                <FolderIcon :size="14" :class="selectedExplorerNode === `folder:${row.folder.id}` ? 'text-accent' : 'text-text-muted'" />
                <span>{{ row.folder.name }}</span>
                <span
                  class="ml-auto inline-flex h-6 min-w-6 items-center justify-center rounded-sm border text-xs font-mono"
                  :class="selectedExplorerNode === `folder:${row.folder.id}` ? 'border-accent-border bg-accent-muted text-accent' : 'border-border bg-surface-overlay text-text-secondary'"
                >
                  {{ folderDashboardCountMap.get(row.folder.id) ?? 0 }}
                </span>
              </button>
            </div>

            <!-- Dashboard files under this folder -->
            <div
              v-for="dashboard in row.dashboards"
              v-show="row.isExpanded"
              :key="dashboard.id"
              :style="{ paddingLeft: '14px' }"
            >
              <div
                class="flex items-center gap-1"
                :data-testid="`tree-dashboard-row-${dashboard.id}`"
                @mouseenter="showDashboardPreview(dashboard.id)"
                @mouseleave="clearDashboardPreview(dashboard.id)"
              >
                <span class="inline-flex h-6 w-6 shrink-0 items-center justify-center"></span>
                <button
                  class="flex w-full items-center gap-2 rounded-sm border border-transparent bg-transparent px-2 py-1 text-xs text-text-muted transition cursor-pointer"
                  :class="[
                    selectedTreeDashboardId === dashboard.id ? 'border-accent-border bg-accent-muted text-accent' : 'hover:border-border hover:text-text-primary',
                    canManageDashboards ? '[&[draggable=true]]:cursor-grab [&[draggable=true]]:active:cursor-grabbing' : '',
                  ]"
                  :data-testid="`tree-dashboard-${dashboard.id}`"
                  :draggable="canManageDashboards"
                  @dragstart="onDashboardDragStart(dashboard)"
                  @dragend="onDashboardDragEnd"
                  @click="selectExplorerDashboard(dashboard); openDashboard(dashboard)"
                >
                  <FileText :size="13" />
                  <span>{{ dashboard.title }}</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Unfiled dashboards at root -->
          <div
            v-for="dashboard in unfiledTreeDashboards"
            :key="dashboard.id"
            :style="{ paddingLeft: '0px' }"
          >
            <div
              class="flex items-center gap-1"
              :data-testid="`tree-dashboard-row-${dashboard.id}`"
              @mouseenter="showDashboardPreview(dashboard.id)"
              @mouseleave="clearDashboardPreview(dashboard.id)"
            >
              <span class="inline-flex h-6 w-6 shrink-0 items-center justify-center"></span>
              <button
                class="flex w-full items-center gap-2 rounded-sm border border-transparent bg-transparent px-2 py-1 text-xs text-text-muted transition cursor-pointer"
                :class="[
                  selectedTreeDashboardId === dashboard.id ? 'border-accent-border bg-accent-muted text-accent' : 'hover:border-border hover:text-text-primary',
                  canManageDashboards ? '[&[draggable=true]]:cursor-grab [&[draggable=true]]:active:cursor-grabbing' : '',
                ]"
                :data-testid="`tree-dashboard-${dashboard.id}`"
                :draggable="canManageDashboards"
                @dragstart="onDashboardDragStart(dashboard)"
                @dragend="onDashboardDragEnd"
                @click="selectExplorerDashboard(dashboard); openDashboard(dashboard)"
              >
                <FileText :size="13" />
                <span>{{ dashboard.title }}</span>
              </button>
            </div>
          </div>
        </nav>

        <!-- Inline folder creation form -->
        <div v-if="showInlineFolderForm" class="mt-3 rounded-sm border border-border bg-surface-overlay p-3" data-testid="inline-folder-create">
          <p v-if="activeCreateParent" class="mb-2 text-xs text-text-secondary">Parent: {{ activeCreateParent.name }}</p>
          <form @submit.prevent="handleCreateFolder">
            <div class="flex flex-col gap-1.5">
              <label for="folder-name" class="text-sm font-medium text-text-primary">Folder Name</label>
              <input
                id="folder-name"
                v-model="folderName"
                type="text"
                placeholder="Operations"
                :disabled="creatingFolder"
                autocomplete="off"
                class="rounded-sm border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition"
              />
            </div>
            <p v-if="folderError" class="mt-1.5 text-sm text-rose-600">{{ folderError }}</p>
            <div class="mt-3 flex justify-end gap-2">
              <button
                type="button"
                class="inline-flex items-center gap-2 rounded-sm border border-border bg-surface-raised px-4 py-2 text-sm font-medium text-text-primary transition hover:border-border-strong hover:bg-surface-overlay cursor-pointer"
                :disabled="creatingFolder"
                @click="closeCreateFolderModal"
              >
                Cancel
              </button>
              <button
                type="submit"
                class="inline-flex items-center gap-2 rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-hover cursor-pointer"
                :disabled="creatingFolder"
              >
                {{ creatingFolder ? 'Creating...' : 'Create' }}
              </button>
            </div>
          </form>
        </div>
      </aside>

      <!-- Main content area (hidden on mobile, shown via grid on larger screens) -->
      <section class="hidden rounded border border-border bg-surface-raised p-4 shadow-sm lg:block">
        <!-- Breadcrumbs -->
        <div class="mb-3 flex flex-wrap items-center gap-1" aria-label="Current folder path">
          <template v-for="(item, index) in breadcrumbs" :key="item.type === 'folder' ? `folder-${item.id}` : item.type">
            <button
              class="border-none bg-transparent px-1 py-0.5 text-xs text-text-secondary cursor-pointer"
              :class="{ 'font-semibold text-text-primary': index === breadcrumbs.length - 1 }"
              @click="onBreadcrumbSelect(item)"
            >
              {{ item.label }}
            </button>
            <ChevronRight v-if="index < breadcrumbs.length - 1" :size="14" class="text-text-muted" />
          </template>
        </div>

        <!-- Messages -->
        <p v-if="folderPermissionsMessage" class="mb-3 rounded-sm border border-accent-border bg-accent-muted px-3.5 py-2.5 text-sm text-accent">
          {{ folderPermissionsMessage }}
        </p>
        <p v-if="moveError" class="mb-3 rounded-sm border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-600">
          {{ moveError }}
        </p>

        <!-- Section heading -->
        <div class="mb-3">
          <h2 class="text-base font-bold tracking-wide text-text-primary">{{ activeExplorerTitle }}</h2>
        </div>

        <!-- Subfolders strip -->
        <div v-if="selectedFolderChildren.length > 0" class="mb-4 rounded border border-border bg-surface-overlay p-3">
          <p class="mb-2 text-xs font-semibold tracking-widest text-text-muted uppercase">Subfolders</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="child in selectedFolderChildren"
              :key="child.id"
              type="button"
              class="inline-flex items-center gap-2 rounded-sm border border-border bg-surface-raised px-3 py-1.5 text-xs text-text-secondary transition cursor-pointer hover:border-accent-border hover:text-text-primary"
              @click="selectExplorerFolder(child.id)"
            >
              <FolderIcon :size="14" />
              <span>{{ child.name }}</span>
              <span class="inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-border text-[11px] font-mono">
                {{ folderDashboardCountMap.get(child.id) ?? 0 }}
              </span>
            </button>
          </div>
        </div>

        <!-- No folders CTA -->
        <div v-if="hasNoFolders" class="mb-4 flex items-center justify-between gap-4 rounded border border-dashed border-border bg-surface-overlay p-4" data-testid="folder-empty-cta">
          <div>
            <h2 class="text-sm font-bold tracking-wide text-text-primary">No Folders Yet</h2>
            <p class="mt-1 text-sm text-text-secondary">Use folders to organize dashboards by team, service, or environment.</p>
          </div>
          <button
            v-if="canCreateFolder"
            class="inline-flex items-center gap-2 rounded-sm border border-border bg-surface-raised px-4 py-2 text-sm font-medium text-text-primary transition hover:border-border-strong hover:bg-surface-overlay cursor-pointer"
            data-testid="new-folder-cta"
            @click="openCreateFolderModal"
          >
            <FolderIcon :size="16" />
            <span>New Folder</span>
          </button>
        </div>

        <!-- Folder sections -->
        <div class="flex flex-col gap-4">
          <!-- Root dashboards -->
          <section
            v-if="rootDashboardsForMain.length > 0"
            class="rounded border border-border bg-surface-overlay p-4 transition"
            :class="{ 'ring-2 ring-accent/50': dropTargetSectionId === normalizeSectionId(null) }"
            data-testid="folder-section-root"
            @dragover.prevent="onSectionDragOver(null)"
            @drop.prevent="onSectionDrop(null)"
          >
            <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div
                v-for="dashboard in rootDashboardsForMain"
                :key="dashboard.id"
                class="group rounded border border-border bg-surface-raised p-4 transition cursor-pointer hover:border-border-strong hover:shadow-sm"
                :class="{
                  'opacity-50': draggingDashboardId === dashboard.id,
                  'cursor-grab active:cursor-grabbing': canManageDashboards,
                }"
                :data-testid="`dashboard-card-${dashboard.id}`"
                :draggable="canManageDashboards"
                @dragstart="onDashboardDragStart(dashboard)"
                @dragend="onDashboardDragEnd"
                @mouseenter="showDashboardPreview(dashboard.id)"
                @mouseleave="clearDashboardPreview(dashboard.id)"
                @focusin="showDashboardPreview(dashboard.id)"
                @focusout="clearDashboardPreview(dashboard.id)"
                @click="openDashboard(dashboard)"
              >
                <div class="mb-2 flex items-start justify-between gap-2">
                  <h3 class="text-sm font-semibold leading-snug text-text-primary">{{ dashboard.title }}</h3>
                  <div class="flex gap-1 opacity-0 transition group-hover:opacity-100" @click.stop>
                    <button class="inline-flex h-7 w-7 items-center justify-center rounded-sm text-text-muted transition hover:bg-surface-overlay hover:text-text-secondary cursor-pointer" @click="openEditModal(dashboard)" title="Edit">
                      <Pencil :size="16" />
                    </button>
                    <button class="inline-flex h-7 w-7 items-center justify-center rounded-sm text-text-muted transition hover:bg-rose-50 hover:text-rose-600 cursor-pointer" @click="confirmDelete(dashboard)" title="Delete">
                      <Trash2 :size="16" />
                    </button>
                  </div>
                </div>
                <p v-if="dashboard.description" class="mt-1 mb-3 text-xs leading-relaxed text-text-secondary line-clamp-2">
                  {{ dashboard.description }}
                </p>
                <div class="mt-3 text-xs text-text-muted">
                  <span>Created {{ formatDate(dashboard.created_at) }}</span>
                </div>
              </div>
            </div>
          </section>

          <!-- Per-folder sections -->
          <section
            v-for="section in filteredSections"
            :key="section.id"
            class="rounded border border-border bg-surface-overlay p-4 transition"
            :class="{ 'ring-2 ring-accent/50': dropTargetSectionId === normalizeSectionId(section.id) }"
            :data-testid="`folder-section-${section.id}`"
            @dragover.prevent="onSectionDragOver(section.id)"
            @drop.prevent="onSectionDrop(section.id)"
          >
            <div class="mb-1 flex items-center justify-between gap-2.5">
              <div class="inline-flex items-center gap-2">
                <FolderIcon :size="18" class="text-text-muted" />
                <h2 class="text-sm font-bold tracking-wide text-text-primary">{{ section.name }}</h2>
              </div>
              <div class="inline-flex items-center gap-2">
                <span class="inline-flex h-7 min-w-7 items-center justify-center rounded-sm border border-border bg-surface-raised text-xs text-text-secondary font-mono">
                  {{ section.dashboards.length }}
                </span>
                <button
                  v-if="isOrgAdmin"
                  class="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface-raised px-3 py-1.5 text-xs font-medium text-text-primary transition hover:border-border-strong hover:bg-surface-overlay cursor-pointer"
                  :data-testid="`folder-permissions-${section.folder.id}`"
                  @click="openFolderPermissions(section.folder)"
                >
                  <Shield :size="14" />
                  Permissions
                </button>
              </div>
            </div>

            <p v-if="section.dashboards.length === 0" class="mt-2 text-sm text-text-muted">
              No dashboards in this section yet.
            </p>

            <div v-else class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div
                v-for="dashboard in section.dashboards"
                :key="dashboard.id"
                class="group rounded border border-border bg-surface-raised p-4 transition cursor-pointer hover:border-border-strong hover:shadow-sm"
                :class="{
                  'opacity-50': draggingDashboardId === dashboard.id,
                  'cursor-grab active:cursor-grabbing': canManageDashboards,
                }"
                :data-testid="`dashboard-card-${dashboard.id}`"
                :draggable="canManageDashboards"
                @dragstart="onDashboardDragStart(dashboard)"
                @dragend="onDashboardDragEnd"
                @mouseenter="showDashboardPreview(dashboard.id)"
                @mouseleave="clearDashboardPreview(dashboard.id)"
                @focusin="showDashboardPreview(dashboard.id)"
                @focusout="clearDashboardPreview(dashboard.id)"
                @click="openDashboard(dashboard)"
              >
                <div class="mb-2 flex items-start justify-between gap-2">
                  <h3 class="text-sm font-semibold leading-snug text-text-primary">{{ dashboard.title }}</h3>
                  <div class="flex gap-1 opacity-0 transition group-hover:opacity-100" @click.stop>
                    <button class="inline-flex h-7 w-7 items-center justify-center rounded-sm text-text-muted transition hover:bg-surface-overlay hover:text-text-secondary cursor-pointer" @click="openEditModal(dashboard)" title="Edit">
                      <Pencil :size="16" />
                    </button>
                    <button class="inline-flex h-7 w-7 items-center justify-center rounded-sm text-text-muted transition hover:bg-rose-50 hover:text-rose-600 cursor-pointer" @click="confirmDelete(dashboard)" title="Delete">
                      <Trash2 :size="16" />
                    </button>
                  </div>
                </div>
                <p v-if="dashboard.description" class="mt-1 mb-3 text-xs leading-relaxed text-text-secondary line-clamp-2">
                  {{ dashboard.description }}
                </p>
                <div class="mt-3 text-xs text-text-muted">
                  <span>Created {{ formatDate(dashboard.created_at) }}</span>
                </div>
              </div>
            </div>
          </section>

          <!-- No results -->
          <p v-if="filteredSections.length === 0 && rootDashboardsForMain.length === 0" class="mt-2 text-sm text-text-muted">
            No folders or dashboards match your search.
          </p>
        </div>
      </section>

      <!-- Preview pane (hidden on small screens) -->
      <aside class="sticky top-4 hidden rounded border border-border bg-surface-raised p-4 shadow-sm xl:block" data-testid="dashboard-preview">
        <h3 class="mb-3 text-xs font-semibold tracking-widest text-text-muted uppercase">Dashboard Preview</h3>
        <div v-if="hoveredDashboard" class="rounded-sm border border-border bg-surface-overlay p-3">
          <div class="mb-2 flex items-center gap-2">
            <FileText :size="16" class="text-text-muted" />
            <h4 class="text-sm font-semibold text-text-primary">{{ hoveredDashboard.title }}</h4>
          </div>
          <p class="mb-3 text-sm leading-relaxed text-text-secondary">
            {{ hoveredDashboard.description || 'No description provided.' }}
          </p>
          <dl class="grid gap-2">
            <div class="flex flex-col gap-0.5">
              <dt class="text-[11px] font-semibold tracking-widest text-text-muted uppercase">Folder</dt>
              <dd class="m-0 text-xs text-text-primary">{{ hoveredDashboardFolderName }}</dd>
            </div>
            <div class="flex flex-col gap-0.5">
              <dt class="text-[11px] font-semibold tracking-widest text-text-muted uppercase">Created</dt>
              <dd class="m-0 text-xs text-text-primary">{{ formatDate(hoveredDashboard.created_at) }}</dd>
            </div>
            <div class="flex flex-col gap-0.5">
              <dt class="text-[11px] font-semibold tracking-widest text-text-muted uppercase">Updated</dt>
              <dd class="m-0 text-xs text-text-primary">{{ formatDate(hoveredDashboard.updated_at) }}</dd>
            </div>
          </dl>
        </div>
        <div v-else class="rounded-sm border border-dashed border-border p-4 text-center text-sm text-text-muted">
          <p>Hover over a dashboard card to preview details.</p>
        </div>
      </aside>
    </div>

    <!-- Modals (not restyled here) -->
    <CreateDashboardModal
      v-if="showCreateModal"
      :initial-mode="createModalInitialMode"
      @close="closeCreateModal"
      @created="onDashboardCreated"
    />

    <EditDashboardModal
      v-if="showEditModal && editingDashboard"
      :dashboard="editingDashboard"
      :folders="folders"
      @close="closeEditModal"
      @updated="onDashboardUpdated"
    />

    <FolderPermissionsModal
      v-if="showFolderPermissionsModal && selectedFolderForPermissions && currentOrgId"
      :folder="selectedFolderForPermissions"
      :org-id="currentOrgId"
      @close="closeFolderPermissionsModal"
      @saved="onFolderPermissionsSaved"
    />

    <!-- Delete confirmation modal -->
    <div v-if="showDeleteConfirm" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" data-testid="delete-dashboard-modal" @click.self="cancelDelete">
      <div class="w-full max-w-sm rounded border border-border bg-surface-raised p-8 text-center shadow-lg">
        <div class="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-sm bg-rose-50 text-rose-600">
          <Trash2 :size="24" />
        </div>
        <h2 class="mb-1 text-lg font-semibold text-text-primary">Delete Dashboard</h2>
        <p class="mb-1 text-sm text-text-secondary">Are you sure you want to delete "{{ deletingDashboard?.title }}"?</p>
        <p class="text-sm text-rose-600">This action cannot be undone.</p>
        <div class="mt-5 flex justify-center gap-3">
          <button
            class="inline-flex items-center gap-2 rounded-sm border border-border bg-surface-raised px-4 py-2 text-sm font-medium text-text-primary transition hover:border-border-strong hover:bg-surface-overlay cursor-pointer"
            data-testid="delete-dashboard-cancel-btn"
            @click="cancelDelete"
          >
            Cancel
          </button>
          <button
            class="inline-flex items-center gap-2 rounded-sm bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 cursor-pointer"
            data-testid="delete-dashboard-confirm-btn"
            @click="handleDelete"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
