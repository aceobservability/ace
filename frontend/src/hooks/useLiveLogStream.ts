import { useCallback, useRef, useState } from 'react'
import { streamDataSourceLogs } from '@/api/datasources'
import {
  getLatestTimestampSeconds,
  getLogKey,
  LIVE_RECONNECT_BASE_DELAY_MS,
  LIVE_RECONNECT_MAX_DELAY_MS,
  LIVE_RESUME_OVERLAP_SECONDS,
  type LiveState,
  MAX_STREAM_LOGS,
  NEW_LOG_HIGHLIGHT_MS,
  sortLogsNewestFirst,
  toUnixSeconds,
} from '@/components/explore/logsExploreHelpers'
import type { LogEntry } from '@/types/datasource'

type UseLiveLogStreamParams = {
  selectedDatasourceId: string
  query: string
  setLogs: React.Dispatch<React.SetStateAction<LogEntry[]>>
  setError: (error: string | null) => void
}

export function useLiveLogStream({
  selectedDatasourceId,
  query,
  setLogs,
  setError,
}: UseLiveLogStreamParams) {
  const [isLive, setIsLive] = useState(false)
  const [liveState, setLiveState] = useState<LiveState>('idle')
  const [liveError, setLiveError] = useState<string | null>(null)
  const [liveReconnectAttempt, setLiveReconnectAttempt] = useState(0)
  const [highlightedLogKeys, setHighlightedLogKeys] = useState<Set<string>>(new Set())

  const seenLogKeysRef = useRef<Set<string>>(new Set())
  const lastLiveTimestampSecRef = useRef<number | null>(null)
  const liveAbortControllerRef = useRef<AbortController | null>(null)
  const liveReconnectTimerRef = useRef<number | null>(null)
  const isLiveRef = useRef(false)
  const openLiveStreamRef = useRef<() => Promise<void>>(async () => {})
  const highlightTimeoutIdsRef = useRef<Map<string, number>>(new Map())

  const highlightedLogKeyList = Array.from(highlightedLogKeys)

  const liveStatusLabel =
    liveState === 'connected'
      ? 'Live'
      : liveState === 'connecting'
        ? 'Connecting...'
        : liveState === 'reconnecting'
          ? 'Reconnecting...'
          : ''

  const isLiveBusy = liveState === 'connecting' || liveState === 'reconnecting'

  const clearLogHighlights = useCallback(() => {
    for (const timeoutId of highlightTimeoutIdsRef.current.values()) {
      window.clearTimeout(timeoutId)
    }
    highlightTimeoutIdsRef.current = new Map()
    setHighlightedLogKeys(new Set())
  }, [])

  const markLogAsNew = useCallback((logKey: string) => {
    setHighlightedLogKeys(prev => new Set(prev).add(logKey))

    const existingTimeout = highlightTimeoutIdsRef.current.get(logKey)
    if (existingTimeout !== undefined) {
      window.clearTimeout(existingTimeout)
    }

    const timeoutId = window.setTimeout(() => {
      setHighlightedLogKeys(prev => {
        const next = new Set(prev)
        next.delete(logKey)
        return next
      })
      highlightTimeoutIdsRef.current.delete(logKey)
    }, NEW_LOG_HIGHLIGHT_MS)

    highlightTimeoutIdsRef.current.set(logKey, timeoutId)
  }, [])

  const resetLogCache = useCallback((entries: LogEntry[]) => {
    seenLogKeysRef.current = new Set(entries.map(getLogKey))
    lastLiveTimestampSecRef.current = getLatestTimestampSeconds(entries)
  }, [])

  const appendStreamLog = useCallback(
    (entry: LogEntry) => {
      const key = getLogKey(entry)
      if (seenLogKeysRef.current.has(key)) {
        return
      }

      seenLogKeysRef.current.add(key)
      markLogAsNew(key)

      const timestampSec = toUnixSeconds(entry.timestamp)
      if (
        timestampSec !== null &&
        (lastLiveTimestampSecRef.current === null ||
          timestampSec > lastLiveTimestampSecRef.current)
      ) {
        lastLiveTimestampSecRef.current = timestampSec
      }

      setLogs(prev => {
        const next = [...prev, entry]
        if (next.length <= MAX_STREAM_LOGS) {
          return next
        }

        const trimmed = sortLogsNewestFirst(next).slice(0, MAX_STREAM_LOGS)
        seenLogKeysRef.current = new Set(trimmed.map(getLogKey))

        const remainingKeys = new Set(trimmed.map(getLogKey))
        setHighlightedLogKeys(current =>
          new Set(Array.from(current).filter(logKey => remainingKeys.has(logKey))),
        )

        for (const [logKey, timeoutId] of highlightTimeoutIdsRef.current.entries()) {
          if (!remainingKeys.has(logKey)) {
            window.clearTimeout(timeoutId)
            highlightTimeoutIdsRef.current.delete(logKey)
          }
        }

        return trimmed
      })
    },
    [markLogAsNew, setLogs],
  )

  const clearLiveReconnectTimer = useCallback(() => {
    if (liveReconnectTimerRef.current !== null) {
      window.clearTimeout(liveReconnectTimerRef.current)
      liveReconnectTimerRef.current = null
    }
  }, [])

  const cancelLiveStream = useCallback(() => {
    if (liveAbortControllerRef.current) {
      liveAbortControllerRef.current.abort()
      liveAbortControllerRef.current = null
    }
  }, [])

  const stopLive = useCallback(
    (resetError = true) => {
      const wasLive = isLiveRef.current
      isLiveRef.current = false
      clearLiveReconnectTimer()
      cancelLiveStream()
      // Avoid setState spam when already stopped (effects depend on stopLive).
      if (!wasLive && !resetError) {
        return
      }
      setIsLive(false)
      setLiveState('idle')
      if (resetError) {
        setLiveError(null)
      }
      setLiveReconnectAttempt(0)
    },
    [cancelLiveStream, clearLiveReconnectTimer],
  )

  const getLiveStreamStart = useCallback(() => {
    if (lastLiveTimestampSecRef.current === null) {
      return Math.floor(Date.now() / 1000) - LIVE_RESUME_OVERLAP_SECONDS
    }
    return Math.max(0, lastLiveTimestampSecRef.current - LIVE_RESUME_OVERLAP_SECONDS)
  }, [])

  const openLiveStream = useCallback(async () => {
    if (!isLive || !selectedDatasourceId || !query.trim()) {
      return
    }

    clearLiveReconnectTimer()
    cancelLiveStream()

    liveAbortControllerRef.current = new AbortController()
    if (liveState !== 'reconnecting') {
      setLiveState('connecting')
    }

    try {
      await streamDataSourceLogs(
        selectedDatasourceId,
        {
          query,
          start: getLiveStreamStart(),
          limit: 200,
        },
        {
          onLog: appendStreamLog,
          onStatus: (status, message) => {
            if (!isLiveRef.current) return

            if (status === 'connected') {
              setLiveState('connected')
              setLiveError(null)
              setLiveReconnectAttempt(0)
              return
            }

            if (status === 'connecting') {
              setLiveState('connecting')
            }

            if (message) {
              setLiveError(message)
            }
          },
          onError: message => {
            if (!isLiveRef.current) return
            setLiveError(message)
          },
        },
        liveAbortControllerRef.current.signal,
      )

      if (!isLiveRef.current) return

      setLiveError('Live stream disconnected')
      setLiveState('reconnecting')
      const delayMs = Math.min(
        LIVE_RECONNECT_MAX_DELAY_MS,
        LIVE_RECONNECT_BASE_DELAY_MS * 2 ** liveReconnectAttempt,
      )
      setLiveReconnectAttempt(prev => prev + 1)
      liveReconnectTimerRef.current = window.setTimeout(() => {
        void openLiveStreamRef.current()
      }, delayMs)
    } catch (e) {
      if (!isLiveRef.current) return
      if (e instanceof Error && e.name === 'AbortError') return

      setLiveError(e instanceof Error ? e.message : 'Live stream failed')
      setLiveState('reconnecting')
      const delayMs = Math.min(
        LIVE_RECONNECT_MAX_DELAY_MS,
        LIVE_RECONNECT_BASE_DELAY_MS * 2 ** liveReconnectAttempt,
      )
      setLiveReconnectAttempt(prev => prev + 1)
      liveReconnectTimerRef.current = window.setTimeout(() => {
        void openLiveStreamRef.current()
      }, delayMs)
    }
  }, [
    appendStreamLog,
    cancelLiveStream,
    clearLiveReconnectTimer,
    getLiveStreamStart,
    isLive,
    liveReconnectAttempt,
    liveState,
    query,
    selectedDatasourceId,
  ])

  openLiveStreamRef.current = openLiveStream

  const prepareForQuery = useCallback(() => {
    setLiveError(null)
    clearLogHighlights()
    seenLogKeysRef.current = new Set()
    lastLiveTimestampSecRef.current = null
  }, [clearLogHighlights])

  const resumeAfterQuery = useCallback(() => {
    isLiveRef.current = true
    setIsLive(true)
    setLiveState('connecting')
    setLiveError(null)
    setLiveReconnectAttempt(0)
    void openLiveStream()
  }, [openLiveStream])

  const startLive = useCallback(
    async (options: {
      hasSuccessfulQuery: boolean
      onNeedQuery: () => Promise<void>
    }) => {
      if (isLive || isLiveBusy) {
        return
      }

      if (!selectedDatasourceId) {
        setError('Select a logs datasource')
        return
      }

      if (!query.trim()) {
        setError('Query is required')
        return
      }

      if (!options.hasSuccessfulQuery) {
        await options.onNeedQuery()
        return
      }

      isLiveRef.current = true
      setIsLive(true)
      setLiveState('connecting')
      setLiveError(null)
      setLiveReconnectAttempt(0)
      void openLiveStream()
    },
    [isLive, isLiveBusy, openLiveStream, query, selectedDatasourceId, setError],
  )

  const toggleLive = useCallback(
    (options: {
      hasSuccessfulQuery: boolean
      onNeedQuery: () => Promise<void>
    }) => {
      if (isLive) {
        stopLive()
        return
      }
      void startLive(options)
    },
    [isLive, startLive, stopLive],
  )

  return {
    isLive,
    liveState,
    liveError,
    liveStatusLabel,
    isLiveBusy,
    highlightedLogKeyList,
    clearLogHighlights,
    resetLogCache,
    stopLive,
    prepareForQuery,
    resumeAfterQuery,
    openLiveStream,
    startLive,
    toggleLive,
    setLiveError,
  }
}
