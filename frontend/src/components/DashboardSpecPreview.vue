<script setup lang="ts">
import {
  BarChart3,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  ExternalLink,
  Gauge,
  Hash,
  Loader2,
  PieChart,
  Table,
  TrendingUp,
} from 'lucide-vue-next'
import { computed, onMounted, ref, type Component } from 'vue'
import { RouterLink } from 'vue-router'
import { queryDataSource } from '../api/datasources'
import { useDatasource } from '../composables/useDatasource'
import { useOrganization } from '../composables/useOrganization'
import type { DashboardSpec, PanelType } from '../utils/dashboardSpec'
import { saveDashboardSpec, validateDashboardSpec } from '../utils/dashboardSpec'

const props = defineProps<{
  spec: DashboardSpec
}>()

const emit = defineEmits<{
  saved: [dashboardId: string]
}>()

const { currentOrgId } = useOrganization()
const { datasources } = useDatasource()

// --- State ---

const saving = ref(false)
const saveSuccess = ref(false)
const saveError = ref<string | null>(null)
const savedDashboardId = ref<string | null>(null)
const validationErrors = ref<string[]>([])
const specExpanded = ref(false)
const specCopied = ref(false)

// Dry-run status per panel index
type DryRunStatus = 'checking' | 'success' | 'empty' | 'error'
const dryRunResults = ref<Record<number, DryRunStatus>>({})

// --- Computed ---

const panelCount = computed(() => props.spec.panels?.length ?? 0)

const knownDatasourceIds = computed(() => datasources.value.map((d) => d.id))

const DEMO_METRIC_NAMES = [
  'http_requests_total',
  'http_request_duration_seconds',
  'process_cpu_seconds',
  'process_resident_memory_bytes',
  'node_cpu_seconds',
  'node_memory_MemAvailable_bytes',
]

const isDemoSpec = computed(() => {
  if (!props.spec.panels) return false
  return props.spec.panels.some((panel) =>
    DEMO_METRIC_NAMES.some((metric) => panel.query.expr.includes(metric)),
  )
})

const panelTypeIcons: Record<PanelType, Component> = {
  line_chart: TrendingUp,
  bar_chart: BarChart3,
  stat: Hash,
  gauge: Gauge,
  table: Table,
  pie: PieChart,
}

/** Maximum row across all panels — used to size the grid height */
const maxGridRow = computed(() => {
  if (!props.spec.panels || props.spec.panels.length === 0) return 1
  return Math.max(...props.spec.panels.map((p) => (p.grid_pos?.y ?? 0) + (p.grid_pos?.h ?? 1)))
})

const isSaved = computed(() => savedDashboardId.value !== null)

const hasValidationErrors = computed(() => validationErrors.value.length > 0)

// --- Dry-run queries ---

async function runDryRuns() {
  if (!props.spec.panels || props.spec.panels.length === 0) return

  // Initialize all panels as checking
  const initial: Record<number, DryRunStatus> = {}
  props.spec.panels.forEach((_, i) => {
    initial[i] = 'checking'
  })
  dryRunResults.value = initial

  const now = Math.floor(Date.now() / 1000)

  const promises = props.spec.panels.map(async (panel, index) => {
    try {
      const result = await queryDataSource(panel.query.datasource_id, {
        query: panel.query.expr,
        signal: 'metrics',
        start: now - 300,
        end: now,
        step: 15,
      })

      const hasData =
        result.status === 'success' &&
        result.data?.result &&
        result.data.result.length > 0

      dryRunResults.value = {
        ...dryRunResults.value,
        [index]: hasData ? 'success' : 'empty',
      }
    } catch {
      dryRunResults.value = {
        ...dryRunResults.value,
        [index]: 'error',
      }
    }
  })

  await Promise.allSettled(promises)
}

onMounted(() => {
  runDryRuns()
})

// --- Save ---

async function handleSave() {
  // 1. Validate
  const { valid, errors } = validateDashboardSpec(props.spec, knownDatasourceIds.value)
  if (!valid) {
    validationErrors.value = errors
    return
  }
  validationErrors.value = []

  // 2. Save
  saving.value = true
  saveError.value = null
  try {
    const id = await saveDashboardSpec(props.spec, currentOrgId.value!)
    // Show success state in button for 1 second before transitioning to post-save
    saveSuccess.value = true
    setTimeout(() => {
      savedDashboardId.value = id
      emit('saved', id)
    }, 1000)
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : 'Failed to save dashboard'
  } finally {
    saving.value = false
  }
}

// --- Spec viewer ---

async function copySpec() {
  try {
    await navigator.clipboard.writeText(JSON.stringify(props.spec, null, 2))
    specCopied.value = true
    setTimeout(() => {
      specCopied.value = false
    }, 2000)
  } catch {
    // clipboard not available
  }
}

// --- Helpers ---

function dryRunDotClass(status: DryRunStatus): string {
  switch (status) {
    case 'checking':
      return 'bg-text-muted animate-pulse'
    case 'success':
      return 'bg-emerald-500'
    case 'empty':
      return 'bg-amber-500'
    case 'error':
      return 'bg-rose-500'
  }
}
</script>

<template>
  <div
    role="region"
    :aria-label="`Dashboard preview: ${spec.title}, ${panelCount} panels`"
    class="border border-border rounded-lg overflow-hidden"
    :class="{ 'opacity-70': saving }"
  >
    <!-- Header -->
    <div class="px-3 py-2 flex items-center gap-2">
      <span class="text-sm font-semibold text-text-primary truncate">{{ spec.title }}</span>
      <span class="text-xs text-text-muted shrink-0">{{ panelCount }} panel{{ panelCount !== 1 ? 's' : '' }}</span>
    </div>

    <!-- Demo badge -->
    <div v-if="isDemoSpec" class="px-3 pb-2">
      <span class="text-amber-500 bg-amber-500/10 rounded px-2 py-1 text-xs">
        Demo dashboard — connect a real datasource to see your data
      </span>
    </div>

    <!-- Mini-panel grid -->
    <div
      class="px-3 pb-2"
    >
      <div
        role="list"
        class="grid gap-1"
        :style="{
          gridTemplateColumns: 'repeat(12, 1fr)',
          gridTemplateRows: `repeat(${maxGridRow}, 24px)`,
        }"
      >
        <div
          v-for="(panel, index) in spec.panels"
          :key="index"
          role="listitem"
          :aria-label="`${panel.title} (${panel.type})`"
          class="bg-surface-raised rounded border border-border flex items-center gap-1 px-1.5 py-0.5 min-w-0 relative"
          :style="{
            gridColumn: `${(panel.grid_pos?.x ?? 0) + 1} / span ${panel.grid_pos?.w ?? 4}`,
            gridRow: `${(panel.grid_pos?.y ?? 0) + 1} / span ${panel.grid_pos?.h ?? 1}`,
          }"
        >
          <component
            :is="panelTypeIcons[panel.type] || TrendingUp"
            :size="10"
            class="text-text-muted shrink-0"
          />
          <span class="text-[10px] text-text-muted truncate">{{ panel.title }}</span>
          <!-- Dry-run status dot -->
          <span
            v-if="dryRunResults[index]"
            class="w-2 h-2 rounded-full shrink-0 ml-auto"
            :class="dryRunDotClass(dryRunResults[index]!)"
          />
        </div>
      </div>
    </div>

    <!-- Validation errors -->
    <div v-if="hasValidationErrors" class="px-3 pb-2">
      <ul class="text-rose-500 bg-rose-500/10 rounded px-3 py-2 text-xs m-0 list-disc list-inside">
        <li v-for="(err, i) in validationErrors" :key="i">{{ err }}</li>
      </ul>
    </div>

    <!-- Save error -->
    <div v-if="saveError" class="px-3 pb-2" aria-live="polite">
      <span class="text-rose-500 bg-rose-500/10 rounded px-2 py-1 text-xs">
        {{ saveError }}
      </span>
    </div>

    <!-- Actions -->
    <div class="px-3 pb-3 flex items-center gap-3" aria-live="polite">
      <!-- Post-save state -->
      <template v-if="isSaved">
        <span class="inline-flex items-center gap-1 text-emerald-500 text-sm font-semibold">
          <Check :size="14" />
          Dashboard saved
        </span>
        <RouterLink
          :to="`/app/dashboards/${savedDashboardId}`"
          class="inline-flex items-center gap-1 text-xs text-accent no-underline hover:underline"
        >
          <ExternalLink :size="12" />
          Open dashboard
        </RouterLink>
      </template>

      <!-- Save success (intermediate, before post-save) -->
      <template v-else-if="saveSuccess">
        <span class="inline-flex items-center gap-1 text-emerald-500 text-sm font-semibold">
          <Check :size="14" />
          Dashboard saved
        </span>
      </template>

      <!-- Save button -->
      <template v-else>
        <button
          class="inline-flex items-center gap-1.5 bg-accent text-white rounded-sm px-4 py-2 text-sm font-semibold border-none cursor-pointer transition hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="saving || hasValidationErrors"
          data-testid="spec-preview-save-btn"
          @click="handleSave"
        >
          <Loader2 v-if="saving" :size="14" class="animate-spin" />
          {{ saving ? 'Saving...' : 'Save' }}
        </button>
      </template>

      <!-- View spec toggle -->
      <button
        class="text-xs text-text-muted cursor-pointer border-none bg-transparent hover:text-text-primary ml-auto inline-flex items-center gap-0.5"
        :aria-expanded="specExpanded"
        data-testid="spec-preview-toggle-spec"
        @click="specExpanded = !specExpanded"
      >
        View spec
        <ChevronUp v-if="specExpanded" :size="12" />
        <ChevronDown v-else :size="12" />
      </button>
    </div>

    <!-- Collapsible JSON spec -->
    <div v-if="specExpanded" class="border-t border-border px-3 py-2">
      <div class="flex items-center justify-between mb-1">
        <span class="text-xs text-text-muted">Dashboard spec (JSON)</span>
        <button
          class="inline-flex items-center gap-1 text-xs text-text-muted cursor-pointer border-none bg-transparent hover:text-text-primary"
          data-testid="spec-preview-copy-btn"
          @click="copySpec"
        >
          <Check v-if="specCopied" :size="12" class="text-emerald-500" />
          <ClipboardCopy v-else :size="12" />
          {{ specCopied ? 'Copied' : 'Copy' }}
        </button>
      </div>
      <pre class="text-[10px] text-text-secondary bg-surface-overlay rounded p-2 overflow-x-auto m-0 max-h-48 overflow-y-auto">{{ JSON.stringify(spec, null, 2) }}</pre>
    </div>
  </div>
</template>
