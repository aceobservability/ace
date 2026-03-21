<script setup lang="ts">
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
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { testDataSourceConnection } from '../api/datasources'
import { dataSourceTypeLogos } from '../utils/datasourceLogos'
import { useDatasource } from '../composables/useDatasource'
import { useOrganization } from '../composables/useOrganization'
import type { DataSource, DataSourceType } from '../types/datasource'
import { dataSourceTypeLabels } from '../types/datasource'

const router = useRouter()
const { currentOrg } = useOrganization()
const { datasources, loading, error, fetchDatasources, removeDatasource } = useDatasource()

const testAllLoading = ref(false)
const healthStatus = ref<Record<string, 'unknown' | 'checking' | 'healthy' | 'unhealthy'>>({})
const healthErrors = ref<Record<string, string>>({})

const canCreate = computed(() => !!currentOrg.value && currentOrg.value.role !== 'viewer')

function openCreatePage() {
  router.push('/datasources/new')
}

function openEditPage(dsId: string) {
  router.push(`/datasources/${dsId}/edit`)
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
      return '#F59E0B'
    case 'elasticsearch':
      return '#00bfb3'
    case 'vmalert':
      return '#ef4444'
    case 'alertmanager':
      return '#e45858'
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
  <div class="px-8 py-6 max-w-[1120px] mx-auto">
    <header class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-lg font-bold text-text-primary">Data Sources</h1>
        <p class="text-sm text-text-muted mt-1">Manage connections to your monitoring systems</p>
      </div>
      <div class="flex items-center gap-2.5">
        <button
          class="inline-flex items-center justify-center gap-2 rounded-sm border border-border-strong px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-border-strong disabled:opacity-50 disabled:cursor-not-allowed min-w-[96px]"
          data-testid="ds-test-all-btn"
          :disabled="datasources.length === 0 || testAllLoading"
          @click="testAllDatasources"
        >
          <Loader2 v-if="testAllLoading" :size="16" class="animate-spin" />
          <HeartPulse v-else :size="16" />
          {{ testAllLoading ? 'Testing...' : 'Test All' }}
        </button>
        <button
          class="inline-flex items-center justify-center gap-2 rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="ds-add-btn"
          :disabled="!canCreate"
          @click="openCreatePage"
        >
          <Plus :size="16" />
          Add Data Source
        </button>
      </div>
    </header>

    <div v-if="error" class="rounded-sm bg-rose-500/10 border border-rose-500/25 px-3 py-2 text-sm text-rose-500 mb-6">{{ error }}</div>

    <div v-if="loading && datasources.length === 0" class="flex flex-col items-center justify-center py-16 px-8 text-center gap-4">
      <div class="h-8 w-8 rounded-full border-3 border-border border-t-accent animate-spin"></div>
      <p class="text-sm text-text-muted">Loading datasources...</p>
    </div>

    <div v-else-if="datasources.length === 0" class="flex flex-col items-center justify-center py-16 px-8 text-center gap-4">
      <Database :size="48" class="text-text-muted" />
      <h3 class="text-lg font-semibold text-text-primary m-0">No data sources configured</h3>
      <p class="text-sm text-text-muted m-0">Add a data source to start querying your monitoring systems.</p>
      <button
        class="inline-flex items-center justify-center gap-2 rounded-sm bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="!canCreate"
        @click="openCreatePage"
      >
        <Plus :size="16" />
        Add Data Source
      </button>
    </div>

    <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
      <div
        v-for="ds in datasources"
        :key="ds.id"
        class="rounded border border-border bg-surface-raised transition hover:border-accent-border hover:shadow-md"
        :data-testid="`ds-card-${ds.id}`"
      >
        <div class="flex justify-between items-start p-4 pb-0 gap-3">
          <div class="flex items-start flex-wrap gap-2.5 min-w-0">
            <div
              class="flex items-center gap-2.5 rounded-sm border px-3.5 py-1.5 min-w-0"
              :style="{ borderColor: getTypeColor(ds.type) + '4d', background: getTypeColor(ds.type) + '14' }"
            >
              <img v-if="getTypeLogo(ds.type)" :src="getTypeLogo(ds.type)" :alt="`${dataSourceTypeLabels[ds.type]} logo`" class="w-[26px] h-[26px] object-contain shrink-0" />
              <Database v-else :size="26" class="shrink-0 text-text-muted" />
              <div class="flex flex-col gap-px min-w-0">
                <span class="text-[0.64rem] tracking-[0.05em] uppercase text-text-muted">Source Type</span>
                <strong class="text-sm font-bold text-text-primary leading-tight">{{ dataSourceTypeLabels[ds.type] }}</strong>
              </div>
            </div>
            <span v-if="ds.is_default" class="inline-flex items-center gap-1 rounded-sm bg-accent-muted text-accent px-2 py-0.5 text-xs font-medium">
              <Check :size="12" />
              Default
            </span>
          </div>
          <div class="flex gap-1">
            <button class="flex items-center justify-center h-8 w-8 rounded-sm text-text-muted hover:bg-surface-overlay hover:text-text-secondary transition border-none bg-transparent cursor-pointer" :data-testid="`ds-edit-${ds.id}`" @click="openEditPage(ds.id)" title="Edit">
              <Pencil :size="16" />
            </button>
            <button class="flex items-center justify-center h-8 w-8 rounded-sm text-text-muted hover:bg-rose-500/10 hover:text-rose-500 transition border-none bg-transparent cursor-pointer" :data-testid="`ds-delete-${ds.id}`" @click="handleDelete(ds)" title="Delete">
              <Trash2 :size="16" />
            </button>
          </div>
        </div>
        <div class="flex flex-col gap-3 p-4">
          <div class="flex flex-col gap-2">
            <h3 class="text-sm font-semibold text-text-primary m-0">{{ ds.name }}</h3>
            <div class="flex items-center gap-1.5 text-xs text-text-muted break-all">
              <ExternalLink :size="14" class="shrink-0" />
              <span class="truncate">{{ ds.url }}</span>
            </div>
          </div>
          <div class="flex items-center justify-between gap-3">
            <span
              class="inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-xs border"
              :class="{
                'text-text-muted bg-surface-overlay border-border': getHealthStatus(ds.id) === 'unknown',
                'text-sky-600 bg-sky-50 border-sky-200': getHealthStatus(ds.id) === 'checking',
                'text-accent bg-accent-muted border-accent-border': getHealthStatus(ds.id) === 'healthy',
                'text-rose-500 bg-rose-500/10 border-rose-500/25': getHealthStatus(ds.id) === 'unhealthy',
              }"
              :title="healthErrors[ds.id] || getHealthLabel(ds.id)"
            >
              <Loader2 v-if="getHealthStatus(ds.id) === 'checking'" :size="12" class="animate-spin" />
              <span v-else-if="getHealthStatus(ds.id) === 'healthy'" class="h-2.5 w-2.5 rounded-full bg-accent"></span>
              <span v-else-if="getHealthStatus(ds.id) === 'unhealthy'" class="h-2.5 w-2.5 rounded-full bg-rose-500"></span>
              <span v-else class="h-2.5 w-2.5 rounded-full bg-amber-500"></span>
              <span>{{ getHealthLabel(ds.id) }}</span>
            </span>

            <button
              class="inline-flex items-center justify-center gap-1.5 rounded-sm border border-border-strong px-2.5 py-1 text-xs font-semibold text-text-primary transition hover:border-border-strong disabled:opacity-50 disabled:cursor-not-allowed"
              :data-testid="`ds-test-${ds.id}`"
              :disabled="getHealthStatus(ds.id) === 'checking'"
              @click="testDatasource(ds)"
              title="Run connection test"
            >
              <Loader2 v-if="getHealthStatus(ds.id) === 'checking'" :size="14" class="animate-spin" />
              <HeartPulse v-else :size="14" />
              {{ getHealthStatus(ds.id) === 'checking' ? 'Testing...' : 'Test' }}
            </button>
          </div>
          <div v-if="healthErrors[ds.id]" class="mt-1 text-xs text-rose-500 leading-relaxed">{{ healthErrors[ds.id] }}</div>
        </div>
      </div>
    </div>
  </div>
</template>
