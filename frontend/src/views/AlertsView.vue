<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import {
  BellRing,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  RefreshCw,
  AlertCircle,
  BellOff,
  Plus,
  X,
  Trash2,
  Radio,
} from 'lucide-vue-next'
import { useOrganization } from '../composables/useOrganization'
import { useAuth } from '../composables/useAuth'
import { useDatasource } from '../composables/useDatasource'
import { fetchAlerts, fetchGroups } from '../composables/useVMAlert'
import {
  fetchAlertManagerAlerts,
  fetchSilences,
  createSilence,
  expireSilence,
  fetchReceivers,
} from '../composables/useAlertManager'
import type {
  VMAlertAlert,
  VMAlertRuleGroup,
  AMAlert,
  AMSilence,
  AMMatcher,
  AMReceiver,
  DataSource,
} from '../types/datasource'
import { dataSourceTypeLabels } from '../types/datasource'

const { currentOrg } = useOrganization()
const { user } = useAuth()
const { alertingDatasources, fetchDatasources } = useDatasource()

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
const firingAlerts = computed(() =>
  alerts.value.filter((a) => a.state === 'firing'),
)

const pendingAlerts = computed(() =>
  alerts.value.filter((a) => a.state === 'pending'),
)

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

function toggleGroup(groupName: string) {
  expandedGroups.value[groupName] = !expandedGroups.value[groupName]
}

function isGroupExpanded(groupName: string): boolean {
  return !!expandedGroups.value[groupName]
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

function stateClass(state: string): string {
  switch (state) {
    case 'firing':
      return 'bg-rose-50 text-rose-700 ring-1 ring-rose-600/20'
    case 'pending':
      return 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/20'
    default:
      return 'bg-slate-100 text-slate-600'
  }
}

function amStateClass(state: string): string {
  switch (state) {
    case 'active':
      return 'bg-rose-50 text-rose-700 ring-1 ring-rose-600/20'
    case 'suppressed':
      return 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/20'
    case 'unprocessed':
      return 'bg-slate-100 text-slate-600'
    default:
      return 'bg-slate-100 text-slate-600'
  }
}

function severityClass(severity: string | undefined): string {
  switch (severity) {
    case 'critical':
      return 'bg-rose-50 text-rose-700 ring-1 ring-rose-600/20'
    case 'warning':
      return 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/20'
    case 'info':
      return 'bg-sky-50 text-sky-700 ring-1 ring-sky-600/20'
    default:
      return 'bg-slate-100 text-slate-600'
  }
}

function silenceStatusClass(state: string): string {
  switch (state) {
    case 'active':
      return 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20'
    case 'pending':
      return 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/20'
    case 'expired':
      return 'bg-slate-100 text-slate-600'
    default:
      return 'bg-slate-100 text-slate-600'
  }
}

function truncateId(id: string): string {
  return id.length > 8 ? id.substring(0, 8) + '…' : id
}

function formatMatchersText(matchers: AMMatcher[]): string {
  return matchers
    .map((m) => {
      const op = m.isEqual ? (m.isRegex ? '=~' : '=') : (m.isRegex ? '!~' : '!=')
      return `${m.name}${op}"${m.value}"`
    })
    .join(', ')
}

function formatDateShort(dateStr: string): string {
  if (!dateStr) return '—'
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
    // Refresh silences
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

  // Set the first relevant tab
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
})
</script>

<template>
  <div class="px-8 py-6 max-w-5xl mx-auto">
    <!-- Page header -->
    <header class="flex items-center justify-between gap-4 mb-6 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div>
        <h1 class="flex items-center gap-2 text-base font-bold font-mono uppercase tracking-wide text-slate-900 m-0">
          <BellRing :size="20" />
          Alerts
        </h1>
        <p class="text-sm text-slate-500 mt-1 mb-0">Monitor active alerts and alerting rule groups</p>
      </div>
      <div class="flex items-center gap-2">
        <select
          v-model="selectedDatasourceId"
          class="px-3 py-2 pr-8 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-sm appearance-none bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2712%27%20height=%2712%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27%2394a3b8%27%20stroke-width=%272%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27%3E%3Cpath%20d=%27m6%209%206%206%206-6%27/%3E%3C/svg%3E')] bg-no-repeat bg-[right_0.65rem_center] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
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
          class="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 cursor-pointer transition hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="!selectedDatasourceId || loading"
          @click="loadData"
          title="Refresh"
        >
          <Loader2 v-if="loading" :size="14" class="animate-spin" />
          <RefreshCw v-else :size="14" />
        </button>
        <button
          class="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-sm font-medium cursor-pointer transition disabled:opacity-50 disabled:cursor-not-allowed"
          :class="autoRefresh ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100'"
          :disabled="!selectedDatasourceId"
          @click="toggleAutoRefresh"
          title="Auto-refresh every 30s"
        >
          <Clock :size="14" />
          Auto
        </button>
        <span v-if="lastRefreshed" class="flex items-center gap-2 text-xs text-slate-400 font-mono">
          <span v-if="autoRefresh" class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          {{ formattedLastRefreshed }}
        </span>
      </div>
    </header>

    <!-- No datasource selected -->
    <div v-if="!selectedDatasourceId && alertingDatasources.length === 0" class="flex flex-col items-center justify-center py-16 px-8 text-center gap-4">
      <BellOff :size="48" class="text-slate-300" />
      <h3 class="text-lg font-semibold text-slate-900 m-0">No alerting datasources configured</h3>
      <p class="text-sm text-slate-500 m-0">Add a VMAlert or AlertManager datasource in Data Sources settings to view alerts.</p>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="flex items-center gap-2 px-4 py-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm mb-4">
      <AlertCircle :size="16" />
      {{ error }}
    </div>

    <!-- Loading skeleton -->
    <div v-else-if="loading && alerts.length === 0 && groups.length === 0 && amAlerts.length === 0 && amSilences.length === 0" class="flex flex-col gap-3 py-4">
      <div v-for="i in 5" :key="i" class="flex gap-4 items-center">
        <div class="h-3.5 rounded bg-slate-200 animate-pulse w-40"></div>
        <div class="h-3.5 rounded bg-slate-200 animate-pulse w-15"></div>
        <div class="h-3.5 rounded bg-slate-200 animate-pulse w-55"></div>
        <div class="h-3.5 rounded bg-slate-200 animate-pulse w-32"></div>
      </div>
    </div>

    <!-- VMAlert Tabs + Content -->
    <template v-else-if="selectedDatasourceId && isVMAlert">
      <div class="flex gap-1 border-b border-slate-200 mb-6">
        <button
          class="px-4 py-2.5 text-sm font-medium transition cursor-pointer border-b-2 bg-transparent"
          :class="activeTab === 'alerts' ? 'text-emerald-600 border-emerald-600' : 'text-slate-500 border-transparent hover:text-slate-700'"
          @click="activeTab = 'alerts'"
        >
          Active Alerts
          <span v-if="firingAlerts.length > 0" class="ml-1.5 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-mono text-rose-600">{{ firingAlerts.length }}</span>
        </button>
        <button
          class="px-4 py-2.5 text-sm font-medium transition cursor-pointer border-b-2 bg-transparent"
          :class="activeTab === 'groups' ? 'text-emerald-600 border-emerald-600' : 'text-slate-500 border-transparent hover:text-slate-700'"
          @click="activeTab = 'groups'"
        >
          Rule Groups
          <span v-if="groups.length > 0" class="ml-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-500">{{ groups.length }}</span>
        </button>
      </div>

      <!-- Active Alerts tab -->
      <div v-if="activeTab === 'alerts'">
        <div v-if="sortedAlerts.length === 0" class="flex flex-col items-center justify-center py-10 px-6 text-center gap-3">
          <BellOff :size="36" class="text-slate-300" />
          <h3 class="text-lg font-semibold text-slate-900 m-0">No alerts firing</h3>
          <p class="text-sm text-slate-500 m-0">All quiet -- no active or pending alerts.</p>
        </div>

        <div v-else class="space-y-3">
          <div
            v-for="(alert, idx) in sortedAlerts"
            :key="idx"
            class="rounded-xl border border-slate-200 bg-white p-4 border-l-4"
            :class="{
              'border-l-rose-500': alert.state === 'firing',
              'border-l-amber-500': alert.state === 'pending',
              'border-l-slate-300': alert.state !== 'firing' && alert.state !== 'pending',
            }"
          >
            <div class="flex items-start justify-between gap-3 mb-2">
              <span class="text-sm font-semibold text-slate-900">{{ alert.name }}</span>
              <span class="rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap" :class="stateClass(alert.state)">
                {{ alert.state }}
              </span>
            </div>
            <div class="flex flex-wrap gap-1.5 mb-2" v-if="alert.labels && Object.keys(alert.labels).length > 0">
              <span
                v-for="(value, key) in alert.labels"
                :key="String(key)"
                class="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-600"
              >
                {{ key }}={{ value }}
              </span>
            </div>
            <div class="text-xs font-mono text-slate-400">
              {{ alert.activeAt || '—' }}
            </div>
          </div>
        </div>
      </div>

      <!-- Rule Groups tab -->
      <div v-if="activeTab === 'groups'">
        <div v-if="groups.length === 0" class="flex flex-col items-center justify-center py-10 px-6 text-center gap-3">
          <BellOff :size="36" class="text-slate-300" />
          <h3 class="text-lg font-semibold text-slate-900 m-0">No rule groups</h3>
          <p class="text-sm text-slate-500 m-0">No alerting or recording rule groups found.</p>
        </div>

        <div v-else class="space-y-3">
          <div
            v-for="group in groups"
            :key="group.name"
            class="rounded-xl border border-slate-200 bg-white overflow-hidden"
          >
            <button
              class="flex items-center justify-between w-full px-4 py-3 bg-transparent border-none text-left cursor-pointer transition hover:bg-slate-50"
              @click="toggleGroup(group.name)"
            >
              <div class="flex items-center gap-2">
                <component
                  :is="isGroupExpanded(group.name) ? ChevronDown : ChevronRight"
                  :size="16"
                  class="text-slate-400"
                />
                <span class="text-sm font-semibold text-slate-900">{{ group.name }}</span>
              </div>
              <span class="text-xs text-slate-400 font-mono">
                {{ group.rules.length }} rule{{ group.rules.length !== 1 ? 's' : '' }}
                · every {{ formatInterval(group.interval) }}
              </span>
            </button>

            <div v-if="isGroupExpanded(group.name)" class="border-t border-slate-100 px-4 py-3">
              <div class="divide-y divide-slate-100">
                <div
                  v-for="(rule, rIdx) in group.rules"
                  :key="rIdx"
                  class="py-3 first:pt-0 last:pb-0"
                >
                  <div class="flex items-center gap-2 mb-2 flex-wrap">
                    <span class="text-sm font-semibold text-slate-900">{{ rule.name }}</span>
                    <span
                      class="rounded px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide"
                      :class="rule.type === 'alerting' ? 'bg-rose-50 text-rose-600 ring-1 ring-rose-600/20' : 'bg-sky-50 text-sky-600 ring-1 ring-sky-600/20'"
                    >
                      {{ rule.type }}
                    </span>
                    <span v-if="rule.state" class="rounded-full px-2 py-0.5 text-xs font-semibold" :class="stateClass(rule.state)">
                      {{ rule.state }}
                    </span>
                  </div>
                  <div class="bg-slate-50 rounded-lg px-3 py-2 mb-2 overflow-x-auto">
                    <code class="text-xs font-mono text-slate-600 whitespace-pre-wrap break-all">{{ rule.query }}</code>
                  </div>
                  <div class="flex flex-wrap gap-1.5 items-center">
                    <span v-if="rule.duration > 0" class="text-xs text-slate-500 mr-1">
                      <strong>for:</strong> {{ formatDuration(rule.duration) }}
                    </span>
                    <span
                      v-for="(value, key) in rule.labels"
                      :key="String(key)"
                      class="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-600"
                    >
                      {{ key }}={{ value }}
                    </span>
                  </div>
                  <div v-if="rule.annotations && Object.keys(rule.annotations).length > 0" class="mt-2 pt-2 border-t border-slate-100">
                    <div
                      v-for="(value, key) in rule.annotations"
                      :key="String(key)"
                      class="text-xs text-slate-500 leading-relaxed"
                    >
                      <strong class="text-slate-700">{{ key }}:</strong> {{ value }}
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
      <div class="flex gap-1 border-b border-slate-200 mb-6">
        <button
          class="px-4 py-2.5 text-sm font-medium transition cursor-pointer border-b-2 bg-transparent"
          :class="activeTab === 'am-alerts' ? 'text-emerald-600 border-emerald-600' : 'text-slate-500 border-transparent hover:text-slate-700'"
          @click="activeTab = 'am-alerts'"
        >
          Active Alerts
          <span v-if="amAlerts.length > 0" class="ml-1.5 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-mono text-rose-600">{{ amAlerts.length }}</span>
        </button>
        <button
          class="px-4 py-2.5 text-sm font-medium transition cursor-pointer border-b-2 bg-transparent"
          :class="activeTab === 'am-silences' ? 'text-emerald-600 border-emerald-600' : 'text-slate-500 border-transparent hover:text-slate-700'"
          @click="activeTab = 'am-silences'"
        >
          Silences
          <span v-if="activeSilences.length > 0" class="ml-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-500">{{ activeSilences.length }}</span>
        </button>
        <button
          class="px-4 py-2.5 text-sm font-medium transition cursor-pointer border-b-2 bg-transparent"
          :class="activeTab === 'am-receivers' ? 'text-emerald-600 border-emerald-600' : 'text-slate-500 border-transparent hover:text-slate-700'"
          @click="activeTab = 'am-receivers'"
        >
          Receivers
          <span v-if="amReceivers.length > 0" class="ml-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-500">{{ amReceivers.length }}</span>
        </button>
      </div>

      <!-- AM Active Alerts tab -->
      <div v-if="activeTab === 'am-alerts'">
        <div class="flex items-center gap-2 mb-4">
          <span class="text-xs text-slate-400 font-medium">Show:</span>
          <button
            class="px-2.5 py-1 border rounded-md text-xs cursor-pointer transition"
            :class="amFilterActive ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'"
            @click="amFilterActive = !amFilterActive"
          >Active</button>
          <button
            class="px-2.5 py-1 border rounded-md text-xs cursor-pointer transition"
            :class="amFilterSilenced ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'"
            @click="amFilterSilenced = !amFilterSilenced"
          >Silenced</button>
          <button
            class="px-2.5 py-1 border rounded-md text-xs cursor-pointer transition"
            :class="amFilterInhibited ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'"
            @click="amFilterInhibited = !amFilterInhibited"
          >Inhibited</button>
        </div>

        <div v-if="sortedAMAlerts.length === 0" class="flex flex-col items-center justify-center py-10 px-6 text-center gap-3">
          <BellOff :size="36" class="text-slate-300" />
          <h3 class="text-lg font-semibold text-slate-900 m-0">No alerts</h3>
          <p class="text-sm text-slate-500 m-0">No alerts matching current filters.</p>
        </div>

        <div v-else class="space-y-3">
          <div
            v-for="(alert, idx) in sortedAMAlerts"
            :key="idx"
            class="rounded-xl border border-slate-200 bg-white p-4 border-l-4"
            :class="{
              'border-l-rose-500': alert.status?.state === 'active',
              'border-l-amber-500': alert.status?.state === 'suppressed',
              'border-l-slate-300': alert.status?.state !== 'active' && alert.status?.state !== 'suppressed',
            }"
          >
            <div class="flex items-start justify-between gap-3 mb-2">
              <span class="text-sm font-semibold text-slate-900">{{ alert.labels?.alertname || '—' }}</span>
              <div class="flex items-center gap-2">
                <span class="rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap" :class="severityClass(alert.labels?.severity)">
                  {{ alert.labels?.severity || 'none' }}
                </span>
                <span class="rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap" :class="amStateClass(alert.status?.state)">
                  {{ alert.status?.state || 'unknown' }}
                </span>
              </div>
            </div>
            <div class="flex items-center gap-3 text-xs text-slate-500 mb-1">
              <span v-if="alert.labels?.instance" class="font-mono">{{ alert.labels.instance }}</span>
            </div>
            <div class="text-xs font-mono text-slate-400">
              {{ formatDateShort(alert.startsAt) }}
            </div>
          </div>
        </div>
      </div>

      <!-- AM Silences tab -->
      <div v-if="activeTab === 'am-silences'">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-sm font-semibold text-slate-900 m-0">Silences</h3>
          <button
            class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition cursor-pointer"
            @click="openSilenceModal"
          >
            <Plus :size="14" />
            New Silence
          </button>
        </div>

        <div v-if="amSilences.length === 0" class="flex flex-col items-center justify-center py-10 px-6 text-center gap-3">
          <BellOff :size="36" class="text-slate-300" />
          <h3 class="text-lg font-semibold text-slate-900 m-0">No silences</h3>
          <p class="text-sm text-slate-500 m-0">No silence rules configured.</p>
        </div>

        <div v-else class="space-y-3">
          <div
            v-for="silence in amSilences"
            :key="silence.id"
            class="rounded-xl border border-slate-200 bg-white p-4 border-l-4"
            :class="{
              'border-l-emerald-500': silence.status.state === 'active',
              'border-l-amber-400': silence.status.state === 'pending',
              'border-l-slate-200 opacity-60': silence.status.state === 'expired',
            }"
          >
            <div class="flex items-start justify-between gap-3 mb-2">
              <div class="flex items-center gap-2 min-w-0">
                <span class="text-xs font-mono text-slate-400 shrink-0" :title="silence.id">{{ truncateId(silence.id) }}</span>
                <span class="rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap" :class="silenceStatusClass(silence.status.state)">
                  {{ silence.status.state }}
                </span>
              </div>
              <button
                v-if="silence.status.state === 'active' || silence.status.state === 'pending'"
                class="inline-flex items-center gap-1 text-sm text-rose-600 hover:text-rose-700 cursor-pointer bg-transparent border-none transition shrink-0"
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
                class="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-600"
              >
                {{ m.name }}{{ m.isEqual ? (m.isRegex ? '=~' : '=') : (m.isRegex ? '!~' : '!=') }}"{{ m.value }}"
              </span>
            </div>
            <div class="flex items-center gap-3 text-xs text-slate-500">
              <span>{{ silence.createdBy }}</span>
              <span class="truncate max-w-[200px]">{{ silence.comment }}</span>
              <span class="ml-auto font-mono text-slate-400 shrink-0">ends {{ formatDateShort(silence.endsAt) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- AM Receivers tab -->
      <div v-if="activeTab === 'am-receivers'">
        <div v-if="amReceivers.length === 0" class="flex flex-col items-center justify-center py-10 px-6 text-center gap-3">
          <Radio :size="36" class="text-slate-300" />
          <h3 class="text-lg font-semibold text-slate-900 m-0">No receivers</h3>
          <p class="text-sm text-slate-500 m-0">No receivers configured in AlertManager.</p>
        </div>

        <div v-else class="space-y-3">
          <div
            v-for="receiver in amReceivers"
            :key="receiver.name"
            class="rounded-xl border border-slate-200 bg-white p-4 flex items-center gap-3"
          >
            <Radio :size="16" class="text-slate-400 shrink-0" />
            <span class="text-sm font-semibold text-slate-900">{{ receiver.name }}</span>
          </div>
        </div>
      </div>
    </template>

    <!-- Create Silence Modal -->
    <Teleport to="body">
      <div v-if="showSilenceModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]" @click.self="closeSilenceModal">
        <div class="bg-white border border-slate-200 rounded-xl w-full max-w-[560px] max-h-[90vh] overflow-y-auto shadow-2xl">
          <div class="flex items-center justify-between px-5 py-4 border-b border-slate-200">
            <h2 class="text-base font-bold text-slate-900 m-0">Create Silence</h2>
            <button
              class="flex items-center justify-center w-8 h-8 bg-transparent border-none rounded-md text-slate-400 cursor-pointer transition hover:bg-slate-100 hover:text-slate-700"
              @click="closeSilenceModal"
            >
              <X :size="18" />
            </button>
          </div>

          <div class="px-5 py-5 flex flex-col gap-4">
            <!-- Matchers -->
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-slate-700">Matchers <span class="text-rose-500">*</span></label>
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
                    class="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-sm font-mono text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                  <select
                    v-model="m.isEqual"
                    class="w-13 px-1.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-sm font-mono text-slate-900 text-center focus:outline-none focus:border-emerald-500"
                  >
                    <option :value="true">{{ m.isRegex ? '=~' : '=' }}</option>
                    <option :value="false">{{ m.isRegex ? '!~' : '!=' }}</option>
                  </select>
                  <input
                    v-model="m.value"
                    type="text"
                    placeholder="Value"
                    class="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-sm font-mono text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                  <label class="flex items-center gap-1 text-xs text-slate-500 whitespace-nowrap cursor-pointer" title="Regex match">
                    <input type="checkbox" v-model="m.isRegex" class="w-3.5 h-3.5" />
                    Regex
                  </label>
                  <button
                    class="flex items-center justify-center w-7 h-7 bg-transparent border-none rounded-md text-slate-400 cursor-pointer transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    :disabled="silenceMatchers.length <= 1"
                    @click="removeMatcher(idx)"
                    title="Remove matcher"
                  >
                    <X :size="14" />
                  </button>
                </div>
              </div>
              <button
                class="text-sm text-emerald-600 hover:text-emerald-700 cursor-pointer bg-transparent border-none inline-flex items-center gap-1 self-start transition"
                @click="addMatcher"
              >
                <Plus :size="12" />
                Add Matcher
              </button>
            </div>

            <!-- Start / End -->
            <div class="grid grid-cols-2 gap-3">
              <div class="flex flex-col gap-1.5">
                <label for="silence-start" class="text-sm font-medium text-slate-700">Start</label>
                <input
                  id="silence-start"
                  v-model="silenceStart"
                  type="datetime-local"
                  class="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
              <div class="flex flex-col gap-1.5">
                <label for="silence-end" class="text-sm font-medium text-slate-700">End</label>
                <input
                  id="silence-end"
                  v-model="silenceEnd"
                  type="datetime-local"
                  class="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
            </div>

            <!-- Created By -->
            <div class="flex flex-col gap-1.5">
              <label for="silence-created-by" class="text-sm font-medium text-slate-700">Created By</label>
              <input
                id="silence-created-by"
                v-model="silenceCreatedBy"
                type="text"
                placeholder="your-name@example.com"
                class="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            <!-- Comment -->
            <div class="flex flex-col gap-1.5">
              <label for="silence-comment" class="text-sm font-medium text-slate-700">Comment <span class="text-rose-500">*</span></label>
              <textarea
                id="silence-comment"
                v-model="silenceComment"
                rows="3"
                placeholder="Reason for silencing..."
                class="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 resize-y min-h-[68px] font-[inherit] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              ></textarea>
            </div>

            <!-- Error -->
            <div v-if="silenceError" class="flex items-center gap-2 px-4 py-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm">
              <AlertCircle :size="14" />
              {{ silenceError }}
            </div>
          </div>

          <div class="flex justify-end gap-2.5 px-5 py-4 border-t border-slate-200">
            <button
              class="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 cursor-pointer transition hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
              @click="closeSilenceModal"
              :disabled="silenceSaving"
            >
              Cancel
            </button>
            <button
              class="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 border border-emerald-600 rounded-lg text-sm font-medium text-white cursor-pointer transition hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
