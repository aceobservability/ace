<script setup lang="ts">
import { LayoutDashboard, Plus, X, ExternalLink } from 'lucide-vue-next'
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { listDashboards, createDashboard } from '../api/dashboards'
import { createPanel, listPanels } from '../api/panels'
import { useOrganization } from '../composables/useOrganization'
import type { Dashboard } from '../types/dashboard'

const props = defineProps<{
  query: string
  signal: 'metrics' | 'logs' | 'traces'
  datasourceId: string
}>()

const emit = defineEmits<{
  close: []
}>()

const router = useRouter()
const { currentOrg } = useOrganization()

const dashboards = ref<Dashboard[]>([])
const loading = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)
const success = ref<{ dashboardId: string; title: string } | null>(null)

const selectedDashboardId = ref<string>('')
const newDashboardName = ref('')
const panelTitle = ref('Explore Query')

const isNewDashboard = computed(() => selectedDashboardId.value === '__new__')

const defaultPanelType = computed(() => {
  switch (props.signal) {
    case 'logs': return 'logs'
    case 'traces': return 'traces'
    default: return 'line'
  }
})

onMounted(async () => {
  if (!currentOrg.value) return
  loading.value = true
  try {
    dashboards.value = await listDashboards(currentOrg.value.id)
    const first = dashboards.value[0]
    if (first) {
      selectedDashboardId.value = first.id
    } else {
      selectedDashboardId.value = '__new__'
    }
  } catch {
    error.value = 'Failed to load dashboards'
  } finally {
    loading.value = false
  }
})

async function save() {
  if (!currentOrg.value) return
  saving.value = true
  error.value = null

  try {
    let dashboardId = selectedDashboardId.value
    let dashboardTitle = ''

    // Create new dashboard if needed
    if (isNewDashboard.value) {
      const name = newDashboardName.value.trim() || 'Untitled Dashboard'
      const dashboard = await createDashboard(currentOrg.value.id, { title: name })
      dashboardId = dashboard.id
      dashboardTitle = name
    } else {
      dashboardTitle = dashboards.value.find(d => d.id === dashboardId)?.title || ''
    }

    // Build query object matching the PanelSpec format
    const queryObj: Record<string, unknown> = { expr: props.query }
    if (props.datasourceId) {
      queryObj.datasource_id = props.datasourceId
    }

    // Find the next available Y position to avoid overlap
    let nextY = 0
    if (!isNewDashboard.value) {
      try {
        const existing = await listPanels(dashboardId)
        for (const p of existing) {
          const bottom = (p.grid_pos?.y ?? 0) + (p.grid_pos?.h ?? 0)
          if (bottom > nextY) nextY = bottom
        }
      } catch {
        // If we can't fetch panels, default to y=0
      }
    }

    // Create panel
    await createPanel(dashboardId, {
      title: panelTitle.value.trim() || 'Explore Query',
      type: defaultPanelType.value,
      grid_pos: { x: 0, y: nextY, w: 12, h: 8 },
      query: queryObj,
    })

    success.value = { dashboardId, title: dashboardTitle }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to save panel'
  } finally {
    saving.value = false
  }
}

function goToDashboard() {
  if (success.value) {
    router.push(`/app/dashboards/${success.value.dashboardId}`)
    emit('close')
  }
}
</script>

<template>
  <!-- Backdrop -->
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[200] flex items-center justify-center"
      @click.self="emit('close')"
    >
      <div class="absolute inset-0" :style="{ backgroundColor: 'var(--overlay-scrim)' }" />

      <!-- Modal -->
      <div
        class="relative w-full max-w-[480px] mx-4 rounded-xl animate-fade-in"
        :style="{
          backgroundColor: 'var(--color-surface-bright)',
          boxShadow: 'var(--shadow-xl)',
          border: '1px solid var(--color-outline-variant)',
        }"
        data-testid="export-dashboard-modal"
      >
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4" :style="{ borderBottom: '1px solid var(--color-outline-variant)' }">
          <div class="flex items-center gap-2">
            <LayoutDashboard :size="18" :style="{ color: 'var(--color-primary)' }" />
            <h2 class="text-lg font-semibold font-display m-0" :style="{ color: 'var(--color-on-surface)' }">
              Add to Dashboard
            </h2>
          </div>
          <button
            type="button"
            class="flex items-center justify-center w-7 h-7 rounded bg-transparent border-none cursor-pointer transition"
            :style="{ color: 'var(--color-outline)' }"
            @click="emit('close')"
          >
            <X :size="16" />
          </button>
        </div>

        <!-- Success state -->
        <div v-if="success" class="px-6 py-8 text-center">
          <div class="text-sm mb-4" :style="{ color: 'var(--color-secondary)' }">
            Panel added to <strong>{{ success.title }}</strong>
          </div>
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-sm px-4 py-2.5 text-sm font-semibold transition"
            :style="{
              background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
              color: '#fff',
              border: 'none',
            }"
            @click="goToDashboard"
            data-testid="export-go-to-dashboard"
          >
            <ExternalLink :size="14" />
            Open Dashboard
          </button>
        </div>

        <!-- Form -->
        <div v-else class="px-6 py-5 flex flex-col gap-5">
          <!-- Dashboard selector -->
          <div class="flex flex-col gap-2">
            <label class="text-xs font-semibold uppercase tracking-wide" :style="{ color: 'var(--color-outline)' }">
              Dashboard
            </label>
            <select
              v-model="selectedDashboardId"
              class="w-full rounded-sm px-3 py-2.5 text-sm cursor-pointer"
              :style="{
                backgroundColor: 'var(--color-surface-container-high)',
                color: 'var(--color-on-surface)',
                border: '1px solid var(--color-outline-variant)',
              }"
              :disabled="loading"
              data-testid="export-dashboard-select"
            >
              <option
                v-for="d in dashboards"
                :key="d.id"
                :value="d.id"
              >{{ d.title }}</option>
              <option value="__new__">+ New Dashboard</option>
            </select>
          </div>

          <!-- New dashboard name -->
          <div v-if="isNewDashboard" class="flex flex-col gap-2">
            <label class="text-xs font-semibold uppercase tracking-wide" :style="{ color: 'var(--color-outline)' }">
              Dashboard Name
            </label>
            <input
              v-model="newDashboardName"
              type="text"
              placeholder="Untitled Dashboard"
              class="w-full rounded-sm px-3 py-2.5 text-sm"
              :style="{
                backgroundColor: 'var(--color-surface-container-high)',
                color: 'var(--color-on-surface)',
                border: '1px solid var(--color-outline-variant)',
              }"
              data-testid="export-new-dashboard-name"
            />
          </div>

          <!-- Panel title -->
          <div class="flex flex-col gap-2">
            <label class="text-xs font-semibold uppercase tracking-wide" :style="{ color: 'var(--color-outline)' }">
              Panel Title
            </label>
            <input
              v-model="panelTitle"
              type="text"
              placeholder="Explore Query"
              class="w-full rounded-sm px-3 py-2.5 text-sm"
              :style="{
                backgroundColor: 'var(--color-surface-container-high)',
                color: 'var(--color-on-surface)',
                border: '1px solid var(--color-outline-variant)',
              }"
              data-testid="export-panel-title"
            />
          </div>

          <!-- Query preview -->
          <div class="flex flex-col gap-2">
            <label class="text-xs font-semibold uppercase tracking-wide" :style="{ color: 'var(--color-outline)' }">
              Query
            </label>
            <code
              class="block rounded-sm px-3 py-2 text-xs font-mono truncate"
              :style="{
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-on-surface-variant)',
                border: '1px solid var(--color-outline-variant)',
              }"
            >{{ query }}</code>
          </div>

          <!-- Error -->
          <div v-if="error" class="text-sm" :style="{ color: 'var(--color-error)' }">
            {{ error }}
          </div>
        </div>

        <!-- Footer -->
        <div v-if="!success" class="flex items-center justify-end gap-3 px-6 py-4" :style="{ borderTop: '1px solid var(--color-outline-variant)' }">
          <button
            type="button"
            class="px-4 py-2 text-sm font-medium rounded-sm bg-transparent border-none cursor-pointer transition"
            :style="{ color: 'var(--color-outline)' }"
            @click="emit('close')"
          >
            Cancel
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-sm px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
            :style="{
              background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
              color: '#fff',
              border: 'none',
            }"
            :disabled="saving || (!selectedDashboardId)"
            @click="save"
            data-testid="export-save-btn"
          >
            <Plus v-if="!saving" :size="14" />
            {{ saving ? 'Saving...' : 'Save Panel' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
