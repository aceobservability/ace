<script setup lang="ts">
import { computed } from 'vue'
import { ArrowLeft } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { useAnalytics, type AnalyticsConsent } from '../composables/useAnalytics'

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
    <h1 class="text-2xl font-bold text-slate-900 mb-6">Privacy Settings</h1>

    <div class="rounded-xl border border-slate-200 bg-white p-6">
      <!-- Product analytics toggle row -->
      <div class="flex items-center justify-between py-4 border-b border-slate-100">
        <div class="flex flex-col">
          <span class="text-sm font-medium text-slate-900">Product analytics</span>
          <span class="text-xs text-slate-500 mt-1">Anonymous usage events for page visits, dashboard actions, and settings interactions.</span>
        </div>
        <button
          class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition"
          :class="analyticsEnabled ? 'bg-emerald-600' : 'bg-slate-200'"
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
          <span class="text-sm font-medium text-slate-900">Session recording</span>
          <span class="text-xs text-slate-500 mt-1">Optional replay sessions to debug UI flows. Requires analytics to be enabled.</span>
        </div>
        <button
          class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition"
          :class="sessionRecordingEnabled && analyticsEnabled ? 'bg-emerald-600' : 'bg-slate-200'"
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
        class="mt-4 rounded-lg px-4 py-3 text-sm"
        :class="analyticsEnabled
          ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
          : 'bg-slate-50 border border-slate-200 text-slate-600'"
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
        class="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
        @click="goBack"
      >
        Done
      </button>
    </div>
  </div>
</template>
