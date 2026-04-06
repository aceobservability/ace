<script setup lang="ts">
import { Check, ChevronDown, ChevronUp, Clock, RefreshCw } from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useTimeRange } from '../composables/useTimeRange'
import StatusDot from './StatusDot.vue'

const props = withDefaults(
  defineProps<{
    stacked?: boolean
    showStatus?: boolean
  }>(),
  {
    stacked: false,
    showStatus: true,
  },
)

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

const isOpen = ref(false)
const isRefreshDropdownOpen = ref(false)
const showCustomRange = ref(false)
const customFrom = ref('')
const customTo = ref('')
const customRangeError = ref<string | null>(null)
const now = ref(Date.now())
const highlightedIndex = ref(-1)
let tickTimer: ReturnType<typeof setInterval> | null = null

const currentDisplayText = computed(() => displayText.value)

const currentIntervalLabel = computed(() => {
  const match = refreshIntervals.find((r) => r.value === refreshIntervalValue.value)
  return match ? match.label : 'Off'
})

const refreshIntervalMs = computed(() => {
  const match = refreshIntervals.find((r) => r.value === refreshIntervalValue.value)
  return match ? match.interval : 0
})

const isAutoRefreshing = computed(() => refreshIntervalMs.value > 0)

const secondsAgo = computed(() => {
  return Math.max(0, Math.floor((now.value - lastRefreshTime.value) / 1000))
})

const isStale = computed(() => {
  if (!isAutoRefreshing.value) return false
  const elapsed = now.value - lastRefreshTime.value
  return elapsed > refreshIntervalMs.value * 2
})

const statusDotStatus = computed(() => {
  if (isStale.value) return 'warning' as const
  if (isAutoRefreshing.value) return 'healthy' as const
  return 'info' as const
})

function formatAgo(seconds: number): string {
  if (seconds < 1) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const mins = Math.floor(seconds / 60)
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}

function toggleDropdown() {
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    isRefreshDropdownOpen.value = false
  }
  if (!isOpen.value) {
    showCustomRange.value = false
    customRangeError.value = null
  }
}

function closeDropdown() {
  isOpen.value = false
  showCustomRange.value = false
  customRangeError.value = null
}

function toggleRefreshDropdown() {
  isRefreshDropdownOpen.value = !isRefreshDropdownOpen.value
  if (isRefreshDropdownOpen.value) {
    isOpen.value = false
    showCustomRange.value = false
    customRangeError.value = null
    highlightedIndex.value = -1
  }
}

function closeRefreshDropdown() {
  isRefreshDropdownOpen.value = false
  highlightedIndex.value = -1
}

function closeAllDropdowns() {
  closeDropdown()
  closeRefreshDropdown()
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
  closeRefreshDropdown()
}

function handleRefreshDropdownKeydown(event: KeyboardEvent) {
  if (!isRefreshDropdownOpen.value) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggleRefreshDropdown()
    }
    return
  }

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      highlightedIndex.value = Math.min(highlightedIndex.value + 1, refreshIntervals.length - 1)
      break
    case 'ArrowUp':
      event.preventDefault()
      highlightedIndex.value = Math.max(highlightedIndex.value - 1, 0)
      break
    case 'Enter':
      event.preventDefault()
      if (highlightedIndex.value >= 0 && highlightedIndex.value < refreshIntervals.length) {
        selectInterval(refreshIntervals[highlightedIndex.value].value)
      }
      break
    case 'Escape':
      event.preventDefault()
      closeRefreshDropdown()
      break
  }
}

function openCustomRange() {
  showCustomRange.value = true
  const d = new Date()
  const oneHourAgo = new Date(d.getTime() - 60 * 60 * 1000)
  customFrom.value = formatDateTimeLocal(oneHourAgo)
  customTo.value = formatDateTimeLocal(d)
}

function applyCustomRange() {
  const fromDate = new Date(customFrom.value)
  const toDate = new Date(customTo.value)

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    customRangeError.value = 'Please enter valid dates'
    return
  }

  if (fromDate >= toDate) {
    customRangeError.value = 'Start time must be before end time'
    return
  }

  setCustomRange(fromDate.getTime(), toDate.getTime())
  closeDropdown()
}

function cancelCustomRange() {
  showCustomRange.value = false
  customRangeError.value = null
}

function handleRefresh() {
  refresh()
}

function formatDateTimeLocal(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('.time-range-picker')) {
    closeAllDropdowns()
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('click', handleClickOutside)
}

onMounted(() => {
  tickTimer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('click', handleClickOutside)
  }
  if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }
})
</script>

<template>
  <div class="time-range-picker relative" :class="props.stacked ? 'block w-full' : 'inline-block'">
    <div
      class="flex gap-2"
      :class="props.stacked ? 'flex-col items-start gap-[0.45rem]' : 'items-center'"
    >
      <!-- Time select row -->
      <div class="flex items-center gap-2" :class="props.stacked ? 'w-full' : ''">
        <button
          data-testid="time-range-picker-btn"
          class="flex h-[36px] items-center gap-2 rounded px-3 text-sm transition cursor-pointer hover:opacity-80"
          :style="{
            backgroundColor: 'var(--color-surface-container-high)',
            color: 'var(--color-on-surface)',
            border: isOpen ? '1px solid var(--color-primary)' : '1px solid transparent',
          }"
          :class="[
            props.stacked ? 'w-full justify-between' : ''
          ]"
          @click.stop="toggleDropdown"
        >
          <Clock :size="16" :style="{ color: 'var(--color-outline)' }" />
          <span class="min-w-[100px] font-mono text-xs">{{ currentDisplayText }}</span>
          <component :is="isOpen ? ChevronUp : ChevronDown" :size="14" :style="{ color: 'var(--color-outline)' }" />
        </button>
      </div>

      <!-- Refresh controls row -->
      <div
        class="flex items-center gap-2"
        :class="props.stacked ? 'w-full flex-wrap' : ''"
      >
        <button
          data-testid="time-range-refresh-btn"
          class="flex h-[28px] items-center justify-center rounded px-2 transition cursor-pointer hover:opacity-80"
          :style="{
            backgroundColor: 'var(--color-surface-container-high)',
            color: isRefreshing ? 'var(--color-primary)' : 'var(--color-outline)',
            border: '1px solid transparent',
          }"
          @click="handleRefresh"
          :title="'Last refresh: ' + formatAgo(secondsAgo)"
        >
          <RefreshCw :size="16" :class="isRefreshing ? 'animate-spin' : ''" />
        </button>

        <!-- Auto-refresh interval dropdown -->
        <div class="relative">
          <button
            data-testid="refresh-interval-trigger"
            class="flex h-[28px] items-center gap-1 rounded px-2 text-xs font-medium transition cursor-pointer hover:opacity-80"
            :style="{
              backgroundColor: 'var(--color-surface-container-high)',
              color: 'var(--color-on-surface-variant)',
              border: isRefreshDropdownOpen ? '1px solid var(--color-primary)' : '1px solid transparent',
            }"
            aria-haspopup="listbox"
            :aria-expanded="isRefreshDropdownOpen"
            @click.stop="toggleRefreshDropdown"
            @keydown="handleRefreshDropdownKeydown"
          >
            {{ currentIntervalLabel }}
            <ChevronDown :size="12" :style="{ color: 'var(--color-outline)' }" />
          </button>

          <div
            v-if="isRefreshDropdownOpen"
            class="absolute right-0 top-[calc(100%+4px)] min-w-[120px] rounded py-1 z-[1000] animate-fade-in"
            :style="{
              backgroundColor: 'var(--color-surface-bright)',
              border: '1px solid var(--color-outline-variant)',
              boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.24), 0 1px 2px rgba(0,0,0,0.16))',
            }"
            role="listbox"
            @click.stop
          >
            <div
              class="px-3 py-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide font-mono"
              :style="{ color: 'var(--color-outline)' }"
            >
              Auto-refresh
            </div>
            <button
              v-for="(interval, index) in refreshIntervals"
              :key="interval.value"
              data-testid="refresh-interval-option"
              role="option"
              :aria-selected="interval.value === refreshIntervalValue"
              class="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs transition cursor-pointer hover:opacity-80"
              :style="{
                color: interval.value === refreshIntervalValue ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
                backgroundColor: index === highlightedIndex
                  ? 'var(--color-surface-container-high)'
                  : interval.value === refreshIntervalValue
                    ? 'var(--selected-fill, color-mix(in srgb, var(--color-primary) 14%, transparent))'
                    : 'transparent',
              }"
              @click="selectInterval(interval.value)"
            >
              {{ interval.label }}
              <Check v-if="interval.value === refreshIntervalValue" :size="12" />
            </button>
          </div>
        </div>

        <!-- Status indicator -->
        <div
          v-if="showStatus && !stacked"
          class="flex items-center gap-2"
          data-testid="refresh-status"
        >
          <StatusDot
            :status="statusDotStatus"
            :pulse="isAutoRefreshing"
            :size="6"
            :title="'Last refreshed ' + formatAgo(secondsAgo)"
          />
          <!-- Full text on desktop, short on medium, hidden on mobile (dot only) -->
          <span
            class="hidden lg:inline text-xs"
            :style="{ color: isStale ? 'var(--color-tertiary)' : 'var(--color-on-surface-variant)' }"
          >
            {{ isRefreshing ? 'Refreshing...' : `Last refreshed ${formatAgo(secondsAgo)}` }}
            <template v-if="isStale">&mdash; Data may be stale</template>
          </span>
          <span
            class="hidden sm:inline lg:hidden text-xs"
            :style="{ color: isStale ? 'var(--color-tertiary)' : 'var(--color-on-surface-variant)' }"
          >
            {{ isRefreshing ? 'Refreshing...' : formatAgo(secondsAgo) }}
          </span>
        </div>
      </div>
    </div>

    <!-- Time range dropdown -->
    <div
      v-if="isOpen"
      class="absolute top-[calc(100%+4px)] left-0 min-w-[220px] rounded shadow-lg z-[1000] animate-fade-in"
      :style="{
        backgroundColor: 'var(--color-surface-bright)',
        border: '1px solid var(--color-outline-variant)',
      }"
      @click.stop
    >
      <div v-if="!showCustomRange">
        <div class="py-2">
          <div
            class="px-4 py-2 text-[0.6875rem] font-semibold uppercase tracking-wide"
            :style="{ color: 'var(--color-outline)' }"
          >
            Quick ranges
          </div>
          <button
            v-for="preset in presets"
            :key="preset.value"
            class="block w-full px-4 py-2.5 border-0 bg-transparent text-left text-sm cursor-pointer transition hover:opacity-80"
            :class="!isCustomRange && selectedPreset === preset.value ? 'bg-[var(--color-primary)]/10 font-medium' : ''"
            :style="{
              color: !isCustomRange && selectedPreset === preset.value ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
              backgroundColor: !isCustomRange && selectedPreset === preset.value ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'transparent',
            }"
            @click="selectPreset(preset.value)"
          >
            {{ preset.label }}
          </button>
        </div>

        <div
          class="h-px mx-0 my-1"
          :style="{ backgroundColor: 'var(--color-outline-variant)' }"
        ></div>

        <button
          class="block w-full px-4 py-2.5 border-0 bg-transparent text-left text-sm cursor-pointer transition hover:opacity-80"
          :style="{ color: 'var(--color-primary)' }"
          @click="openCustomRange"
        >
          Custom range...
        </button>
      </div>

      <div v-else class="p-4">
        <div
          class="px-0 py-2 text-[0.6875rem] font-semibold uppercase tracking-wide"
          :style="{ color: 'var(--color-outline)' }"
        >
          Custom time range
        </div>

        <div class="mb-3">
          <label
            for="custom-from"
            class="block mb-1.5 text-xs font-medium"
            :style="{ color: 'var(--color-on-surface-variant)' }"
          >From</label>
          <input
            id="custom-from"
            data-testid="time-range-custom-from-input"
            type="datetime-local"
            v-model="customFrom"
            class="w-full rounded px-2 py-1 text-xs focus:outline-none focus:ring-2"
            :style="{
              backgroundColor: 'var(--color-surface-container-low)',
              color: 'var(--color-on-surface)',
              border: '1px solid var(--color-outline-variant)',
            }"
          />
        </div>

        <div class="mb-3">
          <label
            for="custom-to"
            class="block mb-1.5 text-xs font-medium"
            :style="{ color: 'var(--color-on-surface-variant)' }"
          >To</label>
          <input
            id="custom-to"
            data-testid="time-range-custom-to-input"
            type="datetime-local"
            v-model="customTo"
            class="w-full rounded px-2 py-1 text-xs focus:outline-none focus:ring-2"
            :style="{
              backgroundColor: 'var(--color-surface-container-low)',
              color: 'var(--color-on-surface)',
              border: '1px solid var(--color-outline-variant)',
            }"
          />
        </div>

        <div
          v-if="customRangeError"
          class="mb-3 rounded px-3 py-2 text-xs"
          :style="{
            backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
            color: 'var(--color-error)',
          }"
        >
          {{ customRangeError }}
        </div>

        <div class="flex justify-end gap-2">
          <button
            data-testid="time-range-cancel-btn"
            class="rounded px-4 py-2 text-sm font-medium bg-transparent cursor-pointer transition hover:opacity-80"
            :style="{
              color: 'var(--color-on-surface-variant)',
              border: '1px solid var(--color-outline-variant)',
            }"
            @click="cancelCustomRange"
          >
            Cancel
          </button>
          <button
            data-testid="time-range-apply-btn"
            class="rounded px-4 py-2 text-sm font-medium text-white cursor-pointer transition hover:opacity-90"
            :style="{
              background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dim))',
              border: '1px solid transparent',
            }"
            @click="applyCustomRange"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
