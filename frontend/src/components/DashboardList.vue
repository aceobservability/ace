<script setup lang="ts">
import {
  AlertCircle,
  LayoutGrid,
  Star,
} from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { listDashboards, updateDashboard } from '../api/dashboards'
import { listFolders } from '../api/folders'
import { useFavorites } from '../composables/useFavorites'
import { useOrganization } from '../composables/useOrganization'
import type { Dashboard } from '../types/dashboard'
import type { Folder } from '../types/folder'
import CreateDashboardModal from './CreateDashboardModal.vue'
import EmptyState from './EmptyState.vue'

const router = useRouter()
const route = useRoute()
const { currentOrgId, currentOrg } = useOrganization()
const { toggleFavorite, isFavorite } = useFavorites()

const props = defineProps<{
  searchQuery?: string
}>()

const dashboards = ref<Dashboard[]>([])
const folders = ref<Folder[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const moveError = ref<string | null>(null)
const showCreateModal = ref(false)
const createModalInitialMode = ref<'create' | 'import' | 'grafana'>('create')
const draggingDashboardId = ref<string | null>(null)
const dropTargetFolderId = ref<string | null>(null)
const movingDashboardId = ref<string | null>(null)
const selectedFolderId = ref<string | null>(null)

const canManageDashboards = computed(
  () => currentOrg.value?.role === 'admin' || currentOrg.value?.role === 'editor',
)

const normalizedSearchQuery = computed(() => (props.searchQuery ?? '').trim().toLowerCase())
const hasSearchQuery = computed(() => normalizedSearchQuery.value.length > 0)

const folderById = computed(() => {
  const map = new Map<string, Folder>()
  for (const folder of folders.value) {
    map.set(folder.id, folder)
  }
  return map
})

const isCompletelyEmpty = computed(
  () => dashboards.value.length === 0 && folders.value.length === 0,
)

function dashboardMatchesSearch(dashboard: Dashboard): boolean {
  if (!hasSearchQuery.value) {
    return true
  }
  return [dashboard.title, dashboard.description ?? '']
    .join(' ')
    .toLowerCase()
    .includes(normalizedSearchQuery.value)
}

function getFolderName(dashboard: Dashboard): string | null {
  if (!dashboard.folder_id) return null
  return folderById.value.get(dashboard.folder_id)?.name ?? null
}

const filteredDashboards = computed(() => {
  let result = dashboards.value.filter(dashboardMatchesSearch)

  if (selectedFolderId.value !== null) {
    if (selectedFolderId.value === '__unfiled__') {
      const folderIds = new Set(folders.value.map((f) => f.id))
      result = result.filter((d) => !d.folder_id || !folderIds.has(d.folder_id))
    } else {
      result = result.filter((d) => d.folder_id === selectedFolderId.value)
    }
  }

  return result.sort((a, b) => a.title.localeCompare(b.title))
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

watch(currentOrgId, () => {
  fetchDashboards()
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

function closeCreateModal() {
  showCreateModal.value = false
}

function onDashboardCreated() {
  closeCreateModal()
  fetchDashboards()
}

function openDashboard(dashboard: Dashboard) {
  router.push(`/app/dashboards/${dashboard.id}`)
}

function selectFolder(folderId: string | null) {
  selectedFolderId.value = selectedFolderId.value === folderId ? null : folderId
}

// Drag and drop
function onDashboardDragStart(dashboard: Dashboard) {
  if (!canManageDashboards.value) return
  moveError.value = null
  draggingDashboardId.value = dashboard.id
}

function onDashboardDragEnd() {
  draggingDashboardId.value = null
  dropTargetFolderId.value = null
}

function onFolderDragOver(folderId: string | null) {
  if (!canManageDashboards.value || !draggingDashboardId.value) return
  dropTargetFolderId.value = folderId
}

async function onFolderDrop(folderId: string | null) {
  if (!canManageDashboards.value || !draggingDashboardId.value || movingDashboardId.value) return

  const dashboardId = draggingDashboardId.value
  const targetFolderId = folderId
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
    item.id === dashboardId ? { ...item, folder_id: targetFolderId } : item,
  )

  try {
    await updateDashboard(dashboardId, { folder_id: targetFolderId })
  } catch (e) {
    dashboards.value = dashboards.value.map((item) =>
      item.id === dashboardId ? { ...item, folder_id: currentFolderId } : item,
    )
    moveError.value = e instanceof Error ? e.message : 'Failed to move dashboard'
  } finally {
    movingDashboardId.value = null
    onDashboardDragEnd()
  }
}

onMounted(fetchDashboards)

onMounted(() => {
  const modeFromQuery = normalizeCreateMode(route.query.newDashboardMode)
  if (!modeFromQuery) return

  openCreateModalWithMode(modeFromQuery)

  const nextQuery = { ...route.query }
  delete nextQuery.newDashboardMode
  router.replace({ query: nextQuery })
})

defineExpose({ fetchDashboards })
</script>

<template>
  <div>
    <!-- Loading state -->
    <div
      v-if="loading"
      class="flex min-h-[320px] flex-col items-center justify-center rounded-lg py-16 text-center"
      :style="{ color: 'var(--color-on-surface-variant)' }"
    >
      <div
        class="mb-4 h-10 w-10 animate-spin rounded-full border-3"
        :style="{ borderColor: 'var(--color-outline-variant)', borderTopColor: 'var(--color-primary)' }"
      ></div>
      <p>Loading dashboards...</p>
    </div>

    <!-- Error state -->
    <div
      v-else-if="error"
      class="flex min-h-[320px] flex-col items-center justify-center rounded-lg py-16 text-center"
      :style="{ color: 'var(--color-error)' }"
    >
      <AlertCircle :size="48" />
      <p class="mb-5 mt-4">{{ error }}</p>
      <button
        class="rounded-lg border px-5 py-2.5 text-sm font-medium transition-colors cursor-pointer"
        :style="{
          borderColor: 'var(--color-outline-variant)',
          color: 'var(--color-on-surface)',
          backgroundColor: 'var(--color-surface-container-low)',
        }"
        @click="fetchDashboards"
      >
        Try Again
      </button>
    </div>

    <!-- Empty state -->
    <div v-else-if="isCompletelyEmpty">
      <EmptyState
        :icon="LayoutGrid"
        title="No dashboards yet"
        description="Create your first dashboard to start monitoring your metrics."
      />
      <div class="flex items-center justify-center gap-3 -mt-8">
        <button
          class="inline-flex items-center rounded-lg border px-5 py-2.5 text-sm font-medium transition-colors hover:opacity-80 cursor-pointer"
          :style="{
            borderColor: 'var(--color-outline-variant)',
            color: 'var(--color-on-surface-variant)',
          }"
          @click="openCreateModal"
        >
          Create Dashboard
        </button>
        <button
          class="inline-flex items-center rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 cursor-pointer"
          :style="{
            background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
          }"
          @click="router.push('/app/dashboards/new/ai')"
        >
          Generate with AI
        </button>
      </div>
    </div>

    <!-- Dashboard card grid -->
    <div v-else>
      <!-- Move error message -->
      <p
        v-if="moveError"
        class="mb-4 rounded-lg px-4 py-3 text-sm"
        :style="{
          backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
          color: 'var(--color-error)',
          border: '1px solid color-mix(in srgb, var(--color-error) 30%, transparent)',
        }"
      >
        {{ moveError }}
      </p>

      <!-- Folder chips -->
      <div v-if="folders.length > 0" class="mb-4 flex flex-wrap gap-2">
        <button
          v-for="folder in folders"
          :key="folder.id"
          :data-testid="`folder-chip-${folder.id}`"
          class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer"
          :style="{
            backgroundColor: selectedFolderId === folder.id ? 'var(--color-primary-container)' : 'var(--color-surface-container)',
            color: selectedFolderId === folder.id ? 'var(--color-on-primary-container)' : 'var(--color-on-surface-variant)',
            border: `1px solid ${selectedFolderId === folder.id ? 'var(--color-primary)' : 'var(--color-outline-variant)'}`,
          }"
          @click="selectFolder(folder.id)"
          @dragover.prevent="onFolderDragOver(folder.id)"
          @drop.prevent="onFolderDrop(folder.id)"
          :data-drop-testid="`folder-drop-${folder.id}`"
        >
          {{ folder.name }}
        </button>
        <!-- Unfiled chip -->
        <button
          data-testid="folder-chip-unfiled"
          class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer"
          :style="{
            backgroundColor: selectedFolderId === '__unfiled__' ? 'var(--color-primary-container)' : 'var(--color-surface-container)',
            color: selectedFolderId === '__unfiled__' ? 'var(--color-on-primary-container)' : 'var(--color-on-surface-variant)',
            border: `1px solid ${selectedFolderId === '__unfiled__' ? 'var(--color-primary)' : 'var(--color-outline-variant)'}`,
          }"
          @click="selectFolder('__unfiled__')"
          @dragover.prevent="onFolderDragOver(null)"
          @drop.prevent="onFolderDrop(null)"
        >
          Unfiled
        </button>
      </div>

      <!-- Drop zones for folder chips (invisible but testable) -->
      <div
        v-for="folder in folders"
        :key="`drop-${folder.id}`"
        :data-testid="`folder-drop-${folder.id}`"
        class="hidden"
        @dragover.prevent="onFolderDragOver(folder.id)"
        @drop.prevent="onFolderDrop(folder.id)"
      ></div>

      <!-- Card grid -->
      <div class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));">
        <div
          v-for="dashboard in filteredDashboards"
          :key="dashboard.id"
          :data-testid="`dashboard-card-${dashboard.id}`"
          class="group relative rounded-lg p-4 transition-colors cursor-pointer"
          :style="{
            backgroundColor: 'var(--color-surface-container-low)',
          }"
          :draggable="canManageDashboards"
          @dragstart="onDashboardDragStart(dashboard)"
          @dragend="onDashboardDragEnd"
          @click="openDashboard(dashboard)"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0 flex-1">
              <h3
                class="font-display text-sm font-semibold leading-snug truncate"
                :style="{ color: 'var(--color-on-surface)' }"
              >
                {{ dashboard.title }}
              </h3>
              <p
                v-if="getFolderName(dashboard)"
                class="mt-1 text-xs"
                :style="{ color: 'var(--color-on-surface-variant)' }"
              >
                {{ getFolderName(dashboard) }}
              </p>
            </div>
            <button
              :data-testid="`favorite-btn-${dashboard.id}`"
              class="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors cursor-pointer"
              :style="{
                color: isFavorite(dashboard.id) ? 'var(--color-primary)' : 'var(--color-outline)',
              }"
              @click.stop="toggleFavorite(dashboard.id)"
            >
              <Star :size="16" :fill="isFavorite(dashboard.id) ? 'currentColor' : 'none'" />
            </button>
          </div>
          <p
            v-if="dashboard.description"
            class="mt-2 text-xs leading-relaxed line-clamp-2"
            :style="{ color: 'var(--color-on-surface-variant)' }"
          >
            {{ dashboard.description }}
          </p>
        </div>
      </div>

      <!-- No results -->
      <p
        v-if="filteredDashboards.length === 0"
        class="mt-6 text-center text-sm"
        :style="{ color: 'var(--color-on-surface-variant)' }"
      >
        No dashboards match your search.
      </p>
    </div>

    <!-- Create modal -->
    <CreateDashboardModal
      v-if="showCreateModal"
      :initial-mode="createModalInitialMode"
      @close="closeCreateModal"
      @created="onDashboardCreated"
    />
  </div>
</template>
