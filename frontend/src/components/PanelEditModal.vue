<script setup lang="ts">
import { Plus, Trash2, X } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { createPanel, updatePanel } from '../api/panels'
import { useDatasource } from '../composables/useDatasource'
import { useOrganization } from '../composables/useOrganization'
import { isTracingType } from '../types/datasource'
import type { Panel } from '../types/panel'
import ClickHouseSQLEditor from './ClickHouseSQLEditor.vue'
import CloudWatchQueryEditor from './CloudWatchQueryEditor.vue'
import ElasticsearchQueryEditor from './ElasticsearchQueryEditor.vue'
import QueryBuilder from './QueryBuilder.vue'

interface Threshold {
  value: number
  color: string
}

type QuerySignal = 'logs' | 'metrics' | 'traces'

function getDefaultQuerySignal(panelType: string): QuerySignal {
  if (panelType === 'logs') {
    return 'logs'
  }
  if (panelType === 'trace_list' || panelType === 'trace_heatmap') {
    return 'traces'
  }
  return 'metrics'
}

function isQuerySignal(value: unknown): value is QuerySignal {
  return value === 'logs' || value === 'metrics' || value === 'traces'
}

const props = defineProps<{
  panel?: Panel
  dashboardId: string
}>()

const emit = defineEmits<{
  close: []
  saved: []
}>()

const { currentOrg } = useOrganization()
const { datasources, fetchDatasources } = useDatasource()

const isEditing = computed(() => !!props.panel)

const title = ref(props.panel?.title || '')
const panelType = ref(props.panel?.type || 'line_chart')
const selectedDatasourceId = ref(
  typeof props.panel?.query?.datasource_id === 'string' ? props.panel.query.datasource_id : '',
)
// Extract promql/expr from query config, or use empty string
const promqlQuery = ref(
  typeof props.panel?.query?.promql === 'string'
    ? props.panel.query.promql
    : typeof props.panel?.query?.expr === 'string'
      ? props.panel.query.expr
      : '',
)
const querySignal = ref<QuerySignal>(
  isQuerySignal(props.panel?.query?.signal)
    ? props.panel.query.signal
    : getDefaultQuerySignal(props.panel?.type || 'line_chart'),
)

onMounted(() => {
  if (currentOrg.value) {
    fetchDatasources(currentOrg.value.id)
  }
})

// Gauge-specific options
const gaugeMin = ref(typeof props.panel?.query?.min === 'number' ? props.panel.query.min : 0)
const gaugeMax = ref(typeof props.panel?.query?.max === 'number' ? props.panel.query.max : 100)
const gaugeUnit = ref(typeof props.panel?.query?.unit === 'string' ? props.panel.query.unit : '')
const gaugeDecimals = ref(
  typeof props.panel?.query?.decimals === 'number' ? props.panel.query.decimals : 2,
)
const gaugeThresholds = ref<Threshold[]>(
  Array.isArray(props.panel?.query?.thresholds)
    ? (props.panel.query.thresholds as Threshold[])
    : [{ value: 80, color: '#ff6b6b' }],
)

// Pie chart-specific options
const pieDisplayAs = ref<'pie' | 'donut'>(
  props.panel?.query?.displayAs === 'donut' ? 'donut' : 'pie',
)
const pieShowLegend = ref(props.panel?.query?.showLegend !== false)
const pieShowLabels = ref(props.panel?.query?.showLabels !== false)

// Stat panel-specific options
const statUnit = ref(typeof props.panel?.query?.unit === 'string' ? props.panel.query.unit : '')
const statDecimals = ref(
  typeof props.panel?.query?.decimals === 'number' ? props.panel.query.decimals : 2,
)
const statShowTrend = ref(props.panel?.query?.showTrend !== false)
const statShowSparkline = ref(props.panel?.query?.showSparkline !== false)
const statThresholds = ref<Threshold[]>(
  Array.isArray(props.panel?.query?.thresholds)
    ? (props.panel.query.thresholds as Threshold[])
    : [],
)
const traceService = ref(
  typeof props.panel?.query?.service === 'string' ? props.panel.query.service : '',
)
const traceLimit = ref(
  typeof props.panel?.query?.limit === 'number' && Number.isFinite(props.panel.query.limit)
    ? Math.max(1, Math.min(200, Math.floor(props.panel.query.limit)))
    : 50,
)

const loading = ref(false)
const error = ref<string | null>(null)

const isGaugeType = computed(() => panelType.value === 'gauge')
const isPieType = computed(() => panelType.value === 'pie')
const isStatType = computed(() => panelType.value === 'stat')
const isTracePanelType = computed(
  () => panelType.value === 'trace_list' || panelType.value === 'trace_heatmap',
)
const selectedDatasource = computed(() => {
  return (
    datasources.value.find((datasource) => datasource.id === selectedDatasourceId.value) || null
  )
})
const isClickHouseDatasource = computed(() => selectedDatasource.value?.type === 'clickhouse')
const isCloudWatchDatasource = computed(() => selectedDatasource.value?.type === 'cloudwatch')
const isElasticsearchDatasource = computed(() => selectedDatasource.value?.type === 'elasticsearch')
const isSignalDatasource = computed(
  () =>
    isClickHouseDatasource.value || isCloudWatchDatasource.value || isElasticsearchDatasource.value,
)
const nonTraceSignal = computed<'logs' | 'metrics'>({
  get() {
    return querySignal.value === 'logs' ? 'logs' : 'metrics'
  },
  set(value) {
    querySignal.value = value
  },
})
const availableDatasources = computed(() => {
  if (isTracePanelType.value) {
    return datasources.value.filter((datasource) => isTracingType(datasource.type))
  }

  return datasources.value
})

watch(
  [panelType, datasources],
  () => {
    if (isTracePanelType.value) {
      if (
        !availableDatasources.value.some(
          (datasource) => datasource.id === selectedDatasourceId.value,
        )
      ) {
        selectedDatasourceId.value = availableDatasources.value[0]?.id || ''
      }
      return
    }

    if (
      selectedDatasourceId.value &&
      !datasources.value.some((datasource) => datasource.id === selectedDatasourceId.value)
    ) {
      selectedDatasourceId.value = ''
    }
  },
  { immediate: true },
)

watch(panelType, (nextType) => {
  if (!isSignalDatasource.value) {
    return
  }
  querySignal.value = getDefaultQuerySignal(nextType)
})

watch(selectedDatasource, (nextDatasource, prevDatasource) => {
  const switchedToSignalDatasource =
    (nextDatasource?.type === 'clickhouse' ||
      nextDatasource?.type === 'cloudwatch' ||
      nextDatasource?.type === 'elasticsearch') &&
    prevDatasource?.type !== nextDatasource?.type

  if (switchedToSignalDatasource) {
    querySignal.value = getDefaultQuerySignal(panelType.value)
  }
})

function addThreshold() {
  const lastValue =
    gaugeThresholds.value.length > 0
      ? gaugeThresholds.value[gaugeThresholds.value.length - 1].value + 10
      : 50
  gaugeThresholds.value.push({ value: lastValue, color: '#feca57' })
}

function removeThreshold(index: number) {
  gaugeThresholds.value.splice(index, 1)
}

function addStatThreshold() {
  const lastValue =
    statThresholds.value.length > 0
      ? statThresholds.value[statThresholds.value.length - 1].value + 10
      : 50
  statThresholds.value.push({ value: lastValue, color: '#feca57' })
}

function removeStatThreshold(index: number) {
  statThresholds.value.splice(index, 1)
}

async function handleSubmit() {
  if (!title.value.trim()) {
    error.value = 'Title is required'
    return
  }

  if (isTracePanelType.value && !selectedDatasourceId.value) {
    error.value = 'Tracing datasource is required for trace panels'
    return
  }

  // Build query config
  const query: Record<string, unknown> = {}

  if (selectedDatasourceId.value) {
    query.datasource_id = selectedDatasourceId.value
  }

  const trimmedQuery = promqlQuery.value.trim()
  if (trimmedQuery) {
    if (selectedDatasourceId.value) {
      query.expr = trimmedQuery
    } else {
      query.promql = trimmedQuery
    }
  }

  if (isSignalDatasource.value) {
    if (
      (isCloudWatchDatasource.value || isElasticsearchDatasource.value) &&
      querySignal.value === 'traces'
    ) {
      query.signal = panelType.value === 'logs' ? 'logs' : 'metrics'
    } else {
      query.signal = querySignal.value
    }
  }

  if (isTracePanelType.value) {
    const trimmedService = traceService.value.trim()
    if (trimmedService) {
      query.service = trimmedService
    }
    const normalizedTraceLimit = Number.isFinite(traceLimit.value)
      ? Math.max(1, Math.min(200, Math.floor(traceLimit.value)))
      : 50
    query.limit = normalizedTraceLimit
  }

  // Add gauge-specific config if gauge type is selected
  if (isGaugeType.value) {
    query.min = gaugeMin.value
    query.max = gaugeMax.value
    query.unit = gaugeUnit.value
    query.decimals = gaugeDecimals.value
    query.thresholds = gaugeThresholds.value
  }

  // Add pie chart-specific config if pie type is selected
  if (isPieType.value) {
    query.displayAs = pieDisplayAs.value
    query.showLegend = pieShowLegend.value
    query.showLabels = pieShowLabels.value
  }

  // Add stat panel-specific config if stat type is selected
  if (isStatType.value) {
    query.unit = statUnit.value
    query.decimals = statDecimals.value
    query.showTrend = statShowTrend.value
    query.showSparkline = statShowSparkline.value
    if (statThresholds.value.length > 0) {
      query.thresholds = statThresholds.value
    }
  }

  const finalQuery = Object.keys(query).length > 0 ? query : undefined

  loading.value = true
  error.value = null

  try {
    if (isEditing.value && props.panel) {
      await updatePanel(props.panel.id, {
        title: title.value.trim(),
        type: panelType.value,
        query: finalQuery,
      })
    } else {
      await createPanel(props.dashboardId, {
        title: title.value.trim(),
        type: panelType.value,
        grid_pos: { x: 0, y: 0, w: 6, h: 4 },
        query: finalQuery,
      })
    }
    emit('saved')
  } catch {
    error.value = isEditing.value ? 'Failed to update panel' : 'Failed to create panel'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" @click.self="emit('close')">
    <div class="w-full max-w-4xl rounded border border-border bg-surface-raised shadow-lg max-h-[90vh] overflow-y-auto" data-testid="panel-edit-modal">
      <header class="flex items-center justify-between border-b border-border px-6 py-4 sticky top-0 bg-surface-raised z-10">
        <h2 class="text-lg font-semibold text-text-primary">{{ isEditing ? 'Edit Panel' : 'Add Panel' }}</h2>
        <button class="flex items-center justify-center h-8 w-8 rounded-sm text-text-muted hover:bg-surface-overlay hover:text-text-secondary transition cursor-pointer" data-testid="panel-edit-close-btn" @click="emit('close')">
          <X :size="20" />
        </button>
      </header>

      <form class="px-6 py-4" @submit.prevent="handleSubmit">
        <div class="grid grid-cols-[1fr_auto] gap-4">
          <div class="mb-5">
            <label for="title" class="block mb-2 text-sm font-medium text-text-primary">Title <span class="text-red-500">*</span></label>
            <input
              id="title"
              v-model="title"
              type="text"
              placeholder="Panel title"
              :disabled="loading"
              autocomplete="off"
              data-testid="panel-title-input"
              class="w-full rounded-sm border border-border bg-surface-raised px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition disabled:bg-surface-overlay disabled:text-text-muted disabled:cursor-not-allowed"
            />
          </div>

          <div class="mb-5 min-w-[160px]">
            <label for="type" class="block mb-2 text-sm font-medium text-text-primary">Panel Type</label>
            <select id="type" v-model="panelType" :disabled="loading" data-testid="panel-type-select" class="w-full rounded-sm border border-border bg-surface-raised px-3 py-2.5 text-sm text-text-primary focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition cursor-pointer appearance-none bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2712%27%20height=%2712%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27%2394a3b8%27%20stroke-width=%272%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27%3E%3Cpath%20d=%27m6%209%206%206%206-6%27/%3E%3C/svg%3E')] bg-no-repeat bg-[right_0.75rem_center] pr-10 disabled:bg-surface-overlay disabled:text-text-muted disabled:cursor-not-allowed">
              <option value="line_chart">Line Chart</option>
              <option value="bar_chart">Bar Chart</option>
              <option value="pie">Pie Chart</option>
              <option value="gauge">Gauge</option>
              <option value="stat">Stat</option>
              <option value="table">Table</option>
              <option value="logs">Logs</option>
              <option value="trace_list">Trace List</option>
              <option value="trace_heatmap">Trace Heatmap</option>
            </select>
          </div>
        </div>

        <div v-if="datasources.length > 0" class="mb-5">
          <label for="datasource" class="block mb-2 text-sm font-medium text-text-primary">Data Source</label>
          <select id="datasource" v-model="selectedDatasourceId" :disabled="loading" data-testid="panel-datasource-select" class="w-full rounded-sm border border-border bg-surface-raised px-3 py-2.5 text-sm text-text-primary focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition cursor-pointer appearance-none bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2712%27%20height=%2712%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27%2394a3b8%27%20stroke-width=%272%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27%3E%3Cpath%20d=%27m6%209%206%206%206-6%27/%3E%3C/svg%3E')] bg-no-repeat bg-[right_0.75rem_center] pr-10 disabled:bg-surface-overlay disabled:text-text-muted disabled:cursor-not-allowed">
            <option v-if="!isTracePanelType" value="">Default (Prometheus)</option>
            <option v-else value="">Select tracing datasource</option>
            <option v-for="ds in availableDatasources" :key="ds.id" :value="ds.id">
              {{ ds.name }} ({{ ds.type }})
            </option>
          </select>
        </div>

        <div class="mb-5 border-t border-border pt-5">
          <label class="block mb-2 text-sm font-medium text-text-primary">
            {{
              isClickHouseDatasource
                ? 'SQL Query'
                : isCloudWatchDatasource
                  ? 'CloudWatch Query'
                  : isElasticsearchDatasource
                    ? 'Elasticsearch Query'
                    : isTracePanelType
                      ? 'Trace Search Query'
                      : 'Query'
            }}
          </label>
          <QueryBuilder
            v-if="!isSignalDatasource"
            v-model="promqlQuery"
            :disabled="loading"
          />
          <ClickHouseSQLEditor
            v-else-if="isClickHouseDatasource"
            v-model="promqlQuery"
            v-model:signal="querySignal"
            :disabled="loading"
          />
          <CloudWatchQueryEditor
            v-else-if="isCloudWatchDatasource"
            v-model="promqlQuery"
            v-model:signal="nonTraceSignal"
            :disabled="loading"
          />
          <ElasticsearchQueryEditor
            v-else
            v-model="promqlQuery"
            v-model:signal="nonTraceSignal"
            :disabled="loading"
          />
        </div>

        <div v-if="isTracePanelType" class="border-t border-border pt-5 mb-5">
          <h4 class="text-sm font-semibold text-text-primary mb-3">Trace Panel Options</h4>

          <div class="grid grid-cols-2 gap-3">
            <div class="mb-3">
              <label for="trace-service-filter" class="block mb-2 text-sm font-medium text-text-primary">Service Filter (optional)</label>
              <input
                id="trace-service-filter"
                v-model="traceService"
                data-testid="panel-trace-service-input"
                type="text"
                placeholder="api-service"
                :disabled="loading"
                class="w-full rounded-sm border border-border bg-surface-raised px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition disabled:bg-surface-overlay disabled:text-text-muted disabled:cursor-not-allowed"
              />
            </div>
            <div class="mb-3">
              <label for="trace-limit" class="block mb-2 text-sm font-medium text-text-primary">Max traces</label>
              <input
                id="trace-limit"
                v-model.number="traceLimit"
                data-testid="panel-trace-limit-input"
                type="number"
                min="1"
                max="200"
                :disabled="loading"
                class="w-full rounded-sm border border-border bg-surface-raised px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition disabled:bg-surface-overlay disabled:text-text-muted disabled:cursor-not-allowed"
              />
            </div>
          </div>
        </div>

        <!-- Gauge Configuration -->
        <div v-if="isGaugeType" class="border-t border-border pt-5 mb-5">
          <h4 class="text-sm font-semibold text-text-primary mb-3">Gauge Options</h4>

          <div class="grid grid-cols-4 gap-3">
            <div class="mb-3">
              <label for="gauge-min" class="block mb-2 text-sm font-medium text-text-primary">Min</label>
              <input
                id="gauge-min"
                v-model.number="gaugeMin"
                data-testid="panel-gauge-min-input"
                type="number"
                :disabled="loading"
                class="w-full rounded-sm border border-border bg-surface-raised px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition disabled:bg-surface-overlay disabled:text-text-muted disabled:cursor-not-allowed"
              />
            </div>
            <div class="mb-3">
              <label for="gauge-max" class="block mb-2 text-sm font-medium text-text-primary">Max</label>
              <input
                id="gauge-max"
                v-model.number="gaugeMax"
                data-testid="panel-gauge-max-input"
                type="number"
                :disabled="loading"
                class="w-full rounded-sm border border-border bg-surface-raised px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition disabled:bg-surface-overlay disabled:text-text-muted disabled:cursor-not-allowed"
              />
            </div>
            <div class="mb-3">
              <label for="gauge-unit" class="block mb-2 text-sm font-medium text-text-primary">Unit</label>
              <input
                id="gauge-unit"
                v-model="gaugeUnit"
                data-testid="panel-gauge-unit-input"
                type="text"
                placeholder="%"
                :disabled="loading"
                class="w-full rounded-sm border border-border bg-surface-raised px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition disabled:bg-surface-overlay disabled:text-text-muted disabled:cursor-not-allowed"
              />
            </div>
            <div class="mb-3">
              <label for="gauge-decimals" class="block mb-2 text-sm font-medium text-text-primary">Decimals</label>
              <input
                id="gauge-decimals"
                v-model.number="gaugeDecimals"
                data-testid="panel-gauge-decimals-input"
                type="number"
                min="0"
                max="10"
                :disabled="loading"
                class="w-full rounded-sm border border-border bg-surface-raised px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition disabled:bg-surface-overlay disabled:text-text-muted disabled:cursor-not-allowed"
              />
            </div>
          </div>

          <div class="mt-4">
            <div class="flex justify-between items-center mb-2">
              <label class="text-sm font-medium text-text-primary">Thresholds</label>
              <button type="button" data-testid="panel-gauge-add-threshold-btn" class="inline-flex items-center gap-1 rounded-sm border border-border bg-surface-raised px-2.5 py-1.5 text-xs font-medium text-text-primary transition hover:bg-surface-overlay cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" @click="addThreshold" :disabled="loading">
                <Plus :size="14" />
                Add
              </button>
            </div>
            <div class="flex flex-col gap-2">
              <div v-for="(threshold, index) in gaugeThresholds" :key="index" class="flex items-center gap-2">
                <input
                  v-model.number="threshold.value"
                  type="number"
                  placeholder="Value"
                  :disabled="loading"
                  class="flex-1 rounded-sm border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition disabled:bg-surface-overlay disabled:text-text-muted disabled:cursor-not-allowed"
                />
                <input
                  v-model="threshold.color"
                  type="color"
                  :disabled="loading"
                  class="w-10 h-9 p-0.5 bg-surface-raised border border-border rounded-sm cursor-pointer"
                />
                <button
                  type="button"
                  class="flex items-center justify-center h-8 w-8 rounded-sm bg-transparent border-none text-text-muted cursor-pointer transition hover:bg-red-50 hover:text-red-500"
                  @click="removeThreshold(index)"
                  :disabled="loading"
                  title="Remove threshold"
                >
                  <Trash2 :size="14" />
                </button>
              </div>
              <p v-if="gaugeThresholds.length === 0" class="text-xs text-text-muted m-0 p-2 text-center">
                No thresholds configured. Values below any threshold will show green.
              </p>
            </div>
          </div>
        </div>

        <!-- Pie Chart Configuration -->
        <div v-if="isPieType" class="border-t border-border pt-5 mb-5">
          <h4 class="text-sm font-semibold text-text-primary mb-3">Pie Chart Options</h4>

          <div class="grid grid-cols-3 gap-3">
            <div class="mb-3">
              <label for="pie-display" class="block mb-2 text-sm font-medium text-text-primary">Display Style</label>
              <select id="pie-display" v-model="pieDisplayAs" data-testid="panel-pie-display-select" :disabled="loading" class="w-full rounded-sm border border-border bg-surface-raised px-3 py-2.5 text-sm text-text-primary focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition cursor-pointer appearance-none bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2712%27%20height=%2712%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27%2394a3b8%27%20stroke-width=%272%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27%3E%3Cpath%20d=%27m6%209%206%206%206-6%27/%3E%3C/svg%3E')] bg-no-repeat bg-[right_0.75rem_center] pr-10 disabled:bg-surface-overlay disabled:text-text-muted disabled:cursor-not-allowed">
                <option value="pie">Pie</option>
                <option value="donut">Donut</option>
              </select>
            </div>
            <div class="mb-3">
              <label for="pie-legend" class="block mb-2 text-sm font-medium text-text-primary">Show Legend</label>
              <div class="flex items-center gap-2">
                <input
                  id="pie-legend"
                  v-model="pieShowLegend"
                  data-testid="panel-pie-legend-checkbox"
                  type="checkbox"
                  :disabled="loading"
                  class="h-4 w-4 rounded border-border-strong text-accent focus:ring-accent/20"
                />
                <label for="pie-legend" class="text-sm text-text-primary">Display legend</label>
              </div>
            </div>
            <div class="mb-3">
              <label for="pie-labels" class="block mb-2 text-sm font-medium text-text-primary">Show Labels</label>
              <div class="flex items-center gap-2">
                <input
                  id="pie-labels"
                  v-model="pieShowLabels"
                  data-testid="panel-pie-labels-checkbox"
                  type="checkbox"
                  :disabled="loading"
                  class="h-4 w-4 rounded border-border-strong text-accent focus:ring-accent/20"
                />
                <label for="pie-labels" class="text-sm text-text-primary">Display value labels</label>
              </div>
            </div>
          </div>
        </div>

        <!-- Stat Panel Configuration -->
        <div v-if="isStatType" class="border-t border-border pt-5 mb-5">
          <h4 class="text-sm font-semibold text-text-primary mb-3">Stat Panel Options</h4>

          <div class="grid grid-cols-2 gap-3">
            <div class="mb-3">
              <label for="stat-unit" class="block mb-2 text-sm font-medium text-text-primary">Unit</label>
              <input
                id="stat-unit"
                v-model="statUnit"
                data-testid="panel-stat-unit-input"
                type="text"
                placeholder="%"
                :disabled="loading"
                class="w-full rounded-sm border border-border bg-surface-raised px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition disabled:bg-surface-overlay disabled:text-text-muted disabled:cursor-not-allowed"
              />
            </div>
            <div class="mb-3">
              <label for="stat-decimals" class="block mb-2 text-sm font-medium text-text-primary">Decimals</label>
              <input
                id="stat-decimals"
                v-model.number="statDecimals"
                data-testid="panel-stat-decimals-input"
                type="number"
                min="0"
                max="10"
                :disabled="loading"
                class="w-full rounded-sm border border-border bg-surface-raised px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition disabled:bg-surface-overlay disabled:text-text-muted disabled:cursor-not-allowed"
              />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label class="flex items-center gap-2 text-sm font-medium text-text-primary cursor-pointer">
                <input
                  type="checkbox"
                  v-model="statShowTrend"
                  data-testid="panel-stat-trend-checkbox"
                  :disabled="loading"
                  class="h-4 w-4 rounded border-border-strong text-accent focus:ring-accent/20"
                />
                Show Trend Indicator
              </label>
            </div>
            <div>
              <label class="flex items-center gap-2 text-sm font-medium text-text-primary cursor-pointer">
                <input
                  type="checkbox"
                  v-model="statShowSparkline"
                  data-testid="panel-stat-sparkline-checkbox"
                  :disabled="loading"
                  class="h-4 w-4 rounded border-border-strong text-accent focus:ring-accent/20"
                />
                Show Sparkline
              </label>
            </div>
          </div>

          <div class="mt-4">
            <div class="flex justify-between items-center mb-2">
              <label class="text-sm font-medium text-text-primary">Thresholds (Optional)</label>
              <button type="button" data-testid="panel-stat-add-threshold-btn" class="inline-flex items-center gap-1 rounded-sm border border-border bg-surface-raised px-2.5 py-1.5 text-xs font-medium text-text-primary transition hover:bg-surface-overlay cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" @click="addStatThreshold" :disabled="loading">
                <Plus :size="14" />
                Add
              </button>
            </div>
            <div class="flex flex-col gap-2">
              <div v-for="(threshold, index) in statThresholds" :key="index" class="flex items-center gap-2">
                <input
                  v-model.number="threshold.value"
                  type="number"
                  placeholder="Value"
                  :disabled="loading"
                  class="flex-1 rounded-sm border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition disabled:bg-surface-overlay disabled:text-text-muted disabled:cursor-not-allowed"
                />
                <input
                  v-model="threshold.color"
                  type="color"
                  :disabled="loading"
                  class="w-10 h-9 p-0.5 bg-surface-raised border border-border rounded-sm cursor-pointer"
                />
                <button
                  type="button"
                  class="flex items-center justify-center h-8 w-8 rounded-sm bg-transparent border-none text-text-muted cursor-pointer transition hover:bg-red-50 hover:text-red-500"
                  @click="removeStatThreshold(index)"
                  :disabled="loading"
                  title="Remove threshold"
                >
                  <Trash2 :size="14" />
                </button>
              </div>
              <p v-if="statThresholds.length === 0" class="text-xs text-text-muted m-0 p-2 text-center">
                No thresholds configured.
              </p>
            </div>
          </div>
        </div>

        <div v-if="error" class="rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 mb-5">{{ error }}</div>

        <div class="flex justify-end gap-3 border-t border-border pt-4 mt-2">
          <button type="button" data-testid="panel-edit-cancel-btn" class="rounded-sm border border-border-strong px-5 py-2.5 text-sm font-semibold text-text-primary transition hover:border-border-strong cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" @click="emit('close')" :disabled="loading">
            Cancel
          </button>
          <button type="submit" data-testid="panel-edit-save-btn" class="rounded-sm bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" :disabled="loading">
            {{ loading ? 'Saving...' : (isEditing ? 'Save Changes' : 'Add Panel') }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
