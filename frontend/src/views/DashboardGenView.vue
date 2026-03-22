<script setup lang="ts">
import { AlertCircle, ArrowRight, RotateCcw, Sparkles } from 'lucide-vue-next'
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import DashboardSpecPreview from '../components/DashboardSpecPreview.vue'
import ShimmerLoader from '../components/ShimmerLoader.vue'
import { useCommandContext } from '../composables/useCommandContext'
import type { DashboardSpec } from '../utils/dashboardSpec'

const router = useRouter()
const { registerContext, deregisterContext } = useCommandContext()

type Step = 'describe' | 'generate' | 'review' | 'create'

const currentStep = ref<Step>('describe')
const prompt = ref('')
const generatedSpec = ref<DashboardSpec | null>(null)
const errorMessage = ref<string | null>(null)

const suggestions = [
  'API latency',
  'K8s cluster health',
  'Error rates',
  'Database performance',
  'Memory usage',
  'Request throughput',
]

// Mock spec for the review step
const mockSpec: DashboardSpec = {
  title: 'Generated Dashboard',
  description: 'Auto-generated observability dashboard',
  panels: [
    {
      title: 'Request Rate',
      type: 'line_chart',
      query: {
        datasource_id: 'default',
        expr: 'rate(http_requests_total[5m])',
      },
      grid_pos: { x: 0, y: 0, w: 6, h: 3 },
    },
    {
      title: 'Error Rate',
      type: 'stat',
      query: {
        datasource_id: 'default',
        expr: 'sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) * 100',
      },
      grid_pos: { x: 6, y: 0, w: 3, h: 3 },
    },
    {
      title: 'P99 Latency',
      type: 'gauge',
      query: {
        datasource_id: 'default',
        expr: 'histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))',
      },
      grid_pos: { x: 9, y: 0, w: 3, h: 3 },
    },
    {
      title: 'CPU Usage',
      type: 'line_chart',
      query: {
        datasource_id: 'default',
        expr: 'process_cpu_seconds_total',
      },
      grid_pos: { x: 0, y: 3, w: 6, h: 3 },
    },
    {
      title: 'Memory Usage',
      type: 'bar_chart',
      query: {
        datasource_id: 'default',
        expr: 'process_resident_memory_bytes',
      },
      grid_pos: { x: 6, y: 3, w: 6, h: 3 },
    },
  ],
}

function selectSuggestion(text: string) {
  prompt.value = text
}

function startGeneration() {
  if (!prompt.value.trim()) return

  currentStep.value = 'generate'
  errorMessage.value = null
  generatedSpec.value = null

  // Mock delay simulating AI generation
  setTimeout(() => {
    // Simulate successful generation with the mock spec
    generatedSpec.value = {
      ...mockSpec,
      title: `${prompt.value.trim()} Dashboard`,
      description: `AI-generated dashboard for monitoring ${prompt.value.trim().toLowerCase()}`,
    }
    currentStep.value = 'review'
  }, 2000)
}

function handleSpecSaved(dashboardId: string) {
  currentStep.value = 'create'
  // Success: redirect to the new dashboard after a brief animation
  setTimeout(() => {
    router.push(`/app/dashboards/${dashboardId}`)
  }, 1500)
}

function tryAgain() {
  currentStep.value = 'describe'
  errorMessage.value = null
  generatedSpec.value = null
}

onMounted(() => {
  registerContext({
    viewName: 'Dashboard Generation',
    viewRoute: '/app/dashboards/new/ai',
    description: 'AI dashboard generation wizard',
  })
})

onUnmounted(() => {
  deregisterContext()
})
</script>

<template>
  <div class="mx-auto max-w-2xl px-6 py-12">
    <!-- Step 1: Describe -->
    <div v-if="currentStep === 'describe'" class="flex flex-col items-center text-center">
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
        Describe what you'd like to observe and we'll generate a dashboard with relevant panels and queries.
      </p>

      <input
        data-testid="gen-describe-input"
        v-model="prompt"
        type="text"
        placeholder="e.g., Monitor HTTP API performance and error rates..."
        class="w-full rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 mb-4"
        :style="{
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
        class="inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        :style="{
          background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
        }"
        :disabled="!prompt.trim()"
        @click="startGeneration"
      >
        <Sparkles :size="16" />
        Generate Dashboard
        <ArrowRight :size="16" />
      </button>
    </div>

    <!-- Step 2: Generate (loading) -->
    <div v-else-if="currentStep === 'generate'" class="flex flex-col items-center text-center py-16">
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
        Generating your dashboard...
      </h2>
      <p
        class="text-sm mb-6"
        :style="{ color: 'var(--color-on-surface-variant)' }"
      >
        Analyzing "{{ prompt }}" and building panels
      </p>

      <div class="w-full max-w-sm flex flex-col gap-3">
        <ShimmerLoader height="2rem" />
        <ShimmerLoader height="2rem" width="80%" />
        <ShimmerLoader height="2rem" width="60%" />
      </div>
    </div>

    <!-- Step 3: Review -->
    <div v-else-if="currentStep === 'review'" class="flex flex-col items-center">
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
    <div v-else-if="currentStep === 'create'" class="flex flex-col items-center text-center py-16">
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

    <!-- Error state -->
    <div
      v-if="errorMessage"
      class="mt-8 flex flex-col items-center text-center"
    >
      <AlertCircle :size="32" :style="{ color: 'var(--color-error)' }" />
      <p
        class="text-sm mt-3 mb-4"
        :style="{ color: 'var(--color-error)' }"
      >
        {{ errorMessage }}
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
</template>
