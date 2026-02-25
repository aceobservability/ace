<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Plus,
  Pencil,
  Trash2,
  LayoutDashboard,
  AlertCircle,
  Folder as FolderIcon,
  Shield,
  ChevronRight,
  ChevronDown,
  Search,
  FileText,
} from 'lucide-vue-next'
import type { Dashboard } from '../types/dashboard'
import type { Folder } from '../types/folder'
import { listDashboards, deleteDashboard, updateDashboard } from '../api/dashboards'
import { listFolders, createFolder } from '../api/folders'
import { useOrganization } from '../composables/useOrganization'
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
const canCreateFolder = computed(() => currentOrg.value?.role === 'admin' || currentOrg.value?.role === 'editor')
const canManageDashboards = computed(() => currentOrg.value?.role === 'admin' || currentOrg.value?.role === 'editor')
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
    const parentId = folder.parent_id && folderById.value.has(folder.parent_id) ? folder.parent_id : null
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
  return dashboards.value.filter((dashboard) => !dashboard.folder_id || !folderIds.has(dashboard.folder_id))
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

const isCompletelyEmpty = computed(() => dashboards.value.length === 0 && folders.value.length === 0)
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

  return (folderChildrenMap.value.get(selectedFolderId.value) ?? []).filter((folder) => folderVisibilityForSearch.value.get(folder.id))
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

      const visibleChildren = (folderChildrenMap.value.get(folder.id) ?? []).filter((child) => folderVisibilityForSearch.value.get(child.id))
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
  const items: Breadcrumb[] = [{
    id: 'all',
    label: 'Dashboards',
    type: 'all',
  }]

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

  if (hoveredDashboardId.value && !dashboards.value.some((dashboard) => dashboard.id === hoveredDashboardId.value)) {
    hoveredDashboardId.value = null
  }

  if (selectedTreeDashboardId.value && !dashboards.value.some((dashboard) => dashboard.id === selectedTreeDashboardId.value)) {
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
  router.push(`/app/dashboards/${dashboard.id}`)
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
  <div class="dashboard-list">
    <header class="page-header">
      <div class="header-content">
        <h1>Dashboards</h1>
        <p class="header-subtitle">File explorer for folders and monitoring dashboards</p>
      </div>
      <div class="header-actions">
        <button v-if="canCreateFolder" class="btn btn-secondary" data-testid="new-folder-header" @click="openCreateFolderModal">
          <FolderIcon :size="18" />
          <span>New Folder</span>
        </button>
        <button class="btn btn-primary" @click="openCreateModal">
          <Plus :size="18" />
          <span>New Dashboard</span>
        </button>
      </div>
    </header>

    <div v-if="loading" class="state-container">
      <div class="w-10 h-10 border-3 border-border border-t-accent rounded-full animate-[spin_0.8s_linear_infinite]"></div>
      <p>Loading dashboards...</p>
    </div>

    <div v-else-if="error" class="state-container error">
      <AlertCircle :size="48" />
      <p>{{ error }}</p>
      <button class="btn btn-secondary" @click="fetchDashboards">Try Again</button>
    </div>

    <div v-else-if="isCompletelyEmpty" class="state-container empty">
      <div class="empty-icon">
        <LayoutDashboard :size="64" />
      </div>
      <h2>No dashboards yet</h2>
      <p>Create your first dashboard to start monitoring your metrics</p>
      <div class="empty-actions">
        <button v-if="canCreateFolder" class="btn btn-secondary" data-testid="new-folder-empty" @click="openCreateFolderModal">
          <FolderIcon :size="18" />
          <span>Create Folder</span>
        </button>
        <button class="btn btn-primary" @click="openCreateModal">
          <Plus :size="18" />
          <span>Create Dashboard</span>
        </button>
      </div>
    </div>

    <div v-else class="explorer-shell">
      <aside class="explorer-sidebar">
        <div class="explorer-search">
          <Search :size="16" />
          <input
            v-model="searchQuery"
            type="search"
            placeholder="Search folders and dashboards"
            data-testid="explorer-search"
          />
        </div>

        <div class="finder-header">
          <div class="breadcrumbs" aria-label="Current folder path">
            <template v-for="(item, index) in breadcrumbs" :key="`sidebar-${item.type === 'folder' ? item.id : item.type}`">
              <button
                class="breadcrumb-item"
                :class="{ 'breadcrumb-item-active': index === breadcrumbs.length - 1 }"
                @click="onBreadcrumbSelect(item)"
              >
                {{ item.label }}
              </button>
              <ChevronRight v-if="index < breadcrumbs.length - 1" :size="14" class="breadcrumb-separator" />
            </template>
          </div>
        </div>

        <div class="tree-toolbar">
          <p>Explorer</p>
          <div class="tree-toolbar-actions">
            <button type="button" class="tree-toolbar-btn" @click="expandAllFolders">Expand all</button>
            <button type="button" class="tree-toolbar-btn" @click="collapseTree">Collapse</button>
          </div>
        </div>

        <nav class="tree-nav" aria-label="Folder tree">
          <div class="tree-node-wrapper" :style="{ '--depth': '0' }">
            <div
              class="tree-item-row"
              :class="{ 'tree-item-row-drop-active': dropTargetSectionId === normalizeSectionId(null) }"
              data-testid="tree-row-root"
              @dragover.prevent="onSectionDragOver(null)"
              @drop.prevent="onSectionDrop(null)"
            >
              <span class="tree-toggle-placeholder"></span>
              <button
                class="tree-item tree-item-root"
                :class="{ 'tree-item-active': selectedExplorerNode === 'all' }"
                data-testid="tree-node-all"
                @click="selectExplorerAll"
              >
                <LayoutDashboard :size="15" />
                <span>All Dashboards</span>
                <span class="tree-count">{{ dashboards.length }}</span>
              </button>
            </div>
          </div>

          <div v-for="row in explorerTreeRows" :key="row.folder.id" class="tree-node-wrapper" :style="{ '--depth': `${row.depth}` }">
            <div
              class="tree-item-row"
              :class="{ 'tree-item-row-drop-active': dropTargetSectionId === normalizeSectionId(row.folder.id) }"
              :data-testid="`tree-row-${row.folder.id}`"
              @dragover.prevent="onSectionDragOver(row.folder.id)"
              @drop.prevent="onSectionDrop(row.folder.id)"
            >
              <button
                v-if="row.hasChildren"
                class="tree-toggle"
                :data-testid="`folder-toggle-${row.folder.id}`"
                @click.stop="toggleFolderExpanded(row.folder.id)"
              >
                <ChevronDown v-if="row.isExpanded" :size="14" />
                <ChevronRight v-else :size="14" />
              </button>
              <span v-else class="tree-toggle-placeholder"></span>

              <button
                class="tree-item"
                :class="{ 'tree-item-active': selectedExplorerNode === `folder:${row.folder.id}` }"
                :data-testid="`tree-node-${row.folder.id}`"
                @click="onTreeFolderClick(row.folder.id, row.hasChildren)"
              >
                <FolderIcon :size="14" />
                <span>{{ row.folder.name }}</span>
                <span class="tree-count">{{ folderDashboardCountMap.get(row.folder.id) ?? 0 }}</span>
              </button>
            </div>

            <div
              v-for="dashboard in row.dashboards"
              v-show="row.isExpanded"
              :key="dashboard.id"
              class="tree-node-wrapper"
              :style="{ '--depth': `${row.depth + 1}` }"
            >
              <div
                class="tree-item-row tree-item-row-dashboard"
                :data-testid="`tree-dashboard-row-${dashboard.id}`"
                @mouseenter="showDashboardPreview(dashboard.id)"
                @mouseleave="clearDashboardPreview(dashboard.id)"
              >
                <span class="tree-toggle-placeholder"></span>
                <button
                  class="tree-item tree-file-item"
                  :class="{ 'tree-item-active': selectedTreeDashboardId === dashboard.id }"
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

          <div
            v-for="dashboard in unfiledTreeDashboards"
            :key="dashboard.id"
            class="tree-node-wrapper"
            :style="{ '--depth': '0' }"
          >
            <div
              class="tree-item-row tree-item-row-dashboard"
              :data-testid="`tree-dashboard-row-${dashboard.id}`"
              @mouseenter="showDashboardPreview(dashboard.id)"
              @mouseleave="clearDashboardPreview(dashboard.id)"
            >
              <span class="tree-toggle-placeholder"></span>
              <button
                class="tree-item tree-file-item"
                :class="{ 'tree-item-active': selectedTreeDashboardId === dashboard.id }"
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

        <div v-if="showInlineFolderForm" class="inline-folder-create" data-testid="inline-folder-create">
          <p v-if="activeCreateParent" class="inline-parent">Parent: {{ activeCreateParent.name }}</p>
          <form @submit.prevent="handleCreateFolder">
            <div class="form-group">
              <label for="folder-name">Folder Name</label>
              <input
                id="folder-name"
                v-model="folderName"
                type="text"
                placeholder="Operations"
                :disabled="creatingFolder"
                autocomplete="off"
              />
            </div>
            <p v-if="folderError" class="error-message">{{ folderError }}</p>
            <div class="inline-actions">
              <button type="button" class="btn btn-secondary" :disabled="creatingFolder" @click="closeCreateFolderModal">
                Cancel
              </button>
              <button type="submit" class="btn btn-primary" :disabled="creatingFolder">
                {{ creatingFolder ? 'Creating...' : 'Create' }}
              </button>
            </div>
          </form>
        </div>
      </aside>

      <section class="explorer-main">
        <div class="breadcrumbs" aria-label="Current folder path">
          <template v-for="(item, index) in breadcrumbs" :key="item.type === 'folder' ? `folder-${item.id}` : item.type">
            <button
              class="breadcrumb-item"
              :class="{ 'breadcrumb-item-active': index === breadcrumbs.length - 1 }"
              @click="onBreadcrumbSelect(item)"
            >
              {{ item.label }}
            </button>
            <ChevronRight v-if="index < breadcrumbs.length - 1" :size="14" class="breadcrumb-separator" />
          </template>
        </div>

        <p v-if="folderPermissionsMessage" class="success-message">{{ folderPermissionsMessage }}</p>
        <p v-if="moveError" class="section-error">{{ moveError }}</p>

        <div class="main-heading">
          <h2>{{ activeExplorerTitle }}</h2>
        </div>

        <div v-if="selectedFolderChildren.length > 0" class="subfolder-strip">
          <p>Subfolders</p>
          <div class="subfolder-list">
            <button
              v-for="child in selectedFolderChildren"
              :key="child.id"
              type="button"
              class="subfolder-chip"
              @click="selectExplorerFolder(child.id)"
            >
              <FolderIcon :size="14" />
              <span>{{ child.name }}</span>
              <span class="subfolder-chip-count">{{ folderDashboardCountMap.get(child.id) ?? 0 }}</span>
            </button>
          </div>
        </div>

        <div v-if="hasNoFolders" class="folder-cta" data-testid="folder-empty-cta">
          <div>
            <h2>No folders yet</h2>
            <p>Use folders to organize dashboards by team, service, or environment.</p>
          </div>
          <button v-if="canCreateFolder" class="btn btn-secondary" data-testid="new-folder-cta" @click="openCreateFolderModal">
            <FolderIcon :size="16" />
            <span>New Folder</span>
          </button>
        </div>

        <div class="folder-sections">
          <section
            v-if="rootDashboardsForMain.length > 0"
            class="folder-section"
            :class="{
              'folder-section-drop-active': dropTargetSectionId === normalizeSectionId(null),
            }"
            data-testid="folder-section-root"
            @dragover.prevent="onSectionDragOver(null)"
            @drop.prevent="onSectionDrop(null)"
          >
            <div class="dashboard-grid">
              <div
                v-for="dashboard in rootDashboardsForMain"
                :key="dashboard.id"
                class="dashboard-card"
                :class="{
                  'dashboard-card-dragging': draggingDashboardId === dashboard.id,
                  'dashboard-card-draggable': canManageDashboards,
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
                <div class="card-header">
                  <h3>{{ dashboard.title }}</h3>
                  <div class="card-actions" @click.stop>
                    <button class="btn-icon" @click="openEditModal(dashboard)" title="Edit">
                      <Pencil :size="16" />
                    </button>
                    <button class="btn-icon btn-icon-danger" @click="confirmDelete(dashboard)" title="Delete">
                      <Trash2 :size="16" />
                    </button>
                  </div>
                </div>
                <p v-if="dashboard.description" class="card-description">
                  {{ dashboard.description }}
                </p>
                <div class="card-meta">
                  <span>Created {{ formatDate(dashboard.created_at) }}</span>
                </div>
              </div>
            </div>
          </section>

          <section
            v-for="section in filteredSections"
            :key="section.id"
            class="folder-section"
            :class="{
              'folder-section-drop-active': dropTargetSectionId === normalizeSectionId(section.id),
            }"
            :data-testid="`folder-section-${section.id}`"
            @dragover.prevent="onSectionDragOver(section.id)"
            @drop.prevent="onSectionDrop(section.id)"
          >
            <div class="folder-section-header">
              <div class="folder-section-title">
                <FolderIcon :size="18" />
                <h2>{{ section.name }}</h2>
              </div>
              <div class="folder-section-meta">
                <span class="folder-count">{{ section.dashboards.length }}</span>
                <button
                  v-if="isOrgAdmin"
                  class="btn btn-secondary btn-sm"
                  :data-testid="`folder-permissions-${section.folder.id}`"
                  @click="openFolderPermissions(section.folder)"
                >
                  <Shield :size="14" />
                  Permissions
                </button>
              </div>
            </div>

            <p v-if="section.dashboards.length === 0" class="section-empty">
              No dashboards in this section yet.
            </p>

            <div v-else class="dashboard-grid">
              <div
                v-for="dashboard in section.dashboards"
                :key="dashboard.id"
                class="dashboard-card"
                :class="{
                  'dashboard-card-dragging': draggingDashboardId === dashboard.id,
                  'dashboard-card-draggable': canManageDashboards,
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
                <div class="card-header">
                  <h3>{{ dashboard.title }}</h3>
                  <div class="card-actions" @click.stop>
                    <button class="btn-icon" @click="openEditModal(dashboard)" title="Edit">
                      <Pencil :size="16" />
                    </button>
                    <button class="btn-icon btn-icon-danger" @click="confirmDelete(dashboard)" title="Delete">
                      <Trash2 :size="16" />
                    </button>
                  </div>
                </div>
                <p v-if="dashboard.description" class="card-description">
                  {{ dashboard.description }}
                </p>
                <div class="card-meta">
                  <span>Created {{ formatDate(dashboard.created_at) }}</span>
                </div>
              </div>
            </div>
          </section>

          <p v-if="filteredSections.length === 0 && rootDashboardsForMain.length === 0" class="section-empty">
            No folders or dashboards match your search.
          </p>
        </div>
      </section>

      <aside class="preview-pane" data-testid="dashboard-preview">
        <h3>Dashboard Preview</h3>
        <div v-if="hoveredDashboard" class="preview-card">
          <div class="preview-title-row">
            <FileText :size="16" />
            <h4>{{ hoveredDashboard.title }}</h4>
          </div>
          <p class="preview-description">
            {{ hoveredDashboard.description || 'No description provided.' }}
          </p>
          <dl class="preview-meta">
            <div>
              <dt>Folder</dt>
              <dd>{{ hoveredDashboardFolderName }}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{{ formatDate(hoveredDashboard.created_at) }}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{{ formatDate(hoveredDashboard.updated_at) }}</dd>
            </div>
          </dl>
        </div>
        <div v-else class="preview-empty">
          <p>Hover over a dashboard card to preview details.</p>
        </div>
      </aside>
    </div>

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

    <div v-if="showDeleteConfirm" class="fixed inset-0 flex items-center justify-center z-[1000] animate-[fadeIn_0.2s_ease-out]" style="background: rgba(3, 10, 18, 0.76); backdrop-filter: blur(8px)" @click.self="cancelDelete">
      <div class="modal delete-modal">
        <div class="modal-icon">
          <Trash2 :size="24" />
        </div>
        <h2>Delete Dashboard</h2>
        <p>Are you sure you want to delete "{{ deletingDashboard?.title }}"?</p>
        <p class="warning">This action cannot be undone.</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="cancelDelete">Cancel</button>
          <button class="btn btn-danger" @click="handleDelete">Delete</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.dashboard-list {
  padding: 1.5rem 1.75rem 2rem;
  max-width: 1560px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
  padding: 1rem 1.15rem;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: var(--color-surface-1);
  box-shadow: var(--shadow-sm);
}

.header-content h1 {
  margin-bottom: 0.25rem;
  font-family: var(--font-family-mono);
  font-size: 1.08rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.header-subtitle {
  color: var(--color-text-1);
  font-size: 0.86rem;
}

.header-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.58rem 1rem;
  border: 1px solid transparent;
  border-radius: 10px;
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-primary {
  background: #F59E0B;
  border-color: rgba(245, 158, 11, 0.4);
  color: #1a0f00;
  box-shadow: 0 8px 20px rgba(217, 119, 6, 0.24);
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 24px rgba(217, 119, 6, 0.28);
}

.btn-secondary {
  background: transparent;
  border-color: #F59E0B;
  color: #FCD34D;
}

.btn-secondary:hover {
  border-color: var(--color-border-strong);
  background: var(--color-bg-hover);
}

.btn-sm {
  padding: 0.35rem 0.7rem;
  font-size: 0.74rem;
}

.btn-danger {
  background: var(--color-danger);
  color: white;
}

.btn-danger:hover {
  background: var(--color-danger-hover);
}

.btn-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-1);
  cursor: pointer;
  transition: background-color 0.2s ease, color 0.2s ease;
}

.btn-icon:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-0);
}

.btn-icon-danger:hover {
  background: rgba(251, 113, 133, 0.15);
  color: var(--color-danger);
}

.state-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  text-align: center;
  color: var(--color-text-1);
  background: var(--color-surface-1);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  min-height: 320px;
}

.state-container.error {
  color: var(--color-danger);
}

.state-container h2 {
  margin: 1rem 0 0.5rem;
  color: var(--color-text-0);
}

.state-container p {
  margin-bottom: 1.25rem;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(50, 81, 115, 0.65);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 1rem;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.empty-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 120px;
  height: 120px;
  border: 1px solid var(--color-border);
  border-radius: 20px;
  background: linear-gradient(160deg, rgba(245, 158, 11, 0.14), rgba(99, 102, 241, 0.08));
  color: var(--color-text-2);
  margin-bottom: 1rem;
}

.empty-actions {
  display: flex;
  gap: 0.75rem;
}

.explorer-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
}

.explorer-sidebar,
.explorer-main,
.preview-pane {
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: var(--color-surface-1);
  box-shadow: var(--shadow-sm);
}

.explorer-sidebar {
  position: static;
  padding: 0.95rem;
  min-height: 640px;
}

.explorer-main,
.preview-pane {
  display: none;
}

.finder-header {
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-surface-2);
  padding: 0.58rem 0.65rem;
  margin-bottom: 0.65rem;
}

.finder-header .breadcrumbs {
  margin-bottom: 0;
}

.explorer-search {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-surface-2);
  color: var(--color-text-1);
  padding: 0.55rem 0.6rem;
  margin-bottom: 0.75rem;
}

.tree-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  margin-bottom: 0.6rem;
}

.tree-toolbar p {
  margin: 0;
  color: var(--color-text-1);
  font-size: 0.72rem;
  font-family: var(--font-family-mono);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.tree-toolbar-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.tree-toolbar-btn {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface-2);
  color: var(--color-text-1);
  font-size: 0.72rem;
  padding: 0.22rem 0.48rem;
  cursor: pointer;
  transition: border-color 0.2s ease, color 0.2s ease, background-color 0.2s ease;
}

.tree-toolbar-btn:hover {
  border-color: var(--color-border-strong);
  color: var(--color-text-0);
  background: var(--color-bg-hover);
}

.explorer-search input {
  width: 100%;
  border: none;
  background: transparent;
  color: var(--color-text-0);
  font-size: 0.82rem;
}

.explorer-search input:focus {
  outline: none;
}

.tree-nav {
  display: flex;
  flex-direction: column;
  gap: 0.22rem;
}

.tree-node-wrapper {
  --depth: 0;
}

.tree-item-row {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  padding-left: calc(var(--depth) * 14px);
  border-radius: 9px;
  border: 1px solid transparent;
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

.tree-item-row:hover {
  border-color: var(--color-border);
  background: rgba(245, 158, 11, 0.05);
}

.tree-item-row-drop-active {
  border-color: rgba(245, 158, 11, 0.72);
  background: rgba(245, 158, 11, 0.15);
}

.tree-toggle,
.tree-toggle-placeholder {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-1);
}

.tree-toggle {
  border: none;
  background: transparent;
  cursor: pointer;
}

.tree-toggle:hover {
  background: var(--color-bg-hover);
}

.tree-item {
  border: 1px solid transparent;
  background: transparent;
  color: var(--color-text-1);
  border-radius: 8px;
  width: 100%;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.5rem;
  font-size: 0.81rem;
  cursor: pointer;
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.tree-item:hover {
  border-color: rgba(245, 158, 11, 0.2);
  background: rgba(245, 158, 11, 0.08);
  color: var(--color-text-0);
}

.tree-item-active {
  border-color: rgba(245, 158, 11, 0.55);
  background: rgba(245, 158, 11, 0.18);
  color: var(--color-text-0);
}

.tree-item-active .tree-count {
  border-color: rgba(245, 158, 11, 0.45);
  background: rgba(245, 158, 11, 0.16);
  color: var(--color-text-0);
}

.tree-item-row-dashboard {
  border-color: transparent;
  background: transparent;
}

.tree-item-row-dashboard:hover {
  border-color: transparent;
  background: transparent;
}

.tree-file-item {
  font-size: 0.78rem;
  color: var(--color-text-2);
  padding-top: 0.32rem;
  padding-bottom: 0.32rem;
}

.tree-file-item[draggable='true'] {
  cursor: grab;
}

.tree-file-item[draggable='true']:active {
  cursor: grabbing;
}

.tree-file-item:hover {
  border-color: rgba(245, 158, 11, 0.2);
  color: var(--color-text-0);
}

.tree-file-item.tree-item-active {
  border-color: rgba(245, 158, 11, 0.45);
  background: rgba(245, 158, 11, 0.14);
}

.tree-count {
  margin-left: auto;
  min-width: 1.5rem;
  height: 1.5rem;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--color-surface-2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  font-family: var(--font-family-mono);
}

.inline-folder-create {
  margin-top: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-surface-2);
  padding: 0.65rem;
}

.inline-parent {
  margin: 0 0 0.45rem;
  color: var(--color-text-1);
  font-size: 0.76rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.form-group label {
  color: var(--color-text-0);
  font-size: 0.8rem;
}

.form-group input {
  padding: 0.58rem 0.65rem;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface-1);
  color: var(--color-text-0);
}

.form-group input:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: var(--focus-ring);
}

.inline-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.45rem;
  margin-top: 0.65rem;
}

.error-message {
  margin: 0.4rem 0 0;
  color: var(--color-danger);
  font-size: 0.8rem;
}

.explorer-main {
  padding: 0.95rem;
}

.breadcrumbs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.2rem;
  margin-bottom: 0.75rem;
}

.breadcrumb-item {
  border: none;
  background: transparent;
  color: var(--color-text-1);
  padding: 0.1rem 0.2rem;
  cursor: pointer;
  font-size: 0.8rem;
}

.breadcrumb-item-active {
  color: var(--color-text-0);
  font-weight: 600;
}

.breadcrumb-separator {
  color: var(--color-text-2);
}

.main-heading {
  margin-bottom: 0.8rem;
}

.subfolder-strip {
  margin-bottom: 0.9rem;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-surface-2);
  padding: 0.7rem;
}

.subfolder-strip p {
  margin: 0 0 0.5rem;
  color: var(--color-text-1);
  font-size: 0.72rem;
  font-family: var(--font-family-mono);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.subfolder-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.subfolder-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.42rem;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: 0.32rem 0.58rem;
  background: var(--color-surface-1);
  color: var(--color-text-1);
  font-size: 0.76rem;
  cursor: pointer;
  transition: border-color 0.2s ease, color 0.2s ease, transform 0.2s ease;
}

.subfolder-chip:hover {
  border-color: rgba(245, 158, 11, 0.45);
  color: var(--color-text-0);
  transform: translateY(-1px);
}

.subfolder-chip-count {
  min-width: 1.25rem;
  height: 1.25rem;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.66rem;
  font-family: var(--font-family-mono);
}

.main-heading h2 {
  margin: 0;
  font-size: 1rem;
  font-family: var(--font-family-mono);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.folder-cta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border: 1px dashed var(--color-border-strong);
  border-radius: 12px;
  padding: 0.95rem 1rem;
  background: var(--color-surface-2);
  margin-bottom: 0.85rem;
}

.folder-cta h2 {
  margin: 0;
  font-size: 0.92rem;
  font-family: var(--font-family-mono);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.folder-cta p {
  margin: 0.25rem 0 0;
  color: var(--color-text-1);
  font-size: 0.8rem;
}

.folder-sections {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.folder-section {
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-surface-2);
  padding: 0.9rem;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.folder-section-drop-active {
  border-color: rgba(245, 158, 11, 0.85);
  box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.3);
}

.folder-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  margin-bottom: 0.25rem;
}

.folder-section-title {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.folder-section-title h2 {
  font-size: 0.9rem;
  font-family: var(--font-family-mono);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.folder-section-meta {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}

.folder-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.7rem;
  height: 1.7rem;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--color-surface-1);
  color: var(--color-text-1);
  font-size: 0.72rem;
  font-family: var(--font-family-mono);
}

.folder-description {
  margin-bottom: 0.75rem;
  color: var(--color-text-1);
  font-size: 0.8rem;
}

.section-empty {
  margin: 0.65rem 0 0;
  color: var(--color-text-2);
  font-size: 0.82rem;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(265px, 1fr));
  gap: 0.85rem;
}

.dashboard-card {
  position: relative;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: linear-gradient(180deg, rgba(16, 27, 42, 0.92), rgba(14, 24, 38, 0.9));
  padding: 1rem;
  cursor: pointer;
  transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.dashboard-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 2px;
  background: linear-gradient(90deg, var(--color-accent), var(--color-accent-secondary));
  opacity: 0.5;
}

.dashboard-card:hover {
  border-color: rgba(245, 158, 11, 0.55);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.dashboard-card-draggable {
  cursor: grab;
}

.dashboard-card-draggable:active {
  cursor: grabbing;
}

.dashboard-card-dragging {
  opacity: 0.55;
  transform: scale(0.99);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.5rem;
  margin-bottom: 0.65rem;
}

.card-header h3 {
  font-size: 0.95rem;
  color: var(--color-text-0);
  line-height: 1.35;
}

.card-actions {
  display: flex;
  gap: 0.2rem;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.dashboard-card:hover .card-actions {
  opacity: 1;
}

.card-description {
  margin-bottom: 0.8rem;
  color: var(--color-text-1);
  font-size: 0.82rem;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-meta {
  color: var(--color-text-2);
  font-size: 0.7rem;
  font-family: var(--font-family-mono);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.preview-pane {
  position: sticky;
  top: 1rem;
  padding: 0.9rem;
}

.preview-pane h3 {
  margin: 0 0 0.7rem;
  font-size: 0.84rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-family: var(--font-family-mono);
  color: var(--color-text-1);
}

.preview-card {
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-surface-2);
  padding: 0.75rem;
}

.preview-title-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin-bottom: 0.45rem;
}

.preview-title-row h4 {
  font-size: 0.93rem;
  color: var(--color-text-0);
}

.preview-description {
  margin: 0 0 0.75rem;
  color: var(--color-text-1);
  font-size: 0.8rem;
  line-height: 1.45;
}

.preview-meta {
  margin: 0;
  display: grid;
  gap: 0.5rem;
}

.preview-meta div {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.preview-meta dt {
  color: var(--color-text-2);
  font-size: 0.68rem;
  text-transform: uppercase;
  font-family: var(--font-family-mono);
  letter-spacing: 0.05em;
}

.preview-meta dd {
  margin: 0;
  color: var(--color-text-0);
  font-size: 0.78rem;
}

.preview-empty {
  border: 1px dashed var(--color-border);
  border-radius: 10px;
  padding: 1rem 0.8rem;
  text-align: center;
  color: var(--color-text-1);
  font-size: 0.8rem;
}

.success-message {
  margin: 0 0 0.65rem;
  padding: 0.65rem 0.85rem;
  border-radius: 8px;
  border: 1px solid rgba(78, 205, 196, 0.3);
  background: rgba(78, 205, 196, 0.1);
  color: var(--color-success);
  font-size: 0.82rem;
}

.section-error {
  margin: 0 0 0.65rem;
  padding: 0.65rem 0.85rem;
  border-radius: 8px;
  border: 1px solid rgba(251, 113, 133, 0.35);
  background: rgba(251, 113, 133, 0.12);
  color: var(--color-danger);
  font-size: 0.82rem;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  background: rgba(3, 10, 18, 0.76);
  backdrop-filter: blur(8px);
}

.modal {
  width: 100%;
  max-width: 400px;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: var(--color-surface-1);
  padding: 2rem;
}

.delete-modal {
  text-align: center;
}

.modal-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  margin-bottom: 1rem;
  background: rgba(251, 113, 133, 0.15);
  color: var(--color-danger);
}

.delete-modal h2 {
  margin-bottom: 0.4rem;
}

.delete-modal p {
  margin-bottom: 0.45rem;
  color: var(--color-text-1);
}

.warning {
  color: var(--color-danger);
  font-size: 0.86rem;
}

.modal-actions {
  display: flex;
  justify-content: center;
  gap: 0.7rem;
  margin-top: 1.2rem;
}

@media (max-width: 1280px) {
  .explorer-shell {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 900px) {
  .dashboard-list {
    padding: 1rem;
  }

  .page-header {
    flex-direction: column;
    align-items: stretch;
  }

  .header-actions {
    width: 100%;
  }

  .header-actions .btn {
    flex: 1;
    justify-content: center;
  }

  .explorer-shell {
    grid-template-columns: 1fr;
  }

  .dashboard-grid {
    grid-template-columns: 1fr;
  }

  .folder-section-meta {
    flex-direction: column;
    align-items: flex-end;
  }

  .folder-cta {
    flex-direction: column;
    align-items: stretch;
  }

  .tree-toolbar {
    flex-direction: column;
    align-items: flex-start;
  }

  .tree-toolbar-actions {
    width: 100%;
  }

  .tree-toolbar-btn {
    flex: 1;
    text-align: center;
  }

  .subfolder-list {
    flex-direction: column;
  }

  .subfolder-chip {
    width: 100%;
    justify-content: space-between;
  }

  .empty-actions {
    flex-direction: column;
    width: 100%;
  }
}
</style>
