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

export type AnalyticsRoute = {
  fullPath: string
  name?: string | symbol | null
}

/** React Router data-router surface used for pageview tracking. */
export type AnalyticsRouter = {
  subscribe: (fn: (state: {
    navigation: { state: string }
    location: { pathname: string; search: string; hash: string }
    matches: Array<{ route: { id?: string } }>
  }) => void) => () => void
}

const POSTHOG_HOST_DEFAULT = 'https://eu.posthog.com'
const CONSENT_STORAGE_KEY = 'ace.analytics.consent'
const SESSION_RECORDING_STORAGE_KEY = 'ace.analytics.session_recording'

let analyticsReady = false
let analyticsInitialized = false
let analyticsDntEnabled = false
let analyticsConsent: AnalyticsConsent = 'pending'
let analyticsSessionRecordingEnabled = false

let posthogClient: PostHogLike | null = null
let routerHookRegistered = false

const analyticsListeners = new Set<() => void>()

function emitAnalyticsChange() {
  for (const listener of analyticsListeners) {
    listener()
  }
}

export function subscribeAnalytics(listener: () => void): () => void {
  analyticsListeners.add(listener)
  return () => {
    analyticsListeners.delete(listener)
  }
}

function readDoNotTrackEnabled(): boolean {
  if (typeof navigator === 'undefined') {
    return false
  }

  const values = [
    navigator.doNotTrack,
    (window as Window & { doNotTrack?: string }).doNotTrack,
    (navigator as Navigator & { msDoNotTrack?: string }).msDoNotTrack,
  ]

  return values.some(value => value === '1' || value === 'yes')
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

  if (analyticsConsent === 'granted') {
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
    disable_session_recording: !analyticsSessionRecordingEnabled || analyticsConsent !== 'granted',
  })
}

function shouldCaptureEvents(): boolean {
  return analyticsReady && analyticsConsent === 'granted' && !analyticsDntEnabled
}

function registerPageViewTracking(router: AnalyticsRouter) {
  if (routerHookRegistered) {
    return
  }

  let lastPath: string | null = null
  router.subscribe(state => {
    if (state.navigation.state !== 'idle') return

    const fullPath = `${state.location.pathname}${state.location.search}${state.location.hash}`
    if (fullPath === lastPath) return
    lastPath = fullPath

    const leaf = state.matches.at(-1)
    trackEvent('$pageview', {
      path: fullPath,
      route_name: typeof leaf?.route.id === 'string' ? leaf.route.id : undefined,
      current_url: typeof window !== 'undefined' ? window.location.href : undefined,
    })
  })

  routerHookRegistered = true
}

export async function initializeAnalytics(router?: AnalyticsRouter) {
  if (analyticsInitialized) {
    if (router) {
      registerPageViewTracking(router)
    }
    return
  }

  analyticsInitialized = true
  analyticsConsent = readStoredConsent()
  analyticsSessionRecordingEnabled = readStoredSessionRecording()
  analyticsDntEnabled = readDoNotTrackEnabled()

  if (analyticsDntEnabled) {
    analyticsConsent = 'denied'
    emitAnalyticsChange()
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
      !analyticsSessionRecordingEnabled || analyticsConsent !== 'granted',
    persistence: 'localStorage+cookie',
  })

  posthogClient = posthog
  analyticsReady = true

  applyConsent()
  applySessionRecording()
  emitAnalyticsChange()

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
  analyticsConsent = consent
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(CONSENT_STORAGE_KEY, consent)
  }
  applyConsent()
  applySessionRecording()
  emitAnalyticsChange()
}

export function setSessionRecordingEnabled(enabled: boolean) {
  analyticsSessionRecordingEnabled = enabled
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(SESSION_RECORDING_STORAGE_KEY, String(enabled))
  }
  applySessionRecording()
  emitAnalyticsChange()
}

export function getAnalyticsReady() {
  return analyticsReady
}

export function getAnalyticsDntEnabled() {
  return analyticsDntEnabled
}

export function getAnalyticsConsent() {
  return analyticsConsent
}

export function getAnalyticsSessionRecordingEnabled() {
  return analyticsSessionRecordingEnabled
}