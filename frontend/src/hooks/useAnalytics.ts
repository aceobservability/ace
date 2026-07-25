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
} from '@/analytics'

export function useAnalytics() {
  const ready = getAnalyticsReady()
  const consent = getAnalyticsConsent()
  const dntEnabled = getAnalyticsDntEnabled()
  const sessionRecordingEnabled = getAnalyticsSessionRecordingEnabled()
  const canTrack = ready && consent === 'granted' && !dntEnabled

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
