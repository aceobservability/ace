<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Check, CircleAlert, Database, ExternalLink, HeartPulse, Loader2, Pencil, Plus, Trash2 } from 'lucide-vue-next'
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
  prometheus: prometheusLogo, loki: lokiLogo, victoriametrics: victoriaMetricsLogo,
  victorialogs: victoriaLogsLogo, tempo: tempoLogo, victoriatraces: victoriaTracesLogo,
  clickhouse: clickhouseLogo, cloudwatch: cloudwatchLogo, elasticsearch: elasticsearchLogo,
}

const canCreate = computed(() => !!currentOrg.value && currentOrg.value.role !== 'viewer')
function openCreatePage() { router.push('/app/datasources/new') }
function openEditPage(dsId: string) { router.push(`/app/datasources/${dsId}/edit`) }
function getTypeLogo(type_: DataSourceType): string | undefined { return dataSourceTypeLogos[type_] }

function getTypeColor(type_: DataSourceType): string {
  switch (type_) {
    case 'prometheus': return '#e6522c'
    case 'loki': return '#f9a825'
    case 'victorialogs': return '#6ec6ff'
    case 'victoriametrics': return '#59a14f'
    case 'tempo': return '#8f6dff'
    case 'victoriatraces': return '#5bc0be'
    case 'clickhouse': return '#ffd400'
    case 'cloudwatch': return '#F59E0B'
    case 'elasticsearch': return '#00bfb3'
    case 'vmalert': return '#ef4444'
    case 'alertmanager': return '#e45858'
  }
}

function getHealthStatus(dsId: string) { return healthStatus.value[dsId] || 'unknown' }
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
  try { await testDataSourceConnection(ds.id); healthStatus.value[ds.id] = 'healthy' }
  catch (e) { healthStatus.value[ds.id] = 'unhealthy'; healthErrors.value[ds.id] = e instanceof Error ? e.message : 'Connection test failed' }
}

async function testAllDatasources() {
  testAllLoading.value = true
  try { for (const ds of datasources.value) await testDatasource(ds) }
  finally { testAllLoading.value = false }
}

async function handleDelete(ds: DataSource) {
  if (!confirm(`Delete datasource "${ds.name}"? This cannot be undone.`)) return
  try { await removeDatasource(ds.id) } catch { /* error set by composable */ }
}

onMounted(() => { if (currentOrg.value) fetchDatasources(currentOrg.value.id) })
watch(() => currentOrg.value?.id, (orgId, prevOrgId) => { if (orgId && orgId !== prevOrgId) fetchDatasources(orgId) })
</script>

<template>
  <div class="py-5 px-6 max-w-[1120px] mx-auto max-md:p-[0.9rem]">
    <header class="flex justify-between items-center gap-4 mb-4 p-4 border border-border rounded-[14px] bg-surface-1 shadow-sm max-md:flex-col max-md:items-stretch">
      <div>
        <h1 class="text-[1.03rem] font-bold font-mono uppercase tracking-[0.04em]">Data Sources</h1>
        <p class="text-sm text-text-1 mt-1">Manage connections to your monitoring systems</p>
      </div>
      <div class="flex items-center gap-[0.625rem] max-md:justify-start max-md:flex-wrap">
        <button class="inline-flex items-center gap-2 py-2 px-[0.875rem] text-[0.8125rem] rounded-[10px] border border-accent bg-transparent text-text-accent cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed min-w-[96px]" :disabled="datasources.length === 0 || testAllLoading" @click="testAllDatasources">
          <Loader2 v-if="testAllLoading" :size="16" class="animate-[spin_0.8s_linear_infinite]" />
          <HeartPulse v-else :size="16" />
          {{ testAllLoading ? 'Testing...' : 'Test All' }}
        </button>
        <button class="inline-flex items-center gap-2 py-2 px-[0.875rem] text-[0.8125rem] rounded-[10px] bg-accent text-[#1a0f00] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" :disabled="!canCreate" @click="openCreatePage">
          <Plus :size="16" />
          Add Data Source
        </button>
      </div>
    </header>

    <div v-if="error" class="py-3 px-4 rounded-[8px] text-danger text-sm mb-6" style="background: rgba(255, 107, 107, 0.1); border: 1px solid rgba(255, 107, 107, 0.3)">{{ error }}</div>

    <div v-if="loading && datasources.length === 0" class="flex flex-col items-center justify-center p-16 text-center gap-4">
      <div class="w-8 h-8 border-3 border-border border-t-accent rounded-full animate-[spin_0.8s_linear_infinite]"></div>
      <p class="text-text-1">Loading datasources...</p>
    </div>

    <div v-else-if="datasources.length === 0" class="flex flex-col items-center justify-center p-16 text-center gap-4">
      <Database :size="48" class="text-text-2" />
      <h3 class="text-[1.125rem]">No data sources configured</h3>
      <p class="text-text-1 text-sm">Add a data source to start querying your monitoring systems.</p>
      <button class="inline-flex items-center gap-2 py-[0.625rem] px-5 rounded-[6px] bg-accent text-[#1a0f00] text-sm font-medium cursor-pointer" :disabled="!canCreate" @click="openCreatePage">
        <Plus :size="16" />
        Add Data Source
      </button>
    </div>

    <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
      <div v-for="ds in datasources" :key="ds.id" class="ds-card border border-border rounded-[12px] shadow-sm transition-all duration-200 hover:border-[rgba(245,158,11,0.35)] hover:shadow-md hover:-translate-y-px" style="background: linear-gradient(180deg, rgba(16, 27, 42, 0.92), rgba(13, 23, 36, 0.9))">
        <div class="flex justify-between items-start p-4 pb-0 gap-3">
          <div class="flex items-start flex-wrap gap-[0.625rem] min-w-0">
            <div class="flex items-center gap-[0.65rem] py-[0.4rem] px-[0.85rem] rounded-[11px] border" :style="{ borderColor: getTypeColor(ds.type) + '4d', background: getTypeColor(ds.type) + '14' }">
              <img v-if="getTypeLogo(ds.type)" :src="getTypeLogo(ds.type)" :alt="`${dataSourceTypeLabels[ds.type]} logo`" class="w-[26px] h-[26px] object-contain shrink-0" />
              <Database v-else :size="26" class="shrink-0" />
              <div class="flex flex-col gap-[0.08rem] min-w-0">
                <span class="text-[0.64rem] tracking-[0.05em] uppercase text-text-2">Source Type</span>
                <strong class="text-[0.84rem] font-bold text-text-0 leading-[1.2]">{{ dataSourceTypeLabels[ds.type] }}</strong>
              </div>
            </div>
            <span v-if="ds.is_default" class="inline-flex items-center gap-1 py-[0.2rem] px-2 rounded-full text-[0.7rem] font-medium text-accent" style="background: rgba(245, 158, 11, 0.16)">
              <Check :size="12" /> Default
            </span>
          </div>
          <div class="flex gap-1">
            <button class="flex items-center justify-center w-8 h-8 p-0 bg-transparent border-none rounded-[6px] text-text-1 cursor-pointer transition-all duration-200 hover:bg-bg-hover hover:text-text-0" @click="openEditPage(ds.id)" title="Edit"><Pencil :size="16" /></button>
            <button class="flex items-center justify-center w-8 h-8 p-0 bg-transparent border-none rounded-[6px] text-text-1 cursor-pointer transition-all duration-200 hover:text-danger" style="--hover-bg: rgba(251, 113, 133, 0.15)" @click="handleDelete(ds)" title="Delete"><Trash2 :size="16" /></button>
          </div>
        </div>
        <div class="p-4 flex flex-col gap-3">
          <div class="flex flex-col gap-2">
            <h3 class="text-base font-semibold">{{ ds.name }}</h3>
            <div class="flex items-center gap-[0.375rem] text-[0.78rem] text-text-2 break-all py-[0.45rem] px-[0.6rem] rounded-[7px] bg-bg-2 border border-border">
              <ExternalLink :size="14" />
              <span>{{ ds.url }}</span>
            </div>
          </div>
          <div class="flex items-center justify-between gap-3">
            <span class="health-badge inline-flex items-center gap-[0.35rem] py-[0.22rem] px-2 rounded-full border text-[0.72rem]" :class="`health-${getHealthStatus(ds.id)}`" :title="healthErrors[ds.id] || getHealthLabel(ds.id)">
              <Loader2 v-if="getHealthStatus(ds.id) === 'checking'" :size="12" class="animate-[spin_0.8s_linear_infinite]" />
              <HeartPulse v-else-if="getHealthStatus(ds.id) === 'healthy'" :size="12" />
              <CircleAlert v-else-if="getHealthStatus(ds.id) === 'unhealthy'" :size="12" />
              <span>{{ getHealthLabel(ds.id) }}</span>
            </span>
            <button class="inline-flex items-center gap-2 py-[0.28rem] px-[0.55rem] text-[0.72rem] rounded-full border border-accent bg-transparent text-text-accent min-h-[28px] leading-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" :disabled="getHealthStatus(ds.id) === 'checking'" @click="testDatasource(ds)" title="Run connection test">
              <Loader2 v-if="getHealthStatus(ds.id) === 'checking'" :size="14" class="animate-[spin_0.8s_linear_infinite]" />
              <HeartPulse v-else :size="14" />
              {{ getHealthStatus(ds.id) === 'checking' ? 'Testing...' : 'Test' }}
            </button>
          </div>
          <div v-if="healthErrors[ds.id]" class="mt-2 text-[0.75rem] text-danger leading-[1.4]">{{ healthErrors[ds.id] }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
/* Health badge color states */
.health-badge { color: var(--color-text-1); background: var(--color-bg-2); border-color: var(--color-border); }
.health-checking { color: #6ec6ff; background: rgba(110, 198, 255, 0.12); border-color: rgba(110, 198, 255, 0.35); }
.health-healthy { color: #59a14f; background: rgba(89, 161, 79, 0.12); border-color: rgba(89, 161, 79, 0.35); }
.health-unhealthy { color: var(--color-danger); background: rgba(255, 107, 107, 0.12); border-color: rgba(255, 107, 107, 0.35); }
</style>
