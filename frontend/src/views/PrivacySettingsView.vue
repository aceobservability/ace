<script setup lang="ts">
import { ArrowLeft } from 'lucide-vue-next'
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { type AnalyticsConsent, useAnalytics } from '../composables/useAnalytics'

const router = useRouter()
const {
  consent,
  dntEnabled,
  sessionRecordingEnabled,
  setAnalyticsConsent,
  setSessionRecordingEnabled,
  trackEvent,
} = useAnalytics()

const analyticsEnabled = computed(() => consent.value === 'granted' && !dntEnabled.value)

function goBack() {
  router.back()
}

function updateConsent(nextConsent: AnalyticsConsent) {
  setAnalyticsConsent(nextConsent)
  trackEvent('analytics_consent_updated', {
    consent: nextConsent,
    source: 'privacy_settings',
  })
}

function toggleSessionRecording(event: Event) {
  const target = event.target as HTMLInputElement
  setSessionRecordingEnabled(target.checked)
  trackEvent('analytics_session_recording_updated', {
    enabled: target.checked,
    source: 'privacy_settings',
  })
}
</script>

<template>
  <div class="px-8 py-6 max-w-2xl mx-auto flex flex-col gap-4">
    <h1 class="text-2xl font-bold text-text-primary mb-6">Privacy Settings</h1>

    <div class="rounded border border-border bg-surface-raised p-6">
      <!-- Product analytics toggle row -->
      <div class="flex items-center justify-between py-4 border-b border-border">
        <div class="flex flex-col">
          <span class="text-sm font-medium text-text-primary">Product analytics</span>
          <span class="text-xs text-text-secondary mt-1">Anonymous usage events for page visits, dashboard actions, and settings interactions.</span>
        </div>
        <button
          data-testid="analytics-consent-switch"
          class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition"
          :class="analyticsEnabled ? 'bg-accent' : 'bg-surface-overlay'"
          :disabled="dntEnabled"
          role="switch"
          :aria-checked="analyticsEnabled"
          @click="updateConsent(analyticsEnabled ? 'denied' : 'granted')"
        >
          <span
            class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition"
            :class="analyticsEnabled ? 'translate-x-5' : 'translate-x-0'"
          />
        </button>
      </div>

      <!-- Session recording toggle row -->
      <div class="flex items-center justify-between py-4">
        <div class="flex flex-col">
          <span class="text-sm font-medium text-text-primary">Session recording</span>
          <span class="text-xs text-text-secondary mt-1">Optional replay sessions to debug UI flows. Requires analytics to be enabled.</span>
        </div>
        <button
          data-testid="session-recording-switch"
          class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition"
          :class="sessionRecordingEnabled && analyticsEnabled ? 'bg-accent' : 'bg-surface-overlay'"
          :disabled="!analyticsEnabled"
          role="switch"
          :aria-checked="sessionRecordingEnabled && analyticsEnabled"
          @click="toggleSessionRecording({ target: { checked: !(sessionRecordingEnabled && analyticsEnabled) } } as any)"
        >
          <span
            class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition"
            :class="sessionRecordingEnabled && analyticsEnabled ? 'translate-x-5' : 'translate-x-0'"
          />
        </button>
      </div>

      <!-- Status message -->
      <div
        v-if="dntEnabled || analyticsEnabled || consent === 'pending'"
        class="mt-4 rounded-sm px-4 py-3 text-sm"
        :class="analyticsEnabled
          ? 'bg-accent-muted border border-accent-border text-accent'
          : 'bg-surface-overlay border border-border text-text-secondary'"
      >
        <template v-if="dntEnabled">
          Analytics disabled by browser Do Not Track setting.
        </template>
        <template v-else-if="analyticsEnabled">
          Analytics is <strong>enabled</strong>.
        </template>
        <template v-else-if="consent === 'pending'">
          You have not chosen yet. Analytics stays disabled until you opt in.
        </template>
        <template v-else>
          Analytics is <strong>disabled</strong>.
        </template>
      </div>
    </div>

    <!-- Save / back button -->
    <div class="flex items-center gap-3 mt-2">
      <button
        data-testid="privacy-done-btn"
        class="rounded-sm bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover"
        @click="goBack"
      >
        Done
      </button>
    </div>
  </div>
</template>
