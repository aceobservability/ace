import { create } from 'zustand'

export interface TimeRange {
  start: number
  end: number
}

export interface TimeRangePreset {
  label: string
  value: string
  duration: number
}

export interface RefreshInterval {
  label: string
  value: string
  interval: number
}

export const TIME_RANGE_PRESETS: TimeRangePreset[] = [
  { label: 'Last 5 minutes', value: '5m', duration: 5 * 60 * 1000 },
  { label: 'Last 15 minutes', value: '15m', duration: 15 * 60 * 1000 },
  { label: 'Last 30 minutes', value: '30m', duration: 30 * 60 * 1000 },
  { label: 'Last 1 hour', value: '1h', duration: 60 * 60 * 1000 },
  { label: 'Last 6 hours', value: '6h', duration: 6 * 60 * 60 * 1000 },
  { label: 'Last 24 hours', value: '24h', duration: 24 * 60 * 60 * 1000 },
  { label: 'Last 7 days', value: '7d', duration: 7 * 24 * 60 * 60 * 1000 },
]

export const REFRESH_INTERVALS: RefreshInterval[] = [
  { label: 'Off', value: 'off', interval: 0 },
  { label: '5s', value: '5s', interval: 5 * 1000 },
  { label: '15s', value: '15s', interval: 15 * 1000 },
  { label: '30s', value: '30s', interval: 30 * 1000 },
  { label: '1m', value: '1m', interval: 60 * 1000 },
  { label: '5m', value: '5m', interval: 5 * 60 * 1000 },
]

type PreZoomSnapshot = {
  isCustom: boolean
  preset: string
  start: number
  end: number
}

const refreshCallbacks = new Set<() => void | Promise<void>>()
let refreshIntervalId: ReturnType<typeof setInterval> | null = null

function formatDateTime(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

export function calculateTimeRange(state: {
  selectedPreset: string
  isCustomRange: boolean
  customRange: TimeRange | null
}): TimeRange {
  if (state.isCustomRange && state.customRange) {
    return state.customRange
  }

  const preset = TIME_RANGE_PRESETS.find(p => p.value === state.selectedPreset)
  const now = Date.now()
  if (!preset) {
    return { start: now - 60 * 60 * 1000, end: now }
  }

  return { start: now - preset.duration, end: now }
}

function stopAutoRefresh() {
  if (refreshIntervalId !== null) {
    clearInterval(refreshIntervalId)
    refreshIntervalId = null
  }
}

async function triggerRefresh(setRefreshing: (value: boolean) => void, setLastRefreshTime: (value: number) => void) {
  const { isPaused } = useTimeRangeStore.getState()
  if (isPaused) return

  setRefreshing(true)
  setLastRefreshTime(Date.now())

  const promises = Array.from(refreshCallbacks).map(callback => {
    try {
      const result = callback()
      return result instanceof Promise ? result : Promise.resolve()
    } catch {
      return Promise.resolve()
    }
  })

  await Promise.all(promises)
  setRefreshing(false)
}

function startAutoRefresh(intervalMs: number) {
  stopAutoRefresh()
  const { isPaused } = useTimeRangeStore.getState()
  if (intervalMs > 0 && !isPaused) {
    refreshIntervalId = setInterval(() => {
      const { setRefreshing, setLastRefreshTime } = useTimeRangeStore.getState()
      triggerRefresh(setRefreshing, setLastRefreshTime)
    }, intervalMs)
  }
}

type TimeRangeState = {
  selectedPreset: string
  customRange: TimeRange | null
  isCustomRange: boolean
  refreshIntervalValue: string
  lastRefreshTime: number
  isRefreshing: boolean
  isPaused: boolean
  preZoomSnapshot: PreZoomSnapshot | null
  setRefreshing: (value: boolean) => void
  setLastRefreshTime: (value: number) => void
  getDisplayText: () => string
  getRefreshInterval: () => RefreshInterval
  setPreset: (presetValue: string) => void
  setCustomRange: (start: number, end: number) => void
  setRefreshInterval: (intervalValue: string) => void
  refresh: () => void
  pauseAutoRefresh: () => void
  resumeAutoRefresh: () => void
  zoomToRange: (start: number, end: number) => void
  resetZoom: () => void
  cleanup: () => void
  _reset: () => void
}

export const useTimeRangeStore = create<TimeRangeState>((set, get) => ({
  selectedPreset: '1h',
  customRange: null,
  isCustomRange: false,
  refreshIntervalValue: 'off',
  lastRefreshTime: Date.now(),
  isRefreshing: false,
  isPaused: false,
  preZoomSnapshot: null,

  setRefreshing(value) {
    set({ isRefreshing: value })
  },

  setLastRefreshTime(value) {
    set({ lastRefreshTime: value })
  },

  getDisplayText() {
    const { isCustomRange, customRange, selectedPreset } = get()
    if (isCustomRange && customRange) {
      const start = new Date(customRange.start)
      const end = new Date(customRange.end)
      return `${formatDateTime(start)} - ${formatDateTime(end)}`
    }

    const preset = TIME_RANGE_PRESETS.find(p => p.value === selectedPreset)
    return preset?.label || 'Last 1 hour'
  },

  getRefreshInterval() {
    const match = REFRESH_INTERVALS.find(r => r.value === get().refreshIntervalValue)
    return match || REFRESH_INTERVALS[0]
  },

  setPreset(presetValue) {
    const preset = TIME_RANGE_PRESETS.find(p => p.value === presetValue)
    if (!preset) return

    set({
      selectedPreset: presetValue,
      isCustomRange: false,
      customRange: null,
      lastRefreshTime: Date.now(),
    })

    refreshCallbacks.forEach(callback => {
      callback()
    })
  },

  setCustomRange(start, end) {
    set({
      customRange: { start, end },
      isCustomRange: true,
      lastRefreshTime: Date.now(),
    })

    refreshCallbacks.forEach(callback => {
      callback()
    })
  },

  setRefreshInterval(intervalValue) {
    const interval = REFRESH_INTERVALS.find(r => r.value === intervalValue)
    if (!interval) return

    set({ refreshIntervalValue: intervalValue })
    startAutoRefresh(interval.interval)
  },

  refresh() {
    const { setRefreshing, setLastRefreshTime } = get()
    triggerRefresh(setRefreshing, setLastRefreshTime)
  },

  pauseAutoRefresh() {
    set({ isPaused: true })
    stopAutoRefresh()
  },

  resumeAutoRefresh() {
    set({ isPaused: false })
    const interval = REFRESH_INTERVALS.find(r => r.value === get().refreshIntervalValue)
    if (interval && interval.interval > 0) {
      startAutoRefresh(interval.interval)
    }
  },

  zoomToRange(start, end) {
    const state = get()
    if (!state.preZoomSnapshot) {
      const currentRange = calculateTimeRange(state)
      set({
        preZoomSnapshot: {
          isCustom: state.isCustomRange,
          preset: state.selectedPreset,
          start: currentRange.start,
          end: currentRange.end,
        },
      })
    }
    get().setCustomRange(start, end)
  },

  resetZoom() {
    const snapshot = get().preZoomSnapshot
    if (!snapshot) return

    if (snapshot.isCustom) {
      get().setCustomRange(snapshot.start, snapshot.end)
    } else {
      get().setPreset(snapshot.preset)
    }
    set({ preZoomSnapshot: null })
  },

  cleanup() {
    stopAutoRefresh()
    refreshCallbacks.clear()
  },

  _reset() {
    stopAutoRefresh()
    refreshCallbacks.clear()
    set({
      selectedPreset: '1h',
      customRange: null,
      isCustomRange: false,
      refreshIntervalValue: 'off',
      lastRefreshTime: Date.now(),
      isRefreshing: false,
      isPaused: false,
      preZoomSnapshot: null,
    })
  },
}))

export function onTimeRangeRefresh(callback: () => void | Promise<void>) {
  refreshCallbacks.add(callback)
  return () => {
    refreshCallbacks.delete(callback)
  }
}