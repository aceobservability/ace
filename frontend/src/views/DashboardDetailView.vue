<script setup lang="ts">
import { AlertCircle, ArrowLeft, LayoutGrid, Plus, Settings, Trash2 } from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { GridItem, GridLayout } from 'vue3-grid-layout-next'
import { trackEvent } from '../analytics'
import { getDashboard } from '../api/dashboards'
import { deletePanel, listPanels, updatePanel } from '../api/panels'
import Panel from '../components/Panel.vue'
import PanelEditModal from '../components/PanelEditModal.vue'
import TimeRangePicker from '../components/TimeRangePicker.vue'
import { useOrganization } from '../composables/useOrganization'
import { useTimeRange } from '../composables/useTimeRange'
import type { Dashboard } from '../types/dashboard'
import type { Panel as PanelType } from '../types/panel'

const route = useRoute()
const router = useRouter()
const { currentOrg, fetchOrganizations } = useOrganization()

const dashboard = ref<Dashboard | null>(null)
const panels = ref<PanelType[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

const showPanelModal = ref(false)
const editingPanel = ref<PanelType | null>(null)
const showDeleteConfirm = ref(false)
const deletingPanel = ref<PanelType | null>(null)

const dashboardId = route.params.id as string

interface DashboardViewSettings {
  timeRangePreset: string
  refreshInterval: string
  variables: string[]
}

const DASHBOARD_VIEW_SETTINGS_KEY = 'dashboard_view_settings'
const TRACE_NAVIGATION_CONTEXT_KEY = 'dashboard_trace_navigation'

const dashboardSettings = ref<DashboardViewSettings>({
  timeRangePreset: '1h',
  refreshInterval: 'off',
  variables: [],
})

function dashboardLoadErrorMessage(cause: unknown): string {
  if (cause instanceof Error && cause.message === 'Not a member of this organization') {
    return 'You do not have permission to view this dashboard'
  }

  return 'Dashboard not found'
}

// Grid layout configuration
const colNum = 12
const rowHeight = 100

// Time range composable for panel data refresh
const {
  timeRange,
  selectedPreset,
  refreshIntervalValue,
  setPreset,
  setRefreshInterval,
  onRefresh,
  cleanup: cleanupTimeRange,
  pauseAutoRefresh,
  resumeAutoRefresh,
} = useTimeRange()

// Register refresh callback to refetch panel data when time range changes or auto-refresh triggers
let unsubscribeRefresh: (() => void) | null = null

// Convert panels to grid layout format
interface LayoutItem {
  i: string
  x: number
  y: number
  w: number
  h: number
}

const layout = computed<LayoutItem[]>(() => {
  return panels.value.map((panel) => ({
    i: panel.id,
    x: panel.grid_pos.x,
    y: panel.grid_pos.y,
    w: panel.grid_pos.w,
    h: panel.grid_pos.h,
  }))
})

// Debounce timer for saving layout changes
let saveLayoutTimeout: number | null = null

async function fetchDashboard() {
  try {
    dashboard.value = await getDashboard(dashboardId)
    trackEvent('dashboard_viewed', {
      dashboard_id: dashboardId,
    })
  } catch (e) {
    dashboard.value = null
    panels.value = []
    error.value = dashboardLoadErrorMessage(e)
    return
  }
}

function readStoredDashboardSettings(): Record<string, DashboardViewSettings> {
  const rawSettings = localStorage.getItem(DASHBOARD_VIEW_SETTINGS_KEY)
  if (!rawSettings) {
    return {}
  }

  try {
    const parsed = JSON.parse(rawSettings) as Record<string, DashboardViewSettings>
    return parsed
  } catch {
    return {}
  }
}

function loadDashboardViewSettings() {
  const allSettings = readStoredDashboardSettings()
  const storedSettings = allSettings[dashboardId]

  if (storedSettings) {
    dashboardSettings.value = {
      timeRangePreset: storedSettings.timeRangePreset,
      refreshInterval: storedSettings.refreshInterval,
      variables: storedSettings.variables || [],
    }
  } else {
    dashboardSettings.value = {
      timeRangePreset: selectedPreset.value,
      refreshInterval: refreshIntervalValue.value,
      variables: [],
    }
  }

  setPreset(dashboardSettings.value.timeRangePreset)
  setRefreshInterval(dashboardSettings.value.refreshInterval)
}

async function fetchPanels() {
  try {
    panels.value = await listPanels(dashboardId)
  } catch {
    error.value = 'Failed to load panels'
  }
}

async function loadData() {
  loading.value = true
  error.value = null
  await fetchDashboard()
  if (!error.value) {
    loadDashboardViewSettings()
    await fetchPanels()
  }
  loading.value = false
}

function openAddPanel() {
  editingPanel.value = null
  showPanelModal.value = true
  pauseAutoRefresh()
  trackEvent('dashboard_panel_add_opened', {
    dashboard_id: dashboardId,
  })
}

function openEditPanel(panel: PanelType) {
  editingPanel.value = panel
  showPanelModal.value = true
  pauseAutoRefresh()
  trackEvent('dashboard_panel_edit_opened', {
    dashboard_id: dashboardId,
    panel_id: panel.id,
  })
}

function closePanelModal() {
  showPanelModal.value = false
  editingPanel.value = null
  resumeAutoRefresh()
}

function onPanelSaved() {
  const wasEdit = Boolean(editingPanel.value)
  const panelId = editingPanel.value?.id

  trackEvent(wasEdit ? 'dashboard_panel_updated' : 'dashboard_panel_added', {
    dashboard_id: dashboardId,
    panel_id: panelId,
  })

  closePanelModal()
  fetchPanels()
}

function confirmDeletePanel(panel: PanelType) {
  deletingPanel.value = panel
  showDeleteConfirm.value = true
  trackEvent('dashboard_panel_delete_opened', {
    dashboard_id: dashboardId,
    panel_id: panel.id,
  })
}

function cancelDelete() {
  showDeleteConfirm.value = false
  deletingPanel.value = null
}

async function handleDeletePanel() {
  if (!deletingPanel.value) return

  try {
    await deletePanel(deletingPanel.value.id)
    trackEvent('dashboard_panel_deleted', {
      dashboard_id: dashboardId,
      panel_id: deletingPanel.value.id,
    })
    cancelDelete()
    fetchPanels()
  } catch {
    error.value = 'Failed to delete panel'
  }
}

function goBack() {
  router.push('/dashboards')
}

function openDashboardSettings() {
  trackEvent('dashboard_settings_opened', {
    dashboard_id: dashboardId,
  })
  router.push(`/dashboards/${dashboardId}/settings/general`)
}

function openTraceTimeline(payload: { datasourceId: string; traceId: string }) {
  try {
    localStorage.setItem(
      TRACE_NAVIGATION_CONTEXT_KEY,
      JSON.stringify({
        datasourceId: payload.datasourceId,
        traceId: payload.traceId,
        createdAt: Date.now(),
      }),
    )
  } catch {
    // Ignore localStorage write issues; navigation still works.
  }

  router.push('/explore/traces')
}

// Handle layout changes (drag/resize)
function onLayoutUpdated(newLayout: LayoutItem[]) {
  let movedPanels = 0
  let resizedPanels = 0

  // Update local panels state with new positions
  for (const item of newLayout) {
    const panel = panels.value.find((p) => p.id === item.i)
    if (panel) {
      const moved = panel.grid_pos.x !== item.x || panel.grid_pos.y !== item.y
      const resized = panel.grid_pos.w !== item.w || panel.grid_pos.h !== item.h
      const changed = moved || resized

      if (changed) {
        if (moved) {
          movedPanels += 1
        }

        if (resized) {
          resizedPanels += 1
        }

        panel.grid_pos.x = item.x
        panel.grid_pos.y = item.y
        panel.grid_pos.w = item.w
        panel.grid_pos.h = item.h
      }
    }
  }

  // Debounce database save
  if (saveLayoutTimeout) {
    clearTimeout(saveLayoutTimeout)
  }

  if (movedPanels > 0) {
    trackEvent('dashboard_panel_moved', {
      dashboard_id: dashboardId,
      panel_count: movedPanels,
    })
  }

  if (resizedPanels > 0) {
    trackEvent('dashboard_panel_resized', {
      dashboard_id: dashboardId,
      panel_count: resizedPanels,
    })
  }

  saveLayoutTimeout = window.setTimeout(() => {
    saveLayoutToDatabase(newLayout)
  }, 500)
}

async function saveLayoutToDatabase(newLayout: LayoutItem[]) {
  for (const item of newLayout) {
    const panel = panels.value.find((p) => p.id === item.i)
    if (panel) {
      try {
        await updatePanel(panel.id, {
          grid_pos: {
            x: item.x,
            y: item.y,
            w: item.w,
            h: item.h,
          },
        })
      } catch (e) {
        console.error('Failed to save panel position:', e)
      }
    }
  }
}

function getPanelById(id: string): PanelType | undefined {
  return panels.value.find((p) => p.id === id)
}

onMounted(async () => {
  if (!currentOrg.value) {
    await fetchOrganizations()
  }
  loadData()
  // Subscribe to time range changes to refetch panels
  unsubscribeRefresh = onRefresh(() => {
    // In the future, this will refetch panel data with the new time range
    // For now, we log the time range for debugging
    console.log('Time range updated:', timeRange.value)
  })
})

onUnmounted(() => {
  if (unsubscribeRefresh) {
    unsubscribeRefresh()
  }
  if (saveLayoutTimeout) {
    clearTimeout(saveLayoutTimeout)
  }
  cleanupTimeRange()
})
</script>

<template>
  <div class="mx-auto max-w-[1600px] px-6 py-5">
    <header class="relative z-20 mb-4 flex flex-col gap-3 rounded-xl border border-border bg-surface-raised px-6 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-center gap-4">
        <button
          class="flex h-[38px] w-[38px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
          @click="goBack"
          title="Back to Dashboards"
        >
          <ArrowLeft :size="20" />
        </button>
        <div v-if="dashboard">
          <h1 class="mb-0.5 font-mono text-lg font-semibold uppercase tracking-wide text-text-primary">{{ dashboard.title }}</h1>
          <p v-if="dashboard.description" class="text-sm text-slate-500">
            {{ dashboard.description }}
          </p>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-2">
          <TimeRangePicker />
        </div>
        <button
          v-if="dashboard"
          class="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-700"
          data-testid="dashboard-settings-button"
          @click="openDashboardSettings"
        >
          <Settings :size="16" />
          <span>Settings</span>
        </button>
        <button
          class="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          @click="openAddPanel"
          :disabled="loading"
        >
          <Plus :size="18" />
          <span>Add Panel</span>
        </button>
      </div>
    </header>

    <div v-if="loading" class="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-border bg-surface-raised py-20 text-center text-text-muted">
      <div class="mb-4 h-10 w-10 animate-spin rounded-full border-3 border-slate-200 border-t-emerald-600"></div>
      <p>Loading dashboard...</p>
    </div>

    <div v-else-if="error" class="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-rose-200 bg-rose-50 p-4 text-center text-sm text-rose-700">
      <AlertCircle :size="48" />
      <p class="mb-4 mt-4">{{ error }}</p>
      <button
        class="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-700"
        @click="goBack"
      >Back to Dashboards</button>
    </div>

    <template v-else>
      <div v-if="panels.length === 0" class="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-border bg-surface-raised px-8 py-16 text-center text-text-muted">
        <div class="mb-4 flex h-[120px] w-[120px] items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-400">
          <LayoutGrid :size="64" />
        </div>
        <h2 class="mb-2 mt-4 text-text-primary">No panels yet</h2>
        <p class="mb-6">Add your first panel to start visualizing data</p>
        <button
          class="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
          @click="openAddPanel"
        >
          <Plus :size="18" />
          <span>Add Panel</span>
        </button>
      </div>

      <GridLayout
        v-else
        :layout="layout"
        :col-num="colNum"
        :row-height="rowHeight"
        :margin="[12, 12]"
        :is-draggable="true"
        :is-resizable="true"
        :vertical-compact="true"
        :use-css-transforms="true"
        :responsive="true"
        :breakpoints="{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }"
        :cols="{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }"
        @layout-updated="onLayoutUpdated"
        class="relative z-[1] min-h-[400px] pb-2"
      >
        <GridItem
          v-for="item in layout"
          :key="item.i"
          :i="item.i"
          :x="item.x"
          :y="item.y"
          :w="item.w"
          :h="item.h"
          :min-w="2"
          :min-h="2"
          drag-allow-from=".panel-header"
          drag-ignore-from=".panel-actions"
        >
          <Panel
            :panel="getPanelById(item.i)!"
            @edit="openEditPanel"
            @delete="confirmDeletePanel"
            @open-trace="openTraceTimeline"
          />
        </GridItem>
      </GridLayout>
    </template>

    <PanelEditModal
      v-if="showPanelModal"
      :dashboard-id="dashboardId"
      :panel="editingPanel || undefined"
      @close="closePanelModal"
      @saved="onPanelSaved"
    />

    <div
      v-if="showDeleteConfirm"
      class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      @click.self="cancelDelete"
    >
      <div class="w-full max-w-[400px] rounded-xl border border-border bg-surface-raised p-8 text-center shadow-lg animate-slide-up">
        <div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
          <Trash2 :size="24" />
        </div>
        <h2 class="mb-2 text-text-primary">Delete Panel</h2>
        <p class="mb-1 text-slate-500">Are you sure you want to delete "{{ deletingPanel?.title }}"?</p>
        <p class="text-sm text-rose-600">This action cannot be undone.</p>
        <div class="mt-6 flex justify-center gap-3">
          <button
            class="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-700"
            @click="cancelDelete"
          >Cancel</button>
          <button
            class="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-rose-700"
            @click="handleDeletePanel"
          >Delete</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
/* vue-grid-layout global overrides */
.vue-grid-layout {
  background: transparent;
}

.vue-grid-item {
  touch-action: none;
}

.vue-grid-item.vue-grid-placeholder {
  background: oklch(92.4% .12 165 / 0.18);
  border: 2px dashed #059669;
  border-radius: 8px;
}

.vue-grid-item > .vue-resizable-handle {
  position: absolute;
  width: 20px;
  height: 20px;
  bottom: 0;
  right: 0;
  cursor: se-resize;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 6 6' fill='%2394a3b8'%3E%3Cpolygon points='6 0 0 6 6 6'/%3E%3C/svg%3E") no-repeat;
  background-position: bottom right;
  padding: 0 3px 3px 0;
  background-repeat: no-repeat;
  background-origin: content-box;
  box-sizing: border-box;
  z-index: 10;
}

.vue-grid-item.vue-draggable-dragging {
  z-index: 100;
  opacity: 0.9;
}

.vue-grid-item.vue-resizable-resizing {
  z-index: 100;
}
</style>
