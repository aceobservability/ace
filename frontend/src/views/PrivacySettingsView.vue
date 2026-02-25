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

function goBack() { router.back() }

function updateConsent(nextConsent: AnalyticsConsent) {
  setAnalyticsConsent(nextConsent)
  trackEvent('analytics_consent_updated', { consent: nextConsent, source: 'privacy_settings' })
}

function toggleSessionRecording(event: Event) {
  const target = event.target as HTMLInputElement
  setSessionRecordingEnabled(target.checked)
  trackEvent('analytics_session_recording_updated', { enabled: target.checked, source: 'privacy_settings' })
}
</script>

<template>
  <div class="py-[1.35rem] px-6 max-w-[900px] mx-auto flex flex-col gap-4">
    <header class="flex items-center gap-[0.85rem] p-4 border border-border rounded-[14px] bg-surface-1 shadow-sm">
      <button class="inline-flex items-center justify-center w-[38px] h-[38px] rounded-[10px] border border-border bg-surface-2 text-text-1 cursor-pointer" @click="goBack">
        <ArrowLeft :size="20" />
      </button>
      <div>
        <h1 class="font-mono text-[1.05rem] uppercase tracking-[0.04em]">Privacy Settings</h1>
        <p class="mt-1 text-text-1 text-[0.84rem]">Control product analytics, feature flags, and session recording preferences.</p>
      </div>
    </header>

    <section class="border border-border rounded-[14px] bg-surface-1 shadow-sm p-[1.2rem]">
      <div class="flex items-start justify-between gap-4 max-md:flex-col">
        <div>
          <h2 class="text-[0.95rem]">Product analytics</h2>
          <p class="mt-[0.35rem] text-text-1 text-[0.82rem]">Anonymous usage events for page visits, dashboard actions, and settings interactions.</p>
        </div>
        <div class="inline-flex gap-[0.55rem]">
          <button class="rounded-[9px] border border-accent bg-transparent text-text-accent py-2 px-3 text-[0.8rem] cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed" :disabled="dntEnabled" @click="updateConsent('denied')">Disable</button>
          <button class="rounded-[9px] border border-[rgba(245,158,11,0.4)] bg-accent text-[#1a0f00] py-2 px-3 text-[0.8rem] cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed" :disabled="dntEnabled" @click="updateConsent('granted')">Enable</button>
        </div>
      </div>
      <p class="mt-[0.9rem] text-text-1" :class="{ 'text-success!': analyticsEnabled }">
        Status:
        <strong>{{ dntEnabled ? 'Disabled by browser Do Not Track' : analyticsEnabled ? 'Enabled' : 'Disabled' }}</strong>
      </p>
      <p v-if="consent === 'pending' && !dntEnabled" class="mt-[0.45rem] text-text-1 text-[0.82rem]">
        You have not chosen yet. Analytics stays disabled until you opt in.
      </p>
    </section>

    <section class="border border-border rounded-[14px] bg-surface-1 shadow-sm p-[1.2rem]">
      <div class="flex items-start justify-between gap-4 max-md:flex-col">
        <div>
          <h2 class="text-[0.95rem]">Session recording</h2>
          <p class="mt-[0.35rem] text-text-1 text-[0.82rem]">Optional replay sessions to debug UI flows. Requires analytics to be enabled.</p>
        </div>
        <label class="inline-flex items-center gap-2 text-text-0 text-[0.82rem]">
          <input type="checkbox" :checked="sessionRecordingEnabled" :disabled="!analyticsEnabled" @change="toggleSessionRecording" />
          <span>Enable session recording</span>
        </label>
      </div>
    </section>
  </div>
</template>
