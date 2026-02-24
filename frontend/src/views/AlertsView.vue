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
} from 'lucide-vue-next'
import { useOrganization } from '../composables/useOrganization'
import { useDatasource } from '../composables/useDatasource'
import { fetchAlerts, fetchGroups } from '../composables/useVMAlert'
import type {
  VMAlertAlert,
  VMAlertRuleGroup,
} from '../types/datasource'
import { dataSourceTypeLabels } from '../types/datasource'

const { currentOrg } = useOrganization()
const { vmalertDatasources, fetchDatasources } = useDatasource()

const selectedDatasourceId = ref('')
const activeTab = ref<'alerts' | 'groups'>('alerts')

// Data state
const alerts = ref<VMAlertAlert[]>([])
const groups = ref<VMAlertRuleGroup[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

// Auto-refresh
const autoRefresh = ref(false)
const lastRefreshed = ref<Date | null>(null)
let refreshInterval: ReturnType<typeof setInterval> | null = null

// Accordion state for rule groups
const expandedGroups = ref<Record<string, boolean>>({})

const formattedLastRefreshed = computed(() => {
  if (!lastRefreshed.value) return ''
  return lastRefreshed.value.toLocaleTimeString()
})

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

async function loadData() {
  if (!selectedDatasourceId.value) return

  loading.value = true
  error.value = null

  try {
    const [alertsRes, groupsRes] = await Promise.all([
      fetchAlerts(selectedDatasourceId.value),
      fetchGroups(selectedDatasourceId.value),
    ])
    alerts.value = alertsRes.data?.alerts ?? []
    groups.value = groupsRes.data?.groups ?? []
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

watch(selectedDatasourceId, () => {
  alerts.value = []
  groups.value = []
  error.value = null
  expandedGroups.value = {}
  if (selectedDatasourceId.value) {
    loadData()
  }
})

watch(vmalertDatasources, (ds) => {
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
          :disabled="vmalertDatasources.length === 0"
        >
          <option value="" disabled>
            {{ vmalertDatasources.length === 0 ? 'No VMAlert datasources' : 'Select datasource' }}
          </option>
          <option
            v-for="ds in vmalertDatasources"
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
    <div v-if="!selectedDatasourceId && vmalertDatasources.length === 0" class="empty-state">
      <BellOff :size="48" class="empty-icon" />
      <h3>No VMAlert datasources configured</h3>
      <p>Add a VMAlert datasource in Data Sources settings to view alerts.</p>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="error-banner">
      <AlertCircle :size="16" />
      {{ error }}
    </div>

    <!-- Loading skeleton -->
    <div v-else-if="loading && alerts.length === 0 && groups.length === 0" class="loading-state">
      <div class="skeleton-row" v-for="i in 5" :key="i">
        <div class="skeleton-bar skeleton-name"></div>
        <div class="skeleton-bar skeleton-state"></div>
        <div class="skeleton-bar skeleton-labels"></div>
        <div class="skeleton-bar skeleton-time"></div>
      </div>
    </div>

    <!-- Tabs + content -->
    <template v-else-if="selectedDatasourceId">
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

.btn-secondary {
  background: var(--bg-tertiary);
  border-color: var(--border-primary);
  color: var(--text-primary);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--bg-hover);
}

.btn-active {
  background: rgba(56, 189, 248, 0.16);
  border-color: rgba(56, 189, 248, 0.35);
  color: var(--accent-primary);
}

.btn-active:hover:not(:disabled) {
  background: rgba(56, 189, 248, 0.22);
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
}
</style>
