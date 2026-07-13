import { computed } from 'vue'
import {
  getAnalyticsConsent,
  getAnalyticsDntEnabled,
  getAnalyticsReady,
  getAnalyticsSessionRecordingEnabled,
  identifyUser,
  resetUserAnalytics,
  setAnalyticsConsent,
  setSessionRecordingEnabled,
  trackEvent,
} from '../analytics'

export function useAnalytics() {
  const ready = computed(() => getAnalyticsReady())
  const consent = computed(() => getAnalyticsConsent())
  const dntEnabled = computed(() => getAnalyticsDntEnabled())
  const sessionRecordingEnabled = computed(() => getAnalyticsSessionRecordingEnabled())

  const canTrack = computed(() => {
    return ready.value && consent.value === 'granted' && !dntEnabled.value
  })

  return {
    consent,
    dntEnabled,
    ready,
    sessionRecordingEnabled,
    canTrack,
    trackEvent,
    identifyUser,
    resetUserAnalytics,
    setAnalyticsConsent,
    setSessionRecordingEnabled,
  }
}