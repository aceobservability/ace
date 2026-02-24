<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  Check,
  CircleAlert,
  Database,
  ExternalLink,
  HeartPulse,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-vue-next'
import { useOrganization } from '../composables/useOrganization'
import { useDatasource } from '../composables/useDatasource'
import { testDataSourceConnection } from '../api/datasources'
import type { DataSource, DataSourceType } from '../types/datasource'
import { dataSourceTypeLabels } from '../types/datasource'
import prometheusLogo from '../assets/datasources/prometheus-logo.svg'
import lokiLogo from '../assets/datasources/loki-logo.svg'
import victoriaMetricsLogo from '../assets/datasources/victoriametrics-logo.svg'
import victoriaLogsLogo from '../assets/datasources/victorialogs-logo.svg'
import tempoLogo from '../assets/datasources/tempo-logo.svg'
import victoriaTracesLogo from '../assets/datasources/victoriatraces-logo.svg'
import clickhouseLogo from '../assets/datasources/clickhouse-logo.svg'
import cloudwatchLogo from '../assets/datasources/cloudwatch-logo.svg'
import elasticsearchLogo from '../assets/datasources/elasticsearch-logo.svg'

const router = useRouter()
const { currentOrg } = useOrganization()
const { datasources, loading, error, fetchDatasources, removeDatasource } = useDatasource()

const testAllLoading = ref(false)
const healthStatus = ref<Record<string, 'unknown' | 'checking' | 'healthy' | 'unhealthy'>>({})
const healthErrors = ref<Record<string, string>>({})

const dataSourceTypeLogos: Partial<Record<DataSourceType, string>> = {
  prometheus: prometheusLogo,
  loki: lokiLogo,
  victoriametrics: victoriaMetricsLogo,
  victorialogs: victoriaLogsLogo,
  tempo: tempoLogo,
  victoriatraces: victoriaTracesLogo,
  clickhouse: clickhouseLogo,
  cloudwatch: cloudwatchLogo,
  elasticsearch: elasticsearchLogo,
}

const canCreate = computed(() => !!currentOrg.value && currentOrg.value.role !== 'viewer')

function openCreatePage() {
  router.push('/app/datasources/new')
}

function openEditPage(dsId: string) {
  router.push(`/app/datasources/${dsId}/edit`)
}

function getTypeLogo(type_: DataSourceType): string | undefined {
  return dataSourceTypeLogos[type_]
}

function getTypeColor(type_: DataSourceType): string {
  switch (type_) {
    case 'prometheus':
      return '#e6522c'
    case 'loki':
      return '#f9a825'
    case 'victorialogs':
      return '#6ec6ff'
    case 'victoriametrics':
      return '#59a14f'
    case 'tempo':
      return '#8f6dff'
    case 'victoriatraces':
      return '#5bc0be'
    case 'clickhouse':
      return '#ffd400'
    case 'cloudwatch':
      return '#38bdf8'
    case 'elasticsearch':
      return '#00bfb3'
    case 'vmalert':
      return '#ef4444'
  }
}

function getHealthStatus(dsId: string) {
  return healthStatus.value[dsId] || 'unknown'
}

function getHealthLabel(dsId: string) {
  const status = getHealthStatus(dsId)
  if (status === 'healthy') return 'Healthy'
  if (status === 'unhealthy') return 'Unhealthy'
  if (status === 'checking') return 'Checking...'
  return 'Unknown'
}

async function testDatasource(ds: DataSource) {
  healthStatus.value[ds.id] = 'checking'
  delete healthErrors.value[ds.id]

  try {
    await testDataSourceConnection(ds.id)
    healthStatus.value[ds.id] = 'healthy'
  } catch (e) {
    healthStatus.value[ds.id] = 'unhealthy'
    healthErrors.value[ds.id] = e instanceof Error ? e.message : 'Connection test failed'
  }
}

async function testAllDatasources() {
  testAllLoading.value = true
  try {
    for (const ds of datasources.value) {
      await testDatasource(ds)
    }
  } finally {
    testAllLoading.value = false
  }
}

async function handleDelete(ds: DataSource) {
  if (!confirm(`Delete datasource "${ds.name}"? This cannot be undone.`)) return
  try {
    await removeDatasource(ds.id)
  } catch {
    // error is set by composable
  }
}

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
</script>

<template>
  <div class="datasource-settings">
    <header class="page-header">
      <div>
        <h1>Data Sources</h1>
        <p class="page-subtitle">Manage connections to your monitoring systems</p>
      </div>
      <div class="header-actions">
        <button
          class="btn btn-secondary btn-header btn-test-all"
          :disabled="datasources.length === 0 || testAllLoading"
          @click="testAllDatasources"
        >
          <Loader2 v-if="testAllLoading" :size="16" class="icon-spin" />
          <HeartPulse v-else :size="16" />
          {{ testAllLoading ? 'Testing...' : 'Test All' }}
        </button>
        <button class="btn btn-primary btn-header" :disabled="!canCreate" @click="openCreatePage">
          <Plus :size="16" />
          Add Data Source
        </button>
      </div>
    </header>

    <div v-if="error" class="error-banner">{{ error }}</div>

    <div v-if="loading && datasources.length === 0" class="loading-state">
      <div class="spinner"></div>
      <p>Loading datasources...</p>
    </div>

    <div v-else-if="datasources.length === 0" class="empty-state">
      <Database :size="48" class="empty-icon" />
      <h3>No data sources configured</h3>
      <p>Add a data source to start querying your monitoring systems.</p>
      <button class="btn btn-primary" :disabled="!canCreate" @click="openCreatePage">
        <Plus :size="16" />
        Add Data Source
      </button>
    </div>

    <div v-else class="datasource-grid">
      <div
        v-for="ds in datasources"
        :key="ds.id"
        class="datasource-card"
      >
        <div class="card-header">
          <div class="card-title-row">
            <div
              class="type-panel"
              :style="{ borderColor: getTypeColor(ds.type) + '4d', background: getTypeColor(ds.type) + '14' }"
            >
              <img v-if="getTypeLogo(ds.type)" :src="getTypeLogo(ds.type)" :alt="`${dataSourceTypeLabels[ds.type]} logo`" class="type-panel-logo" />
              <Database v-else :size="26" class="type-panel-logo-icon" />
              <div class="type-panel-meta">
                <span class="type-panel-label">Source Type</span>
                <strong class="type-panel-name">{{ dataSourceTypeLabels[ds.type] }}</strong>
              </div>
            </div>
            <span v-if="ds.is_default" class="default-badge">
              <Check :size="12" />
              Default
            </span>
          </div>
          <div class="card-actions">
            <button class="btn-icon" @click="openEditPage(ds.id)" title="Edit">
              <Pencil :size="16" />
            </button>
            <button class="btn-icon btn-icon-danger" @click="handleDelete(ds)" title="Delete">
              <Trash2 :size="16" />
            </button>
          </div>
        </div>
        <div class="card-body">
          <div class="card-main">
            <h3 class="ds-name">{{ ds.name }}</h3>
            <div class="ds-url">
              <ExternalLink :size="14" />
              <span>{{ ds.url }}</span>
            </div>
          </div>
          <div class="card-footer">
            <span
              class="health-badge"
              :class="`health-${getHealthStatus(ds.id)}`"
              :title="healthErrors[ds.id] || getHealthLabel(ds.id)"
            >
              <Loader2 v-if="getHealthStatus(ds.id) === 'checking'" :size="12" class="icon-spin" />
              <HeartPulse v-else-if="getHealthStatus(ds.id) === 'healthy'" :size="12" />
              <CircleAlert v-else-if="getHealthStatus(ds.id) === 'unhealthy'" :size="12" />
              <span>{{ getHealthLabel(ds.id) }}</span>
            </span>

            <button
              class="btn btn-secondary btn-test"
              :disabled="getHealthStatus(ds.id) === 'checking'"
              @click="testDatasource(ds)"
              title="Run connection test"
            >
              <Loader2 v-if="getHealthStatus(ds.id) === 'checking'" :size="14" class="icon-spin" />
              <HeartPulse v-else :size="14" />
              {{ getHealthStatus(ds.id) === 'checking' ? 'Testing...' : 'Test' }}
            </button>
          </div>
          <div v-if="healthErrors[ds.id]" class="health-error">{{ healthErrors[ds.id] }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.datasource-settings {
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

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}

.btn-header {
  padding: 0.5rem 0.875rem;
  font-size: 0.8125rem;
  border-radius: 10px;
}

.btn-test-all {
  min-width: 96px;
}

.page-header h1 {
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

.error-banner {
  padding: 0.75rem 1rem;
  background: rgba(255, 107, 107, 0.1);
  border: 1px solid rgba(255, 107, 107, 0.3);
  border-radius: 8px;
  color: var(--accent-danger);
  font-size: 0.875rem;
  margin-bottom: 1.5rem;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  text-align: center;
  gap: 1rem;
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

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-primary);
  border-top-color: var(--accent-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.datasource-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
}

.datasource-card {
  background: linear-gradient(180deg, rgba(16, 27, 42, 0.92), rgba(13, 23, 36, 0.9));
  border: 1px solid var(--border-primary);
  border-radius: 12px;
  transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
  box-shadow: var(--shadow-sm);
}

.datasource-card:hover {
  border-color: rgba(56, 189, 248, 0.35);
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 1rem 1rem 0;
  gap: 0.75rem;
}

.card-title-row {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 0.625rem;
  min-width: 0;
}

.type-panel {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.4rem 0.85rem;
  border-radius: 11px;
  border: 1px solid;
  min-width: 0;
}

.type-panel-logo {
  width: 26px;
  height: 26px;
  object-fit: contain;
  flex-shrink: 0;
}

.type-panel-meta {
  display: flex;
  flex-direction: column;
  gap: 0.08rem;
  min-width: 0;
}

.type-panel-label {
  font-size: 0.64rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-tertiary);
}

.type-panel-name {
  font-size: 0.84rem;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
}

.default-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 500;
  background: rgba(56, 189, 248, 0.16);
  color: var(--accent-primary);
}

.card-actions {
  display: flex;
  gap: 0.25rem;
}

.card-body {
  padding: 0.875rem 1rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.card-main {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.ds-name {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.ds-url {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.78rem;
  color: var(--text-tertiary);
  word-break: break-all;
  padding: 0.45rem 0.6rem;
  border-radius: 7px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.health-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.22rem 0.5rem;
  border-radius: 999px;
  border: 1px solid var(--border-primary);
  font-size: 0.72rem;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
}

.health-unknown {
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  border-color: var(--border-primary);
}

.health-checking {
  color: #6ec6ff;
  background: rgba(110, 198, 255, 0.12);
  border-color: rgba(110, 198, 255, 0.35);
}

.health-healthy {
  color: #59a14f;
  background: rgba(89, 161, 79, 0.12);
  border-color: rgba(89, 161, 79, 0.35);
}

.health-unhealthy {
  color: var(--accent-danger);
  background: rgba(255, 107, 107, 0.12);
  border-color: rgba(255, 107, 107, 0.35);
}

.btn-test {
  padding: 0.28rem 0.55rem;
  font-size: 0.72rem;
  border-radius: 999px;
  min-height: 28px;
  line-height: 1;
}

.health-error {
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: var(--accent-danger);
  line-height: 1.4;
}

.icon-spin {
  animation: spin 0.8s linear infinite;
}

@media (max-width: 840px) {
  .datasource-settings {
    padding: 0.9rem;
  }

  .page-header {
    flex-direction: column;
    align-items: stretch;
  }

  .header-actions {
    justify-content: flex-start;
    flex-wrap: wrap;
  }
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

.btn-icon-danger:hover {
  background: rgba(251, 113, 133, 0.15);
  color: var(--accent-danger);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.625rem 1.25rem;
  border: 1px solid transparent;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--accent-primary-hover);
}
</style>
