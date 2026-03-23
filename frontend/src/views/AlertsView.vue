<script setup lang="ts">
import {
  AlertCircle,
  BellOff,
  BellRing,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  Plus,
  Radio,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  createSilence,
  expireSilence,
  fetchAlertManagerAlerts,
  fetchReceivers,
  fetchSilences,
} from '../composables/useAlertManager'
import { useAuth } from '../composables/useAuth'
import { useCommandContext } from '../composables/useCommandContext'
import { useDatasource } from '../composables/useDatasource'
import { useOrganization } from '../composables/useOrganization'
import { fetchAlerts, fetchGroups } from '../composables/useVMAlert'
import AiInsightCard from '../components/AiInsightCard.vue'
import StatusDot from '../components/StatusDot.vue'
import type {
  AMAlert,
  AMMatcher,
  AMReceiver,
  AMSilence,
  DataSource,
  VMAlertAlert,
  VMAlertRuleGroup,
} from '../types/datasource'
import { dataSourceTypeLabels } from '../types/datasource'

const { currentOrg } = useOrganization()
const { user } = useAuth()
const { alertingDatasources, fetchDatasources } = useDatasource()
const { registerContext, deregisterContext } = useCommandContext()

const selectedDatasourceId = ref('')
const activeTab = ref<'alerts' | 'groups' | 'am-alerts' | 'am-silences' | 'am-receivers'>('alerts')

// VMAlert data state
const alerts = ref<VMAlertAlert[]>([])
const groups = ref<VMAlertRuleGroup[]>([])

// AlertManager data state
const amAlerts = ref<AMAlert[]>([])
const amSilences = ref<AMSilence[]>([])
const amReceivers = ref<AMReceiver[]>([])

// AlertManager filter toggles
const amFilterActive = ref(true)
const amFilterSilenced = ref(true)
const amFilterInhibited = ref(true)

// Silence modal state
const showSilenceModal = ref(false)
const silenceMatchers = ref<AMMatcher[]>([{ name: '', value: '', isRegex: false, isEqual: true }])
const silenceStart = ref('')
const silenceEnd = ref('')
const silenceCreatedBy = ref('')
const silenceComment = ref('')
const silenceSaving = ref(false)
const silenceError = ref<string | null>(null)

// Shared state
const loading = ref(false)
const error = ref<string | null>(null)

// Auto-refresh
const autoRefresh = ref(false)
const lastRefreshed = ref<Date | null>(null)
let refreshInterval: ReturnType<typeof setInterval> | null = null

// Accordion state for rule groups
const expandedGroups = ref<Record<string, boolean>>({})

// Expandable row state
const expandedAlertIdx = ref<number | null>(null)

const selectedDatasource = computed<DataSource | undefined>(() =>
  alertingDatasources.value.find((d) => d.id === selectedDatasourceId.value),
)

const isAlertManager = computed(() => selectedDatasource.value?.type === 'alertmanager')
const isVMAlert = computed(() => selectedDatasource.value?.type === 'vmalert')

const formattedLastRefreshed = computed(() => {
  if (!lastRefreshed.value) return ''
  return lastRefreshed.value.toLocaleTimeString()
})

// VMAlert computed
const firingAlerts = computed(() => alerts.value.filter((a) => a.state === 'firing'))

const pendingAlerts = computed(() => alerts.value.filter((a) => a.state === 'pending'))

const inactiveAlerts = computed(() =>
  alerts.value.filter((a) => a.state !== 'firing' && a.state !== 'pending'),
)

const sortedAlerts = computed(() => [
  ...firingAlerts.value,
  ...pendingAlerts.value,
  ...inactiveAlerts.value,
])

// AlertManager computed
const sortedAMAlerts = computed(() => {
  const stateOrder: Record<string, number> = { active: 0, suppressed: 1, unprocessed: 2 }
  return [...amAlerts.value].sort((a, b) => {
    const aState = a.status?.state ?? 'unprocessed'
    const bState = b.status?.state ?? 'unprocessed'
    return (stateOrder[aState] ?? 3) - (stateOrder[bState] ?? 3)
  })
})

const activeSilences = computed(() =>
  amSilences.value.filter((s) => s.status.state === 'active' || s.status.state === 'pending'),
)

function stateToStatusDot(state: string): 'healthy' | 'warning' | 'critical' | 'info' {
  switch (state) {
    case 'firing':
    case 'active':
      return 'critical'
    case 'pending':
    case 'suppressed':
      return 'warning'
    default:
      return 'healthy'
  }
}

function toggleGroup(groupName: string) {
  expandedGroups.value[groupName] = !expandedGroups.value[groupName]
}

function isGroupExpanded(groupName: string): boolean {
  return !!expandedGroups.value[groupName]
}

function toggleAlertRow(idx: number) {
  expandedAlertIdx.value = expandedAlertIdx.value === idx ? null : idx
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

function formatInterval(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m`
}

function truncateId(id: string): string {
  return id.length > 8 ? `${id.substring(0, 8)}...` : id
}

function formatDateShort(dateStr: string): string {
  if (!dateStr) return '--'
  const d = new Date(dateStr)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function loadVMAlertData() {
  const [alertsRes, groupsRes] = await Promise.all([
    fetchAlerts(selectedDatasourceId.value),
    fetchGroups(selectedDatasourceId.value),
  ])
  alerts.value = alertsRes.data?.alerts ?? []
  groups.value = groupsRes.data?.groups ?? []
}

async function loadAlertManagerData() {
  const [alertsRes, silencesRes, receiversRes] = await Promise.all([
    fetchAlertManagerAlerts(selectedDatasourceId.value, {
      active: amFilterActive.value,
      silenced: amFilterSilenced.value,
      inhibited: amFilterInhibited.value,
    }),
    fetchSilences(selectedDatasourceId.value),
    fetchReceivers(selectedDatasourceId.value),
  ])
  amAlerts.value = alertsRes ?? []
  amSilences.value = silencesRes ?? []
  amReceivers.value = receiversRes ?? []
}

async function loadAlertManagerAlerts() {
  if (!selectedDatasourceId.value) return
  loading.value = true
  error.value = null
  try {
    amAlerts.value = await fetchAlertManagerAlerts(selectedDatasourceId.value, {
      active: amFilterActive.value,
      silenced: amFilterSilenced.value,
      inhibited: amFilterInhibited.value,
    })
    lastRefreshed.value = new Date()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to fetch alerts'
  } finally {
    loading.value = false
  }
}

async function loadData() {
  if (!selectedDatasourceId.value) return

  loading.value = true
  error.value = null

  try {
    if (isAlertManager.value) {
      await loadAlertManagerData()
    } else {
      await loadVMAlertData()
    }
    lastRefreshed.value = new Date()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to fetch data'
  } finally {
    loading.value = false
  }
}

function toggleAutoRefresh() {
  autoRefresh.value = !autoRefresh.value
  if (autoRefresh.value) {
    startAutoRefresh()
  } else {
    stopAutoRefresh()
  }
}

function startAutoRefresh() {
  stopAutoRefresh()
  refreshInterval = setInterval(() => {
    loadData()
  }, 30_000)
}

function stopAutoRefresh() {
  if (refreshInterval !== null) {
    clearInterval(refreshInterval)
    refreshInterval = null
  }
}

function openSilenceModal() {
  silenceMatchers.value = [{ name: '', value: '', isRegex: false, isEqual: true }]
  const now = new Date()
  const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000)
  silenceStart.value = toLocalDatetimeString(now)
  silenceEnd.value = toLocalDatetimeString(twoHoursLater)
  silenceCreatedBy.value = user.value?.email || user.value?.name || ''
  silenceComment.value = ''
  silenceError.value = null
  showSilenceModal.value = true
}

function closeSilenceModal() {
  showSilenceModal.value = false
}

function addMatcher() {
  silenceMatchers.value.push({ name: '', value: '', isRegex: false, isEqual: true })
}

function removeMatcher(idx: number) {
  if (silenceMatchers.value.length > 1) {
    silenceMatchers.value.splice(idx, 1)
  }
}

function toLocalDatetimeString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function handleCreateSilence() {
  silenceError.value = null

  const validMatchers = silenceMatchers.value.filter((m) => m.name.trim() !== '')
  if (validMatchers.length === 0) {
    silenceError.value = 'At least one matcher is required'
    return
  }

  if (!silenceComment.value.trim()) {
    silenceError.value = 'Comment is required'
    return
  }

  const startDate = new Date(silenceStart.value)
  const endDate = new Date(silenceEnd.value)
  if (endDate <= startDate) {
    silenceError.value = 'End time must be after start time'
    return
  }

  silenceSaving.value = true
  try {
    await createSilence(selectedDatasourceId.value, {
      matchers: validMatchers.map((m) => ({
        name: m.name.trim(),
        value: m.value.trim(),
        isRegex: m.isRegex,
        isEqual: m.isEqual,
      })),
      startsAt: startDate.toISOString(),
      endsAt: endDate.toISOString(),
      createdBy: silenceCreatedBy.value.trim() || 'unknown',
      comment: silenceComment.value.trim(),
    })
    closeSilenceModal()
    amSilences.value = await fetchSilences(selectedDatasourceId.value)
  } catch (e) {
    silenceError.value = e instanceof Error ? e.message : 'Failed to create silence'
  } finally {
    silenceSaving.value = false
  }
}

async function handleExpireSilence(silenceId: string) {
  try {
    await expireSilence(selectedDatasourceId.value, silenceId)
    amSilences.value = await fetchSilences(selectedDatasourceId.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to expire silence'
  }
}

// Reset data on datasource change
watch(selectedDatasourceId, () => {
  alerts.value = []
  groups.value = []
  amAlerts.value = []
  amSilences.value = []
  amReceivers.value = []
  error.value = null
  expandedGroups.value = {}
  expandedAlertIdx.value = null

  if (selectedDatasource.value?.type === 'alertmanager') {
    activeTab.value = 'am-alerts'
  } else {
    activeTab.value = 'alerts'
  }

  if (selectedDatasourceId.value) {
    loadData()
  }
})

// Re-fetch AM alerts when filter toggles change
watch([amFilterActive, amFilterSilenced, amFilterInhibited], () => {
  if (isAlertManager.value && selectedDatasourceId.value) {
    loadAlertManagerAlerts()
  }
})

watch(alertingDatasources, (ds) => {
  if (ds.length > 0 && !selectedDatasourceId.value) {
    selectedDatasourceId.value = ds[0].id
  }
})

onMounted(() => {
  registerContext({
    viewName: 'Alerts',
    viewRoute: '/app/alerts',
    description: 'Alert and incident explorer — monitor active alerts and alerting rule groups',
  })

  if (currentOrg.value) {
    fetchDatasources(currentOrg.value.id)
  }
})

watch(
  () => currentOrg.value?.id,
  (orgId, prevOrgId) => {
    if (orgId && orgId !== prevOrgId) {
      fetchDatasources(orgId)
    }
  },
)

onUnmounted(() => {
  stopAutoRefresh()
  deregisterContext()
})
</script>

<template>
  <div
    class="px-8 py-6 max-w-5xl mx-auto"
    :style="{ color: 'var(--color-on-surface)' }"
  >
    <!-- Page header -->
    <header
      class="flex items-center justify-between gap-4 mb-6 rounded-lg px-5 py-4"
      :style="{
        backgroundColor: 'var(--color-surface-container-low)',
      }"
    >
      <div>
        <h1
          class="flex items-center gap-2 text-base font-bold font-display tracking-wide m-0"
          :style="{ color: 'var(--color-on-surface)' }"
        >
          <BellRing :size="20" />
          Alerts
        </h1>
        <p
          class="text-sm mt-1 mb-0"
          :style="{ color: 'var(--color-on-surface-variant)' }"
        >
          Monitor active alerts and alerting rule groups
        </p>
      </div>
      <div class="flex items-center gap-2">
        <select
          v-model="selectedDatasourceId"
          data-testid="alerts-datasource-select"
          class="px-3 py-2 pr-8 rounded-sm text-sm appearance-none focus:outline-none"
          :style="{
            backgroundColor: 'var(--color-surface-container-high)',
            color: 'var(--color-on-surface)',
            border: '1px solid var(--color-outline-variant)',
          }"
          :disabled="alertingDatasources.length === 0"
        >
          <option value="" disabled>
            {{ alertingDatasources.length === 0 ? 'No alerting datasources' : 'Select datasource' }}
          </option>
          <option
            v-for="ds in alertingDatasources"
            :key="ds.id"
            :value="ds.id"
          >
            {{ ds.name }} ({{ dataSourceTypeLabels[ds.type] }})
          </option>
        </select>
        <button
          class="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-sm text-sm font-medium cursor-pointer transition disabled:opacity-50 disabled:cursor-not-allowed"
          :style="{
            backgroundColor: 'var(--color-surface-container-high)',
            color: 'var(--color-on-surface-variant)',
            border: '1px solid var(--color-outline-variant)',
          }"
          data-testid="alerts-refresh-btn"
          :disabled="!selectedDatasourceId || loading"
          @click="loadData"
          title="Refresh"
        >
          <Loader2 v-if="loading" :size="14" class="animate-spin" />
          <RefreshCw v-else :size="14" />
        </button>
        <button
          class="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-sm text-sm font-medium cursor-pointer transition disabled:opacity-50 disabled:cursor-not-allowed"
          :style="{
            backgroundColor: autoRefresh ? 'color-mix(in srgb, var(--color-primary) 15%, transparent)' : 'var(--color-surface-container-high)',
            color: autoRefresh ? 'var(--color-primary)' : 'var(--color-on-surface)',
            border: autoRefresh ? '1px solid var(--color-primary)' : '1px solid var(--color-outline-variant)',
          }"
          data-testid="alerts-auto-refresh-btn"
          :disabled="!selectedDatasourceId"
          @click="toggleAutoRefresh"
          title="Auto-refresh every 30s"
        >
          <Clock :size="14" />
          Auto
        </button>
        <span v-if="lastRefreshed" class="flex items-center gap-2 text-xs font-mono" :style="{ color: 'var(--color-outline)' }">
          <span v-if="autoRefresh" class="w-1.5 h-1.5 rounded-full" :style="{ backgroundColor: 'var(--color-primary)' }"></span>
          {{ formattedLastRefreshed }}
        </span>
      </div>
    </header>

    <!-- No datasource selected -->
    <div v-if="!selectedDatasourceId && alertingDatasources.length === 0" class="flex flex-col items-center justify-center py-16 px-8 text-center gap-4">
      <BellOff :size="48" :style="{ color: 'var(--color-outline)' }" />
      <h3 class="text-lg font-semibold m-0" :style="{ color: 'var(--color-on-surface)' }">No alerting datasources configured</h3>
      <p class="text-sm m-0" :style="{ color: 'var(--color-on-surface-variant)' }">Add a VMAlert or AlertManager datasource in Data Sources settings to view alerts.</p>
    </div>

    <!-- Error state -->
    <div
      v-else-if="error"
      class="flex items-center gap-2 px-4 py-3 rounded-sm text-sm mb-4"
      :style="{
        backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
        color: 'var(--color-error)',
      }"
    >
      <AlertCircle :size="16" />
      {{ error }}
    </div>

    <!-- Loading skeleton -->
    <div v-else-if="loading && alerts.length === 0 && groups.length === 0 && amAlerts.length === 0 && amSilences.length === 0" class="flex flex-col gap-3 py-4">
      <div v-for="i in 5" :key="i" class="flex gap-4 items-center">
        <div class="h-3.5 rounded animate-pulse w-40" :style="{ backgroundColor: 'var(--color-surface-container-high)' }"></div>
        <div class="h-3.5 rounded animate-pulse w-15" :style="{ backgroundColor: 'var(--color-surface-container-high)' }"></div>
        <div class="h-3.5 rounded animate-pulse w-55" :style="{ backgroundColor: 'var(--color-surface-container-high)' }"></div>
        <div class="h-3.5 rounded animate-pulse w-32" :style="{ backgroundColor: 'var(--color-surface-container-high)' }"></div>
      </div>
    </div>

    <!-- VMAlert: Dense Table View -->
    <template v-else-if="selectedDatasourceId && isVMAlert">
      <!-- Tab sub-nav -->
      <div class="flex gap-1 mb-6" :style="{ borderBottom: '1px solid var(--color-outline-variant)' }">
        <button
          class="px-4 py-2.5 text-sm font-medium transition cursor-pointer bg-transparent"
          :style="{
            color: activeTab === 'alerts' ? 'var(--color-primary)' : 'var(--color-outline)',
            borderBottom: activeTab === 'alerts' ? '2px solid var(--color-primary)' : '2px solid transparent',
          }"
          data-testid="alerts-tab-alerts"
          @click="activeTab = 'alerts'"
        >
          Active Alerts
          <span
            v-if="firingAlerts.length > 0"
            class="ml-1.5 rounded-sm px-2 py-0.5 text-xs font-mono"
            :style="{
              backgroundColor: 'color-mix(in srgb, var(--color-error) 15%, transparent)',
              color: 'var(--color-error)',
            }"
          >{{ firingAlerts.length }}</span>
        </button>
        <button
          class="px-4 py-2.5 text-sm font-medium transition cursor-pointer bg-transparent"
          :style="{
            color: activeTab === 'groups' ? 'var(--color-primary)' : 'var(--color-outline)',
            borderBottom: activeTab === 'groups' ? '2px solid var(--color-primary)' : '2px solid transparent',
          }"
          data-testid="alerts-tab-groups"
          @click="activeTab = 'groups'"
        >
          Rule Groups
          <span
            v-if="groups.length > 0"
            class="ml-1.5 rounded-sm px-2 py-0.5 text-xs font-mono"
            :style="{
              backgroundColor: 'var(--color-surface-container-high)',
              color: 'var(--color-outline)',
            }"
          >{{ groups.length }}</span>
        </button>
      </div>

      <!-- Active Alerts tab — Dense Table -->
      <div v-if="activeTab === 'alerts'">
        <!-- AI Insight Card for firing alerts -->
        <AiInsightCard
          v-if="firingAlerts.length > 0"
          title="AI Root Cause Analysis (placeholder)"
          :description="`${firingAlerts.length} alert${firingAlerts.length > 1 ? 's' : ''} firing. Root cause analysis pending — connect an AI provider in Settings to enable live diagnostics.`"
          :timestamp="formattedLastRefreshed || 'just now'"
          type="anomaly"
          class="mb-4"
        />

        <div v-if="sortedAlerts.length === 0" class="flex flex-col items-center justify-center py-10 px-6 text-center gap-3">
          <BellOff :size="36" :style="{ color: 'var(--color-outline)' }" />
          <h3 class="text-lg font-semibold m-0" :style="{ color: 'var(--color-on-surface)' }">No alerts firing</h3>
          <p class="text-sm m-0" :style="{ color: 'var(--color-on-surface-variant)' }">All quiet -- no active or pending alerts.</p>
        </div>

        <table v-else class="w-full border-collapse" data-testid="alert-table">
          <thead data-testid="alert-table-header">
            <tr>
              <th
                class="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3"
                :style="{ color: 'var(--color-outline)' }"
              >Status</th>
              <th
                class="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3"
                :style="{ color: 'var(--color-outline)' }"
              >Alert</th>
              <th
                class="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3"
                :style="{ color: 'var(--color-outline)' }"
              >Labels</th>
              <th
                class="text-right text-xs font-semibold uppercase tracking-wider px-4 py-3"
                :style="{ color: 'var(--color-outline)' }"
              >Active Since</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="(alert, idx) in sortedAlerts" :key="idx">
              <tr
                data-testid="alert-row"
                class="cursor-pointer transition-colors"
                :style="{
                  backgroundColor: expandedAlertIdx === idx
                    ? 'var(--color-surface-container-high)'
                    : 'transparent',
                }"
                @click="toggleAlertRow(idx)"
                @mouseenter="($event.currentTarget as HTMLElement).style.backgroundColor = 'var(--color-surface-container-high)'"
                @mouseleave="($event.currentTarget as HTMLElement).style.backgroundColor = expandedAlertIdx === idx ? 'var(--color-surface-container-high)' : 'transparent'"
              >
                <td class="px-4 py-3">
                  <StatusDot
                    :status="stateToStatusDot(alert.state)"
                    :pulse="alert.state === 'firing'"
                    :size="8"
                  />
                </td>
                <td class="px-4 py-3">
                  <span class="text-sm font-semibold" :style="{ color: 'var(--color-on-surface)' }">{{ alert.name }}</span>
                </td>
                <td class="px-4 py-3">
                  <div class="flex flex-wrap gap-1.5" v-if="alert.labels && Object.keys(alert.labels).length > 0">
                    <span
                      v-for="(value, key) in alert.labels"
                      :key="String(key)"
                      class="inline-flex rounded-sm px-2 py-0.5 text-xs font-mono"
                      :style="{
                        backgroundColor: 'var(--color-surface-container-high)',
                        color: 'var(--color-on-surface-variant)',
                      }"
                    >
                      {{ key }}={{ value }}
                    </span>
                  </div>
                </td>
                <td class="px-4 py-3 text-right">
                  <span class="text-xs font-mono" :style="{ color: 'var(--color-outline)' }">
                    {{ alert.activeAt || '--' }}
                  </span>
                </td>
              </tr>
              <!-- Expandable detail row -->
              <tr v-if="expandedAlertIdx === idx" data-testid="alert-detail">
                <td colspan="4" class="px-4 py-4" :style="{ backgroundColor: 'var(--color-surface-container-low)' }">
                  <div class="flex flex-col gap-2">
                    <div class="flex items-center gap-3">
                      <span class="text-xs font-semibold uppercase tracking-wider" :style="{ color: 'var(--color-outline)' }">State</span>
                      <span
                        class="rounded-sm px-2 py-0.5 text-xs font-semibold font-mono"
                        :style="{
                          backgroundColor: alert.state === 'firing'
                            ? 'color-mix(in srgb, var(--color-error) 15%, transparent)'
                            : alert.state === 'pending'
                              ? 'color-mix(in srgb, var(--color-tertiary) 15%, transparent)'
                              : 'var(--color-surface-container-high)',
                          color: alert.state === 'firing'
                            ? 'var(--color-error)'
                            : alert.state === 'pending'
                              ? 'var(--color-tertiary)'
                              : 'var(--color-on-surface-variant)',
                        }"
                      >{{ alert.state }}</span>
                    </div>
                    <div v-if="alert.labels && Object.keys(alert.labels).length > 0">
                      <span class="text-xs font-semibold uppercase tracking-wider" :style="{ color: 'var(--color-outline)' }">Labels</span>
                      <div class="flex flex-wrap gap-1.5 mt-1">
                        <span
                          v-for="(value, key) in alert.labels"
                          :key="String(key)"
                          class="inline-flex rounded-sm px-2 py-0.5 text-xs font-mono"
                          :style="{
                            backgroundColor: 'var(--color-surface-container-high)',
                            color: 'var(--color-on-surface-variant)',
                          }"
                        >
                          {{ key }}={{ value }}
                        </span>
                      </div>
                    </div>
                    <div class="text-xs font-mono" :style="{ color: 'var(--color-outline)' }">
                      Active since: {{ alert.activeAt || '--' }}
                    </div>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <!-- Rule Groups tab -->
      <div v-if="activeTab === 'groups'">
        <div v-if="groups.length === 0" class="flex flex-col items-center justify-center py-10 px-6 text-center gap-3">
          <BellOff :size="36" :style="{ color: 'var(--color-outline)' }" />
          <h3 class="text-lg font-semibold m-0" :style="{ color: 'var(--color-on-surface)' }">No rule groups</h3>
          <p class="text-sm m-0" :style="{ color: 'var(--color-on-surface-variant)' }">No alerting or recording rule groups found.</p>
        </div>

        <div v-else class="flex flex-col gap-3">
          <div
            v-for="group in groups"
            :key="group.name"
            class="rounded-lg overflow-hidden"
            :style="{ backgroundColor: 'var(--color-surface-container-low)' }"
          >
            <button
              class="flex items-center justify-between w-full px-4 py-3 bg-transparent border-none text-left cursor-pointer transition"
              @click="toggleGroup(group.name)"
              @mouseenter="($event.currentTarget as HTMLElement).style.backgroundColor = 'var(--color-surface-container-high)'"
              @mouseleave="($event.currentTarget as HTMLElement).style.backgroundColor = 'transparent'"
            >
              <div class="flex items-center gap-2">
                <component
                  :is="isGroupExpanded(group.name) ? ChevronDown : ChevronRight"
                  :size="16"
                  :style="{ color: 'var(--color-outline)' }"
                />
                <span class="text-sm font-semibold" :style="{ color: 'var(--color-on-surface)' }">{{ group.name }}</span>
              </div>
              <span class="text-xs font-mono" :style="{ color: 'var(--color-outline)' }">
                {{ group.rules.length }} rule{{ group.rules.length !== 1 ? 's' : '' }}
                · every {{ formatInterval(group.interval) }}
              </span>
            </button>

            <div v-if="isGroupExpanded(group.name)" class="px-4 py-3" :style="{ borderTop: '1px solid var(--color-outline-variant)' }">
              <div class="flex flex-col">
                <div
                  v-for="(rule, rIdx) in group.rules"
                  :key="rIdx"
                  class="py-3"
                  :style="rIdx > 0 ? { borderTop: '1px solid var(--color-outline-variant)' } : {}"
                >
                  <div class="flex items-center gap-2 mb-2 flex-wrap">
                    <span class="text-sm font-semibold" :style="{ color: 'var(--color-on-surface)' }">{{ rule.name }}</span>
                    <span
                      class="rounded px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide"
                      :style="{
                        backgroundColor: rule.type === 'alerting'
                          ? 'color-mix(in srgb, var(--color-error) 15%, transparent)'
                          : 'color-mix(in srgb, var(--color-primary) 15%, transparent)',
                        color: rule.type === 'alerting' ? 'var(--color-error)' : 'var(--color-primary)',
                      }"
                    >
                      {{ rule.type }}
                    </span>
                    <span
                      v-if="rule.state"
                      class="rounded-sm px-2 py-0.5 text-xs font-semibold"
                      :style="{
                        backgroundColor: rule.state === 'firing'
                          ? 'color-mix(in srgb, var(--color-error) 15%, transparent)'
                          : rule.state === 'pending'
                            ? 'color-mix(in srgb, var(--color-tertiary) 15%, transparent)'
                            : 'var(--color-surface-container-high)',
                        color: rule.state === 'firing'
                          ? 'var(--color-error)'
                          : rule.state === 'pending'
                            ? 'var(--color-tertiary)'
                            : 'var(--color-on-surface-variant)',
                      }"
                    >
                      {{ rule.state }}
                    </span>
                  </div>
                  <div
                    class="rounded-sm px-3 py-2 mb-2 overflow-x-auto"
                    :style="{ backgroundColor: 'var(--color-surface-container-high)' }"
                  >
                    <code class="text-xs font-mono whitespace-pre-wrap break-all" :style="{ color: 'var(--color-on-surface-variant)' }">{{ rule.query }}</code>
                  </div>
                  <div class="flex flex-wrap gap-1.5 items-center">
                    <span v-if="rule.duration > 0" class="text-xs mr-1" :style="{ color: 'var(--color-outline)' }">
                      <strong>for:</strong> {{ formatDuration(rule.duration) }}
                    </span>
                    <span
                      v-for="(value, key) in rule.labels"
                      :key="String(key)"
                      class="inline-flex rounded-sm px-2 py-0.5 text-xs font-mono"
                      :style="{
                        backgroundColor: 'var(--color-surface-container-high)',
                        color: 'var(--color-on-surface-variant)',
                      }"
                    >
                      {{ key }}={{ value }}
                    </span>
                  </div>
                  <div
                    v-if="rule.annotations && Object.keys(rule.annotations).length > 0"
                    class="mt-2 pt-2"
                    :style="{ borderTop: '1px solid var(--color-outline-variant)' }"
                  >
                    <div
                      v-for="(value, key) in rule.annotations"
                      :key="String(key)"
                      class="text-xs leading-relaxed"
                      :style="{ color: 'var(--color-outline)' }"
                    >
                      <strong :style="{ color: 'var(--color-on-surface-variant)' }">{{ key }}:</strong> {{ value }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- AlertManager Tabs + Content -->
    <template v-else-if="selectedDatasourceId && isAlertManager">
      <div class="flex gap-1 mb-6" :style="{ borderBottom: '1px solid var(--color-outline-variant)' }">
        <button
          class="px-4 py-2.5 text-sm font-medium transition cursor-pointer bg-transparent"
          :style="{
            color: activeTab === 'am-alerts' ? 'var(--color-primary)' : 'var(--color-outline)',
            borderBottom: activeTab === 'am-alerts' ? '2px solid var(--color-primary)' : '2px solid transparent',
          }"
          data-testid="alerts-tab-am-alerts"
          @click="activeTab = 'am-alerts'"
        >
          Active Alerts
          <span
            v-if="amAlerts.length > 0"
            class="ml-1.5 rounded-sm px-2 py-0.5 text-xs font-mono"
            :style="{
              backgroundColor: 'color-mix(in srgb, var(--color-error) 15%, transparent)',
              color: 'var(--color-error)',
            }"
          >{{ amAlerts.length }}</span>
        </button>
        <button
          class="px-4 py-2.5 text-sm font-medium transition cursor-pointer bg-transparent"
          :style="{
            color: activeTab === 'am-silences' ? 'var(--color-primary)' : 'var(--color-outline)',
            borderBottom: activeTab === 'am-silences' ? '2px solid var(--color-primary)' : '2px solid transparent',
          }"
          data-testid="alerts-tab-am-silences"
          @click="activeTab = 'am-silences'"
        >
          Silences
          <span
            v-if="activeSilences.length > 0"
            class="ml-1.5 rounded-sm px-2 py-0.5 text-xs font-mono"
            :style="{
              backgroundColor: 'var(--color-surface-container-high)',
              color: 'var(--color-outline)',
            }"
          >{{ activeSilences.length }}</span>
        </button>
        <button
          class="px-4 py-2.5 text-sm font-medium transition cursor-pointer bg-transparent"
          :style="{
            color: activeTab === 'am-receivers' ? 'var(--color-primary)' : 'var(--color-outline)',
            borderBottom: activeTab === 'am-receivers' ? '2px solid var(--color-primary)' : '2px solid transparent',
          }"
          data-testid="alerts-tab-am-receivers"
          @click="activeTab = 'am-receivers'"
        >
          Receivers
          <span
            v-if="amReceivers.length > 0"
            class="ml-1.5 rounded-sm px-2 py-0.5 text-xs font-mono"
            :style="{
              backgroundColor: 'var(--color-surface-container-high)',
              color: 'var(--color-outline)',
            }"
          >{{ amReceivers.length }}</span>
        </button>
      </div>

      <!-- AM Active Alerts tab -->
      <div v-if="activeTab === 'am-alerts'">
        <div class="flex items-center gap-2 mb-4">
          <span class="text-xs font-medium" :style="{ color: 'var(--color-outline)' }">Show:</span>
          <button
            class="px-2.5 py-1 rounded-sm text-xs cursor-pointer transition"
            :style="{
              backgroundColor: amFilterActive ? 'color-mix(in srgb, var(--color-primary) 15%, transparent)' : 'var(--color-surface-container-high)',
              color: amFilterActive ? 'var(--color-primary)' : 'var(--color-outline)',
              border: amFilterActive ? '1px solid var(--color-primary)' : '1px solid var(--color-outline-variant)',
            }"
            data-testid="alerts-filter-active-btn"
            @click="amFilterActive = !amFilterActive"
          >Active</button>
          <button
            class="px-2.5 py-1 rounded-sm text-xs cursor-pointer transition"
            :style="{
              backgroundColor: amFilterSilenced ? 'color-mix(in srgb, var(--color-primary) 15%, transparent)' : 'var(--color-surface-container-high)',
              color: amFilterSilenced ? 'var(--color-primary)' : 'var(--color-outline)',
              border: amFilterSilenced ? '1px solid var(--color-primary)' : '1px solid var(--color-outline-variant)',
            }"
            data-testid="alerts-filter-silenced-btn"
            @click="amFilterSilenced = !amFilterSilenced"
          >Silenced</button>
          <button
            class="px-2.5 py-1 rounded-sm text-xs cursor-pointer transition"
            :style="{
              backgroundColor: amFilterInhibited ? 'color-mix(in srgb, var(--color-primary) 15%, transparent)' : 'var(--color-surface-container-high)',
              color: amFilterInhibited ? 'var(--color-primary)' : 'var(--color-outline)',
              border: amFilterInhibited ? '1px solid var(--color-primary)' : '1px solid var(--color-outline-variant)',
            }"
            data-testid="alerts-filter-inhibited-btn"
            @click="amFilterInhibited = !amFilterInhibited"
          >Inhibited</button>
        </div>

        <div v-if="sortedAMAlerts.length === 0" class="flex flex-col items-center justify-center py-10 px-6 text-center gap-3">
          <BellOff :size="36" :style="{ color: 'var(--color-outline)' }" />
          <h3 class="text-lg font-semibold m-0" :style="{ color: 'var(--color-on-surface)' }">No alerts</h3>
          <p class="text-sm m-0" :style="{ color: 'var(--color-on-surface-variant)' }">No alerts matching current filters.</p>
        </div>

        <table v-else class="w-full border-collapse">
          <thead>
            <tr>
              <th class="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" :style="{ color: 'var(--color-outline)' }">Status</th>
              <th class="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" :style="{ color: 'var(--color-outline)' }">Alert</th>
              <th class="text-left text-xs font-semibold uppercase tracking-wider px-4 py-3" :style="{ color: 'var(--color-outline)' }">Severity</th>
              <th class="text-right text-xs font-semibold uppercase tracking-wider px-4 py-3" :style="{ color: 'var(--color-outline)' }">Started</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(alert, idx) in sortedAMAlerts"
              :key="idx"
              class="cursor-pointer transition-colors"
              @mouseenter="($event.currentTarget as HTMLElement).style.backgroundColor = 'var(--color-surface-container-high)'"
              @mouseleave="($event.currentTarget as HTMLElement).style.backgroundColor = 'transparent'"
            >
              <td class="px-4 py-3">
                <StatusDot
                  :status="stateToStatusDot(alert.status?.state || '')"
                  :pulse="alert.status?.state === 'active'"
                  :size="8"
                />
              </td>
              <td class="px-4 py-3">
                <span class="text-sm font-semibold" :style="{ color: 'var(--color-on-surface)' }">{{ alert.labels?.alertname || '--' }}</span>
              </td>
              <td class="px-4 py-3">
                <span class="text-xs font-mono" :style="{ color: 'var(--color-on-surface-variant)' }">{{ alert.labels?.severity || 'none' }}</span>
              </td>
              <td class="px-4 py-3 text-right">
                <span class="text-xs font-mono" :style="{ color: 'var(--color-outline)' }">{{ formatDateShort(alert.startsAt) }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- AM Silences tab -->
      <div v-if="activeTab === 'am-silences'">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-sm font-semibold m-0" :style="{ color: 'var(--color-on-surface)' }">Silences</h3>
          <button
            data-testid="alerts-new-silence-btn"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-sm cursor-pointer transition"
            :style="{
              background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
              color: '#fff',
              border: 'none',
            }"
            @click="openSilenceModal"
          >
            <Plus :size="14" />
            New Silence
          </button>
        </div>

        <div v-if="amSilences.length === 0" class="flex flex-col items-center justify-center py-10 px-6 text-center gap-3">
          <BellOff :size="36" :style="{ color: 'var(--color-outline)' }" />
          <h3 class="text-lg font-semibold m-0" :style="{ color: 'var(--color-on-surface)' }">No silences</h3>
          <p class="text-sm m-0" :style="{ color: 'var(--color-on-surface-variant)' }">No silence rules configured.</p>
        </div>

        <div v-else class="flex flex-col gap-3">
          <div
            v-for="silence in amSilences"
            :key="silence.id"
            class="rounded-lg p-4"
            :style="{ backgroundColor: 'var(--color-surface-container-low)' }"
          >
            <div class="flex items-start justify-between gap-3 mb-2">
              <div class="flex items-center gap-2 min-w-0">
                <span class="text-xs font-mono shrink-0" :style="{ color: 'var(--color-outline)' }" :title="silence.id">{{ truncateId(silence.id) }}</span>
                <StatusDot
                  :status="silence.status.state === 'active' ? 'info' : silence.status.state === 'pending' ? 'warning' : 'healthy'"
                  :size="6"
                />
                <span class="text-xs font-semibold" :style="{ color: 'var(--color-on-surface-variant)' }">{{ silence.status.state }}</span>
              </div>
              <button
                v-if="silence.status.state === 'active' || silence.status.state === 'pending'"
                class="inline-flex items-center gap-1 text-sm cursor-pointer bg-transparent border-none transition shrink-0"
                :style="{ color: 'var(--color-error)' }"
                title="Expire silence"
                @click="handleExpireSilence(silence.id)"
              >
                <Trash2 :size="12" />
                Expire
              </button>
            </div>
            <div class="flex flex-wrap gap-1.5 mb-2">
              <span
                v-for="(m, mIdx) in silence.matchers"
                :key="mIdx"
                class="inline-flex rounded-sm px-2 py-0.5 text-xs font-mono"
                :style="{
                  backgroundColor: 'var(--color-surface-container-high)',
                  color: 'var(--color-on-surface-variant)',
                }"
              >
                {{ m.name }}{{ m.isEqual ? (m.isRegex ? '=~' : '=') : (m.isRegex ? '!~' : '!=') }}"{{ m.value }}"
              </span>
            </div>
            <div class="flex items-center gap-3 text-xs" :style="{ color: 'var(--color-outline)' }">
              <span>{{ silence.createdBy }}</span>
              <span class="truncate max-w-[200px]">{{ silence.comment }}</span>
              <span class="ml-auto font-mono shrink-0">ends {{ formatDateShort(silence.endsAt) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- AM Receivers tab -->
      <div v-if="activeTab === 'am-receivers'">
        <div v-if="amReceivers.length === 0" class="flex flex-col items-center justify-center py-10 px-6 text-center gap-3">
          <Radio :size="36" :style="{ color: 'var(--color-outline)' }" />
          <h3 class="text-lg font-semibold m-0" :style="{ color: 'var(--color-on-surface)' }">No receivers</h3>
          <p class="text-sm m-0" :style="{ color: 'var(--color-on-surface-variant)' }">No receivers configured in AlertManager.</p>
        </div>

        <div v-else class="flex flex-col gap-3">
          <div
            v-for="receiver in amReceivers"
            :key="receiver.name"
            class="rounded-lg p-4 flex items-center gap-3"
            :style="{ backgroundColor: 'var(--color-surface-container-low)' }"
          >
            <Radio :size="16" :style="{ color: 'var(--color-outline)' }" class="shrink-0" />
            <span class="text-sm font-semibold" :style="{ color: 'var(--color-on-surface)' }">{{ receiver.name }}</span>
          </div>
        </div>
      </div>
    </template>

    <!-- Create Silence Modal -->
    <Teleport to="body">
      <div
        v-if="showSilenceModal"
        class="fixed inset-0 flex items-center justify-center z-[1000]"
        :style="{ backgroundColor: 'rgba(0,0,0,0.5)' }"
        @click.self="closeSilenceModal"
      >
        <div
          class="rounded-lg w-full max-w-[560px] max-h-[90vh] overflow-y-auto"
          :style="{
            backgroundColor: 'var(--color-surface-bright)',
            border: '1px solid var(--color-outline-variant)',
          }"
        >
          <div
            class="flex items-center justify-between px-5 py-4"
            :style="{ borderBottom: '1px solid var(--color-outline-variant)' }"
          >
            <h2 class="text-base font-bold font-display m-0" :style="{ color: 'var(--color-on-surface)' }">Create Silence</h2>
            <button
              class="flex items-center justify-center w-8 h-8 bg-transparent border-none rounded-sm cursor-pointer transition"
              :style="{ color: 'var(--color-outline)' }"
              @click="closeSilenceModal"
            >
              <X :size="18" />
            </button>
          </div>

          <div class="px-5 py-5 flex flex-col gap-4">
            <!-- Matchers -->
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium" :style="{ color: 'var(--color-on-surface-variant)' }">
                Matchers <span :style="{ color: 'var(--color-error)' }">*</span>
              </label>
              <div class="flex flex-col gap-2 mb-2">
                <div
                  v-for="(m, idx) in silenceMatchers"
                  :key="idx"
                  class="flex items-center gap-2"
                >
                  <input
                    v-model="m.name"
                    type="text"
                    placeholder="Label name"
                    class="flex-1 px-2.5 py-1.5 rounded-sm text-sm font-mono focus:outline-none"
                    :style="{
                      backgroundColor: 'var(--color-surface-container-high)',
                      color: 'var(--color-on-surface)',
                      border: '1px solid var(--color-outline-variant)',
                    }"
                  />
                  <select
                    v-model="m.isEqual"
                    class="w-13 px-1.5 py-1.5 rounded-sm text-sm font-mono text-center focus:outline-none"
                    :style="{
                      backgroundColor: 'var(--color-surface-container-high)',
                      color: 'var(--color-on-surface)',
                      border: '1px solid var(--color-outline-variant)',
                    }"
                  >
                    <option :value="true">{{ m.isRegex ? '=~' : '=' }}</option>
                    <option :value="false">{{ m.isRegex ? '!~' : '!=' }}</option>
                  </select>
                  <input
                    v-model="m.value"
                    type="text"
                    placeholder="Value"
                    class="flex-1 px-2.5 py-1.5 rounded-sm text-sm font-mono focus:outline-none"
                    :style="{
                      backgroundColor: 'var(--color-surface-container-high)',
                      color: 'var(--color-on-surface)',
                      border: '1px solid var(--color-outline-variant)',
                    }"
                  />
                  <label class="flex items-center gap-1 text-xs whitespace-nowrap cursor-pointer" :style="{ color: 'var(--color-outline)' }" title="Regex match">
                    <input type="checkbox" v-model="m.isRegex" class="w-3.5 h-3.5" />
                    Regex
                  </label>
                  <button
                    class="flex items-center justify-center w-7 h-7 bg-transparent border-none rounded-sm cursor-pointer transition disabled:opacity-40 disabled:cursor-not-allowed"
                    :style="{ color: 'var(--color-outline)' }"
                    :disabled="silenceMatchers.length <= 1"
                    @click="removeMatcher(idx)"
                    title="Remove matcher"
                  >
                    <X :size="14" />
                  </button>
                </div>
              </div>
              <button
                class="text-sm cursor-pointer bg-transparent border-none inline-flex items-center gap-1 self-start transition"
                :style="{ color: 'var(--color-primary)' }"
                @click="addMatcher"
              >
                <Plus :size="12" />
                Add Matcher
              </button>
            </div>

            <!-- Start / End -->
            <div class="grid grid-cols-2 gap-3">
              <div class="flex flex-col gap-1.5">
                <label for="silence-start" class="text-sm font-medium" :style="{ color: 'var(--color-on-surface-variant)' }">Start</label>
                <input
                  id="silence-start"
                  data-testid="silence-start-input"
                  v-model="silenceStart"
                  type="datetime-local"
                  class="px-3 py-2 rounded-sm text-sm focus:outline-none"
                  :style="{
                    backgroundColor: 'var(--color-surface-container-high)',
                    color: 'var(--color-on-surface)',
                    border: '1px solid var(--color-outline-variant)',
                  }"
                />
              </div>
              <div class="flex flex-col gap-1.5">
                <label for="silence-end" class="text-sm font-medium" :style="{ color: 'var(--color-on-surface-variant)' }">End</label>
                <input
                  id="silence-end"
                  data-testid="silence-end-input"
                  v-model="silenceEnd"
                  type="datetime-local"
                  class="px-3 py-2 rounded-sm text-sm focus:outline-none"
                  :style="{
                    backgroundColor: 'var(--color-surface-container-high)',
                    color: 'var(--color-on-surface)',
                    border: '1px solid var(--color-outline-variant)',
                  }"
                />
              </div>
            </div>

            <!-- Created By -->
            <div class="flex flex-col gap-1.5">
              <label for="silence-created-by" class="text-sm font-medium" :style="{ color: 'var(--color-on-surface-variant)' }">Created By</label>
              <input
                id="silence-created-by"
                data-testid="silence-created-by-input"
                v-model="silenceCreatedBy"
                type="text"
                placeholder="your-name@example.com"
                class="px-3 py-2 rounded-sm text-sm focus:outline-none"
                :style="{
                  backgroundColor: 'var(--color-surface-container-high)',
                  color: 'var(--color-on-surface)',
                  border: '1px solid var(--color-outline-variant)',
                }"
              />
            </div>

            <!-- Comment -->
            <div class="flex flex-col gap-1.5">
              <label for="silence-comment" class="text-sm font-medium" :style="{ color: 'var(--color-on-surface-variant)' }">
                Comment <span :style="{ color: 'var(--color-error)' }">*</span>
              </label>
              <textarea
                id="silence-comment"
                data-testid="silence-comment-input"
                v-model="silenceComment"
                rows="3"
                placeholder="Reason for silencing..."
                class="px-3 py-2 rounded-sm text-sm resize-y min-h-[68px] font-[inherit] focus:outline-none"
                :style="{
                  backgroundColor: 'var(--color-surface-container-high)',
                  color: 'var(--color-on-surface)',
                  border: '1px solid var(--color-outline-variant)',
                }"
              ></textarea>
            </div>

            <!-- Error -->
            <div
              v-if="silenceError"
              class="flex items-center gap-2 px-4 py-3 rounded-sm text-sm"
              :style="{
                backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
                color: 'var(--color-error)',
              }"
            >
              <AlertCircle :size="14" />
              {{ silenceError }}
            </div>
          </div>

          <div
            class="flex justify-end gap-2.5 px-5 py-4"
            :style="{ borderTop: '1px solid var(--color-outline-variant)' }"
          >
            <button
              class="inline-flex items-center gap-1.5 px-3 py-2 rounded-sm text-sm font-medium cursor-pointer transition disabled:opacity-50 disabled:cursor-not-allowed"
              :style="{
                backgroundColor: 'var(--color-surface-container-high)',
                color: 'var(--color-on-surface-variant)',
                border: '1px solid var(--color-outline-variant)',
              }"
              data-testid="silence-cancel-btn"
              @click="closeSilenceModal"
              :disabled="silenceSaving"
            >
              Cancel
            </button>
            <button
              class="inline-flex items-center gap-1.5 px-4 py-2 rounded-sm text-sm font-medium cursor-pointer transition disabled:opacity-50 disabled:cursor-not-allowed"
              :style="{
                background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
                color: '#fff',
                border: 'none',
              }"
              data-testid="silence-create-btn"
              @click="handleCreateSilence"
              :disabled="silenceSaving"
            >
              <Loader2 v-if="silenceSaving" :size="14" class="animate-spin" />
              {{ silenceSaving ? 'Creating...' : 'Create Silence' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
