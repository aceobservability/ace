import { Check, ChevronDown, ChevronUp, Clock, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { StatusDot } from '@/components/StatusDot'
import { useTimeRange } from '@/hooks/useTimeRange'

type TimeRangePickerProps = {
  stacked?: boolean
  showStatus?: boolean
}

function formatAgo(seconds: number): string {
  if (seconds < 1) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const mins = Math.floor(seconds / 60)
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}

function formatDateTimeLocal(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

export function TimeRangePicker({ stacked = false, showStatus = true }: TimeRangePickerProps) {
  const {
    displayText,
    selectedPreset,
    isCustomRange,
    refreshIntervalValue,
    lastRefreshTime,
    isRefreshing,
    presets,
    refreshIntervals,
    setPreset,
    setCustomRange,
    setRefreshInterval,
    refresh,
  } = useTimeRange()

  const [isOpen, setIsOpen] = useState(false)
  const [isRefreshDropdownOpen, setIsRefreshDropdownOpen] = useState(false)
  const [showCustomRange, setShowCustomRange] = useState(false)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [customRangeError, setCustomRangeError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const [highlightedIndex, setHighlightedIndex] = useState(-1)

  const refreshIntervalMs =
    refreshIntervals.find(r => r.value === refreshIntervalValue)?.interval ?? 0
  const isAutoRefreshing = refreshIntervalMs > 0
  const secondsAgo = Math.max(0, Math.floor((now - lastRefreshTime) / 1000))
  const isStale = isAutoRefreshing && now - lastRefreshTime > refreshIntervalMs * 2
  const statusDotStatus = isStale ? 'warning' : isAutoRefreshing ? 'healthy' : 'info'
  const currentIntervalLabel =
    refreshIntervals.find(r => r.value === refreshIntervalValue)?.label ?? 'Off'

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement
      if (!target.closest('.time-range-picker')) {
        setIsOpen(false)
        setIsRefreshDropdownOpen(false)
        setShowCustomRange(false)
        setCustomRangeError(null)
        setHighlightedIndex(-1)
      }
    }

    window.addEventListener('click', handleClickOutside)
    return () => window.removeEventListener('click', handleClickOutside)
  }, [])

  function closeDropdown() {
    setIsOpen(false)
    setShowCustomRange(false)
    setCustomRangeError(null)
  }

  function toggleDropdown() {
    setIsOpen(prev => !prev)
    if (!isOpen) {
      setIsRefreshDropdownOpen(false)
    } else {
      setShowCustomRange(false)
      setCustomRangeError(null)
    }
  }

  function toggleRefreshDropdown() {
    setIsRefreshDropdownOpen(prev => !prev)
    if (!isRefreshDropdownOpen) {
      setIsOpen(false)
      setShowCustomRange(false)
      setCustomRangeError(null)
      setHighlightedIndex(-1)
    }
  }

  function selectPreset(presetValue: string) {
    setPreset(presetValue)
    closeDropdown()
  }

  function selectInterval(intervalValue: string) {
    setRefreshInterval(intervalValue)
    if (intervalValue !== 'off') {
      refresh()
    }
    setIsRefreshDropdownOpen(false)
    setHighlightedIndex(-1)
  }

  function handleRefreshDropdownKeydown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (!isRefreshDropdownOpen) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        toggleRefreshDropdown()
      }
      return
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setHighlightedIndex(prev => Math.min(prev + 1, refreshIntervals.length - 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        setHighlightedIndex(prev => Math.max(prev - 1, 0))
        break
      case 'Enter':
        event.preventDefault()
        if (highlightedIndex >= 0 && highlightedIndex < refreshIntervals.length) {
          selectInterval(refreshIntervals[highlightedIndex].value)
        }
        break
      case 'Escape':
        event.preventDefault()
        setIsRefreshDropdownOpen(false)
        setHighlightedIndex(-1)
        break
    }
  }

  function openCustomRangeForm() {
    setShowCustomRange(true)
    const date = new Date()
    const oneHourAgo = new Date(date.getTime() - 60 * 60 * 1000)
    setCustomFrom(formatDateTimeLocal(oneHourAgo))
    setCustomTo(formatDateTimeLocal(date))
  }

  function applyCustomRange() {
    const fromDate = new Date(customFrom)
    const toDate = new Date(customTo)

    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      setCustomRangeError('Please enter valid dates')
      return
    }

    if (fromDate >= toDate) {
      setCustomRangeError('Start time must be before end time')
      return
    }

    setCustomRange(fromDate.getTime(), toDate.getTime())
    closeDropdown()
  }

  return (
    <div className={`time-range-picker relative ${stacked ? 'block w-full' : 'inline-block'}`}>
      <div className={`flex gap-2 ${stacked ? 'flex-col items-start gap-[0.45rem]' : 'items-center'}`}>
        <div className={`flex items-center gap-2 ${stacked ? 'w-full' : ''}`}>
          <button
            type="button"
            data-testid="time-range-picker-btn"
            className={`flex h-[36px] cursor-pointer items-center gap-2 rounded px-3 text-sm transition hover:opacity-80 ${stacked ? 'w-full justify-between' : ''}`}
            style={{
              backgroundColor: 'var(--color-surface-container-high)',
              color: 'var(--color-on-surface)',
              border: isOpen ? '1px solid var(--color-primary)' : '1px solid transparent',
            }}
            onClick={event => {
              event.stopPropagation()
              toggleDropdown()
            }}
          >
            <Clock size={16} style={{ color: 'var(--color-outline)' }} />
            <span className="min-w-[100px] font-mono text-xs">{displayText}</span>
            {isOpen ? (
              <ChevronUp size={14} style={{ color: 'var(--color-outline)' }} />
            ) : (
              <ChevronDown size={14} style={{ color: 'var(--color-outline)' }} />
            )}
          </button>
        </div>

        <div className={`flex items-center gap-2 ${stacked ? 'w-full flex-wrap' : ''}`}>
          <button
            type="button"
            data-testid="time-range-refresh-btn"
            className="flex h-[28px] cursor-pointer items-center justify-center rounded px-2 transition hover:opacity-80"
            style={{
              backgroundColor: 'var(--color-surface-container-high)',
              color: isRefreshing ? 'var(--color-primary)' : 'var(--color-outline)',
              border: '1px solid transparent',
            }}
            title={`Last refresh: ${formatAgo(secondsAgo)}`}
            onClick={refresh}
          >
            <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
          </button>

          <div className="relative">
            <button
              type="button"
              data-testid="refresh-interval-trigger"
              className="flex h-[28px] cursor-pointer items-center gap-1 rounded px-2 text-xs font-medium transition hover:opacity-80"
              style={{
                backgroundColor: 'var(--color-surface-container-high)',
                color: 'var(--color-on-surface-variant)',
                border: isRefreshDropdownOpen
                  ? '1px solid var(--color-primary)'
                  : '1px solid transparent',
              }}
              aria-haspopup="listbox"
              aria-expanded={isRefreshDropdownOpen}
              onClick={event => {
                event.stopPropagation()
                toggleRefreshDropdown()
              }}
              onKeyDown={handleRefreshDropdownKeydown}
            >
              {currentIntervalLabel}
              <ChevronDown size={12} style={{ color: 'var(--color-outline)' }} />
            </button>

            {isRefreshDropdownOpen ? (
              <div
                className="absolute top-[calc(100%+4px)] right-0 z-[1000] min-w-[120px] animate-fade-in rounded py-1"
                style={{
                  backgroundColor: 'var(--color-surface-bright)',
                  border: '1px solid var(--color-outline-variant)',
                  boxShadow:
                    'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.24), 0 1px 2px rgba(0,0,0,0.16))',
                }}
                role="listbox"
                onMouseDown={event => event.stopPropagation()}
              >
                <div
                  className="px-3 py-1.5 font-mono text-[0.6875rem] font-semibold uppercase tracking-wide"
                  style={{ color: 'var(--color-outline)' }}
                >
                  Auto-refresh
                </div>
                {refreshIntervals.map((interval, index) => (
                  <button
                    key={interval.value}
                    type="button"
                    data-testid="refresh-interval-option"
                    role="option"
                    aria-selected={interval.value === refreshIntervalValue}
                    className="flex w-full cursor-pointer items-center justify-between px-3 py-1.5 text-left text-xs transition hover:opacity-80"
                    style={{
                      color:
                        interval.value === refreshIntervalValue
                          ? 'var(--color-primary)'
                          : 'var(--color-on-surface-variant)',
                      backgroundColor:
                        index === highlightedIndex
                          ? 'var(--color-surface-container-high)'
                          : interval.value === refreshIntervalValue
                            ? 'var(--selected-fill, color-mix(in srgb, var(--color-primary) 14%, transparent))'
                            : 'transparent',
                    }}
                    onClick={() => selectInterval(interval.value)}
                  >
                    {interval.label}
                    {interval.value === refreshIntervalValue ? <Check size={12} /> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {showStatus && !stacked ? (
            <div className="flex items-center gap-2" data-testid="refresh-status">
              <StatusDot status={statusDotStatus} size={6} />
              <span
                className="hidden text-xs lg:inline"
                style={{
                  color: isStale ? 'var(--color-tertiary)' : 'var(--color-on-surface-variant)',
                }}
              >
                {isRefreshing ? 'Refreshing...' : `Last refreshed ${formatAgo(secondsAgo)}`}
                {isStale ? ' — Data may be stale' : ''}
              </span>
              <span
                className="hidden text-xs sm:inline lg:hidden"
                style={{
                  color: isStale ? 'var(--color-tertiary)' : 'var(--color-on-surface-variant)',
                }}
              >
                {isRefreshing ? 'Refreshing...' : formatAgo(secondsAgo)}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {isOpen ? (
        // biome-ignore lint/a11y/noStaticElementInteractions: stop mousedown from closing parent picker
        <div
          className="absolute top-[calc(100%+4px)] left-0 z-[1000] min-w-[220px] animate-fade-in rounded shadow-lg"
          style={{
            backgroundColor: 'var(--color-surface-bright)',
            border: '1px solid var(--color-outline-variant)',
          }}
          onMouseDown={event => event.stopPropagation()}
        >
          {!showCustomRange ? (
            <>
              <div className="py-2">
                <div
                  className="px-4 py-2 text-[0.6875rem] font-semibold uppercase tracking-wide"
                  style={{ color: 'var(--color-outline)' }}
                >
                  Quick ranges
                </div>
                {presets.map(preset => (
                  <button
                    key={preset.value}
                    type="button"
                    className="block w-full cursor-pointer border-0 bg-transparent px-4 py-2.5 text-left text-sm transition hover:opacity-80"
                    style={{
                      color:
                        !isCustomRange && selectedPreset === preset.value
                          ? 'var(--color-primary)'
                          : 'var(--color-on-surface-variant)',
                      backgroundColor:
                        !isCustomRange && selectedPreset === preset.value
                          ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)'
                          : 'transparent',
                      fontWeight:
                        !isCustomRange && selectedPreset === preset.value ? 500 : undefined,
                    }}
                    onClick={() => selectPreset(preset.value)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div
                className="mx-0 my-1 h-px"
                style={{ backgroundColor: 'var(--color-outline-variant)' }}
              />

              <button
                type="button"
                className="block w-full cursor-pointer border-0 bg-transparent px-4 py-2.5 text-left text-sm transition hover:opacity-80"
                style={{ color: 'var(--color-primary)' }}
                onClick={openCustomRangeForm}
              >
                Custom range...
              </button>
            </>
          ) : (
            <div className="p-4">
              <div
                className="px-0 py-2 text-[0.6875rem] font-semibold uppercase tracking-wide"
                style={{ color: 'var(--color-outline)' }}
              >
                Custom time range
              </div>

              <div className="mb-3">
                <label
                  htmlFor="custom-from"
                  className="mb-1.5 block text-xs font-medium"
                  style={{ color: 'var(--color-on-surface-variant)' }}
                >
                  From
                </label>
                <input
                  id="custom-from"
                  data-testid="time-range-custom-from-input"
                  type="datetime-local"
                  value={customFrom}
                  onChange={event => setCustomFrom(event.target.value)}
                  className="w-full rounded px-2 py-1 text-xs focus:ring-2 focus:outline-none"
                  style={{
                    backgroundColor: 'var(--color-surface-container-low)',
                    color: 'var(--color-on-surface)',
                    border: '1px solid var(--color-outline-variant)',
                  }}
                />
              </div>

              <div className="mb-3">
                <label
                  htmlFor="custom-to"
                  className="mb-1.5 block text-xs font-medium"
                  style={{ color: 'var(--color-on-surface-variant)' }}
                >
                  To
                </label>
                <input
                  id="custom-to"
                  data-testid="time-range-custom-to-input"
                  type="datetime-local"
                  value={customTo}
                  onChange={event => setCustomTo(event.target.value)}
                  className="w-full rounded px-2 py-1 text-xs focus:ring-2 focus:outline-none"
                  style={{
                    backgroundColor: 'var(--color-surface-container-low)',
                    color: 'var(--color-on-surface)',
                    border: '1px solid var(--color-outline-variant)',
                  }}
                />
              </div>

              {customRangeError ? (
                <div
                  className="mb-3 rounded px-3 py-2 text-xs"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
                    color: 'var(--color-error)',
                  }}
                >
                  {customRangeError}
                </div>
              ) : null}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  data-testid="time-range-cancel-btn"
                  className="cursor-pointer rounded bg-transparent px-4 py-2 text-sm font-medium transition hover:opacity-80"
                  style={{
                    color: 'var(--color-on-surface-variant)',
                    border: '1px solid var(--color-outline-variant)',
                  }}
                  onClick={() => {
                    setShowCustomRange(false)
                    setCustomRangeError(null)
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  data-testid="time-range-apply-btn"
                  className="cursor-pointer rounded px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
                  style={{
                    background:
                      'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
                    border: '1px solid transparent',
                  }}
                  onClick={applyCustomRange}
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}