import { ref } from 'vue'
import type { Router } from 'vue-router'

type AnalyticsConsent = 'pending' | 'granted' | 'denied'

interface AnalyticsUser {
  id: string
  email?: string
  name?: string
}

type EventProperties = Record<string, unknown>

interface PostHogLike {
  init: (apiKey: string, options?: Record<string, unknown>) => void
  capture: (event: string, properties?: EventProperties) => void
  identify: (distinctId: string, properties?: EventProperties) => void
  reset: () => void
  isFeatureEnabled?: (flag: string) => boolean | undefined
  onFeatureFlags?: (callback: () => void) => (() => void) | undefined
  opt_in_capturing?: () => void
  opt_out_capturing?: () => void
  set_config?: (config: Record<string, unknown>) => void
}

const POSTHOG_HOST_DEFAULT = 'https://eu.posthog.com'
const CONSENT_STORAGE_KEY = 'ace.analytics.consent'
const SESSION_RECORDING_STORAGE_KEY = 'ace.analytics.session_recording'

const analyticsReady = ref(false)
const analyticsInitialized = ref(false)
const analyticsDntEnabled = ref(false)
const analyticsConsent = ref<AnalyticsConsent>('pending')
const analyticsSessionRecordingEnabled = ref(false)

let posthogClient: PostHogLike | null = null
let routerHookRegistered = false

function readDoNotTrackEnabled(): boolean {
  if (typeof navigator === 'undefined') {
    return false
  }

  const values = [
    navigator.doNotTrack,
    (window as Window & { doNotTrack?: string }).doNotTrack,
    (navigator as Navigator & { msDoNotTrack?: string }).msDoNotTrack,
  ]

  return values.some((value) => value === '1' || value === 'yes')
}

function readStoredConsent(): AnalyticsConsent {
  if (typeof localStorage === 'undefined') {
    return 'pending'
  }

  const stored = localStorage.getItem(CONSENT_STORAGE_KEY)
  if (stored === 'granted' || stored === 'denied') {
    return stored
  }

  return 'pending'
}

function readStoredSessionRecording(): boolean {
  if (typeof localStorage === 'undefined') {
    return false
  }

  return localStorage.getItem(SESSION_RECORDING_STORAGE_KEY) === 'true'
}

function applyConsent() {
  if (!posthogClient) {
    return
  }

  if (analyticsConsent.value === 'granted') {
    posthogClient.opt_in_capturing?.()
    return
  }

  posthogClient.opt_out_capturing?.()
}

function applySessionRecording() {
  if (!posthogClient) {
    return
  }

  posthogClient.set_config?.({
    disable_session_recording:
      !analyticsSessionRecordingEnabled.value || analyticsConsent.value !== 'granted',
  })
}

function shouldCaptureEvents(): boolean {
  return analyticsReady.value && analyticsConsent.value === 'granted' && !analyticsDntEnabled.value
}

function registerPageViewTracking(router: Router) {
  if (routerHookRegistered) {
    return
  }

  router.afterEach((to) => {
    trackEvent('$pageview', {
      path: to.fullPath,
      route_name: typeof to.name === 'string' ? to.name : undefined,
      current_url: typeof window !== 'undefined' ? window.location.href : undefined,
    })
  })

  routerHookRegistered = true
}

export async function initializeAnalytics(router?: Router) {
  if (analyticsInitialized.value) {
    if (router) {
      registerPageViewTracking(router)
    }
    return
  }

  analyticsInitialized.value = true
  analyticsConsent.value = readStoredConsent()
  analyticsSessionRecordingEnabled.value = readStoredSessionRecording()
  analyticsDntEnabled.value = readDoNotTrackEnabled()

  if (analyticsDntEnabled.value) {
    analyticsConsent.value = 'denied'
    return
  }

  const apiKey = import.meta.env.VITE_POSTHOG_KEY?.trim()
  if (!apiKey) {
    return
  }

  const apiHost = import.meta.env.VITE_POSTHOG_HOST?.trim() || POSTHOG_HOST_DEFAULT

  const module = await import('posthog-js')
  const posthog = module.default as unknown as PostHogLike

  posthog.init(apiKey, {
    api_host: apiHost,
    person_profiles: 'identified_only',
    capture_pageview: false,
    capture_pageleave: false,
    autocapture: false,
    disable_session_recording:
      !analyticsSessionRecordingEnabled.value || analyticsConsent.value !== 'granted',
    persistence: 'localStorage+cookie',
  })

  posthogClient = posthog
  analyticsReady.value = true

  applyConsent()
  applySessionRecording()

  if (router) {
    registerPageViewTracking(router)
  }
}

export function trackEvent(event: string, properties?: EventProperties) {
  if (!posthogClient || !shouldCaptureEvents()) {
    return
  }

  posthogClient.capture(event, properties)
}

export function identifyUser(user: AnalyticsUser) {
  if (!posthogClient || !shouldCaptureEvents()) {
    return
  }

  posthogClient.identify(user.id, {
    email: user.email,
    name: user.name,
  })
}

export function resetUserAnalytics() {
  if (!posthogClient) {
    return
  }

  posthogClient.reset()
}

export function setAnalyticsConsent(consent: AnalyticsConsent) {
  analyticsConsent.value = consent
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(CONSENT_STORAGE_KEY, consent)
  }
  applyConsent()
  applySessionRecording()
}

export function setSessionRecordingEnabled(enabled: boolean) {
  analyticsSessionRecordingEnabled.value = enabled
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(SESSION_RECORDING_STORAGE_KEY, String(enabled))
  }
  applySessionRecording()
}

export { analyticsReady, analyticsDntEnabled, analyticsConsent, analyticsSessionRecordingEnabled }
