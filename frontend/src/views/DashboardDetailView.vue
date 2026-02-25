<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { GridLayout, GridItem } from 'vue3-grid-layout-next'
import { ArrowLeft, Plus, Trash2, LayoutGrid, AlertCircle, Settings } from 'lucide-vue-next'
import type { Dashboard } from '../types/dashboard'
import type { Panel as PanelType } from '../types/panel'
import { getDashboard } from '../api/dashboards'
import { listPanels, deletePanel, updatePanel } from '../api/panels'
import Panel from '../components/Panel.vue'
import PanelEditModal from '../components/PanelEditModal.vue'
import TimeRangePicker from '../components/TimeRangePicker.vue'
import { useTimeRange } from '../composables/useTimeRange'
import { useOrganization } from '../composables/useOrganization'
import { trackEvent } from '../analytics'

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

const colNum = 12
const rowHeight = 100

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

let unsubscribeRefresh: (() => void) | null = null

interface LayoutItem {
  i: string
  x: number
  y: number
  w: number
  h: number
}

const layout = computed<LayoutItem[]>(() => {
  return panels.value.map(panel => ({
    i: panel.id,
    x: panel.grid_pos.x,
    y: panel.grid_pos.y,
    w: panel.grid_pos.w,
    h: panel.grid_pos.h,
  }))
})

let saveLayoutTimeout: number | null = null

async function fetchDashboard() {
  try {
    dashboard.value = await getDashboard(dashboardId)
    trackEvent('dashboard_viewed', { dashboard_id: dashboardId })
  } catch (e) {
    dashboard.value = null
    panels.value = []
    error.value = dashboardLoadErrorMessage(e)
  }
}

function readStoredDashboardSettings(): Record<string, DashboardViewSettings> {
  const rawSettings = localStorage.getItem(DASHBOARD_VIEW_SETTINGS_KEY)
  if (!rawSettings) return {}
  try {
    return JSON.parse(rawSettings) as Record<string, DashboardViewSettings>
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
  trackEvent('dashboard_panel_add_opened', { dashboard_id: dashboardId })
}

function openEditPanel(panel: PanelType) {
  editingPanel.value = panel
  showPanelModal.value = true
  pauseAutoRefresh()
  trackEvent('dashboard_panel_edit_opened', { dashboard_id: dashboardId, panel_id: panel.id })
}

function closePanelModal() {
  showPanelModal.value = false
  editingPanel.value = null
  resumeAutoRefresh()
}

function onPanelSaved() {
  const wasEdit = Boolean(editingPanel.value)
  const panelId = editingPanel.value?.id
  trackEvent(wasEdit ? 'dashboard_panel_updated' : 'dashboard_panel_added', { dashboard_id: dashboardId, panel_id: panelId })
  closePanelModal()
  fetchPanels()
}

function confirmDeletePanel(panel: PanelType) {
  deletingPanel.value = panel
  showDeleteConfirm.value = true
  trackEvent('dashboard_panel_delete_opened', { dashboard_id: dashboardId, panel_id: panel.id })
}

function cancelDelete() {
  showDeleteConfirm.value = false
  deletingPanel.value = null
}

async function handleDeletePanel() {
  if (!deletingPanel.value) return
  try {
    await deletePanel(deletingPanel.value.id)
    trackEvent('dashboard_panel_deleted', { dashboard_id: dashboardId, panel_id: deletingPanel.value.id })
    cancelDelete()
    fetchPanels()
  } catch {
    error.value = 'Failed to delete panel'
  }
}

function goBack() { router.push('/app/dashboards') }

function openDashboardSettings() {
  trackEvent('dashboard_settings_opened', { dashboard_id: dashboardId })
  router.push(`/app/dashboards/${dashboardId}/settings/general`)
}

function openTraceTimeline(payload: { datasourceId: string, traceId: string }) {
  try {
    localStorage.setItem(TRACE_NAVIGATION_CONTEXT_KEY, JSON.stringify({ datasourceId: payload.datasourceId, traceId: payload.traceId, createdAt: Date.now() }))
  } catch { /* ignore */ }
  router.push('/app/explore/traces')
}

function onLayoutUpdated(newLayout: LayoutItem[]) {
  let movedPanels = 0
  let resizedPanels = 0
  for (const item of newLayout) {
    const panel = panels.value.find(p => p.id === item.i)
    if (panel) {
      const moved = panel.grid_pos.x !== item.x || panel.grid_pos.y !== item.y
      const resized = panel.grid_pos.w !== item.w || panel.grid_pos.h !== item.h
      if (moved || resized) {
        if (moved) movedPanels += 1
        if (resized) resizedPanels += 1
        panel.grid_pos.x = item.x
        panel.grid_pos.y = item.y
        panel.grid_pos.w = item.w
        panel.grid_pos.h = item.h
      }
    }
  }
  if (saveLayoutTimeout) clearTimeout(saveLayoutTimeout)
  if (movedPanels > 0) trackEvent('dashboard_panel_moved', { dashboard_id: dashboardId, panel_count: movedPanels })
  if (resizedPanels > 0) trackEvent('dashboard_panel_resized', { dashboard_id: dashboardId, panel_count: resizedPanels })
  saveLayoutTimeout = window.setTimeout(() => { saveLayoutToDatabase(newLayout) }, 500)
}

async function saveLayoutToDatabase(newLayout: LayoutItem[]) {
  for (const item of newLayout) {
    const panel = panels.value.find(p => p.id === item.i)
    if (panel) {
      try {
        await updatePanel(panel.id, { grid_pos: { x: item.x, y: item.y, w: item.w, h: item.h } })
      } catch (e) {
        console.error('Failed to save panel position:', e)
      }
    }
  }
}

function getPanelById(id: string): PanelType | undefined {
  return panels.value.find(p => p.id === id)
}

onMounted(async () => {
  if (!currentOrg.value) await fetchOrganizations()
  loadData()
  unsubscribeRefresh = onRefresh(() => { console.log('Time range updated:', timeRange.value) })
})

onUnmounted(() => {
  if (unsubscribeRefresh) unsubscribeRefresh()
  if (saveLayoutTimeout) clearTimeout(saveLayoutTimeout)
  cleanupTimeRange()
})
</script>

<template>
  <div class="py-[1.35rem] px-[1.8rem] max-w-[1600px] mx-auto max-md:p-[0.9rem]">
    <header class="flex justify-between items-center relative z-20 mb-[1.15rem] p-4 border border-border rounded-[14px] bg-surface-1 shadow-sm backdrop-blur-[8px] max-md:flex-col max-md:items-stretch max-md:gap-[0.85rem]">
      <div class="flex items-center gap-4">
        <button class="flex items-center justify-center w-[38px] h-[38px] bg-surface-2 border border-border rounded-[10px] text-text-1 cursor-pointer transition-all duration-200 hover:bg-bg-hover hover:border-border-strong hover:text-text-0" @click="goBack" title="Back to Dashboards">
          <ArrowLeft :size="20" />
        </button>
        <div v-if="dashboard">
          <h1 class="mb-1 font-mono text-[1.05rem] uppercase tracking-[0.04em]">{{ dashboard.title }}</h1>
          <p v-if="dashboard.description" class="text-text-1 text-sm">{{ dashboard.description }}</p>
        </div>
      </div>
      <div class="flex items-center gap-4 max-md:justify-between max-md:flex-wrap">
        <TimeRangePicker />
        <button v-if="dashboard" class="inline-flex items-center gap-2 py-[0.625rem] px-4 border border-accent rounded-[10px] text-[0.84rem] font-medium cursor-pointer transition-all duration-200 bg-transparent text-text-accent hover:bg-bg-hover hover:border-border-strong" data-testid="dashboard-settings-button" @click="openDashboardSettings">
          <Settings :size="16" />
          <span>Settings</span>
        </button>
        <button class="inline-flex items-center gap-2 py-[0.625rem] px-4 bg-accent border border-[rgba(245,158,11,0.4)] rounded-[10px] text-[#1a0f00] text-[0.84rem] font-medium cursor-pointer transition-all duration-200 hover:not-disabled:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed" @click="openAddPanel" :disabled="loading">
          <Plus :size="18" />
          <span>Add Panel</span>
        </button>
      </div>
    </header>

    <div v-if="loading" class="flex flex-col items-center justify-center p-16 text-center text-text-1 border border-border rounded-[14px] bg-surface-1 min-h-[320px]">
      <div class="w-10 h-10 border-3 border-[rgba(50,81,115,0.65)] border-t-accent rounded-full animate-[spin_0.8s_linear_infinite] mb-4"></div>
      <p>Loading dashboard...</p>
    </div>

    <div v-else-if="error" class="flex flex-col items-center justify-center p-16 text-center text-danger border border-border rounded-[14px] bg-surface-1 min-h-[320px]">
      <AlertCircle :size="48" />
      <p class="mb-6">{{ error }}</p>
      <button class="inline-flex items-center gap-2 py-[0.625rem] px-4 border border-accent rounded-[10px] text-[0.84rem] font-medium cursor-pointer bg-transparent text-text-accent hover:bg-bg-hover" @click="goBack">Back to Dashboards</button>
    </div>

    <template v-else>
      <div v-if="panels.length === 0" class="flex flex-col items-center justify-center p-16 text-center text-text-1 border border-border rounded-[14px] bg-surface-1 min-h-[320px]">
        <div class="flex items-center justify-center w-[120px] h-[120px] border border-border rounded-[16px] text-text-2 mb-4" style="background: linear-gradient(160deg, rgba(245, 158, 11, 0.14), rgba(99, 102, 241, 0.08))">
          <LayoutGrid :size="64" />
        </div>
        <h2 class="mt-4 mb-2">No panels yet</h2>
        <p class="mb-6">Add your first panel to start visualizing data</p>
        <button class="inline-flex items-center gap-2 py-[0.625rem] px-4 bg-accent border border-[rgba(245,158,11,0.4)] rounded-[10px] text-[#1a0f00] text-[0.84rem] font-medium cursor-pointer" @click="openAddPanel">
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
        class="relative z-1 min-h-[400px] pb-[0.7rem]"
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

    <div v-if="showDeleteConfirm" class="fixed inset-0 flex items-center justify-center z-100 animate-[fadeIn_0.2s_ease-out]" style="background: rgba(3, 10, 18, 0.76); backdrop-filter: blur(8px)" @click.self="cancelDelete">
      <div class="bg-surface-1 border border-border rounded-[14px] p-8 w-full max-w-[400px] text-center animate-[slideUp_0.3s_ease-out]">
        <div class="inline-flex items-center justify-center w-12 h-12 rounded-full text-danger mb-4" style="background: rgba(251, 113, 133, 0.15)">
          <Trash2 :size="24" />
        </div>
        <h2 class="mb-2">Delete Panel</h2>
        <p class="text-text-1 mb-2">Are you sure you want to delete "{{ deletingPanel?.title }}"?</p>
        <p class="text-danger text-sm">This action cannot be undone.</p>
        <div class="flex justify-center gap-3 mt-6">
          <button class="inline-flex items-center gap-2 py-[0.625rem] px-5 border border-accent rounded-[10px] text-text-accent bg-transparent cursor-pointer hover:bg-bg-hover" @click="cancelDelete">Cancel</button>
          <button class="inline-flex items-center gap-2 py-[0.625rem] px-5 bg-danger border-none rounded-[10px] text-white cursor-pointer hover:bg-danger-hover" @click="handleDeletePanel">Delete</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
/* vue-grid-layout global styles (3rd-party library containers) */
.vue-grid-layout { background: transparent; }
.vue-grid-item { touch-action: none; }
.vue-grid-item.vue-grid-placeholder {
  background: rgba(245, 158, 11, 0.18);
  border: 2px dashed var(--color-accent);
  border-radius: 8px;
}
.vue-grid-item > .vue-resizable-handle {
  position: absolute;
  width: 20px;
  height: 20px;
  bottom: 0;
  right: 0;
  cursor: se-resize;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 6 6' fill='%239eb0ca'%3E%3Cpolygon points='6 0 0 6 6 6'/%3E%3C/svg%3E") no-repeat;
  background-position: bottom right;
  padding: 0 3px 3px 0;
  background-repeat: no-repeat;
  background-origin: content-box;
  box-sizing: border-box;
  z-index: 10;
}
.vue-grid-item.vue-draggable-dragging { z-index: 100; opacity: 0.9; }
.vue-grid-item.vue-resizable-resizing { z-index: 100; }
</style>
