import { useMemo, useSyncExternalStore } from 'react'
import {
  getAnalyticsConsent,
  getAnalyticsDntEnabled,
  getAnalyticsReady,
  getAnalyticsSessionRecordingEnabled,
  identifyUser,
  resetUserAnalytics,
  setAnalyticsConsent,
  setSessionRecordingEnabled,
  subscribeAnalytics,
  trackEvent,
} from '@/analytics'

type AnalyticsSnapshot = {
  ready: boolean
  consent: ReturnType<typeof getAnalyticsConsent>
  dntEnabled: boolean
  sessionRecordingEnabled: boolean
}

function getAnalyticsSnapshot(): AnalyticsSnapshot {
  return {
    ready: getAnalyticsReady(),
    consent: getAnalyticsConsent(),
    dntEnabled: getAnalyticsDntEnabled(),
    sessionRecordingEnabled: getAnalyticsSessionRecordingEnabled(),
  }
}

// Cache the last snapshot so useSyncExternalStore can bail out on reference equality
// when none of the observed fields changed.
let cachedSnapshot = getAnalyticsSnapshot()

function getCachedAnalyticsSnapshot(): AnalyticsSnapshot {
  const next = getAnalyticsSnapshot()
  if (
    next.ready === cachedSnapshot.ready &&
    next.consent === cachedSnapshot.consent &&
    next.dntEnabled === cachedSnapshot.dntEnabled &&
    next.sessionRecordingEnabled === cachedSnapshot.sessionRecordingEnabled
  ) {
    return cachedSnapshot
  }
  cachedSnapshot = next
  return cachedSnapshot
}

export function useAnalytics() {
  const snapshot = useSyncExternalStore(
    subscribeAnalytics,
    getCachedAnalyticsSnapshot,
    getCachedAnalyticsSnapshot,
  )

  return useMemo(
    () => ({
      consent: snapshot.consent,
      dntEnabled: snapshot.dntEnabled,
      ready: snapshot.ready,
      sessionRecordingEnabled: snapshot.sessionRecordingEnabled,
      canTrack: snapshot.ready && snapshot.consent === 'granted' && !snapshot.dntEnabled,
      trackEvent,
      identifyUser,
      resetUserAnalytics,
      setAnalyticsConsent,
      setSessionRecordingEnabled,
    }),
    [snapshot],
  )
}
