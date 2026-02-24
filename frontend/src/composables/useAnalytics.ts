import { computed } from 'vue'
import {
  analyticsConsent,
  analyticsDntEnabled,
  analyticsReady,
  analyticsSessionRecordingEnabled,
  identifyUser,
  resetUserAnalytics,
  setAnalyticsConsent,
  setSessionRecordingEnabled,
  trackEvent,
  type AnalyticsConsent,
} from '../analytics'

export function useAnalytics() {
  const canTrack = computed(() => {
    return analyticsReady.value && analyticsConsent.value === 'granted' && !analyticsDntEnabled.value
  })

  return {
    consent: analyticsConsent,
    dntEnabled: analyticsDntEnabled,
    ready: analyticsReady,
    sessionRecordingEnabled: analyticsSessionRecordingEnabled,
    canTrack,
    trackEvent,
    identifyUser,
    resetUserAnalytics,
    setAnalyticsConsent,
    setSessionRecordingEnabled,
  }
}

export type { AnalyticsConsent }
