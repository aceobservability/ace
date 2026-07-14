import { useMemo } from 'react'
import {
  calculateTimeRange,
  onTimeRangeRefresh,
  REFRESH_INTERVALS,
  TIME_RANGE_PRESETS,
  useTimeRangeStore,
} from '@/stores/timeRangeStore'

export function useTimeRange() {
  const selectedPreset = useTimeRangeStore(state => state.selectedPreset)
  const isCustomRange = useTimeRangeStore(state => state.isCustomRange)
  const customRange = useTimeRangeStore(state => state.customRange)
  const refreshIntervalValue = useTimeRangeStore(state => state.refreshIntervalValue)
  const lastRefreshTime = useTimeRangeStore(state => state.lastRefreshTime)
  const isRefreshing = useTimeRangeStore(state => state.isRefreshing)
  const isPaused = useTimeRangeStore(state => state.isPaused)
  const preZoomSnapshot = useTimeRangeStore(state => state.preZoomSnapshot)

  const setPreset = useTimeRangeStore(state => state.setPreset)
  const setCustomRange = useTimeRangeStore(state => state.setCustomRange)
  const setRefreshInterval = useTimeRangeStore(state => state.setRefreshInterval)
  const refresh = useTimeRangeStore(state => state.refresh)
  const pauseAutoRefresh = useTimeRangeStore(state => state.pauseAutoRefresh)
  const resumeAutoRefresh = useTimeRangeStore(state => state.resumeAutoRefresh)
  const zoomToRange = useTimeRangeStore(state => state.zoomToRange)
  const resetZoom = useTimeRangeStore(state => state.resetZoom)
  const cleanup = useTimeRangeStore(state => state.cleanup)

  const timeRange = useMemo(
    () => calculateTimeRange({ selectedPreset, isCustomRange, customRange }),
    [selectedPreset, isCustomRange, customRange, lastRefreshTime],
  )

  const displayText = useMemo(() => {
    if (isCustomRange && customRange) {
      const start = new Date(customRange.start)
      const end = new Date(customRange.end)
      const format = (date: Date) => {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        const hours = String(date.getHours()).padStart(2, '0')
        const minutes = String(date.getMinutes()).padStart(2, '0')
        return `${year}-${month}-${day} ${hours}:${minutes}`
      }
      return `${format(start)} - ${format(end)}`
    }

    const preset = TIME_RANGE_PRESETS.find(p => p.value === selectedPreset)
    return preset?.label || 'Last 1 hour'
  }, [isCustomRange, customRange, selectedPreset])

  const refreshInterval = useMemo(
    () => REFRESH_INTERVALS.find(r => r.value === refreshIntervalValue) || REFRESH_INTERVALS[0],
    [refreshIntervalValue],
  )

  return {
    timeRange,
    displayText,
    selectedPreset,
    isCustomRange,
    customRange,
    refreshInterval,
    refreshIntervalValue,
    lastRefreshTime,
    isRefreshing,
    isPaused,
    preZoomSnapshot,
    presets: TIME_RANGE_PRESETS,
    refreshIntervals: REFRESH_INTERVALS,
    setPreset,
    setCustomRange,
    setRefreshInterval,
    refresh,
    onRefresh: onTimeRangeRefresh,
    cleanup,
    pauseAutoRefresh,
    resumeAutoRefresh,
    zoomToRange,
    resetZoom,
  }
}