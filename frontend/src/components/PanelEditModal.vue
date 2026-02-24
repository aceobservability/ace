<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { X, Plus, Trash2 } from 'lucide-vue-next'
import type { Panel } from '../types/panel'
import { isTracingType } from '../types/datasource'
import { createPanel, updatePanel } from '../api/panels'
import { useDatasource } from '../composables/useDatasource'
import { useOrganization } from '../composables/useOrganization'
import QueryBuilder from './QueryBuilder.vue'
import ClickHouseSQLEditor from './ClickHouseSQLEditor.vue'
import CloudWatchQueryEditor from './CloudWatchQueryEditor.vue'
import ElasticsearchQueryEditor from './ElasticsearchQueryEditor.vue'

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
  typeof props.panel?.query?.datasource_id === 'string' ? props.panel.query.datasource_id : ''
)
// Extract promql/expr from query config, or use empty string
const promqlQuery = ref(
  typeof props.panel?.query?.promql === 'string'
    ? props.panel.query.promql
    : typeof props.panel?.query?.expr === 'string'
      ? props.panel.query.expr
      : ''
)
const querySignal = ref<QuerySignal>(
  isQuerySignal(props.panel?.query?.signal)
    ? props.panel.query.signal
    : getDefaultQuerySignal(props.panel?.type || 'line_chart')
)

onMounted(() => {
  if (currentOrg.value) {
    fetchDatasources(currentOrg.value.id)
  }
})

// Gauge-specific options
const gaugeMin = ref(
  typeof props.panel?.query?.min === 'number' ? props.panel.query.min : 0
)
const gaugeMax = ref(
  typeof props.panel?.query?.max === 'number' ? props.panel.query.max : 100
)
const gaugeUnit = ref(
  typeof props.panel?.query?.unit === 'string' ? props.panel.query.unit : ''
)
const gaugeDecimals = ref(
  typeof props.panel?.query?.decimals === 'number' ? props.panel.query.decimals : 2
)
const gaugeThresholds = ref<Threshold[]>(
  Array.isArray(props.panel?.query?.thresholds)
    ? (props.panel.query.thresholds as Threshold[])
    : [{ value: 80, color: '#ff6b6b' }]
)

// Pie chart-specific options
const pieDisplayAs = ref<'pie' | 'donut'>(
  props.panel?.query?.displayAs === 'donut' ? 'donut' : 'pie'
)
const pieShowLegend = ref(
  props.panel?.query?.showLegend !== false
)
const pieShowLabels = ref(
  props.panel?.query?.showLabels !== false
)

// Stat panel-specific options
const statUnit = ref(
  typeof props.panel?.query?.unit === 'string' ? props.panel.query.unit : ''
)
const statDecimals = ref(
  typeof props.panel?.query?.decimals === 'number' ? props.panel.query.decimals : 2
)
const statShowTrend = ref(
  props.panel?.query?.showTrend !== false
)
const statShowSparkline = ref(
  props.panel?.query?.showSparkline !== false
)
const statThresholds = ref<Threshold[]>(
  Array.isArray(props.panel?.query?.thresholds)
    ? (props.panel.query.thresholds as Threshold[])
    : []
)
const traceService = ref(
  typeof props.panel?.query?.service === 'string' ? props.panel.query.service : ''
)
const traceLimit = ref(
  typeof props.panel?.query?.limit === 'number' && Number.isFinite(props.panel.query.limit)
    ? Math.max(1, Math.min(200, Math.floor(props.panel.query.limit)))
    : 50
)

const loading = ref(false)
const error = ref<string | null>(null)

const isGaugeType = computed(() => panelType.value === 'gauge')
const isPieType = computed(() => panelType.value === 'pie')
const isStatType = computed(() => panelType.value === 'stat')
const isTracePanelType = computed(
  () => panelType.value === 'trace_list' || panelType.value === 'trace_heatmap'
)
const selectedDatasource = computed(() => {
  return datasources.value.find((datasource) => datasource.id === selectedDatasourceId.value) || null
})
const isClickHouseDatasource = computed(() => selectedDatasource.value?.type === 'clickhouse')
const isCloudWatchDatasource = computed(() => selectedDatasource.value?.type === 'cloudwatch')
const isElasticsearchDatasource = computed(() => selectedDatasource.value?.type === 'elasticsearch')
const isSignalDatasource = computed(() => isClickHouseDatasource.value || isCloudWatchDatasource.value || isElasticsearchDatasource.value)
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
      if (!availableDatasources.value.some((datasource) => datasource.id === selectedDatasourceId.value)) {
        selectedDatasourceId.value = availableDatasources.value[0]?.id || ''
      }
      return
    }

    if (selectedDatasourceId.value && !datasources.value.some((datasource) => datasource.id === selectedDatasourceId.value)) {
      selectedDatasourceId.value = ''
    }
  },
  { immediate: true }
)

watch(
  panelType,
  (nextType) => {
    if (!isSignalDatasource.value) {
      return
    }
    querySignal.value = getDefaultQuerySignal(nextType)
  },
)

watch(selectedDatasource, (nextDatasource, prevDatasource) => {
  const switchedToSignalDatasource =
    (nextDatasource?.type === 'clickhouse' || nextDatasource?.type === 'cloudwatch' || nextDatasource?.type === 'elasticsearch') &&
    prevDatasource?.type !== nextDatasource?.type

  if (switchedToSignalDatasource) {
    querySignal.value = getDefaultQuerySignal(panelType.value)
  }
})

function addThreshold() {
  const lastValue = gaugeThresholds.value.length > 0
    ? gaugeThresholds.value[gaugeThresholds.value.length - 1]!.value + 10
    : 50
  gaugeThresholds.value.push({ value: lastValue, color: '#feca57' })
}

function removeThreshold(index: number) {
  gaugeThresholds.value.splice(index, 1)
}

function addStatThreshold() {
  const lastValue = statThresholds.value.length > 0
    ? statThresholds.value[statThresholds.value.length - 1]!.value + 10
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
    if ((isCloudWatchDatasource.value || isElasticsearchDatasource.value) && querySignal.value === 'traces') {
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
        query: finalQuery
      })
    } else {
      await createPanel(props.dashboardId, {
        title: title.value.trim(),
        type: panelType.value,
        grid_pos: { x: 0, y: 0, w: 6, h: 4 },
        query: finalQuery
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
  <div class="fixed inset-0 flex items-center justify-center z-[1000] animate-[fadeIn_0.2s_ease-out]" style="background: rgba(3, 10, 18, 0.76); backdrop-filter: blur(8px)" @click.self="emit('close')">
    <div class="modal">
      <header class="modal-header">
        <h2>{{ isEditing ? 'Edit Panel' : 'Add Panel' }}</h2>
        <button class="btn-close" @click="emit('close')">
          <X :size="20" />
        </button>
      </header>

      <form @submit.prevent="handleSubmit">
        <div class="form-row">
          <div class="form-group">
            <label for="title">Title <span class="required">*</span></label>
            <input
              id="title"
              v-model="title"
              type="text"
              placeholder="Panel title"
              :disabled="loading"
              autocomplete="off"
            />
          </div>

          <div class="form-group form-group-small">
            <label for="type">Panel Type</label>
            <select id="type" v-model="panelType" :disabled="loading">
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

        <div v-if="datasources.length > 0" class="form-group">
          <label for="datasource">Data Source</label>
          <select id="datasource" v-model="selectedDatasourceId" :disabled="loading">
            <option v-if="!isTracePanelType" value="">Default (Prometheus)</option>
            <option v-else value="">Select tracing datasource</option>
            <option v-for="ds in availableDatasources" :key="ds.id" :value="ds.id">
              {{ ds.name }} ({{ ds.type }})
            </option>
          </select>
        </div>

        <div class="form-group query-builder-group">
          <label>
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

        <div v-if="isTracePanelType" class="trace-config">
          <div class="config-header">
            <h4>Trace Panel Options</h4>
          </div>

          <div class="form-row form-row-2">
            <div class="form-group">
              <label for="trace-service-filter">Service Filter (optional)</label>
              <input
                id="trace-service-filter"
                v-model="traceService"
                type="text"
                placeholder="api-service"
                :disabled="loading"
              />
            </div>
            <div class="form-group">
              <label for="trace-limit">Max traces</label>
              <input
                id="trace-limit"
                v-model.number="traceLimit"
                type="number"
                min="1"
                max="200"
                :disabled="loading"
              />
            </div>
          </div>
        </div>

        <!-- Gauge Configuration -->
        <div v-if="isGaugeType" class="gauge-config">
          <div class="config-header">
            <h4>Gauge Options</h4>
          </div>

          <div class="form-row form-row-4">
            <div class="form-group">
              <label for="gauge-min">Min</label>
              <input
                id="gauge-min"
                v-model.number="gaugeMin"
                type="number"
                :disabled="loading"
              />
            </div>
            <div class="form-group">
              <label for="gauge-max">Max</label>
              <input
                id="gauge-max"
                v-model.number="gaugeMax"
                type="number"
                :disabled="loading"
              />
            </div>
            <div class="form-group">
              <label for="gauge-unit">Unit</label>
              <input
                id="gauge-unit"
                v-model="gaugeUnit"
                type="text"
                placeholder="%"
                :disabled="loading"
              />
            </div>
            <div class="form-group">
              <label for="gauge-decimals">Decimals</label>
              <input
                id="gauge-decimals"
                v-model.number="gaugeDecimals"
                type="number"
                min="0"
                max="10"
                :disabled="loading"
              />
            </div>
          </div>

          <div class="thresholds-section">
            <div class="thresholds-header">
              <label>Thresholds</label>
              <button type="button" class="btn btn-sm" @click="addThreshold" :disabled="loading">
                <Plus :size="14" />
                Add
              </button>
            </div>
            <div class="thresholds-list">
              <div v-for="(threshold, index) in gaugeThresholds" :key="index" class="threshold-row">
                <input
                  v-model.number="threshold.value"
                  type="number"
                  placeholder="Value"
                  :disabled="loading"
                  class="threshold-value"
                />
                <input
                  v-model="threshold.color"
                  type="color"
                  :disabled="loading"
                  class="threshold-color"
                />
                <button
                  type="button"
                  class="btn-icon btn-icon-danger"
                  @click="removeThreshold(index)"
                  :disabled="loading"
                  title="Remove threshold"
                >
                  <Trash2 :size="14" />
                </button>
              </div>
              <p v-if="gaugeThresholds.length === 0" class="thresholds-empty">
                No thresholds configured. Values below any threshold will show green.
              </p>
            </div>
          </div>
        </div>

        <!-- Pie Chart Configuration -->
        <div v-if="isPieType" class="pie-config">
          <div class="config-header">
            <h4>Pie Chart Options</h4>
          </div>

          <div class="form-row form-row-3">
            <div class="form-group">
              <label for="pie-display">Display Style</label>
              <select id="pie-display" v-model="pieDisplayAs" :disabled="loading">
                <option value="pie">Pie</option>
                <option value="donut">Donut</option>
              </select>
            </div>
            <div class="form-group">
              <label for="pie-legend">Show Legend</label>
              <div class="checkbox-wrapper">
                <input
                  id="pie-legend"
                  v-model="pieShowLegend"
                  type="checkbox"
                  :disabled="loading"
                />
                <label for="pie-legend">Display legend</label>
              </div>
            </div>
            <div class="form-group">
              <label for="pie-labels">Show Labels</label>
              <div class="checkbox-wrapper">
                <input
                  id="pie-labels"
                  v-model="pieShowLabels"
                  type="checkbox"
                  :disabled="loading"
                />
                <label for="pie-labels">Display value labels</label>
              </div>
            </div>
          </div>
        </div>

        <!-- Stat Panel Configuration -->
        <div v-if="isStatType" class="stat-config">
          <div class="config-header">
            <h4>Stat Panel Options</h4>
          </div>

          <div class="form-row form-row-2">
            <div class="form-group">
              <label for="stat-unit">Unit</label>
              <input
                id="stat-unit"
                v-model="statUnit"
                type="text"
                placeholder="%"
                :disabled="loading"
              />
            </div>
            <div class="form-group">
              <label for="stat-decimals">Decimals</label>
              <input
                id="stat-decimals"
                v-model.number="statDecimals"
                type="number"
                min="0"
                max="10"
                :disabled="loading"
              />
            </div>
          </div>

          <div class="form-row form-row-2">
            <div class="form-group">
              <label>
                <input
                  type="checkbox"
                  v-model="statShowTrend"
                  :disabled="loading"
                />
                Show Trend Indicator
              </label>
            </div>
            <div class="form-group">
              <label>
                <input
                  type="checkbox"
                  v-model="statShowSparkline"
                  :disabled="loading"
                />
                Show Sparkline
              </label>
            </div>
          </div>

          <div class="thresholds-section">
            <div class="thresholds-header">
              <label>Thresholds (Optional)</label>
              <button type="button" class="btn btn-sm" @click="addStatThreshold" :disabled="loading">
                <Plus :size="14" />
                Add
              </button>
            </div>
            <div class="thresholds-list">
              <div v-for="(threshold, index) in statThresholds" :key="index" class="threshold-row">
                <input
                  v-model.number="threshold.value"
                  type="number"
                  placeholder="Value"
                  :disabled="loading"
                  class="threshold-value"
                />
                <input
                  v-model="threshold.color"
                  type="color"
                  :disabled="loading"
                  class="threshold-color"
                />
                <button
                  type="button"
                  class="btn-icon btn-icon-danger"
                  @click="removeStatThreshold(index)"
                  :disabled="loading"
                  title="Remove threshold"
                >
                  <Trash2 :size="14" />
                </button>
              </div>
              <p v-if="statThresholds.length === 0" class="thresholds-empty">
                No thresholds configured.
              </p>
            </div>
          </div>
        </div>

        <div v-if="error" class="error-message">{{ error }}</div>

        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" @click="emit('close')" :disabled="loading">
            Cancel
          </button>
          <button type="submit" class="btn btn-primary" :disabled="loading">
            {{ loading ? 'Saving...' : (isEditing ? 'Save Changes' : 'Add Panel') }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal {
  background: var(--color-bg-1);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  width: 100%;
  max-width: 640px;
  max-height: 90vh;
  overflow-y: auto;
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  background: var(--color-bg-1);
  z-index: 1;
}

.modal-header h2 {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text-0);
}

.btn-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--color-text-1);
  cursor: pointer;
  transition: all 0.2s;
}

.btn-close:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-0);
}

form {
  padding: 1.5rem;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 1rem;
}

.form-group {
  margin-bottom: 1.25rem;
}

.form-group-small {
  min-width: 160px;
}

.query-builder-group {
  border-top: 1px solid var(--color-border);
  padding-top: 1.25rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-0);
}

.required {
  color: var(--color-danger);
}

.form-group input,
.form-group textarea,
.form-group select {
  width: 100%;
  padding: 0.75rem 1rem;
  background: var(--color-bg-2);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 0.875rem;
  color: var(--color-text-0);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.form-group input::placeholder,
.form-group textarea::placeholder {
  color: var(--color-text-2);
}

.form-group input:focus,
.form-group textarea:focus,
.form-group select:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: var(--focus-ring);
}

.form-group input:disabled,
.form-group textarea:disabled,
.form-group select:disabled {
  background: var(--color-bg-0);
  color: var(--color-text-2);
  cursor: not-allowed;
}

.form-group select {
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a0a0a0' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.75rem center;
  padding-right: 2.5rem;
}

.error-message {
  padding: 0.75rem 1rem;
  background: rgba(255, 107, 107, 0.1);
  border: 1px solid rgba(255, 107, 107, 0.3);
  border-radius: 6px;
  color: var(--color-danger);
  font-size: 0.875rem;
  margin-bottom: 1.25rem;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
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
  background: transparent;
  border-color: #F59E0B;
  color: #FCD34D;
}

.btn-secondary:hover:not(:disabled) {
  background: var(--color-bg-hover);
  border-color: var(--color-border-strong);
}

.btn-primary {
  background: var(--color-accent);
  color: #1a0f00;
}

.btn-primary:hover:not(:disabled) {
  background: var(--color-accent-hover);
}

/* Gauge configuration styles */
.trace-config,
.gauge-config {
  border-top: 1px solid var(--color-border);
  padding-top: 1.25rem;
  margin-bottom: 1.25rem;
}

.config-header h4 {
  margin: 0 0 1rem 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-0);
}

.form-row-4 {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.75rem;
}

.form-row-4 .form-group {
  margin-bottom: 0.75rem;
}

.thresholds-section {
  margin-top: 1rem;
}

.thresholds-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.thresholds-header label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-0);
}

.btn-sm {
  padding: 0.375rem 0.625rem;
  font-size: 0.75rem;
  gap: 0.25rem;
  background: var(--color-bg-2);
  border: 1px solid var(--color-border);
  color: var(--color-text-0);
}

.btn-sm:hover:not(:disabled) {
  background: var(--color-bg-hover);
}

.thresholds-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.threshold-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.threshold-value {
  flex: 1;
  padding: 0.5rem 0.75rem;
  background: var(--color-bg-2);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 0.875rem;
  color: var(--color-text-0);
}

.threshold-value:focus {
  outline: none;
  border-color: var(--color-accent);
}

.threshold-color {
  width: 40px;
  height: 36px;
  padding: 2px;
  background: var(--color-bg-2);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  cursor: pointer;
}

.threshold-color::-webkit-color-swatch-wrapper {
  padding: 2px;
}

.threshold-color::-webkit-color-swatch {
  border: none;
  border-radius: 4px;
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
  color: var(--color-text-1);
  cursor: pointer;
  transition: all 0.2s;
}

.btn-icon:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-0);
}

.btn-icon-danger:hover {
  background: rgba(255, 107, 107, 0.15);
  color: var(--color-danger);
}

.thresholds-empty {
  font-size: 0.75rem;
  color: var(--color-text-2);
  margin: 0;
  padding: 0.5rem;
  text-align: center;
}
</style>
