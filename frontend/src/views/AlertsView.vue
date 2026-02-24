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
      return 'state-firing'
    case 'pending':
      return 'state-pending'
    default:
      return 'state-inactive'
  }
}

function amStateClass(state: string): string {
  switch (state) {
    case 'active':
      return 'state-am-active'
    case 'suppressed':
      return 'state-am-silenced'
    case 'unprocessed':
      return 'state-am-inhibited'
    default:
      return 'state-inactive'
  }
}

function severityClass(severity: string | undefined): string {
  switch (severity) {
    case 'critical':
      return 'severity-critical'
    case 'warning':
      return 'severity-warning'
    case 'info':
      return 'severity-info'
    default:
      return 'severity-none'
  }
}

function silenceStatusClass(state: string): string {
  switch (state) {
    case 'active':
      return 'silence-active'
    case 'pending':
      return 'silence-pending'
    case 'expired':
      return 'silence-expired'
    default:
      return 'silence-expired'
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
  <div class="alerts-view">
    <header class="page-header">
      <div class="header-left">
        <h1>
          <BellRing :size="20" />
          Alerts
        </h1>
        <p class="page-subtitle">Monitor active alerts and alerting rule groups</p>
      </div>
      <div class="header-actions">
        <select
          v-model="selectedDatasourceId"
          class="ds-picker"
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
          class="btn btn-secondary btn-sm"
          :disabled="!selectedDatasourceId || loading"
          @click="loadData"
          title="Refresh"
        >
          <Loader2 v-if="loading" :size="14" class="icon-spin" />
          <RefreshCw v-else :size="14" />
        </button>
        <button
          class="btn btn-sm"
          :class="autoRefresh ? 'btn-active' : 'btn-secondary'"
          :disabled="!selectedDatasourceId"
          @click="toggleAutoRefresh"
          title="Auto-refresh every 30s"
        >
          <Clock :size="14" />
          Auto
        </button>
        <span v-if="lastRefreshed" class="last-refreshed">
          {{ formattedLastRefreshed }}
        </span>
      </div>
    </header>

    <!-- No datasource selected -->
    <div v-if="!selectedDatasourceId && alertingDatasources.length === 0" class="empty-state">
      <BellOff :size="48" class="empty-icon" />
      <h3>No alerting datasources configured</h3>
      <p>Add a VMAlert or AlertManager datasource in Data Sources settings to view alerts.</p>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="error-banner">
      <AlertCircle :size="16" />
      {{ error }}
    </div>

    <!-- Loading skeleton -->
    <div v-else-if="loading && alerts.length === 0 && groups.length === 0 && amAlerts.length === 0 && amSilences.length === 0" class="loading-state">
      <div class="skeleton-row" v-for="i in 5" :key="i">
        <div class="skeleton-bar skeleton-name"></div>
        <div class="skeleton-bar skeleton-state"></div>
        <div class="skeleton-bar skeleton-labels"></div>
        <div class="skeleton-bar skeleton-time"></div>
      </div>
    </div>

    <!-- VMAlert Tabs + Content -->
    <template v-else-if="selectedDatasourceId && isVMAlert">
      <div class="tabs">
        <button
          class="tab"
          :class="{ active: activeTab === 'alerts' }"
          @click="activeTab = 'alerts'"
        >
          Active Alerts
          <span v-if="firingAlerts.length > 0" class="tab-badge tab-badge-firing">{{ firingAlerts.length }}</span>
        </button>
        <button
          class="tab"
          :class="{ active: activeTab === 'groups' }"
          @click="activeTab = 'groups'"
        >
          Rule Groups
          <span v-if="groups.length > 0" class="tab-badge">{{ groups.length }}</span>
        </button>
      </div>

      <!-- Active Alerts tab -->
      <div v-if="activeTab === 'alerts'" class="tab-content">
        <div v-if="sortedAlerts.length === 0" class="empty-state compact">
          <BellOff :size="36" class="empty-icon" />
          <h3>No alerts firing</h3>
          <p>All quiet — no active or pending alerts.</p>
        </div>

        <table v-else class="alerts-table">
          <thead>
            <tr>
              <th>Alert Name</th>
              <th>Labels</th>
              <th>State</th>
              <th>Active Since</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(alert, idx) in sortedAlerts" :key="idx">
              <td class="alert-name">{{ alert.name }}</td>
              <td class="alert-labels">
                <span
                  v-for="(value, key) in alert.labels"
                  :key="String(key)"
                  class="label-chip"
                >
                  {{ key }}={{ value }}
                </span>
              </td>
              <td>
                <span class="state-badge" :class="stateClass(alert.state)">
                  {{ alert.state }}
                </span>
              </td>
              <td class="alert-since">
                {{ alert.activeAt || '—' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Rule Groups tab -->
      <div v-if="activeTab === 'groups'" class="tab-content">
        <div v-if="groups.length === 0" class="empty-state compact">
          <BellOff :size="36" class="empty-icon" />
          <h3>No rule groups</h3>
          <p>No alerting or recording rule groups found.</p>
        </div>

        <div v-else class="rule-groups">
          <div
            v-for="group in groups"
            :key="group.name"
            class="rule-group"
          >
            <button class="group-header" @click="toggleGroup(group.name)">
              <component
                :is="isGroupExpanded(group.name) ? ChevronDown : ChevronRight"
                :size="16"
              />
              <span class="group-name">{{ group.name }}</span>
              <span class="group-meta">
                {{ group.rules.length }} rule{{ group.rules.length !== 1 ? 's' : '' }}
                · every {{ formatInterval(group.interval) }}
              </span>
            </button>

            <div v-if="isGroupExpanded(group.name)" class="group-rules">
              <div
                v-for="(rule, rIdx) in group.rules"
                :key="rIdx"
                class="rule-card"
              >
                <div class="rule-header">
                  <span class="rule-name">{{ rule.name }}</span>
                  <span class="rule-type-badge" :class="rule.type === 'alerting' ? 'type-alerting' : 'type-recording'">
                    {{ rule.type }}
                  </span>
                  <span v-if="rule.state" class="state-badge" :class="stateClass(rule.state)">
                    {{ rule.state }}
                  </span>
                </div>
                <div class="rule-expression">
                  <code>{{ rule.query }}</code>
                </div>
                <div class="rule-details">
                  <span v-if="rule.duration > 0" class="rule-detail">
                    <strong>for:</strong> {{ formatDuration(rule.duration) }}
                  </span>
                  <span
                    v-for="(value, key) in rule.labels"
                    :key="String(key)"
                    class="label-chip"
                  >
                    {{ key }}={{ value }}
                  </span>
                </div>
                <div v-if="rule.annotations && Object.keys(rule.annotations).length > 0" class="rule-annotations">
                  <div
                    v-for="(value, key) in rule.annotations"
                    :key="String(key)"
                    class="annotation"
                  >
                    <strong>{{ key }}:</strong> {{ value }}
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
      <div class="tabs">
        <button
          class="tab"
          :class="{ active: activeTab === 'am-alerts' }"
          @click="activeTab = 'am-alerts'"
        >
          Active Alerts
          <span v-if="amAlerts.length > 0" class="tab-badge tab-badge-firing">{{ amAlerts.length }}</span>
        </button>
        <button
          class="tab"
          :class="{ active: activeTab === 'am-silences' }"
          @click="activeTab = 'am-silences'"
        >
          Silences
          <span v-if="activeSilences.length > 0" class="tab-badge">{{ activeSilences.length }}</span>
        </button>
        <button
          class="tab"
          :class="{ active: activeTab === 'am-receivers' }"
          @click="activeTab = 'am-receivers'"
        >
          Receivers
          <span v-if="amReceivers.length > 0" class="tab-badge">{{ amReceivers.length }}</span>
        </button>
      </div>

      <!-- AM Active Alerts tab -->
      <div v-if="activeTab === 'am-alerts'" class="tab-content">
        <div class="am-filter-row">
          <span class="filter-label">Show:</span>
          <button
            class="filter-toggle"
            :class="{ 'filter-active': amFilterActive }"
            @click="amFilterActive = !amFilterActive"
          >Active</button>
          <button
            class="filter-toggle"
            :class="{ 'filter-active': amFilterSilenced }"
            @click="amFilterSilenced = !amFilterSilenced"
          >Silenced</button>
          <button
            class="filter-toggle"
            :class="{ 'filter-active': amFilterInhibited }"
            @click="amFilterInhibited = !amFilterInhibited"
          >Inhibited</button>
        </div>

        <div v-if="sortedAMAlerts.length === 0" class="empty-state compact">
          <BellOff :size="36" class="empty-icon" />
          <h3>No alerts</h3>
          <p>No alerts matching current filters.</p>
        </div>

        <table v-else class="alerts-table">
          <thead>
            <tr>
              <th>Alert Name</th>
              <th>Severity</th>
              <th>Instance</th>
              <th>State</th>
              <th>Active Since</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(alert, idx) in sortedAMAlerts" :key="idx">
              <td class="alert-name">{{ alert.labels?.alertname || '—' }}</td>
              <td>
                <span
                  class="severity-badge"
                  :class="severityClass(alert.labels?.severity)"
                >
                  {{ alert.labels?.severity || 'none' }}
                </span>
              </td>
              <td class="alert-instance">{{ alert.labels?.instance || '—' }}</td>
              <td>
                <span class="state-badge" :class="amStateClass(alert.status?.state)">
                  {{ alert.status?.state || 'unknown' }}
                </span>
              </td>
              <td class="alert-since">
                {{ formatDateShort(alert.startsAt) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- AM Silences tab -->
      <div v-if="activeTab === 'am-silences'" class="tab-content">
        <div class="silences-header">
          <h3 class="section-title">Silences</h3>
          <button class="btn btn-primary btn-sm" @click="openSilenceModal">
            <Plus :size="14" />
            New Silence
          </button>
        </div>

        <div v-if="amSilences.length === 0" class="empty-state compact">
          <BellOff :size="36" class="empty-icon" />
          <h3>No silences</h3>
          <p>No silence rules configured.</p>
        </div>

        <table v-else class="alerts-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Matchers</th>
              <th>Created By</th>
              <th>Comment</th>
              <th>Ends At</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="silence in amSilences" :key="silence.id">
              <td class="silence-id" :title="silence.id">{{ truncateId(silence.id) }}</td>
              <td class="silence-matchers">
                <span
                  v-for="(m, mIdx) in silence.matchers"
                  :key="mIdx"
                  class="label-chip"
                >
                  {{ m.name }}{{ m.isEqual ? (m.isRegex ? '=~' : '=') : (m.isRegex ? '!~' : '!=') }}"{{ m.value }}"
                </span>
              </td>
              <td>{{ silence.createdBy }}</td>
              <td class="silence-comment">{{ silence.comment }}</td>
              <td class="alert-since">{{ formatDateShort(silence.endsAt) }}</td>
              <td>
                <span
                  class="state-badge"
                  :class="silenceStatusClass(silence.status.state)"
                >
                  {{ silence.status.state }}
                </span>
              </td>
              <td>
                <button
                  v-if="silence.status.state === 'active' || silence.status.state === 'pending'"
                  class="btn btn-danger-outline btn-xs"
                  title="Expire silence"
                  @click="handleExpireSilence(silence.id)"
                >
                  <Trash2 :size="12" />
                  Expire
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- AM Receivers tab -->
      <div v-if="activeTab === 'am-receivers'" class="tab-content">
        <div v-if="amReceivers.length === 0" class="empty-state compact">
          <Radio :size="36" class="empty-icon" />
          <h3>No receivers</h3>
          <p>No receivers configured in AlertManager.</p>
        </div>

        <div v-else class="receivers-list">
          <div
            v-for="receiver in amReceivers"
            :key="receiver.name"
            class="receiver-card"
          >
            <Radio :size="16" class="receiver-icon" />
            <span class="receiver-name">{{ receiver.name }}</span>
          </div>
        </div>
      </div>
    </template>

    <!-- Create Silence Modal -->
    <Teleport to="body">
      <div v-if="showSilenceModal" class="modal-overlay" @click.self="closeSilenceModal">
        <div class="modal">
          <div class="modal-header">
            <h2>Create Silence</h2>
            <button class="btn-icon" @click="closeSilenceModal">
              <X :size="18" />
            </button>
          </div>

          <div class="modal-body">
            <div class="form-group">
              <label>Matchers <span class="required">*</span></label>
              <div class="matchers-list">
                <div
                  v-for="(m, idx) in silenceMatchers"
                  :key="idx"
                  class="matcher-row"
                >
                  <input
                    v-model="m.name"
                    type="text"
                    placeholder="Label name"
                    class="matcher-input"
                  />
                  <select v-model="m.isEqual" class="matcher-op">
                    <option :value="true">{{ m.isRegex ? '=~' : '=' }}</option>
                    <option :value="false">{{ m.isRegex ? '!~' : '!=' }}</option>
                  </select>
                  <input
                    v-model="m.value"
                    type="text"
                    placeholder="Value"
                    class="matcher-input"
                  />
                  <label class="matcher-checkbox" title="Regex match">
                    <input type="checkbox" v-model="m.isRegex" />
                    Regex
                  </label>
                  <button
                    class="btn-icon btn-icon-sm"
                    :disabled="silenceMatchers.length <= 1"
                    @click="removeMatcher(idx)"
                    title="Remove matcher"
                  >
                    <X :size="14" />
                  </button>
                </div>
              </div>
              <button class="btn btn-secondary btn-xs" @click="addMatcher">
                <Plus :size="12" />
                Add Matcher
              </button>
            </div>

            <div class="form-grid-2">
              <div class="form-group">
                <label for="silence-start">Start</label>
                <input
                  id="silence-start"
                  v-model="silenceStart"
                  type="datetime-local"
                  class="form-input"
                />
              </div>
              <div class="form-group">
                <label for="silence-end">End</label>
                <input
                  id="silence-end"
                  v-model="silenceEnd"
                  type="datetime-local"
                  class="form-input"
                />
              </div>
            </div>

            <div class="form-group">
              <label for="silence-created-by">Created By</label>
              <input
                id="silence-created-by"
                v-model="silenceCreatedBy"
                type="text"
                placeholder="your-name@example.com"
                class="form-input"
              />
            </div>

            <div class="form-group">
              <label for="silence-comment">Comment <span class="required">*</span></label>
              <textarea
                id="silence-comment"
                v-model="silenceComment"
                rows="3"
                placeholder="Reason for silencing..."
                class="form-input form-textarea"
              ></textarea>
            </div>

            <div v-if="silenceError" class="error-banner modal-error">
              <AlertCircle :size="14" />
              {{ silenceError }}
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn btn-secondary" @click="closeSilenceModal" :disabled="silenceSaving">
              Cancel
            </button>
            <button class="btn btn-primary" @click="handleCreateSilence" :disabled="silenceSaving">
              <Loader2 v-if="silenceSaving" :size="14" class="icon-spin" />
              {{ silenceSaving ? 'Creating...' : 'Create Silence' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.alerts-view {
  padding: 1.25rem 1.5rem;
  max-width: 1120px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
  padding: 1rem 1.15rem;
  border: 1px solid var(--border-primary);
  border-radius: 14px;
  background: var(--surface-1);
  box-shadow: var(--shadow-sm);
}

.header-left h1 {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.03rem;
  font-weight: 700;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-primary);
  margin: 0;
}

.page-subtitle {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin: 0.25rem 0 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.ds-picker {
  padding: 0.5rem 2rem 0.5rem 0.75rem;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 0.82rem;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a0a0a0' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.65rem center;
}

.ds-picker:focus {
  outline: none;
  border-color: var(--accent-primary);
  box-shadow: var(--focus-ring);
}

.last-refreshed {
  font-size: 0.72rem;
  color: var(--text-tertiary);
  font-family: var(--font-mono);
}

/* Tabs */
.tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--border-primary);
  margin-bottom: 1rem;
}

.tab {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.7rem 1.1rem;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-secondary);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.tab:hover {
  color: var(--text-primary);
}

.tab.active {
  color: var(--accent-primary);
  border-bottom-color: var(--accent-primary);
}

.tab-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 0.35rem;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 600;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

.tab-badge-firing {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

/* AM Filter row */
.am-filter-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.filter-label {
  font-size: 0.78rem;
  color: var(--text-tertiary);
  font-weight: 500;
}

.filter-toggle {
  padding: 0.3rem 0.65rem;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
}

.filter-toggle.filter-active {
  background: rgba(56, 189, 248, 0.16);
  border-color: rgba(56, 189, 248, 0.35);
  color: var(--accent-primary);
}

.filter-toggle:hover {
  background: var(--bg-hover);
}

/* Alerts table */
.alerts-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.84rem;
}

.alerts-table thead {
  border-bottom: 1px solid var(--border-primary);
}

.alerts-table th {
  text-align: left;
  padding: 0.6rem 0.8rem;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-tertiary);
}

.alerts-table td {
  padding: 0.65rem 0.8rem;
  border-bottom: 1px solid var(--border-primary);
  color: var(--text-primary);
  vertical-align: top;
}

.alert-name {
  font-weight: 600;
  white-space: nowrap;
}

.alert-instance {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: var(--text-secondary);
}

.alert-labels {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.label-chip {
  display: inline-flex;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  font-size: 0.7rem;
  font-family: var(--font-mono);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  color: var(--text-secondary);
  white-space: nowrap;
}

.alert-since {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: var(--text-secondary);
  white-space: nowrap;
}

/* State badge */
.state-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.18rem 0.5rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.state-firing {
  background: rgba(239, 68, 68, 0.16);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.35);
}

.state-pending {
  background: rgba(245, 158, 11, 0.16);
  color: #f59e0b;
  border: 1px solid rgba(245, 158, 11, 0.35);
}

.state-inactive {
  background: rgba(100, 116, 139, 0.16);
  color: #94a3b8;
  border: 1px solid rgba(100, 116, 139, 0.35);
}

/* AM state badges */
.state-am-active {
  background: rgba(239, 68, 68, 0.16);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.35);
}

.state-am-silenced {
  background: rgba(245, 158, 11, 0.16);
  color: #f59e0b;
  border: 1px solid rgba(245, 158, 11, 0.35);
}

.state-am-inhibited {
  background: rgba(100, 116, 139, 0.16);
  color: #94a3b8;
  border: 1px solid rgba(100, 116, 139, 0.35);
}

/* Severity badges */
.severity-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.18rem 0.5rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.severity-critical {
  background: rgba(239, 68, 68, 0.16);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.35);
}

.severity-warning {
  background: rgba(245, 158, 11, 0.16);
  color: #f59e0b;
  border: 1px solid rgba(245, 158, 11, 0.35);
}

.severity-info {
  background: rgba(56, 189, 248, 0.16);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.35);
}

.severity-none {
  background: rgba(100, 116, 139, 0.16);
  color: #94a3b8;
  border: 1px solid rgba(100, 116, 139, 0.35);
}

/* Silence status badges */
.silence-active {
  background: rgba(89, 161, 79, 0.16);
  color: #59a14f;
  border: 1px solid rgba(89, 161, 79, 0.35);
}

.silence-pending {
  background: rgba(245, 158, 11, 0.16);
  color: #f59e0b;
  border: 1px solid rgba(245, 158, 11, 0.35);
}

.silence-expired {
  background: rgba(100, 116, 139, 0.16);
  color: #94a3b8;
  border: 1px solid rgba(100, 116, 139, 0.35);
}

/* Silences */
.silences-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.section-title {
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.silence-id {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--text-tertiary);
}

.silence-matchers {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.silence-comment {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary);
  font-size: 0.82rem;
}

/* Receivers */
.receivers-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.receiver-card {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  background: var(--surface-1);
}

.receiver-icon {
  color: var(--text-tertiary);
}

.receiver-name {
  font-weight: 500;
  font-size: 0.88rem;
  color: var(--text-primary);
}

/* Rule Groups */
.rule-groups {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.rule-group {
  border: 1px solid var(--border-primary);
  border-radius: 10px;
  background: var(--surface-1);
  overflow: hidden;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  padding: 0.75rem 1rem;
  background: transparent;
  border: none;
  color: var(--text-primary);
  cursor: pointer;
  transition: background 0.2s;
  text-align: left;
}

.group-header:hover {
  background: var(--bg-hover);
}

.group-name {
  font-weight: 600;
  font-size: 0.88rem;
}

.group-meta {
  font-size: 0.75rem;
  color: var(--text-tertiary);
  margin-left: auto;
}

.group-rules {
  border-top: 1px solid var(--border-primary);
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.rule-card {
  padding: 0.75rem 0.85rem;
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  background: var(--bg-tertiary);
}

.rule-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  flex-wrap: wrap;
}

.rule-name {
  font-weight: 600;
  font-size: 0.86rem;
  color: var(--text-primary);
}

.rule-type-badge {
  display: inline-flex;
  padding: 0.12rem 0.4rem;
  border-radius: 4px;
  font-size: 0.66rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.type-alerting {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.25);
}

.type-recording {
  background: rgba(56, 189, 248, 0.12);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.25);
}

.rule-expression {
  padding: 0.4rem 0.6rem;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 6px;
  margin-bottom: 0.5rem;
  overflow-x: auto;
}

.rule-expression code {
  font-size: 0.76rem;
  font-family: var(--font-mono);
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-all;
}

.rule-details {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: center;
}

.rule-detail {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-right: 0.25rem;
}

.rule-annotations {
  margin-top: 0.5rem;
  padding-top: 0.4rem;
  border-top: 1px solid var(--border-primary);
}

.annotation {
  font-size: 0.75rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

.annotation strong {
  color: var(--text-primary);
}

/* Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--surface-1);
  border: 1px solid var(--border-primary);
  border-radius: 14px;
  width: 100%;
  max-width: 560px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border-primary);
}

.modal-header h2 {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
}

.modal-body {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.65rem;
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--border-primary);
}

.modal-error {
  margin: 0;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.form-group label {
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--text-primary);
}

.required {
  color: var(--accent-danger);
}

.form-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.8rem;
}

.form-input {
  padding: 0.6rem 0.8rem;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 0.85rem;
  transition: border-color 0.2s;
}

.form-input:focus {
  outline: none;
  border-color: var(--accent-primary);
  box-shadow: var(--focus-ring);
}

.form-textarea {
  resize: vertical;
  font-family: inherit;
  min-height: 68px;
}

.matchers-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.matcher-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.matcher-input {
  flex: 1;
  padding: 0.45rem 0.6rem;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 0.82rem;
  font-family: var(--font-mono);
}

.matcher-input:focus {
  outline: none;
  border-color: var(--accent-primary);
}

.matcher-op {
  width: 52px;
  padding: 0.45rem 0.3rem;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 0.78rem;
  font-family: var(--font-mono);
  text-align: center;
}

.matcher-checkbox {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.72rem;
  color: var(--text-secondary);
  white-space: nowrap;
  cursor: pointer;
}

.matcher-checkbox input {
  width: 14px;
  height: 14px;
}

/* Shared states */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  text-align: center;
  gap: 1rem;
}

.empty-state.compact {
  padding: 2.5rem 1.5rem;
}

.empty-icon {
  color: var(--text-tertiary);
}

.empty-state h3 {
  margin: 0;
  font-size: 1.125rem;
  color: var(--text-primary);
}

.empty-state p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.error-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: rgba(255, 107, 107, 0.1);
  border: 1px solid rgba(255, 107, 107, 0.3);
  border-radius: 8px;
  color: var(--accent-danger);
  font-size: 0.875rem;
  margin-bottom: 1rem;
}

.loading-state {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem 0;
}

.skeleton-row {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.skeleton-bar {
  height: 14px;
  border-radius: 4px;
  background: linear-gradient(90deg, var(--bg-tertiary) 25%, rgba(56, 189, 248, 0.08) 50%, var(--bg-tertiary) 75%);
  background-size: 200% 100%;
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

.skeleton-name { width: 160px; }
.skeleton-state { width: 60px; }
.skeleton-labels { width: 220px; }
.skeleton-time { width: 130px; }

@keyframes skeleton-pulse {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-sm {
  padding: 0.4rem 0.6rem;
  font-size: 0.78rem;
}

.btn-xs {
  padding: 0.25rem 0.45rem;
  font-size: 0.72rem;
  border-radius: 6px;
}

.btn-secondary {
  background: var(--bg-tertiary);
  border-color: var(--border-primary);
  color: var(--text-primary);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--bg-hover);
}

.btn-primary {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--accent-primary-hover);
}

.btn-active {
  background: rgba(56, 189, 248, 0.16);
  border-color: rgba(56, 189, 248, 0.35);
  color: var(--accent-primary);
}

.btn-active:hover:not(:disabled) {
  background: rgba(56, 189, 248, 0.22);
}

.btn-danger-outline {
  background: transparent;
  border-color: rgba(239, 68, 68, 0.35);
  color: #ef4444;
}

.btn-danger-outline:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.12);
}

.btn-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.btn-icon:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.btn-icon-sm {
  width: 26px;
  height: 26px;
}

.icon-spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 840px) {
  .alerts-view {
    padding: 0.9rem;
  }

  .page-header {
    flex-direction: column;
    align-items: stretch;
  }

  .header-actions {
    flex-wrap: wrap;
  }

  .alerts-table {
    font-size: 0.78rem;
  }

  .alerts-table th,
  .alerts-table td {
    padding: 0.5rem 0.5rem;
  }

  .form-grid-2 {
    grid-template-columns: 1fr;
  }
}
</style>
