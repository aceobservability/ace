<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, CheckCircle2, Database, FileDown, LayoutTemplate, Sparkles } from 'lucide-vue-next'
const router = useRouter()

const emit = defineEmits<{
  dismissed: []
}>()

type WizardStep = 'welcome' | 'connect' | 'import' | 'done'

const currentStep = ref<WizardStep>('welcome')

const steps: { key: WizardStep; label: string }[] = [
  { key: 'welcome', label: 'Welcome' },
  { key: 'connect', label: 'Connect' },
  { key: 'import', label: 'Import' },
  { key: 'done', label: 'Done' },
]

const stepIndex = computed(() => steps.findIndex(s => s.key === currentStep.value))

function goToConnect() {
  currentStep.value = 'connect'
}

function goToDatasourceSettings() {
  router.push('/app/settings/datasources')
}

function goToImport() {
  currentStep.value = 'import'
}

function goToImportModal() {
  router.push({ path: '/app/dashboards', query: { newDashboardMode: 'grafana' } })
}

function goToTemplates() {
  // Navigate to dashboards page — templates will be handled by the template install flow
  currentStep.value = 'done'
}

function finish() {
  localStorage.setItem('ace-setup-wizard-dismissed', 'true')
  emit('dismissed')
  router.push('/app')
}

function skipWizard() {
  localStorage.setItem('ace-setup-wizard-dismissed', 'true')
  emit('dismissed')
  router.push('/app')
}
</script>

<template>
  <div class="flex items-center justify-center min-h-[80vh] px-6">
    <div
      class="w-full max-w-xl rounded-2xl overflow-hidden animate-fade-in"
      :style="{
        backgroundColor: 'var(--color-surface-container-low)',
        border: '1px solid var(--color-outline-variant)',
      }"
    >
      <!-- Progress bar -->
      <div class="flex gap-1 px-6 pt-6">
        <div
          v-for="(step, i) in steps"
          :key="step.key"
          class="h-1 flex-1 rounded-full transition-all duration-300"
          :style="{
            backgroundColor: i <= stepIndex
              ? 'var(--color-primary)'
              : 'var(--color-surface-container-highest)',
          }"
        />
      </div>

      <!-- Step: Welcome -->
      <div v-if="currentStep === 'welcome'" class="px-8 py-10 text-center">
        <div
          class="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl"
          :style="{
            background: 'linear-gradient(135deg, rgba(201,150,15,0.15), rgba(201,150,15,0.05))',
            border: '1px solid rgba(201,150,15,0.2)',
          }"
        >
          <Sparkles :size="28" :style="{ color: 'var(--color-primary)' }" />
        </div>
        <h1
          class="font-display text-2xl font-bold mb-3"
          :style="{ color: 'var(--color-on-surface)', letterSpacing: '-0.02em' }"
        >
          Welcome to Ace
        </h1>
        <p
          class="text-sm mb-8 max-w-sm mx-auto"
          :style="{ color: 'var(--color-on-surface-variant)' }"
        >
          Enterprise-ready observability with free RBAC, SSO, and audit logging.
          Let's connect your first datasource.
        </p>
        <div class="flex flex-col gap-3 max-w-xs mx-auto">
          <button
            class="flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 cursor-pointer"
            :style="{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))' }"
            @click="goToConnect"
          >
            Get Started
            <ArrowRight :size="16" />
          </button>
          <button
            class="text-xs transition cursor-pointer"
            :style="{ color: 'var(--color-on-surface-variant)' }"
            @click="skipWizard"
          >
            Skip setup
          </button>
        </div>
      </div>

      <!-- Step: Connect Datasource -->
      <div v-else-if="currentStep === 'connect'" class="px-8 py-8">
        <h2
          class="font-display text-lg font-semibold mb-2"
          :style="{ color: 'var(--color-on-surface)' }"
        >
          Connect a Datasource
        </h2>
        <p
          class="text-sm mb-6"
          :style="{ color: 'var(--color-on-surface-variant)' }"
        >
          Add your metrics, logs, or traces backend.
        </p>

        <div class="flex flex-col gap-3 mb-6">
          <!-- VictoriaMetrics (highlighted) -->
          <button
            class="flex items-center gap-4 rounded-lg px-4 py-4 text-left transition cursor-pointer"
            :style="{
              backgroundColor: 'rgba(201,150,15,0.08)',
              border: '1px solid rgba(201,150,15,0.2)',
            }"
            @click="goToDatasourceSettings"
          >
            <Database :size="20" :style="{ color: 'var(--color-primary)' }" />
            <div class="flex-1">
              <div class="text-sm font-semibold" :style="{ color: 'var(--color-on-surface)' }">
                VictoriaMetrics
              </div>
              <div class="text-xs mt-0.5" :style="{ color: 'var(--color-on-surface-variant)' }">
                Metrics, logs, and traces — recommended
              </div>
            </div>
            <span
              class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
              :style="{
                backgroundColor: 'rgba(201,150,15,0.15)',
                color: 'var(--color-primary)',
              }"
            >
              Recommended
            </span>
          </button>

          <!-- Prometheus -->
          <button
            class="flex items-center gap-4 rounded-lg px-4 py-3 text-left transition cursor-pointer"
            :style="{
              backgroundColor: 'var(--color-surface-container)',
              border: '1px solid var(--color-outline-variant)',
            }"
            @click="goToDatasourceSettings"
          >
            <Database :size="18" :style="{ color: 'var(--color-on-surface-variant)' }" />
            <div class="flex-1">
              <div class="text-sm font-medium" :style="{ color: 'var(--color-on-surface)' }">Prometheus</div>
            </div>
          </button>

          <!-- Other -->
          <button
            class="flex items-center gap-4 rounded-lg px-4 py-3 text-left transition cursor-pointer"
            :style="{
              backgroundColor: 'var(--color-surface-container)',
              border: '1px solid var(--color-outline-variant)',
            }"
            @click="goToDatasourceSettings"
          >
            <Database :size="18" :style="{ color: 'var(--color-on-surface-variant)' }" />
            <div class="flex-1">
              <div class="text-sm font-medium" :style="{ color: 'var(--color-on-surface)' }">Other (Loki, Tempo, ClickHouse...)</div>
            </div>
          </button>
        </div>

        <div class="flex justify-between">
          <button
            class="text-sm cursor-pointer"
            :style="{ color: 'var(--color-on-surface-variant)' }"
            @click="currentStep = 'welcome'"
          >
            Back
          </button>
          <button
            class="text-sm font-medium cursor-pointer"
            :style="{ color: 'var(--color-primary)' }"
            @click="goToImport"
          >
            I already have datasources configured
          </button>
        </div>
      </div>

      <!-- Step: Import -->
      <div v-else-if="currentStep === 'import'" class="px-8 py-8">
        <h2
          class="font-display text-lg font-semibold mb-2"
          :style="{ color: 'var(--color-on-surface)' }"
        >
          Import Dashboards
        </h2>
        <p
          class="text-sm mb-6"
          :style="{ color: 'var(--color-on-surface-variant)' }"
        >
          Migrate existing dashboards or start with pre-built templates.
        </p>

        <div class="flex flex-col gap-3 mb-6">
          <button
            class="flex items-center gap-4 rounded-lg px-4 py-4 text-left transition cursor-pointer"
            :style="{
              backgroundColor: 'var(--color-surface-container)',
              border: '1px solid var(--color-outline-variant)',
            }"
            @click="goToImportModal"
          >
            <FileDown :size="20" :style="{ color: 'var(--color-primary)' }" />
            <div class="flex-1">
              <div class="text-sm font-semibold" :style="{ color: 'var(--color-on-surface)' }">
                Import from Grafana
              </div>
              <div class="text-xs mt-0.5" :style="{ color: 'var(--color-on-surface-variant)' }">
                Upload JSON or connect to a Grafana instance
              </div>
            </div>
          </button>

          <button
            class="flex items-center gap-4 rounded-lg px-4 py-4 text-left transition cursor-pointer"
            :style="{
              backgroundColor: 'var(--color-surface-container)',
              border: '1px solid var(--color-outline-variant)',
            }"
            @click="goToTemplates"
          >
            <LayoutTemplate :size="20" :style="{ color: 'var(--color-secondary)' }" />
            <div class="flex-1">
              <div class="text-sm font-semibold" :style="{ color: 'var(--color-on-surface)' }">
                Install Templates
              </div>
              <div class="text-xs mt-0.5" :style="{ color: 'var(--color-on-surface-variant)' }">
                Pre-built dashboards for VictoriaMetrics, Node Exporter, Go Runtime
              </div>
            </div>
          </button>
        </div>

        <div class="flex justify-between">
          <button
            class="text-sm cursor-pointer"
            :style="{ color: 'var(--color-on-surface-variant)' }"
            @click="currentStep = 'connect'"
          >
            Back
          </button>
          <button
            class="text-sm font-medium cursor-pointer"
            :style="{ color: 'var(--color-primary)' }"
            @click="currentStep = 'done'"
          >
            Skip
          </button>
        </div>
      </div>

      <!-- Step: Done -->
      <div v-else class="px-8 py-10 text-center">
        <div
          class="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full"
          :style="{ backgroundColor: 'rgba(79,175,120,0.12)' }"
        >
          <CheckCircle2 :size="32" :style="{ color: 'var(--color-secondary)' }" />
        </div>
        <h2
          class="font-display text-xl font-bold mb-2"
          :style="{ color: 'var(--color-on-surface)' }"
        >
          You're all set!
        </h2>
        <p
          class="text-sm mb-8"
          :style="{ color: 'var(--color-on-surface-variant)' }"
        >
          Ace is ready. Explore your dashboards, run queries, and manage your observability stack.
        </p>
        <button
          class="rounded-lg px-8 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 cursor-pointer"
          :style="{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))' }"
          @click="finish"
        >
          Go to Ace
        </button>
      </div>
    </div>
  </div>
</template>
