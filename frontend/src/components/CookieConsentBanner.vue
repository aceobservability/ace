<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAnalytics } from '../composables/useAnalytics'

const router = useRouter()
const { consent, dntEnabled, setAnalyticsConsent, trackEvent } = useAnalytics()

const visible = computed(() => consent.value === 'pending' && !dntEnabled.value)

function acceptAnalytics() {
  setAnalyticsConsent('granted')
  trackEvent('analytics_consent_updated', {
    consent: 'granted',
    source: 'cookie_banner',
  })
}

function declineAnalytics() {
  setAnalyticsConsent('denied')
}

function openPrivacySettings() {
  router.push('/settings/privacy')
}
</script>

<template>
  <div
    v-if="visible"
    class="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-slate-200 bg-white px-6 py-4 shadow-lg flex items-center gap-4 max-w-lg max-md:flex-col max-md:items-stretch"
    data-testid="cookie-consent-banner"
  >
    <div class="min-w-0">
      <strong class="block text-sm text-slate-900">Analytics preferences</strong>
      <p class="mt-1 text-sm text-slate-600">
        Ace can use privacy-focused analytics and optional session recording to improve product quality.
      </p>
    </div>
    <div class="inline-flex items-center gap-2 flex-wrap justify-end max-md:justify-start">
      <button
        class="text-emerald-600 hover:text-emerald-700 underline text-sm px-4 py-2 rounded-lg transition"
        @click="openPrivacySettings"
      >
        Privacy settings
      </button>
      <button
        class="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 transition"
        @click="declineAnalytics"
      >
        Decline
      </button>
      <button
        class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
        @click="acceptAnalytics"
      >
        Allow analytics
      </button>
    </div>
  </div>
</template>
