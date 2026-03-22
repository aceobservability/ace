<script setup lang="ts">
import { Check, X } from 'lucide-vue-next'
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const STORAGE_KEY = 'ace-onboarding-dismissed'
const router = useRouter()

const isDismissed = ref(localStorage.getItem(STORAGE_KEY) === 'true')

interface OnboardingStep {
  label: string
  route: string
  completed: boolean
}

const steps = ref<OnboardingStep[]>([
  { label: 'Connect a data source', route: '/app/datasources/new', completed: false },
  { label: 'Create your first dashboard', route: '/app/dashboards', completed: false },
  { label: 'Set up alerts', route: '/app/alerts', completed: false },
])

function dismiss() {
  isDismissed.value = true
  localStorage.setItem(STORAGE_KEY, 'true')
}

function navigateToStep(step: OnboardingStep) {
  router.push(step.route)
}
</script>

<template>
  <div
    v-if="!isDismissed"
    data-testid="onboarding-banner"
    class="rounded-xl p-5 relative"
    :style="{
      backgroundColor: 'var(--color-surface-container)',
      border: '1px solid var(--color-outline-variant)',
    }"
  >
    <!-- Dismiss button -->
    <button
      class="absolute top-3 right-3 p-1 rounded-md border-none cursor-pointer transition-opacity"
      :style="{ color: 'var(--color-on-surface-variant)', backgroundColor: 'transparent' }"
      data-testid="onboarding-dismiss"
      @click="dismiss"
    >
      <X :size="16" />
    </button>

    <h3
      class="text-sm font-semibold mb-3 mt-0"
      :style="{ color: 'var(--color-on-surface)', fontFamily: 'var(--font-display)' }"
    >
      Getting Started
    </h3>

    <div class="flex flex-col gap-2">
      <button
        v-for="(step, index) in steps"
        :key="index"
        class="flex items-center gap-3 px-3 py-2 rounded-lg text-left border-none cursor-pointer transition-colors w-full"
        :style="{
          backgroundColor: step.completed
            ? 'var(--color-surface-container-low)'
            : index === steps.findIndex(s => !s.completed)
              ? 'var(--color-surface-container-high)'
              : 'transparent',
          color: step.completed
            ? 'var(--color-on-surface-variant)'
            : 'var(--color-on-surface)',
          borderLeft: index === steps.findIndex(s => !s.completed)
            ? '3px solid var(--color-primary)'
            : step.completed
              ? '3px solid var(--color-secondary)'
              : '3px solid transparent',
        }"
        :data-testid="`onboarding-step-${index}`"
        @click="navigateToStep(step)"
      >
        <div
          v-if="step.completed"
          class="flex items-center justify-center w-5 h-5 rounded-full shrink-0"
          :style="{ backgroundColor: 'var(--color-secondary)', color: 'var(--color-on-secondary)' }"
        >
          <Check :size="12" />
        </div>
        <div
          v-else
          class="flex items-center justify-center w-5 h-5 rounded-full shrink-0 text-xs font-bold"
          :style="{
            border: '2px solid var(--color-outline-variant)',
            color: 'var(--color-on-surface-variant)',
          }"
        >
          {{ index + 1 }}
        </div>
        <span class="text-sm">{{ step.label }}</span>
      </button>
    </div>
  </div>
</template>
