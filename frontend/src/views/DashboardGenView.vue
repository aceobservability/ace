<script setup lang="ts">
import { AlertCircle, ArrowRight, Check, Loader2, RotateCcw, Sparkles, Wrench } from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import DashboardSpecPreview from '../components/DashboardSpecPreview.vue'
import ShimmerLoader from '../components/ShimmerLoader.vue'
import { useAIProvider } from '../composables/useAIProvider'
import { useCommandContext } from '../composables/useCommandContext'
import { getToolsForDatasourceType } from '../composables/useCopilotTools'
import { useDashboardGeneration } from '../composables/useDashboardGeneration'
import { useOrganization } from '../composables/useOrganization'
import { listDataSources } from '../api/datasources'
import type { DataSource } from '../types/datasource'
import type { DashboardSpec } from '../utils/dashboardSpec'

const router = useRouter()
const { registerContext, deregisterContext } = useCommandContext()
const { currentOrg } = useOrganization()
const { fetchProviders, fetchModels, providers, selectedProviderId } = useAIProvider()

type Step = 'describe' | 'generate' | 'review' | 'create'

const currentStep = ref<Step>('describe')
const prompt = ref('')
const generatedSpec = ref<DashboardSpec | null>(null)

const datasources = ref<DataSource[]>([])
const selectedDatasourceId = ref<string>('')
const loadingDatasources = ref(false)

const selectedDatasource = computed(() =>
  datasources.value.find((d) => d.id === selectedDatasourceId.value),
)

const { generate, toolStatuses, isGenerating, error: genError, progressText, cancel } =
  useDashboardGeneration(
    () => selectedDatasourceId.value,
    () => currentOrg.value?.id ?? '',
    () => selectedDatasource.value?.type ?? '',
  )

const suggestions = [
  'API latency',
  'K8s cluster health',
  'Error rates',
  'Database performance',
  'Memory usage',
  'Request throughput',
]

const canGenerate = computed(() =>
  prompt.value.trim() &&
  selectedDatasourceId.value &&
  providers.value.length > 0 &&
  !isGenerating.value,
)

function selectSuggestion(text: string) {
  prompt.value = text
}

function toolStatusLabel(name: string): string {
  switch (name) {
    case 'get_metrics': return 'Discovering metrics'
    case 'get_labels': return 'Fetching labels'
    case 'get_label_values': return 'Fetching label values'
    case 'list_datasources': return 'Listing datasources'
    case 'get_trace_services': return 'Discovering services'
    default: return name
  }
}

async function startGeneration() {
  if (!prompt.value.trim() || isGenerating.value) return
  currentStep.value = 'generate'
  generatedSpec.value = null

  const ds = selectedDatasource.value
  const dsType = ds?.type ?? ''
  const dsName = ds?.name ?? ''

  // Persist selection
  if (currentOrg.value?.id) {
    localStorage.setItem(`ace:lastDatasource:${currentOrg.value.id}`, selectedDatasourceId.value)
  }

  const messages = [
    { role: 'system' as const, content: `Generate a monitoring dashboard. Datasource: '${dsName}' (${dsType}, id: ${selectedDatasourceId.value}). Discover metrics first, then call generate_dashboard.` },
    { role: 'user' as const, content: `Create a dashboard for: ${prompt.value.trim()}` },
  ]

  const tools = getToolsForDatasourceType(dsType)
  const result = await generate(messages, tools, dsName)

  if (result.spec) {
    generatedSpec.value = result.spec
    currentStep.value = 'review'
  }
}

function handleSpecSaved(dashboardId: string) {
  currentStep.value = 'create'
  setTimeout(() => {
    router.push(`/app/dashboards/${dashboardId}`)
  }, 1500)
}

function tryAgain() {
  cancel()
  currentStep.value = 'describe'
  generatedSpec.value = null
}

onMounted(async () => {
  registerContext({
    viewName: 'Dashboard Generation',
    viewRoute: '/app/dashboards/new/ai',
    description: 'AI dashboard generation wizard',
  })

  const orgId = currentOrg.value?.id
  if (!orgId) return

  // Fetch datasources and AI providers in parallel
  loadingDatasources.value = true
  const [dsList] = await Promise.all([
    listDataSources(orgId).catch(() => [] as DataSource[]),
    fetchProviders(),
    fetchModels(selectedProviderId.value || undefined),
  ])
  datasources.value = dsList
  loadingDatasources.value = false

  // Auto-select datasource
  if (dsList.length === 1) {
    selectedDatasourceId.value = dsList[0]!.id
  } else if (dsList.length > 1) {
    const saved = localStorage.getItem(`ace:lastDatasource:${orgId}`)
    if (saved && dsList.find((d) => d.id === saved)) {
      selectedDatasourceId.value = saved
    } else {
      const metricsDs = dsList.find((d) =>
        ['victoriametrics', 'prometheus'].includes(d.type),
      )
      selectedDatasourceId.value = metricsDs?.id ?? dsList[0]!.id
    }
  }
})

onUnmounted(() => {
  cancel()
  deregisterContext()
})
</script>

<template>
  <div class="mx-auto max-w-2xl px-6 py-12">
    <!-- Step 1: Describe -->
    <Transition name="step-fade" mode="out-in">
      <div v-if="currentStep === 'describe'" key="describe" class="flex flex-col items-center text-center">
        <div
          class="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl"
          :style="{
            background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
          }"
        >
          <Sparkles :size="32" class="text-white" />
        </div>

        <h1
          class="font-display text-2xl font-bold mb-3"
          :style="{ color: 'var(--color-on-surface)' }"
        >
          What do you want to monitor?
        </h1>
        <p
          class="text-sm mb-8 max-w-md"
          :style="{ color: 'var(--color-on-surface-variant)' }"
        >
          {{ selectedDatasource
            ? `Describe what you'd like to observe on ${selectedDatasource.name}`
            : "Describe what you'd like to observe and we'll generate a dashboard with relevant panels and queries." }}
        </p>

        <!-- Datasource picker -->
        <div v-if="loadingDatasources" class="w-full mb-4">
          <ShimmerLoader height="36px" />
        </div>
        <div v-else-if="datasources.length === 0" class="w-full mb-4">
          <div
            class="rounded-lg px-4 py-3 text-sm"
            :style="{
              backgroundColor: 'var(--color-surface-container-high)',
              color: 'var(--color-on-surface-variant)',
              border: '1px solid var(--color-outline-variant)',
            }"
          >
            No datasources configured.
            <router-link
              to="/app/settings"
              class="underline"
              :style="{ color: 'var(--color-primary)' }"
            >
              Add one in Settings
            </router-link>
          </div>
        </div>
        <select
          v-else-if="datasources.length > 1"
          v-model="selectedDatasourceId"
          data-testid="gen-datasource-select"
          aria-label="Select datasource"
          class="w-full rounded-lg px-4 text-sm focus:outline-none focus:ring-2 mb-4"
          :style="{
            height: '36px',
            backgroundColor: 'var(--color-surface-container-low)',
            color: 'var(--color-on-surface)',
            border: '1px solid var(--color-outline-variant)',
          }"
        >
          <option v-for="ds in datasources" :key="ds.id" :value="ds.id">
            {{ ds.name }} ({{ ds.type }})
          </option>
        </select>

        <!-- No AI provider warning -->
        <div
          v-if="!loadingDatasources && providers.length === 0"
          class="w-full rounded-lg px-4 py-3 text-sm mb-4"
          data-testid="gen-no-provider-warning"
          :style="{
            backgroundColor: 'var(--color-surface-container-high)',
            color: 'var(--color-on-surface-variant)',
            border: '1px solid var(--color-outline-variant)',
          }"
        >
          No AI provider configured.
          <router-link
            to="/app/settings"
            class="underline"
            :style="{ color: 'var(--color-primary)' }"
          >
            Set one up in Settings
          </router-link>
        </div>

        <input
          data-testid="gen-describe-input"
          v-model="prompt"
          type="text"
          placeholder="e.g., Monitor HTTP API performance and error rates..."
          class="w-full rounded-lg px-4 text-sm focus:outline-none focus:ring-2 mb-4"
          :style="{
            height: '36px',
            backgroundColor: 'var(--color-surface-container-low)',
            color: 'var(--color-on-surface)',
            border: '1px solid var(--color-outline-variant)',
          }"
          @keyup.enter="startGeneration"
        />

        <div class="flex flex-wrap justify-center gap-2 mb-8">
          <button
            v-for="suggestion in suggestions"
            :key="suggestion"
            data-testid="gen-suggestion-chip"
            class="rounded-full px-3 py-1.5 text-xs font-medium cursor-pointer transition hover:opacity-80"
            :style="{
              backgroundColor: 'var(--color-surface-container-high)',
              color: 'var(--color-on-surface-variant)',
              border: '1px solid var(--color-outline-variant)',
            }"
            @click="selectSuggestion(suggestion)"
          >
            {{ suggestion }}
          </button>
        </div>

        <button
          data-testid="gen-generate-btn"
          class="inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
          :style="{
            background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
          }"
          :disabled="!canGenerate"
          :aria-disabled="!canGenerate"
          @click="startGeneration"
        >
          <Sparkles :size="16" />
          Generate Dashboard
          <ArrowRight :size="16" />
        </button>
      </div>

      <!-- Step 2: Generate (loading) -->
      <div v-else-if="currentStep === 'generate'" key="generate" class="flex flex-col items-center text-center py-16">
        <div
          class="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl animate-pulse"
          :style="{
            background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
          }"
        >
          <Sparkles :size="32" class="text-white" />
        </div>

        <h2
          class="font-display text-xl font-bold mb-4"
          :style="{ color: 'var(--color-on-surface)' }"
        >
          {{ selectedDatasource
            ? `Analyzing ${selectedDatasource.name} and building panels...`
            : 'Generating your dashboard...' }}
        </h2>
        <p
          class="text-sm mb-6"
          :style="{ color: 'var(--color-on-surface-variant)' }"
        >
          "{{ prompt }}"
        </p>

        <!-- Tool status pills -->
        <div
          v-if="toolStatuses.length > 0"
          aria-live="polite"
          role="status"
          class="w-full max-w-sm flex flex-col gap-2 mb-4"
        >
          <div
            v-for="(ts, i) in toolStatuses"
            :key="'tool-' + i"
            class="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
            :style="{
              backgroundColor: 'var(--color-surface-container-high)',
              color: 'var(--color-on-surface-variant)',
            }"
          >
            <Loader2 v-if="ts.status === 'running'" :size="12" class="animate-spin shrink-0" />
            <Check v-else-if="ts.status === 'complete'" :size="12" class="shrink-0" :style="{ color: 'var(--color-secondary)' }" />
            <Wrench v-else :size="12" class="shrink-0" :style="{ color: 'var(--color-error)' }" />
            <span>{{ toolStatusLabel(ts.name) }}</span>
          </div>
        </div>

        <!-- AI intermediate content -->
        <p
          v-if="progressText"
          class="text-sm max-w-sm"
          :style="{ color: 'var(--color-on-surface-variant)' }"
        >
          {{ progressText }}
        </p>

        <!-- Shimmer fallback before first tool status -->
        <div v-if="toolStatuses.length === 0" class="w-full max-w-sm flex flex-col gap-3">
          <ShimmerLoader height="2rem" />
          <ShimmerLoader height="2rem" width="80%" />
          <ShimmerLoader height="2rem" width="60%" />
        </div>

        <!-- Error during generation -->
        <div
          v-if="genError"
          class="mt-6 flex flex-col items-center"
        >
          <AlertCircle :size="32" :style="{ color: 'var(--color-error)' }" />
          <p
            class="text-sm mt-3 mb-4"
            :style="{ color: 'var(--color-error)' }"
          >
            {{ genError }}
          </p>
          <button
            data-testid="gen-try-again-btn"
            class="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium cursor-pointer transition hover:opacity-80"
            :style="{
              color: 'var(--color-on-surface-variant)',
              border: '1px solid var(--color-outline-variant)',
              backgroundColor: 'transparent',
            }"
            @click="tryAgain"
          >
            <RotateCcw :size="14" />
            Try Again
          </button>
        </div>
      </div>

      <!-- Step 3: Review -->
      <div v-else-if="currentStep === 'review'" key="review" class="flex flex-col items-center">
        <h2
          class="font-display text-xl font-bold mb-2 text-center"
          :style="{ color: 'var(--color-on-surface)' }"
        >
          Review your dashboard
        </h2>
        <p
          class="text-sm mb-6 text-center"
          :style="{ color: 'var(--color-on-surface-variant)' }"
        >
          We generated a dashboard based on your description. Review and save it.
        </p>

        <div class="w-full">
          <DashboardSpecPreview
            v-if="generatedSpec"
            :spec="generatedSpec"
            @saved="handleSpecSaved"
          />
        </div>

        <button
          class="mt-4 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium cursor-pointer transition hover:opacity-80"
          :style="{
            color: 'var(--color-on-surface-variant)',
            border: '1px solid var(--color-outline-variant)',
            backgroundColor: 'transparent',
          }"
          @click="tryAgain"
        >
          <RotateCcw :size="14" />
          Start over
        </button>
      </div>

      <!-- Step 4: Create (success) -->
      <div v-else-if="currentStep === 'create'" key="create" class="flex flex-col items-center text-center py-16">
        <div
          class="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl"
          :style="{
            backgroundColor: 'var(--color-secondary)',
          }"
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <h2
          class="font-display text-xl font-bold mb-2"
          :style="{ color: 'var(--color-on-surface)' }"
        >
          Dashboard created!
        </h2>
        <p
          class="text-sm"
          :style="{ color: 'var(--color-on-surface-variant)' }"
        >
          Redirecting you to your new dashboard...
        </p>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.step-fade-enter-active,
.step-fade-leave-active {
  transition: opacity 180ms ease;
}
.step-fade-enter-from,
.step-fade-leave-to {
  opacity: 0;
}
</style>
